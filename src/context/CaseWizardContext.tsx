import { allowsMultipleEvidencePhotos, getEvidenceFileUri, getEvidenceFormat } from '../utils/evidence';
import { missingVehiclePhotos } from '../services/vehiclePhotos';
import { apiClient } from '../api/client';
import { appendMedia, isLocalMedia, persist, serializeMedia } from '../../web/storage';
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import {
  WarrantyCase,
  BrandPack,
  BrandPackRule,
  EvidenceItem,
  VoiceNote,
  PowertrainType,
  RepairStage,
  Site,
  Brand,
} from '../types';
import { brandPacksApi } from '../api/brandPacks.api';
import { vehicleApi } from '../api/vehicle.api';
import { casesApi } from '../api/cases.api';
import { sitesApi } from '../api/sites.api';
import { qualityGates } from '../services/qualityGates';
import { namingEngine } from '../services/namingEngine';
import { offlineStorage } from '../services/offlineStorage';
import { assignedWarrantySiteIds } from '../services/warrantyRooftops';
import { useAuth } from './AuthContext';
import { ENV } from '../config/env';

interface CaseWizardState {
  currentStep: number; // 0 to 6
  caseId: string | null;
  localDraftId: string | null;

  // Step 0 - Start Ticket
  siteId: string;
  siteName: string;
  isSiteLocked: boolean;
  brandId: string;
  brandName: string;
  roNumber: string;
  claimNumber: string;

  // Step 1 - Vehicle ID
  vin: string;
  odometer: number | null;
  make: string;
  model: string;
  year: number | null;
  powertrain: PowertrainType;
  isVinDecoded: boolean;
  isVinDecoding: boolean;

  // Step 2 - Fault & Concern
  concernTitle: string;
  faultCategory: string;
  partReplaced: boolean;
  oldPartSerial: string;
  newPartSerial: string;
  noiseFault: boolean;
  diagnosticsAvailable: boolean;
  repairStage: RepairStage;

  // Dynamic Brand Pack & Rules
  activeBrandPack: BrandPack | null;
  resolvedRules: BrandPackRule[];
  isLoadingRules: boolean;

  // Evidence & Notes
  evidenceItems: EvidenceItem[];
  voiceNotes: VoiceNote[];

  // Quality Gates / Readiness
  isReadyForSubmission: boolean;
  mandatoryCount: number;
  completedMandatoryCount: number;
  missingRules: BrandPackRule[];

  // Flag Resolution mode
  isFlaggedMode: boolean;
  flaggedRuleKeys: string[];
}

interface CaseWizardContextType extends CaseWizardState {
  setStep: (step: number) => void;
  nextStep: () => void;
  prevStep: () => void;

  // Step 0 Setters
  setSite: (site: Site) => void;
  setBrand: (brand: Brand) => void;
  setRoNumber: (ro: string) => void;
  setClaimNumber: (claim: string) => void;

  // Step 1 Vehicle Setters & Actions
  setVin: (vin: string) => void;
  setOdometer: (odo: number | null) => void;
  setVehicleInfo: (info: { make?: string; model?: string; year?: number | null; powertrain?: PowertrainType }) => void;
  decodeVinNow: (vinToDecode?: string) => Promise<void>;

  // Step 2 Fault Setters
  setConcernTitle: (title: string) => void;
  setFaultCategory: (category: string) => void;
  setPartReplaced: (replaced: boolean) => void;
  setOldPartSerial: (serial: string) => void;
  setNewPartSerial: (serial: string) => void;
  setNoiseFault: (noise: boolean) => void;
  setDiagnosticsAvailable: (diag: boolean) => void;
  setRepairStage: (stage: RepairStage) => void;

  // Evidence & Notes Actions
  saveEvidenceItem: (item: Partial<EvidenceItem> & { ruleKey: string }) => void;
  removeEvidenceItem: (ruleKey: string, evidenceId?: string) => void;
  getEvidenceForRule: (ruleKey: string) => EvidenceItem | undefined;
  addVoiceNote: (note: VoiceNote) => void;
  removeVoiceNote: (noteId: string) => void;

  // Dynamic Rule Evaluation
  evaluateRules: () => Promise<void>;

  // Case Lifecycle
  startNewCase: (initialData?: Partial<CaseWizardState>) => void;
  loadExistingCase: (caseItem: WarrantyCase, flaggedOnly?: boolean) => void;
  saveDraft: () => Promise<void>;
  submitCase: () => Promise<WarrantyCase>;
  resetWizard: () => void;
}

const defaultState: CaseWizardState = {
  currentStep: 0,
  caseId: null,
  localDraftId: null,
  siteId: '',
  siteName: '',
  isSiteLocked: false,
  brandId: 'brand_byd',
  brandName: 'BYD',
  roNumber: '',
  claimNumber: '',
  vin: '',
  odometer: null,
  make: 'BYD',
  model: '',
  year: null,
  powertrain: 'EV',
  isVinDecoded: false,
  isVinDecoding: false,
  concernTitle: '',
  faultCategory: 'Battery and high-voltage (HV) components',
  partReplaced: false,
  oldPartSerial: '',
  newPartSerial: '',
  noiseFault: false,
  diagnosticsAvailable: true,
  repairStage: 'During repair',
  activeBrandPack: null,
  resolvedRules: [],
  isLoadingRules: false,
  evidenceItems: [],
  voiceNotes: [],
  isReadyForSubmission: false,
  mandatoryCount: 0,
  completedMandatoryCount: 0,
  missingRules: [],
  isFlaggedMode: false,
  flaggedRuleKeys: [],
};

const CaseWizardContext = createContext<CaseWizardContextType | undefined>(undefined);

export const CaseWizardProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const [state, setState] = useState<CaseWizardState>(defaultState);

  // Dynamic rules evaluation
  const evaluateRules = useCallback(async () => {
    if (!state.brandId) return;

    setState(prev => ({ ...prev, isLoadingRules: true }));
    try {
      const res = await brandPacksApi.evaluateRules({
        brandId: state.brandId,
        faultCategory: state.faultCategory || 'General / other',
        partReplaced: state.partReplaced,
        noiseFault: state.noiseFault,
        diagnosticsAvailable: state.diagnosticsAvailable,
        repairStage: state.repairStage,
      });

      if (res && res.resolvedRules) {
        setState(prev => ({
          ...prev,
          resolvedRules: res.resolvedRules,
          isLoadingRules: false,
        }));
      }
    } catch (err) {
      // Fallback: fetch active brand pack directly
      try {
        const bp = await brandPacksApi.getActiveByBrandId(state.brandId);
        setState(prev => ({
          ...prev,
          activeBrandPack: bp,
          resolvedRules: bp.rules || [],
          isLoadingRules: false,
        }));
      } catch (e) {
        setState(prev => ({ ...prev, isLoadingRules: false }));
      }
    }
  }, [
    state.brandId,
    state.faultCategory,
    state.partReplaced,
    state.noiseFault,
    state.diagnosticsAvailable,
    state.repairStage,
  ]);

  // Recalculate submission readiness whenever evidence or resolved rules change
  useEffect(() => {
    const readiness = qualityGates.evaluateSubmissionReadiness(
      state.resolvedRules,
      state.evidenceItems
    );

    setState(prev => ({
      ...prev,
      isReadyForSubmission: readiness.isReady,
      mandatoryCount: readiness.mandatoryCount,
      completedMandatoryCount: readiness.completedCount,
      missingRules: readiness.missingRules,
    }));
  }, [state.resolvedRules, state.evidenceItems]);

  // Step 0 Setters
  const setSite = useCallback((site: Site) => {
    setState(prev => ({
      ...prev,
      siteId: site.id,
      siteName: site.name,
    }));
  }, []);

  const setBrand = async (brand: Brand) => {
    const brandId = brand.id || (brand as any).brandId || 'brand_byd';
    const brandName = brand.name || (brand as any).brandName || 'BYD';

    setState(prev => ({
      ...prev,
      brandId: brand.id,
      brandName: brand.name,
      make: brand.name,
      activeBrandPack: null,
      resolvedRules: [],
      isLoadingRules: Boolean(brand.id),
    }));

    // Clearing the brand when the dealership changes must not trigger a request.
    if (!brand.id) return;

    try {
      const bp = await brandPacksApi.getActiveByBrandId(brandId);
      const evalRes = await brandPacksApi.evaluateRules({
        brandId,
        faultCategory: state.faultCategory || 'General / other',
        partReplaced: state.partReplaced,
        noiseFault: state.noiseFault,
        diagnosticsAvailable: state.diagnosticsAvailable,
        repairStage: state.repairStage,
      });

      setState(prev => ({
        ...prev,
        activeBrandPack: bp,
        resolvedRules: bp.rules || [],
        isLoadingRules: false,
      }));
    } catch {
      setState(prev => ({
        ...prev,
        isLoadingRules: false,
      }));
    }
  };

  useEffect(() => {
    evaluateRules();
  }, [evaluateRules]);

  const setRoNumber = (ro: string) => {
    setState(prev => ({ ...prev, roNumber: ro.toUpperCase() }));
  };

  const setClaimNumber = (claim: string) => {
    setState(prev => ({ ...prev, claimNumber: claim }));
  };

  // Step 1 Setters
  const setVin = (vin: string) => {
    const cleanVin = (vin || '').toUpperCase();
    setState(prev => {
      let mergedEvidence = [...prev.evidenceItems];
      if (cleanVin) {
        const inspection = offlineStorage.getVehicleInspection(cleanVin);
        if (inspection?.evidenceItems && inspection.evidenceItems.length > 0) {
          for (const item of inspection.evidenceItems) {
            const exists = mergedEvidence.some(e => e.ruleKey === item.ruleKey && (!allowsMultipleEvidencePhotos(item.ruleKey) || e.id === item.id));
            if (!exists) {
              mergedEvidence.push(item);
            }
          }
        }
      }
      return {
        ...prev,
        vin: cleanVin,
        evidenceItems: mergedEvidence,
      };
    });
  };

  const setOdometer = (odo: number | null) => {
    setState(prev => ({ ...prev, odometer: odo }));
  };

  const setVehicleInfo = (info: {
    make?: string;
    model?: string;
    year?: number | null;
    powertrain?: PowertrainType;
  }) => {
    setState(prev => ({
      ...prev,
      ...(info.make ? { make: info.make } : {}),
      ...(info.model ? { model: info.model } : {}),
      ...(info.year !== undefined ? { year: info.year } : {}),
      ...(info.powertrain ? { powertrain: info.powertrain } : {}),
    }));
  };

  const decodeVinNow = async (vinToDecode?: string) => {
    const targetVin = vinToDecode || state.vin;
    if (!targetVin || targetVin.length < 11) return;

    setState(prev => ({ ...prev, isVinDecoding: true }));
    try {
      const res = await vehicleApi.decodeVin(targetVin);
      setState(prev => ({
        ...prev,
        isVinDecoding: false,
        isVinDecoded: !res.requiresManualConfirm,
        make: res.make === 'Unknown' ? '' : res.make || '',
        model: res.requiresManualConfirm ? '' : res.model || '',
        year: res.year || 0,
        powertrain: res.powertrain || prev.powertrain || 'EV',
      }));
    } catch (err) {
      setState(prev => ({ ...prev, isVinDecoding: false }));
    }
  };

  // Step 2 Fault Setters
  const setConcernTitle = (title: string) => {
    setState(prev => ({ ...prev, concernTitle: title }));
  };

  const setFaultCategory = (category: string) => {
    setState(prev => ({ ...prev, faultCategory: category }));
  };

  const setPartReplaced = (replaced: boolean) => {
    setState(prev => ({ ...prev, partReplaced: replaced }));
  };

  const setOldPartSerial = (serial: string) => {
    setState(prev => ({ ...prev, oldPartSerial: serial }));
  };

  const setNewPartSerial = (serial: string) => {
    setState(prev => ({ ...prev, newPartSerial: serial }));
  };

  const setNoiseFault = (noise: boolean) => {
    setState(prev => ({ ...prev, noiseFault: noise }));
  };

  const setDiagnosticsAvailable = (diag: boolean) => {
    setState(prev => ({ ...prev, diagnosticsAvailable: diag }));
  };

  const setRepairStage = (stage: RepairStage) => {
    setState(prev => ({ ...prev, repairStage: stage }));
  };

  // Evidence Actions
  const saveEvidenceItem = (item: Partial<EvidenceItem> & { ruleKey: string }) => {
    setState(prev => {
      const rule = prev.resolvedRules.find(r => r.ruleKey === item.ruleKey) || {
        id: `rule_${item.ruleKey}`,
        ruleKey: item.ruleKey,
        name: item.ruleName || item.ruleKey,
        description: '',
        mediaType: item.mediaType || 'image',
        tier: 1 as const,
        isMandatory: item.isMandatory ?? true,
        namingConvention: `[DealerRONumber]${item.ruleKey}.jpg`,
      };

      const oemName = item.oemFileName || namingEngine.generateOemFileName(rule, prev.roNumber);

      const existingIndex = prev.evidenceItems.findIndex(e =>
        e.ruleKey === item.ruleKey && (!allowsMultipleEvidencePhotos(item.ruleKey) || e.id === item.id),
      );
      const newEvidence: EvidenceItem = {
        id: item.id || `ev_${Date.now()}_${item.ruleKey}`,
        ruleKey: item.ruleKey,
        ruleName: item.ruleName || rule.name,
        mediaType: item.mediaType || rule.mediaType,
        oemFileName: oemName,
        fileUri: item.fileUri,
        aiAnalysisId: item.aiAnalysisId,
        aiAnalysis: item.aiAnalysis,
        serverUrl: item.serverUrl,
        fileSize: item.fileSize,
        mimeType: item.mimeType || getEvidenceFormat(item.mediaType || rule.mediaType).mime,
        capturedAt: item.capturedAt || new Date().toISOString(),
        serialNumber: item.serialNumber,
        ocrExtractedText: item.ocrExtractedText,
        durationSeconds: item.durationSeconds,
        qualityStatus: item.qualityStatus || 'PASSED',
        qualityCheck: item.qualityCheck,
        isMandatory: item.isMandatory ?? rule.isMandatory,
        tier: rule.tier || 1,
        pinnedVoiceNoteIds: item.pinnedVoiceNoteIds || [],
        notes: item.notes,
        isUploaded: item.isUploaded ?? false,
      };

      let updatedList = [...prev.evidenceItems];
      if (existingIndex >= 0) {
        updatedList[existingIndex] = { ...updatedList[existingIndex], ...newEvidence };
      } else {
        updatedList.push(newEvidence);
      }

      if (prev.vin) {
        offlineStorage.recordZoneCapture(prev.vin, item.ruleKey, newEvidence);
      }

      return {
        ...prev,
        evidenceItems: updatedList,
      };
    });
  };

  const removeEvidenceItem = (ruleKey: string, evidenceId?: string) => {
    const keepEvidence = (item: EvidenceItem) =>
      item.ruleKey !== ruleKey || (evidenceId !== undefined && item.id !== evidenceId);
    if (allowsMultipleEvidencePhotos(ruleKey) && state.vin) {
      const inspection = offlineStorage.getVehicleInspection(state.vin);
      if (inspection) {
        const evidenceItems = inspection.evidenceItems.filter(keepEvidence);
        const capturedZoneKeys = evidenceItems.some(item => item.ruleKey === ruleKey)
          ? inspection.capturedZoneKeys
          : inspection.capturedZoneKeys.filter(key => key !== ruleKey);
        offlineStorage.saveVehicleInspection({ ...inspection, evidenceItems, capturedZoneKeys });
      }
    }
    setState(prev => ({ ...prev, evidenceItems: prev.evidenceItems.filter(keepEvidence) }));
  };

  const getEvidenceForRule = (ruleKey: string): EvidenceItem | undefined => {
    return state.evidenceItems.find(e => e.ruleKey === ruleKey);
  };

  const addVoiceNote = (note: VoiceNote) => {
    setState(prev => {
      const existingIndex = prev.voiceNotes.findIndex(n => n.id === note.id);
      if (existingIndex >= 0) {
        const updated = [...prev.voiceNotes];
        updated[existingIndex] = note;
        return { ...prev, voiceNotes: updated };
      }
      return {
        ...prev,
        voiceNotes: [note, ...prev.voiceNotes],
      };
    });
  };

  const removeVoiceNote = (noteId: string) => {
    setState(prev => ({
      ...prev,
      voiceNotes: prev.voiceNotes.filter(n => n.id !== noteId),
    }));
  };

  // Step Navigation
  const setStep = (step: number) => {
    setState(prev => ({ ...prev, currentStep: Math.max(0, Math.min(6, step)) }));
  };

  const nextStep = () => {
    setState(prev => {
      const next = Math.min(6, prev.currentStep + 1);
      return { ...prev, currentStep: next };
    });
  };

  const prevStep = () => {
    setState(prev => ({
      ...prev,
      currentStep: Math.max(0, prev.currentStep - 1),
    }));
  };

  // Case Lifecycle
  const startNewCase = (initialData?: Partial<CaseWizardState>) => {
    const cleanVin = (initialData?.vin || '').toUpperCase();
    let initialEvidence: EvidenceItem[] = initialData?.evidenceItems ? [...initialData.evidenceItems] : [];
    if (cleanVin) {
      const inspection = offlineStorage.getVehicleInspection(cleanVin);
      if (inspection?.evidenceItems && inspection.evidenceItems.length > 0) {
        for (const item of inspection.evidenceItems) {
          if (!initialEvidence.some(e => e.ruleKey === item.ruleKey)) {
            initialEvidence.push(item);
          }
        }
      }
    }

    setState({
      ...defaultState,
      roNumber: `CR-${Math.floor(10000 + Math.random() * 90000)}`,
      localDraftId: `draft_${crypto.randomUUID()}`,
      ...(initialData || {}),
      evidenceItems: initialEvidence,
    });
    evaluateRules();
  };

  const loadExistingCase = (caseItem: WarrantyCase, flaggedOnly: boolean = false) => {
    const flaggedKeys = caseItem.flagHistory
      ?.filter(f => !f.isResolved && f.ruleKey)
      ?.map(f => f.ruleKey as string) || [];

    setState({
      currentStep: flaggedOnly ? 3 : (caseItem as any).step || 0,
      caseId: caseItem.id,
      localDraftId: caseItem.id,
      siteId: caseItem.siteId,
      siteName: caseItem.siteName || '',
      isSiteLocked: Boolean(caseItem.submission) || !['Draft', 'Uploading'].includes(caseItem.status),
      brandId: caseItem.brandId,
      brandName: caseItem.brandName || '',
      roNumber: caseItem.roNumber,
      claimNumber: caseItem.claimNumber || '',
      vin: caseItem.vin,
      odometer: caseItem.odometer,
      make: caseItem.make,
      model: caseItem.model,
      year: caseItem.year,
      powertrain: caseItem.powertrain,
      isVinDecoded: true,
      isVinDecoding: false,
      concernTitle: caseItem.concernTitle,
      faultCategory: caseItem.faultCategory,
      partReplaced: caseItem.partReplaced,
      oldPartSerial: caseItem.oldPartSerial || '',
      newPartSerial: caseItem.newPartSerial || '',
      noiseFault: caseItem.noiseFault,
      diagnosticsAvailable: caseItem.diagnosticsAvailable,
      repairStage: caseItem.repairStage,
      activeBrandPack: null,
      resolvedRules: [],
      isLoadingRules: false,
      evidenceItems: caseItem.evidenceItems || [],
      voiceNotes: caseItem.voiceNotes || [],
      isReadyForSubmission: false,
      mandatoryCount: 0,
      completedMandatoryCount: 0,
      missingRules: [],
      isFlaggedMode: flaggedOnly,
      flaggedRuleKeys: flaggedKeys,
    });

    evaluateRules();
  };

  const draftId = state.localDraftId || state.caseId || `draft_${state.roNumber}`;

  const saveSubmissionDraft = async (
    submission = offlineStorage.getDraft(draftId)?.submission,
    evidenceItems = state.evidenceItems,
    notify = false,
  ) => {
    const localDraft = {
      localId: draftId,
      submission,
      step: state.currentStep,
      siteId: state.siteId,
      siteName: state.siteName,
      brandId: state.brandId,
      brandName: state.brandName,
      roNumber: state.roNumber,
      claimNumber: state.claimNumber,
      vin: state.vin,
      odometer: state.odometer || 0,
      make: state.make,
      model: state.model,
      year: state.year || 2024,
      powertrain: state.powertrain,
      concernTitle: state.concernTitle,
      faultCategory: state.faultCategory,
      partReplaced: state.partReplaced,
      oldPartSerial: state.oldPartSerial,
      newPartSerial: state.newPartSerial,
      noiseFault: state.noiseFault,
      diagnosticsAvailable: state.diagnosticsAvailable,
      repairStage: state.repairStage,
      evidenceItems,
      voiceNotes: state.voiceNotes,
      technicianId: user?.id,
      technicianName: user?.name,
      savedAt: new Date().toISOString(),
    };

    offlineStorage.saveDraft(localDraft, notify);
    await persist();
  };

  const saveDraft = () => saveSubmissionDraft(undefined, state.evidenceItems, true);

  const submitCase = async (): Promise<WarrantyCase> => {
    const missingPhotos = missingVehiclePhotos(state.evidenceItems);
    if (missingPhotos.length) throw new Error('Required vehicle photos missing: ' + missingPhotos.map(photo => photo.name).join(', '));
    const missingDefectPhotos = state.resolvedRules.filter(rule => allowsMultipleEvidencePhotos(rule.ruleKey) && rule.isMandatory &&
      !state.evidenceItems.some(item => item.ruleKey === rule.ruleKey && getEvidenceFileUri(item)));
    if (missingDefectPhotos.length > 0) {
      throw new Error('Add at least one photo for each required section: ' + missingDefectPhotos.map(rule => rule.name).join(', '));
    }
    const submittingUser = user?.id;
    const submittingToken = apiClient.getToken();
    const apiUrl = ENV.API_URL;
    const isCurrentSession = () => apiClient.getToken() === submittingToken && ENV.API_URL === apiUrl;
    const requireSession = () => {
      if (!isCurrentSession()) throw new Error('Session changed. Sign in to resume your saved draft.');
    };
    if (!submittingUser || !submittingToken) throw new Error('Sign in to submit your warranty case.');

    let submission = offlineStorage.getDraft(draftId)?.submission;
    if (submission && submission.apiUrl !== apiUrl) {
      throw new Error('Open this draft using the server where the submission was started.');
    }
    const evidenceItems = state.evidenceItems.map(item => ({ ...item }));
    await saveSubmissionDraft(submission, evidenceItems);
    if (!submission && !state.isSiteLocked) {
      const siteError = 'Tap Edit on Vehicle & Ticket Summary and select the assigned rooftop for this repair order. If it is missing, ask your administrator to check your rooftop assignment.';
      if (!assignedWarrantySiteIds(user).includes(state.siteId)) throw new Error(siteError);

      // The API client can use the cached directory when the device is offline.
      const sites = await sitesApi.getSites().catch(() => undefined);
      requireSession();
      if (Array.isArray(sites) && !sites.some(site => site.id === state.siteId && site.isActive !== false)) {
        throw new Error(siteError);
      }
    }
    // Generate DTO with solid defaults matching backend DTO schema
    const dto = {
      idempotencyKey: draftId,
      siteId: state.siteId,
      siteName: state.siteName,
      brandId: state.brandId || 'brand_byd',
      brandName: state.brandName || 'BYD',
      brandPackId: state.activeBrandPack?.id || 'brandpack_byd_v1',
      brandPackVersion: state.activeBrandPack?.version || 1,
      roNumber: state.roNumber || `CR-${Date.now().toString().slice(-5)}`,
      claimNumber: state.claimNumber,
      vin: state.vin || 'LGXCE4C86P0019283',
      odometer: Number(state.odometer) || 14250,
      make: state.make || state.brandName || 'BYD',
      model: state.model || 'ATTO 3 Extended',
      year: Number(state.year) || 2024,
      powertrain: state.powertrain || 'EV',
      concernTitle: state.concernTitle || 'Warranty inspection and fault diagnosis',
      faultCategory: state.faultCategory || 'Oil leaks or seepage',
      partReplaced: Boolean(state.partReplaced),
      oldPartSerial: state.oldPartSerial,
      newPartSerial: state.newPartSerial,
      noiseFault: Boolean(state.noiseFault),
      diagnosticsAvailable: Boolean(state.diagnosticsAvailable),
      repairStage: state.repairStage || 'Repair complete',
      technicianId: user?.id || 'usr_tech_1',
      technicianName: user?.name || 'Jake Smith',
      // Do not save local phone paths or demo URLs on case creation.
      // Real evidence is uploaded below through multipart/form-data and the backend stores /uploads or S3 URLs.
      evidenceItems: [],
      voiceNotes: await serializeMedia(state.voiceNotes || []),
    };

    try {
      requireSession();
      const isExistingServerCase =
        state.caseId &&
        !state.caseId.startsWith('CASE-') &&
        !state.caseId.startsWith('local_') &&
        !state.caseId.startsWith('draft_');

      if (!submission) {
        const serverCase = isExistingServerCase
          ? await casesApi.updateCase(state.caseId!, dto)
          : await casesApi.createCase(dto);
        requireSession();
        if (!serverCase?.id) throw new Error('The server did not return a warranty case ID.');
        submission = { caseId: serverCase.id, apiUrl };
        await saveSubmissionDraft(submission, evidenceItems);
      }
      const serverCaseId = submission.caseId;

      // Upload each captured evidence file
      if (evidenceItems.length > 0) {
        for (const ev of evidenceItems) {
          if (ev.isUploaded) continue;
          requireSession();
          try {
            if (isLocalMedia(ev.fileUri)) {
              const formData = new FormData();
              const { ext, mime } = getEvidenceFormat(ev.mediaType);
              const cleanRo = (state.roNumber || 'RO').replace(/[^a-zA-Z0-9]/g, '');
              const descriptor = ev.ruleKey
                .split('_')
                .map((w: string) => w.charAt(0).toUpperCase() + w.slice(1))
                .join('');
              const oemFileName = `${cleanRo}${descriptor}.${ext}`;

              await appendMedia(formData, 'file', {
                uri: ev.fileUri,
                type: mime,
                name: oemFileName,
              } as any);
              formData.append('ruleKey', ev.ruleKey);
              if (allowsMultipleEvidencePhotos(ev.ruleKey)) formData.append('evidenceId', ev.id);
  if (ev.aiAnalysisId) formData.append('aiAnalysisId', ev.aiAnalysisId);
              formData.append('evidenceName', ev.ruleName || ev.ruleKey);
              if (ev.ocrExtractedText) {
                formData.append('ocrExtractedText', ev.ocrExtractedText);
              }

              requireSession();
              await casesApi.uploadEvidenceFile(serverCaseId, formData);
            } else if (ev.storageUrl && !ev.storageUrl.startsWith('file://') && !ev.storageUrl.startsWith('content://')) {
              await casesApi.addEvidence(serverCaseId, {
                ruleKey: ev.ruleKey,
                evidenceId: allowsMultipleEvidencePhotos(ev.ruleKey) ? ev.id : undefined,
                name: ev.ruleName || ev.ruleKey,
                mediaType: (ev.mediaType as any) || 'image',
                storageUrl: ev.storageUrl,
                ocrExtractedText: ev.ocrExtractedText,
                ocrConfidence: ev.ocrConfidence,
                durationSeconds: ev.durationSeconds,
              });
            } else continue;
            requireSession();
            ev.isUploaded = true;
            await saveSubmissionDraft(submission, evidenceItems);
          } catch (uploadErr) {
            console.warn(`[CaseWizardContext] Upload failed for evidence ${ev.ruleKey}:`, uploadErr);
            throw uploadErr;
          }
        }
      }

      // Submit from workshop to trigger CRM status transition
      requireSession();
      const submitted = await casesApi.submitFromWorkshop(serverCaseId, {
        checklistSummary: {
          totalMandatory: state.mandatoryCount,
          completedMandatory: state.completedMandatoryCount || state.evidenceItems.length,
          isReadyForSubmission: true,
        },
      });

      console.log('[CaseWizardContext] Case submitted to backend CRM successfully:', submitted.id);
      if (isCurrentSession()) offlineStorage.removeDraft(draftId);
      return submitted;
    } catch (err: any) {
      if (err?.statusCode === 401) {
        throw new Error('Your session ended. Sign in again and look for your draft in Warranty Capture.');
      }
      if (err?.statusCode === 403) {
        throw new Error(err.message || 'Your account does not have permission to submit this case.');
      }
      if (err?.statusCode >= 400 && err?.statusCode < 500) {
        throw new Error(err.message || 'Case submission failed validation. Please check your data.');
      }

      requireSession();
      console.warn('[CaseWizardContext] Network connection error, queuing offline:', err?.message || err);
      // If truly offline / unreachable, save to pending queue
      const mockSubmitted: WarrantyCase = {
        id: submission?.caseId || draftId,
        submission,
        ...dto,
        status: 'Uploading',
        technicianId: user?.id || 'usr_tech_1',
        technicianName: user?.name || 'Jake Smith',
        flagHistory: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      mockSubmitted.evidenceItems = evidenceItems;
      offlineStorage.queuePendingUpload(mockSubmitted);
      await persist();
      offlineStorage.removeDraft(draftId);
      await persist();
      return mockSubmitted;
    }
  };

  const resetWizard = () => {
    setState(defaultState);
  };

  return (
    <CaseWizardContext.Provider
      value={{
        ...state,
        setStep,
        nextStep,
        prevStep,
        setSite,
        setBrand,
        setRoNumber,
        setClaimNumber,
        setVin,
        setOdometer,
        setVehicleInfo,
        decodeVinNow,
        setConcernTitle,
        setFaultCategory,
        setPartReplaced,
        setOldPartSerial,
        setNewPartSerial,
        setNoiseFault,
        setDiagnosticsAvailable,
        setRepairStage,
        saveEvidenceItem,
        removeEvidenceItem,
        getEvidenceForRule,
        addVoiceNote,
        removeVoiceNote,
        evaluateRules,
        startNewCase,
        loadExistingCase,
        saveDraft,
        submitCase,
        resetWizard,
      }}
    >
      {children}
    </CaseWizardContext.Provider>
  );
};

export const useCaseWizard = () => {
  const context = useContext(CaseWizardContext);
  if (!context) {
    throw new Error('useCaseWizard must be used within a CaseWizardProvider');
  }
  return context;
};
