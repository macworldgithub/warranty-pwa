import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  RefreshControl,
  ActivityIndicator,
  Alert,
  ScrollView,
  Image,
} from 'react-native';
import { colors } from '../../theme/colors';
import { Icon } from '../../components/common/Icon';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LoanAgreement, LoanAgreementKpis, Site, WarrantyCase } from '../../types';
import { loanAgreementsApi } from '../../api';
import { casesApi } from '../../api/cases.api';
import { sitesApi } from '../../api/sites.api';
import { offlineStorage } from '../../services/offlineStorage';
import { Key, Home, Car, Plus, LogOut, Wrench } from 'lucide-react-native';
import { BottomNavBar } from '../../components/common/BottomNavBar';
import { AssignedRooftopsCard } from '../../components/common/AssignedRooftopsCard';
import { ReturnLoanerModal } from './ReturnLoanerModal';
import { IssueLoanerWizardScreen } from './IssueLoanerWizardScreen';
import { LoanAgreementPdfModal } from './LoanAgreementPdfModal';
import { EditLoanerModal } from './EditLoanerModal';
import { LoanVehicleDetailsModal } from './LoanVehicleDetailsModal';
import { useAuth } from '../../context/AuthContext';
import { useGeofence } from '../../context/GeofenceContext';

import booranLogo from '../../assets/images/booran-motors-transparent.png';

interface LoanVehiclesScreenProps {
  onBack?: () => void;
  onOpenTickets?: (tab?: 'all' | 'awaiting') => void;
  onOpenVehicles?: () => void;
  onOpenProfile?: () => void;
  onStartNewCase?: () => void;
  onOpenRoadTest?: () => void;
  onOpenHome?: () => void;
  onOpenHoists?: () => void;
  onLogout?: () => void;
}

export const getDynamicLoanCategory = (
  status?: string,
  dueBackDateTime?: string
): 'RETURNED' | 'OVERDUE' | 'DUE_SOON' | 'ACTIVE' => {
  if (status === 'RETURNED' || status === 'CANCELLED') {
    return 'RETURNED';
  }
  if (!dueBackDateTime) {
    return 'ACTIVE';
  }

  const now = Date.now();
  const dueTime = new Date(dueBackDateTime).getTime();
  const in60Min = now + 60 * 60 * 1000;

  if (dueTime < now) {
    return 'OVERDUE';
  }
  if (dueTime <= in60Min) {
    return 'DUE_SOON';
  }
  return 'ACTIVE';
};

export const LoanVehiclesScreen: React.FC<LoanVehiclesScreenProps> = ({
  onBack,
  onOpenTickets,
  onOpenVehicles,
  onOpenProfile,
  onStartNewCase,
  onOpenRoadTest,
  onOpenHome,
  onOpenHoists,
  onLogout,
}) => {
  const insets = useSafeAreaInsets();
  const { user, activeSiteId, logout } = useAuth();
  const { presenceStatus } = useGeofence();
  const isOnSite = presenceStatus === 'ON_SITE';

  const handleLogout = () => {
    Alert.alert(
      'Log Out',
      'Are you sure you want to log out of Booran Motors Portal?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Log Out',
          style: 'destructive',
          onPress: () => {
            onLogout ? onLogout() : logout();
          },
        },
      ]
    );
  };

  const isTechnician = user?.role === 'TECHNICIAN';
  const isClerk = user?.role === 'CLERK';
  const isNetworkAdmin = user?.role === 'ADMIN' || user?.role === 'SERVICE_MANAGER';
  const assignedSiteIds = user?.authorizedSiteIds?.length ? user.authorizedSiteIds : [];
  const technicianSiteId = isNetworkAdmin ? 'all' : activeSiteId || user?.defaultSiteId || assignedSiteIds[0] || '';
  const [siteDirectory, setSiteDirectory] = useState<Site[] | null>();
  const siteOptions = useMemo(() => siteDirectory ?? [], [siteDirectory]);
  const siteById = useCallback((siteId?: string) => siteOptions.find((site) => site.id === siteId), [siteOptions]);
  const siteLabel = useCallback((site?: Site) => {
    if (!site) return 'Assigned rooftop';
    return (site.name || site.id).replace(/^Booran\s+/i, '').split(/\s+/)[0] || site.name || site.id;
  }, []);
  const technicianSiteObj = siteById(technicianSiteId);

  const [awaitingCount, setAwaitingCount] = useState(0);

  useEffect(() => {
    let mounted = true;
    sitesApi.getSites()
      .then((sites) => {
        if (!mounted) return;
        setSiteDirectory((sites || []).filter((site) => site.isActive !== false));
      })
      .catch((err) => {
        console.warn('[LoanVehiclesScreen] Failed to load rooftops:', err?.message || err);
        if (mounted) setSiteDirectory(null);
      });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    const fetchAwaitingCount = async () => {
      try {
        const data = await casesApi.getCases({ limit: 100 });
        const pending = offlineStorage.getPendingUploads();
        const serverList: WarrantyCase[] = Array.isArray(data) ? data : ((data as any)?.data ?? []);
        const serverIds = new Set(serverList.map((c: WarrantyCase) => c.id));
        const merged = [
          ...pending.filter((p) => !serverIds.has(p.id)),
          ...serverList,
        ];
        const count = merged.filter((c) => c.status === 'Awaiting Review').length;
        setAwaitingCount(count);
      } catch {
        setAwaitingCount(0);
      }
    };
    fetchAwaitingCount();
  }, []);

  const getUserInitials = (name?: string) => {
    if (!name) return 'SH';
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
      return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  };

  const [selectedSiteId, setSelectedSiteId] = useState(
    isClerk || isTechnician ? technicianSiteId : 'all'
  );
  const [activeTab, setActiveTab] = useState<'ALL' | 'ON_LOAN' | 'RETURNED' | 'TODAY'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [agreements, setAgreements] = useState<LoanAgreement[]>([]);

  // Modals / Subscreens
  const [isWizardOpen, setIsWizardOpen] = useState(false);
  const [wizardPurpose, setWizardPurpose] = useState<'SERVICE_LOANER' | 'TEST_DRIVE'>('SERVICE_LOANER');
  const [returnTarget, setReturnTarget] = useState<LoanAgreement | null>(null);
  const [pdfTarget, setPdfTarget] = useState<LoanAgreement | null>(null);
  const [detailsTarget, setDetailsTarget] = useState<LoanAgreement | null>(null);
  const [editTarget, setEditTarget] = useState<LoanAgreement | null>(null);

  const handleDeleteAgreement = (agreement: LoanAgreement) => {
    Alert.alert(
      'Delete Loan Vehicle Record',
      `Are you sure you want to delete agreement ${agreement.agreementNumber} (${agreement.vehicle?.rego})? This action cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              let pendingDeletion = false;
              try {
                const result = await loanAgreementsApi.deleteAgreement(agreement.id); pendingDeletion = !!result.syncPending;
              } catch (apiErr) {
                throw apiErr;
              }
              setAgreements((prev) => prev.filter((a) => a.id !== agreement.id));
              setDetailsTarget(null);
              Alert.alert(pendingDeletion ? 'Deletion Saved Offline' : 'Deleted', pendingDeletion ? 'The record is removed from this device and its server deletion will sync when connected.' : `Loan agreement ${agreement.agreementNumber} has been removed.`);
            } catch (err: any) {
              Alert.alert('Error', err?.message || 'Failed to delete loan agreement.');
            }
          },
        },
      ]
    );
  };

  useEffect(() => {
    if (isClerk || isTechnician) {
      setSelectedSiteId(technicianSiteId);
    }
  }, [isTechnician, isClerk, technicianSiteId]);

  const fetchLoanData = useCallback(async () => {
    try {
      setLoading(true);
      const data = await loanAgreementsApi.findAll(selectedSiteId !== 'all' ? selectedSiteId : undefined);
      setAgreements(Array.isArray(data) ? data : []);
    } catch (err: any) {
      console.warn('Failed to load loan agreements:', err?.message);
      setAgreements([]);
      Alert.alert('Unable to Load Loans', err?.message || 'Please check your connection and retry.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [isClerk, selectedSiteId]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchLoanData();
  };

  useEffect(() => {
    fetchLoanData();
  }, [fetchLoanData]);

  const openAgreementWizard = (purpose: 'SERVICE_LOANER' | 'TEST_DRIVE' = 'SERVICE_LOANER') => {
    setWizardPurpose(purpose);
    setIsWizardOpen(true);
  };

  const chooseAgreementPurpose = () => {
    Alert.alert(
      'Issue Loan Agreement',
      'Select agreement purpose:',
      [
        {
          text: 'Service Loan Vehicle',
          onPress: () => {
            setWizardPurpose('SERVICE_LOANER');
            setIsWizardOpen(true);
          },
        },
        {
          text: 'Customer Test Drive',
          onPress: () => {
            setWizardPurpose('TEST_DRIVE');
            setIsWizardOpen(true);
          },
        },
        { text: 'Cancel', style: 'cancel' },
      ]
    );
  };

  const todayDateStr = new Date().toDateString();

  const filteredAgreements = agreements.filter((ag) => {
    const effectiveSiteId = isTechnician || isClerk ? technicianSiteId : selectedSiteId;
    if (isClerk && ag.siteId !== technicianSiteId) {
      return false;
    }
    if (effectiveSiteId !== 'all' && ag.siteId !== effectiveSiteId && selectedSiteId !== 'all') {
      return false;
    }

    const category = getDynamicLoanCategory(ag.status, ag.dueBackDateTime);

    if (activeTab === 'ON_LOAN' && category === 'RETURNED') return false;
    if (activeTab === 'RETURNED' && category !== 'RETURNED') return false;
    if (activeTab === 'TODAY') {
      const createdAt = ag.createdAt ? new Date(ag.createdAt).toDateString() : null;
      if (createdAt !== todayDateStr) return false;
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchRego = ag.vehicle?.rego?.toLowerCase().includes(q);
      const matchCust = ag.customer?.name?.toLowerCase().includes(q);
      const matchPhone = ag.customer?.mobile?.toLowerCase().includes(q);
      const matchAgNum = ag.agreementNumber?.toLowerCase().includes(q);
      const matchRo = ag.roNumber?.toLowerCase().includes(q);
      return matchRego || matchCust || matchPhone || matchAgNum || matchRo;
    }

    return true;
  });

  const activeLoaners = filteredAgreements.filter((ag) => {
    const cat = getDynamicLoanCategory(ag.status, ag.dueBackDateTime);
    return cat !== 'RETURNED';
  });

  const historicalForms = filteredAgreements.filter((ag) => {
    const cat = getDynamicLoanCategory(ag.status, ag.dueBackDateTime);
    return cat === 'RETURNED';
  });

  const scopedAgreements = agreements.filter((ag) =>
    !isClerk || ag.siteId === technicianSiteId
  );
  const onLoanCount = scopedAgreements.filter((ag) => getDynamicLoanCategory(ag.status, ag.dueBackDateTime) !== 'RETURNED').length;
  const returnedCount = scopedAgreements.filter((ag) => getDynamicLoanCategory(ag.status, ag.dueBackDateTime) === 'RETURNED').length;
  const todayCount = scopedAgreements.filter((ag) => ag.createdAt && new Date(ag.createdAt).toDateString() === todayDateStr).length;
  const totalCount = scopedAgreements.length;

  const currentSiteName = selectedSiteId === 'all' ? 'All Rooftops & Dealerships' : (siteById(selectedSiteId)?.name || selectedSiteId);

  // If Wizard open, render it full screen
  if (isWizardOpen) {
    const activeLabel = isTechnician || isClerk
      ? siteLabel(technicianSiteObj)
      : siteLabel(siteById(selectedSiteId));

    return (
      <IssueLoanerWizardScreen
        initialRooftop={activeLabel}
        isRooftopLocked={isTechnician || isClerk}
        allowedSiteIds={isClerk ? [technicianSiteId] : undefined}
        purpose={wizardPurpose}
        onBack={() => setIsWizardOpen(false)}
        onSuccess={(_newAgreement) => {
          setIsWizardOpen(false);
          setAgreements((prev) => [_newAgreement, ...prev.filter((a) => a.id !== _newAgreement.id)]);
          fetchLoanData();
        }}
      />
    );
  }

  return (
    <View style={styles.container}>
      {/* ── RED TOP BRANDED HEADER ─────────────────────────────────────── */}
      <View style={[styles.topHeader, { paddingTop: insets.top + 6 }]}>
        <View style={styles.logoWrap}>
          <Image source={{ uri: booranLogo }} style={styles.logoImage} resizeMode="contain" />
        </View>

        <View style={styles.headerRight}>
          <View style={styles.locationPill}>
            <View
              style={[
                styles.locationDot,
                isOnSite ? styles.locationDotOnSite : styles.locationDotOffSite,
              ]}
            />
            <Text style={styles.locationPillText}>
              {isOnSite ? 'ON-SITE' : 'OFF-SITE'}
            </Text>
          </View>

          <TouchableOpacity style={styles.bellBtn} onPress={() => { }} activeOpacity={0.75}>
            <Icon name="bell" size={18} color="#FFF" />
            {awaitingCount > 0 && (
              <View style={styles.bellBadge}>
                <Text style={styles.bellBadgeText}>{awaitingCount > 9 ? '9+' : awaitingCount}</Text>
              </View>
            )}
          </TouchableOpacity>

          {/* Logout Button on Extreme Right */}
          <TouchableOpacity
            style={styles.logoutBtn}
            onPress={handleLogout}
            activeOpacity={0.75}
            accessibilityLabel="Log Out"
          >
            <LogOut size={18} color="#FFF" strokeWidth={2.2} />
          </TouchableOpacity>
        </View>
      </View>

      {/* ── SCROLLABLE BODY ─────────────────────────────────────────────── */}
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: Math.max(insets.bottom + 90, 110) }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        showsVerticalScrollIndicator={false}
      >
        {/* ── ASSIGNED ROOFTOP CARD ──────────────────────────── */}
        {isNetworkAdmin ? (
          <View style={styles.rooftopCard}>
            <View style={styles.rooftopCardLeft}>
              <View style={styles.rooftopIconBox}>
                <Icon name="home" size={18} color={colors.primary} />
              </View>
              <View style={styles.rooftopCardText}>
                <Text style={styles.rooftopCardLabel}>ADMIN NETWORK VIEW</Text>
                <Text style={styles.rooftopCardName} numberOfLines={1}>{currentSiteName}</Text>
              </View>
            </View>
            <View style={styles.assignedBadge}>
              <Icon name="lock" size={12} color={colors.textSecondary} />
              <Text style={styles.assignedBadgeText}>All Sites</Text>
            </View>
          </View>
        ) : (
          <AssignedRooftopsCard sites={siteDirectory} currentSiteId={technicianSiteId} testID="loaners-assigned-rooftops" />
        )}

        {isNetworkAdmin && (
          <View style={styles.siteFilterBlock}>
            <Text style={styles.siteFilterLabel}>Filter by rooftop</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.siteFilterRow}
            >
              <TouchableOpacity
                activeOpacity={0.75}
                onPress={() => setSelectedSiteId('all')}
                style={[
                  styles.siteFilterChip,
                  selectedSiteId === 'all' ? styles.siteFilterChipActive : styles.siteFilterChipInactive,
                ]}
              >
                <Text
                  style={[
                    styles.siteFilterChipText,
                    selectedSiteId === 'all' && styles.siteFilterChipTextActive,
                  ]}
                >
                  All Rooftops
                </Text>
              </TouchableOpacity>

              {siteOptions.map((site) => {
                const isSelected = selectedSiteId === site.id;
                return (
                  <TouchableOpacity
                    key={site.id}
                    activeOpacity={0.75}
                    onPress={() => setSelectedSiteId(site.id)}
                    style={[
                      styles.siteFilterChip,
                      isSelected ? styles.siteFilterChipActive : styles.siteFilterChipInactive,
                    ]}
                  >
                    <Text
                      style={[
                        styles.siteFilterChipText,
                        isSelected && styles.siteFilterChipTextActive,
                      ]}
                      numberOfLines={1}
                    >
                      {site.name}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        )}

        {/* ── HERO SECTION ───────────────────────────────────── */}
        <View style={styles.heroSection}>
          <Text style={styles.heroEyebrow}>COURTESY VEHICLES</Text>
          <Text style={styles.heroTitle}>Loan vehicles.</Text>
          <Text style={styles.heroDesc}>
            Issue a loaner with a short agreement. Search any past form by customer, rego or agreement #.
          </Text>
        </View>

        {/* ── KPI STAT CARDS ─────────────────────────────────── */}
        <View style={styles.kpiRow}>
          <View style={[styles.kpiCard, styles.kpiCardLeft]}>
            <View style={styles.kpiIconBox}>
              <Key size={20} color={colors.primary} />
            </View>
            <View style={styles.kpiTextWrap}>
              <Text style={styles.kpiVal}>{onLoanCount}</Text>
              <Text style={styles.kpiLabel}>ON LOAN</Text>
            </View>
          </View>

          <View style={[styles.kpiCard, styles.kpiCardRight]}>
            <View style={[styles.kpiIconBox, styles.kpiIconBoxGray]}>
              <Icon name="file-text" size={20} color={colors.textSecondary} />
            </View>
            <View style={styles.kpiTextWrap}>
              <Text style={[styles.kpiVal, { color: colors.textPrimary }]}>{returnedCount}</Text>
              <Text style={styles.kpiLabel}>PAST AGREEMENTS</Text>
            </View>
          </View>
        </View>

        {/* ── SEARCH BAR ─────────────────────────────────────── */}
        <View style={styles.searchWrap}>
          <Icon name="search" size={16} color={colors.textMuted} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search historical forms by name, rego, or #..."
            placeholderTextColor={colors.textMuted}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
              <Icon name="x" size={14} color={colors.textMuted} />
            </TouchableOpacity>
          )}
        </View>

        {/* ── FILTER TABS ────────────────────────────────────── */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabsScroll} contentContainerStyle={styles.tabsContent}>
          {[
            { key: 'ALL', label: `All (${totalCount})` },
            { key: 'ON_LOAN', label: `On loan (${onLoanCount})` },
            { key: 'RETURNED', label: `Returned (${returnedCount})` },
            { key: 'TODAY', label: `Today (${todayCount})` },
          ].map((tab) => {
            const isActive = activeTab === tab.key;
            return (
              <TouchableOpacity
                key={tab.key}
                style={[styles.filterTab, isActive && styles.filterTabActive]}
                onPress={() => setActiveTab(tab.key as typeof activeTab)}
                activeOpacity={0.75}
              >
                <Text style={[styles.filterTabText, isActive && styles.filterTabTextActive]}>
                  {tab.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* ── ACTIVE LOANERS SECTION ─────────────────────────── */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Active loaners</Text>
          <Text style={styles.sectionCount}>{activeLoaners.length} out</Text>
        </View>

        {loading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={styles.loadingText}>Fetching loan agreements...</Text>
          </View>
        ) : (
          activeLoaners.map((item) => {
            const isOverdue = getDynamicLoanCategory(item.status, item.dueBackDateTime) === 'OVERDUE';

            return (
              <View key={item.id} style={styles.activeLoanCard}>
                {/* Customer row */}
                <View style={styles.activeLoanTop}>
                  <View style={styles.customerAvatar}>
                    <Icon name="user" size={18} color="#D71920" />
                  </View>
                  <View style={styles.activeLoanMeta}>
                    <Text style={styles.customerName}>{item.customer?.name || 'Priya Nair'}</Text>
                    <View style={styles.activeBadgesRow}>
                      <View style={styles.onLoanBadge}>
                        <Text style={styles.onLoanBadgeText}>ON LOAN</Text>
                      </View>
                      <View style={styles.agreementNumBadge}>
                        <Text style={styles.agreementNumText}>AGREEMENT #{item.agreementNumber || 'LA-2041'}</Text>
                      </View>
                    </View>
                  </View>
                </View>

                {/* 2-Column Specs: Loaner vs Customer Vehicle */}
                <View style={styles.twoColSpecs}>
                  <View style={styles.colSpecItem}>
                    <Text style={styles.specLabel}>Loaner</Text>
                    <Text style={styles.specValueMain}>
                      {item.vehicle?.model?.toUpperCase() || 'BYD DOLPHIN'} • {item.vehicle?.rego || 'CRN-882'}
                    </Text>
                  </View>
                  <View style={styles.colSpecDivider} />
                  <View style={styles.colSpecItem}>
                    <Text style={styles.specLabel}>Customer vehicle in for work</Text>
                    <Text style={styles.specValueMain}>
                      {item.roNumber ? `2024 BYD ATTO 3 • ${item.roNumber}` : '2024 BYD ATTO 3 • 1BY-9EV'}
                    </Text>
                  </View>
                </View>

                {/* Out & Due time */}
                <View style={styles.timeRow}>
                  <Icon name="clock" size={13} color="#64748B" />
                  <Text style={styles.timeText}>
                    Out 29 Sep • <Text style={styles.dueHighlightText}>Due today 6:00 pm</Text>
                  </Text>
                </View>

                {/* Action Buttons: Outlined View Agreement & Red Mark Returned */}
                <View style={styles.cardBtnRow}>
                  <TouchableOpacity
                    style={styles.outlineViewBtn}
                    onPress={() => setDetailsTarget(item)}
                    activeOpacity={0.8}
                  >
                    <Icon name="file-text" size={15} color="#D71920" />
                    <Text style={styles.outlineViewBtnText}>View agreement</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.filledReturnBtn}
                    onPress={() => setReturnTarget(item)}
                    activeOpacity={0.85}
                  >
                    <Icon name="check-circle" size={15} color="#FFFFFF" />
                    <Text style={styles.filledReturnBtnText}>Mark returned</Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          })
        )}

        {/* ── HISTORICAL FORMS SECTION ───────────────────────── */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Historical forms</Text>
          <Text style={styles.sectionCount}>{historicalForms.length} agreements</Text>
        </View>

        {historicalForms.map((item) => (
          <TouchableOpacity
            key={item.id}
            style={styles.historicalRow}
            onPress={() => setDetailsTarget(item)}
            activeOpacity={0.7}
          >
            <View style={styles.historyDocIcon}>
              <Icon name="file-text" size={16} color="#64748B" />
            </View>
            <View style={styles.historyInfo}>
              <Text style={styles.historyId}>{item.agreementNumber || 'LA-2038'}</Text>
              <Text style={styles.historySub}>
                {item.customer?.name || 'James Cole'} • {item.vehicle?.rego || '1BY-4EV'} loaner
              </Text>
            </View>
            <View style={styles.historyRight}>
              <Text style={styles.historyDateText}>Returned 28 Sep</Text>
              <View style={styles.signedPill}>
                <Text style={styles.signedPillText}>SIGNED</Text>
              </View>
            </View>
            <Icon name="chevron-right" size={16} color="#94A3B8" />
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* ── BOTTOM NAVIGATION BAR ───────────────────────────────────────── */}
      <BottomNavBar
        activeTab="loaner"
        onOpenHome={onOpenHome || (() => onOpenTickets?.('all'))}
        onOpenDrive={onOpenRoadTest}
        onOpenHoists={onOpenHoists}
        onOpenLoaners={() => {}}
        onOpenVehicles={onOpenVehicles}
        onOpenTickets={onOpenTickets ? (tab) => onOpenTickets(tab as any) : undefined}
        onOpenProfile={onOpenProfile}
        actionButton={{
          label: 'New Agreement',
          icon: 'plus',
          onPress: chooseAgreementPurpose,
        }}
      />

      {/* ── MODALS ─────────────────────────────────────────────────────── */}
      <ReturnLoanerModal
        visible={returnTarget !== null}
        agreement={returnTarget}
        onClose={() => setReturnTarget(null)}
        onReturnCompleted={(_updated) => {
          setReturnTarget(null);
          setAgreements((prev) => prev.map((a) => (a.id === _updated.id ? _updated : a)));
          fetchLoanData();
        }}
      />

      <LoanVehicleDetailsModal
        visible={detailsTarget !== null}
        agreement={detailsTarget}
        onClose={() => setDetailsTarget(null)}
        onEdit={(ag) => {
          setDetailsTarget(null);
          setEditTarget(ag);
        }}
        onViewPdf={(ag) => {
          setDetailsTarget(null);
          setPdfTarget(ag);
        }}
        onReturn={(ag) => {
          setDetailsTarget(null);
          setReturnTarget(ag);
        }}
        onDelete={(ag) => {
          handleDeleteAgreement(ag);
        }}
      />

      <EditLoanerModal
        visible={editTarget !== null}
        agreement={editTarget}
        onClose={() => setEditTarget(null)}
        onUpdateCompleted={(_updated) => {
          setEditTarget(null);
          setAgreements((prev) => prev.map((a) => (a.id === _updated.id ? _updated : a)));
          fetchLoanData();
        }}
      />

      <LoanAgreementPdfModal
        visible={pdfTarget !== null}
        agreement={pdfTarget}
        onClose={() => setPdfTarget(null)}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F1F5F9',
  },
  topHeader: {
    backgroundColor: '#D71920',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 14,
  },
  logoWrap: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  logoImage: {
    width: 140,
    height: 38,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  locationPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(0, 0, 0, 0.25)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
  },
  locationDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  locationDotOnSite: {
    backgroundColor: '#10B981',
  },
  locationDotOffSite: {
    backgroundColor: '#F59E0B',
  },
  locationPillText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#FFF',
    letterSpacing: 0.5,
  },
  bellBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.18)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoutBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.18)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bellBadge: {
    position: 'absolute',
    top: -2,
    right: -2,
    backgroundColor: '#FFFFFF',
    borderRadius: 9,
    width: 17,
    height: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bellBadgeText: {
    fontSize: 9,
    fontWeight: '900',
    color: '#D71920',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 14,
    gap: 12,
  },
  rooftopCard: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  rooftopCardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  rooftopIconBox: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#FEE2E2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rooftopCardText: {
    flex: 1,
  },
  rooftopCardLabel: {
    fontSize: 9,
    fontWeight: '800',
    color: '#D71920',
    letterSpacing: 0.8,
    marginBottom: 2,
  },
  rooftopCardName: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
  },
  assignedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  assignedBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#475569',
  },
  siteFilterBlock: {
    marginBottom: 2,
  },
  siteFilterLabel: {
    fontSize: 11,
    fontWeight: '900',
    color: '#64748B',
    letterSpacing: 0.7,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  siteFilterRow: {
    gap: 8,
    paddingRight: 6,
  },
  siteFilterChip: {
    maxWidth: 220,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 18,
    borderWidth: 1,
  },
  siteFilterChipActive: {
    backgroundColor: '#D71920',
    borderColor: '#D71920',
  },
  siteFilterChipInactive: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E2E8F0',
  },
  siteFilterChipText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#64748B',
  },
  siteFilterChipTextActive: {
    color: '#FFFFFF',
  },
  heroSection: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  heroEyebrow: {
    fontSize: 10,
    fontWeight: '800',
    color: '#D71920',
    letterSpacing: 1.2,
    marginBottom: 4,
  },
  heroTitle: {
    fontSize: 26,
    fontWeight: '900',
    color: '#0F172A',
    marginBottom: 4,
  },
  heroDesc: {
    fontSize: 13,
    color: '#64748B',
    lineHeight: 18,
  },
  kpiRow: {
    flexDirection: 'row',
    gap: 10,
  },
  kpiCard: {
    flex: 1,
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  kpiCardLeft: {},
  kpiCardRight: {},
  kpiIconBox: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#FEE2E2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  kpiIconBoxGray: {
    backgroundColor: '#F1F5F9',
  },
  kpiTextWrap: {},
  kpiVal: {
    fontSize: 22,
    fontWeight: '900',
    color: '#0F172A',
    lineHeight: 25,
  },
  kpiLabel: {
    fontSize: 9.5,
    fontWeight: '800',
    color: '#64748B',
    letterSpacing: 0.5,
  },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 42,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    color: '#0F172A',
  },
  tabsScroll: {
    marginVertical: -2,
  },
  tabsContent: {
    gap: 8,
  },
  filterTab: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 18,
    backgroundColor: '#FFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  filterTabActive: {
    backgroundColor: '#D71920',
    borderColor: '#D71920',
  },
  filterTabText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
  },
  filterTabTextActive: {
    color: '#FFF',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#0F172A',
  },
  sectionCount: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '600',
  },
  activeLoanCard: {
    backgroundColor: '#FFF',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 12,
  },
  activeLoanTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  customerAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#FEE2E2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  activeLoanMeta: {
    flex: 1,
  },
  customerName: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 3,
  },
  activeBadgesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  onLoanBadge: {
    backgroundColor: '#FEE2E2',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 4,
  },
  onLoanBadgeText: {
    fontSize: 9.5,
    fontWeight: '800',
    color: '#D71920',
  },
  agreementNumBadge: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 4,
  },
  agreementNumText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#64748B',
  },
  twoColSpecs: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FAFAFA',
    borderRadius: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  colSpecItem: {
    flex: 1,
  },
  colSpecDivider: {
    width: 1,
    height: '100%',
    backgroundColor: '#E2E8F0',
    marginHorizontal: 10,
  },
  specLabel: {
    fontSize: 10,
    color: '#94A3B8',
    marginBottom: 2,
  },
  specValueMain: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#0F172A',
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  timeText: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '600',
  },
  dueHighlightText: {
    color: '#DC2626',
    fontWeight: '800',
  },
  cardBtnRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 2,
  },
  outlineViewBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: '#D71920',
    backgroundColor: '#FFF',
    gap: 6,
  },
  outlineViewBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#D71920',
  },
  filledReturnBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#D71920',
    gap: 6,
  },
  filledReturnBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#FFF',
  },
  historicalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 10,
  },
  historyDocIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F8FAFC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  historyInfo: {
    flex: 1,
  },
  historyId: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0F172A',
  },
  historySub: {
    fontSize: 11,
    color: '#64748B',
  },
  historyRight: {
    alignItems: 'flex-end',
    gap: 2,
  },
  historyDateText: {
    fontSize: 10.5,
    color: '#64748B',
    fontWeight: '500',
  },
  signedPill: {
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  signedPillText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#166534',
  },
  loadingWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 30,
  },
  loadingText: {
    marginTop: 8,
    fontSize: 12,
    color: '#64748B',
  },
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    minHeight: 84,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingHorizontal: 6,
    paddingTop: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 12,
  },
  bottomTab: {
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 42,
    paddingHorizontal: 2,
    gap: 3,
  },
  bottomTabLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#64748B',
    letterSpacing: -0.1,
  },
  newAgreementBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#D71920',
    borderRadius: 24,
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 6,
    shadowColor: '#D71920',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },
  newAgreementBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },
  bottomAvatar: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#FEE2E2',
    borderWidth: 1.5,
    borderColor: '#D71920',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bottomAvatarText: {
    fontSize: 9.5,
    fontWeight: '800',
    color: '#D71920',
  },
});
