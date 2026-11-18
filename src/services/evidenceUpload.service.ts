import { hasVehiclePhoto } from './vehiclePhotos';
import { apiClient } from '../api/client';
import { appendMedia, isLocalMedia, persist } from '../../web/storage';
import { casesApi } from '../api/cases.api';
import { EvidenceItem, WarrantyCase } from '../types';
import { offlineStorage } from './offlineStorage';

export const evidenceUploadService = {
  /**
   * Uploads an evidence photo/video to the backend server (/uploads folder)
   * and saves the evidence item in MongoDB on the warranty case document.
   */
  uploadEvidenceToServer: async (params: {
    vin: string;
    roNumber?: string;
    evidenceItem: EvidenceItem;
    caseId?: string;
    technicianId?: string;
    technicianName?: string;
    brandId?: string;
    siteId?: string;
    brandPackId?: string;
    brandPackVersion?: number;
    vehicleDetails?: {
      make?: string;
      model?: string;
      year?: number;
      powertrain?: string;
      odometer?: number;
    };
  }): Promise<{ success: boolean; storageUrl?: string; caseItem?: WarrantyCase }> => {
    const { vin, roNumber, evidenceItem, vehicleDetails } = params;
    const cleanVin = (vin || '').toUpperCase();
    const token = apiClient.getToken();
    const owner = sessionStorage.getItem('booran-user');
    const checkSession = () => { if (apiClient.getToken() !== token || sessionStorage.getItem('booran-user') !== owner) throw new Error('Session changed.'); };

    try {
      // 1. Resolve target case in MongoDB
      let targetCaseId = params.caseId;
      if (!targetCaseId && cleanVin) {
        try {
          const cases = await (checkSession(), casesApi).getCases({ vin: cleanVin, limit: 1 });
          if (cases && cases.length > 0 && cases[0].id) {
            targetCaseId = cases[0].id;
          }
        } catch (e) {
          console.warn('[EvidenceUpload] Failed finding existing case by VIN:', e);
        }
      }

      // If no case exists yet for this vehicle in MongoDB, create one:
      if (!targetCaseId && cleanVin) {
        try {
          const created = await casesApi.createCase({
            brandId: params.brandId,
            siteId: params.siteId,
            brandPackId: params.brandPackId,
            brandPackVersion: params.brandPackVersion,
            vin: cleanVin,
            roNumber: roNumber || '180001',
            make: vehicleDetails?.make || 'BYD',
            model: vehicleDetails?.model || 'Vehicle',
            year: vehicleDetails?.year || 2024,
            powertrain: (vehicleDetails?.powertrain as any) || 'EV',
            concernTitle: `${vehicleDetails?.make || 'BYD'} ${vehicleDetails?.model || ''} Condition Inspection`,
            faultCategory: 'General / other (Tier 1 only)',
            odometer: vehicleDetails?.odometer ?? 0,
            technicianId: params.technicianId || '',
            technicianName: params.technicianName || '',
            partReplaced: false,
            noiseFault: false,
            diagnosticsAvailable: false,
            repairStage: 'Pre-repair only',
          } as any);
          targetCaseId = created.id;
        } catch (createErr) {
          console.warn('[EvidenceUpload] Failed auto-creating case in MongoDB:', createErr);
        }
      }

      if (!targetCaseId) {
        return { success: false };
      }

      // 2. Prepare FormData for file upload to /uploads folder
      let uploadedCase: WarrantyCase | null = null;
      let serverStorageUrl: string | undefined;

      if (evidenceItem.fileUri) {
        try {
          const formData = new FormData();
          const ext = evidenceItem.mediaType === 'video' ? 'mp4' : 'jpg';
          const mime = evidenceItem.mediaType === 'video' ? 'video/mp4' : 'image/jpeg';
          const cleanRo = (roNumber || 'RO').replace(/[^a-zA-Z0-9]/g, '');
          const descriptor = evidenceItem.ruleKey
            .split('_')
            .map((w: string) => w.charAt(0).toUpperCase() + w.slice(1))
            .join('');
          const oemFileName = `${cleanRo}${descriptor}.${ext}`;

          await appendMedia(formData, 'file', {
            uri: evidenceItem.fileUri,
            type: mime,
            name: oemFileName,
          } as any);
          formData.append('ruleKey', evidenceItem.ruleKey);
          formData.append('evidenceName', evidenceItem.ruleName || evidenceItem.ruleKey);
          if (evidenceItem.ocrExtractedText) {
            formData.append('ocrExtractedText', evidenceItem.ocrExtractedText);
          }

          uploadedCase = (await casesApi.uploadEvidenceFile(targetCaseId, formData)) as any;
          const found = uploadedCase?.evidenceItems?.find((e) => e.ruleKey === evidenceItem.ruleKey);
          serverStorageUrl = found?.storageUrl || (uploadedCase as any)?.url || (uploadedCase as any)?.storageUrl;
        } catch (uploadErr) {
          console.warn('[EvidenceUpload] uploadEvidenceFile failed, falling back to addEvidence:', uploadErr);
        }
      }

      // 3. Fallback: If binary upload failed or fileUri not accessible, save evidence record directly in MongoDB
      if (!serverStorageUrl && !isLocalMedia(evidenceItem.fileUri)) {
        try {
          const fallbackRes = await casesApi.addEvidence(targetCaseId, {
            ruleKey: evidenceItem.ruleKey,
            name: evidenceItem.ruleName || evidenceItem.ruleKey,
            mediaType: evidenceItem.mediaType || 'image',
            storageUrl: evidenceItem.storageUrl || evidenceItem.fileUri || '',
            ocrExtractedText: evidenceItem.ocrExtractedText,
            ocrConfidence: evidenceItem.ocrConfidence,
            durationSeconds: evidenceItem.durationSeconds,
          });
          uploadedCase = fallbackRes;
          const found = fallbackRes?.evidenceItems?.find((e) => e.ruleKey === evidenceItem.ruleKey);
          serverStorageUrl = found?.storageUrl || evidenceItem.storageUrl || evidenceItem.fileUri;
        } catch (addErr) {
          console.warn('[EvidenceUpload] addEvidence fallback failed:', addErr);
        }
      }

      if (!hasVehiclePhoto({ ruleKey: evidenceItem.ruleKey, mediaType: 'image', storageUrl: serverStorageUrl }, true)) return { success: false };

      // 4. Update local offlineStorage with server URL if available
      checkSession();
      if (serverStorageUrl && cleanVin) {
        const updatedItem = {
          ...evidenceItem,
          storageUrl: serverStorageUrl,
          isUploaded: true,
        };
        offlineStorage.recordZoneCapture(cleanVin, evidenceItem.ruleKey, updatedItem);
      }

      return {
        success: !!serverStorageUrl,
        storageUrl: serverStorageUrl,
        caseItem: uploadedCase || undefined,
      };
    } catch (err) {
      console.warn('[EvidenceUpload] Unexpected upload error:', err);
      return { success: false };
    }
  },
};
