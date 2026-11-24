import { describe, expect, it } from 'vitest';
import { calendarDateKey, calendarDays, reservationsOnDay, withCalendarDate } from '../src/utils/loanReservationCalendar';
import { LoanReservation } from '../src/types/loanReservation.types';

const booking = (id: string, start: Date, end: Date, status: LoanReservation['status'] = 'RESERVED'): LoanReservation => ({
  id, siteId: 'site', loanerNumber: 1, loanerName: 'GWM LOAN 1', customerName: 'Client', customerMobile: '0412345678',
  rego: 'TBA', startAt: start.toISOString(), endAt: end.toISOString(), status,
});

describe('loan booking calendar', () => {
  it('lays out leap February with Monday first and no dates from adjacent months', () => {
    const weeks = calendarDays(new Date(2028, 1, 15));
    expect(weeks[0][0]).toBeNull();
    expect(calendarDateKey(weeks[0][1]!)).toBe('2028-02-01');
    expect(weeks.flat().filter(Boolean)).toHaveLength(29);
    expect(calendarDateKey(weeks[4][1]!)).toBe('2028-02-29');
    expect(weeks[4][2]).toBeNull();
  });

  it('shows overnight bookings on every occupied day but excludes the return day at midnight', () => {
    const overnight = booking('overnight', new Date(2030, 0, 1, 23), new Date(2030, 0, 3));
    const later = booking('later', new Date(2030, 0, 2, 14), new Date(2030, 0, 2, 17));
    const cancelled = booking('cancelled', new Date(2030, 0, 2, 9), new Date(2030, 0, 2, 17), 'CANCELLED');
    expect(reservationsOnDay([later, cancelled, overnight], new Date(2030, 0, 2)).map(b => b.id)).toEqual(['overnight', 'later']);
    expect(reservationsOnDay([overnight], new Date(2030, 0, 1))).toHaveLength(1);
    expect(reservationsOnDay([overnight], new Date(2030, 0, 3))).toHaveLength(0);
  });

  it('retains returned loans in calendar history', () => {
    const returned = booking('returned', new Date(2030, 0, 1, 9), new Date(2030, 0, 1, 17), 'RETURNED');
    expect(reservationsOnDay([returned], new Date(2030, 0, 1))).toEqual([returned]);
  });

  it('preserves local booking times when changing the collection or return date', () => {
    const value = withCalendarDate(new Date(2030, 0, 1, 14, 35), new Date(2030, 2, 31));
    expect(calendarDateKey(value)).toBe('2030-03-31');
    expect([value.getHours(), value.getMinutes()]).toEqual([14, 35]);
  });
});
