import { saveMedia } from './storage';
export type CameraOptions = { mediaType?: string; cameraType?: string; quality?: number; durationLimit?: number; [key: string]: any };
export type ImageLibraryOptions = CameraOptions;
export interface Asset { uri: string; fileSize: number; type: string; fileName: string; duration?: number }
export interface PickerResult { assets?: Asset[]; didCancel?: boolean; errorCode?: string; errorMessage?: string }

async function assetFromBlob(blob: Blob, name: string): Promise<Asset> {
  if (!blob.size) throw new Error('The captured file is empty. Please try again.');
  if (blob.type.startsWith('image/') && blob.size > 10 * 1024 * 1024) throw new Error('Photo exceeds the 10 MB evidence limit.');
  const uri = await saveMedia(blob);
  const asset: Asset = { uri, fileSize: blob.size, type: blob.type, fileName: name };
  if (blob.type.startsWith('video/')) {
    asset.duration = await new Promise<number>((resolve, reject) => {
      const video = document.createElement('video'); video.preload = 'metadata'; video.src = uri;
      video.onloadedmetadata = () => { resolve(Number.isFinite(video.duration) ? video.duration : 0); video.removeAttribute('src'); video.load(); };
      video.onerror = () => reject(new Error('This video format cannot be read by your browser.'));
    });
    if (asset.duration > 60) throw new Error('Video exceeds the 60 second evidence limit.');
  }
  return asset;
}
export function launchImageLibrary(options: ImageLibraryOptions = {}): Promise<PickerResult> {
  return new Promise(resolve => {
    const input = document.createElement('input'); input.type = 'file'; input.accept = options.mediaType === 'video' ? 'video/*' : 'image/*'; input.style.display = 'none'; document.body.append(input);
    let settled = false;
    const finish = (result: PickerResult) => { if (settled) return; settled = true; input.remove(); resolve(result); };
    input.oncancel = () => finish({ didCancel: true });
    input.onchange = async () => {
      const file = input.files?.[0]; if (!file) { finish({ didCancel: true }); return; }
      try {
        if (!file.type.startsWith(options.mediaType === 'video' ? 'video/' : 'image/')) throw new Error('Please select a matching photo or video file.');
        finish({ assets: [await assetFromBlob(file, file.name)] });
      } catch (error: any) { finish({ errorCode: 'invalid_file', errorMessage: error.message }); }
    };
    input.click();
  });
}
export async function launchCamera(options: CameraOptions = {}): Promise<PickerResult> {
  if (!navigator.mediaDevices?.getUserMedia) return { errorCode: 'camera_unavailable', errorMessage: 'Camera access requires HTTPS or localhost. You can import a file from your device.' };
  return new Promise(resolve => {
    const overlay = document.createElement('div'); overlay.className = 'dialog-overlay'; overlay.style.padding = '0'; overlay.style.zIndex = '110000';
    const panel = document.createElement('section');
    Object.assign(panel.style, { width: '100%', height: '100%', display: 'flex', flexDirection: 'column', background: '#0b1221', color: '#fff' });
    panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-modal', 'true'); panel.setAttribute('aria-label', 'Evidence camera');
    const title = document.createElement('div'); title.textContent = options.mediaType === 'video' ? 'Record video evidence' : 'Capture evidence'; Object.assign(title.style, { padding: '20px', fontWeight: '700', textAlign: 'center' });
    const stage = document.createElement('div'); stage.className = 'camera-stage';
    const video = document.createElement('video'); video.autoplay = true; video.muted = true; video.playsInline = true;
    const frame = document.createElement('div'); frame.className = 'camera-frame';
    const status = document.createElement('div'); status.className = 'camera-tip'; status.textContent = 'Position the subject clearly within the guide'; stage.append(video, frame, status);
    const bar = document.createElement('div'); Object.assign(bar.style, { display: 'flex', gap: '16px', padding: '24px', paddingBottom: 'max(24px, env(safe-area-inset-bottom))', justifyContent: 'center' });
    const makeButton = (label: string) => { const b = document.createElement('button'); b.textContent = label; Object.assign(b.style, { background: '#fff', color: '#0f172a', padding: '14px 20px', border: 'none', borderRadius: '24px', cursor: 'pointer' }); return b; };
    const cancel = makeButton('Cancel'), capture = makeButton(options.mediaType === 'video' ? 'Start recording' : 'Take photo'), torch = makeButton('Flash'); capture.disabled = true; capture.style.background = '#d71920'; capture.style.color = 'white';
    bar.append(cancel, capture, torch); panel.append(title, stage, bar); overlay.append(panel); document.body.append(overlay); cancel.focus();
    let stream: MediaStream | undefined, recorder: MediaRecorder | undefined, timer: ReturnType<typeof setTimeout> | undefined;
    let started = 0, done = false, flash = false;
    const finish = (result: PickerResult) => { if (done) return; done = true; clearTimeout(timer); if (recorder?.state === 'recording') recorder.stop(); stream?.getTracks().forEach(t => t.stop()); overlay.remove(); document.removeEventListener('keydown', keydown); resolve(result); };
    const keydown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') finish({ didCancel: true });
      if (e.key === 'Tab') { const buttons = [cancel, capture, torch].filter(b => !b.disabled && !b.hidden); const i = buttons.indexOf(document.activeElement as HTMLButtonElement); e.preventDefault(); buttons[(i + (e.shiftKey ? -1 : 1) + buttons.length) % buttons.length]?.focus(); }
    };
    document.addEventListener('keydown', keydown); cancel.onclick = () => finish({ didCancel: true });
    torch.onclick = async () => { try { flash = !flash; await stream?.getVideoTracks()[0]?.applyConstraints({ advanced: [{ torch: flash } as any] }); torch.textContent = flash ? 'Flash on' : 'Flash'; } catch { status.textContent = 'Flash is unavailable on this camera.'; } };
    capture.onclick = async () => {
      try {
        if (options.mediaType === 'video') {
          if (recorder?.state === 'recording') { recorder.stop(); return; }
          const mimeType = ['video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm'].find(type => MediaRecorder.isTypeSupported(type)); recorder = new MediaRecorder(stream!, mimeType ? { mimeType } : undefined);
          const chunks: Blob[] = []; recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
          recorder.onstop = async () => {
            if (done) return; capture.disabled = true;
            try { const blob = new Blob(chunks, { type: recorder!.mimeType }); const uri = await saveMedia(blob); finish({ assets: [{ uri, fileSize: blob.size, type: blob.type, fileName: blob.type.includes('mp4') ? 'evidence.mp4' : 'evidence.webm', duration: (Date.now() - started) / 1000 }] }); }
            catch (error: any) { finish({ errorCode: 'capture_failed', errorMessage: error.message }); }
          };
          recorder.onerror = () => finish({ errorCode: 'recording_failed', errorMessage: 'Video recording failed. Please try again.' });
          started = Date.now(); recorder.start(); capture.textContent = 'Stop recording'; status.textContent = 'Recording — maximum 60 seconds'; timer = setTimeout(() => { if (recorder?.state === 'recording') recorder.stop(); }, (options.durationLimit || 60) * 1000);
        } else {
          capture.disabled = true; const canvas = document.createElement('canvas'); canvas.width = video.videoWidth; canvas.height = video.videoHeight;
          if (!canvas.width) throw new Error('Camera is still starting. Please try again.'); canvas.getContext('2d')!.drawImage(video, 0, 0);
          const blob = await new Promise<Blob>((res, reject) => canvas.toBlob(b => b ? res(b) : reject(new Error('Photo capture failed.')), 'image/jpeg', options.quality || 0.9)); finish({ assets: [await assetFromBlob(blob, 'evidence.jpg')] });
        }
      } catch (error: any) { status.textContent = error.message; capture.disabled = false; }
    };
    navigator.mediaDevices.getUserMedia({ video: { facingMode: options.cameraType === 'front' ? 'user' : { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: options.mediaType === 'video' }).then(async s => {
      if (done) { s.getTracks().forEach(t => t.stop()); return; } stream = s; video.srcObject = s; await video.play(); capture.disabled = false; torch.hidden = !(s.getVideoTracks()[0].getCapabilities() as any)?.torch;
    }).catch(error => { status.textContent = `Camera unavailable: ${error.message}. Close this window and import from gallery instead.`; torch.hidden = true; });
  });
}
