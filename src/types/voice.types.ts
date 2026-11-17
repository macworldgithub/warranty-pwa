export interface TranscribeResponse {
  transcript: string;
  confidence?: number;
  duration?: number;
  language?: string;
  source?: 'deepgram' | 'mock' | 'local' | 'fallback';
  requiresManualEntry?: boolean;
  failureReason?: 'not_configured' | 'no_speech' | 'provider_error';
}

export interface VoiceStatusResponse {
  isConfigured: boolean;
  engine: string;
  model: string;
  language: string;
}
