import { persist } from '../../web/storage';
import { casesApi } from '../api';
import { apiClient } from '../api/client';
import { offlineStorage } from './offlineStorage';
import { isLocalMedia } from '../../web/storage';
import { replayCase, replayInspection } from '../../web/replay';
import { getOutboxJobs, getSyncSession, isSyncSessionCurrent, replayOutbox, requestBackgroundSync, withSyncLock } from '../../web/outbox';

export interface SyncStatus { isSyncing: boolean; pendingCount: number; lastSyncTime?: string; error?: string }
class SyncManager {
  private isSyncing = false;
  private lastSyncTime?: string;
  private listeners = new Set<(status: SyncStatus) => void>();
  public subscribe(listener: (status: SyncStatus) => void) { this.listeners.add(listener); void this.notify(); return () => { this.listeners.delete(listener); }; }
  private async notify(error?: string) {
    const status = { isSyncing: this.isSyncing, pendingCount: offlineStorage.getPendingUploads().length + (await getOutboxJobs()).length, lastSyncTime: this.lastSyncTime, error };
    this.listeners.forEach(listener => listener(status));
  }
  public async syncPendingCases(): Promise<{ synced: number; failed: number }> {
    if (this.isSyncing) return { synced: 0, failed: 0 };
    let user; try { user = JSON.parse(sessionStorage.getItem('booran-user') || 'null'); } catch {}
    const token = apiClient.getToken();
    if (!token || !user?.id) return { synced: 0, failed: 0 };
    this.isSyncing = true; await this.notify();
    const current = async () => {
      let currentUser; try { currentUser = JSON.parse(sessionStorage.getItem('booran-user') || 'null'); } catch {}
      return currentUser?.id === user.id && apiClient.getToken() === token;
    };
    try {
      const result = await withSyncLock(async () => {
        let synced = 0, failed = 0;
        const pending = offlineStorage.getPendingUploads().filter(item => !item.technicianId || item.technicianId === user.id);
        for (const item of pending) {
          if (!(await current())) break;
          try {
            await replayCase(item, casesApi, async oldId => {
              if (!(await current())) throw new Error('Session changed.');
              if (oldId) offlineStorage.removePendingUpload(oldId);
              offlineStorage.queuePendingUpload(item); await persist();
            }, current);
            if (!(await current())) break;
            offlineStorage.removePendingUpload(item.id);
            offlineStorage.removeDraft(`draft_${item.roNumber}`); await persist(); synced++;
          } catch { failed++; }
        }
        const inspections = offlineStorage.getAllVehicleInspections().filter(inspection => inspection.evidenceItems.some(item => isLocalMedia(item.fileUri) && !item.isUploaded) || (inspection.voiceNotes?.length && !inspection.voiceNotesSynced));
        for (const inspection of inspections) {
          if (!(await current())) break;
          try {
            await replayInspection(inspection, casesApi, async () => {
              if (!(await current())) throw new Error('Session changed.');
              offlineStorage.saveVehicleInspection(inspection); await persist();
            }, current); synced++;
          } catch { failed++; }
        }
        const session = await getSyncSession();
        if (session && session.userId === user.id && await isSyncSessionCurrent(session)) {
          const other = await replayOutbox(session); synced += other.synced; failed += other.failed;
        }
        return { synced, failed };
      });
      this.lastSyncTime = new Date().toISOString();
      await requestBackgroundSync();
      return result || { synced: 0, failed: 0 };
    } finally { this.isSyncing = false; await this.notify(); }
  }
}
export const syncManager = new SyncManager();
