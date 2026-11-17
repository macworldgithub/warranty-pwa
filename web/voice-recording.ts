import { voiceApi } from '../src/api/voice.api';
import { saveMedia } from './storage';
class VoiceRecordingService {
  private recorder?: MediaRecorder; private stream?: MediaStream; private timer?: ReturnType<typeof setInterval>; private chunks: Blob[] = []; private started = 0;
  async requestPermissions() { return !!navigator.mediaDevices?.getUserMedia; }
  async startRecording(onProgress?: (seconds: number) => void): Promise<boolean> {
    if (this.recorder?.state === 'recording') throw new Error('A recording is already in progress.');
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) throw new Error('Microphone recording requires HTTPS and a browser with audio recording support.');
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: true }); const mimeType = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm', 'audio/ogg'].find(t => MediaRecorder.isTypeSupported(t));
      this.recorder = new MediaRecorder(this.stream, mimeType ? { mimeType } : undefined); this.chunks = []; this.started = Date.now(); this.recorder.ondataavailable = e => { if (e.data.size) this.chunks.push(e.data); }; this.recorder.start(); this.timer = setInterval(() => onProgress?.(Math.floor((Date.now() - this.started) / 1000)), 200); return true;
    } catch (error) { this.release(); throw error; }
  }
  private release() { clearInterval(this.timer); this.stream?.getTracks().forEach(t => t.stop()); }
  async stopAndTranscribe(): Promise<{ transcript: string; durationSeconds: number; audioUri: string }> {
    if (this.recorder?.state !== 'recording') throw new Error('Not currently recording.'); const durationSeconds = (Date.now() - this.started) / 1000; const recorder = this.recorder;
    try { await new Promise<void>((resolve, reject) => { recorder.onstop = () => resolve(); recorder.onerror = () => reject(new Error('Audio recording failed.')); recorder.stop(); }); } finally { this.release(); }
    const blob = new Blob(this.chunks, { type: recorder.mimeType }); const audioUri = await saveMedia(blob);
    const form = new FormData(); form.append('audio', blob, `tech_note.${blob.type.includes('mp4') ? 'm4a' : blob.type.includes('ogg') ? 'ogg' : 'webm'}`);
    const result = await voiceApi.transcribeUpload(form);
    if (!result?.transcript?.trim()) throw new Error('No speech was recognized. Please retry or enter notes manually.');
    return { transcript: result.transcript.trim(), durationSeconds, audioUri };
  }
  async cancelRecording() { if (this.recorder?.state === 'recording') this.recorder.stop(); this.release(); }
}
export const voiceRecordingService = new VoiceRecordingService();
