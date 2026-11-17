import type { Site, User } from '../types';

export function assignedWarrantySiteIds(user: User | null): string[] {
  const assigned = user?.authorizedSiteIds?.filter(Boolean) ?? [];
  return assigned.length ? assigned : user?.defaultSiteId ? [user.defaultSiteId] : [];
}

export function availableWarrantySites(sites: Site[], user: User | null): Site[] {
  const assigned = assignedWarrantySiteIds(user);
  const networkView = user?.role === 'ADMIN' || user?.role === 'SERVICE_MANAGER';
  return sites.filter(site => site.isActive !== false && (networkView || assigned.includes(site.id)));
}

export function preferredWarrantySite(sites: Site[], activeSiteId: string, defaultSiteId?: string): Site | undefined {
  return sites.find(site => site.id === activeSiteId)
    ?? sites.find(site => site.id === defaultSiteId)
    ?? (sites.length === 1 ? sites[0] : undefined);
}
