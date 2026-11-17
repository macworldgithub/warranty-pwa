import { apiClient } from '../api/client';
import { durableMutation, getLocalRecords, mergePendingRecords } from '../../web/outbox';

export interface StartTestDrivePayload {
  repairOrder: string;
  registration: string;
  vin?: string;
  vehicleLabel?: string;
  make?: string;
  model?: string;
  year?: number;
  variant?: string;
  colour?: string;
  odometerKm?: number;
  customerName?: string;
  customerConcern?: string;
  technicianId: string;
  technicianName?: string;
  siteId?: string;
  isLiveGps?: boolean;
}

export interface TelemetryPointPayload {
  latitude: number;
  longitude: number;
  speed: number;
  timestamp?: number;
  x?: number;
  y?: number;
  isInsideFence?: boolean;
}

export interface CompleteTestDrivePayload {
  duration?: string;
  durationSeconds?: number;
  distanceKm?: number;
  maxSpeedKph?: number;
  avgSpeedKph?: number;
  outcome: 'Passed' | 'Flagged';
  technicianNotes?: string;
  routePoints?: TelemetryPointPayload[];
  geofenceAutoVerified?: boolean;
}

class RoadTestService {
  public async startDrive(payload: StartTestDrivePayload, clientId?: string): Promise<any> {
    const id = clientId || `local_road_${crypto.randomUUID()}`;
    return durableMutation({ method: 'POST', endpoint: '/test-drives/start', body: payload, localId: id, optimistic: { ...payload, id }, defer: true });
  }

  public async sendTelemetryBatch(driveId: string, points: TelemetryPointPayload[]): Promise<any> {
    return durableMutation({ method: 'POST', endpoint: `/test-drives/${driveId}/points`, body: { points }, optimistic: {}, defer: true });
  }

  public async completeDrive(driveId: string, payload: CompleteTestDrivePayload, record?: any): Promise<any> {
    return durableMutation({ method: 'POST', endpoint: `/test-drives/${driveId}/complete`, body: payload, collection: 'road-trips', optimistic: { ...record, id: driveId, ...payload }, defer: true });
  }

  public async getHistoricalDrives(params?: {
    siteId?: string;
    technicianId?: string;
    outcome?: string;
    limit?: number;
  }): Promise<any> {
    const query = new URLSearchParams();
    if (params) {
      Object.entries(params).forEach(([k, v]) => {
        if (v !== undefined && v !== null && v !== '') {
          query.set(k, String(v));
        }
      });
    }

    const qs = query.toString();
    let records: any[];
    try { const result = await apiClient.get<any>(`/test-drives${qs ? `?${qs}` : ''}`); records = Array.isArray(result) ? result : result?.items || result?.data || []; }
    catch (error: any) { if (error.statusCode) throw error; records = await getLocalRecords('road-trips'); }
    return mergePendingRecords('road-trips', records);
  }

  public async createTrip(payload: any, clientId?: string): Promise<any> {
    const id = clientId || `local_road_${crypto.randomUUID()}`;
    return durableMutation({ method: 'POST', endpoint: '/test-drives', body: payload, localId: id, collection: 'road-trips', optimistic: { ...payload, id }, defer: true });
  }

  public async updateTrip(id: string, payload: any): Promise<any> {
    return durableMutation({ method: 'PUT', endpoint: `/test-drives/${id}`, body: payload, collection: 'road-trips', optimistic: { ...(await getLocalRecords('road-trips')).find(item => item.id === id), ...payload, id }, defer: true });
  }

  public async deleteTrip(id: string): Promise<any> {
    return durableMutation({ method: 'DELETE', endpoint: `/test-drives/${id}`, collection: 'road-trips', deletedId: id, optimistic: {}, defer: true });
  }
}

export const roadTestService = new RoadTestService();
