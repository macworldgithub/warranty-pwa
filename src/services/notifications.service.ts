import { getWebMessagingAdapter } from '../../web/firebase';
import { Platform, PermissionsAndroid } from 'react-native';
import { apiClient } from '../api/client';
import { casesApi } from '../api';
import { WarrantyCase } from '../types';

export type NotificationType = 'APPROVED' | 'FLAGGED' | 'AWAITING_REVIEW' | 'INFO';

export interface AppNotificationPayload {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  caseId: string;
  roNumber: string;
  claimNumber?: string;
  evidenceRuleKey?: string;
  reasonCode?: string;
  instruction?: string;
  timestamp: string;
  isRead?: boolean;
  caseItem?: WarrantyCase;
}

// Backwards compatibility alias
export type FlagNotificationPayload = AppNotificationPayload;

type NotificationListener = (payload: AppNotificationPayload, history?: AppNotificationPayload[]) => void;
type NotificationOpenListener = (payload: AppNotificationPayload) => void;

interface FirebaseMessagingAdapter {
  instance: any;
  getToken: () => Promise<string | null>;
  onMessage: (handler: (msg: any) => void) => () => void;
  onNotificationOpenedApp?: (handler: (msg: any) => void) => () => void;
  getInitialNotification?: () => Promise<any>;
  onTokenRefresh?: (handler: (token: string) => void) => () => void;
  subscribeToTopic?: (topic: string) => Promise<void>;
  requestPermission?: () => Promise<any>;
  registerDeviceForRemoteMessages?: () => Promise<void>;
  getAPNSToken?: () => Promise<string | null>;
}

function getFirebaseMessagingAdapter(): FirebaseMessagingAdapter | null {
  return getWebMessagingAdapter();
}

class NotificationsService {
  private deviceToken: string | null = null;
  private registered: boolean = false;
  private listeners: Set<NotificationListener> = new Set();
  private openListeners: Set<NotificationOpenListener> = new Set();
  private pollInterval: any = null;
  private lastKnownCaseStates: Map<string, string> = new Map();
  private fcmUnsubscribeForeground: (() => void) | null = null;
  private fcmUnsubscribeOpenedApp: (() => void) | null = null;
  private fcmUnsubscribeTokenRefresh: (() => void) | null = null;

  // Notification History and Read Tracking
  private history: AppNotificationPayload[] = [];
  private readIds: Set<string> = new Set();

  /**
   * Initializes push token registration.
   */
  private sessionGeneration = 0;
  private registeredUser: string | null = null;
  private registration: Promise<string | null> | null = null;
  public resetSession() {
    this.sessionGeneration++; this.registeredUser = null; this.registration = null;
    this.deviceToken = null; this.registered = false; this.stopFlagPolling();
    this.history = []; this.readIds.clear(); this.lastKnownCaseStates.clear();
    void getWebMessagingAdapter().releaseToken().catch(console.warn);
  }
  public async registerDevice(userId: string): Promise<string | null> {
    if (!userId) return null;
    if (this.registration && this.registeredUser === userId) return this.registration;
    const generation = this.sessionGeneration;
    this.registeredUser = userId;
    const adapter = getWebMessagingAdapter();
    this.registration = (async () => {
      try {
        const token = await adapter.getToken();
        if (generation !== this.sessionGeneration) return null;
        // Open/cold-start handling is useful even before notification permission.
        this.fcmUnsubscribeOpenedApp?.();
        this.fcmUnsubscribeOpenedApp = adapter.onNotificationOpenedApp(message => this.notifyOpenListeners(this.handleIncomingFcmMessage(message)));
        const initial = await adapter.getInitialNotification();
        if (initial && generation === this.sessionGeneration) setTimeout(() => {
          if (generation === this.sessionGeneration) this.notifyOpenListeners(this.handleIncomingFcmMessage(initial));
        }, 300);
        this.fcmUnsubscribeForeground?.();
        this.fcmUnsubscribeForeground = adapter.onMessage(message => {
          if (generation === this.sessionGeneration) this.handleIncomingFcmMessage(message);
        });
        if (!token) return null;
        const register = async (currentToken: string) => {
          if (generation !== this.sessionGeneration) return;
          await apiClient.post('/notifications/devices/register', { token: currentToken, platform: 'web', userId, topics: ['warranty-techs', 'warranty-all', 'tech-' + userId] });
          if (generation !== this.sessionGeneration) return;
          this.deviceToken = currentToken; this.registered = true;
          try { await adapter.syncTopics(userId); } catch (error: any) { console.warn('[Push topics]', error.message); }
        };
        await register(token);
        this.fcmUnsubscribeTokenRefresh?.();
        this.fcmUnsubscribeTokenRefresh = adapter.onTokenRefresh(register);
        return token;
      } catch (error: any) { console.warn('[Notifications]', error.message); return this.deviceToken; }
      finally { if (generation === this.sessionGeneration) this.registration = null; }
    })();
    return this.registration;
  }

  /**
   * Prominently prints the FCM Registration Token in the console
   * for easy copying into the Firebase Console (Cloud Messaging -> Send test message)
   */
  public printFcmBanner(token: string, userId?: string, isRefresh: boolean = false) {
    const divider = '═'.repeat(72);
    console.log('\n' + divider);
    console.log(`🔥 [FIREBASE CLOUD MESSAGING (FCM) DEVICE TOKEN${isRefresh ? ' - REFRESHED' : ''}] 🔥`);
    console.log(divider);
    console.log('📌 Device Token:');
    console.log(token);
    console.log('─'.repeat(72));
    if (userId) console.log(`👤 User / Tech ID: ${userId}`);
    console.log(`📱 Platform:       ${Platform.OS}`);
    console.log(`⏰ Timestamp:      ${new Date().toISOString()}`);
    console.log('─'.repeat(72));
    console.log('💡 HOW TO TEST IN FIREBASE CONSOLE:');
    console.log('1. Go to Firebase Console -> Messaging (Campaigns/Compose)');
    console.log('2. Click "New Campaign" -> "Notifications" (or "Send your first message")');
    console.log('3. Fill in title/body, then click "Send test message"');
    console.log('4. Paste the token above into the "Add an FCM registration token" field');
    console.log('5. Click Test to send push notification directly to this device');
    console.log(divider + '\n');
  }

  /**
   * Manually trigger printing the active device token to the console
   */
  public printCurrentToken() {
    if (this.deviceToken) {
      this.printFcmBanner(this.deviceToken, 'current_session');
    } else {
      console.warn('[FCM] No device token currently available. Make sure registerDevice() has run.');
    }
  }

  public getDeviceToken(): string | null {
    return this.deviceToken;
  }

  public isRegistered(): boolean {
    return this.registered;
  }

  /**
   * Returns current notification history
   */
  public getNotificationsHistory(): AppNotificationPayload[] {
    return this.history.map((item) => ({
      ...item,
      isRead: this.readIds.has(item.id),
    }));
  }

  /**
   * Returns unread notification count
   */
  public getUnreadCount(): number {
    return this.history.filter((item) => !this.readIds.has(item.id)).length;
  }

  /**
   * Marks a specific notification as read
   */
  public markAsRead(id: string) {
    this.readIds.add(id);
    this.notifyListeners(null);
  }

  /**
   * Marks all notifications as read
   */
  public markAllAsRead() {
    this.history.forEach((item) => this.readIds.add(item.id));
    this.notifyListeners(null);
  }

  /**
   * Clears notification history
   */
  public clearNotifications() {
    this.history = [];
    this.readIds.clear();
    this.notifyListeners(null);
  }

  /**
   * Subscribe to incoming notifications (in-app alerts & history updates)
   */
  public onNotification(listener: NotificationListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Dispatches a notification payload to all active subscribers.
   */
  public dispatchNotification(payload: AppNotificationPayload) {
    const itemWithId: AppNotificationPayload = {
      ...payload,
      id: payload.id || `notif_${payload.caseId || ''}_${payload.type}_${Date.now()}`,
    };

    // Prepend to history, avoiding duplicate IDs
    const existingIndex = this.history.findIndex((h) => h.id === itemWithId.id);
    if (existingIndex >= 0) {
      this.history[existingIndex] = itemWithId;
    } else {
      this.history = [itemWithId, ...this.history];
    }

    console.log('[Notifications] Dispatching alert:', itemWithId);
    this.notifyListeners(itemWithId);
  }

  private notifyListeners(payload: AppNotificationPayload | null) {
    const historySnapshot = this.getNotificationsHistory();
    this.listeners.forEach((listener) => {
      try {
        if (payload) {
          listener(payload, historySnapshot);
        } else {
          listener(historySnapshot[0] || ({} as any), historySnapshot);
        }
      } catch (err) {
        console.error('[Notifications] Listener execution error:', err);
      }
    });
  }

  /**
   * Subscribe to notification tap / open events (from system tray background or quit state)
   */
  public onNotificationOpen(listener: NotificationOpenListener): () => void {
    this.openListeners.add(listener);
    return () => this.openListeners.delete(listener);
  }

  private notifyOpenListeners(payload: AppNotificationPayload) {
    this.openListeners.forEach((listener) => {
      try {
        listener(payload);
      } catch (err) {
        console.error('[Notifications] Open listener execution error:', err);
      }
    });
  }

  /**
   * Processes incoming FCM remote message (data + notification payload)
   */
  private handleIncomingFcmMessage(remoteMessage: any): AppNotificationPayload {
    const data = remoteMessage?.data || {};
    const notification = remoteMessage?.notification || {};

    let type: NotificationType = 'INFO';
    if (data.event === 'CASE_ACCEPTED' || data.claimNumber) {
      type = 'APPROVED';
    } else if (data.event === 'CASE_FLAGGED' || data.evidenceRuleKey) {
      type = 'FLAGGED';
    } else if (data.event === 'AWAITING_REVIEW') {
      type = 'AWAITING_REVIEW';
    }

    const payload: AppNotificationPayload = {
      id: remoteMessage?.messageId || `fcm_${Date.now()}`,
      type,
      title: notification.title || data.title || (type === 'APPROVED' ? 'Warranty Claim Approved' : 'Action Required'),
      body: notification.body || data.body || 'Case status updated',
      caseId: data.caseId || '',
      roNumber: data.roNumber || '',
      claimNumber: data.claimNumber,
      evidenceRuleKey: data.evidenceRuleKey,
      reasonCode: data.reasonCode,
      instruction: data.instruction,
      timestamp: new Date().toISOString(),
    };

    this.dispatchNotification(payload);
    return payload;
  }

  /**
   * Starts light polling to detect warranty case status updates (Flagged, Approved, Awaiting Review).
   */
  public startNotificationPolling(technicianId: string, intervalMs: number = 8000) {
    if (this.pollInterval) clearInterval(this.pollInterval);

    const generation = this.sessionGeneration;
    const poll = async () => {
      try {
        let cases: WarrantyCase[] = await casesApi.getCases({ technicianId });

        if (!cases || cases.length === 0) {
          cases = await casesApi.getCases({});
        }

        if (generation !== this.sessionGeneration) return;
        if (Array.isArray(cases) && cases.length > 0) {
          for (const c of cases) {
            const flags = (c as any).flagHistory || (c as any).flags || [];
            const activeFlag = flags.find((f: any) => !f.resolvedAt);

            const currentStateKey = `${c.id}_${c.status}_${c.claimNumber || ''}_${activeFlag ? activeFlag.flaggedAt || activeFlag.evidenceRuleKey : ''}`;
            const lastState = this.lastKnownCaseStates.get(c.id);

            // Populate baseline past notifications on first pass
            if (lastState === undefined) {
              this.lastKnownCaseStates.set(c.id, currentStateKey);

              if (c.status === 'Flagged' && activeFlag) {
                const notifId = `init_${c.id}_flagged_${activeFlag.evidenceRuleKey}`;
                if (!this.history.some((h) => h.id === notifId)) {
                  this.history.push({
                    id: notifId,
                    type: 'FLAGGED',
                    title: `Action Required: RO #${c.roNumber}`,
                    body: `Evidence rejected: ${(activeFlag.reasonCode || '').replace(/_/g, ' ')}. ${activeFlag.instruction || 'Tap to recapture.'}`,
                    caseId: c.id,
                    roNumber: c.roNumber,
                    evidenceRuleKey: activeFlag.evidenceRuleKey,
                    reasonCode: activeFlag.reasonCode,
                    instruction: activeFlag.instruction,
                    timestamp: activeFlag.flaggedAt || new Date().toISOString(),
                    caseItem: c,
                  });
                }
              } else if (c.status === 'Submitted' || c.claimNumber) {
                const notifId = `init_${c.id}_approved_${c.claimNumber || 'approved'}`;
                if (!this.history.some((h) => h.id === notifId)) {
                  this.history.push({
                    id: notifId,
                    type: 'APPROVED',
                    title: `Warranty Claim Approved: RO #${c.roNumber}`,
                    body: `Approved under OEM Claim #${c.claimNumber || 'OEM-APPROVED'}. Case file locked.`,
                    caseId: c.id,
                    roNumber: c.roNumber,
                    claimNumber: c.claimNumber || 'OEM-APPROVED',
                    timestamp: new Date().toISOString(),
                    caseItem: c,
                  });
                }
              }
              continue;
            }

            if (lastState !== currentStateKey) {
              this.lastKnownCaseStates.set(c.id, currentStateKey);

              // 1. Case Flagged by Admin
              if (c.status === 'Flagged' && activeFlag) {
                this.dispatchNotification({
                  id: `poll_${c.id}_flag_${Date.now()}`,
                  type: 'FLAGGED',
                  title: `Action Required: RO #${c.roNumber}`,
                  body: `Evidence rejected: ${(activeFlag.reasonCode || '').replace(/_/g, ' ')}. ${activeFlag.instruction || 'Tap to recapture.'}`,
                  caseId: c.id,
                  roNumber: c.roNumber,
                  evidenceRuleKey: activeFlag.evidenceRuleKey,
                  reasonCode: activeFlag.reasonCode,
                  instruction: activeFlag.instruction,
                  timestamp: activeFlag.flaggedAt || new Date().toISOString(),
                  caseItem: c,
                });
                break;
              }

              // 2. Case Approved / Submitted to OEM
              if (c.status === 'Submitted' || c.claimNumber) {
                this.dispatchNotification({
                  id: `poll_${c.id}_approved_${Date.now()}`,
                  type: 'APPROVED',
                  title: `Warranty Claim Approved: RO #${c.roNumber}`,
                  body: `Approved under OEM Claim #${c.claimNumber || 'OEM-APPROVED'}. Case file locked.`,
                  caseId: c.id,
                  roNumber: c.roNumber,
                  claimNumber: c.claimNumber || 'OEM-APPROVED',
                  timestamp: new Date().toISOString(),
                  caseItem: c,
                });
                break;
              }

              // 3. Case Awaiting Review
              if (c.status === 'Awaiting Review') {
                this.dispatchNotification({
                  id: `poll_${c.id}_awaiting_${Date.now()}`,
                  type: 'AWAITING_REVIEW',
                  title: `Case Awaiting Review: RO #${c.roNumber}`,
                  body: `Updated evidence transmitted to warranty reviewer.`,
                  caseId: c.id,
                  roNumber: c.roNumber,
                  timestamp: new Date().toISOString(),
                  caseItem: c,
                });
                break;
              }
            }
          }
        }
      } catch {
        // Silent poll error
      }
    };

    poll();
    this.pollInterval = setInterval(poll, intervalMs);
  }

  public startFlagPolling(technicianId: string, intervalMs: number = 8000) {
    this.startNotificationPolling(technicianId, intervalMs);
  }

  public stopFlagPolling() {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
    if (this.fcmUnsubscribeForeground) {
      this.fcmUnsubscribeForeground();
      this.fcmUnsubscribeForeground = null;
    }
    if (this.fcmUnsubscribeOpenedApp) {
      this.fcmUnsubscribeOpenedApp();
      this.fcmUnsubscribeOpenedApp = null;
    }
    if (this.fcmUnsubscribeTokenRefresh) {
      this.fcmUnsubscribeTokenRefresh();
      this.fcmUnsubscribeTokenRefresh = null;
    }
  }
}

export const notificationsService = new NotificationsService();
