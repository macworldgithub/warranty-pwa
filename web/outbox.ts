import { get, set, del, entries, update } from 'idb-keyval';
import { store, serializeMedia, isLocalMedia } from './storage';

export interface SyncSession { userId: string; token: string; apiUrl: string }
export interface OutboxJob {
  id: string; userId: string; apiUrl: string; createdAt: number;
  method: string; endpoint: string; body?: any; localId?: string;
  collection?: string; optimistic?: any; deletedId?: string;
  error?: string; statusCode?: number;
}
const sessionKey = 'sync:active-session';
const jobPrefix = 'outbox:';
let localLock = Promise.resolve();
export const getSyncSession = () => get<SyncSession>(sessionKey, store);
export async function setSyncSession(session: SyncSession | null) {
  if (session) await set(sessionKey, session, store); else await del(sessionKey, store);
  emitChange();
}
export async function isSyncSessionCurrent(session: SyncSession) {
  const active = await getSyncSession();
  return active?.userId === session.userId && active.token === session.token && active.apiUrl === session.apiUrl;
}
export function emitChange() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('outbox-change'));
}
export async function requestBackgroundSync() {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  const session = await getSyncSession(); if (!session) return;
  const state = await get<any>('state:' + session.userId, store);
  const hasCases = state?.uploads?.length || state?.inspections?.some(([, inspection]: any) => inspection.evidenceItems?.some((item: any) => isLocalMedia(item.fileUri) && !item.isUploaded) || (inspection.voiceNotes?.length && !inspection.voiceNotesSynced));
  if (!hasCases && !(await getOutboxJobs(session)).length) return;
  try {
    const registration = await navigator.serviceWorker.getRegistration();
    if (registration && 'sync' in registration) await (registration as any).sync.register('booran-sync');
  } catch { /* Foreground retries remain available on browsers without Background Sync. */ }
}
// Web Locks serialize page/worker replays. An atomic IDB lease covers browsers
// without Web Locks and prevents two tabs from issuing the same queued create.
export async function withSyncLock<T>(work: () => Promise<T>): Promise<T | undefined> {
  if (typeof navigator !== 'undefined' && navigator.locks) return navigator.locks.request('booran-sync', work);
  let release: () => void;
  const previous = localLock; localLock = new Promise<void>(resolve => { release = resolve; });
  await previous;
  const owner = crypto.randomUUID(); let acquired = false;
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  try {
    while (!acquired) {
      await update<any>('sync:lease', lease => {
        if (!lease || lease.expires < Date.now()) { acquired = true; return { owner, expires: Date.now() + 90000 }; }
        return lease;
      }, store);
      if (!acquired) await new Promise(resolve => setTimeout(resolve, 100));
    }
    heartbeat = setInterval(() => void update<any>('sync:lease', lease => lease?.owner === owner ? { owner, expires: Date.now() + 90000 } : lease, store).catch(console.warn), 20000);
    return await work();
  } finally {
    clearInterval(heartbeat);
    try { if (acquired) await update<any>('sync:lease', lease => lease?.owner === owner ? null : lease, store); }
    finally { release!(); }
  }
}
export async function syncRequest(session: SyncSession, endpoint: string, method = 'GET', body?: any, requestId?: string) {
  if (!(await isSyncSessionCurrent(session))) throw new Error('Session changed. Sign in to synchronize.');
  const form = body instanceof FormData;
  const response = await fetch(`${session.apiUrl}${endpoint}`, {
    method, headers: { Accept: 'application/json', Authorization: `Bearer ${session.token}`, ...(!form ? { 'Content-Type': 'application/json' } : {}), ...(requestId ? { 'Idempotency-Key': requestId } : {}) },
    body: body === undefined ? undefined : form ? body : JSON.stringify(body), signal: AbortSignal.timeout(30000),
  });
  const data = response.status === 204 ? null : response.headers.get('content-type')?.includes('json') ? await response.json() : await response.text();
  if (!response.ok) {
    const error: any = new Error(Array.isArray(data?.message) ? data.message.join(', ') : data?.message || data?.error || `HTTP ${response.status}`);
    error.statusCode = response.status; throw error;
  }
  return data;
}
export async function getOutboxJobs(session?: SyncSession) {
  const active = session || await getSyncSession();
  if (!active) return [];
  return (await entries(store)).filter(([key, job]) => typeof key === 'string' && key.startsWith(jobPrefix) && job.userId === active.userId && job.apiUrl === active.apiUrl).map(([, job]) => job as OutboxJob).sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));
}
const mapKey = (session: SyncSession) => `outbox-ids:${session.userId}:${session.apiUrl}`;
const recordsKey = (session: SyncSession, collection: string) => `records:${session.userId}:${session.apiUrl}:${collection}`;
export async function resolveServerId(id: string, session?: SyncSession) {
  const active = session || await getSyncSession();
  const ids = active ? await get<Record<string, string>>(mapKey(active), store) : undefined;
  return ids?.[id] || id;
}
export async function getLocalRecords(collection: string, session?: SyncSession): Promise<any[]> {
  const active = session || await getSyncSession();
  return active ? (await get(recordsKey(active, collection), store)) || [] : [];
}
export async function cacheRecords(collection: string, records: any[], session?: SyncSession) {
  const active = session || await getSyncSession(); if (!active) return;
  await update<any[]>(recordsKey(active, collection), current => {
    const merged = new Map((current || []).map(item => [item.id, item]));
    records.forEach(item => { if (item?.id) merged.set(item.id, item); }); return [...merged.values()];
  }, store);
}
export async function mergePendingRecords(collection: string, server: any[]) {
  const session = await getSyncSession(); if (!session) return server;
  await cacheRecords(collection, server, session);
  const records = new Map(server.map(item => [item.id, item]));
  for (const job of await getOutboxJobs(session)) {
    if (job.collection !== collection) continue;
    if (job.deletedId) records.delete(await resolveServerId(job.deletedId, session));
    else if (job.optimistic) {
      const id = await resolveServerId(job.optimistic.id, session);
      records.set(id, { ...records.get(id), ...job.optimistic, id, syncPending: true, syncError: job.error });
    }
  }
  return [...records.values()];
}
async function runJob(job: OutboxJob, session: SyncSession) {
  const ids = (await get<Record<string, string>>(mapKey(session), store)) || {};
  let endpoint = job.endpoint;
  for (const [local, server] of Object.entries(ids)) endpoint = endpoint.replaceAll(encodeURIComponent(local), encodeURIComponent(server));
  if (/\/local_[^/]+/.test(endpoint)) throw new Error('Waiting for the preceding create to synchronize.');
  const result = await syncRequest(session, endpoint, job.method, job.body, job.id);
  if (job.localId) {
    if (!result?.id) throw new Error('Server did not confirm the new record ID.');
    ids[job.localId] = result.id; await set(mapKey(session), ids, store);
  }
  if (job.collection) {
    const key = recordsKey(session, job.collection);
    await update<any[]>(key, current => {
      const records = new Map((current || []).map(item => [item.id, item]));
      if (job.localId) records.delete(job.localId);
      if (job.deletedId) records.delete(ids[job.deletedId] || job.deletedId);
      else {
        const id = result?.id || ids[job.optimistic?.id] || job.optimistic?.id;
        if (id) records.set(id, { ...job.optimistic, ...result, id, syncPending: false });
      }
      return [...records.values()];
    }, store);
  }
  await del(`${jobPrefix}${job.id}`, store); emitChange();
  return result;
}
export async function replayOutbox(session: SyncSession) {
  let synced = 0, failed = 0;
  for (const job of await getOutboxJobs(session)) {
    if (!(await isSyncSessionCurrent(session))) break;
    if (job.statusCode && job.statusCode >= 400 && job.statusCode < 500 && ![401, 408, 429].includes(job.statusCode)) { failed++; continue; }
    try { await runJob(job, session); synced++; }
    catch (error: any) {
      job.error = error.message; job.statusCode = error.statusCode; await set(`${jobPrefix}${job.id}`, job, store); failed++;
      if (!error.statusCode || error.statusCode === 401 || error.statusCode >= 500) break;
    }
  }
  emitChange(); return { synced, failed };
}
export async function durableMutation<T>(input: { method: string; endpoint: string; body?: any; localId?: string; collection?: string; optimistic?: T; deletedId?: string; defer?: boolean }): Promise<T & { syncPending?: boolean }> {
  const session = await getSyncSession();
  if (!session) throw new Error('Sign in before saving changes.');
  const previousRecord = input.collection && (input.optimistic as any)?.id ? (await getLocalRecords(input.collection, session)).find(item => item.id === (input.optimistic as any).id) : undefined;
  const job: OutboxJob = { ...input, body: await serializeMedia(input.body), id: crypto.randomUUID(), userId: session.userId, apiUrl: session.apiUrl, createdAt: Date.now() };
  await update<number>('sync:sequence', previous => { job.createdAt = Math.max(job.createdAt, (previous || 0) + 1); return job.createdAt; }, store);
  await set(`${jobPrefix}${job.id}`, job, store);
  if (input.collection && input.optimistic && (input.optimistic as any).id) await cacheRecords(input.collection, [{ ...input.optimistic, syncPending: true }], session);
  await requestBackgroundSync(); emitChange();
  if (input.defer) {
    void withSyncLock(() => replayOutbox(session)).catch(console.warn);
    return { ...input.optimistic, syncPending: true } as T & { syncPending?: boolean };
  }
  const result = await withSyncLock(async () => {
    // Replay earlier operations first, including a pending issue/start this job depends on.
    const jobs = await getOutboxJobs(session);
    for (const earlier of jobs) {
      if (earlier.id === job.id) break;
      try { await runJob(earlier, session); } catch { /* This job may be independent. */ }
    }
    try { return { value: await runJob(job, session) }; }
    catch (error: any) {
      if (error.statusCode >= 400 && error.statusCode < 500 && ![408, 429].includes(error.statusCode)) {
        await del(`${jobPrefix}${job.id}`, store);
        if (input.collection && (input.optimistic as any)?.id) await update<any[]>(recordsKey(session, input.collection), records => {
          const retained = (records || []).filter(item => item.id !== (input.optimistic as any).id);
          if (previousRecord) retained.push(previousRecord); return retained;
        }, store);
        emitChange(); throw error;
      }
      job.error = error.message; await set(`${jobPrefix}${job.id}`, job, store);
      return { value: { ...input.optimistic, syncPending: true } };
    }
  });
  return (result?.value || { ...input.optimistic, syncPending: true }) as T & { syncPending?: boolean };
}
