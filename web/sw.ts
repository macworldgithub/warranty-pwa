/// <reference lib="webworker" />
import { initializeApp } from 'firebase/app';
import { getMessaging, onBackgroundMessage } from 'firebase/messaging/sw';
import { syncInBackground } from './background-sync';
declare const self: ServiceWorkerGlobalScope;
declare const __PRECACHE_MANIFEST__: string[];
declare const __CACHE_VERSION__: string;
declare const __BASE__: string;
declare const __FIREBASE_CONFIG__: Record<string, string>;
const cacheName = `booran-app-${__CACHE_VERSION__}`;
const assets = __PRECACHE_MANIFEST__;
// Keep notification click handling before Firebase's event listeners.
self.addEventListener('notificationclick', (event: NotificationEvent) => {
  event.stopImmediatePropagation(); event.notification.close();
  const message = event.notification.data?.FCM_MSG || event.notification.data?.message || {};
  event.waitUntil((async () => {
    const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const appClient = clients.find(client => new URL(client.url).pathname.startsWith(__BASE__));
    if (appClient) { await (appClient as WindowClient).focus(); appClient.postMessage({ type: 'NOTIFICATION_OPEN', message }); }
    else await self.clients.openWindow(`${__BASE__}?notification=${encodeURIComponent(JSON.stringify(message))}`);
  })());
});
if (__FIREBASE_CONFIG__.appId) {
  const messaging = getMessaging(initializeApp(__FIREBASE_CONFIG__));
  onBackgroundMessage(messaging, payload => {
    // Firebase already displays messages with a notification payload.
    if (payload.notification) return;
    return self.registration.showNotification(payload.data?.title || 'Booran Warranty', {
      body: payload.data?.body || 'Your warranty case has been updated.',
      icon: `${__BASE__}icons/icon-192.png`, data: { message: payload },
    });
  });
}
self.addEventListener('install', event => {
  event.waitUntil(caches.open(cacheName).then(cache => cache.addAll(assets)));
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key.startsWith('booran-app-') && key !== cacheName) await caches.delete(key);
    await self.clients.claim();
  })());
});
self.addEventListener('message', event => { if (event.data?.type === 'SKIP_WAITING') self.skipWaiting(); });
self.addEventListener('fetch', event => {
  const request = event.request, url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (url.pathname.startsWith(`${__BASE__}api/`) || url.pathname.startsWith(`${__BASE__}uploads/`)) return;
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(async () => (await caches.open(cacheName)).match(`${__BASE__}index.html`).then(response => response || Response.error())));
  } else if (assets.includes(url.pathname)) {
    event.respondWith(caches.open(cacheName).then(async cache => (await cache.match(url.pathname)) || fetch(request)));
  }
});
self.addEventListener('sync' as any, (event: any) => {
  if (event.tag === 'booran-sync') event.waitUntil((async () => {
    const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    if (!clients.length) { await syncInBackground(); return; }
    const done = await new Promise<boolean>(resolve => {
      const channel = new MessageChannel();
      const timeout = setTimeout(() => { channel.port1.close(); resolve(false); }, 15000);
      channel.port1.onmessage = event => { clearTimeout(timeout); channel.port1.close(); resolve(!!event.data?.done); };
      clients[0].postMessage({ type: 'SYNC_PENDING' }, [channel.port2]);
    });
    if (!done) {
      const remaining = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      if (!remaining.length) await syncInBackground();
      else throw new Error('Foreground synchronization is still pending.');
    }
  })());
});
