import { apiClient } from '../api/client';

export interface PingTelemetryDto {
  technicianId: string;
  technicianName?: string;
  siteId?: string;
  latitude: number;
  longitude: number;
  accuracy?: number;
  speedKmh?: number;
  currentActivity?: 'INSPECTION' | 'ROAD_TEST' | 'WORKSHOP' | 'IDLE';
  activeCaseId?: string;
  activeRoNumber?: string;
}

export interface GeofencePingResponse {
  status: 'ON_SITE' | 'OFF_SITE';
  insideGeofence: boolean;
  distanceMeters: number;
  siteId: string;
  siteName: string;
  radiusMeters: number;
  presence: {
    technicianId: string;
    technicianName: string;
    siteId: string;
    siteName: string;
    status: 'ON_SITE' | 'OFF_SITE';
    distanceMeters: number;
    currentActivity: string;
    speedKmh: number;
    lastPingAt: string;
  };
}

class MobileGeofenceService {
  public async ping(dto: PingTelemetryDto): Promise<GeofencePingResponse> {
    return apiClient.request<GeofencePingResponse>('/geofence/ping', {
      method: 'POST',
      body: JSON.stringify(dto),
    });
  }

  public async getSiteRoster(siteId: string) {
    return apiClient.request(`/geofence/roster/${siteId}`, { method: 'GET' });
  }

  public async updateSiteRadius(siteId: string, radiusMeters: number) {
    return apiClient.request(`/sites/${siteId}`, {
      method: 'PATCH',
      body: JSON.stringify({ geofenceRadiusMeters: radiusMeters }),
    });
  }
}

export const mobileGeofenceService = new MobileGeofenceService();
