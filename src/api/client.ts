import { ENV } from '../config/env';
import { readCache, writeCache } from '../../web/storage';

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  statusCode?: number;
}

class ApiClient {
  private token: string | null = sessionStorage.getItem('booran-token');
  private onUnauthorizedCallback: (() => void) | null = null;

  public setToken(token: string | null) {
    this.token = token;
    if (token) sessionStorage.setItem('booran-token', token);
    else sessionStorage.removeItem('booran-token');
  }

  public getToken() {
    return this.token;
  }

  public setOnUnauthorized(callback: () => void) {
    this.onUnauthorizedCallback = callback;
  }

  public async request<T = any>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = endpoint.startsWith('http')
      ? endpoint
      : `${ENV.API_URL}${endpoint.startsWith('/') ? '' : '/'}${endpoint}`;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...((options.headers as Record<string, string>) || {}),
    };

    if (this.token && !headers.Authorization) {
      headers.Authorization = `Bearer ${this.token}`;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), ENV.TIMEOUT_MS);
    let cachedUserId = 'current-session';
    try { cachedUserId = JSON.parse(sessionStorage.getItem('booran-user') || 'null')?.id || cachedUserId; } catch {}
    const sessionKey = this.token ? `user:${cachedUserId}` : 'public';
    const cacheKey = `${sessionKey}:${url}`;
    const cacheable = !options.method || options.method === 'GET';

    try {
      const response = await fetch(url, {
        ...options,
        headers,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      const contentType = response.headers.get('content-type');
      let data: any = null;

      if (contentType && contentType.includes('application/json')) {
        data = await response.json();
      } else {
        data = await response.text();
      }

      if (!response.ok) {
        if (response.status === 401 && this.onUnauthorizedCallback && headers.Authorization === `Bearer ${this.token}`) {
          this.onUnauthorizedCallback();
        }

        const errorMessage =
          (data && data.message) ||
          (Array.isArray(data?.message) ? data.message.join(', ') : null) ||
          data?.error ||
          `HTTP ${response.status}: ${response.statusText}`;
        
        const error: any = new Error(errorMessage);
        error.statusCode = response.status;
        error.data = data;
        throw error;
      }

      if (cacheable) void writeCache(cacheKey, data).catch(console.warn);
      return data as T;
    } catch (error: any) {
      clearTimeout(timeoutId);
      if (cacheable && !error.statusCode) {
        const cached = await readCache<T>(cacheKey);
        if (cached !== undefined) return cached;
      }
      if (error.name === 'AbortError') {
        throw new Error(`Request timed out after ${ENV.TIMEOUT_MS / 1000}s. Check connection to ${ENV.BASE_URL}`);
      }
      throw error;
    }
  }

  public get<T = any>(endpoint: string, headers?: Record<string, string>) {
    return this.request<T>(endpoint, { method: 'GET', headers });
  }

  public post<T = any>(endpoint: string, body?: any, headers?: Record<string, string>) {
    return this.request<T>(endpoint, {
      method: 'POST',
      body: body ? JSON.stringify(body) : undefined,
      headers,
    });
  }

  public put<T = any>(endpoint: string, body?: any, headers?: Record<string, string>) {
    return this.request<T>(endpoint, {
      method: 'PUT',
      body: body ? JSON.stringify(body) : undefined,
      headers,
    });
  }

  public patch<T = any>(endpoint: string, body?: any, headers?: Record<string, string>) {
    return this.request<T>(endpoint, {
      method: 'PATCH',
      body: body ? JSON.stringify(body) : undefined,
      headers,
    });
  }

  public delete<T = any>(endpoint: string, headers?: Record<string, string>) {
    return this.request<T>(endpoint, { method: 'DELETE', headers });
  }

  public async uploadFormData<T = any>(
    endpoint: string,
    formData: FormData,
    extraHeaders?: Record<string, string>
  ): Promise<T> {
    const url = endpoint.startsWith('http')
      ? endpoint
      : `${ENV.API_URL}${endpoint.startsWith('/') ? '' : '/'}${endpoint}`;

    const headers: Record<string, string> = {
      Accept: 'application/json',
      ...(extraHeaders || {}),
    };

    if (this.token && !headers.Authorization) {
      headers.Authorization = `Bearer ${this.token}`;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), ENV.TIMEOUT_MS);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: formData,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.message || 'Upload failed');
      }
      return data as T;
    } catch (error: any) {
      clearTimeout(timeoutId);
      if (error.name === 'AbortError') {
        throw new Error(`Upload timed out after ${ENV.TIMEOUT_MS / 1000}s`);
      }
      throw error;
    }
  }
}

export const apiClient = new ApiClient();
