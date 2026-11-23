import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Image,
  Modal,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../../theme/colors';
import { typography } from '../../theme/typography';
import { spacing } from '../../theme/spacing';
import { Icon } from '../../components/common/Icon';
import { Button } from '../../components/common/Button';
import { useAuth } from '../../context/AuthContext';
import { useNetwork } from '../../context/NetworkContext';
import { ForgotPasswordModal } from '../../components/auth/ForgotPasswordModal';
import { authApi } from '../../api/auth.api';
import { sitesApi } from '../../api/sites.api';
import { Site } from '../../types';
import { InstallAppButton } from '../../../web/InstallAppButton';

import booranLogo from '../../assets/images/booran-motors-transparent.png';

interface LoginScreenProps {
  onLoginSuccess: () => void;
}

type AuthTab = 'PIN_SETUP' | 'SIGN_IN';
type FieldIcon = 'mail' | 'lock' | 'user' | 'shield' | 'building';
type ActionIcon = 'eye' | 'eye-off';

const FALLBACK_SITES: Site[] = [
  { id: 'site_cranbourne_byd', name: 'Booran BYD Cranbourne', code: 'CRN_BYD', isActive: true },
  { id: 'site_dandenong_hyundai', name: 'Booran Hyundai Dandenong', code: 'DND_HYU', isActive: true },
  { id: 'site_south_morang_chery', name: 'South Morang Chery (Oleander Dr)', code: 'SMR_CHY', isActive: true },
  { id: 'site_cheltenham_mg', name: 'Booran MG Cheltenham', code: 'CHL_MG', isActive: true },
  { id: 'site_berwick_kia', name: 'Booran Kia Berwick', code: 'BWK_KIA', isActive: true },
  { id: 'site_dandenong_mitsubishi', name: 'Booran Mitsubishi Dandenong', code: 'DND_MIT', isActive: true },
];

export const LoginScreen: React.FC<LoginScreenProps> = ({ onLoginSuccess }) => {
  const insets = useSafeAreaInsets();
  const {
    login,
    logout,
    registerTechnician,
    isLoading,
    sessionEnded,
  } = useAuth();
  const { serverUrl, setServerUrl, isOnline, checkConnectivity } = useNetwork();

  // Mode: PIN_SETUP (First Login Flow) or SIGN_IN (Existing User Login)
  const [activeTab, setActiveTab] = useState<AuthTab>(sessionEnded ? 'SIGN_IN' : 'PIN_SETUP');
  const [selectedLoginRole, setSelectedLoginRole] = useState<'TECHNICIAN' | 'CLERK'>('TECHNICIAN');

  // PIN Setup Phase: 1 = Enter PIN, 2 = Set Username, Password & Specific Sites
  const [pinStep, setPinStep] = useState<1 | 2>(1);
  const [verifyingPin, setVerifyingPin] = useState(false);
  const [pinRetryUntil, setPinRetryUntil] = useState(0);
  const [secondsRemaining, setSecondsRemaining] = useState(0);

  useEffect(() => {
    if (!pinRetryUntil) return;
    const timer = setInterval(() => {
      const remaining = Math.max(0, Math.ceil((pinRetryUntil - Date.now()) / 1000));
      setSecondsRemaining(remaining);
      if (!remaining) setPinRetryUntil(0);
    }, 250);
    return () => clearInterval(timer);
  }, [pinRetryUntil]);

  const countdownMessage = secondsRemaining > 0
    ? 'Too many PIN attempts. Try again in ' + Math.floor(secondsRemaining / 60) + ':' +
      String(secondsRemaining % 60).padStart(2, '0') + '.'
    : null;

  const startPinCountdown = (error: unknown) => {
    const apiError = error as { statusCode?: number; data?: { retryAfterSeconds?: number } } | null;
    const seconds = apiError?.data?.retryAfterSeconds;
    if (apiError?.statusCode !== 429 || typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds <= 0) {
      return false;
    }
    setSecondsRemaining(Math.ceil(seconds));
    setPinRetryUntil(Date.now() + seconds * 1000);
    return true;
  };

  const [enteredPin, setEnteredPin] = useState('');
  const [pinError, setPinError] = useState<string | null>(null);

  // Setup Form Fields
  const [signUpName, setSignUpName] = useState('');
  const [signUpUsername, setSignUpUsername] = useState('');
  const [signUpPassword, setSignUpPassword] = useState('');
  const [signUpConfirmPassword, setSignUpConfirmPassword] = useState('');
  const [selectedSiteIds, setSelectedSiteIds] = useState<string[]>(['site_cranbourne_byd']);
  const primarySiteId = selectedSiteIds[0];

  // Sign In Form Fields
  const [signInEmail, setSignInEmail] = useState('');
  const [signInPassword, setSignInPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Rooftop options from backend
  const [rooftopOptions, setRooftopOptions] = useState<Site[]>(FALLBACK_SITES);
  const [loadingRooftops, setLoadingRooftops] = useState(true);
  const [showSitesModal, setShowSitesModal] = useState(false);

  // Status & Error Banners
  const [authError, setAuthError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [showDevConfig, setShowDevConfig] = useState(false);
  const [tempUrl, setTempUrl] = useState(serverUrl);

  // Forgot Password Modal
  const [showForgotPasswordModal, setShowForgotPasswordModal] = useState(false);

  useEffect(() => {
    let mounted = true;
    sitesApi.getSites()
      .then((sites) => {
        if (!mounted) return;
        const activeSites = (sites || []).filter((site) => site.isActive !== false);
        if (activeSites.length > 0) {
          setRooftopOptions(activeSites);
          setSelectedSiteIds([activeSites[0].id]);
        }
      })
      .catch((err) => {
        console.warn('[LoginScreen] Failed to load rooftops:', err?.message || err);
      })
      .finally(() => {
        if (mounted) setLoadingRooftops(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  // ── 1. PIN Step 1: Validate Workshop PIN ───────────────────────────
  const handleVerifyPin = async () => {
    if (verifyingPin || secondsRemaining > 0) return;
    setPinError(null);
    setAuthError(null);
    const cleanPin = enteredPin.trim();

    if (!cleanPin) {
      setPinError('Please enter your workshop access PIN.');
      return;
    }

    const isNumeric = /^\d{4}$/.test(cleanPin);
    if (!isNumeric) {
      setPinError('Workshop PIN must be exactly 4 digits.');
      return;
    }

    setVerifyingPin(true);
    try {
      await authApi.verifyWorkshopPin(cleanPin);
      setPinStep(2);
    } catch (error) {
      if (startPinCountdown(error)) return;
      setPinError(error instanceof Error ? error.message : 'Unable to verify workshop PIN.');
    } finally {
      setVerifyingPin(false);
    }
  };

  // ── 2. PIN Step 2: Create Account & Select Specific Sites ───────────
  const handleCompleteSetup = async () => {
    if (secondsRemaining > 0) return;
    setAuthError(null);
    setSuccessMessage(null);

    if (!signUpName.trim()) {
      setAuthError('Please enter your full name.');
      return;
    }
    if (!/^[a-z0-9][a-z0-9_.-]{2,39}$/i.test(signUpUsername.trim())) {
      setAuthError('Enter a username or employee number of 3–40 letters, digits, dots, underscores, or hyphens.');
      return;
    }
    if (signUpPassword.length < 6) {
      setAuthError('Password must be at least 6 characters.');
      return;
    }
    if (signUpPassword !== signUpConfirmPassword) {
      setAuthError('Passwords do not match.');
      return;
    }
    if (!primarySiteId) {
      setAuthError('Please select at least one dealership site.');
      return;
    }

    try {
      await registerTechnician({
        workshopPin: enteredPin.trim(),
        name: signUpName.trim(),
        username: signUpUsername.trim().toLowerCase(),
        password: signUpPassword,
        defaultSiteId: primarySiteId,
        authorizedSiteIds: selectedSiteIds,
      });

      onLoginSuccess();
    } catch (err: any) {
      if (startPinCountdown(err)) return;
      setAuthError(err.message || 'Unable to complete setup. Please check details.');
    }
  };

  // ── 3. Sign In with Username & Password (Returning User) ─────────────
  const handleSignIn = async () => {
    setAuthError(null);
    setSuccessMessage(null);
    if (!signInEmail.trim()) {
      setAuthError('Enter your username, employee number, or email.');
      return;
    }
    if (!signInPassword) {
      setAuthError('Enter your password.');
      return;
    }

    try {
      const authenticatedUser = await login(signInEmail.trim().toLowerCase(), signInPassword);
      if (authenticatedUser.role !== selectedLoginRole) {
        await logout();
        const role = authenticatedUser.role;
        if (role === 'ADMIN') {
          setAuthError('This is an Admin account. Please sign in through the Admin Portal.');
        } else if (role === 'CLERK' || role === 'TECHNICIAN') {
          setAuthError(`This account is registered as ${role === 'CLERK' ? 'a Warranty Clerk' : 'a Technician'}. Select the matching sign-in role.`);
        } else {
          setAuthError('This account role cannot sign in through the Technician or Warranty Clerk options. Please use the appropriate portal.');
        }
        return;
      }
      onLoginSuccess();
    } catch (err: any) {
      setAuthError(err.message || 'Unable to sign in. Please verify your credentials.');
    }
  };

  const switchTab = (tab: AuthTab) => {
    setActiveTab(tab);
    setAuthError(null);
    setPinError(null);
    setSuccessMessage(null);
    if (tab === 'PIN_SETUP') {
      setPinStep(1);
    }
  };

  const primarySiteObj = rooftopOptions.find((s) => s.id === primarySiteId) || rooftopOptions[0];

  return (
    <ScrollView
      style={[styles.container, { paddingTop: insets.top }]}
      contentContainerStyle={[
        styles.contentContainer,
        { paddingBottom: Math.max(insets.bottom + 48, 80) },
      ]}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.header}>
        <Image
          source={{ uri: booranLogo }}
          style={styles.brandLogo}
          resizeMode="contain"
        />
      </View>

      <View style={styles.welcomeBlock}>
        <Text style={styles.title}>
          {activeTab === 'PIN_SETUP'
            ? pinStep === 1
              ? 'First Login Activation'
              : 'Create Credentials'
            : 'Technician Sign In'}
        </Text>
        <Text style={styles.subtitle}>
          {activeTab === 'PIN_SETUP'
            ? pinStep === 1
              ? 'Enter your workshop access PIN to activate your device'
              : 'Set your username, password, and workshop access'
            : 'Sign in to access warranty tickets and evidence capture.'}
        </Text>
      </View>

      <TouchableOpacity
        style={styles.connectionRow}
        activeOpacity={0.8}
        onLongPress={() => {
          setTempUrl(serverUrl);
          setShowDevConfig((current) => !current);
        }}
      >
        <View style={[styles.connectionDot, { backgroundColor: isOnline ? colors.success : colors.warning }]} />
        <Text style={styles.connectionText}>{isOnline ? 'Booran Cloud Online' : 'Offline Mode'}</Text>
      </TouchableOpacity>

      {showDevConfig && (
        <View style={styles.configPanel}>
          <Text style={styles.configLabel}>API host</Text>
          <View style={styles.configRow}>
            <TextInput
              value={tempUrl}
              onChangeText={setTempUrl}
              style={styles.configInput}
              placeholder="https://warranty-evidence.omnisuiteai.com"
              placeholderTextColor={colors.textMuted}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <Button
              title="Apply"
              variant="secondary"
              size="sm"
              onPress={() => {
                setServerUrl(tempUrl);
                setShowDevConfig(false);
                checkConnectivity();
              }}
            />
          </View>
        </View>
      )}

      {/* Mode Tabs */}
      <View style={styles.modeSwitch}>
        <TouchableOpacity
          onPress={() => switchTab('PIN_SETUP')}
          style={[styles.modeButton, activeTab === 'PIN_SETUP' && styles.modeButtonActive]}
          activeOpacity={0.8}
        >
          <Icon
            name="shield"
            size={14}
            color={activeTab === 'PIN_SETUP' ? colors.textInverse : colors.textSecondary}
          />
          <Text style={[styles.modeText, activeTab === 'PIN_SETUP' && styles.modeTextActive]}>
            First Login (PIN)
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => switchTab('SIGN_IN')}
          style={[styles.modeButton, activeTab === 'SIGN_IN' && styles.modeButtonActive]}
          activeOpacity={0.8}
        >
          <Icon
            name="user"
            size={14}
            color={activeTab === 'SIGN_IN' ? colors.textInverse : colors.textSecondary}
          />
          <Text style={[styles.modeText, activeTab === 'SIGN_IN' && styles.modeTextActive]}>
            Sign In
          </Text>
        </TouchableOpacity>
      </View>

      {(authError || sessionEnded || (activeTab === 'PIN_SETUP' && pinStep === 2 && countdownMessage)) && (
        <View style={styles.errorBanner}>
          <Icon name="alert-circle" size={17} color={colors.danger} />
          <Text style={styles.errorText}>{(activeTab === 'PIN_SETUP' && pinStep === 2 && countdownMessage) || authError || 'Your session ended. Sign in again and look for your draft in Warranty Capture.'}</Text>
        </View>
      )}

      {successMessage && (
        <View style={styles.successBanner}>
          <Icon name="check-circle" size={17} color={colors.success} />
          <Text style={styles.successText}>{successMessage}</Text>
        </View>
      )}

      {/* ── FLOW 1: PIN CODE FIRST LOGIN ── */}
      {activeTab === 'PIN_SETUP' ? (
        pinStep === 1 ? (
          /* Step 1: Enter Workshop PIN */
          <View style={styles.form}>
            <View style={styles.pinCard}>
              <View style={styles.pinHeaderRow}>
                <View style={styles.pinIconCircle}>
                  <Icon name="lock" size={24} color={colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.pinCardTitle}>Dealership Workshop PIN</Text>
                  <Text style={styles.pinCardSub}>
                    Enter the 4-digit PIN provided by your service manager to verify your workshop access.
                  </Text>
                </View>
              </View>

              <View style={styles.pinInputContainer}>
                <TextInput
                  style={styles.pinLargeInput}
                  value={enteredPin}
                  onChangeText={(val) => {
                    setEnteredPin(val);
                    if (pinError) setPinError(null);
                  }}
                  placeholder="Enter PIN"
                  placeholderTextColor={colors.textMuted}
                  keyboardType="number-pad"
                  maxLength={4}
                  secureTextEntry
                  editable={!verifyingPin}
                  autoFocus
                />
              </View>

              {(countdownMessage || pinError) && (
                <View style={styles.pinErrorRow}>
                  <Icon name="alert-circle" size={14} color={colors.danger} />
                  <Text style={styles.pinErrorText}>{countdownMessage || pinError}</Text>
                </View>
              )}

              <Button
                title="Verify PIN & Continue"
                variant="primary"
                size="lg"
                onPress={handleVerifyPin}
                disabled={verifyingPin || secondsRemaining > 0}
                rightIcon={<Icon name="chevron-right" size={18} color={colors.textInverse} />}
                fullWidth
                style={styles.actionButton}
              />
            </View>
          </View>
        ) : (
          /* Step 2: Create Username, Password & Select Specific Sites (Compact Professional Dropdown) */
          <View style={styles.form}>
            <View style={styles.stepIndicatorRow}>
              <View style={styles.stepBadgeActive}>
                <Text style={styles.stepBadgeText}>Step 2 of 2</Text>
              </View>
              <TouchableOpacity
                onPress={() => setPinStep(1)}
                style={styles.changePinButton}
                activeOpacity={0.7}
              >
                <Icon name="refresh" size={12} color={colors.textSecondary} />
                <Text style={styles.changePinText}>Change PIN</Text>
              </TouchableOpacity>
            </View>

            <Field
              label="Full Name"
              icon="user"
              value={signUpName}
              onChangeText={setSignUpName}
              placeholder="e.g. Jake Smith"
            />

            <Field
              label="Username / Employee Number"
              icon="user"
              value={signUpUsername}
              onChangeText={setSignUpUsername}
              placeholder="e.g. jake.smith or 001234"
            />
            <Text style={styles.fieldLabel}>Use 3–40 letters, digits, dots, underscores, or hyphens. Each username or employee number must be unique.</Text>

            <Field
              label="Create Password"
              icon="lock"
              value={signUpPassword}
              onChangeText={setSignUpPassword}
              placeholder="At least 6 characters"
              secureTextEntry={!showPassword}
              rightIcon={showPassword ? 'eye-off' : 'eye'}
              onRightIconPress={() => setShowPassword(!showPassword)}
            />

            <Field
              label="Confirm Password"
              icon="lock"
              value={signUpConfirmPassword}
              onChangeText={setSignUpConfirmPassword}
              placeholder="Re-enter password"
              secureTextEntry={!showPassword}
            />

            {/* Compact Professional Dealership Sites Dropdown */}
            <View style={styles.field}>
              <Text style={styles.fieldLabel}>DEALERSHIP SITES</Text>

              <TouchableOpacity
                style={styles.dropdownSelector}
                onPress={() => setShowSitesModal(true)}
                activeOpacity={0.75}
              >
                <View style={styles.dropdownLeft}>
                  <Icon name="building" size={18} color={colors.primary} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.dropdownPrimarySiteText} numberOfLines={1}>
                      {selectedSiteIds.length ? `${primarySiteObj?.name || 'Workshop'}${selectedSiteIds.length > 1 ? ` + ${selectedSiteIds.length - 1} more` : ''}` : 'Select your workshops'}
                    </Text>
                    <Text style={styles.dropdownSubtext}>Select all rooftops you work at. The first selected site is your primary workshop.</Text>
                  </View>
                </View>
                <View style={styles.dropdownRightAction}>
                  <Text style={styles.dropdownEditText}>Edit</Text>
                  <Icon name="chevron-down" size={16} color={colors.textSecondary} />
                </View>
              </TouchableOpacity>
            </View>

            <Button
              title="Complete Setup & Enter Workshop"
              variant="primary"
              size="lg"
              loading={isLoading}
              onPress={handleCompleteSetup}
              disabled={secondsRemaining > 0}
              fullWidth
              style={styles.actionButton}
            />
          </View>
        )
      ) : (
        /* ── FLOW 2: RETURNING USER SIGN IN ── */
        <View style={styles.form}>
          <Text style={styles.fieldLabel}>Sign in as</Text>
          <View style={styles.modeSwitch}>
            {(['TECHNICIAN', 'CLERK'] as const).map((role) => (
              <TouchableOpacity
                key={role}
                onPress={() => setSelectedLoginRole(role)}
                style={[styles.modeButton, selectedLoginRole === role && styles.modeButtonActive]}
                activeOpacity={0.8}
                accessibilityRole="radio"
                accessibilityState={{ selected: selectedLoginRole === role }}
              >
                <Text style={[styles.modeText, selectedLoginRole === role && styles.modeTextActive]}>
                  {role === 'CLERK' ? 'Warranty Clerk' : 'Technician'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Field
            label="Username / Employee Number / Email"
            icon="mail"
            value={signInEmail}
            onChangeText={setSignInEmail}
            placeholder="Username, employee number, or email"
          />

          <Field
            label="Password"
            icon="lock"
            value={signInPassword}
            onChangeText={setSignInPassword}
            placeholder="Enter your password"
            secureTextEntry={!showPassword}
            rightIcon={showPassword ? 'eye-off' : 'eye'}
            onRightIconPress={() => setShowPassword(!showPassword)}
          />

          <TouchableOpacity
            onPress={() => setShowForgotPasswordModal(true)}
            style={styles.forgotPasswordButton}
            activeOpacity={0.7}
          >
            <Text style={styles.forgotPasswordText}>Forgot password?</Text>
          </TouchableOpacity>

          <Button
            title="Sign In"
            variant="primary"
            size="lg"
            loading={isLoading}
            onPress={handleSignIn}
            fullWidth
            style={styles.actionButton}
          />
        </View>
      )}

      <InstallAppButton compact />
      <Text style={styles.footer}>Booran Motor Group • Warranty Evidence Capture</Text>

      {/* Dealership Sites Modal */}
      <Modal
        visible={showSitesModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowSitesModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalTitle}>Dealership Sites</Text>
                <Text style={styles.modalSub}>
                  Select one or more rooftops. The first selected is your primary workshop. {selectedSiteIds.length} selected.
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setShowSitesModal(false)}
                style={styles.modalCloseBtn}
              >
                <Icon name="close" size={18} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalSiteList} showsVerticalScrollIndicator={false}>
              {rooftopOptions.map((site) => {
                const isSelected = selectedSiteIds.includes(site.id);

                return (
                  <TouchableOpacity
                    key={site.id}
                    style={[
                      styles.modalSiteItem,
                      isSelected && styles.modalSiteItemSelected,
                    ]}
                    onPress={() => setSelectedSiteIds(current => current.includes(site.id)
                      ? current.filter(id => id !== site.id)
                      : [...current, site.id])}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: isSelected }}
                    accessibilityLabel={`${site.name}${primarySiteId === site.id ? ', primary workshop' : ''}`}
                    activeOpacity={0.75}
                  >
                    <View style={styles.modalSiteItemLeft}>
                      <View
                        style={[
                          styles.modalCheckbox,
                          isSelected && styles.modalCheckboxActive,
                        ]}
                      >
                        {isSelected && <Icon name="check" size={12} color="#FFFFFF" />}
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text
                          style={[
                            styles.modalSiteName,
                            isSelected && styles.modalSiteNameSelected,
                          ]}
                          numberOfLines={1}
                        >
                          {site.name}
                        </Text>
                        {primarySiteId === site.id && <Text style={styles.dropdownSubtext}>Primary workshop</Text>}
                      </View>
                    </View>

                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            <View style={styles.modalActions}>
              <Button
                title="Done"
                variant="primary"
                size="md"
                onPress={() => setShowSitesModal(false)}
                disabled={selectedSiteIds.length === 0}
                fullWidth
              />
            </View>
          </View>
        </View>
      </Modal>

      {/* Forgot Password Modal */}
      <ForgotPasswordModal
        visible={showForgotPasswordModal}
        initialEmail={signInEmail}
        onClose={() => setShowForgotPasswordModal(false)}
        onSuccess={() => {
          setShowForgotPasswordModal(false);
          setActiveTab('SIGN_IN');
        }}
      />
    </ScrollView>
  );
};

interface FieldProps {
  label: string;
  icon: FieldIcon;
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  secureTextEntry?: boolean;
  keyboardType?: 'default' | 'email-address';
  rightIcon?: ActionIcon;
  onRightIconPress?: () => void;
}

const Field: React.FC<FieldProps> = ({ label, icon, rightIcon, onRightIconPress, ...inputProps }) => (
  <View style={styles.field}>
    <Text style={styles.fieldLabel}>{label}</Text>
    <View style={styles.inputWrapper} testID="auth-field-shell">
      <Icon name={icon} size={18} color={colors.textMuted} />
      <TextInput
        {...inputProps}
        nativeID={`auth-field-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}
        style={styles.input}
        placeholderTextColor={colors.textMuted}
        autoCapitalize="none"
        autoCorrect={false}
      />
      {rightIcon && (
        <TouchableOpacity onPress={onRightIconPress} style={styles.eyeButton}>
          <Icon name={rightIcon} size={18} color={colors.textMuted} />
        </TouchableOpacity>
      )}
    </View>
  </View>
);

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  contentContainer: { flexGrow: 1, padding: spacing.xl },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.lg },
  brandLogo: { width: 170, height: 42 },
  welcomeBlock: { marginBottom: spacing.lg },
  title: {
    fontSize: typography.sizes.xl,
    fontWeight: typography.weights.bold,
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  subtitle: {
    fontSize: typography.sizes.sm,
    color: colors.textSecondary,
    lineHeight: 20,
  },
  connectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: spacing.md,
  },
  connectionDot: { width: 8, height: 8, borderRadius: 4 },
  connectionText: { fontSize: typography.sizes.xs, color: colors.textMuted },
  configPanel: {
    backgroundColor: colors.surface,
    padding: spacing.md,
    borderRadius: spacing.borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.md,
  },
  configLabel: { fontSize: typography.sizes.xs, color: colors.textSecondary, marginBottom: 4 },
  configRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center' },
  configInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: spacing.borderRadius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    color: colors.textPrimary,
    fontSize: typography.sizes.xs,
    backgroundColor: colors.backgroundSecondary,
  },
  modeSwitch: {
    flexDirection: 'row',
    backgroundColor: colors.surfaceElevated,
    borderRadius: spacing.borderRadius.lg,
    padding: 4,
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  modeButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.sm + 2,
    borderRadius: spacing.borderRadius.md,
    gap: 6,
  },
  modeButtonActive: {
    backgroundColor: colors.primary,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3,
    elevation: 2,
  },
  modeText: {
    fontSize: typography.sizes.sm,
    color: colors.textSecondary,
    fontWeight: typography.weights.medium,
  },
  modeTextActive: {
    color: colors.textInverse,
    fontWeight: typography.weights.bold,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: spacing.borderRadius.md,
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.3)',
    marginBottom: spacing.md,
  },
  errorText: {
    fontSize: typography.sizes.xs,
    color: colors.danger,
    flex: 1,
    fontWeight: typography.weights.medium,
  },
  successBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: spacing.borderRadius.md,
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.3)',
    marginBottom: spacing.md,
  },
  successText: {
    fontSize: typography.sizes.xs,
    color: colors.success,
    flex: 1,
    fontWeight: typography.weights.medium,
  },
  form: { gap: spacing.md },
  field: { gap: 6 },
  fieldLabel: {
    fontSize: typography.sizes.xs,
    fontWeight: typography.weights.bold,
    color: colors.textSecondary,
    letterSpacing: 0.5,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: spacing.borderRadius.md,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    height: 48,
    gap: spacing.sm,
  },
  input: {
    flex: 1,
    color: colors.textPrimary,
    fontSize: typography.sizes.sm,
    height: '100%',
  },
  eyeButton: { padding: 4 },
  forgotPasswordButton: { alignSelf: 'flex-end', marginTop: -4 },
  forgotPasswordText: {
    fontSize: typography.sizes.xs,
    color: colors.primary,
    fontWeight: typography.weights.medium,
  },
  actionButton: {
    marginTop: spacing.md,
    marginBottom: spacing.xs,
  },
  footer: {
    marginTop: spacing.xl,
    textAlign: 'center',
    fontSize: typography.sizes.xs,
    color: colors.textMuted,
  },

  // ── PIN Screen Specific Styles ──
  pinCard: {
    backgroundColor: colors.surface,
    borderRadius: spacing.borderRadius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.md,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  pinHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  pinIconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.surfaceHighlight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pinCardTitle: {
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.bold,
    color: colors.textPrimary,
  },
  pinCardSub: {
    fontSize: typography.sizes.xs,
    color: colors.textSecondary,
    marginTop: 2,
    lineHeight: 16,
  },
  pinInputContainer: {
    alignItems: 'center',
    marginVertical: spacing.sm,
  },
  pinLargeInput: {
    backgroundColor: colors.backgroundSecondary,
    borderWidth: 2,
    borderColor: colors.primary,
    borderRadius: spacing.borderRadius.lg,
    width: '100%',
    height: 60,
    fontSize: 28,
    fontWeight: typography.weights.bold,
    color: colors.textPrimary,
    textAlign: 'center',
    letterSpacing: 10,
  },
  pinErrorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  pinErrorText: {
    fontSize: typography.sizes.xs,
    color: colors.danger,
    fontWeight: typography.weights.medium,
  },
  stepIndicatorRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  stepBadgeActive: {
    backgroundColor: colors.surfaceHighlight,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 3,
    borderRadius: spacing.borderRadius.sm,
    borderWidth: 1,
    borderColor: 'rgba(225, 31, 38, 0.2)',
  },
  stepBadgeText: {
    fontSize: typography.sizes.xs,
    fontWeight: typography.weights.bold,
    color: colors.primary,
  },
  changePinButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  changePinText: {
    fontSize: typography.sizes.xs,
    color: colors.textSecondary,
    textDecorationLine: 'underline',
  },

  // ── Compact Dealership Sites Dropdown ──
  dropdownSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: spacing.borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    minHeight: 52,
  },
  dropdownLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flex: 1,
  },
  dropdownPrimarySiteText: {
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.bold,
    color: colors.textPrimary,
  },
  dropdownSubtext: {
    fontSize: typography.sizes.xs - 1,
    color: colors.textMuted,
    marginTop: 1,
  },
  dropdownRightAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.backgroundSecondary,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: spacing.borderRadius.sm,
  },
  dropdownEditText: {
    fontSize: typography.sizes.xs,
    color: colors.textSecondary,
    fontWeight: typography.weights.medium,
  },

  // ── Modal Styles ──
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
  },
  modalCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: spacing.borderRadius.xl,
    width: '100%',
    maxHeight: '80%',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 8,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  modalTitle: {
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.bold,
    color: colors.textPrimary,
  },
  modalSub: {
    fontSize: typography.sizes.xs,
    color: colors.textSecondary,
    marginTop: 2,
  },
  modalCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.backgroundSecondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalSiteList: {
    padding: spacing.md,
  },
  modalSiteItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: spacing.borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  modalSiteItemSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.surfaceHighlight,
  },
  modalSiteItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flex: 1,
  },
  modalCheckbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: colors.borderHighlight,
    backgroundColor: colors.backgroundSecondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalCheckboxActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  modalSiteName: {
    fontSize: typography.sizes.sm,
    color: colors.textSecondary,
    fontWeight: typography.weights.medium,
  },
  modalSiteNameSelected: {
    color: colors.textPrimary,
    fontWeight: typography.weights.bold,
  },
  modalActions: {
    padding: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: '#FAFAFA',
  },
});
