import { durableMutation, getLocalRecords, mergePendingRecords, cacheRecords, getOutboxJobs, getSyncSession } from '../../web/outbox';
import { apiClient } from './client';
import {
  Hoist,
  HoistInspection,
  HoistSummary,
  SubmitInspectionPayload,
  HOIST_CHECKLIST_TEMPLATE,
} from '../types/hoist.types';

// In-Memory Global Store for resilient offline / online performance
let memoryHoists: Hoist[] = [];
let memoryInspections: HoistInspection[] = [];
let memoryScope = '';
async function ensureMemoryScope() {
  const session = await getSyncSession();
  const scope = session ? session.userId + ':' + session.apiUrl : 'signed-out';
  if (scope !== memoryScope) { memoryScope = scope; memoryHoists = []; memoryInspections = []; }
}
async function overlayPendingInspections(hoists: Hoist[]): Promise<Hoist[]> {
  const jobs = await getOutboxJobs();
  return hoists.map(hoist => {
    const pending = jobs.filter(job => job.collection === 'hoist-inspections' && job.optimistic?.hoistId === hoist.id).at(-1)?.optimistic;
    return pending ? { ...hoist, lastInspectionDate: pending.signedAt, lastInspectionStatus: pending.status, lastInspectedBy: pending.inspectorId, lastInspectedByName: pending.inspectorName, status: pending.status === 'TAGGED_OUT' ? 'OUT_OF_SERVICE' : pending.status === 'FAULT_IDENTIFIED' ? 'FAULT_IDENTIFIED' : 'OPERATIONAL', lockoutTagoutActive: pending.lockoutTagoutApplied, activeFaultNotes: pending.faultNotes, syncPending: true } as Hoist : hoist;
  });
}

function computeSummary(facility?: string): HoistSummary {
  const todayStr = new Date().toISOString().slice(0, 10);
  const targetHoists = memoryHoists.filter(
    (h) => !facility || facility === 'all' || h.facility === facility
  );

  const inspectedToday = targetHoists.filter((h) => {
    if (!h.lastInspectionDate) return false;
    return new Date(h.lastInspectionDate).toISOString().slice(0, 10) === todayStr;
  }).length;

  const faultIdentified = targetHoists.filter((h) => h.status === 'FAULT_IDENTIFIED').length;
  const outOfService = targetHoists.filter(
    (h) => h.status === 'OUT_OF_SERVICE' || h.lockoutTagoutActive
  ).length;
  const operational = targetHoists.filter(
    (h) => h.status === 'OPERATIONAL' && !h.lockoutTagoutActive
  ).length;

  return {
    totalHoists: targetHoists.length,
    inspectedToday,
    pendingToday: Math.max(0, targetHoists.length - inspectedToday),
    operational,
    faultIdentified,
    outOfService,
    todayDate: todayStr,
  };
}

function numberedHoists(hoists: Hoist[]): Hoist[] {
  return hoists.filter(hoist => hoist.isActive !== false && hoist.hoistNumber >= 1 && hoist.hoistNumber <= 11)
    .map(hoist => ({ ...hoist, name: `Hoist ${hoist.hoistNumber}` }))
    .sort((a, b) => a.facility.localeCompare(b.facility) || a.hoistNumber - b.hoistNumber);
}

export const hoistApi = {
  // Assignment must be confirmed by the server to avoid double allocation across devices.
  assign: async (id: string, dto: { jobNumber?: string; vehicleRego?: string }): Promise<Hoist> =>
    apiClient.post<Hoist>(`/hoists/${encodeURIComponent(id)}/assign`, dto),
  release: async (id: string, assignmentId: string): Promise<Hoist> =>
    apiClient.post<Hoist>(`/hoists/${encodeURIComponent(id)}/release`, { assignmentId }),
  getHoists: async (facility?: string, siteId?: string): Promise<Hoist[]> => {
    await ensureMemoryScope();
    try {
      const params = new URLSearchParams();
      if (facility && facility !== 'all') params.append('facility', facility);
      if (siteId) params.append('siteId', siteId);
      const query = params.toString() ? `?${params.toString()}` : '';
      const data = await apiClient.get<Hoist[]>(`/hoists${query}`);
      if (Array.isArray(data)) {
        memoryHoists = await overlayPendingInspections(numberedHoists(await mergePendingRecords('hoists', data)));
        return memoryHoists;
      }
    } catch {
      // Fallback to local store
    }
    const cached = await getLocalRecords('hoists');
    return (await overlayPendingInspections(numberedHoists(await mergePendingRecords('hoists', cached)))).filter(h => (!facility || facility === 'all' || h.facility === facility) && (!siteId || h.siteId === siteId));
  },

  getSummary: async (facility?: string): Promise<HoistSummary> => {
    await ensureMemoryScope();
    if ((await getOutboxJobs()).some(job => ['hoists', 'hoist-inspections'].includes(job.collection))) { memoryHoists = await hoistApi.getHoists(facility); return computeSummary(facility); }
    try {
      const query = facility && facility !== 'all' ? `?facility=${facility}` : '';
      const data = await apiClient.get<HoistSummary>(`/hoists/summary${query}`);
      if (data && typeof data.totalHoists === 'number') {
        return data;
      }
    } catch {
      // Fallback to local store calculation
    }
    memoryHoists = await hoistApi.getHoists(facility);
    return computeSummary(facility);
  },

  getHoistById: async (id: string): Promise<Hoist> => {
    await ensureMemoryScope();
    try {
      const data = await apiClient.get<Hoist>(`/hoists/${id}`);
      if (data) return data;
    } catch {
      // Fallback
    }
    const found = (await getLocalRecords('hoists')).find((h) => h.id === id);
    if (found) return found;
    throw new Error('Hoist not found');
  },

  submitInspection: async (payload: SubmitInspectionPayload): Promise<HoistInspection> => {
    await ensureMemoryScope();
    const todayStr = new Date().toISOString().slice(0, 10);
    const hoistIndex = memoryHoists.findIndex((h) => h.id === payload.hoistId);

    const newInspection: HoistInspection = {
      id: `local_hoist_${crypto.randomUUID()}`,
      hoistId: payload.hoistId,
      hoistNumber: hoistIndex >= 0 ? memoryHoists[hoistIndex].hoistNumber : 1,
      facility: hoistIndex >= 0 ? memoryHoists[hoistIndex].facility : 'hyundai_chery',
      siteId: hoistIndex >= 0 ? memoryHoists[hoistIndex].siteId : 'site_melbourne_se',
      inspectorId: payload.inspectorId,
      inspectorName: payload.inspectorName,
      inspectorRole: payload.inspectorRole || 'Technician',
      shiftDate: payload.shiftDate || todayStr,
      shiftType: payload.shiftType || 'DAILY',
      status: payload.status,
      checklistItems: payload.checklistItems,
      faultNotes: payload.faultNotes,
      faultSeverity: payload.faultSeverity || 'NONE',
      photos: payload.photos || [],
      lockoutTagoutApplied: !!payload.lockoutTagoutApplied,
      correctiveActionRequired: !!payload.correctiveActionRequired,
      managerNotes: payload.managerNotes,
      signedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    };

    const serverInspection = await durableMutation<HoistInspection>({ method: 'POST', endpoint: '/hoists/inspect', body: payload, localId: newInspection.id, collection: 'hoist-inspections', optimistic: newInspection });
    newInspection.id = serverInspection.id;
    // Update in-memory state
    if (hoistIndex >= 0) {
      memoryHoists[hoistIndex] = {
        ...memoryHoists[hoistIndex],
        lastInspectionDate: newInspection.signedAt,
        lastInspectionStatus: newInspection.status,
        lastInspectedBy: newInspection.inspectorId,
        lastInspectedByName: newInspection.inspectorName,
        status:
          payload.status === 'TAGGED_OUT'
            ? 'OUT_OF_SERVICE'
            : payload.status === 'FAULT_IDENTIFIED'
              ? 'FAULT_IDENTIFIED'
              : 'OPERATIONAL',
        lockoutTagoutActive: !!payload.lockoutTagoutApplied,
        activeFaultNotes: payload.faultNotes,
      };
    }
    memoryInspections.unshift(newInspection);
    if (hoistIndex >= 0) await cacheRecords('hoists', [memoryHoists[hoistIndex]]);

    return serverInspection;
  },

  getInspections: async (params?: {
    hoistId?: string;
    facility?: string;
    shiftDate?: string;
    limit?: number;
  }): Promise<HoistInspection[]> => {
    try {
      const searchParams = new URLSearchParams();
      if (params?.hoistId) searchParams.append('hoistId', params.hoistId);
      if (params?.facility && params.facility !== 'all')
        searchParams.append('facility', params.facility);
      if (params?.shiftDate) searchParams.append('shiftDate', params.shiftDate);
      if (params?.limit) searchParams.append('limit', String(params.limit));
      const query = searchParams.toString() ? `?${searchParams.toString()}` : '';
      const data = await apiClient.get<HoistInspection[]>(`/hoists/inspections${query}`);
      if (Array.isArray(data)) {
        return mergePendingRecords('hoist-inspections', data);
      }
    } catch {
      // Offline: restore this account's durable records.
    }

    let list = await mergePendingRecords('hoist-inspections', await getLocalRecords('hoist-inspections'));
    if (params?.hoistId) {
      list = list.filter((i) => i.hoistId === params.hoistId);
    }
    if (params?.facility && params.facility !== 'all') {
      list = list.filter((i) => i.facility === params.facility);
    }
    if (params?.shiftDate) {
      list = list.filter((i) => i.shiftDate === params.shiftDate);
    }
    if (params?.limit) {
      list = list.slice(0, params.limit);
    }
    return list;
  },

  updateHoist: async (id: string, data: Partial<Hoist>): Promise<Hoist> => {
    const current = memoryHoists.find(hoist => hoist.id === id) || (await getLocalRecords('hoists')).find(hoist => hoist.id === id);
    const updated = await durableMutation<Hoist>({ method: 'PATCH', endpoint: `/hoists/${id}`, body: data, collection: 'hoists', optimistic: { ...current, ...data, id } as Hoist });
    if (!updated?.id) throw new Error('The server did not confirm the hoist update.');
    const idx = memoryHoists.findIndex((h) => h.id === id);
    if (idx >= 0) {
      memoryHoists[idx] = { ...memoryHoists[idx], ...data, updatedAt: new Date().toISOString() };
    }
    return updated;
  },
};

