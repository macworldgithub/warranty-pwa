import { createStore, get, set, entries, del } from 'idb-keyval';

export const store = createStore('booran-warranty', 'offline');
let snapshot: Record<string, any[]> = {};
let stateKey = 'state:guest';
const maps = new Map<string, Map<any, any>>();
const urls = new Map<string, string>();
let writes = Promise.resolve();

export async function initializeStorage() {
  let userId = 'guest';
  try { userId = JSON.parse(sessionStorage.getItem('booran-user') || 'null')?.id || 'guest'; } catch {}
  stateKey = `state:${userId}`;
  snapshot = (await get(stateKey, store)) || {};
  for (const [key, blob] of await entries(store)) {
    if (typeof key === 'string' && key.startsWith('media:') && blob instanceof Blob) {
      urls.set(key.slice(6), URL.createObjectURL(blob));
    }
  }
}

export function persist() {
  const state = Object.fromEntries([...maps].map(([key, value]) => [key, [...value]]));
  const key = stateKey;
  // Serialize writes so an older snapshot can never overwrite a newer one.
  writes = writes.catch(() => {}).then(() => set(key, state, store));
  writes.catch(error => { if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('storage-error', { detail: error })); });
  return writes;
}

export class PersistentMap<K, V> extends Map<K, V> {
  constructor(name: string) {
    super();
    for (const [key, value] of snapshot[name] || []) Map.prototype.set.call(this, key, value);
    maps.set(name, this);
  }
  set(key: K, value: V) { super.set(key, value); void persist(); return this; }
  delete(key: K) { const removed = super.delete(key); void persist(); return removed; }
  clear() { super.clear(); void persist(); }
}
export async function setStorageUser(userId: string) {
  if (stateKey === `state:${userId}`) return;
  await writes;
  stateKey = `state:${userId}`;
  snapshot = (await get(stateKey, store)) || {};
  for (const [name, map] of maps) {
    Map.prototype.clear.call(map);
    for (const [key, value] of snapshot[name] || []) Map.prototype.set.call(map, key, value);
  }
}
export const readCache = <T>(key: string) => get<T>(`cache:${key}`, store);
export const writeCache = (key: string, value: unknown) => set(`cache:${key}`, value, store);

export async function saveMedia(blob: Blob): Promise<string> {
  const uri = URL.createObjectURL(blob);
  await set(`media:${uri}`, blob, store);
  urls.set(uri, uri);
  return uri;
}
export function resolveMedia(uri: string) { return urls.get(uri) || uri; }
export async function readMedia(uri: string): Promise<Blob> {
  const stored = await get<Blob>(`media:${uri}`, store);
  if (stored) return stored;
  const response = await fetch(resolveMedia(uri));
  if (!response.ok) throw new Error('Evidence file is unavailable. Please recapture it.');
  return response.blob();
}
export async function appendMedia(form: FormData, key: string, media: { uri: string; type: string; name: string }) {
  const blob = await readMedia(media.uri);
  const extension = blob.type === 'text/plain' ? 'txt' : blob.type.split('/')[1]?.split(';')[0]?.replace('jpeg', 'jpg');
  const name = extension ? media.name.replace(/\.[^.]+$/, `.${extension}`) : media.name;
  form.append(key, blob, name);
}
export async function serializeMedia<T>(value: T): Promise<T> {
  if (typeof value === 'string' && value.startsWith('blob:')) {
    const blob = await readMedia(value);
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let binary = '';
    for (let offset = 0; offset < bytes.length; offset += 8192) binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
    return `data:${blob.type || 'application/octet-stream'};base64,${btoa(binary)}` as T;
  }
  if (Array.isArray(value)) return await Promise.all(value.map(serializeMedia)) as T;
  if (value && typeof value === 'object') return Object.fromEntries(await Promise.all(Object.entries(value).map(async ([key, item]) => [key, await serializeMedia(item)]))) as T;
  return value;
}
export function isLocalMedia(uri?: string) {
  return !!uri && /^(blob:|data:|file:|content:)/.test(uri);
}
export async function removeMedia(uri: string) {
  URL.revokeObjectURL(resolveMedia(uri));
  urls.delete(uri);
  await del(`media:${uri}`, store);
}
