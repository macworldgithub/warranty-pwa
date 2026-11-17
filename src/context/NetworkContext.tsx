import { getOutboxJobs } from '../../web/outbox';
import React, { createContext, useContext, useState, useEffect } from 'react';
import { syncManager, SyncStatus } from '../services/syncManager';
import { ENV, setApiBaseUrl } from '../config/env';
import { apiClient } from '../api/client';
import { offlineStorage } from '../services/offlineStorage';

interface NetworkContextType {
  isOnline: boolean;
  isSyncing: boolean;
  pendingCount: number;
  lastSyncTime?: string;
  serverUrl: string;
  setServerUrl: (url: string) => void;
  syncNow: () => Promise<void>;
  checkConnectivity: () => Promise<boolean>;
}

const NetworkContext = createContext<NetworkContextType | undefined>(undefined);

export const NetworkProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isOnline, setIsOnline] = useState<boolean>(true);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>({
    isSyncing: false,
    pendingCount: 0,
  });
  const [serverUrl, setServerUrlState] = useState<string>(ENV.BASE_URL);

  useEffect(() => {
    const unsubscribe = syncManager.subscribe(status => {
      setSyncStatus(status);
    });
    const refreshPending = async () => {
      const count = apiClient.getToken() ? offlineStorage.getPendingUploads().length + (await getOutboxJobs()).length : 0;
      setSyncStatus(previous => ({ ...previous, pendingCount: count }));
    };
    const unsubscribeStorage = offlineStorage.subscribe(() => void refreshPending());
    window.addEventListener('outbox-change', refreshPending);
    void refreshPending();
    const online = () => { void checkConnectivity(); };
    const offline = () => setIsOnline(false);
    window.addEventListener('online', online);
    window.addEventListener('offline', offline);
    void checkConnectivity();

    const interval = setInterval(async () => {
      await checkConnectivity();
    }, 10000);

    return () => {
      unsubscribe();
      unsubscribeStorage();
      window.removeEventListener('outbox-change', refreshPending);
      window.removeEventListener('online', online);
      window.removeEventListener('offline', offline);
      clearInterval(interval);
    };
  }, [serverUrl]);

  const checkConnectivity = async (): Promise<boolean> => {
    try {
      const res = await fetch(`${ENV.API_URL}/brands`, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(5000),
      });
      const online = res.ok;
      setIsOnline(online);
      if (online && apiClient.getToken()) void syncManager.syncPendingCases();
      return online;
    } catch (err) {
      setIsOnline(false);
      return false;
    }
  };

  const updateServerUrl = (url: string) => {
    setApiBaseUrl(url);
    setServerUrlState(url);
    checkConnectivity();
  };

  const syncNow = async () => {
    await syncManager.syncPendingCases();
  };

  return (
    <NetworkContext.Provider
      value={{
        isOnline,
        isSyncing: syncStatus.isSyncing,
        pendingCount: syncStatus.pendingCount,
        lastSyncTime: syncStatus.lastSyncTime,
        serverUrl,
        setServerUrl: updateServerUrl,
        syncNow,
        checkConnectivity,
      }}
    >
      {children}
    </NetworkContext.Provider>
  );
};

export const useNetwork = () => {
  const context = useContext(NetworkContext);
  if (!context) {
    throw new Error('useNetwork must be used within a NetworkProvider');
  }
  return context;
};
