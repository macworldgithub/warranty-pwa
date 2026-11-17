import type { WarrantyCase, CreateWarrantyCaseDto } from '../src/types';
import type { VehicleZoneInspection } from '../src/services/offlineStorage';
import { appendMedia, isLocalMedia, serializeMedia } from './storage';

export interface ReplayApi {
  createCase(dto: any): Promise<any>;
  updateCase(id: string, dto: any): Promise<any>;
  uploadEvidenceFile(id: string, form: FormData): Promise<any>;
  addEvidence(id: string, dto: any): Promise<any>;
  submitFromWorkshop(id: string, dto: any): Promise<any>;
  getCases(dto: any): Promise<any[]>;
  addVoiceNotes(id: string, notes: any[]): Promise<any>;
}
export function caseFields(item: Partial<WarrantyCase>): Partial<CreateWarrantyCaseDto> {
  const keys = ['siteId', 'siteName', 'brandId', 'brandName', 'brandPackId', 'brandPackVersion', 'roNumber', 'claimNumber', 'vin', 'odometer', 'make', 'model', 'year', 'powertrain', 'concernTitle', 'faultCategory', 'partReplaced', 'oldPartSerial', 'newPartSerial', 'noiseFault', 'diagnosticsAvailable', 'repairStage', 'technicianId', 'technicianName'];
  return Object.fromEntries(keys.filter(key => item[key] !== undefined).map(key => [key, item[key]]));
}
export async function evidenceForm(item: any, roNumber?: string) {
  const form = new FormData();
  const descriptor = item.ruleKey.split('_').map((word: string) => word.charAt(0).toUpperCase() + word.slice(1)).join('');
  await appendMedia(form, 'file', { uri: item.fileUri, type: item.mediaType === 'video' ? 'video/mp4' : 'image/jpeg', name: `${(roNumber || 'RO').replace(/[^a-zA-Z0-9]/g, '')}${descriptor}.${item.mediaType === 'video' ? 'mp4' : 'jpg'}` });
  form.append('ruleKey', item.ruleKey);
  form.append('evidenceName', item.ruleName || item.ruleKey);
  if (item.ocrExtractedText) form.append('ocrExtractedText', item.ocrExtractedText);
  return form;
}
// The page and service worker use exactly the same replay sequence. Checkpoints
// preserve server IDs and uploaded evidence when a later request is interrupted.
export async function replayCase(item: WarrantyCase, api: ReplayApi, checkpoint: (oldId?: string) => Promise<void>, isCurrent = async () => true) {
  const requireSession = async () => { if (!(await isCurrent())) throw new Error('Session changed. Sign in to continue synchronization.'); };
  await requireSession();
  const dto = { ...caseFields(item), voiceNotes: await serializeMedia(item.voiceNotes || []) };
  if (/^(CASE-|local_|draft_)/.test(item.id)) {
    const created = await api.createCase({ ...dto, evidenceItems: [] });
    if (!created?.id) throw new Error('Server did not return a case ID.');
    const oldId = item.id; item.id = created.id;
    await checkpoint(oldId);
  } else {
    // Never clear evidence when replaying field edits to an existing case.
    await api.updateCase(item.id, dto);
  }
  for (const evidence of item.evidenceItems || []) {
    if (evidence.isUploaded) continue;
    await requireSession();
    if (isLocalMedia(evidence.fileUri)) {
      await api.uploadEvidenceFile(item.id, await evidenceForm(evidence, item.roNumber));
    } else if (evidence.storageUrl && !isLocalMedia(evidence.storageUrl)) {
      await api.addEvidence(item.id, { ...evidence, name: evidence.ruleName || evidence.ruleKey });
    } else continue;
    evidence.isUploaded = true;
    await checkpoint();
  }
  await requireSession();
  return api.submitFromWorkshop(item.id, { checklistSummary: { isReadyForSubmission: true } });
}

export async function replayInspection(inspection: VehicleZoneInspection & { serverCaseId?: string }, api: ReplayApi, checkpoint: () => Promise<void>, isCurrent = async () => true) {
  const requireSession = async () => { if (!(await isCurrent())) throw new Error('Session changed.'); };
  await requireSession();
  if (!inspection.serverCaseId) {
    const cases = await api.getCases({ vin: inspection.vin, limit: 1 });
    let id = cases[0]?.id;
    if (!id) id = (await api.createCase({ ...inspection.vehicleDetails, vin: inspection.vin, roNumber: inspection.roNumber || 'RO', brandId: inspection.brandId, siteId: inspection.siteId, brandPackId: inspection.brandPackId, brandPackVersion: inspection.brandPackVersion, concernTitle: 'Manufacturer vehicle inspection', faultCategory: 'Condition Inspection', evidenceItems: [] })).id;
    if (!id) throw new Error('Server did not return an inspection case ID.');
    inspection.serverCaseId = id; await checkpoint();
  }
  for (const evidence of inspection.evidenceItems.filter(item => isLocalMedia(item.fileUri) && !item.isUploaded)) {
    await requireSession();
    const uploaded = await api.uploadEvidenceFile(inspection.serverCaseId, await evidenceForm(evidence, inspection.roNumber));
    evidence.storageUrl = uploaded?.url || uploaded?.storageUrl || uploaded?.evidenceItems?.find((item: any) => item.ruleKey === evidence.ruleKey)?.storageUrl;
    evidence.isUploaded = true; await checkpoint();
  }
  if (inspection.voiceNotes?.length && !inspection.voiceNotesSynced) {
    await requireSession();
    await api.addVoiceNotes(inspection.serverCaseId, await serializeMedia(inspection.voiceNotes));
    inspection.voiceNotesSynced = true; await checkpoint();
  }
}
