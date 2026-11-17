import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { colors } from '../../theme/colors';
import { typography } from '../../theme/typography';
import { spacing } from '../../theme/spacing';
import { Icon } from '../../components/common/Icon';
import { Button } from '../../components/common/Button';
import { Input } from '../../components/common/Input';
import { Badge } from '../../components/common/Badge';
import { Card } from '../../components/common/Card';
import { useCaseWizard } from '../../context/CaseWizardContext';
import { useAuth } from '../../context/AuthContext';
import { sitesApi } from '../../api/sites.api';
import { brandsApi } from '../../api/brands.api';
import { availableWarrantySites, preferredWarrantySite } from '../../services/warrantyRooftops';
import { Site, Brand } from '../../types';

interface Step0Props {
  onNext: () => void;
  onCancel: () => void;
}

const MOCK_BRANDS: Brand[] = [
  { id: 'brand_byd', name: 'BYD' },
  { id: 'brand_hyundai', name: 'Hyundai' },
  { id: 'brand_kia', name: 'Kia' },
  { id: 'brand_mg', name: 'MG Motor' },
  { id: 'brand_chery', name: 'Chery' },
  { id: 'brand_toyota', name: 'Toyota' },
  { id: 'brand_ford', name: 'Ford' },
  { id: 'brand_mitsubishi', name: 'Mitsubishi' },
];

export const Step0_StartTicket: React.FC<Step0Props> = ({ onNext, onCancel }) => {
  const { user, activeSiteId } = useAuth();
  const {
    siteId,
    siteName,
    isSiteLocked,
    brandId,
    brandName,
    make,
    roNumber,
    claimNumber,
    setSite,
    setBrand,
    setRoNumber,
    setClaimNumber,
  } = useCaseWizard();

  const [sites, setSites] = useState<Site[]>([]);
  const [allBrands, setAllBrands] = useState<Brand[]>([]);
  const [loading, setLoading] = useState(true);
  const [siteLoadError, setSiteLoadError] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);

  const authorizedSites = useMemo(() => {
    return availableWarrantySites(sites, user);
  }, [sites, user]);

  const selectedSite = authorizedSites.find(site => site.id === siteId);

  /* -- Initial load: all sites + all brands -- */
  useEffect(() => {
    let current = true;
    setLoading(true);
    setSiteLoadError(false);
    const fetchData = async () => {
      const [siteResult, brandResult] = await Promise.allSettled([sitesApi.getSites(), brandsApi.getBrands()]);
      if (!current) return;
      setSites(siteResult.status === 'fulfilled' ? siteResult.value ?? [] : []);
      setSiteLoadError(siteResult.status === 'rejected');
      setAllBrands(brandResult.status === 'fulfilled' ? brandResult.value ?? MOCK_BRANDS : MOCK_BRANDS);
      setLoading(false);
    };
    void fetchData();
    return () => { current = false; };
  }, [loadAttempt]);

  useEffect(() => {
    if (loading || isSiteLocked) return;
    const site = selectedSite ?? (!siteId ? preferredWarrantySite(authorizedSites, activeSiteId, user?.defaultSiteId) : undefined);
    if (site && (site.id !== siteId || site.name !== siteName)) setSite(site);
  }, [loading, isSiteLocked, selectedSite, authorizedSites, siteId, siteName, activeSiteId, user?.defaultSiteId, setSite]);

  /* -- Derived: brands that are authorized for the selected site -- */
  const availableBrands = useMemo(() => {
    if (!selectedSite) return [];
    const authIds = selectedSite.authorizedBrands ?? selectedSite.authorizedBrandIds;
    if (authIds && authIds.length > 0) {
      const filtered = allBrands.filter((b) => authIds.includes(b.id));
      if (filtered.length > 0) return filtered;
    }
    // Fallback: match by brand name in site name
    const siteLower = selectedSite.name.toLowerCase();
    const matched = allBrands.filter(b => siteLower.includes(b.name.toLowerCase()));
    if (matched.length > 0) return matched;
    return allBrands;
  }, [allBrands, selectedSite]);

  useEffect(() => {
    if (isSiteLocked || availableBrands.some(brand => brand.id === brandId)) return;
    const matchingBrand = availableBrands.find(brand => brand.name.toLowerCase() === make?.toLowerCase());
    const brand = matchingBrand ?? availableBrands[0];
    if (brand) void setBrand(brand);
  }, [availableBrands, brandId, isSiteLocked, make, setBrand]);

  const isValidRo = roNumber.trim().length >= 3;
  const validBrand = availableBrands.some(brand => brand.id === brandId);

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.introHeader}>
        <Text style={styles.sectionTitle}>Start Warranty Ticket</Text>
      </View>

      <Card title="Dealership Site">

        {isSiteLocked ? (
          <Text style={styles.lockedSiteText}>{siteName || siteId}</Text>
        ) : loading ? (
          <ActivityIndicator size="small" color={colors.primary} style={{ marginVertical: 12 }} />
        ) : siteLoadError ? (
          <>
            <Text style={styles.subtext}>Could not load rooftops. Check your connection and try again.</Text>
            <Button title="Retry" onPress={() => setLoadAttempt(attempt => attempt + 1)} />
          </>
        ) : authorizedSites.length === 0 ? (
          <Text style={styles.subtext}>No active rooftop is assigned to your account. Ask your administrator to check your rooftop assignment.</Text>
        ) : authorizedSites.length === 1 && selectedSite ? (
          <View style={styles.lockedSiteRow}>
            <Icon name="shield" size={16} color={colors.primary} />
            <Text style={styles.lockedSiteText}>{selectedSite.name}</Text>
            <Badge label="Your Rooftop" variant="success" size="sm" />
          </View>
        ) : (
          <View style={styles.chipsContainer}>
            {siteId && !selectedSite && (
              <Text style={styles.subtext}>This draft's rooftop is unavailable. Select the assigned rooftop for this repair order.</Text>
            )}
            {authorizedSites.map((s) => {
              const isSelected = s.id === siteId;
              return (
                <TouchableOpacity
                  key={s.id}
                  activeOpacity={0.75}
                  onPress={() => setSite(s)}
                  style={[styles.chip, isSelected && styles.chipSelected]}
                >
                  <Icon name="shield" size={14} color={isSelected ? colors.primaryLight : colors.textSecondary} />
                  <Text style={[styles.chipText, isSelected && styles.chipTextSelected]}>{s.name}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </Card>

      {/* Brand Selection - filtered by selected site */}
      <Card title="Vehicle Brand">
        {isSiteLocked && !selectedSite ? (
          <Text style={styles.subtext}>{brandName}</Text>
        ) : !selectedSite ? (
          <Text style={styles.subtext}>Select a dealership site above.</Text>
        ) : availableBrands.length === 0 ? (
          <Text style={styles.subtext}>No brands linked to this site.</Text>
        ) : (
          <>
            <View style={styles.chipsGrid}>
              {availableBrands.map((b) => {
                const isSelected = b.id === brandId;
                return (
                  <TouchableOpacity
                    key={b.id}
                    activeOpacity={0.75}
                    onPress={() => setBrand(b)}
                    style={[styles.brandChip, isSelected && styles.brandChipSelected]}
                  >
                    <Text style={[styles.brandChipText, isSelected && styles.brandChipTextSelected]}>
                      {b.name}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <View style={styles.criteriaInfoRow}>
              <Icon name="shield" size={14} color={colors.primary} />
              <Text style={styles.criteriaInfoText}>
                {brandId?.toLowerCase().includes('byd')
                  ? 'BYD Attachment A Pack Active (Tier 1 + Fault Annex 2)'
                  : 'Multi-Brand Standard Pack Active (Tier 1 Baseline)'}
              </Text>
            </View>
          </>
        )}
      </Card>

      <Card title="Repair Order">
        <Input
          label="Repair Order (RO) Number"
          required
          placeholder="e.g. CR-21693"
          value={roNumber}
          onChangeText={setRoNumber}
          leftIcon="barcode"
          autoCapitalize="characters"
          error={!isValidRo && roNumber ? 'RO number is required (min 3 chars)' : undefined}
        />
        <Input
          label="Claim Number (Optional)"
          placeholder="e.g. CLM-10294"
          value={claimNumber}
          onChangeText={setClaimNumber}
          leftIcon="file-text"
          autoCapitalize="characters"
        />
      </Card>

      {/* Actions */}
      <View style={styles.actionRow}>
        <Button title="Cancel" variant="ghost" onPress={onCancel} style={{ flex: 1 }} />
        <Button
          title="Vehicle Info"
          variant="primary"
          disabled={!isValidRo || (isSiteLocked ? !brandId : loading || !selectedSite || !validBrand)}
          onPress={onNext}
          rightIcon={<Icon name="chevron-right" size={18} color={colors.textInverse} />}
          style={{ flex: 2 }}
        />
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: spacing.lg,
    paddingBottom: 60,
  },
  introHeader: {
    marginBottom: spacing.lg,
  },
  sectionTitle: {
    fontSize: typography.sizes.lg,
    fontWeight: typography.weights.bold,
    color: colors.textPrimary,
  },
  sectionDesc: {
    fontSize: typography.sizes.xs,
    color: colors.textSecondary,
    marginTop: 4,
    lineHeight: 18,
  },
  subtext: {
    fontSize: typography.sizes.xs,
    color: colors.textSecondary,
    marginBottom: spacing.md,
  },
  chipsContainer: {
    gap: spacing.sm,
  },
  lockedSiteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xs,
  },
  lockedSiteText: {
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.semibold,
    color: colors.textPrimary,
    flex: 1,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: spacing.borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    gap: spacing.sm,
  },
  chipSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.surfaceHighlight,
  },
  chipText: {
    fontSize: typography.sizes.sm,
    color: colors.textSecondary,
    fontWeight: typography.weights.medium,
  },
  chipTextSelected: {
    color: colors.primary,
    fontWeight: typography.weights.bold,
  },
  chipsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  brandChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: spacing.borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.xs,
  },
  brandChipSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.surfaceHighlight,
  },
  brandChipText: {
    fontSize: typography.sizes.sm,
    color: colors.textSecondary,
    fontWeight: typography.weights.medium,
  },
  brandChipTextSelected: {
    color: colors.primary,
    fontWeight: typography.weights.bold,
  },
  actionRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.lg,
  },
  criteriaInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.surfaceHighlight,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: spacing.borderRadius.sm,
    marginTop: spacing.sm,
    borderWidth: 1,
    borderColor: 'rgba(225, 31, 38, 0.15)',
  },
  criteriaInfoText: {
    fontSize: typography.sizes.xs,
    color: colors.primary,
    fontWeight: typography.weights.semibold,
  },
});


