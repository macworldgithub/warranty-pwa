import { beforeEach, expect, it, vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { get, set } from 'idb-keyval';
beforeEach(() => { vi.resetModules(); vi.stubGlobal('indexedDB', new IDBFactory()); vi.stubGlobal('window', { dispatchEvent: vi.fn() }); vi.stubGlobal('navigator', {}); });
async function setup() {
  const outbox = await import('../web/outbox');
  await outbox.setSyncSession({ userId: 'tech-a', token: 'test-token', apiUrl: 'https://backend.test/api/v1' });
  return outbox;
}
it('replays offline creates before dependent updates using the confirmed server ID', async () => {
  const box = await setup(); vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')));
  const created = await box.durableMutation({ method: 'POST', endpoint: '/loan-agreements/issue', body: { customer: { name: 'Audit' } }, localId: 'local_loan_a', collection: 'loans', optimistic: { id: 'local_loan_a', status: 'DRAFT' } });
  expect(created.syncPending).toBe(true);
  await box.durableMutation({ method: 'POST', endpoint: '/loan-agreements/local_loan_a/sign', body: { readAndAgreed: true }, collection: 'loans', optimistic: { id: 'local_loan_a', status: 'ACTIVE' } });
  const urls: string[] = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string) => { urls.push(url); return Response.json({ id: 'loan-server-a', status: 'ACTIVE' }); }));
  expect(await box.replayOutbox((await box.getSyncSession())!)).toEqual({ synced: 2, failed: 0 });
  expect(urls[1]).toBe('https://backend.test/api/v1/loan-agreements/loan-server-a/sign');
  expect(await box.getOutboxJobs()).toHaveLength(0);
  expect((await box.getLocalRecords('loans')).map(item => item.id)).toEqual(['loan-server-a']);
});
it('does not convert a server validation failure into offline success', async () => {
  const box = await setup(); vi.stubGlobal('fetch', vi.fn(async () => Response.json({ message: 'Invalid licence number' }, { status: 400 })));
  await expect(box.durableMutation({ method: 'POST', endpoint: '/loan-agreements/issue', body: {}, optimistic: {} })).rejects.toThrow('Invalid licence number');
  expect(await box.getOutboxJobs()).toHaveLength(0);
});
it('keeps accounts and backend hosts separate and cancels replay after logout', async () => {
  const box = await setup(); vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')));
  await box.durableMutation({ method: 'POST', endpoint: '/hoists/inspect', body: {}, optimistic: {} });
  const a = (await box.getSyncSession())!;
  await box.setSyncSession({ ...a, userId: 'tech-b' }); expect(await box.getOutboxJobs()).toHaveLength(0);
  await box.setSyncSession({ ...a, apiUrl: 'https://different.test/api/v1' }); expect(await box.getOutboxJobs()).toHaveLength(0);
  await box.setSyncSession(a); await box.setSyncSession(null);
  const fetcher=vi.fn(); vi.stubGlobal('fetch',fetcher); await box.replayOutbox(a); expect(fetcher).not.toHaveBeenCalled();
});
it('replays a persisted existing warranty case with no window or sessionStorage', async () => {
  const box = await setup(); const storage = await import('../web/storage');
  await set('state:tech-a', { uploads: [['case-existing', { id: 'case-existing', technicianId: 'tech-a', concernTitle: 'Offline edit', voiceNotes: [{ id: 'note-a', transcript: 'Offline note' }], evidenceItems: [] }]], drafts: [] }, storage.store);
  const calls: any[]=[];
  vi.stubGlobal('fetch', vi.fn(async (url: string, options: any) => { calls.push({ url, method: options.method, body: JSON.parse(options.body) }); return Response.json({ id: 'case-existing' }); }));
  vi.stubGlobal('window', undefined); vi.stubGlobal('sessionStorage', undefined);
  const { syncInBackground } = await import('../web/background-sync'); await syncInBackground();
  expect(calls[0]).toMatchObject({ method: 'PATCH', body: { concernTitle: 'Offline edit', voiceNotes: [{ id: 'note-a', transcript: 'Offline note' }] } });
  expect(calls[1].url).toContain('/submit-from-workshop');
  expect((await get<any>('state:tech-a', storage.store)).uploads).toEqual([]);
});
