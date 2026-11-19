import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Building2 } from 'lucide-react-native';
import { useAuth } from '../../context/AuthContext';
import { useRoadTest } from '../../context/RoadTestContext';
import { assignedWarrantySiteIds } from '../../services/warrantyRooftops';
import type { Site } from '../../types';

interface AssignedRooftopsCardProps {
  sites: Site[] | null | undefined;
  currentSiteId: string;
  testID?: string;
}

export function AssignedRooftopsCard({ sites, currentSiteId, testID }: AssignedRooftopsCardProps) {
  const { width } = useWindowDimensions();
  const isPhone = width < 768;
  const { user, setActiveSiteId } = useAuth();
  const { isLiveDrive, demoRunning, pendingCompletion } = useRoadTest();
  const assignedSiteIds = assignedWarrantySiteIds(user);
  const assignedRooftops = sites?.filter((site) => site.isActive !== false && assignedSiteIds.includes(site.id)) ?? [];
  const selectedSiteId = assignedRooftops.some((site) => site.id === currentSiteId) ? currentSiteId : '';
  const switchingLocked = isLiveDrive || demoRunning || pendingCompletion;

  return (
    <View style={styles.rooftopCard} testID={testID}>
      <View style={styles.rooftopIconCircle}>
        <Building2 size={20} color="#DC2626" />
      </View>
      <View style={[styles.rooftopContent, isPhone && styles.rooftopContentPhone]}>
        {assignedRooftops.length > 0 && (
          <View style={[styles.rooftopControl, isPhone && styles.rooftopControlPhone]}>
            <select
              aria-label="Current rooftop"
              value={selectedSiteId}
              disabled={switchingLocked}
              onChange={(event) => {
                const siteId = event.currentTarget.value;
                if (!switchingLocked && assignedRooftops.some((site) => site.id === siteId)) setActiveSiteId(siteId);
              }}
              style={{ width: '100%', minWidth: 0, minHeight: 44, padding: '6px 8px', borderRadius: 8, border: '1px solid #E2E8F0', color: '#0F172A', background: '#F8FAFC', font: 'inherit', fontSize: 13 }}
            >
              {!selectedSiteId && <option value="" disabled>Select rooftop</option>}
              {assignedRooftops.map((site) => <option key={site.id} value={site.id}>{site.name}</option>)}
            </select>
            {switchingLocked && <Text style={styles.rooftopStatus}>Finish the drive to switch rooftops.</Text>}
          </View>
        )}
        <View style={styles.rooftopTextCol}>
          <Text style={styles.rooftopEyebrow}>YOUR ASSIGNED ROOFTOPS</Text>
          {assignedRooftops.map((site) => (
            <View key={site.id} style={styles.rooftopRow}>
              <Text style={styles.rooftopName}>{site.name}</Text>
              {!isPhone && site.id === currentSiteId && (
                <View style={styles.assignedBadge}>
                  <Text style={styles.assignedBadgeText}>Current</Text>
                </View>
              )}
            </View>
          ))}
          {assignedRooftops.length === 0 && (
            <Text style={styles.rooftopStatus}>
              {sites === undefined ? 'Loading rooftops…' : sites === null ? 'Could not load assigned rooftops.' : 'No active rooftops assigned.'}
            </Text>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  rooftopCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  rooftopIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#FEE2E2',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  rooftopContent: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  rooftopContentPhone: {
    flexDirection: 'column',
    alignItems: 'stretch',
  },
  rooftopTextCol: {
    flexGrow: 1,
    flexShrink: 1,
    minWidth: 0,
    gap: 4,
  },
  rooftopEyebrow: {
    color: '#DC2626',
    fontSize: 10.5,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  rooftopName: {
    flex: 1,
    color: '#0F172A',
    fontSize: 16,
    fontWeight: '800',
  },
  rooftopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  rooftopStatus: {
    color: '#475569',
    fontSize: 13,
  },
  rooftopControl: {
    maxWidth: '45%',
    minWidth: 0,
    width: 180,
    gap: 4,
  },
  rooftopControlPhone: {
    maxWidth: '100%',
    width: '100%',
  },
  assignedBadge: {
    flexShrink: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  assignedBadgeText: {
    color: '#475569',
    fontSize: 12,
    fontWeight: '600',
  },
});
