import { apiClient } from '../../api/client';
import { missingVehiclePhotos, withVehiclePhotoRules } from '../../services/vehiclePhotos';
import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { Header } from '../../components/common/Header';
import { Button } from '../../components/common/Button';
import { EvidenceCard } from '../../components/evidence/EvidenceCard';
import { ManufacturerBulletins } from '../../components/evidence/ManufacturerBulletins';
import { brandsApi } from '../../api/brands.api';
import { brandPacksApi } from '../../api/brandPacks.api';
import { casesApi } from '../../api/cases.api';
import { Brand, BrandPack, EvidenceItem, VoiceNote } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { rooftopVehiclesService, RooftopVehicle } from '../../services/rooftopVehicles.service';
import { offlineStorage, VehicleZoneInspection } from '../../services/offlineStorage';
import { namingEngine } from '../../services/namingEngine';
import { evidenceUploadService } from '../../services/evidenceUpload.service';
import { colors } from '../../theme/colors';
import { getEvidenceFileUri } from '../../utils/evidence';

export interface Props {
  inspectionId?: string;
  vehicle?: RooftopVehicle | null;
  onSelectVehicle?: (vehicle: RooftopVehicle) => void;
  onBack: () => void;
  onLogout?: () => void;
  onOpenHome?: () => void;
  onOpenHoists?: () => void;
  onOpenTickets?: () => void;
  onOpenLoaners?: () => void;
  onOpenProfile?: () => void;
  onCompleteInspection?: (vehicle: RooftopVehicle) => void;
}

const normalizeMake = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+motor(s)?$/, '').trim();

export const ManufacturerInspectionScreen: React.FC<Props> = ({ vehicle, inspectionId, onSelectVehicle, onBack, onLogout, onCompleteInspection }) => {
  const { user, activeSiteId } = useAuth();
  const [brands, setBrands] = useState<Brand[]>([]);
  const [vehicles, setVehicles] = useState<RooftopVehicle[]>([]);
  const [selectedBrand, setSelectedBrand] = useState<Brand | null>(null);
  const [pack, setPack] = useState<BrandPack | null>(null);
  const [loading, setLoading] = useState(true);
  const [packLoading, setPackLoading] = useState(false);
  const [error, setError] = useState('');
  const [packError, setPackError] = useState('');
  const [uploadError, setUploadError] = useState('');
  const [inspection, setInspection] = useState<VehicleZoneInspection | null>(null);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    const siteId = activeSiteId || user?.defaultSiteId || user?.authorizedSiteIds?.[0];
    Promise.all([brandsApi.getBrands(), casesApi.getCases({ siteId: siteId?.toLowerCase() === 'all' ? undefined : siteId, limit: 100 })])
      .then(([brandList, caseList]) => {
        if (cancelled) return;
        setBrands(brandList);
        setVehicles(siteId ? rooftopVehiclesService.getVehiclesForRooftop(siteId, caseList) : []);
      })
      .catch(() => { if (!cancelled) setError('Unable to load manufacturers and vehicles. Please retry.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [activeSiteId, user?.defaultSiteId, user?.authorizedSiteIds, retry]);

  const brand = vehicle ? brands.find(item => normalizeMake(item.name) === normalizeMake(vehicle.make)) : selectedBrand;
  const brandId = brand?.id;

  useEffect(() => {
    let cancelled = false;
    setPack(null);
    setPackError('');
    if (!brandId) { setPackLoading(false); return; }
    setPackLoading(true);
    brandPacksApi.getActiveByBrandId(brandId).then(result => {
      if (result.brandId !== brandId || result.status !== 'PUBLISHED') throw new Error('Incorrect manufacturer pack');
      if (!cancelled) setPack({ ...result, rules: withVehiclePhotoRules(result.rules) });
    }).catch(() => {
      if (!cancelled) setPackError('Published evidence requirements are unavailable for this manufacturer. Ask your warranty administrator to publish its pack.');
    }).finally(() => { if (!cancelled) setPackLoading(false); });
    return () => { cancelled = true; };
  }, [brandId, retry]);

  useEffect(() => {
    if (!vehicle || !pack || pack.brandId !== brandId) { setInspection(null); return; }
    const previous = offlineStorage.getVehicleInspection(vehicle.vin);
    const stored = inspectionId && previous?.inspectionId !== inspectionId ? undefined : previous;
    const next: VehicleZoneInspection = {
      inspectionId: inspectionId || previous?.inspectionId || crypto.randomUUID(),
      vin: vehicle.vin.toUpperCase(), roNumber: vehicle.roNumber || vehicle.inspectionNumber,
      siteId: vehicle.siteId, vehicleDetails: { make: vehicle.make, model: vehicle.model, year: vehicle.year, powertrain: vehicle.powertrain },
      capturedZoneKeys: stored?.capturedZoneKeys || [], evidenceItems: stored?.evidenceItems || [],
      voiceNotes: stored?.voiceNotes || [], voiceNotesSynced: stored?.voiceNotesSynced,
      defects: stored?.defects || [], status: 'IN_PROGRESS', updatedAt: new Date().toISOString(),
      brandId: pack.brandId, brandPackId: pack.id, brandPackVersion: pack.version,
    };
    offlineStorage.saveVehicleInspection(next);
    setInspection(next);
  }, [vehicle, pack, brandId, inspectionId]);

  const [savingInspection, setSavingInspection] = useState(false);
  const saveInspection = async (status: 'IN_PROGRESS' | 'COMPLETE') => {
    if (!inspection || savingInspection) return;
    setSavingInspection(true);
    setUploadError('');
    try {
      const current = offlineStorage.getVehicleInspection(inspection.vin) || inspection;
      const snapshot = { ...current, inspectionId: inspection.inspectionId, status };
      await apiClient.post('/vehicle-inspections', { id: snapshot.inspectionId, vin: snapshot.vin, siteId: snapshot.siteId, inspection: snapshot });
      persist(snapshot);
      onCompleteInspection?.(vehicle!);
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : 'Unable to save inspection. Retry when online.');
    } finally { setSavingInspection(false); }
  };

  useEffect(() => {
    if (!inspection?.inspectionId || inspection.status === 'COMPLETE') return;
    const snapshot = inspection;
    const timer = setTimeout(() => {
      void apiClient.post('/vehicle-inspections', { id: snapshot.inspectionId, vin: snapshot.vin, siteId: snapshot.siteId, inspection: snapshot })
        .catch(() => setUploadError('Draft saved on this device. Save Inspection Draft when connected to sync its history.'));
    }, 800);
    return () => clearTimeout(timer);
  }, [inspection]);

  const persist = (next: VehicleZoneInspection) => { offlineStorage.saveVehicleInspection(next); setInspection(next); };
  const saveVoiceNote = (note: VoiceNote) => {
    if (inspection) persist({ ...inspection, voiceNotes: [...(inspection.voiceNotes || []), note], voiceNotesSynced: false });
  };
  const saveEvidence = (item: Partial<EvidenceItem> & { ruleKey: string }) => {
    if (!inspection || !pack || !vehicle) return;
    setUploadError('');
    const latest = offlineStorage.getVehicleInspection(inspection.vin);
    if (!latest || latest.brandPackId !== pack.id || latest.brandPackVersion !== pack.version) return;
    const rule = pack.rules.find(entry => entry.ruleKey === item.ruleKey);
    if (!rule) return;
    const evidence: EvidenceItem = {
      ...item, storageUrl: undefined, serverUrl: undefined, isUploaded: false, id: item.id || `ev_${Date.now()}_${rule.ruleKey}`, ruleKey: rule.ruleKey,
      ruleName: rule.name, mediaType: rule.mediaType, isMandatory: rule.isMandatory,
      tier: rule.tier, oemFileName: namingEngine.generateOemFileName(rule, inspection.roNumber || 'RO'),
    };
    const next = { ...latest, evidenceItems: [...latest.evidenceItems.filter(entry => entry.ruleKey !== rule.ruleKey), evidence], capturedZoneKeys: [...new Set([...latest.capturedZoneKeys, rule.ruleKey])] };
    persist(next);
    void evidenceUploadService.uploadEvidenceToServer({ vin: inspection.vin, roNumber: inspection.roNumber, evidenceItem: evidence, vehicleDetails: vehicle, technicianId: user?.id, technicianName: user?.name, brandId: pack.brandId, siteId: vehicle.siteId, brandPackId: pack.id, brandPackVersion: pack.version }).then(result => {
      if (!result.success || !result.storageUrl) { setUploadError('Photo saved on this device. Reconnect and retry its upload before completing.'); return; }
      const latest = offlineStorage.getVehicleInspection(inspection.vin);
      if (!latest || latest.brandPackId !== pack.id || latest.brandPackVersion !== pack.version) return;
      const updated = { ...latest, evidenceItems: latest.evidenceItems.map(entry => entry.id === evidence.id ? { ...entry, storageUrl: result.storageUrl, isUploaded: true } : entry) };
      offlineStorage.saveVehicleInspection(updated);
      setInspection(current => current?.vin === updated.vin ? updated : current);
    });
  };
  const evidenceForRule = (key: string) => inspection?.evidenceItems.find(item => item.ruleKey === key);
  const missingRequiredRules = pack?.rules.filter(rule => rule.isMandatory && !getEvidenceFileUri(evidenceForRule(rule.ruleKey))) ?? [];
  const missingPhotoUploads = missingVehiclePhotos(inspection?.evidenceItems || [], true);
  const ready = Boolean(missingPhotoUploads.length === 0 && inspection && pack?.rules.length && missingRequiredRules.length === 0);

  return <View style={styles.container}>
    <Header title={vehicle ? 'Manufacturer Evidence Capture' : 'New Inspection'} onBack={onBack} onLogout={onLogout} showBrandLogo={false} />
    <ScrollView contentContainerStyle={styles.content}>
      {loading ? <ActivityIndicator color={colors.primary} /> : error ? <><Text>{error}</Text><Button title="Retry" onPress={() => setRetry(value => value + 1)} /></> : <>
        {!vehicle && <>
          <Text style={styles.title}>Choose manufacturer</Text>
          {brands.map(item => <TouchableOpacity key={item.id} style={styles.card} onPress={() => setSelectedBrand(item)}><Text style={styles.title}>{selectedBrand?.id === item.id ? '✓ ' : ''}{item.name}</Text></TouchableOpacity>)}
        </>}
        {brand && <>
          <Text style={styles.title}>{brand.name} evidence path</Text>
          <ManufacturerBulletins key={brand.id} brandId={brand.id} brandName={brand.name} />
          {!vehicle && <>
            <Text style={styles.title}>Select vehicle</Text>
            {vehicles.filter(item => normalizeMake(item.make) === normalizeMake(brand.name)).map(item => <TouchableOpacity key={item.id} style={styles.card} onPress={() => onSelectVehicle?.(item)}><Text>{item.year} {item.make} {item.model}</Text><Text>{item.rego} · {item.vin}</Text></TouchableOpacity>)}
            {!vehicles.some(item => normalizeMake(item.make) === normalizeMake(brand.name)) && <Text>No vehicles for this manufacturer at the selected rooftop.</Text>}
          </>}
          {packLoading ? <ActivityIndicator color={colors.primary} /> : packError ? <><Text>{packError}</Text><Button title="Retry requirements" onPress={() => setRetry(value => value + 1)} /></> : pack && <>
            <Text>{pack.name} · Version {pack.version}</Text>
            {!vehicle ? <>
              {pack.rules.map(rule => <Text key={rule.ruleKey} style={styles.description}>{rule.name} · {rule.mediaType} · {rule.isMandatory ? 'Required' : 'Optional'}</Text>)}
            </> : <>
              <Text style={styles.description}>{vehicle.make} {vehicle.model} · {vehicle.vin}</Text>
              {pack.rules.length === 0 && <Text>No evidence requirements have been configured for this manufacturer.</Text>}
              {inspection && pack.rules.map(rule => <EvidenceCard key={`${pack.id}_${rule.ruleKey}`} rule={rule} evidence={evidenceForRule(rule.ruleKey)} roNumber={inspection.roNumber || 'RO'} onSaveEvidence={saveEvidence} onRemoveEvidence={key => persist({ ...inspection, evidenceItems: inspection.evidenceItems.filter(item => item.ruleKey !== key), capturedZoneKeys: inspection.capturedZoneKeys.filter(item => item !== key), status: 'IN_PROGRESS' })} onAddVoiceNote={saveVoiceNote} />)}
              {inspection?.voiceNotes?.map(note => <Text key={note.id} style={styles.card}>{note.transcript}</Text>)}
              {inspection && missingRequiredRules.length > 0 && <Text style={styles.description} accessibilityLiveRegion="polite">Required evidence still missing: {missingRequiredRules.map(rule => rule.name).join(', ')}</Text>}
              {!!uploadError && <Text style={styles.description} accessibilityRole="alert">{uploadError}</Text>}
              {inspection && missingPhotoUploads.length > 0 && <Text style={styles.description}>
                Required photo uploads remaining: {missingPhotoUploads.map(photo => photo.name).join(', ')}. MODIFICATIONS is optional.
              </Text>}
              {inspection && missingPhotoUploads.map(photo => {
                const evidence = inspection.evidenceItems.find(item => item.ruleKey === photo.ruleKey);
                return evidence?.fileUri ? <Button key={photo.ruleKey} title={`Retry ${photo.name} upload`} onPress={() => saveEvidence(evidence)} /> : null;
              })}
              <Button title="Save Inspection Draft" disabled={savingInspection} onPress={() => saveInspection('IN_PROGRESS')} />
              <Button title="Complete & Save Inspection" disabled={!ready || savingInspection} loading={savingInspection} onPress={() => saveInspection('COMPLETE')} />
            </>}
          </>}
        </>}
        {vehicle && !brand && <Text>No manufacturer configuration matches this vehicle. Contact your warranty administrator.</Text>}
      </>}
    </ScrollView>
  </View>;
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: 20, gap: 12, paddingBottom: 48 },
  title: { fontSize: 17, fontWeight: '700', color: colors.textPrimary },
  description: { color: colors.textSecondary, marginVertical: 8 },
  card: { padding: 16, borderRadius: 12, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
});
