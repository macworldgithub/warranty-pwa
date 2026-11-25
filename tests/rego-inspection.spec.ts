import { expect, test, type Page } from '@playwright/test';
import { createRequire } from 'node:module';
import path from 'node:path';

const site = { id: 'rego-site', name: 'Test Rooftop', isActive: true };
const user = { id: 'rego-tech', name: 'Rego Tester', role: 'TECHNICIAN', defaultSiteId: site.id, authorizedSiteIds: [site.id] };
const vehicle = {
  rego: 'ABC123', state: 'VIC', vin: '1HGCM82633A004352', make: 'Honda', model: 'Accord', year: 2003,
  colour: 'Silver', bodyType: 'SEDAN', engineNumber: 'ENGINE123', compliancePlate: '03/2003', vehicleType: 'CAR',
  registration: { status: 'REGISTERED', expiryDate: '2030-03-13' },
  riskFlags: { isStolen: false, isWrittenOff: false, stolenIncidents: [], writtenOffIncidents: [] },
  warnings: [], source: 'InfoAgent NEVDIS', provider: 'InfoAgent NEVDIS', requiresManualConfirm: false,
};

async function openInspection(page: Page, liveLookup?: (input: { rego: string; state: string }) => Promise<unknown>) {
  const state = { lookups: [] as any[], uploads: [] as any[], historyQueries: [] as string[], saved: undefined as any, fail: false, failStatus: 503 };
  await page.route('**/api/v1/**', async route => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace('/api/v1', '');
    let result: unknown = [];
    if (path === '/auth/me') result = user;
    else if (path === '/sites') result = [site];
    else if (path === '/vehicle/decode-rego') {
      state.lookups.push(request.postDataJSON());
      expect(request.headers().authorization).toBe('Bearer rego-test-token');
      if (state.fail) return route.fulfill({ status: state.failStatus, json: { message: 'Provider unavailable' } });
      result = liveLookup ? await liveLookup(request.postDataJSON()) : vehicle;
    } else if (path === '/vehicle/decode-vin') result = vehicle;
    else if (path === '/vehicle-inspections/photos') {
      state.uploads.push(request.postDataBuffer()?.toString());
      result = { storageUrl: '/uploads/front.jpg' };
    } else if (path === '/vehicle-inspections' && request.method() === 'POST') {
      const body = request.postDataJSON();
      state.saved = { ...body, createdBy: user.id, inspectorName: user.name, createdAt: new Date().toISOString(), inspection: { ...body.inspection, vin: body.vin } };
      result = state.saved;
    } else if (path === '/vehicle-inspections') {
      state.historyQueries.push(request.url());
      result = state.saved ? [state.saved] : [];
    }
    else if (path.includes('geofence')) result = { status: 'OFF_SITE', insideGeofence: false };
    await route.fulfill({ json: result });
  });
  await page.addInitScript(user => {
    sessionStorage.setItem('booran-user', JSON.stringify(user));
    sessionStorage.setItem('booran-token', 'rego-test-token');
  }, user);
  await page.goto('/');
  await page.getByText('Vehicle Inspection', { exact: true }).click();
  await page.getByText('New Inspection', { exact: true }).click();
  await expect(page.getByText('New inspection', { exact: true })).toBeVisible();
  return state;
}

test('Rego lookup shows vehicle details and saves the returned VIN with the registration', async ({ page }) => {
  const state = await openInspection(page);
  await page.getByRole('button', { name: 'Rego', exact: true }).click();
  await page.getByLabel('Registration state', { exact: true }).selectOption('VIC');
  await page.getByLabel('Rego', { exact: true }).fill('abc123');
  await expect(page.getByText('Take Photos', { exact: true }).locator('../..')).toHaveAttribute('aria-disabled', 'true');
  await expect(page.getByText('2003 Honda Accord', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/rego-entry.png' });
  expect(state.lookups).toEqual([{ rego: 'ABC123', state: 'VIC' }]);
  await page.getByText('Take Photos', { exact: true }).click();
  await expect(page.getByText(vehicle.vin, { exact: true })).toBeVisible();
  await expect(page.getByText('ABC123', { exact: true })).toBeVisible();
  await page.getByLabel('Choose zone photos').setInputFiles({ name: 'front.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64') });
  await page.getByText('Save Draft', { exact: true }).click();
  await expect.poll(() => state.saved?.vin).toBe(vehicle.vin);
  expect(state.saved.inspection).toMatchObject({ rego: 'ABC123', regoState: 'VIC', vehicleDetails: vehicle });
  expect(state.uploads[0]).toContain(vehicle.vin);
  expect(state.uploads[0]).toContain('ABC123');
  await page.getByText('Continue Inspection', { exact: true }).click();
  await expect(page.getByText(vehicle.vin, { exact: true })).toBeVisible();
  await expect(page.getByText('ABC123', { exact: true })).toBeVisible();
  await expect(page.getByText('VIC', { exact: true })).toBeVisible();
  await page.getByLabel('Inspection notes').fill('Resumed Rego draft');
  await page.getByText('Save Draft', { exact: true }).click();
  await expect.poll(() => state.saved?.inspection.notes).toBe('Resumed Rego draft');
  expect(state.saved.inspection.vehicleDetails).toEqual(vehicle);
  expect(state.saved.inspection.evidenceItems).toHaveLength(1);
  expect(state.uploads).toHaveLength(1);
});

test('lookup failure supports retry and manual capture', async ({ page }) => {
  const state = await openInspection(page);
  state.fail = true;
  await page.getByRole('button', { name: 'Rego', exact: true }).click();
  await page.getByLabel('Registration state', { exact: true }).selectOption('VIC');
  await page.getByLabel('Rego', { exact: true }).fill('ABC123');
  await expect(page.getByRole('alert')).toContainText('Unable to look up this registration');
  await expect(page.getByText('Take Photos', { exact: true }).locator('../..')).not.toHaveAttribute('aria-disabled', 'true');
  state.fail = false;
  await page.getByText('Retry lookup', { exact: true }).click();
  await expect(page.getByText('2003 Honda Accord', { exact: true })).toBeVisible();
  expect(state.lookups).toHaveLength(2);
  await page.getByLabel('Rego', { exact: true }).fill('MANUAL');
  state.fail = true;
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.getByText('2003 Honda Accord', { exact: true })).toHaveCount(0);
  await page.getByText('Take Photos', { exact: true }).click();
  await expect(page.getByText('MANUAL', { exact: true })).toBeVisible();
  await expect(page.getByText(vehicle.vin, { exact: true })).toHaveCount(0);
});

test('switching identifier modes discards an in-flight Rego result and preserves VIN lookup', async ({ page }) => {
  await openInspection(page);
  let release: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/vehicle/decode-rego', async route => {
    await gate;
    await route.fulfill({ json: { ...vehicle, make: 'Stale make' } });
  });
  await page.getByRole('button', { name: 'Rego', exact: true }).click();
  await page.getByLabel('Registration state', { exact: true }).selectOption('VIC');
  const started = page.waitForRequest('**/vehicle/decode-rego');
  await page.getByLabel('Rego', { exact: true }).fill('ABC123');
  await started;
  await page.getByRole('button', { name: 'VIN', exact: true }).click();
  const completed = page.waitForResponse('**/vehicle/decode-rego');
  release!();
  await completed;
  await page.getByLabel('VIN', { exact: true }).fill(vehicle.vin);
  await expect(page.getByText('2003 Honda Accord', { exact: true })).toBeVisible();
  await expect(page.getByText(/Stale make/)).toHaveCount(0);
  await page.getByText('Take Photos', { exact: true }).click();
  await expect(page.getByText('ABC123', { exact: true })).toBeVisible();
  await expect(page.getByText('VIC', { exact: true })).toBeVisible();
});

test('requires a state before requesting a report and rejects a mismatched state', async ({ page }) => {
  const state = await openInspection(page);
  await page.clock.install();
  await page.getByRole('button', { name: 'Rego', exact: true }).click();
  await page.getByLabel('Rego', { exact: true }).fill('abc-123');
  await page.clock.runFor(1000);
  expect(state.lookups).toHaveLength(0);
  await expect(page.getByText('Take Photos', { exact: true }).locator('../..')).toHaveAttribute('aria-disabled', 'true');
  await page.getByLabel('Registration state', { exact: true }).selectOption('NSW');
  await page.clock.runFor(1000);
  await expect(page.getByRole('alert')).toContainText('Unable to look up this registration');
  expect(state.lookups).toEqual([{ rego: 'ABC123', state: 'NSW' }]);
  await expect(page.getByText('2003 Honda Accord', { exact: true })).toHaveCount(0);
  await page.getByLabel('Registration state', { exact: true }).selectOption('VIC');
  await page.clock.runFor(1000);
  await expect(page.getByText('2003 Honda Accord', { exact: true })).toBeVisible();
  expect(state.lookups).toHaveLength(2);
});

test('invalid plates never send lookup requests or enable capture', async ({ page }) => {
  const state = await openInspection(page);
  await page.clock.install();
  await page.getByRole('button', { name: 'Rego', exact: true }).click();
  await page.getByLabel('Registration state', { exact: true }).selectOption('VIC');
  for (const plate of ['ABC$123', 'ABCDEFGHIJ', '---', '']) {
    await page.getByLabel('Rego', { exact: true }).fill(plate);
    await page.clock.runFor(1000);
    await expect(page.getByText('Take Photos', { exact: true }).locator('../..')).toHaveAttribute('aria-disabled', 'true');
  }
  expect(state.lookups).toHaveLength(0);
});

test('a no-match result allows manual capture without retaining stale vehicle details', async ({ page }) => {
  const state = await openInspection(page);
  await page.getByRole('button', { name: 'Rego', exact: true }).click();
  await page.getByLabel('Registration state', { exact: true }).selectOption('VIC');
  await page.getByLabel('Rego', { exact: true }).fill('ABC123');
  await expect(page.getByText('2003 Honda Accord', { exact: true })).toBeVisible();
  state.fail = true;
  state.failStatus = 404;
  await page.getByLabel('Rego', { exact: true }).fill('NOTFOUND');
  await expect(page.getByRole('alert')).toContainText('Unable to look up this registration');
  await expect(page.getByText('2003 Honda Accord', { exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => sessionStorage.getItem('booran-token'))).toBe('rego-test-token');
  await page.getByText('Take Photos', { exact: true }).click();
  await expect(page.getByText('NOTFOUND', { exact: true })).toBeVisible();
  await expect(page.getByText(vehicle.vin, { exact: true })).toHaveCount(0);
});

test('a network failure leaves the session signed in and supports manual capture', async ({ page }) => {
  await openInspection(page);
  await page.route('**/vehicle/decode-rego', route => route.abort('internetdisconnected'));
  await page.getByRole('button', { name: 'Rego', exact: true }).click();
  await page.getByLabel('Registration state', { exact: true }).selectOption('VIC');
  await page.getByLabel('Rego', { exact: true }).fill('ABC123');
  await expect(page.getByRole('alert')).toContainText('Unable to look up this registration');
  expect(await page.evaluate(() => sessionStorage.getItem('booran-token'))).toBe('rego-test-token');
  await page.getByText('Take Photos', { exact: true }).click();
  await expect(page.getByText('Guided zone capture', { exact: true })).toBeVisible();
  await expect(page.getByText('ABC123', { exact: true })).toBeVisible();
});

test('editing a Rego discards a delayed result for the previous plate', async ({ page }) => {
  await openInspection(page);
  let release: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/vehicle/decode-rego', async route => {
    const input = route.request().postDataJSON();
    if (input.rego === 'ABC123') {
      await gate;
      return route.fulfill({ json: { ...vehicle, make: 'STALE' } });
    }
    return route.fulfill({ json: { ...vehicle, rego: 'NEW123', make: 'Toyota', model: 'Camry', year: 2020 } });
  });
  await page.getByRole('button', { name: 'Rego', exact: true }).click();
  await page.getByLabel('Registration state', { exact: true }).selectOption('VIC');
  const started = page.waitForRequest('**/vehicle/decode-rego');
  await page.getByLabel('Rego', { exact: true }).fill('ABC123');
  await started;
  await page.getByLabel('Rego', { exact: true }).fill('NEW123');
  await expect(page.getByText('2020 Toyota Camry', { exact: true })).toBeVisible();
  const completed = page.waitForResponse(response => response.url().endsWith('/vehicle/decode-rego') && response.request().postDataJSON().rego === 'ABC123');
  release!();
  await completed;
  await expect(page.getByText(/STALE/)).toHaveCount(0);
  await expect(page.getByText('2020 Toyota Camry', { exact: true })).toBeVisible();
  await page.getByText('Take Photos', { exact: true }).click();
  await expect(page.getByText('NEW123', { exact: true })).toBeVisible();
  await expect(page.getByText('Toyota', { exact: true })).toBeVisible();
});

test('Rego details and capture fit the desktop layout', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 900 });
  await openInspection(page);
  await page.getByRole('button', { name: 'Rego', exact: true }).click();
  await page.getByLabel('Registration state', { exact: true }).selectOption('VIC');
  await page.getByLabel('Rego', { exact: true }).fill('ABC123');
  await expect(page.getByText('2003 Honda Accord', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByText('Take Photos', { exact: true }).click();
  await expect(page.getByText('Vehicle identification', { exact: true })).toBeVisible();
  await expect(page.getByText('Guided zone capture', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('Rego search finds an older saved inspection without a VIN', async ({ page }) => {
  const state = await openInspection(page);
  state.saved = {
    id: 'legacy-rego-report', createdAt: '2026-11-20T10:00:00Z', createdBy: user.id,
    inspection: { vin: '', rego: 'ABC123', regoState: 'VIC', status: 'COMPLETE', evidenceItems: [],
      vehicleDetails: { make: 'Ford', model: 'Falcon', year: 2010 } },
  };
  await page.getByRole('button', { name: 'Rego', exact: true }).click();
  await page.getByLabel('Registration state', { exact: true }).selectOption('VIC');
  await page.getByLabel('Rego', { exact: true }).fill('ABC123');
  await expect(page.getByText('2003 Honda Accord', { exact: true })).toBeVisible();
  await page.getByText('Search Saved Inspections', { exact: true }).click();
  await expect(page.getByText('2010 Ford Falcon', { exact: true })).toBeVisible();
  expect(new URL(state.historyQueries.at(-1)!).searchParams.has('vin')).toBe(false);
  await page.getByText('2010 Ford Falcon', { exact: true }).click();
  await expect(page.getByText('Vehicle identification', { exact: true })).toBeVisible();
  await expect(page.getByText('ABC123', { exact: true })).toBeVisible();
  await expect(page.getByText('VIC', { exact: true })).toBeVisible();
});

test('live InfoAgent lookup populates the PWA and saves its normalized vehicle data', async ({ page }) => {
  test.skip(process.env.RUN_INFOAGENT_LIVE !== '1', 'Opt in with RUN_INFOAGENT_LIVE=1; uses the backend development credentials and a TEST01 lookup.');
  test.setTimeout(60000);
  // Authentication and inspection storage are isolated; only the provider lookup is live.
  const backendRoot = path.resolve('../warranty-evidence-backend');
  const backendRequire = createRequire(path.join(backendRoot, 'package.json'));
  backendRequire('dotenv').config({ path: path.join(backendRoot, '.env'), quiet: true });
  const { ConfigService } = backendRequire('@nestjs/config');
  const { InfoAgentService } = backendRequire('./dist/modules/vehicle/infoagent.service.js');
  const { RegoService } = backendRequire('./dist/modules/vehicle/rego.service.js');
  const config = new ConfigService();
  expect(config.get('INFOAGENT_BASE_URL') || 'https://api.dev.infoagent.com.au').toMatch(/^https:\/\/api\.dev\.infoagent\.com\.au\/?$/);
  const infoagent = new InfoAgentService(config);
  expect(infoagent.isConfigured()).toBe(true);
  const rego = new RegoService(infoagent);
  let liveVehicle: any;
  const state = await openInspection(page, async input => {
    liveVehicle = await rego.decodeRego(input);
    return liveVehicle;
  });
  await page.getByRole('button', { name: 'Rego', exact: true }).click();
  await page.getByLabel('Registration state', { exact: true }).selectOption('VIC');
  await page.getByLabel('Rego', { exact: true }).fill('test01');
  await expect.poll(() => liveVehicle?.provider, { timeout: 30000 }).toBe('InfoAgent NEVDIS');
  const name = [liveVehicle.year, liveVehicle.make, liveVehicle.model].filter(Boolean).join(' ');
  await expect(page.getByText(name, { exact: true })).toBeVisible();
  await page.screenshot({ path: 'test-results/rego-live-entry.png' });
  await page.getByText('Take Photos', { exact: true }).click();
  await expect(page.getByText(liveVehicle.vin, { exact: true })).toBeVisible();
  await page.getByLabel('Choose zone photos').setInputFiles({ name: 'front.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64') });
  await page.getByText('Save Draft', { exact: true }).click();
  await expect.poll(() => state.saved?.vin).toBe(liveVehicle.vin);
  expect(state.saved.inspection).toMatchObject({ rego: 'TEST01', regoState: 'VIC', vehicleDetails: liveVehicle });
  expect(state.lookups).toEqual([{ rego: 'TEST01', state: 'VIC' }]);
});
