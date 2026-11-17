import { apiClient } from './client';
import { TranscribeResponse, VoiceStatusResponse } from '../types';

export const voiceApi = {
  getStatus: async (): Promise<VoiceStatusResponse> => {
    return apiClient.get<VoiceStatusResponse>('/voice-to-tech/status');
  },

  transcribeAudio: async (
    audioBase64OrUri: string,
    mimeType: string = 'audio/m4a'
  ): Promise<TranscribeResponse> => {
    try {
      const isUrl =
        audioBase64OrUri.startsWith('http://') ||
        audioBase64OrUri.startsWith('https://');

      const payload = isUrl
        ? { audioUrl: audioBase64OrUri }
        : { audioBase64: audioBase64OrUri };

      return await apiClient.post<TranscribeResponse>(
        '/voice-to-tech/transcribe',
        payload
      );
    } catch (err) {
      throw err;
    }
  },

  transcribeUrl: async (audioUrl: string): Promise<TranscribeResponse> => {
    try {
      return await apiClient.post<TranscribeResponse>(
        '/voice-to-tech/transcribe',
        { audioUrl }
      );
    } catch (err) {
      throw err;
    }
  },

  transcribeUpload: async (formData: FormData): Promise<TranscribeResponse> => {
    return apiClient.uploadFormData<TranscribeResponse>(
      '/voice-to-tech/transcribe/upload',
      formData
    );
  },
};

