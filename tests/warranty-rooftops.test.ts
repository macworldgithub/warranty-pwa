import { describe, expect, it } from 'vitest';
import type { User } from '../src/types';
import { assignedWarrantySiteIds, availableWarrantySites, preferredWarrantySite } from '../src/services/warrantyRooftops';

const retired = { id: 'site_cranbourne_byd', name: 'Booran BYD Cranbourne', code: 'CR_BYD', isActive: false };
const hyundai = { id: 'site_cranbourne_hyundai', name: 'Cranbourne Hyundai', code: 'CR_HYUNDAI' };
const kia = { id: 'site_cranbourne_kia', name: 'Cranbourne Kia', code: 'CR_KIA' };
const technician: User = { id: 'tech', name: 'Technician', email: 'tech@example.test', role: 'TECHNICIAN' };

describe('warranty rooftop selection', () => {
  it('selects the only active assigned rooftop when the primary rooftop is obsolete', () => {
    const profile = { ...technician, defaultSiteId: retired.id, authorizedSiteIds: [retired.id, hyundai.id] };
    const choices = availableWarrantySites([retired, kia, hyundai], profile);

    expect(choices).toEqual([hyundai]);
    expect(preferredWarrantySite(choices, retired.id, profile.defaultSiteId)).toEqual(hyundai);
  });

  it('does not treat an empty assignment as access to the site directory', () => {
    expect(availableWarrantySites([hyundai, kia], technician)).toEqual([]);
    expect(availableWarrantySites([hyundai, kia], null)).toEqual([]);
  });

  it('uses a primary rooftop for legacy profiles with no assignment list', () => {
    const profile = { ...technician, defaultSiteId: kia.id, authorizedSiteIds: [] };
    expect(availableWarrantySites([hyundai, kia], profile)).toEqual([kia]);
    expect(assignedWarrantySiteIds({ ...profile, authorizedSiteIds: [hyundai.id] })).toEqual([hyundai.id]);
  });

  it('prefers the current assigned rooftop and otherwise leaves an ambiguous choice open', () => {
    expect(preferredWarrantySite([hyundai, kia], kia.id, hyundai.id)).toEqual(kia);
    expect(preferredWarrantySite([hyundai, kia], retired.id, retired.id)).toBeUndefined();
  });
});
