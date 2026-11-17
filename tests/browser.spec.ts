import { QRCodeWriter, BarcodeFormat } from '@zxing/library';
import { test, expect, Page, chromium } from '@playwright/test';
test.use({ launchOptions: { args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] } });
const user = { id: 'test-tech', name: 'Test Technician', email: 'test@example.com', role: 'TECHNICIAN', defaultSiteId: 'site_cranbourne_byd', authorizedSiteIds: ['site_cranbourne_byd'] };
const site = { id: 'site_cranbourne_byd', name: 'Booran BYD Cranbourne', code: 'CRN_BYD', isActive: true, authorizedBrands: ['brand_byd'] };
const rule = { id: 'rule-front', ruleKey: 'front_vehicle_photo', name: 'Front of Vehicle', description: 'Capture the front of the vehicle', mediaType: 'image', tier: 1, isMandatory: true, namingConvention: '{RO}Front.jpg' };
const pack = { id: 'brandpack_byd_v1', brandId: 'brand_byd', brandName: 'BYD', version: 1, status: 'PUBLISHED', name: 'BYD Standard Pack', rules: [rule] };
async function fixtures(page: Page) {
  await page.route('**/api/v1/**', async route => {
    const url = new URL(route.request().url()), path = url.pathname.replace('/api/v1', '');
    let data: any = [];
    if (path === '/auth/login') data = { token: 'fixture-token', user };
    else if (path === '/auth/me') data = user;
    else if (path === '/sites') data = [site];
    else if (path.endsWith('/brands') && path.startsWith('/sites/')) data = { authorizedBrandIds: ['brand_byd'] };
    else if (path === '/brands') data = [{ id: 'brand_byd', name: 'BYD' }];
    else if (path === '/brand-packs/evaluate-rules') data = { brandPackId: pack.id, brandPackVersion: 1, packName: pack.name, resolvedRules: pack.rules, mandatoryCount: 1, optionalCount: 0 };
    else if (path.startsWith('/brand-packs/')) data = pack;
    else if (path === '/voice-to-tech/status') data = { available: true, provider: 'test' };
    else if (path === '/notifications/devices/register') data = { success: true };
    else if (path === '/loan-agreements/kpis') data = {};
    else if (path.includes('geofence')) data = { status: 'OFF_SITE', insideGeofence: false, distanceMeters: 0, siteName: site.name, radiusMeters: 200 };
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) });
  });
}
async function signedIn(page: Page) {
  await fixtures(page);
  await page.addInitScript(({ user }) => { sessionStorage.setItem('booran-user', JSON.stringify(user)); sessionStorage.setItem('booran-token', 'fixture-token'); }, { user });
  await page.goto('/'); await expect(page.getByText('APP MENU', { exact: true })).toBeVisible();
}
test('mobile login matches the app and sign-in navigates to the technician home', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message)); await fixtures(page); await page.goto('/');
  await expect(page.getByText('First Login Activation', { exact: true })).toBeVisible();
  await page.getByText('Sign In', { exact: true }).first().click();
  await page.getByPlaceholder('Username or email').fill('test@example.com'); await page.getByPlaceholder('Enter your password').fill('fixture-password');
  await page.getByText('Sign In', { exact: true }).last().click(); await expect(page.getByText('APP MENU', { exact: true })).toBeVisible();
  await page.screenshot({ path: 'test-results/home-mobile.png' });
  expect(errors).toEqual([]); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
for (const menu of ['Vehicle Inspection', 'Internal Test Drive', 'Warranty Capture', 'Loaners', 'Hoist Inspections', 'Profile & settings']) {
  test(`opens ${menu} without runtime errors`, async ({ page }) => {
    const errors: string[] = []; page.on('pageerror', e => errors.push(e.message)); await signedIn(page);
    await page.getByText(menu, { exact: true }).click(); await expect(page.getByText('APP MENU', { exact: true })).toHaveCount(0);
    await expect(page.getByText('Unable to open the app', { exact: true })).toHaveCount(0);
    await page.screenshot({ path: `test-results/${menu.toLowerCase().replace(/[^a-z]+/g, '-')}.png` });
    expect(errors).toEqual([]); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}
test('desktop uses the same working screens without horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 }); await signedIn(page);
  await expect.poll(() => page.getByRole('img', { name: 'Booran Motors', exact: true }).evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
  await page.screenshot({ path: 'test-results/home-desktop.png' });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('home keeps the mobile two-column menu after resizing and rotation', async ({ page }) => {
  await signedIn(page);
  await expect(page.getByRole('img', { name: 'Booran Motors', exact: true })).toBeVisible();
  const grid = page.getByTestId('home-tool-grid');
  for (const viewport of [{ width: 1280, height: 900 }, { width: 320, height: 740 }, { width: 844, height: 390 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    await expect.poll(async () => {
      const bounds = await grid.boundingBox();
      const cards = await grid.locator(':scope > div').evaluateAll(elements => elements.map(element => {
        const box = element.getBoundingClientRect(); return { x: box.x, y: box.y, width: box.width, right: box.right };
      }));
      return cards.length === 5 && cards.every(card => Math.abs(card.width - (bounds!.width - 12) / 2) < 1 && card.right <= viewport.width)
        && Math.abs(cards[0].y - cards[1].y) < 1 && cards[2].y > cards[0].y && cards[1].x > cards[0].x;
    }).toBe(true);
  }
});

test('install action uses the browser prompt once and hides after installation', async ({ page }) => {
  await fixtures(page);
  // Deliver an install event as soon as the bundle registers its listener, before React mounts.
  await page.addInitScript(() => {
    const add = window.addEventListener.bind(window);
    window.addEventListener = ((type: string, listener: any, options: any) => {
      add(type, listener, options);
      if (type === 'beforeinstallprompt') queueMicrotask(() => {
        const event = new Event('beforeinstallprompt', { cancelable: true });
        Object.assign(event, { prompt: async () => { (window as any).installPrompts = ((window as any).installPrompts || 0) + 1; }, userChoice: Promise.resolve({ outcome: 'dismissed' }) });
        window.dispatchEvent(event);
      });
    }) as typeof window.addEventListener;
  });
  await page.goto('/');
  const install = page.getByRole('button', { name: 'Install app', exact: true });
  await install.click();
  expect(await page.evaluate(() => (window as any).installPrompts)).toBe(1);
  await install.click();
  await expect(page.getByRole('alertdialog')).toContainText('install icon');
  expect(await page.evaluate(() => (window as any).installPrompts)).toBe(1);
  await page.getByRole('button', { name: 'OK', exact: true }).click();
  await page.evaluate(() => window.dispatchEvent(new Event('appinstalled')));
  await expect(install).toHaveCount(0);
});

test('iPhone install action explains Add to Home Screen', async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(navigator, 'userAgent', { value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1' }));
  await signedIn(page);
  await page.getByText('Profile & settings', { exact: true }).click();
  await page.getByRole('button', { name: 'Install app', exact: true }).click();
  await expect(page.getByRole('alertdialog')).toContainText('Add to Home Screen');
});

test('production app has valid install metadata and correctly sized branded icons', async ({}, testInfo) => {
  // Regular Playwright contexts are incognito, where Chrome intentionally blocks installation.
  const context = await chromium.launchPersistentContext(testInfo.outputPath('install-profile'), { channel: 'chrome', headless: true });
  try {
    const page = await context.newPage();
    await fixtures(page); await page.goto('http://localhost:4173/');
    await page.evaluate(async () => { await navigator.serviceWorker.ready; });
    const cdp = await context.newCDPSession(page);
    await cdp.send('Page.enable');
    const manifest = await cdp.send('Page.getAppManifest');
    expect(manifest.errors).toEqual([]);
    const data = JSON.parse(manifest.data!);
    expect(data.display).toBe('standalone');
    for (const icon of data.icons) {
      const size = Number(icon.sizes.split('x')[0]);
      const dimensions = await page.evaluate(async src => {
        const img = new Image(); img.src = new URL(src, document.querySelector<HTMLLinkElement>('link[rel=manifest]')!.href).href;
        await img.decode(); return [img.naturalWidth, img.naturalHeight];
      }, icon.src);
      expect(dimensions).toEqual([size, size]);
    }
    const errors = await cdp.send('Page.getInstallabilityErrors');
    expect(errors.installabilityErrors).toEqual([]);
  } finally { await context.close(); }
});
test('all seven warranty wizard steps accept real case data and submit the pack', async ({ page }) => {
  await signedIn(page);
  let saved: any, submitted = false;
  await page.route('**/api/v1/warranty-cases**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (route.request().method() === 'POST' && path.endsWith('/warranty-cases')) {
      saved = { ...route.request().postDataJSON(), id: 'case-browser-1', status: 'Draft', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), flagHistory: [] };
      await route.fulfill({ json: saved });
    } else if (path.endsWith('/submit-from-workshop')) { submitted = true; await route.fulfill({ json: { ...saved, status: 'Awaiting Review' } }); }
    else await route.fulfill({ json: [] });
  });
  await page.getByText('Warranty Capture', { exact: true }).click();
  await page.getByText('Start New Case', { exact: true }).click();
  await page.getByPlaceholder('e.g. CR-21693').fill('CR-BROWSER-1');
  await page.getByText('Vehicle Info', { exact: true }).last().click();
  await page.getByPlaceholder('e.g. 1C4HJXDG4MW482702').fill('LGXCE4C86P0019283');
  await page.getByPlaceholder('e.g. 14250').fill('14250');
  await page.getByText('Fault & Concern', { exact: true }).last().click();
  await page.getByPlaceholder('e.g. AC not blowing cold air or battery error').fill('Battery cooling warning on the dashboard');
  await page.getByText('Evidence Photos', { exact: true }).last().click();
  await page.getByText('Component Photos', { exact: true }).last().click();
  await page.getByText('Voice Notes', { exact: true }).last().click();
  await page.getByPlaceholder('e.g. Defective seal caused coolant seepage onto harness...').fill('Inspected cooling circuit and verified the reported warning.');
  await page.getByText('Add Note', { exact: true }).click();
  await page.getByText('Review & Submit', { exact: true }).last().click();
  await page.getByText('Submit Warranty Case', { exact: true }).click();
  await expect(page.getByText('Warranty Pack Submitted!', { exact: true })).toBeVisible();
  expect(submitted).toBe(true); expect(saved.vin).toBe('LGXCE4C86P0019283'); expect(saved.voiceNotes[0].transcript).toContain('cooling circuit');
});
test('resumes a saved warranty submission after a 401 and sign-in', async ({ page }) => {
  await signedIn(page);
  const caseId = 'CASE-CRAUTH-1234';
  let creates = 0;
  let saved: any;
  const submissions: string[] = [];
  await page.route('**/api/v1/warranty-cases**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (route.request().method() === 'POST' && path.endsWith('/warranty-cases')) {
      creates++;
      saved = { ...route.request().postDataJSON(), id: caseId };
      await route.fulfill({ json: saved });
    } else if (path.endsWith('/submit-from-workshop')) {
      submissions.push(path);
      if (submissions.length === 1) {
        await route.fulfill({ status: 401, json: { message: 'Your session has expired.' } });
      } else {
        await route.fulfill({ json: { ...saved, status: 'Awaiting Review' } });
      }
    } else {
      await route.fulfill({ json: [] });
    }
  });

  await page.getByText('Warranty Capture', { exact: true }).click();
  await page.getByText('Start New Case', { exact: true }).click();
  await page.getByPlaceholder('e.g. CR-21693').fill('CR-AUTH-RECOVERY');
  await page.getByText('Review', { exact: true }).click();
  await page.getByText('Submit Warranty Case', { exact: true }).click();

  await expect(page.getByText('Your session ended.', { exact: false })).toBeVisible();
  await page.getByPlaceholder('Username or email').fill(user.email);
  await page.getByPlaceholder('Enter your password').fill('fixture-password');
  await page.getByText('Sign In', { exact: true }).last().click();
  await page.getByText('Warranty Capture', { exact: true }).click();
  await page.getByText('CR-AUTH-RECOVERY', { exact: true }).click();
  await page.getByText('Submit Warranty Case', { exact: true }).click();

  await expect(page.getByText('Warranty Pack Submitted!', { exact: true })).toBeVisible();
  expect(creates).toBe(1);
  expect(submissions).toEqual(Array(2).fill(`/api/v1/warranty-cases/${caseId}/submit-from-workshop`));
});

test('production service worker precaches the app and can reopen offline', async ({ page, context }) => {
  await fixtures(page); await page.goto('/'); await expect(page.getByText('First Login Activation', { exact: true })).toBeVisible();
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await page.reload(); await expect(page.getByText('First Login Activation', { exact: true })).toBeVisible();
  await context.setOffline(true); await page.reload();
  await expect(page.getByText('First Login Activation', { exact: true })).toBeVisible();
  const names = await page.evaluate(() => caches.keys()); expect(names.some(name => name.startsWith('booran-app-'))).toBe(true);
});
test.describe('browser camera adapter', () => {
  test.use({ permissions: ['camera', 'microphone'] });
  test('captures a real photo blob and restores its draft preview after reload', async ({ page }) => {
    await signedIn(page); await page.getByText('Warranty Capture', { exact: true }).click(); await page.getByText('Start New Case', { exact: true }).click();
    await page.getByPlaceholder('e.g. CR-21693').fill('CR-BROWSER-MEDIA'); await page.getByText('Vehicle Info', { exact: true }).last().click();
    await page.getByPlaceholder('e.g. 1C4HJXDG4MW482702').fill('LGXCE4C86P0019283');
    await page.getByText('Capture Front Photo', { exact: true }).click();
    await page.getByRole('button', { name: 'Take photo', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'Evidence camera', exact: true })).toHaveCount(0);
    await expect.poll(() => page.evaluate(() => Array.from(document.images).some(img => img.src.startsWith('blob:') && img.naturalWidth > 0))).toBe(true);
    await page.getByText('Review', { exact: true }).click(); await page.getByText('Save Local Draft', { exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Draft Saved' })).toBeVisible(); await page.getByRole('button', { name: 'OK', exact: true }).click();
    await page.reload(); await page.getByText('Warranty Capture', { exact: true }).click(); await page.getByText('CR-BROWSER-MEDIA', { exact: true }).click();
    await expect.poll(() => page.evaluate(() => Array.from(document.images).some(img => img.src.startsWith('blob:') && img.naturalWidth > 0))).toBe(true);
  });
  test('records microphone audio as multipart data and attaches the returned transcript', async ({ page }) => {
    await signedIn(page);
    let audioUploaded = false;
    await page.route('**/api/v1/voice-to-tech/transcribe/upload', async route => {
      audioUploaded = !!route.request().postDataBuffer()?.length && route.request().headers()['content-type'].includes('multipart/form-data');
      await route.fulfill({ json: { transcript: 'Cooling circuit inspection confirmed the reported fault.' } });
    });
    await page.getByText('Warranty Capture', { exact: true }).click(); await page.getByText('Start New Case', { exact: true }).click();
    await page.getByText('Voice', { exact: true }).click();
    const dictate = page.getByText('Hold to Dictate Note', { exact: true }); await dictate.scrollIntoViewIfNeeded(); const box = await dictate.boundingBox();
    await page.mouse.move(box!.x + 5, box!.y + 5); await page.mouse.down(); await page.waitForTimeout(350); await page.mouse.up();
    await expect(page.getByPlaceholder('Technician notes...')).toHaveValue('Cooling circuit inspection confirmed the reported fault.');
    await page.getByText('Attach Note', { exact: true }).click();
    await expect(page.getByText('Cooling circuit inspection confirmed the reported fault.', { exact: false })).toBeVisible(); expect(audioUploaded).toBe(true);
  });
});

test('decodes a real VIN barcode image from camera frames and saves the captured frame', async ({ page }) => {
  const vin='LGXCE4C86P0019283'; const matrix=new QRCodeWriter().encode(vin, BarcodeFormat.QR_CODE, 500, 500, new Map());
  const pixels=Array.from({length:500}, (_,y)=>Array.from({length:500},(_,x)=>matrix.get(x,y)?1:0));
  await page.addInitScript(pixels => {
    navigator.mediaDevices.getUserMedia=async()=>{
      const canvas=document.createElement('canvas');canvas.width=500;canvas.height=500;const ctx=canvas.getContext('2d')!;
      ctx.fillStyle='white';ctx.fillRect(0,0,500,500);ctx.fillStyle='black';
      pixels.forEach((row,y)=>row.forEach((black,x)=>{if(black)ctx.fillRect(x,y,1,1);}));return canvas.captureStream(10);
    };
  },pixels);
  await signedIn(page);await page.getByText('Warranty Capture',{exact:true}).click();await page.getByText('Start New Case',{exact:true}).click();await page.getByText('Vehicle Info',{exact:true}).last().click();
  await page.getByText('Scan VIN Barcode',{exact:true}).click();
  await expect(page.getByPlaceholder('e.g. 1C4HJXDG4MW482702')).toHaveValue(vin,{timeout:15000});
  await expect(page.getByText('Retake Photo',{exact:true})).toBeVisible();
  expect(await page.evaluate(()=>Array.from(document.images).some(img=>img.src.startsWith('blob:')&&img.naturalWidth>0))).toBe(true);
});
test('offline OCR extracts a VIN from an actual captured text image', async ({ page, context }) => {
  await page.addInitScript(()=>{ navigator.mediaDevices.getUserMedia=async()=>{
    const canvas=document.createElement('canvas');canvas.width=1280;canvas.height=720;const ctx=canvas.getContext('2d')!;
    ctx.fillStyle='white';ctx.fillRect(0,0,1280,720);ctx.fillStyle='black';ctx.font='bold 70px Arial';ctx.fillText('LGXCE4C86P0019283',80,350);return canvas.captureStream(10);
  };});
  await signedIn(page);await page.getByText('Warranty Capture',{exact:true}).click();await page.getByText('Start New Case',{exact:true}).click();await page.getByText('Vehicle Info',{exact:true}).last().click();
  await page.evaluate(async()=>{await navigator.serviceWorker.ready;});
  await expect.poll(()=>page.evaluate(()=>!!navigator.serviceWorker.controller)).toBe(true); await context.setOffline(true);
  await page.getByText('Photo VIN',{exact:false}).click();await page.getByRole('button',{name:'Take photo',exact:true}).click();
  await expect(page.getByPlaceholder('e.g. 1C4HJXDG4MW482702')).toHaveValue('LGXCE4C86P0019283',{timeout:30000});
});

test('restores an active road test after reload with wall-clock timing', async ({ page }) => {
  await signedIn(page);
  await page.evaluate(async()=>{
    const user=JSON.parse(sessionStorage.getItem('booran-user')!);
    const db=await new Promise<IDBDatabase>(resolve=>{const req=indexedDB.open('booran-warranty');req.onsuccess=()=>resolve(req.result);});
    const tx=db.transaction('offline','readwrite');
    tx.objectStore('offline').put({vehicle:{id:'recovered-vehicle',registration:'RECOVER-123',repairOrder:'RO-RECOVER',make:'BYD',model:'ATTO 3',year:2024,siteId:user.defaultSiteId},driveId:'recovered-drive',startedAt:Date.now()-65000,isLiveDrive:true,pendingCompletion:false,routePoints:[],distanceKm:1.25,maxSpeedKph:42,elapsedSec:3},'cache:road-active:'+user.id);
    await new Promise<void>(resolve=>{tx.oncomplete=()=>resolve();});db.close();
  });
  await page.reload();await page.getByText('Internal Test Drive',{exact:true}).click();
  await expect(page.getByText('Stop Drive',{exact:true})).toBeVisible(); await expect(page.getByText('RECOVER-123',{exact:true}).first()).toBeVisible();
  await page.getByText('Stop Drive',{exact:true}).click(); await expect(page.getByText('Previous drives',{exact:true})).toBeVisible();
});
