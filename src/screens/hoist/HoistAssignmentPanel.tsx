import React, { useState } from 'react';
import { Text, TextInput, TouchableOpacity, View, StyleSheet } from 'react-native';
import { Hoist } from '../../types/hoist.types';
import { hoistApi } from '../../api/hoist.api';

export function HoistAssignmentPanel({ hoist, onUpdated }: { hoist: Hoist; onUpdated: (hoist: Hoist) => void }) {
  const [editing, setEditing] = useState(false);
  const [jobNumber, setJobNumber] = useState('');
  const [vehicleRego, setVehicleRego] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const unavailable = !hoist.isActive || hoist.status !== 'OPERATIONAL' || hoist.lockoutTagoutActive;
  const save = async (release = false) => {
    setBusy(true); setError('');
    try {
      const updated = release && hoist.assignment
        ? await hoistApi.release(hoist.id, hoist.assignment.id)
        : await hoistApi.assign(hoist.id, { jobNumber: jobNumber.trim(), vehicleRego: vehicleRego.trim() });
      onUpdated(updated); setEditing(false); setJobNumber(''); setVehicleRego('');
    } catch (err: any) { setError(err?.message || 'Unable to update the assignment. Refresh and retry.'); }
    finally { setBusy(false); }
  };
  return <View style={styles.panel}>
    <Text style={styles.label}>{hoist.assignment ? 'Assigned' : 'Unassigned'}</Text>
    {hoist.assignment ? <>
      {!!hoist.assignment.jobNumber && <Text style={styles.label}>Job / RO: {hoist.assignment.jobNumber}</Text>}
      {!!hoist.assignment.vehicleRego && <Text style={styles.label}>Vehicle: {hoist.assignment.vehicleRego}</Text>}
      <TouchableOpacity accessibilityRole="button" disabled={busy} onPress={() => save(true)}><Text style={styles.action}>{busy ? 'Saving...' : 'Release hoist'}</Text></TouchableOpacity>
    </> : <>
      {unavailable ? <Text style={styles.label}>Unavailable for assignment</Text> : <TouchableOpacity accessibilityRole="button" disabled={busy} onPress={() => setEditing(!editing)}><Text style={styles.action}>{editing ? 'Cancel assignment' : 'Assign job / vehicle'}</Text></TouchableOpacity>}
      {editing && !unavailable && <>
        <TextInput style={styles.input} accessibilityLabel={`${hoist.name} job or RO number`} placeholder="Job / RO number" placeholderTextColor="#64748B" maxLength={80} value={jobNumber} onChangeText={setJobNumber} editable={!busy} />
        <TextInput style={styles.input} accessibilityLabel={`${hoist.name} vehicle registration`} placeholder="Vehicle registration" placeholderTextColor="#64748B" maxLength={20} value={vehicleRego} onChangeText={setVehicleRego} autoCapitalize="characters" editable={!busy} />
        <TouchableOpacity accessibilityRole="button" disabled={busy || (!jobNumber.trim() && !vehicleRego.trim())} onPress={() => save()}><Text style={styles.action}>{busy ? 'Saving...' : 'Confirm assignment'}</Text></TouchableOpacity>
      </>}
    </>}
    {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
  </View>;
}
const styles = StyleSheet.create({
  panel: { gap: 8, paddingVertical: 12, borderTopWidth: 1, borderColor: '#E2E8F0' },
  label: { color: '#334155', fontSize: 13 },
  action: { color: '#D71920', fontWeight: '700', paddingVertical: 6 },
  input: { borderWidth: 1, borderColor: '#CBD5E1', padding: 10, borderRadius: 8, color: '#0F172A' },
  error: { color: '#B91C1C', fontSize: 13 },
});
