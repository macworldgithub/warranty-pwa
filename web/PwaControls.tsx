import { getOutboxJobs } from './outbox';
import React from 'react';
export function PwaControls() {
  const [waiting, setWaiting] = React.useState<ServiceWorker | null>(null);
  const [notice, setNotice] = React.useState('');
  const [pending, setPending] = React.useState(0);
  const [syncing, setSyncing] = React.useState(false);
  const [pushEnabled, setPushEnabled] = React.useState(false);
  React.useEffect(() => {
    const update = (event: any) => setWaiting(event.detail);
    const storageError = () => setNotice('Device storage is full. Free space before capturing more evidence.');
    window.addEventListener('pwa-update', update); window.addEventListener('storage-error', storageError);
    if ('Notification' in window) setPushEnabled(Notification.permission === 'granted');
    return () => { window.removeEventListener('pwa-update', update); window.removeEventListener('storage-error', storageError); };
  }, []);
  React.useEffect(() => {
    let disposed = false, unsubscribe: (() => void) | undefined;
    const refresh = async () => {
      const { offlineStorage } = await import('../src/services/offlineStorage');
      const count = sessionStorage.getItem('booran-user') ? (await getOutboxJobs()).length + offlineStorage.getPendingUploads().length : 0;
      if (!disposed) setPending(count);
    };
    void import('../src/services/offlineStorage').then(({ offlineStorage }) => { if (!disposed) unsubscribe = offlineStorage.subscribe(() => void refresh()); });
    window.addEventListener('outbox-change', refresh); void refresh();
    return () => { disposed = true; unsubscribe?.(); window.removeEventListener('outbox-change', refresh); };
  }, []);
  const retry = async () => {
    setSyncing(true);
    try { const { syncManager } = await import('../src/services/syncManager'); const result = await syncManager.syncPendingCases(); setNotice(result.failed ? 'Some changes are still waiting. Check your connection and try again.' : 'Saved changes synchronized.'); }
    catch (error: any) { setNotice(error.message); } finally { setSyncing(false); }
  };
  const enableNotifications = async () => {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') { setNotice('Notifications are disabled in your browser settings. In-app alerts remain available.'); return; }
    const { notificationsService } = await import('../src/services/notifications.service');
    const user = JSON.parse(sessionStorage.getItem('booran-user') || 'null');
    if (!user?.id) { setNotice('Sign in before enabling push notifications.'); return; }
    const token = await notificationsService.registerDevice(user.id);
    setPushEnabled(!!token);
    setNotice(token ? 'Push notifications enabled.' : 'Web push needs Firebase web configuration. In-app status alerts are available while this app is open.');
  };
  return <div className="pwa-controls">
    {notice && <button className="pwa-status" onClick={() => setNotice('')} aria-label="Dismiss message">{notice}</button>}
    {pending > 0 && <button disabled={syncing} onClick={retry}>{syncing ? 'Syncing changes...' : pending + ' changes waiting to sync'}</button>}
    {waiting && <button onClick={() => waiting.postMessage({ type: 'SKIP_WAITING' })}>Update app</button>}
    {!pushEnabled && import.meta.env.VITE_FIREBASE_APP_ID && 'Notification' in window && <button onClick={() => enableNotifications().catch(e => setNotice(e.message))}>Enable notifications</button>}
  </div>;
}
