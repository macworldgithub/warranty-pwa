import { saveMedia } from './storage';
import React from 'react';
import { BrowserMultiFormatReader } from '@zxing/browser';
import { BarcodeFormat, DecodeHintType } from '@zxing/library';
export type CodeType = string;
const formats: Record<string, BarcodeFormat> = { 'code-39': BarcodeFormat.CODE_39, 'code-128': BarcodeFormat.CODE_128, 'pdf-417': BarcodeFormat.PDF_417, qr: BarcodeFormat.QR_CODE, 'data-matrix': BarcodeFormat.DATA_MATRIX };
export function useCameraDevice(position: string) { return navigator.mediaDevices ? { position } : undefined; }
export function useCodeScanner(options: any) { return options; }
function CameraView({ device, isActive, codeScanner, torch }: any) {
  const ref = React.useRef<HTMLVideoElement>(null); const scannerRef = React.useRef(codeScanner); scannerRef.current = codeScanner;
  const [error, setError] = React.useState('');
  React.useEffect(() => {
    if (!isActive || !ref.current) return; let controls: any, stopped = false; const video = ref.current;
    const hints = new Map(); hints.set(DecodeHintType.POSSIBLE_FORMATS, (scannerRef.current.codeTypes || []).map((f: string) => formats[f]).filter(f => f !== undefined));
    const reader = new BrowserMultiFormatReader(hints);
    let captured = false;
    reader.decodeFromConstraints({ video: { facingMode: device?.position === 'front' ? 'user' : { ideal: 'environment' } } }, video, async result => {
      if (!result || stopped || captured) return;
      captured = true;
      try {
        const canvas = document.createElement('canvas'); canvas.width = video.videoWidth; canvas.height = video.videoHeight;
        canvas.getContext('2d')!.drawImage(video, 0, 0);
        const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.92));
        const photoUri = blob ? await saveMedia(blob) : undefined;
        if (!stopped) scannerRef.current.onCodeScanned([{ value: result.getText(), photoUri, fileSize: blob?.size }]);
      } catch { if (!stopped) scannerRef.current.onCodeScanned([{ value: result.getText() }]); }
    }).then(c => { controls = c; if (stopped) c.stop(); }).catch(e => setError(`Camera unavailable: ${e.message}. Enter the code below.`));
    return () => { stopped = true; controls?.stop(); const stream = video.srcObject as MediaStream; stream?.getTracks().forEach(t => t.stop()); };
  }, [isActive, device?.position]);
  React.useEffect(() => { const track = (ref.current?.srcObject as MediaStream)?.getVideoTracks()[0]; if ((track?.getCapabilities() as any)?.torch) track?.applyConstraints({ advanced: [{ torch: torch === 'on' } as any] }).catch(() => {}); }, [torch]);
  return <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', background: '#0b1221' }}><video ref={ref} muted playsInline style={{ width: '100%', height: '100%', objectFit: 'cover' }} />{error && <p className="camera-error" role="status" style={{ position: 'absolute', top: 0 }}>{error}</p>}</div>;
}
export const Camera = Object.assign(CameraView, { async requestCameraPermission() { try { const s = await navigator.mediaDevices.getUserMedia({ video: true }); s.getTracks().forEach(t => t.stop()); return 'granted' as const; } catch { return 'denied' as const; } } });
