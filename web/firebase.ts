import { initializeApp, getApps } from 'firebase/app';
import { getMessaging, getToken, deleteToken, onMessage, isSupported } from 'firebase/messaging';
const env = import.meta.env;
export const firebaseConfig = { apiKey: env.VITE_FIREBASE_API_KEY, authDomain: env.VITE_FIREBASE_AUTH_DOMAIN, projectId: env.VITE_FIREBASE_PROJECT_ID, storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET, messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID, appId: env.VITE_FIREBASE_APP_ID };
let messaging: Promise<ReturnType<typeof getMessaging> | null> | undefined;
let activeToken: string | null = null;
let release = Promise.resolve();
function getInstance() {
  messaging ||= (async () => {
    if (!firebaseConfig.appId || !env.VITE_FIREBASE_VAPID_KEY || !(await isSupported())) return null;
    return getMessaging(getApps()[0] || initializeApp(firebaseConfig));
  })(); return messaging;
}
async function currentToken() {
  await release;
  if (!('Notification' in globalThis) || Notification.permission !== 'granted') return null;
  const instance = await getInstance(); if (!instance || !('serviceWorker' in navigator)) return null;
  const registration = await navigator.serviceWorker.getRegistration();
  if (!registration) return null;
  activeToken = await getToken(instance, { vapidKey: env.VITE_FIREBASE_VAPID_KEY, serviceWorkerRegistration: registration });
  return activeToken;
}
export function getWebMessagingAdapter() {
  return {
    instance: {}, getToken: currentToken,
    releaseToken() {
      release = release.catch(() => {}).then(async () => { const instance = await getInstance(); if (instance) await deleteToken(instance); activeToken = null; });
      return release;
    },
    async syncTopics(userId: string) {
      if (!activeToken) return;
      const endpoint = env.VITE_PUSH_BRIDGE_URL || (import.meta.env.BASE_URL + 'pwa-api/push/topics');
      const token = sessionStorage.getItem('booran-token');
      const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: JSON.stringify({ token: activeToken, userId }) });
      if (!response.ok) throw new Error('Direct push is registered. Topic subscriptions require the configured push bridge (' + response.status + ').');
    },
    onTokenRefresh(handler: (token: string) => void | Promise<void>) {
      let stopped = false, previous = activeToken;
      const refresh = async () => { if (stopped || document.visibilityState !== 'visible') return; try { const token = await currentToken(); if (!stopped && token && token !== previous) { previous = token; await handler(token); } } catch (error) { console.warn('[Push refresh]', error); } };
      const timer = setInterval(refresh, 60 * 60 * 1000);
      document.addEventListener('visibilitychange', refresh); window.addEventListener('online', refresh);
      return () => { stopped = true; clearInterval(timer); document.removeEventListener('visibilitychange', refresh); window.removeEventListener('online', refresh); };
    },
    onMessage(handler: (message: any) => void) {
      let unsubscribe: (() => void) | undefined, stopped = false;
      getInstance().then(instance => { if (instance && !stopped) unsubscribe = onMessage(instance, handler); }).catch(console.warn);
      return () => { stopped = true; unsubscribe?.(); };
    },
    onNotificationOpenedApp(handler: (message: any) => void) {
      const listener = (event: MessageEvent) => { if (event.data?.type === 'NOTIFICATION_OPEN') handler(event.data.message); };
      navigator.serviceWorker?.addEventListener('message', listener);
      return () => navigator.serviceWorker?.removeEventListener('message', listener);
    },
    async getInitialNotification() {
      const url = new URL(location.href); const raw = url.searchParams.get('notification'); if (!raw) return null;
      url.searchParams.delete('notification'); history.replaceState(history.state, '', url);
      try { return JSON.parse(raw); } catch { return null; }
    },
  };
}
