import { get, update } from 'idb-keyval';
import { store, isLocalMedia } from './storage';
import { getSyncSession, isSyncSessionCurrent, replayOutbox, syncRequest, withSyncLock } from './outbox';
import { replayCase, replayInspection, type ReplayApi } from './replay';

export async function syncInBackground() {
  return withSyncLock(async () => {
    const session = await getSyncSession(); if (!session) return;
    const current = () => isSyncSessionCurrent(session);
    const key = `state:${session.userId}`;
    const snapshot = (await get<Record<string, any[]>>(key, store)) || {};
    const api: ReplayApi = {
      createCase: dto => syncRequest(session, '/warranty-cases', 'POST', dto),
      updateCase: (id, dto) => syncRequest(session, `/warranty-cases/${id}`, 'PATCH', dto),
      uploadEvidenceFile: (id, form) => syncRequest(session, `/warranty-cases/${id}/evidence/upload`, 'POST', form),
      addEvidence: (id, dto) => syncRequest(session, `/warranty-cases/${id}/evidence`, 'POST', dto),
      submitFromWorkshop: (id, dto) => syncRequest(session, `/warranty-cases/${id}/submit-from-workshop`, 'POST', dto),
      getCases: async dto => { const result = await syncRequest(session, `/warranty-cases?${new URLSearchParams(dto)}`); return Array.isArray(result) ? result : result?.data || []; },
      addVoiceNotes: (id, notes) => syncRequest(session, `/warranty-cases/${id}/voice-notes`, 'POST', { voiceNotes: notes }),
    };
    const patch = (name: string, id: string, value?: any, oldId?: string) => update<Record<string, any[]>>(key, state => {
      const next = { ...state }; const map = new Map(next[name] || []);
      if (oldId) map.delete(oldId);
      if (value === undefined) map.delete(id); else map.set(id, value);
      next[name] = [...map]; return next;
    }, store);
    let failures = 0;
    for (const [, item] of snapshot.uploads || []) {
      if (!(await current())) break;
      if (item.technicianId && item.technicianId !== session.userId) continue;
      try {
        await replayCase(item, api, async oldId => { await patch('uploads', item.id, item, oldId); }, current);
        await patch('uploads', item.id);
        await patch('drafts', `draft_${item.roNumber}`);
      } catch { failures++; }
    }
    for (const [vin, inspection] of snapshot.inspections || []) {
      if (!(await current())) break;
      if (!inspection.evidenceItems?.some((item: any) => isLocalMedia(item.fileUri) && !item.isUploaded) && !(inspection.voiceNotes?.length && !inspection.voiceNotesSynced)) continue;
      try { await replayInspection(inspection, api, async () => { await patch('inspections', vin, inspection); }, current); }
      catch { failures++; }
    }
    const outbox = await replayOutbox(session);
    if (failures || outbox.failed) throw new Error('Some pending changes could not synchronize yet.');
  });
}
