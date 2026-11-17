import { test, expect } from '@playwright/test';
import http from 'node:http';
test('the production service worker submits a saved case after all app windows close', async ({ page, context }) => {
  const requests: any[] = [];
  const backend = http.createServer(async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*'); res.setHeader('Access-Control-Allow-Headers', '*'); res.setHeader('Access-Control-Allow-Methods', '*');
    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
    let body = ''; for await (const chunk of req) body += chunk;
    requests.push({ method: req.method, url: req.url, body: body ? JSON.parse(body) : null });
    res.setHeader('Content-Type','application/json');res.end(JSON.stringify({ id: 'background-case' }));
  });
  await new Promise<void>(resolve => backend.listen(0,'127.0.0.1',resolve));
  const apiUrl = 'http://127.0.0.1:' + (backend.address() as any).port + '/api/v1';
  const control = await context.newPage(); const cdp = await context.newCDPSession(control);
  let registrationId: string | undefined;
  cdp.on('ServiceWorker.workerRegistrationUpdated', event => { registrationId = event.registrations.find((item: any) => item.scopeURL === 'http://localhost:4173/')?.registrationId || registrationId; });
  await cdp.send('ServiceWorker.enable');
  const user = { id: 'background-tech', name: 'Background Tester', role: 'TECHNICIAN', defaultSiteId: 'site_cranbourne_byd' };
  await page.addInitScript(user => { sessionStorage.setItem('booran-user',JSON.stringify(user));sessionStorage.setItem('booran-token','test-token'); },user);
  await page.route('**/api/v1/**', route => route.fulfill({json: new URL(route.request().url()).pathname.endsWith('/auth/me') ? user : []}));
  try {
    await page.goto('/');await expect(page.getByText('APP MENU',{exact:true})).toBeVisible(); await page.evaluate(async()=>{await navigator.serviceWorker.ready;});
    await expect.poll(()=>registrationId).toBeTruthy();
    await page.evaluate(async ({apiUrl})=>{
      const db = await new Promise<IDBDatabase>((resolve,reject)=>{const request=indexedDB.open('booran-warranty');request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
      const tx=db.transaction('offline','readwrite'); const store=tx.objectStore('offline');
      store.put({userId:'background-tech',token:'test-token',apiUrl},'sync:active-session');
      store.put({uploads:[['background-case',{id:'background-case',technicianId:'background-tech',roNumber:'RO-BACKGROUND',concernTitle:'Saved with the app closed',voiceNotes:[{id:'note-bg',transcript:'Saved offline note'}],evidenceItems:[]}]],drafts:[],inspections:[]},'state:background-tech');
      await new Promise<void>((resolve,reject)=>{tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);});db.close();
    },{apiUrl});
    await page.close();
    await cdp.send('ServiceWorker.dispatchSyncEvent',{origin:'http://localhost:4173',registrationId:registrationId!,tag:'booran-sync',lastChance:false});
    await expect.poll(()=>requests.some(item=>item.url.endsWith('/submit-from-workshop')),{timeout:15000}).toBe(true);
    expect(requests[0]).toMatchObject({method:'PATCH',body:{concernTitle:'Saved with the app closed',voiceNotes:[{id:'note-bg',transcript:'Saved offline note'}]}});
  } finally {await control.close();await new Promise<void>(resolve=>backend.close(()=>resolve()));}
});
