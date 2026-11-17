import { resolveMedia } from './storage';
let workerPromise: Promise<any> | undefined;
export async function recognizeEvidence(uri: string, ruleKey: string): Promise<string | undefined> {
  if (!/vin|odo/i.test(ruleKey)) return undefined;
  try {
    const { createWorker, OEM } = await import('tesseract.js');
    const base = `${import.meta.env.BASE_URL}ocr`;
    workerPromise ||= createWorker('eng', OEM.LSTM_ONLY, { workerPath: `${base}/worker.min.js`, corePath: base, langPath: base, workerBlobURL: false });
    const result = await (await workerPromise).recognize(resolveMedia(uri)); return result.data.text?.trim() || undefined;
  } catch (error) { console.warn('OCR unavailable. Enter or verify the VIN/odometer manually.', error); workerPromise = undefined; return undefined; }
}
