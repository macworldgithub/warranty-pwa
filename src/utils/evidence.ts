import type { EvidenceItem } from '../types';

export const getEvidenceFileUri = (evidence?: EvidenceItem) =>
  evidence?.fileUri || evidence?.storageUrl || evidence?.serverUrl;

export const allowsMultipleEvidencePhotos = (ruleKey: string) =>
  ruleKey === 'fault_closeup' || ruleKey === 'fault_location';

const evidenceFormats = {
  image: { mime: 'image/jpeg', ext: 'jpg' },
  video: { mime: 'video/mp4', ext: 'mp4' },
  document: { mime: 'application/pdf', ext: 'pdf' },
};

export const getEvidenceFormat = (mediaType: EvidenceItem['mediaType']) => mediaType === 'audio' ? evidenceFormats.image : evidenceFormats[mediaType];
