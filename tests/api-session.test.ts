import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { apiClient } from '../src/api/client';

vi.mock('../src/config/env', () => ({ ENV: { API_URL: 'https://warranty.test/api/v1', TIMEOUT_MS: 1000 } }));
vi.mock('../web/storage', () => ({ readCache: vi.fn(), writeCache: vi.fn() }));
vi.hoisted(() => {
  vi.stubGlobal('sessionStorage', { getItem: () => null, setItem: vi.fn(), removeItem: vi.fn() });
});

const unauthorized = vi.fn(() => apiClient.setToken(null));

beforeEach(() => {
  unauthorized.mockClear();
  apiClient.setToken('test-session');
  apiClient.setOnUnauthorized(unauthorized);
});

afterEach(() => vi.restoreAllMocks());

it.each(['json', 'multipart'])('ends the current session on a 401 from a %s request', async kind => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('Session expired', { status: 401 }));
  const request = kind === 'json'
    ? apiClient.post('/warranty-cases', {})
    : apiClient.uploadFormData('/warranty-cases/CASE-123/evidence/upload', new FormData());
  await expect(request).rejects.toMatchObject({ statusCode: 401 });
  expect(unauthorized).toHaveBeenCalledOnce();
  expect(apiClient.getToken()).toBeNull();
});

it('preserves the session and backend permission message on an upload 403', async () => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({ message: 'Technician access required' }, { status: 403 }));
  await expect(apiClient.uploadFormData('/evidence/upload', new FormData())).rejects.toMatchObject({
    statusCode: 403,
    message: 'Technician access required',
  });
  expect(unauthorized).not.toHaveBeenCalled();
  expect(apiClient.getToken()).toBe('test-session');
});

it('ignores an upload 401 from a superseded session', async () => {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
    apiClient.setToken('new-session');
    return new Response(null, { status: 401 });
  });
  await expect(apiClient.uploadFormData('/evidence/upload', new FormData())).rejects.toMatchObject({ statusCode: 401 });
  expect(unauthorized).not.toHaveBeenCalled();
  expect(apiClient.getToken()).toBe('new-session');
});
