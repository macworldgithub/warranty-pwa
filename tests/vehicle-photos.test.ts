import { describe, expect, it } from 'vitest';
import { VEHICLE_PHOTO_CATEGORIES, missingVehiclePhotos, withVehiclePhotoRules } from '../src/services/vehiclePhotos';
import { qualityGates } from '../src/services/qualityGates';
import { qualityGates as appQualityGates } from '../../warranty-app/src/services/qualityGates';
import { missingVehiclePhotos as serverMissingPhotos } from '../../warranty-evidence-backend/src/modules/warranty-cases/vehicle-photos';

const required = VEHICLE_PHOTO_CATEGORIES.filter(photo => photo.isMandatory);
const uploaded = required.map(photo => ({ ruleKey: photo.ruleKey, mediaType: 'image' as const, storageUrl: '/uploads/' + photo.ruleKey + '.jpg' }));
for (const [client, gates] of [['PWA', qualityGates], ['App', appQualityGates]] as const) {
  describe(client + ' vehicle photo gates', () => {
    it('requires exactly the seven requested categories', () => {
      expect(gates.evaluateSubmissionReadiness([], [])).toMatchObject({ isReady: false, mandatoryCount: 7, completedCount: 0 });
      expect(required.map(photo => photo.name)).toEqual(['FRONT', 'REAR', 'ODO/DASH', 'VIN PLATE', 'ENGINE BAY', 'LEFT SIDE', 'RIGHT SIDE']);
    });
    it.each(required)('blocks submission if $name is missing', photo => {
      const readiness = gates.evaluateSubmissionReadiness([], uploaded.filter(item => item.ruleKey !== photo.ruleKey));
      expect(readiness.isReady).toBe(false);
      expect(readiness.missingRules.map(rule => rule.name)).toEqual([photo.name]);
    });
    it('allows all seven without MODIFICATIONS and does not count optional photos as required', () => {
      expect(gates.evaluateSubmissionReadiness([], uploaded)).toMatchObject({ isReady: true, completedCount: 7, mandatoryCount: 7 });
      expect(gates.evaluateSubmissionReadiness([], [{ ruleKey: 'modifications_photo', mediaType: 'image', fileUri: 'file:///optional.jpg' }]).isReady).toBe(false);
    });
    it('rejects empty records, unrelated photos, wrong media types and failed quality checks', () => {
      for (const replacement of [{}, { fileUri: '' }, { fileUri: 'file:///video.mp4', mediaType: 'video' }, { fileUri: 'file:///bad.jpg', qualityStatus: 'FAILED' }]) {
        expect(gates.evaluateSubmissionReadiness([], [{ ...uploaded[0], storageUrl: undefined, ...replacement } as any, ...uploaded.slice(1)]).isReady).toBe(false);
      }
    });
  });
}
describe('uploaded vehicle inspection photos', () => {
  it('does not mark local, queued, blob, data or device-only paths as uploaded', () => {
    for (const storageUrl of ['file:///photo.jpg', 'content://photo', 'blob:photo', 'data:image/png;base64,x', '/local/photo.jpg', '']) {
      const photos = [{ ...uploaded[0], fileUri: 'file:///photo.jpg', storageUrl }, ...uploaded.slice(1)];
      expect(missingVehiclePhotos(photos, true).map(photo => photo.name)).toEqual(['FRONT']);
      expect(serverMissingPhotos(photos, true).map(photo => photo.name)).toEqual(['FRONT']);
    }
  });
  it('accepts local captures for preparation but requires server uploads for completion', () => {
    const local = required.map(photo => ({ ruleKey: photo.ruleKey, mediaType: 'image', fileUri: 'file:///photo.jpg' }));
    expect(missingVehiclePhotos(local)).toHaveLength(0);
    expect(missingVehiclePhotos(local, true)).toHaveLength(7);
    expect(missingVehiclePhotos(uploaded, true)).toHaveLength(0);
  });
  it('does not count duplicates or legacy optional zones in place of missing categories', () => {
    const photos = Array.from({ length: 10 }, () => uploaded[0]);
    expect(missingVehiclePhotos(photos, true)).toHaveLength(6);
  });
});

describe('manufacturer inspection photo requirements', () => {
  it('adds missing vehicle categories to every manufacturer pack without dropping its evidence', () => {
    const extra: any = { id: 'defect', ruleKey: 'fault_closeup', name: 'Defect photo', isMandatory: true, mediaType: 'image', tier: 1 };
    const rules = withVehiclePhotoRules([extra]);
    expect(rules.filter(rule => required.some(photo => photo.ruleKey === rule.ruleKey) && rule.isMandatory)).toHaveLength(7);
    expect(rules).toContainEqual(extra);
  });
  it('overrides outdated optional flags and keeps MODIFICATIONS optional', () => {
    const rules = withVehiclePhotoRules([
      { ruleKey: 'rear_vehicle_photo', isMandatory: false } as any,
      { ruleKey: 'modifications_photo', isMandatory: true } as any,
    ]);
    expect(rules.find(rule => rule.ruleKey === 'rear_vehicle_photo')?.isMandatory).toBe(true);
    expect(rules.find(rule => rule.ruleKey === 'modifications_photo')?.isMandatory).toBe(false);
    expect(rules.filter(rule => rule.ruleKey === 'rear_vehicle_photo')).toHaveLength(1);
  });
});
