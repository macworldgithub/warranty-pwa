import { expect, test, type Page } from '@playwright/test';
import { LoanReservation } from '../src/types/loanReservation.types';

test.use({ timezoneId: 'Australia/Melbourne' });
const site = { id: 'site_cranbourne_byd', name: 'Booran BYD Cranbourne', isActive: true };
const otherSite = { ...site, id: 'site_other', name: 'Other Rooftop' };

async function openCalendar(page: Page) {
  const user = { id: 'booking-tester', name: 'Booking Tester', role: 'TECHNICIAN', defaultSiteId: site.id, authorizedSiteIds: [site.id, otherSite.id] };
  const state = { bookings: [] as LoanReservation[], requests: [] as any[], rejectBooking: false };
  await page.clock.setFixedTime(new Date('2030-05-10T02:00:00Z'));
  await page.route('**/api/v1/**', async route => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.replace('/api/v1', '');
    let result: unknown = [];
    if (path === '/auth/me') result = user;
    else if (path === '/sites') result = [site, otherSite];
    else if (path === '/loan-agreements/reservations' && request.method() === 'POST') {
      const body = request.postDataJSON();
      state.requests.push(body);
      if (state.rejectBooking) {
        await route.fulfill({ status: 409, json: { message: 'This loan vehicle is already reserved for those times.' } });
        return;
      }
      const booking = { ...body, id: `booking-${state.requests.length}`, loanerName: `GWM LOAN ${body.loanerNumber}`, status: 'RESERVED' };
      state.bookings.push(booking);
      result = booking;
    } else if (path === '/loan-agreements/reservations') {
      result = state.bookings.filter(b => !url.searchParams.get('siteId') || b.siteId === url.searchParams.get('siteId'));
    } else if (path.endsWith('/cancel')) {
      const id = path.split('/').at(-2);
      state.bookings.find(b => b.id === id)!.status = 'CANCELLED';
      result = { success: true };
    } else if (path.includes('geofence')) result = { status: 'OFF_SITE', insideGeofence: false, radiusMeters: 180 };
    await route.fulfill({ json: result });
  });
  await page.addInitScript(user => {
    sessionStorage.setItem('booran-user', JSON.stringify(user));
    sessionStorage.setItem('booran-token', 'booking-fixture-token');
  }, user);
  await page.goto('/');
  await page.getByText('Loaners', { exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Loan car booking calendar' })).toBeVisible();
  await page.getByRole('button', { name: 'Next booking month' }).click();
  await page.getByTestId('loan-calendar-day-2030-06-15').click();
  return state;
}

async function fillClient(page: Page) {
  await page.getByLabel('Reservation customer name').fill('Alex Client');
  await page.getByLabel('Reservation customer mobile').fill('0412345678');
}

test('books TBA in advance, shows occupied days, persists and cancels to free the slot', async ({ page }) => {
  const state = await openCalendar(page);
  await page.getByRole('button', { name: 'Reserve a loan vehicle' }).click();
  await page.getByRole('button', { name: 'Confirm reservation' }).click();
  await expect(page.getByRole('alert')).toHaveText('Enter the customer name and mobile.');
  await fillClient(page);
  await page.getByRole('button', { name: 'Confirm reservation' }).click();
  await expect(page.getByRole('alert')).toHaveText('Enter a loan car rego or select TBA.');
  expect(state.requests).toHaveLength(0);
  await page.getByRole('button', { name: 'TBA (assign later)', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm reservation' }).click();
  await expect(page.getByText('Loan car booking confirmed.', { exact: true })).toBeVisible();
  expect(state.requests[0]).toMatchObject({ customerName: 'Alex Client', customerMobile: '0412345678', rego: 'TBA', siteId: site.id,
    startAt: '2030-06-14T23:00:00.000Z', endAt: '2030-06-15T23:00:00.000Z' });
  await expect(page.getByTestId('loan-calendar-day-2030-06-15')).toContainText('1 loan');
  await expect(page.getByTestId('loan-calendar-day-2030-06-16')).toContainText('1 loan');
  await page.getByTestId('loan-calendar-day-2030-06-16').click();
  await expect(page.getByTestId('loan-booking-booking-1')).toContainText('Rego: TBA');
  await page.getByTestId('loan-calendar-day-2030-06-17').click();
  await expect(page.getByText('No bookings for this day.')).toBeVisible();
  await page.reload();
  await page.getByText('Loaners', { exact: true }).click();
  await page.getByRole('button', { name: 'Upcoming bookings', exact: true }).click();
  await expect(page.getByTestId('loan-booking-booking-1')).toContainText('Alex Client');
  await page.getByRole('button', { name: 'Cancel reservation', exact: true }).click();
  await expect(page.getByText('No upcoming bookings.')).toBeVisible();
  expect(state.bookings[0].status).toBe('CANCELLED');
  await page.getByRole('button', { name: 'Next booking month' }).click();
  await page.getByTestId('loan-calendar-day-2030-06-15').click();
  await page.getByRole('button', { name: 'Reserve a loan vehicle' }).click();
  await expect(page.getByRole('button', { name: 'GWM LOAN 1 Available', exact: true })).toBeEnabled();
});

test('saves a known rego, prevents overlapping slot selection, and pre-fills handover', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  const state = await openCalendar(page);
  await page.getByRole('button', { name: 'Reserve a loan vehicle' }).click();
  await fillClient(page);
  await page.getByLabel('Reservation vehicle rego').fill(' abc123 ');
  await page.getByRole('button', { name: 'Confirm reservation' }).click();
  await expect(page.getByTestId('loan-booking-booking-1')).toContainText('Rego: ABC123');
  expect(state.requests[0].rego).toBe('ABC123');
  await page.getByRole('button', { name: 'Reserve a loan vehicle' }).click();
  await expect(page.getByRole('button', { name: 'GWM LOAN 1 Booked', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Confirm reservation' })).toBeDisabled();
  await page.getByRole('button', { name: 'GWM LOAN 2 Available', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Confirm reservation' })).toBeEnabled();
  await page.getByRole('button', { name: 'Close reservation form' }).click();
  for (const width of [320, 390, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(page.getByTestId('loan-booking-calendar')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await page.getByTestId('loan-booking-calendar').screenshot({ path: 'test-results/loan-booking-calendar-desktop.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByTestId('loan-booking-calendar').screenshot({ path: 'test-results/loan-booking-calendar-mobile.png' });
  await page.getByRole('button', { name: 'Issue vehicle / enter rego', exact: true }).click();
  await expect(page.getByLabel('Loan vehicle registration', { exact: true })).toHaveValue('ABC123');
  expect(errors).toEqual([]);
});

test('keeps the form on a server conflict and clears bookings when switching rooftops', async ({ page }) => {
  const state = await openCalendar(page);
  state.rejectBooking = true;
  await page.getByRole('button', { name: 'Reserve a loan vehicle' }).click();
  await fillClient(page);
  await page.getByRole('button', { name: 'TBA (assign later)', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm reservation' }).click();
  await expect(page.getByRole('alert')).toContainText('already reserved');
  await expect(page.getByLabel('Reservation customer name')).toHaveValue('Alex Client');
  await expect(page.getByText('Loan car booking confirmed.', { exact: true })).toHaveCount(0);
  state.rejectBooking = false;
  await page.getByRole('button', { name: 'Confirm reservation' }).click();
  await expect(page.getByTestId('loan-booking-booking-2')).toBeVisible();
  await page.getByTestId('loaners-assigned-rooftops').getByRole('combobox', { name: 'Current rooftop' }).selectOption(otherSite.id);
  await page.getByRole('button', { name: 'Upcoming bookings', exact: true }).click();
  await expect(page.getByText('No upcoming bookings.')).toBeVisible();
  await expect(page.getByTestId('loan-booking-booking-2')).toHaveCount(0);
});
