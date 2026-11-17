import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { voiceRecordingService } from '../web/voice-recording';

const mocks = vi.hoisted(() => ({
  saveMedia: vi.fn(),
  readMedia: vi.fn(),
  transcribeUpload: vi.fn(),
}));
vi.mock('../web/storage', () => ({ saveMedia: mocks.saveMedia, readMedia: mocks.readMedia }));
vi.mock('../src/api/voice.api', () => ({ voiceApi: { transcribeUpload: mocks.transcribeUpload } }));

const stopTrack = vi.fn();
const stream = { getTracks: () => [{ stop: stopTrack }] };
const getUserMedia = vi.fn();
let supportedType = 'audio/webm;codecs=opus';

class Recorder {
  static isTypeSupported(type: string) { return type === supportedType; }
  state = 'inactive';
  mimeType = supportedType;
  ondataavailable?: (event: { data: Blob }) => void;
  onstop?: () => void;

  start() { this.state = 'recording'; }
  stop() {
    this.state = 'inactive';
    this.ondataavailable?.({ data: new Blob(['recording'], { type: this.mimeType }) });
    this.onstop?.();
  }
}

beforeEach(() => {
  vi.resetAllMocks();
  supportedType = 'audio/webm;codecs=opus';
  vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } });
  vi.stubGlobal('window', { MediaRecorder: Recorder });
  vi.stubGlobal('MediaRecorder', Recorder);
  getUserMedia.mockResolvedValue(stream);
  mocks.saveMedia.mockResolvedValue('blob:test-audio');
});

afterEach(() => {
  voiceRecordingService.cancelRecording();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it('keeps permission pending until the user grants it and releases a late stream after cancellation', async () => {
  let grant!: (value: typeof stream) => void;
  getUserMedia.mockReturnValue(new Promise(resolve => { grant = resolve; }));
  const opening = voiceRecordingService.startRecording(vi.fn());
  voiceRecordingService.cancelRecording();
  grant(stream);
  await expect(opening).resolves.toBe(false);
  expect(stopTrack).toHaveBeenCalledOnce();
});

it('explains how to recover from denied microphone permission', async () => {
  getUserMedia.mockRejectedValue(new DOMException('Denied', 'NotAllowedError'));
  await expect(voiceRecordingService.startRecording(vi.fn())).rejects.toThrow('Allow it in your browser settings');
});

it.each([
  ['audio/webm;codecs=opus', 'audio/webm', 'tech_note.webm'],
  ['audio/mp4', 'audio/mp4', 'tech_note.m4a'],
])('saves and retries the same %s recording as multipart audio', async (recordedType, mimeType, filename) => {
  supportedType = recordedType;
  vi.spyOn(performance, 'now').mockReturnValueOnce(0).mockReturnValue(1000);
  await voiceRecordingService.startRecording(vi.fn());
  const recording = await voiceRecordingService.stopRecording();
  const blob = mocks.saveMedia.mock.calls[0][0];
  expect(blob.type).toBe(mimeType);
  expect(stopTrack).toHaveBeenCalledOnce();
  mocks.readMedia.mockResolvedValue(blob);
  mocks.transcribeUpload.mockResolvedValueOnce({ transcript: '', requiresManualEntry: true, failureReason: 'provider_error' })
    .mockResolvedValueOnce({ transcript: '  Checked the cooling circuit. ' });
  await expect(voiceRecordingService.transcribe(recording.audioUri)).rejects.toThrow('transcription provider');
  await expect(voiceRecordingService.transcribe(recording.audioUri)).resolves.toBe('Checked the cooling circuit.');
  for (const [form] of mocks.transcribeUpload.mock.calls) {
    expect(form.get('audio')).toMatchObject({ type: mimeType, name: filename, size: blob.size });
  }
});
