import { apiClient } from './client';
import { DecodeRegoResponse, DecodeVinResponse, RegistrationState } from '../types';

export const vehicleApi = {
  decodeVin: async (vin: string): Promise<DecodeVinResponse> => {
    return apiClient.post<DecodeVinResponse>('/vehicle/decode-vin', { vin });
  },
  decodeRego: async (rego: string, state: RegistrationState): Promise<DecodeRegoResponse> => {
    return apiClient.post<DecodeRegoResponse>('/vehicle/decode-rego', { rego, state });
  },
};
