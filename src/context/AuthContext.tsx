import React, { createContext, useContext, useState, useEffect } from 'react';
import {
  User,
  VerifyRegisterOtpDto,
  ResetPasswordDto,
  GenericAuthResponse,
} from '../types';
import { authApi } from '../api/auth.api';
import { apiClient } from '../api/client';
import { setStorageUser } from '../../web/storage';
import { setSyncSession } from '../../web/outbox';
import { ENV } from '../config/env';
import { notificationsService } from '../services/notifications.service';

interface AuthContextType {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  activeSiteId: string;
  login: (email: string, password?: string) => Promise<User>;
  registerTechnician: (data: {
    name: string;
    email: string;
    password?: string;
    employeeId?: string;
    defaultSiteId?: string;
    authorizedSiteIds?: string[];
  }) => Promise<User>;
  sendRegistrationOtp: (email: string, name?: string) => Promise<GenericAuthResponse>;
  verifyRegistrationOtp: (dto: VerifyRegisterOtpDto) => Promise<User>;
  sendForgotPasswordOtp: (email: string) => Promise<GenericAuthResponse>;
  resetPassword: (dto: ResetPasswordDto) => Promise<GenericAuthResponse>;
  logout: () => void;
  setActiveSiteId: (siteId: string) => void;
  refreshMe: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function getInitialSiteId(user: User | null): string {
  if (user?.role === 'ADMIN' || user?.role === 'SERVICE_MANAGER') {
    return 'all';
  }

  return (
    user?.defaultSiteId ||
    user?.authorizedSiteIds?.[0] ||
    ''
  );
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(() => {
    try { return JSON.parse(sessionStorage.getItem('booran-user') || 'null'); } catch { return null; }
  });
  const [token, setToken] = useState<string | null>(apiClient.getToken());
  const [activeSiteId, setActiveSiteId] = useState<string>(() => getInitialSiteId(user));
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const logout = () => {
    void setSyncSession(null);
    notificationsService.resetSession();
    sessionStorage.removeItem('booran-user');
    setUser(null);
    setToken(null);
    apiClient.setToken(null);
  };

  useEffect(() => {
    if (user) sessionStorage.setItem('booran-user', JSON.stringify(user));
    else sessionStorage.removeItem('booran-user');
  }, [user]);

  useEffect(() => {
    const save = () => void setSyncSession(user?.id && token ? { userId: user.id, token, apiUrl: ENV.API_URL } : null);
    save(); window.addEventListener('api-host-change', save);
    return () => window.removeEventListener('api-host-change', save);
  }, [user?.id, token]);

  useEffect(() => {
    // Configure 401 interceptor
    apiClient.setOnUnauthorized(() => {
      logout();
    });

    const initAuth = async () => {
      const initializingToken = apiClient.getToken();
      try {
        const currentToken = apiClient.getToken();
        if (currentToken) {
          const me = await authApi.getMe();
          if (me && apiClient.getToken() === currentToken) {
            setUser(me);
            setToken(currentToken);
            setActiveSiteId(getInitialSiteId(me));
          }
        }
      } catch (err: any) {
        if (apiClient.getToken() !== initializingToken || (err?.statusCode !== 401 && err?.statusCode !== 403)) return;
        // If not authenticated, require explicit login
        setUser(null);
        setToken(null);
        apiClient.setToken(null);
      } finally {
        setIsLoading(false);
      }
    };

    initAuth();
  }, []);

  const login = async (email: string, password?: string): Promise<User> => {
    setIsLoading(true);
    try {
      const res = await authApi.login(email, password);
      const currentUser: User = res.user;
      sessionStorage.setItem('booran-user', JSON.stringify(currentUser));
      await setStorageUser(currentUser.id);
      await setSyncSession({ userId: currentUser.id, token: res.token, apiUrl: ENV.API_URL });
      setUser(currentUser);
      if (res.token) {
        setToken(res.token);
        apiClient.setToken(res.token);
      }
      setActiveSiteId(getInitialSiteId(currentUser));
      return currentUser;
    } finally {
      setIsLoading(false);
    }
  };

  const registerTechnician = async (data: {
    name: string;
    email: string;
    password?: string;
    employeeId?: string;
    defaultSiteId?: string;
    authorizedSiteIds?: string[];
  }): Promise<User> => {
    setIsLoading(true);
    try {
      const res = await authApi.registerTechnician(data);
      const currentUser: User = res.user;
      sessionStorage.setItem('booran-user', JSON.stringify(currentUser));
      await setStorageUser(currentUser.id);
      await setSyncSession({ userId: currentUser.id, token: res.token, apiUrl: ENV.API_URL });
      setUser(currentUser);
      if (res.token) {
        setToken(res.token);
        apiClient.setToken(res.token);
      }
      setActiveSiteId(getInitialSiteId(currentUser));
      return currentUser;
    } finally {
      setIsLoading(false);
    }
  };

  const sendRegistrationOtp = async (
    email: string,
    name?: string
  ): Promise<GenericAuthResponse> => {
    return authApi.sendRegistrationOtp(email, name);
  };

  const verifyRegistrationOtp = async (
    dto: VerifyRegisterOtpDto
  ): Promise<User> => {
    setIsLoading(true);
    try {
      const res = await authApi.verifyRegistrationOtp(dto);
      const currentUser: User = res.user;
      sessionStorage.setItem('booran-user', JSON.stringify(currentUser));
      await setStorageUser(currentUser.id);
      await setSyncSession({ userId: currentUser.id, token: res.token, apiUrl: ENV.API_URL });
      setUser(currentUser);
      if (res.token) {
        setToken(res.token);
        apiClient.setToken(res.token);
      }
      setActiveSiteId(getInitialSiteId(currentUser));
      return currentUser;
    } finally {
      setIsLoading(false);
    }
  };

  const sendForgotPasswordOtp = async (
    email: string
  ): Promise<GenericAuthResponse> => {
    return authApi.sendForgotPasswordOtp(email);
  };

  const resetPassword = async (
    dto: ResetPasswordDto
  ): Promise<GenericAuthResponse> => {
    return authApi.resetPassword(dto);
  };

  const refreshMe = async () => {
    const refreshingToken = apiClient.getToken();
    try {
      const me = await authApi.getMe();
      if (me && apiClient.getToken() === refreshingToken) {
        setUser(me);
        setActiveSiteId(getInitialSiteId(me));
      }
    } catch (e) {}
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isAuthenticated: !!user,
        isLoading,
        activeSiteId,
        login,
        registerTechnician,
        sendRegistrationOtp,
        verifyRegistrationOtp,
        sendForgotPasswordOtp,
        resetPassword,
        logout,
        setActiveSiteId,
        refreshMe,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
