import { beforeEach, expect, it, vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
const mocks = vi.hoisted(() => ({ createCase: vi.fn(), updateCase: vi.fn(), uploadEvidenceFile: vi.fn(), addEvidence: vi.fn(), submitFromWorkshop: vi.fn(), getToken: vi.fn() }));
vi.mock('../src/api', () => ({ casesApi: mocks }));
vi.mock('../src/api/client', () => ({ apiClient: { getToken: mocks.getToken } }));
beforeEach(() => {
  vi.resetModules(); vi.resetAllMocks(); vi.stubGlobal('indexedDB', new IDBFactory());
  vi.stubGlobal('sessionStorage', { getItem: () => JSON.stringify({ id: 'tech-1' }) });
  vi.stubGlobal('window', { dispatchEvent: vi.fn() }); mocks.getToken.mockReturnValue('test-token');
  mocks.updateCase.mockResolvedValue({}); mocks.createCase.mockResolvedValue({ id: 'server-case-1' }); mocks.uploadEvidenceFile.mockResolvedValue({}); mocks.submitFromWorkshop.mockResolvedValue({});
});
async function setup() {
  const storage = await import('../web/storage'); await storage.initializeStorage();
  const { offlineStorage } = await import('../src/services/offlineStorage');
  const { syncManager } = await import('../src/services/syncManager');
  const uri = await storage.saveMedia(new Blob(['image'], { type: 'image/jpeg' }));
  offlineStorage.queuePendingUpload({ id: 'local_case_1', technicianId: 'tech-1', roNumber: 'RO123', vin: 'TESTVIN', evidenceItems: [{ ruleKey: 'front_photo', fileUri: uri, mediaType: 'image' }] } as any);
  return { offlineStorage, syncManager, storage };
}
it('sends binary evidence before submitting and removes a successful queue entry', async () => {
  const { offlineStorage, syncManager } = await setup(); expect(await syncManager.syncPendingCases()).toEqual({ synced: 1, failed: 0 });
  expect(mocks.uploadEvidenceFile.mock.calls[0][1].get('file')).toBeInstanceOf(Blob);
  expect(mocks.uploadEvidenceFile.mock.invocationCallOrder[0]).toBeLessThan(mocks.submitFromWorkshop.mock.invocationCallOrder[0]);
  expect(offlineStorage.getPendingUploads()).toHaveLength(0);
});
it('retries an interrupted upload using the existing server case', async () => {
  const { offlineStorage, syncManager } = await setup(); mocks.uploadEvidenceFile.mockRejectedValueOnce(new Error('Disconnected'));
  expect(await syncManager.syncPendingCases()).toEqual({ synced: 0, failed: 1 });
  expect(offlineStorage.getPendingUploads()[0].id).toBe('server-case-1');
  expect(await syncManager.syncPendingCases()).toEqual({ synced: 1, failed: 0 }); expect(mocks.createCase).toHaveBeenCalledTimes(1);
});
it('keeps another technician’s queued case out of the current session', async () => {
  const { offlineStorage, syncManager } = await setup(); const other = { ...offlineStorage.getPendingUploads()[0], id: 'local_other', technicianId: 'tech-2' }; offlineStorage.queuePendingUpload(other);
  await syncManager.syncPendingCases(); expect(offlineStorage.getPendingUploads().map(item => item.id)).toEqual(['local_other']);
});
it('never submits queued work without a signed-in session', async () => {
  const { offlineStorage, syncManager } = await setup(); mocks.getToken.mockReturnValue(null);
  await syncManager.syncPendingCases(); expect(mocks.createCase).not.toHaveBeenCalled(); expect(offlineStorage.getPendingUploads()).toHaveLength(1);
});
