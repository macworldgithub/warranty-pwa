import { StyleSheet, Text, View } from 'react-native';
import { Building2 } from 'lucide-react-native';
import { useAuth } from '../../context/AuthContext';
import { assignedWarrantySiteIds } from '../../services/warrantyRooftops';
import type { Site } from '../../types';

interface AssignedRooftopsCardProps {
  sites: Site[] | null | undefined;
  currentSiteId: string;
  testID?: string;
}

export function AssignedRooftopsCard({ sites, currentSiteId, testID }: AssignedRooftopsCardProps) {
  const { user } = useAuth();
  const assignedSiteIds = assignedWarrantySiteIds(user);
  const assignedRooftops = sites?.filter((site) => site.isActive !== false && assignedSiteIds.includes(site.id)) ?? [];

  return (
    <View style={styles.rooftopCard} testID={testID}>
      <View style={styles.rooftopIconCircle}>
        <Building2 size={20} color="#DC2626" />
      </View>
      <View style={styles.rooftopTextCol}>
        <Text style={styles.rooftopEyebrow}>YOUR ASSIGNED ROOFTOPS</Text>
        {assignedRooftops.map((site) => (
          <View key={site.id} style={styles.rooftopRow}>
            <Text style={styles.rooftopName}>{site.name}</Text>
            {site.id === currentSiteId && (
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
  },
  rooftopTextCol: {
    flex: 1,
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
  assignedBadge: {
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
