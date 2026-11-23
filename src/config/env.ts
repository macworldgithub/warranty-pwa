// Send API requests directly to the backend, including during Vite development.
// Set VITE_API_HOST to the deployed backend host (without /api/v1).
const configuredApiHost = (import.meta.env.VITE_API_HOST || 'https://warranty-evidence.omnisuiteai.com').replace(/\/+$/, '');
const savedApiHost = localStorage.getItem('booran-api-host')?.replace(/\/+$/, '');
// Migrate saved frontend and retired LAN addresses to the deployed backend.
export const DEFAULT_API_HOST = savedApiHost
  && savedApiHost !== window.location.origin
  && (window.location.protocol !== 'https:' || savedApiHost.startsWith('https://'))
  && savedApiHost !== 'http://192.168.100.33:4000'
  ? savedApiHost
  : configuredApiHost;

export const API_BASE_PATH = '/api/v1';

export const ENV = {
  API_URL: `${DEFAULT_API_HOST}${API_BASE_PATH}`,
  BASE_URL: DEFAULT_API_HOST,
  TIMEOUT_MS: 30000,
  MAX_PHOTO_SIZE_MB: 10,
  MAX_VIDEO_DURATION_SEC: 60,
  MIN_VIDEO_DURATION_SEC: 5,
};

let currentBaseUrl = DEFAULT_API_HOST;

export const setApiBaseUrl = (newUrl: string) => {
  const parsed = new URL(newUrl);
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('Enter an HTTP or HTTPS server URL.');
  if (window.location.protocol === 'https:' && parsed.protocol !== 'https:') throw new Error('An HTTPS PWA requires an HTTPS backend.');
  currentBaseUrl = newUrl.replace(/\/+$/, '');
  localStorage.setItem('booran-api-host', currentBaseUrl);
  ENV.BASE_URL = currentBaseUrl;
  ENV.API_URL = `${currentBaseUrl}${API_BASE_PATH}`;
  window.dispatchEvent(new Event('api-host-change'));
};

export const getApiBaseUrl = () => ENV.API_URL;
export const getBaseServerUrl = () => ENV.BASE_URL;



