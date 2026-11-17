import './install';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { initializeStorage } from './storage';
import { withSyncLock } from './outbox';
import { AlertHost } from './react-native';
import { PwaControls } from './PwaControls';
import './styles.css';

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  render() {
    if (this.state.error) return <div className="dialog-overlay"><section className="native-alert"><h2>Unable to open the app</h2><p>{this.state.error.message}</p><div><button onClick={() => location.reload()}>Try again</button></div></section></div>;
    return this.props.children;
  }
}

async function start() {
  await withSyncLock(initializeStorage);
  const { default: App } = await import('../App');
  createRoot(document.getElementById('root')!).render(<ErrorBoundary><App /><AlertHost /><PwaControls /></ErrorBoundary>);
  if ('serviceWorker' in navigator && import.meta.env.PROD) {
    const hadController = !!navigator.serviceWorker.controller;
    let reloading = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!hadController) return;
      if (reloading) return; reloading = true; location.reload();
    });
    const registration = await navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`, { scope: import.meta.env.BASE_URL });
    const showUpdate = () => { if (registration.waiting) window.dispatchEvent(new CustomEvent('pwa-update', { detail: registration.waiting })); };
    showUpdate();
    registration.addEventListener('updatefound', () => {
      const worker = registration.installing;
      worker?.addEventListener('statechange', () => {
        if (worker.state === 'installed' && navigator.serviceWorker.controller) showUpdate();
      });
    });
    navigator.serviceWorker.addEventListener('message', async event => {
      if (event.data?.type === 'SYNC_PENDING' && sessionStorage.getItem('booran-token')) {
        try { const { syncManager } = await import('../src/services/syncManager'); const result = await syncManager.syncPendingCases(); event.ports[0]?.postMessage({ done: result.failed === 0 }); } catch { event.ports[0]?.postMessage({ done: false }); }
      }
    });
  }
}
start().catch(error => {
  const root = document.getElementById('root')!;
  const panel = document.createElement('p'); panel.style.padding = '24px';
  panel.textContent = `Unable to initialize local storage: ${error.message}. Please enable browser storage and reload.`;
  root.append(panel);
});
