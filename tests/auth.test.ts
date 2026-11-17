import { beforeEach, expect, it, vi } from 'vitest';
const client = vi.hoisted(() => ({ post: vi.fn(), get: vi.fn(), setToken: vi.fn() }));
vi.mock('../src/api/client', () => ({ apiClient: client }));
import { authApi } from '../src/api/auth.api';
import { voiceApi } from '../src/api/voice.api';
beforeEach(() => { vi.resetAllMocks(); client.post.mockRejectedValue(new Error('Backend unavailable')); });
it('reports a failed sign-up instead of creating a fictitious local session', async () => {
  await expect(authApi.registerTechnician({ name: 'Test', email: 'test@example.com' })).rejects.toThrow('Backend unavailable'); expect(client.setToken).not.toHaveBeenCalled();
});
it('does not report delivery of a password-reset OTP when the backend is unavailable', async () => {
  await expect(authApi.sendForgotPasswordOtp('test@example.com')).rejects.toThrow('Backend unavailable');
});
it('does not report a password reset as successful on a network failure', async () => {
  await expect(authApi.resetPassword({} as any)).rejects.toThrow('Backend unavailable');
});
it('rejects an invalid OTP verification response without a real session', async () => {
  client.post.mockResolvedValue({ message: 'OK' }); await expect(authApi.verifyRegistrationOtp({} as any)).rejects.toThrow('valid account session');
});
it('does not fabricate voice transcripts when base64 transcription fails', async () => {
  await expect(voiceApi.transcribeAudio('audio')).rejects.toThrow('Backend unavailable');
});
it('does not fabricate voice transcripts when URL transcription fails', async () => {
  await expect(voiceApi.transcribeUrl('https://example.com/audio.m4a')).rejects.toThrow('Backend unavailable');
});
