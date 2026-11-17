import { beforeEach, expect, it, vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
const api = vi.hoisted(() => ({ createCase: vi.fn(), updateCase: vi.fn(), addVoiceNotes: vi.fn(), uploadEvidenceFile: vi.fn(), submitFromWorkshop: vi.fn() }));
vi.mock('../src/api', () => ({ casesApi: api }));
vi.mock('../src/api/client', () => ({ apiClient: { getToken: () => 'audit-token' } }));
beforeEach(() => {
  vi.resetModules(); vi.resetAllMocks(); vi.stubGlobal('indexedDB', new IDBFactory());
  vi.stubGlobal('sessionStorage', { getItem: () => JSON.stringify({ id: 'audit-tech' }) });
  vi.stubGlobal('window', { dispatchEvent: vi.fn() });
  api.submitFromWorkshop.mockResolvedValue({ id: 'server-case-existing' });
});
// Ordinary regression for the resolved audit defect; also covered in tests/.
it('regression: offline edits to an existing server case must be replayed before submission', async () => {
  const storage = await import('../web/storage'); await storage.initializeStorage();
  const { offlineStorage } = await import('../src/services/offlineStorage');
  const { syncManager } = await import('../src/services/syncManager');
  offlineStorage.queuePendingUpload({ id: 'server-case-existing', technicianId: 'audit-tech', roNumber: 'RO-AUDIT', concernTitle: 'Concern edited while offline', voiceNotes: [{ id: 'audit-note', transcript: 'New offline technician observation', durationSeconds: 1 }], evidenceItems: [] } as any);
  await syncManager.syncPendingCases();
  expect(api.submitFromWorkshop).toHaveBeenCalled();
  expect(api.updateCase).toHaveBeenCalledWith('server-case-existing', expect.objectContaining({ concernTitle: 'Concern edited while offline', voiceNotes: expect.arrayContaining([expect.objectContaining({ id: 'audit-note' })]) }));
});
