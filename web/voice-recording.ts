import { voiceApi } from '../src/api/voice.api';
import { readMedia, saveMedia } from './storage';

class VoiceRecordingService {
  private attempt?: symbol;
  private recording?: {
    recorder: MediaRecorder;
    stream: MediaStream;
    chunks: Blob[];
    started: number;
    timer: ReturnType<typeof setInterval>;
  };

  async startRecording(onProgress: (seconds: number) => void) {
    if (this.attempt) throw new Error('A recording is already in progress.');
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      throw new Error('Microphone recording requires HTTPS and a browser that supports audio recording.');
    }

    const attempt = Symbol();
    this.attempt = attempt;
    let stream: MediaStream | undefined;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (this.attempt !== attempt) {
        stream.getTracks().forEach(track => track.stop());
        return false;
      }
      const mimeType = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/ogg;codecs=opus']
        .find(type => MediaRecorder.isTypeSupported(type));
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      const chunks: Blob[] = [];
      recorder.ondataavailable = ({ data }) => { if (data.size) chunks.push(data); };
      recorder.start();
      const started = performance.now();
      const timer = setInterval(() => onProgress(Math.floor((performance.now() - started) / 1000)), 250);
      this.recording = { recorder, stream, chunks, started, timer };
      return true;
    } catch (error) {
      stream?.getTracks().forEach(track => track.stop());
      if (this.attempt !== attempt) return false;
      this.attempt = undefined;
      if (error instanceof DOMException && error.name === 'NotAllowedError') {
        throw new Error('Microphone access was denied. Allow it in your browser settings and try again.');
      }
      if (error instanceof DOMException && error.name === 'NotFoundError') {
        throw new Error('No microphone was found. Connect a microphone and try again.');
      }
      if (error instanceof DOMException && error.name === 'NotReadableError') {
        throw new Error('The microphone is unavailable. Close other apps using it and try again.');
      }
      throw error;
    }
  }

  private releaseRecording() {
    const recording = this.recording;
    this.attempt = undefined;
    this.recording = undefined;
    if (recording) {
      clearInterval(recording.timer);
      recording.stream.getTracks().forEach(track => track.stop());
    }
  }

  async stopRecording() {
    const recording = this.recording;
    if (!recording) throw new Error('Start a recording first.');
    const { recorder, chunks, started } = recording;
    const durationSeconds = (performance.now() - started) / 1000;
    clearInterval(recording.timer);
    try {
      if (recorder.state !== 'inactive') {
        await new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => reject(new Error('The browser did not finish recording. Please try again.')), 5000);
          recorder.onstop = () => { clearTimeout(timeout); resolve(); };
          recorder.onerror = () => { clearTimeout(timeout); reject(new Error('Audio recording failed. Please try again.')); };
          try {
            recorder.stop();
          } catch (error) {
            clearTimeout(timeout);
            reject(error);
          }
        });
      }
    } finally {
      if (this.recording === recording) this.releaseRecording();
    }
    const type = (chunks[0]?.type || recorder.mimeType).split(';')[0];
    const blob = new Blob(chunks, { type });
    if (!blob.size || durationSeconds < 0.2) {
      throw new Error('The recording was too short. Speak after Listening appears, then tap Stop.');
    }
    return { audioUri: await saveMedia(blob), durationSeconds };
  }

  async transcribe(audioUri: string) {
    const blob = await readMedia(audioUri);
    const type = blob.type.split(';')[0];
    const extension = type.includes('mp4') ? 'm4a' : type.includes('ogg') ? 'ogg' : 'webm';
    const form = new FormData();
    form.append('audio', blob, `tech_note.${extension}`);
    const result = await voiceApi.transcribeUpload(form);
    const transcript = result?.transcript?.trim();
    if (transcript) return transcript;
    if (result?.failureReason === 'not_configured') throw new Error('Voice transcription is not configured on the server.');
    if (result?.failureReason === 'provider_error') throw new Error('The transcription provider could not process the audio. Try again.');
    if (result?.failureReason === 'no_speech' || !result?.requiresManualEntry) {
      throw new Error('No speech was recognized. Play the recording to check it.');
    }
    throw new Error('Transcription is unavailable. Retry or type the note below.');
  }

  cancelRecording() {
    const recorder = this.recording?.recorder;
    try {
      if (recorder && recorder.state !== 'inactive') recorder.stop();
    } finally {
      this.releaseRecording();
    }
  }
}

export const voiceRecordingService = new VoiceRecordingService();
