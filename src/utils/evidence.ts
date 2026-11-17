import type { EvidenceItem } from '../types';

export const getEvidenceFileUri = (evidence?: EvidenceItem) =>
  evidence?.fileUri || evidence?.storageUrl || evidence?.serverUrl;
