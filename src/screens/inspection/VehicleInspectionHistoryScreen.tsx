import { useAuth } from '../../context/AuthContext';
import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, Image, Linking } from 'react-native';
import { Header } from '../../components/common/Header';
import { Button } from '../../components/common/Button';
import { apiClient } from '../../api/client';
import { offlineStorage, VehicleZoneInspection } from '../../services/offlineStorage';
import { getBaseServerUrl } from '../../config/env';
import { ManufacturerInspectionScreen } from './ManufacturerInspectionScreen';
import { RooftopVehicle } from '../../services/rooftopVehicles.service';

type Props = React.ComponentProps<typeof ManufacturerInspectionScreen>;
interface RecordItem { id: string; createdAt: string; inspectorName: string; inspection: VehicleZoneInspection }
export function VehicleInspectionHistoryScreen(props: Props) {
  const { user } = useAuth();
  const canCapture = user?.role !== 'CLERK';
  const [records, setRecords] = useState<RecordItem[]>([]);
  const [selected, setSelected] = useState<RecordItem | null>(null);
  const [captureId, setCaptureId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [revision, setRevision] = useState(0);
  const vehicle = props.vehicle;
  useEffect(() => {
    if (!vehicle || captureId) return;
    let cancelled = false;
    setLoading(true); setError(''); setRecords([]);
    apiClient.get<RecordItem[]>('/vehicle-inspections?' + new URLSearchParams({ vin: vehicle.vin.toUpperCase(), siteId: vehicle.siteId })).then(items => {
      if (cancelled) return;
      const local = offlineStorage.getVehicleInspection(vehicle.vin);
      const legacy = local && !local.inspectionId && local.evidenceItems.length ? [{ id: 'legacy-local', createdAt: local.updatedAt, inspectorName: 'Earlier inspection on this device', inspection: local }] : [];
      setRecords([...legacy, ...items]);
    }).catch(error => { if (!cancelled) setError(error.message || 'Unable to load inspection history.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [vehicle?.vin, vehicle?.siteId, captureId, revision]);

  if (!vehicle) return <ManufacturerInspectionScreen {...props} />;
  if (captureId) return <ManufacturerInspectionScreen {...props} key={captureId} inspectionId={captureId}
    onBack={() => { setCaptureId(null); setSelected(null); }}
    onCompleteInspection={() => { setCaptureId(null); setSelected(null); setRevision(value => value + 1); }} />;

  const startInspection = async () => {
    setError('');
    try {
      const local = offlineStorage.getVehicleInspection(vehicle.vin);
      if (local && !local.inspectionId && local.evidenceItems.length) {
        const id = crypto.randomUUID();
        await apiClient.post('/vehicle-inspections', { id, vin: vehicle.vin.toUpperCase(), siteId: vehicle.siteId,
          inspection: { ...local, status: 'IN_PROGRESS' } });
        offlineStorage.saveVehicleInspection({ ...local, inspectionId: id });
      }
      setCaptureId(crypto.randomUUID());
    } catch (error) { setError(error instanceof Error ? error.message : 'Unable to preserve earlier inspection. Please retry.'); }
  };
  const mediaUrl = (url: string) => url.startsWith('/') ? getBaseServerUrl() + url : url;
  return <View style={{ flex: 1 }}>
    <Header title={selected ? 'Inspection Details' : 'Inspection History'} onBack={() => selected ? setSelected(null) : props.onBack()} showBrandLogo={false} />
    <ScrollView contentContainerStyle={{ padding: 20, gap: 14 }}>
      <Text style={{ fontWeight: '700', fontSize: 18 }}>{vehicle.make} {vehicle.model}</Text>
      <Text>{vehicle.rego} · {vehicle.vin}</Text>
      {loading && <Text>Loading inspection history…</Text>}
      {!!error && <><Text accessibilityRole="alert">{error}</Text><Button title="Retry history" onPress={() => setRevision(value => value + 1)} /></>}
      {!selected ? <>
        {!loading && !error && <Text>{records.length} inspection{records.length === 1 ? '' : 's'}</Text>}
        {canCapture && <Button title="New Inspection" onPress={startInspection} />}
        {records.map(record => <View key={record.id} style={{ backgroundColor: 'white', padding: 16, borderRadius: 12, gap: 8 }}>
          <Text>{new Date(record.createdAt).toLocaleString()}</Text>
          <Text>{record.inspectorName} · {record.inspection.status || 'IN_PROGRESS'}</Text>
          <Text>{record.inspection.evidenceItems.length} evidence items</Text>
          <Button title="View inspection" onPress={() => setSelected(record)} />
        </View>)}
        {!loading && !error && !records.length && <Text>No saved inspections for this vehicle. Start its first inspection above.</Text>}
      </> : <>
        <Text>Inspection ID: {selected.id}</Text>
        <Text>Created: {new Date(selected.createdAt).toLocaleString()}</Text>
        <Text>Inspector: {selected.inspectorName}</Text>
        <Text>Status: {selected.inspection.status || 'IN_PROGRESS'}</Text>
        <Text>RO: {selected.inspection.roNumber || '—'}</Text>
        <Text>Vehicle: {selected.inspection.vehicleDetails?.year || ''} {selected.inspection.vehicleDetails?.make || vehicle.make} {selected.inspection.vehicleDetails?.model || vehicle.model}</Text>
        <Text>Powertrain: {selected.inspection.vehicleDetails?.powertrain || '—'}</Text>
        <Text>Rooftop: {selected.inspection.siteId || vehicle.siteId}</Text>
        <Text>Manufacturer pack: {selected.inspection.brandPackId || '—'} · Version {selected.inspection.brandPackVersion || '—'}</Text>
        {canCapture && selected.inspection.status !== 'COMPLETE' && selected.id !== 'legacy-local' && <Button title="Continue inspection" onPress={() => {
          const local = offlineStorage.getVehicleInspection(vehicle.vin);
          if (local?.inspectionId !== selected.id) offlineStorage.saveVehicleInspection({ ...selected.inspection, inspectionId: selected.id });
          setCaptureId(selected.id);
        }} />}
        {selected.inspection.evidenceItems.map((item, index) => {
          const url = item.storageUrl || item.serverUrl || item.fileUri;
          const ai = item.aiAnalysis;
          const values = ai?.reviewed || ai?.original;
          return <View key={item.ruleKey + index} style={{ backgroundColor: 'white', padding: 14, gap: 8, borderRadius: 12 }}>
            <Text style={{ fontWeight: '700' }}>{item.ruleName || item.name || item.ruleKey}</Text>
            {!!url && item.mediaType === 'image' && <Image source={{ uri: mediaUrl(url) }} style={{ width: '100%', height: 230 }} resizeMode="contain" />}
            {!!url && <Button title="Open evidence" onPress={() => { void Linking.openURL(mediaUrl(url)); }} />}
            <Text>{item.storageUrl || item.serverUrl ? 'Uploaded' : 'Photo pending upload on the capturing device'}</Text>
            {!!item.capturedAt && <Text>Captured: {item.capturedAt}</Text>}
            {!!item.notes && <Text>Notes: {item.notes}</Text>}
            {!!item.ocrExtractedText && <Text>Extracted text: {item.ocrExtractedText}</Text>}
            {values ? <>
              <Text>AI findings {ai?.reviewed ? '(staff reviewed)' : '(awaiting review)'}</Text>
              {Object.entries(values).map(([key, value]) => <Text key={key}>{key}: {String(value || 'Unknown')}</Text>)}
              <Text>Original AI response</Text>
              {Object.entries(ai!.original).map(([key, value]) => <Text key={key}>{key}: {String(value || 'Unknown')}</Text>)}
            </> : <Text>No AI analysis saved.</Text>}
          </View>;
        })}
        <Text style={{ fontWeight: '700' }}>Defects</Text>
        {selected.inspection.defects?.length ? selected.inspection.defects.map((defect, index) => <Text key={index}>{defect.zoneKey}: {defect.description}</Text>) : <Text>No defects recorded.</Text>}
        <Text style={{ fontWeight: '700' }}>Voice notes</Text>
        {selected.inspection.voiceNotes?.map(note => <Text key={note.id}>{note.transcript}</Text>)}
      </>}
    </ScrollView>
  </View>;
}
