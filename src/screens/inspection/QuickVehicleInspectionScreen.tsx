import React, { useEffect, useRef, useState } from 'react';
import { Image, Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { apiClient } from '../../api/client';
import { vehicleApi } from '../../api/vehicle.api';
import { Camera, Car, History, ChevronRight, Search, UploadCloud } from 'lucide-react-native';
import { Header } from '../../components/common/Header';
import { Button } from '../../components/common/Button';
import { useAuth } from '../../context/AuthContext';
import { ENV, getBaseServerUrl } from '../../config/env';
import { cameraService } from '../../services/cameraService';
import { colors } from '../../theme/colors';
import type { DecodeVinResponse } from '../../types';
import { VEHICLE_PHOTO_CATEGORIES } from '../../services/vehiclePhotos';
import { appendMedia, resolveMedia, saveMedia } from '../../../web/storage';

const validVin = /^[A-HJ-NPR-Z0-9]{17}$/;
type AiValues = Partial<Record<'findings' | 'quality' | 'view' | 'vin' | 'odometer' | 'notes', string>>;
type AiFinding = { id: string; original: AiValues; reviewed?: AiValues; analyzedAt?: string };
const analysisFields = [
  ['findings', 'Possible damage'],
  ['quality', 'Photo quality'],
  ['view', 'Photo view'],
  ['vin', 'VIN read from photo'],
  ['odometer', 'Odometer read from photo'],
  ['notes', 'Analysis notes'],
] as const;
const identifierModes = ['VIN', 'Rego'] as const;
type IdentifierMode = typeof identifierModes[number] | 'RO Number'; // Existing RO-only drafts can still be resumed.
const validReference = /^[A-Z0-9][A-Z0-9 -]{0,39}$/;

const identificationFields = [
  ['vin', 'VIN'], ['rego', 'Registration'], ['stockNumber', 'Stock number'],
  ['fleetId', 'Fleet ID'], ['make', 'Make'], ['model', 'Model'],
  ['year', 'Year'], ['odometer', 'Odometer (km)'], ['colour', 'Colour'],
  ['bodyType', 'Body type'], ['clientReference', 'Client reference'],
  ['inspectorName', 'Inspector name'],
] as const;
type IdentificationField = typeof identificationFields[number][0];
type Identification = Partial<Record<IdentificationField, string>>;
type VehicleDetails = Partial<DecodeVinResponse> &
  Partial<Record<'stockNumber' | 'fleetId' | 'colour' | 'bodyType' | 'clientReference', string>>;

type Photo = { id: string; ruleKey: string; ruleName: string; mediaType: 'image'; capturedAt: string; fileUri: string; mimeType: string; storageUrl?: string; aiAnalysis?: AiFinding };
type Report = {
  id: string; createdAt: string; inspectorName?: string; createdBy?: string;
  inspection: {
    vin: string; rego?: string; roNumber?: string; status: string; notes?: string; vehicleDetails?: VehicleDetails;
    odometer?: number;
    evidenceItems?: { id?: string; ruleKey?: string; ruleName?: string; storageUrl?: string; mediaType?: string; notes?: string; capturedAt?: string; aiAnalysisId?: string; aiAnalysis?: AiFinding }[];
    voiceNotes?: { transcript?: string }[];
  };
};

export function QuickVehicleInspectionScreen({ onBack, showSaved = false, initialReport }: { onBack: () => void; showSaved?: boolean; initialReport?: { id: string; siteId: string } }) {
  const { user, activeSiteId } = useAuth();
  const wideLayout = useWindowDimensions().width >= 1000;
  const siteId = initialReport?.siteId || activeSiteId || user?.defaultSiteId || user?.authorizedSiteIds?.[0] || '';
  const canCapture = !!user && user.role !== 'CLERK';
  const [view, setView] = useState<'entry' | 'capture' | 'reports'>('entry');
  const [mode, setMode] = useState<IdentifierMode>('VIN');
  const [identifier, setIdentifier] = useState('');
  const [historyVehicle, setHistoryVehicle] = useState<Report>();
  const [historyRevision, setHistoryRevision] = useState(0);
  const vin = mode === 'VIN' ? identifier.trim() : '';
  const [inspectionRego, setInspectionRego] = useState('');
  const [inspectionRo, setInspectionRo] = useState('');
  const rego = inspectionRego.trim();
  const roNumber = inspectionRo.trim();
  const validReferences = (!rego || validReference.test(rego)) && (!roNumber || validReference.test(roNumber));
  const validIdentifier = mode === 'VIN' ? validVin.test(vin) : validReference.test(identifier.trim());
  const [notes, setNotes] = useState('');
  const [vehicle, setVehicle] = useState<VehicleDetails>();
  const [odometer, setOdometer] = useState<number>();
  const [identificationEdit, setIdentificationEdit] = useState<Identification>();
  const [lookupVin, setLookupVin] = useState('');
  const lookingUpVehicle = mode === 'VIN' && lookupVin !== vin;
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [zoneIndex, setZoneIndex] = useState(0);
  const zone = VEHICLE_PHOTO_CATEGORIES[zoneIndex];
  const zonePhotos = photos.filter(photo => photo.ruleKey === zone.ruleKey);
  const capturedZones = new Set(photos.map(photo => photo.ruleKey)).size;
  const [reports, setReports] = useState<Report[]>([]);
  const [selected, setSelected] = useState<Report>();
  const [referenceEdit, setReferenceEdit] = useState<{ id: string; rego: string }>();

  const saveReferences = async () => {
    if (!referenceEdit || requestInFlight.current) return;
    requestInFlight.current = true;
    setBusy(true);
    setError('');
    try {
      const { id, rego } = referenceEdit;
      const report = await apiClient.patch<Report>('/vehicle-inspections/' + encodeURIComponent(id) +
        '/references?' + new URLSearchParams({ siteId }).toString(), { rego: rego.trim() });
      setSelected(report);
      setReports(current => current.map(item => item.id === report.id ? report : item));
      setReferenceEdit(undefined);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save vehicle details.');
    } finally {
      requestInFlight.current = false;
      setBusy(false);
    }
  };
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const inspectionId = useRef('');
  const draft = useRef<Report | undefined>(undefined);
  const requestInFlight = useRef(false);
  const decodeRequest = useRef(0);
  const missing = VEHICLE_PHOTO_CATEGORIES.filter(category => category.isMandatory &&
    !photos.some(photo => photo.ruleKey === category.ruleKey));

  useEffect(() => {
    if (view !== 'entry' || !canCapture || !siteId || !validVin.test(vin)) return;
    setVehicle(undefined);
    setLookupVin('');
    const request = ++decodeRequest.current;
    void vehicleApi.decodeVin(vin).then(result => {
      if (decodeRequest.current !== request || result.vin?.toUpperCase() !== vin || !result.make || result.make === 'Unknown') return;
      setVehicle({
        ...result,
        model: result.requiresManualConfirm && /^(confirm model|enter make)/i.test(result.model)
          ? undefined
          : result.model,
      });
    }).catch(() => {}).finally(() => {
      if (decodeRequest.current === request) setLookupVin(vin);
    });
    return () => { decodeRequest.current += 1; };
  }, [vin, siteId, canCapture, view]);

  const start = () => {
    if (!validIdentifier || !siteId || !canCapture || lookingUpVehicle) return;
    draft.current = undefined;
    inspectionId.current = 'quick_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2);
    setPhotos([]);
    setZoneIndex(0);
    setInspectionRego(mode === 'Rego' ? identifier.trim() : '');
    setInspectionRo('');
    if (mode !== 'VIN') setVehicle(undefined);
    setOdometer(undefined);
    setIdentificationEdit(undefined);
    setNotes('');
    setError('');
    setView('capture');
  };

  const capture = async (category: typeof VEHICLE_PHOTO_CATEGORIES[number], gallery: boolean) => {
    if (requestInFlight.current) return;
    requestInFlight.current = true;
    setBusy(true);
    setError('');
    try {
      const result = gallery ? await cameraService.pickFromGallery(false) : await cameraService.capturePhoto(category.ruleKey);
      if (!result.success || !result.fileUri) {
        if (result.error && !/cancel/i.test(result.error)) setError(result.error);
        return;
      }
      if (result.fileSize && result.fileSize > ENV.MAX_PHOTO_SIZE_MB * 1024 * 1024) {
        setError('Choose a smaller photo for ' + category.name + '.');
        return;
      }
      const photo: Photo = {
        id: Date.now().toString(36) + '_' + Math.random().toString(36).slice(2),
        ruleKey: category.ruleKey, ruleName: category.name, mediaType: 'image',
        capturedAt: new Date().toISOString(), fileUri: result.fileUri, mimeType: result.mimeType || 'image/jpeg',
      };
      setPhotos(current => [...current, photo]);
    } catch {
      setError('Unable to capture the photo. Please try again.');
    } finally {
      requestInFlight.current = false;
      setBusy(false);
    }
  };

  const addFiles = async (files: File[], category: typeof zone) => {
    if (requestInFlight.current || !files.length) return;
    requestInFlight.current = true;
    setBusy(true);
    setError('');
    try {
      for (const file of files) {
        if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > ENV.MAX_PHOTO_SIZE_MB * 1024 * 1024) {
          setError('Choose JPEG, PNG or WebP photos up to ' + ENV.MAX_PHOTO_SIZE_MB + ' MB.');
          continue;
        }
        const fileUri = await saveMedia(file);
        const photo: Photo = {
          id: Date.now().toString(36) + '_' + Math.random().toString(36).slice(2),
          ruleKey: category.ruleKey, ruleName: category.name, mediaType: 'image',
          capturedAt: new Date().toISOString(), fileUri, mimeType: file.type,
        };
        setPhotos(current => [...current, photo]);
      }
    } catch {
      setError('Unable to add photos. Please try again.');
    } finally {
      requestInFlight.current = false;
      setBusy(false);
    }
  };

  const analyzePhoto = async (photo: Photo) => {
    if (requestInFlight.current) return;
    requestInFlight.current = true;
    setBusy(true);
    setError('');
    setProgress('Analyzing ' + photo.ruleName + ' photo…');
    try {
      const form = new FormData();
      form.append('ruleKey', photo.ruleKey);
      const uri = photo.storageUrl ? mediaUri(photo.storageUrl) : photo.fileUri;
      await appendMedia(form, 'file', { uri, type: photo.mimeType, name: 'inspection.jpg' });
      const result = await apiClient.uploadFormData<AiFinding>('/evidence-ai/analyze', form, undefined, 60000);
      setPhotos(current => current.map(item => item.id === photo.id ? { ...item, aiAnalysis: result } : item));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to analyze the photo. Please retry.');
    } finally {
      requestInFlight.current = false;
      setBusy(false);
      setProgress('');
    }
  };

  const browse = async (reportVin: string, saved?: Report) => {
    if (!siteId || requestInFlight.current) return;
    requestInFlight.current = true;
    setView('reports');
    setSelected(saved?.inspection.evidenceItems ? saved : undefined);
    setReports(current => saved?.inspection.evidenceItems && !current.some(report => report.id === saved.id)
      ? [saved, ...current]
      : current);
    setError('');
    setBusy(true);
    try {
      const query = new URLSearchParams({ siteId, ...(reportVin ? { vin: reportVin } : {}) });
      const records = await apiClient.get<Report[]>('/vehicle-inspections?' + query.toString());
      const history = records;
      setReports(current => reportVin
        ? [...current.filter(record => record.inspection.vin !== reportVin), ...history]
        : history);
      if (saved) setSelected(history.find(record => record.id === saved.id) ||
        (saved.inspection.evidenceItems ? saved : undefined));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load inspection reports.');
    } finally {
      requestInFlight.current = false;
      setBusy(false);
    }
  };

  useEffect(() => {
    if (initialReport) {
      let active = true;
      setView('reports');
      setBusy(true);
      setError('');
      void apiClient.get<Report[]>('/vehicle-inspections?' + new URLSearchParams({ siteId }).toString())
        .then(records => {
          if (!active) return;
          const vehicle = records.find(record => record.id === initialReport.id);
          if (!vehicle) throw new Error('This inspection is unavailable for the selected rooftop.');
          setHistoryVehicle(vehicle);
          setReports(records);
        }).catch(err => {
          if (active) setError(err instanceof Error ? err.message : 'Unable to load vehicle history.');
        }).finally(() => { if (active) setBusy(false); });
      return () => { active = false; };
    }
    if (showSaved) void browse('');
  }, [showSaved, siteId, initialReport, historyRevision]);

  const save = async () => {
    if (requestInFlight.current || !photos.length || !siteId || !validReferences) return;
    requestInFlight.current = true;
    setBusy(true);
    setError('');
    const id = inspectionId.current;
    let saved: Report | undefined;
    try {
      const previous = draft.current?.inspection;
      const existingPhotos = previous?.evidenceItems || [];
      const visiblePhoto = (item: typeof existingPhotos[number]) =>
        item.mediaType === 'image' && !!item.storageUrl &&
        VEHICLE_PHOTO_CATEGORIES.some(category => category.ruleKey === item.ruleKey);
      const evidenceItems = existingPhotos.filter(item => !visiblePhoto(item) &&
        (item.storageUrl || !photos.some(photo => photo.ruleKey === item.ruleKey)));

      for (const photo of photos) {
        let storageUrl = photo.storageUrl;
        if (!storageUrl) {
          setProgress('Uploading ' + photo.ruleName);
          const form = new FormData();
          for (const [key, value] of Object.entries({ id, vin, rego, roNumber, siteId, ruleKey: photo.ruleKey, photoId: photo.id })) {
            form.append(key, value);
          }
          await appendMedia(form, 'file', { uri: photo.fileUri, type: photo.mimeType, name: photo.ruleKey + '.jpg' });
          const response = await apiClient.uploadFormData<{ storageUrl: string }>('/vehicle-inspections/photos', form);
          if (!response.storageUrl) throw new Error('The server did not confirm the photo upload.');
          storageUrl = response.storageUrl;
          setPhotos(current => current.map(item => item.id === photo.id ? { ...item, storageUrl } : item));
        }
        const existing = existingPhotos.find(item => item.id === photo.id || (!!item.storageUrl && item.storageUrl === photo.storageUrl));
        evidenceItems.push({ ...existing, id: photo.id, ruleKey: photo.ruleKey, ruleName: photo.ruleName,
          mediaType: photo.mediaType, capturedAt: photo.capturedAt, storageUrl, aiAnalysis: photo.aiAnalysis, aiAnalysisId: photo.aiAnalysis?.id });
      }
      setProgress('Saving inspection');
      saved = await apiClient.post<Report>('/vehicle-inspections', {
        id, vin, siteId, inspection: { ...previous, captureMode: 'quick', rego: rego || undefined, roNumber: roNumber || undefined, status: missing.length ? 'IN_PROGRESS' : 'COMPLETE', evidenceItems, notes,
          capturedZoneKeys: [...new Set(evidenceItems.map(item => item.ruleKey))], vehicleDetails: vehicle, odometer },
      });
      if (!saved?.id) throw new Error('The server did not confirm the inspection was saved.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save inspection. Please retry.');
    } finally {
      requestInFlight.current = false;
      setProgress('');
      setBusy(false);
    }
    if (saved?.id) await browse(vin, saved);
  };

  const back = () => {
    if (requestInFlight.current) return;
    if (referenceEdit) setReferenceEdit(undefined);
    else if (selected) setSelected(undefined);
    else if (initialReport) onBack();
    else if (showSaved) onBack();
    else if (view !== 'entry') {
      if (mode !== 'VIN') { setMode('VIN'); setIdentifier(''); }
      setView('entry'); setError('');
    }
    else onBack();
  };
  const resumeDraft = (report: Report) => {
    const { vin: savedVin, rego: savedRego, roNumber: savedRo } = report.inspection;
    setMode(savedVin ? 'VIN' : savedRego ? 'Rego' : 'RO Number');
    setIdentifier(savedVin || savedRego || savedRo || '');
    draft.current = report;
    inspectionId.current = report.id;
    setPhotos((report.inspection.evidenceItems || []).flatMap((item, index) => {
      if (!item.ruleKey || !item.storageUrl || item.mediaType !== 'image' ||
        !VEHICLE_PHOTO_CATEGORIES.some(category => category.ruleKey === item.ruleKey)) return [];
      return [{ id: item.id || 'saved_' + index, ruleKey: item.ruleKey, ruleName: item.ruleName || item.ruleKey,
        mediaType: 'image' as const, capturedAt: item.capturedAt || report.createdAt,
        storageUrl: item.storageUrl, fileUri: mediaUri(item.storageUrl), mimeType: 'image/jpeg', aiAnalysis: item.aiAnalysis }];
    }));
    setInspectionRego(savedRego || '');
    setInspectionRo(savedRo || '');
    setVehicle(report.inspection.vehicleDetails);
    setOdometer(report.inspection.odometer);
    setIdentificationEdit(undefined);
    setNotes(report.inspection.notes || '');
    setZoneIndex(0);
    setSelected(undefined);
    setError('');
    setView('capture');
  };
  const analyzedEvidence = (selected?.inspection.evidenceItems || []).filter(item => item.aiAnalysis);
  const [preview, setPreview] = useState<{ uri: string; title: string }>();
  const reportVehicle = (report: Report) => {
    const details = report.inspection.vehicleDetails;
    return [details?.year, details?.make, details?.model].filter(Boolean).join(' ');
  };
  const reportStatus = (report: Report) => {
    const complete = report.inspection.status === 'COMPLETE';
    return <Text style={[styles.status, complete ? styles.complete : styles.draft]}>{complete ? 'Complete' : 'Draft'}</Text>;
  };
  const normalizeIdentifier = (value?: string) => (value || '').replace(/[^A-Z0-9]/gi, '').toUpperCase();
  const reportMatches = (report: Report) => {
    const item = report.inspection;
    if (historyVehicle && report.id !== historyVehicle.id) {
      const vehicle = historyVehicle.inspection;
      if (vehicle.vin && item.vin) {
        if (normalizeIdentifier(vehicle.vin) !== normalizeIdentifier(item.vin)) return false;
      } else {
        const sameRego = !!vehicle.rego && normalizeIdentifier(vehicle.rego) === normalizeIdentifier(item.rego);
        const sameRo = !!vehicle.roNumber && normalizeIdentifier(vehicle.roNumber) === normalizeIdentifier(item.roNumber);
        if (!sameRego && !sameRo) return false;
      }
    }
    return [item.vin, item.rego, item.roNumber]
      .some(value => normalizeIdentifier(value).includes(normalizeIdentifier(identifier)));
  };
  const reportLabel = (report: Report) =>
    [report.inspection.rego, report.inspection.roNumber, report.inspection.vin].filter(Boolean).join(' · ');
  const openReport = async (report: Report) => {
    if (report.inspection.evidenceItems) { setSelected(report); return; }
    if (requestInFlight.current) return;
    requestInFlight.current = true;
    setBusy(true);
    setError('');
    try {
      const detail = await apiClient.get<Report>('/vehicle-inspections/' + encodeURIComponent(report.id) + '?' + new URLSearchParams({ siteId }).toString());
      setSelected(detail);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to open inspection report.');
    } finally {
      requestInFlight.current = false;
      setBusy(false);
    }
  };
  const inputStyle = { borderWidth: 1, borderColor: colors.border, color: colors.textPrimary, padding: 12, borderRadius: 8 };
  const mediaUri = (url: string) => url.startsWith('/') ? getBaseServerUrl() + url : url;

  const identification: Identification = {
    ...vehicle, vin, rego, inspectorName: draft.current?.inspectorName || user?.name,
    year: vehicle?.year?.toString(), odometer: odometer?.toString(),
  };
  const savedIdentification: Identification = {
    ...selected?.inspection.vehicleDetails,
    vin: selected?.inspection.vin,
    rego: selected?.inspection.rego,
    inspectorName: selected?.inspectorName,
    year: selected?.inspection.vehicleDetails?.year?.toString(),
    odometer: selected?.inspection.odometer?.toString(),
  };
  const identificationError = identificationEdit && (
    identificationEdit.rego?.trim() && !validReference.test(identificationEdit.rego.trim())
      ? 'Use letters, numbers, spaces or hyphens for the registration.'
      : identificationEdit.year && !/^\d{4}$/.test(identificationEdit.year.trim())
        ? 'Enter a four-digit year.'
        : identificationEdit.odometer && !/^\d{1,9}$/.test(identificationEdit.odometer.trim())
          ? 'Enter the odometer in whole kilometres.'
          : ''
  );
  const saveIdentification = () => {
    if (!identificationEdit || identificationError) return;
    const { rego, stockNumber, fleetId, make, model, year, odometer, colour, bodyType, clientReference } =
      identificationEdit;
    setInspectionRego(rego?.trim() || '');
    setOdometer(odometer?.trim() ? Number(odometer) : undefined);
    setVehicle(current => ({
      ...current, stockNumber: stockNumber?.trim(), fleetId: fleetId?.trim(), make: make?.trim(), model: model?.trim(),
      year: year?.trim() ? Number(year) : undefined, colour: colour?.trim(), bodyType: bodyType?.trim(),
      clientReference: clientReference?.trim(),
    }));
    setIdentificationEdit(undefined);
  };

  const vehicleName = vin ? [vehicle?.year, vehicle?.make, vehicle?.model].filter(Boolean).join(' ') : '';
  const vehicleDetails = (
    <View style={styles.summary}>
      <View style={styles.vehicleIcon}><Car size={22} color={colors.primary} /></View>
      <View style={styles.summaryBody}>
        <Text style={styles.caption}>Vehicle details</Text>
        <Text accessibilityLiveRegion="polite" style={styles.vehicleName}>
          {lookingUpVehicle ? 'Looking up vehicle…' : vehicleName || (mode === 'VIN' ? 'Vehicle details unavailable' : mode + ' ' + identifier.trim())}
        </Text>
        <Text style={styles.secondary}>{vin}{vin && vehicle?.powertrain && !vehicle.requiresManualConfirm ? ' · ' + vehicle.powertrain : ''}</Text>
        {vehicle?.requiresManualConfirm &&
          <Text style={styles.secondary}>Estimated from VIN. Verify against the vehicle.</Text>}
      </View>
    </View>
  );

  return <View style={styles.screen}>
    <Header title={view === 'reports' ? 'Inspection History' : 'Vehicle Inspection'} onBack={back} />
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.scroll}>
      <View style={[styles.content, view === 'entry' && styles.entryWidth]}>
      {!siteId && <Text style={styles.secondary}>Select an assigned rooftop before continuing.</Text>}
      {view === 'entry' && <View style={styles.entryCard}>
        <Text style={styles.title}>New inspection</Text>
        <View style={styles.actions}>
          {identifierModes.map(option => {
            const selected = mode === option;
            return <TouchableOpacity key={option} accessibilityRole="button" accessibilityState={{ selected }}
              style={[styles.identifierOption, selected && styles.activeTab]}
              onPress={() => {
                if (selected) return;
                setMode(option);
                setIdentifier('');
                setLookupVin('');
                setVehicle(undefined);
                setError('');
              }}>
              <Text style={[styles.label, selected && { color: colors.textInverse }]}>{option}</Text>
            </TouchableOpacity>;
          })}
        </View>
        <View style={styles.field}>
          <Text style={styles.label}>{mode}</Text>
          <TextInput value={identifier} onChangeText={value => setIdentifier(mode === 'VIN'
            ? value.toUpperCase().replace(/\s/g, '').slice(0, 17)
            : value.toUpperCase().slice(0, 40))}
            accessibilityLabel={mode} placeholder={'Enter ' + mode} placeholderTextColor={colors.textMuted}
            autoCapitalize="characters" autoCorrect={false} style={[inputStyle, styles.vin]} />
        </View>
        {canCapture && !!siteId && mode === 'VIN' && validIdentifier && vehicleDetails}
        <View style={styles.actions}>
          {canCapture && <View style={styles.action}><Button title="Take Photos" onPress={start}
            disabled={!siteId || !validIdentifier || lookingUpVehicle}
            leftIcon={<Camera size={17} color={colors.textInverse} />} /></View>}
          <View style={styles.action}><Button title={identifier ? 'Search Saved Inspections' : 'View Saved Inspections'} variant="outline"
            disabled={!siteId || (!!identifier && (!validIdentifier || (canCapture && lookingUpVehicle)))}
            leftIcon={<History size={17} color={colors.primary} />} onPress={() => void browse(vin)} /></View>
        </View>
      </View>}
      {view === 'capture' && <>
        <View style={[styles.captureLayout, wideLayout && styles.captureLayoutWide]}>
          <View style={[styles.reportPanel, wideLayout && styles.identificationSidebar]}>
            <View style={styles.identificationHeader}>
              <Text style={styles.label}>Vehicle identification</Text>
              {!identificationEdit && <Button title="Edit" size="sm" variant="outline" disabled={busy}
                onPress={() => setIdentificationEdit(identification)} />}
            </View>
            <View style={styles.identificationGrid}>
              {identificationFields.map(([key, label]) => {
                const editable = key !== 'vin' && key !== 'inspectorName' &&
                  !(key === 'rego' && mode === 'Rego');
                const reference = key === 'rego';
                return <View key={key} style={styles.identificationField}>
                  <Text style={styles.identificationLabel}>{label}</Text>
                  {identificationEdit && editable
                    ? <TextInput accessibilityLabel={label} value={identificationEdit[key] || ''} style={inputStyle}
                      editable={!busy} maxLength={reference ? 40 : 120}
                      keyboardType={key === 'year' || key === 'odometer' ? 'number-pad' : 'default'}
                      onChangeText={value => setIdentificationEdit(current =>
                        ({ ...current, [key]: reference ? value.toUpperCase() : value }))} />
                    : <Text selectable style={styles.label}>{identification[key] || '—'}</Text>}
                </View>;
              })}
            </View>
            {identificationEdit && <>
              {!!identificationError && <Text accessibilityRole="alert" style={styles.error}>{identificationError}</Text>}
              <View style={styles.actions}>
                <Button title="Save details" size="sm" disabled={busy || !!identificationError} onPress={saveIdentification} />
                <Button title="Cancel" size="sm" variant="outline" onPress={() => setIdentificationEdit(undefined)} />
              </View>
            </>}
          </View>
          <View style={[styles.reportPanel, wideLayout && styles.captureMain]}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 8 }}>
            <Text style={{ color: colors.textPrimary, fontWeight: '700', fontSize: 19 }}>Guided zone capture</Text>
            <Text style={{ color: colors.textSecondary }}>{capturedZones} of {VEHICLE_PHOTO_CATEGORIES.length} zones photographed</Text>
          </View>
          <View style={styles.progressTrack}><View style={[styles.progressFill, { width: ((100 * capturedZones / VEHICLE_PHOTO_CATEGORIES.length) + '%') as `${number}%` }]} /></View>
          <ScrollView horizontal contentContainerStyle={styles.zoneTabs}>
            {VEHICLE_PHOTO_CATEGORIES.map((category, index) => <TouchableOpacity key={category.ruleKey}
              accessibilityRole="tab" accessibilityState={{ selected: index === zoneIndex }} disabled={busy}
              onPress={() => setZoneIndex(index)} style={[styles.tab, index === zoneIndex && styles.activeTab]}>
              <Text style={{ color: index === zoneIndex ? 'white' : colors.textPrimary }}>{photos.some(photo => photo.ruleKey === category.ruleKey) ? '✓' : index + 1}</Text>
              <Text style={{ color: index === zoneIndex ? 'white' : colors.textPrimary }}>{category.name}</Text>
            </TouchableOpacity>)}
          </ScrollView>
          <View style={{ backgroundColor: colors.background, borderRadius: 12, padding: 12, gap: 10 }}>
            <Text style={{ fontWeight: '700', color: colors.textPrimary }}>{zone.name} · Zone {zoneIndex + 1} of {VEHICLE_PHOTO_CATEGORIES.length}</Text>
            <Text style={{ color: colors.textSecondary }}>{zone.description}</Text>
            <label onDragOver={event => event.preventDefault()} onDrop={event => {
              event.preventDefault();
              void addFiles(Array.from(event.dataTransfer.files), zone);
            }} style={{ display: 'grid', placeItems: 'center', gap: 8, padding: 24, textAlign: 'center',
              border: '2px dashed ' + colors.border, borderRadius: 12, background: colors.surface, color: colors.textPrimary, cursor: busy ? 'default' : 'pointer', position: 'relative' }}>
              <UploadCloud size={28} color={colors.textSecondary} />
              <strong>{zonePhotos.length ? 'Add more photos to this zone' : 'Add photos to this zone'}</strong>
              <span>JPEG, PNG or WebP. Select or drop multiple photos.</span>
              <input type="file" multiple accept="image/jpeg,image/png,image/webp" disabled={busy}
                aria-label="Choose zone photos" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0, cursor: busy ? 'default' : 'pointer' }} onChange={event => {
                  const files = Array.from(event.currentTarget.files || []);
                  event.currentTarget.value = '';
                  void addFiles(files, zone);
                }} />
            </label>
            <View style={styles.cameraAction}><Button title="Take Photo" variant="outline" disabled={busy}
              leftIcon={<Camera size={17} color={colors.primary} />} onPress={() => void capture(zone, false)} /></View>
            {!!zonePhotos.length && <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {zonePhotos.map((photo, index) => <View key={photo.id} style={{ width: 155, gap: 5 }}>
                <Image source={{ uri: resolveMedia(photo.fileUri) }} style={{ width: 120, height: 85, borderRadius: 8 }} resizeMode="cover" />
                <Button size="sm" variant="outline" title={photo.aiAnalysis ? 'Analyze Again' : 'Detect Damage'}
                  disabled={busy} onPress={() => void analyzePhoto(photo)} />
                {photo.aiAnalysis && <Text style={styles.secondary}>AI: {photo.aiAnalysis.original.findings || 'No visible damage reported'}</Text>}
                <TouchableOpacity disabled={busy} accessibilityRole="button" accessibilityLabel={'Remove photo ' + (index + 1)}
                  onPress={() => setPhotos(current => current.filter(item => item.id !== photo.id))}>
                  <Text style={{ color: colors.textPrimary }}>Remove</Text>
                </TouchableOpacity>
              </View>)}
            </View>}
          </View>
        </View>
        </View>
        <TextInput value={notes} onChangeText={setNotes} editable={!busy} placeholder="Notes (optional)"
          accessibilityLabel="Inspection notes" maxLength={4000} multiline style={inputStyle} />
      </>}
      {view === 'reports' && (selected ? <>
        <View style={styles.reportPanel}>
          <View style={styles.reportRow}>
            <View style={styles.vehicleIcon}><Car size={22} color={colors.primary} /></View>
            <View style={styles.summaryBody}>
              <Text style={styles.title}>{reportVehicle(selected) || 'Inspection report'}</Text>
              <Text style={styles.secondary}>{new Date(selected.createdAt).toLocaleString()}</Text>
            </View>
            {reportStatus(selected)}
          </View>
          <Text style={styles.label}>Vehicle identification</Text>
          <View style={styles.identificationGrid}>
            {identificationFields.map(([key, label]) => <View key={key} style={styles.identificationField}>
              <Text style={styles.identificationLabel}>{label}</Text>
              <Text selectable style={styles.label}>{savedIdentification[key] || '—'}</Text>
            </View>)}
          </View>
          {(user?.role === 'ADMIN' || (canCapture && selected.createdBy === user?.id)) &&
            (referenceEdit?.id === selected.id ? <View style={styles.field}>
              <Text style={styles.label}>Rego</Text>
              <TextInput value={referenceEdit.rego} accessibilityLabel="Saved inspection rego" style={inputStyle}
                editable={!busy} maxLength={40} onChangeText={rego => setReferenceEdit({ ...referenceEdit, rego })} />
              <View style={styles.actions}>
                <Button title="Save Vehicle Details" disabled={busy || !referenceEdit.rego.trim()} onPress={() => void saveReferences()} />
                <Button title="Cancel" variant="outline" disabled={busy} onPress={() => setReferenceEdit(undefined)} />
              </View>
            </View> : <View style={styles.cameraAction}>
              <Button title="Edit Rego" variant="outline" onPress={() => {
                setError('');
                setReferenceEdit({ id: selected.id, rego: selected.inspection.rego || '' });
              }} />
            </View>)}
          {canCapture && selected.createdBy === user?.id && selected.inspection.status !== 'COMPLETE' &&
            <View style={styles.cameraAction}><Button title="Continue Inspection" disabled={busy}
              onPress={() => resumeDraft(selected)} /></View>}
        </View>
        {(!!selected.inspection.notes || !!selected.inspection.voiceNotes?.length) && <View style={styles.reportPanel}>
          <Text style={styles.label}>Inspection notes</Text>
          {!!selected.inspection.notes && <Text style={styles.secondary}>{selected.inspection.notes}</Text>}
          {selected.inspection.voiceNotes?.map((note, index) => <Text key={index} style={styles.secondary}>{note.transcript}</Text>)}
        </View>}
        <View style={styles.reportPanel}>
          <Text style={styles.label}>AI analysis</Text>
          {analyzedEvidence.length === 0 ? <Text style={styles.secondary}>No AI analysis was saved for this inspection.</Text> : <>
            <Text style={styles.secondary}>{analyzedEvidence.length} analyzed {analyzedEvidence.length === 1 ? 'photo' : 'photos'}. AI findings are suggestions for review.</Text>
            {analyzedEvidence.map((item, index) => {
              const analysis = item.aiAnalysis;
              if (!analysis) return null;
              const values = analysis.reviewed || analysis.original;
              const fields = analysisFields.filter(([key]) => values?.[key]?.trim());
              const title = item.ruleName || item.ruleKey || 'Evidence photo';
              const uri = item.mediaType === 'image' && item.storageUrl ? mediaUri(item.storageUrl) : '';
              return <View key={index} style={styles.analysisCard}>
                <View style={styles.reportRow}>
                  <View style={styles.summaryBody}>
                    <Text style={styles.label}>{title}</Text>
                    {analysis.reviewed && <Text style={styles.secondary}>Reviewed</Text>}
                  </View>
                  {!!uri && <Button title="View Photo" size="sm" variant="outline" onPress={() => setPreview({ uri, title })} />}
                </View>
                {fields.length ? fields.map(([key, label]) => <View key={key} style={styles.summaryBody}>
                  <Text style={styles.label}>{label}</Text>
                  <Text selectable style={styles.secondary}>{values[key]}</Text>
                </View>) : <Text style={styles.secondary}>No findings were recorded for this photo.</Text>}
              </View>;
            })}
          </>}
        </View>
        <View style={styles.reportPanel}>
          <Text style={styles.label}>Inspection evidence</Text>
          {!selected.inspection.evidenceItems?.length && <Text style={styles.secondary}>No evidence saved for this inspection.</Text>}
          <View style={styles.evidenceGrid}>
            {selected.inspection.evidenceItems?.map((item, index) => {
              const title = item.ruleName || item.ruleKey || 'Evidence';
              return <View key={item.id || index} style={styles.evidenceTile}>
                {item.mediaType === 'image' && !!item.storageUrl &&
                  <TouchableOpacity accessibilityRole="button" accessibilityLabel={'Open ' + title + ' photo'}
                    onPress={() => setPreview({ title, uri: mediaUri(item.storageUrl!) })}>
                    <Image source={{ uri: mediaUri(item.storageUrl) }} style={styles.reportImage} resizeMode="cover" />
                  </TouchableOpacity>}
                <View style={styles.tileBody}>
                  <Text style={styles.label}>{title}</Text>
                  {!!item.notes && <Text style={styles.secondary}>{item.notes}</Text>}
                </View>
              </View>;
            })}
          </View>
        </View>
      </> : <View style={styles.reportPanel}>
        <Text style={styles.title}>{historyVehicle ? reportVehicle(historyVehicle) || reportLabel(historyVehicle) : 'Saved inspections'}</Text>
        {historyVehicle && !!reportVehicle(historyVehicle) && <Text style={styles.secondary}>{reportLabel(historyVehicle)}</Text>}
        <View style={styles.searchField}>
          <Search size={18} color={colors.textSecondary} />
          <TextInput value={identifier} onChangeText={value => setIdentifier(value.toUpperCase())}
            accessibilityLabel="Search by rego or VIN" placeholder="Search by rego or VIN"
            placeholderTextColor={colors.textMuted} autoCapitalize="characters" autoCorrect={false} style={styles.searchInput} />
        </View>
        {reports.filter(reportMatches).map(report => <TouchableOpacity key={report.id} style={styles.reportListItem}
          accessibilityRole="button" disabled={busy} onPress={() => void openReport(report)}>
          <View style={styles.vehicleIcon}><History size={19} color={colors.primary} /></View>
          <View style={styles.summaryBody}>
            <Text style={styles.label}>{reportVehicle(report) || reportLabel(report)}</Text>
            {!!reportVehicle(report) && <Text style={styles.secondary}>{reportLabel(report)}</Text>}
            <Text style={styles.secondary}>{new Date(report.createdAt).toLocaleString()}</Text>
          </View>
          {reportStatus(report)}
          <ChevronRight size={17} color={colors.textSecondary} />
        </TouchableOpacity>)}
        {!busy && !error && !reports.some(reportMatches) && <Text style={styles.secondary}>No saved inspections found.</Text>}
        {busy && <Text style={styles.secondary}>Loading inspection reports…</Text>}
        {!!error && <Button title="Retry Reports" variant="outline" onPress={() => initialReport ? setHistoryRevision(value => value + 1) : void browse('')} />}
      </View>)}
      {view !== 'capture' && !!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
      </View>
    </ScrollView>
    <Modal visible={!!preview} transparent animationType="fade" onRequestClose={() => setPreview(undefined)}>
      {preview && <View style={styles.previewBackdrop}>
        <View style={styles.previewPanel}>
          <View style={styles.reportRow}>
            <Text style={[styles.label, styles.summaryBody]}>{preview.title}</Text>
            <Button title="Close" size="sm" variant="outline" onPress={() => setPreview(undefined)} />
          </View>
          <Image source={{ uri: preview.uri }} style={styles.fullImage} resizeMode="contain" />
        </View>
      </View>}
    </Modal>
    {view === 'capture' && <View style={styles.footer}>
      <View style={styles.footerContent}>
        <View style={styles.summaryBody}>
          {!validReferences && <Text style={styles.error}>Use letters, numbers, spaces or hyphens for the rego and RO number.</Text>}
          {!!progress && <Text accessibilityLiveRegion="polite" style={styles.label}>{progress}</Text>}
          {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
        {!photos.length && <Text style={styles.secondary}>Add at least one photo to save an inspection.</Text>}
        {photos.length > 0 && missing.length > 0 && <Text style={styles.secondary}>This inspection will be saved as a draft. Still needed: {missing.map(category => category.name).join(', ')}</Text>}
        </View>
        <View style={styles.saveAction}><Button title={missing.length ? "Save Draft" : "Complete Inspection"} disabled={busy || !!identificationEdit || !photos.length || !validReferences} loading={busy && !!progress} onPress={() => void save()} /></View>
      </View>
    </View>}
  </View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  scroll: { padding: 16, paddingBottom: 24 },
  content: { width: '100%', maxWidth: 1080, alignSelf: 'center', gap: 14 },
  entryWidth: { maxWidth: 720, marginTop: 12 },
  entryCard: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 18, padding: 20, gap: 18 },
  title: { fontSize: 25, fontWeight: '700', color: colors.textPrimary },
  field: { gap: 6 },
  identifierOption: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8, borderWidth: 1, borderColor: colors.border, borderRadius: 9 },
  label: { fontSize: 14, fontWeight: '600', color: colors.textPrimary },
  vin: { minHeight: 48, fontSize: 16, letterSpacing: 1, backgroundColor: colors.background },
  summary: { flexDirection: 'row', gap: 12, padding: 14, alignItems: 'center', backgroundColor: colors.backgroundSecondary, borderRadius: 12 },
  summaryBody: { flex: 1, minWidth: 0, gap: 4 },
  vehicleIcon: { width: 42, height: 42, borderRadius: 12, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  caption: { fontSize: 12, color: colors.textSecondary },
  vehicleName: { fontSize: 18, fontWeight: '700', color: colors.textPrimary },
  secondary: { fontSize: 13, color: colors.textSecondary },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  action: { flexGrow: 1, flexBasis: 215 },
  progressTrack: { height: 5, borderRadius: 4, backgroundColor: colors.border, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: colors.primary },
  zoneTabs: { gap: 8, flexGrow: 1 },
  tab: { flexGrow: 1, minWidth: 100, padding: 10, alignItems: 'center', gap: 5, borderWidth: 1, borderColor: colors.border, borderRadius: 9 },
  activeTab: { backgroundColor: colors.textPrimary, borderColor: colors.textPrimary },
  cameraAction: { alignSelf: 'flex-start', minWidth: 140 },
  footer: { backgroundColor: colors.surface, borderTopWidth: 1, borderColor: colors.border, paddingHorizontal: 16, paddingVertical: 12 },
  footerContent: { width: '100%', maxWidth: 1080, alignSelf: 'center', flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 12 },
  saveAction: { minWidth: 160, marginLeft: 'auto' },
  reportPanel: { padding: 16, gap: 14, borderWidth: 1, borderColor: colors.border, borderRadius: 16, backgroundColor: colors.surface },
  captureLayout: { gap: 14 },
  captureLayoutWide: { flexDirection: 'row-reverse', alignItems: 'flex-start' },
  captureMain: { flex: 1, minWidth: 0 },
  identificationSidebar: { width: 330 },
  identificationHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  identificationGrid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 14 },
  identificationField: { width: '50%', paddingRight: 8, gap: 5 },
  identificationLabel: { fontSize: 11, color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 1 },
  reportRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 12 },
  status: { fontSize: 12, fontWeight: '700', paddingHorizontal: 9, paddingVertical: 5, borderRadius: 12, overflow: 'hidden' },
  complete: { color: '#047857', backgroundColor: '#ECFDF5' },
  draft: { color: '#92400E', backgroundColor: '#FEF3C7' },
  searchField: { flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.background, borderRadius: 10 },
  searchInput: { flex: 1, minHeight: 44, color: colors.textPrimary },
  reportListItem: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderWidth: 1, borderColor: colors.border, borderRadius: 12, backgroundColor: colors.background },
  analysisCard: { padding: 12, gap: 10, backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border, borderRadius: 12 },
  evidenceGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  evidenceTile: { flexGrow: 1, flexBasis: 220, minWidth: 0, borderWidth: 1, borderColor: colors.border, borderRadius: 12, overflow: 'hidden' },
  reportImage: { width: '100%', aspectRatio: 1.6, backgroundColor: colors.backgroundSecondary },
  tileBody: { padding: 10, gap: 5 },
  previewBackdrop: { flex: 1, padding: 16, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(15,23,42,0.72)' },
  previewPanel: { width: '100%', maxWidth: 920, height: '85%', borderRadius: 16, padding: 14, gap: 12, backgroundColor: colors.surface },
  fullImage: { flex: 1, width: '100%', backgroundColor: colors.backgroundSecondary },
  error: { color: colors.danger },
});
