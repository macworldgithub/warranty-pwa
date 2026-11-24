import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Text, TextInput, TouchableOpacity, View, StyleSheet } from 'react-native';
import DatePickerModal from '../../components/common/DatePickerModal';
import { loanReservationsApi } from '../../api/loanReservations.api';
import { LoanReservation } from '../../types/loanReservation.types';
import { Site } from '../../types';
import { LoanBookingCalendar } from './LoanBookingCalendar';
import { reservationsOnDay, withCalendarDate } from '../../utils/loanReservationCalendar';

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
  const [rego, setRego] = useState('');
  const [regoTba, setRegoTba] = useState(false);
  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const [view, setView] = useState<'day' | 'upcoming'>('day');
  const [notice, setNotice] = useState('');
  const mutationInFlight = useRef(false);
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
  useEffect(() => { void load(); return () => { requestId.current += 1; }; }, [load]);

  const openForm = () => {
    if (expanded) { setExpanded(false); return; }
    const collection = withCalendarDate(new Date(2000, 0, 1, 9), selectedDate);
    if (collection.getTime() < Date.now()) {
      const now = new Date();
      if (collection.toDateString() === now.toDateString()) {
        collection.setHours(now.getHours(), Math.ceil((now.getMinutes() + 1) / 30) * 30);
      }
    }
    const due = new Date(collection);
    due.setDate(due.getDate() + 1);
    setStart(collection); setEnd(due); setExpanded(true); setError(''); setNotice('');
  };

  const reserve = async () => {
    if (mutationInFlight.current) return;
    if (!siteId || siteId === 'all') { setError('Select a rooftop above to reserve a loan vehicle.'); return; }
    if (!name.trim() || !mobile.trim()) { setError('Enter the customer name and mobile.'); return; }
    if (!regoTba && !rego.trim()) { setError('Enter a loan car rego or select TBA.'); return; }
    if (end <= start || end.getTime() <= Date.now()) { setError('Return time must be after the start time and in the future.'); return; }
    mutationInFlight.current = true;
    setBusy(true); setError(''); setNotice('');
    try {
      await loanReservationsApi.reserve({ siteId, loanerNumber, customerName: name.trim(), customerMobile: mobile.trim(), rego: regoTba ? 'TBA' : rego.trim().toUpperCase(), startAt: start.toISOString(), endAt: end.toISOString() });
      setSelectedDate(new Date(start)); setView('day');
      setName(''); setMobile(''); setRego(''); setRegoTba(false); setExpanded(false);
      setNotice('Loan car booking confirmed.');
      await load();
    } catch (err: any) { setError(err?.message || 'Reservation could not be confirmed. Please retry.'); }
    finally { setBusy(false); mutationInFlight.current = false; }
  };
  const cancel = async (id: string) => {
    if (mutationInFlight.current) return;
    mutationInFlight.current = true;
    setBusy(true); setError(''); setNotice('');
    try { await loanReservationsApi.cancel(id); setNotice('Loan car booking cancelled.'); await load(); }
    catch (err: any) { setError(err?.message || 'Unable to cancel reservation.'); }
    finally { setBusy(false); mutationInFlight.current = false; }
  };
  const overlaps = (n: number) => bookings.some(b => b.siteId === siteId &&
    (b.loanerNumber === n || (!regoTba && rego.trim().toUpperCase() !== 'TBA' && !!rego.trim() && b.rego?.toUpperCase() === rego.trim().toUpperCase())) &&
    (b.status === 'RESERVED' || b.status === 'ISSUED') && new Date(b.startAt) < end && new Date(b.endAt) > start);
  const visible = view === 'day' ? reservationsOnDay(bookings, selectedDate) : bookings
    .filter(b => (b.status === 'RESERVED' || b.status === 'ISSUED') && new Date(b.endAt).getTime() > Date.now())
    .sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime());
  return <View style={styles.panel}>
    <Text accessibilityRole="header" style={styles.title}>Loan car booking calendar</Text>
    <Text style={styles.hint}>Book GWM LOAN 1–6 in advance with client details and a rego or TBA. Availability is confirmed when you save.</Text>
    <LoanBookingCalendar bookings={bookings} selectedDate={selectedDate} loading={loading} onSelectDate={date => { setSelectedDate(date); setView('day'); }} />
    <TouchableOpacity accessibilityRole="button" style={styles.button} disabled={busy} onPress={openForm}>
      <Text style={styles.buttonText}>{expanded ? 'Close reservation form' : 'Reserve a loan vehicle'}</Text>
    </TouchableOpacity>
    {expanded && <View style={styles.form}>
      {(!siteId || siteId === 'all') && <Text style={styles.hint}>Select a rooftop above before booking.</Text>}
      {(['start', 'end'] as const).map(field => <View key={field}>
        <Text style={styles.label}>{field === 'start' ? 'Collection' : 'Due back'}</Text>
        <View style={styles.row}>{(['date', 'time'] as const).map(mode => <TouchableOpacity key={mode} disabled={busy} style={styles.chip} accessibilityRole="button" accessibilityLabel={`${field === 'start' ? 'Collection' : 'Due back'} ${mode}`} onPress={() => setPicker({ field, mode })}>
          <Text style={styles.label}>{mode === 'date' ? (field === 'start' ? start : end).toLocaleDateString() : (field === 'start' ? start : end).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text>
        </TouchableOpacity>)}</View>
      </View>)}
      <Text style={styles.label}>Loan car *</Text>
      <View style={styles.row}>{Array.from({ length: 6 }, (_, i) => i + 1).map(n => {
        const unavailable = overlaps(n);
        return <TouchableOpacity key={n} accessibilityRole="button" accessibilityState={{ selected: loanerNumber === n, disabled: unavailable }} disabled={unavailable || loading || busy} style={[styles.chip, loanerNumber === n && styles.selected, unavailable && styles.disabled]} onPress={() => setLoanerNumber(n)}>
          <Text style={styles.label}>GWM LOAN {n}</Text><Text style={styles.hint}>{loading ? 'Checking...' : unavailable ? 'Booked' : error ? 'Check on save' : 'Available'}</Text>
        </TouchableOpacity>;
      })}</View>
      <Text style={styles.label}>Client name *</Text>
      <TextInput accessibilityLabel="Reservation customer name" placeholder="Customer name" placeholderTextColor="#64748B" style={styles.input} value={name} onChangeText={setName} maxLength={120} editable={!busy} />
      <Text style={styles.label}>Client mobile *</Text>
      <TextInput accessibilityLabel="Reservation customer mobile" placeholder="Customer mobile" placeholderTextColor="#64748B" style={styles.input} value={mobile} onChangeText={setMobile} keyboardType="phone-pad" maxLength={40} editable={!busy} />
      <Text style={styles.label}>Loan car rego *</Text>
      <View style={styles.row}>
        <TouchableOpacity accessibilityRole="button" accessibilityState={{ selected: !regoTba }} disabled={busy} style={[styles.chip, !regoTba && styles.selected]} onPress={() => setRegoTba(false)}><Text style={styles.label}>Enter rego</Text></TouchableOpacity>
        <TouchableOpacity accessibilityRole="button" accessibilityState={{ selected: regoTba }} disabled={busy} style={[styles.chip, regoTba && styles.selected]} onPress={() => setRegoTba(true)}><Text style={styles.label}>TBA (assign later)</Text></TouchableOpacity>
      </View>
      {regoTba ? <Text style={styles.hint}>Registration will be TBA until the actual car is assigned at handover.</Text> : <TextInput accessibilityLabel="Reservation vehicle rego" placeholder="e.g. ABC123" placeholderTextColor="#64748B" style={styles.input} value={rego} onChangeText={setRego} autoCapitalize="characters" maxLength={20} editable={!busy} />}
      <TouchableOpacity accessibilityRole="button" style={[styles.button, (busy || loading || overlaps(loanerNumber)) && styles.disabled]} disabled={busy || loading || !siteId || siteId === 'all' || overlaps(loanerNumber)} onPress={reserve}><Text style={styles.buttonText}>{busy ? 'Saving...' : 'Confirm reservation'}</Text></TouchableOpacity>
    </View>}
    {!!notice && <Text accessibilityLiveRegion="polite" style={styles.success}>{notice}</Text>}
    {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
    <View style={styles.row}>
      <TouchableOpacity accessibilityRole="button" accessibilityState={{ selected: view === 'day' }} style={[styles.chip, view === 'day' && styles.selected]} onPress={() => setView('day')}><Text style={styles.label}>Selected day</Text></TouchableOpacity>
      <TouchableOpacity accessibilityRole="button" accessibilityState={{ selected: view === 'upcoming' }} style={[styles.chip, view === 'upcoming' && styles.selected]} onPress={() => setView('upcoming')}><Text style={styles.label}>Upcoming bookings</Text></TouchableOpacity>
    </View>
    <Text accessibilityRole="header" style={styles.label}>{view === 'day' ? selectedDate.toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : 'Current and upcoming bookings'}</Text>
    <TouchableOpacity accessibilityRole="button" disabled={busy || loading} onPress={load}><Text style={styles.link}>Refresh reservations</Text></TouchableOpacity>
    {loading ? <ActivityIndicator /> : !error && visible.length === 0 ? <Text style={styles.hint}>{view === 'day' ? 'No bookings for this day.' : 'No upcoming bookings.'}</Text> : null}
    {!loading && visible.map(b => <View key={b.id} style={styles.booking} testID={`loan-booking-${b.id}`}>
      <Text style={styles.label}>{b.loanerName} - {b.status === 'RESERVED' ? 'Reserved' : b.status === 'RETURNED' ? 'Returned' : 'Issued'}</Text>
      <Text style={styles.hint}>{sites.find(s => s.id === b.siteId)?.name || b.siteId}</Text>
      <Text style={styles.label}>{b.customerName} - {b.customerMobile}</Text>
      <Text style={styles.hint}>{new Date(b.startAt).toLocaleString()} to {new Date(b.endAt).toLocaleString()}</Text>
      <Text style={styles.hint}>Rego: {b.rego || 'TBA'}</Text>
      {b.status === 'RESERVED' && <View style={styles.row}>
        <TouchableOpacity accessibilityRole="button" disabled={busy} onPress={() => onIssue(b)}><Text style={styles.link}>Issue vehicle / enter rego</Text></TouchableOpacity>
        <TouchableOpacity accessibilityRole="button" disabled={busy} onPress={() => cancel(b.id)}><Text style={styles.link}>Cancel reservation</Text></TouchableOpacity>
      </View>}
    </View>)}
    <DatePickerModal visible={picker !== null} value={picker?.field === 'end' ? end : start} mode={picker?.mode || 'date'} onCancel={() => setPicker(null)} onConfirm={date => {
      const value = picker?.mode === 'date' ? withCalendarDate(picker.field === 'start' ? start : end, date) : date;
      if (picker?.field === 'start') setStart(value); else setEnd(value);
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
  success: { color: '#15803D', fontWeight: '600' },
  link: { color: '#D71920', fontWeight: '700', paddingVertical: 8 },
  booking: { borderTopWidth: 1, borderColor: '#E2E8F0', paddingTop: 12, gap: 6 },
});
