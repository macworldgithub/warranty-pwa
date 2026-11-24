import { LoanReservation } from '../types/loanReservation.types';

export function calendarDateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function calendarDays(month: Date): (Date | null)[][] {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const count = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const offset = (first.getDay() + 6) % 7; // Monday first.
  return Array.from({ length: Math.ceil((offset + count) / 7) }, (_, week) =>
    Array.from({ length: 7 }, (_, day) => {
      const number = week * 7 + day - offset + 1;
      return number < 1 || number > count ? null : new Date(first.getFullYear(), first.getMonth(), number);
    }),
  );
}

export function reservationsOnDay(bookings: LoanReservation[], day: Date): LoanReservation[] {
  const start = new Date(day.getFullYear(), day.getMonth(), day.getDate());
  const end = new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1);
  return bookings.filter(b => b.status !== 'CANCELLED' && new Date(b.startAt) < end && new Date(b.endAt) > start)
    .sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime());
}

// The date picker returns midnight in date mode; keep the collection/return time.
export function withCalendarDate(value: Date, day: Date): Date {
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), value.getHours(), value.getMinutes());
}
