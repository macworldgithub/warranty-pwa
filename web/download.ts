import { apiClient } from '../src/api/client';
export async function downloadAuthenticated(url: string, filename: string) {
  const token = apiClient.getToken();
  const response = await fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {}, signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`Download failed (${response.status}). Please check your session and server connection.`);
  const blob = await response.blob(); const uri = URL.createObjectURL(blob);
  const link = document.createElement('a'); link.href = uri; link.download = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
  document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(uri), 60000);
}
