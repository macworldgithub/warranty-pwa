import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CHERY_EVIDENCE_RULES } from '../src/services/chery-evidence-rules';
import { brandPacksService } from '../src/services/brandPacks.service';
import { qualityGates } from '../src/services/qualityGates';
import { VEHICLE_PHOTO_CATEGORIES, missingVehiclePhotos, withVehiclePhotoRules, evidenceRuleKeysMatch } from '../src/services/vehiclePhotos';
import type { EvidenceItem } from '../src/types';

const walkaround = VEHICLE_PHOTO_CATEGORIES.filter(photo => photo.isMandatory)
  .map(photo => ({ ruleKey: photo.ruleKey, mediaType: 'image', fileUri: 'blob:' + photo.ruleKey }));
const complete = [
  ...walkaround.filter(item => !['vin_photo', 'odometer_photo'].includes(item.ruleKey)),
  ...CHERY_EVIDENCE_RULES.map(rule => ({ ruleKey: rule.ruleKey, mediaType: rule.mediaType, fileUri: 'blob:' + rule.ruleKey })),
] as EvidenceItem[];

describe('Chery template parity and offline flow', () => {
  it('matches every supplied CSV row and the backend pack exactly', () => {
    const csv = readFileSync(new URL('../../warranty-evidence-backend/tools/templates/chery_evidence_rules_template.csv', import.meta.url), 'utf8');
    const rows = csv.trim().split(/\r?\n/).slice(1).map(line => line.split(','));
    // Read the backend data without pulling its Nest decorator types into the PWA compiler.
    const backendSource = readFileSync(new URL('../../warranty-evidence-backend/src/modules/brand-packs/chery-evidence-rules.ts', import.meta.url), 'utf8');
    const backendRules = JSON.parse(backendSource.match(/CHERY_EVIDENCE_RULES[^=]*= ([\s\S]+);/)![1]);
    expect(CHERY_EVIDENCE_RULES).toHaveLength(20);
    expect(CHERY_EVIDENCE_RULES).toEqual(backendRules);
    expect(CHERY_EVIDENCE_RULES.map(rule => [rule.name, rule.ruleKey, rule.mediaType, String(rule.tier), String(rule.isMandatory).toUpperCase(), rule.namingConvention, rule.guidanceText, 'None'])).toEqual(rows);
    expect(CHERY_EVIDENCE_RULES.filter(rule => rule.mediaType === 'document')).toHaveLength(10);
  });

  it.each(['Chery', 'brand_chery', 'brandpack_chery_v1'])('returns the dedicated offline pack for %s', brand => {
    expect(brandPacksService.getBrandPackForBrand(brand)).toMatchObject({ id: 'brandpack_chery_v1', rules: CHERY_EVIDENCE_RULES });
  });

  it.each([false, true])('preserves all requirements when conditional switches are %s', enabled => {
    const result = brandPacksService.evaluateRules({ brandId: 'brand_chery', faultCategory: 'General / other (Tier 1 only)', partReplaced: enabled, noiseFault: enabled, diagnosticsAvailable: enabled, repairStage: enabled ? 'Repair complete' : 'Pre-repair only' });
    expect(result).toMatchObject({ mandatoryCount: 20, optionalCount: 0, resolvedRules: CHERY_EVIDENCE_RULES });
  });

  it('counts presentation images once and preserves the other five required walkaround photos', () => {
    expect(missingVehiclePhotos(complete)).toHaveLength(0);
    expect(qualityGates.evaluateSubmissionReadiness(CHERY_EVIDENCE_RULES, complete)).toMatchObject({ isReady: true, mandatoryCount: 25, completedCount: 25 });
  });

  it('shows each presentation photo once on review, retaining its Chery label and filename', () => {
    const review = withVehiclePhotoRules(CHERY_EVIDENCE_RULES);
    expect(review.filter(rule => rule.isMandatory)).toHaveLength(25);
    expect(review.filter(rule => evidenceRuleKeysMatch(rule.ruleKey, 'vin_photo'))).toEqual([CHERY_EVIDENCE_RULES[0]]);
    expect(review.filter(rule => evidenceRuleKeysMatch(rule.ruleKey, 'odometer_photo'))).toEqual([CHERY_EVIDENCE_RULES[1]]);
  });

  it.each(CHERY_EVIDENCE_RULES)('blocks missing $ruleKey', rule => {
    expect(qualityGates.evaluateSubmissionReadiness(CHERY_EVIDENCE_RULES, complete.filter(item => item.ruleKey !== rule.ruleKey)).isReady).toBe(false);
  });

  it('requires document media and keeps generic brand behavior intact', () => {
    const wrongMedia = complete.map(item => item.ruleKey === 'customer_complaint' ? { ...item, mediaType: 'image' as const } : item);
    expect(qualityGates.evaluateSubmissionReadiness(CHERY_EVIDENCE_RULES, wrongMedia).missingRules.map(rule => rule.ruleKey)).toEqual(['customer_complaint']);
    expect(qualityGates.evaluateSubmissionReadiness([], walkaround as EvidenceItem[])).toMatchObject({ isReady: true, mandatoryCount: 7 });
  });
});
