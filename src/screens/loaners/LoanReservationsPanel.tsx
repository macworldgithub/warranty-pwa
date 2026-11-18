import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Text, TextInput, TouchableOpacity, View, StyleSheet } from 'react-native';
import DatePickerModal from '../../components/common/DatePickerModal';
import { loanReservationsApi } from '../../api/loanReservations.api';
import { LoanReservation } from '../../types/loanReservation.types';
import { Site } from '../../types';

interface Props {
  siteId: string;
  sites: Site[];
  onIssue: (reservation: LoanReservation) => void;
}
export function LoanReservationsPanel({ siteId, sites, onIssue }: Props) {
  const requestId = useRef(0);
  const [bookings, setBookings] = useState<LoanReservation[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [loanerNumber, setLoanerNumber] = useState(1);
  const [name, setName] = useState('');
  const [mobile, setMobile] = useState('');
  const [start, setStart] = useState(() => new Date());
  const [end, setEnd] = useState(() => new Date(Date.now() + 86400000));
  const [picker, setPicker] = useState<{ field: 'start' | 'end'; mode: 'date' | 'time' } | null>(null);
  const load = useCallback(async () => {
    const currentRequest = ++requestId.current;
    setLoading(true); setBookings([]);
    setError('');
    try {
      const result = await loanReservationsApi.list(siteId);
      if (requestId.current === currentRequest) setBookings(result);
    } catch (err: any) {
      if (requestId.current === currentRequest) setError(err?.message || 'Unable to load reservations. Please retry.');
    } finally { if (requestId.current === currentRequest) setLoading(false); }
  }, [siteId]);
  useEffect(() => { void load(); }, [load]);

  const reserve = async () => {
    if (!siteId || siteId === 'all') { setError('Select a rooftop above to reserve a loan vehicle.'); return; }
    if (!name.trim() || !mobile.trim()) { setError('Enter the customer name and mobile.'); return; }
    if (end <= start || end.getTime() <= Date.now()) { setError('Return time must be after the start time and in the future.'); return; }
    setBusy(true); setError('');
    try {
      await loanReservationsApi.reserve({ siteId, loanerNumber, customerName: name.trim(), customerMobile: mobile.trim(), startAt: start.toISOString(), endAt: end.toISOString() });
      setName(''); setMobile(''); setExpanded(false);
      await load();
    } catch (err: any) { setError(err?.message || 'Reservation could not be confirmed. Please retry.'); }
    finally { setBusy(false); }
  };
  const cancel = async (id: string) => {
    setBusy(true); setError('');
    try { await loanReservationsApi.cancel(id); await load(); }
    catch (err: any) { setError(err?.message || 'Unable to cancel reservation.'); }
    finally { setBusy(false); }
  };
  const overlaps = (n: number) => bookings.some(b => b.siteId === siteId && b.loanerNumber === n &&
    (b.status === 'RESERVED' || b.status === 'ISSUED') && new Date(b.startAt) < end && new Date(b.endAt) > start);
  const visible = bookings.filter(b => b.status === 'RESERVED' || b.status === 'ISSUED');
  return <View style={styles.panel}>
    <Text style={styles.title}>Loan vehicle reservations</Text>
    <Text style={styles.hint}>Reserve GWM LOAN 1-6 now. Enter the actual registration when handing over the car.</Text>
    <TouchableOpacity accessibilityRole="button" style={styles.button} disabled={busy} onPress={() => setExpanded(!expanded)}>
      <Text style={styles.buttonText}>{expanded ? 'Close reservation form' : 'Reserve a loan vehicle'}</Text>
    </TouchableOpacity>
    {expanded && <View style={styles.form}>
      {(!siteId || siteId === 'all') && <Text style={styles.hint}>Select a rooftop above before booking.</Text>}
      {(['start', 'end'] as const).map(field => <View key={field}>
        <Text style={styles.label}>{field === 'start' ? 'Collection' : 'Due back'}</Text>
        <View style={styles.row}>{(['date', 'time'] as const).map(mode => <TouchableOpacity key={mode} style={styles.chip} accessibilityRole="button" onPress={() => setPicker({ field, mode })}>
          <Text style={styles.label}>{mode === 'date' ? (field === 'start' ? start : end).toLocaleDateString() : (field === 'start' ? start : end).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text>
        </TouchableOpacity>)}</View>
      </View>)}
      <View style={styles.row}>{Array.from({ length: 6 }, (_, i) => i + 1).map(n => {
        const unavailable = overlaps(n);
        return <TouchableOpacity key={n} accessibilityRole="button" accessibilityState={{ selected: loanerNumber === n, disabled: unavailable }} disabled={unavailable || loading || busy} style={[styles.chip, loanerNumber === n && styles.selected, unavailable && styles.disabled]} onPress={() => setLoanerNumber(n)}>
          <Text style={styles.label}>GWM LOAN {n}</Text><Text style={styles.hint}>{loading ? 'Checking...' : unavailable ? 'Booked' : error ? 'Check on save' : 'Available'}</Text>
        </TouchableOpacity>;
      })}</View>
      <TextInput accessibilityLabel="Reservation customer name" placeholder="Customer name" placeholderTextColor="#64748B" style={styles.input} value={name} onChangeText={setName} maxLength={120} />
      <TextInput accessibilityLabel="Reservation customer mobile" placeholder="Customer mobile" placeholderTextColor="#64748B" style={styles.input} value={mobile} onChangeText={setMobile} keyboardType="phone-pad" maxLength={40} />
      <TouchableOpacity accessibilityRole="button" style={[styles.button, (busy || loading || overlaps(loanerNumber)) && styles.disabled]} disabled={busy || loading || !siteId || siteId === 'all' || overlaps(loanerNumber)} onPress={reserve}><Text style={styles.buttonText}>{busy ? 'Saving...' : 'Confirm reservation'}</Text></TouchableOpacity>
    </View>}
    {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
    <TouchableOpacity accessibilityRole="button" disabled={busy || loading} onPress={load}><Text style={styles.link}>Refresh reservations</Text></TouchableOpacity>
    {loading ? <ActivityIndicator /> : !error && visible.length === 0 ? <Text style={styles.hint}>No current reservations.</Text> : null}
    {!loading && visible.map(b => <View key={b.id} style={styles.booking}>
      <Text style={styles.label}>{b.loanerName} - {b.status === 'RESERVED' ? 'Reserved' : 'Issued'}</Text>
      <Text style={styles.hint}>{sites.find(s => s.id === b.siteId)?.name || b.siteId}</Text>
      <Text style={styles.label}>{b.customerName} - {b.customerMobile}</Text>
      <Text style={styles.hint}>{new Date(b.startAt).toLocaleString()} to {new Date(b.endAt).toLocaleString()}</Text>
      <Text style={styles.hint}>{b.rego ? `Registration: ${b.rego}` : 'Registration assigned at handover'}</Text>
      {b.status === 'RESERVED' && <View style={styles.row}>
        <TouchableOpacity accessibilityRole="button" disabled={busy} onPress={() => onIssue(b)}><Text style={styles.link}>Issue vehicle / enter rego</Text></TouchableOpacity>
        <TouchableOpacity accessibilityRole="button" disabled={busy} onPress={() => cancel(b.id)}><Text style={styles.link}>Cancel reservation</Text></TouchableOpacity>
      </View>}
    </View>)}
    <DatePickerModal visible={picker !== null} value={picker?.field === 'end' ? end : start} mode={picker?.mode || 'date'} onCancel={() => setPicker(null)} onConfirm={date => {
      if (picker?.field === 'start') setStart(date); else setEnd(date);
      setPicker(null);
    }} />
  </View>;
}
const styles = StyleSheet.create({
  panel: { backgroundColor: '#FFFFFF', borderRadius: 12, borderWidth: 1, borderColor: '#E2E8F0', padding: 16, gap: 12 },
  title: { color: '#0F172A', fontWeight: '800', fontSize: 18 },
  hint: { color: '#64748B', fontSize: 12, lineHeight: 18 },
  label: { color: '#0F172A', fontWeight: '600', fontSize: 13 },
  button: { backgroundColor: '#D71920', padding: 12, borderRadius: 8, alignItems: 'center' },
  buttonText: { color: '#FFFFFF', fontWeight: '700' },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  form: { gap: 12 },
  chip: { borderWidth: 1, borderColor: '#CBD5E1', borderRadius: 8, padding: 10 },
  selected: { borderColor: '#D71920', backgroundColor: '#FEE2E2' },
  disabled: { opacity: 0.45 },
  input: { borderWidth: 1, borderColor: '#CBD5E1', borderRadius: 8, padding: 12, color: '#0F172A' },
  error: { color: '#B91C1C' },
  link: { color: '#D71920', fontWeight: '700', paddingVertical: 8 },
  booking: { borderTopWidth: 1, borderColor: '#E2E8F0', paddingTop: 12, gap: 6 },
});
