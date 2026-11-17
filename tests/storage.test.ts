import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
const memoryStorage = () => { const values = new Map<string, string>(); return { getItem: (k: string) => values.get(k) ?? null, setItem: (k: string, v: string) => values.set(k, v), removeItem: (k: string) => values.delete(k) }; };
beforeEach(() => {
  vi.resetModules(); vi.stubGlobal('indexedDB', new IDBFactory());
  vi.stubGlobal('sessionStorage', memoryStorage()); vi.stubGlobal('window', { dispatchEvent: vi.fn() });
});
describe('durable workshop data', () => {
  it('restores drafts after a fresh application load', async () => {
    let storage = await import('../web/storage'); await storage.initializeStorage();
    const drafts = new storage.PersistentMap('drafts'); drafts.set('draft-1', { vin: 'TESTVIN', step: 3 }); await storage.persist();
    vi.resetModules(); storage = await import('../web/storage'); await storage.initializeStorage();
    expect(new storage.PersistentMap('drafts').get('draft-1')).toEqual({ vin: 'TESTVIN', step: 3 });
  });
  it('does not expose another technician’s drafts on account switching', async () => {
    const s = await import('../web/storage'); await s.initializeStorage(); const drafts = new s.PersistentMap('drafts');
    await s.setStorageUser('technician-a'); drafts.set('a', { customer: 'A' }); await s.persist();
    await s.setStorageUser('technician-b'); expect(drafts.size).toBe(0);
    drafts.set('b', { customer: 'B' }); await s.persist();
    await s.setStorageUser('technician-a'); expect(drafts.has('a')).toBe(true); expect(drafts.has('b')).toBe(false);
  });
  it('preserves every map during overlapping writes', async () => {
    const s = await import('../web/storage'); await s.initializeStorage(); const drafts = new s.PersistentMap('drafts'), uploads = new s.PersistentMap('uploads');
    for (let i = 0; i < 15; i++) { drafts.set(i, i); uploads.set(i, i); } await s.persist();
    vi.resetModules(); const reloaded = await import('../web/storage'); await reloaded.initializeStorage();
    expect(new reloaded.PersistentMap('drafts').size).toBe(15); expect(new reloaded.PersistentMap('uploads').size).toBe(15);
  });
  it('uploads real binary media with its actual browser container type', async () => {
    const s = await import('../web/storage'); await s.initializeStorage(); const uri = await s.saveMedia(new Blob(['real video bytes'], { type: 'video/webm' }));
    const form = new FormData(); await s.appendMedia(form, 'file', { uri, type: 'video/mp4', name: 'ROFront.mp4' });
    const file = form.get('file') as File; expect(file.name).toBe('ROFront.webm'); expect(file.type).toBe('video/webm'); expect(await file.text()).toBe('real video bytes');
  });
  it('restores media after reload and resolves expired object URLs', async () => {
    const s = await import('../web/storage'); await s.initializeStorage(); const uri = await s.saveMedia(new Blob(['photo'], { type: 'image/jpeg' }));
    vi.resetModules(); const reloaded = await import('../web/storage'); await reloaded.initializeStorage();
    expect(await (await reloaded.readMedia(uri)).text()).toBe('photo'); expect(reloaded.resolveMedia(uri)).not.toBe(uri);
  });
});
