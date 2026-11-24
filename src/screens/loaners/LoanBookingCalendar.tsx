import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { LoanReservation } from '../../types/loanReservation.types';
import { calendarDateKey, calendarDays, reservationsOnDay } from '../../utils/loanReservationCalendar';

interface Props {
  bookings: LoanReservation[];
  selectedDate: Date;
  loading: boolean;
  onSelectDate: (date: Date) => void;
}

export function LoanBookingCalendar({ bookings, selectedDate, loading, onSelectDate }: Props) {
  const today = calendarDateKey(new Date());
  const selected = calendarDateKey(selectedDate);
  const changeMonth = (offset: number) => onSelectDate(new Date(selectedDate.getFullYear(), selectedDate.getMonth() + offset, 1));
  return <View style={styles.calendar} testID="loan-booking-calendar">
    <View style={styles.toolbar}>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel="Previous booking month" onPress={() => changeMonth(-1)} style={styles.arrow}>
        <Text style={styles.arrowText}>‹</Text>
      </TouchableOpacity>
      <Text accessibilityRole="header" style={styles.month}>{selectedDate.toLocaleDateString('en-AU', { month: 'long', year: 'numeric' })}</Text>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel="Next booking month" onPress={() => changeMonth(1)} style={styles.arrow}>
        <Text style={styles.arrowText}>›</Text>
      </TouchableOpacity>
      <TouchableOpacity accessibilityRole="button" onPress={() => onSelectDate(new Date())} style={styles.todayButton}>
        <Text style={styles.todayText}>Today</Text>
      </TouchableOpacity>
    </View>
    <View style={styles.week}>
      {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(day => <Text key={day} style={styles.weekday}>{day}</Text>)}
    </View>
    {calendarDays(selectedDate).map((week, i) => <View key={i} style={styles.week}>
      {week.map((date, j) => {
        if (!date) return <View key={`empty-${j}`} style={styles.day} />;
        const key = calendarDateKey(date);
        const count = reservationsOnDay(bookings, date).length;
        const active = selected === key;
        return <TouchableOpacity key={key} accessibilityRole="button"
          accessibilityLabel={`${date.toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })}, ${loading ? 'loading bookings' : `${count} booking${count === 1 ? '' : 's'}`}`}
          accessibilityState={{ selected: active }} testID={`loan-calendar-day-${key}`}
          onPress={() => onSelectDate(date)} style={[styles.day, key === today && styles.today, active && styles.selected]}>
          <Text style={[styles.dayNumber, active && styles.selectedText]}>{date.getDate()}</Text>
          <Text style={[styles.count, active && styles.selectedText]}>{loading ? '…' : count ? `${count} ${count === 1 ? 'loan' : 'loans'}` : '·'}</Text>
        </TouchableOpacity>;
      })}
    </View>)}
    <Text style={styles.hint}>Select a day to view bookings. Multi-day loans appear on each booked day.</Text>
  </View>;
}

const styles = StyleSheet.create({
  calendar: { gap: 4 },
  toolbar: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 8 },
  month: { flex: 1, color: '#0F172A', fontSize: 16, fontWeight: '700', textAlign: 'center' },
  arrow: { minWidth: 32, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  arrowText: { color: '#D71920', fontSize: 28 },
  todayButton: { paddingVertical: 12, paddingHorizontal: 6 },
  todayText: { color: '#D71920', fontWeight: '700', fontSize: 12 },
  week: { flexDirection: 'row', gap: 2 },
  weekday: { flex: 1, minWidth: 0, textAlign: 'center', color: '#64748B', fontWeight: '600', fontSize: 11, paddingVertical: 6 },
  day: { flex: 1, minWidth: 0, minHeight: 56, alignItems: 'center', justifyContent: 'center', borderRadius: 8, borderWidth: 1, borderColor: 'transparent', gap: 3 },
  today: { borderColor: '#CBD5E1', backgroundColor: '#F8FAFC' },
  selected: { backgroundColor: '#D71920', borderColor: '#D71920' },
  dayNumber: { color: '#0F172A', fontSize: 14, fontWeight: '600' },
  count: { color: '#64748B', fontSize: 10 },
  selectedText: { color: '#FFFFFF' },
  hint: { color: '#64748B', fontSize: 12, lineHeight: 18, marginTop: 6 },
});
