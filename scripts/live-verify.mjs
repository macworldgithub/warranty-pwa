import { createInterface } from 'node:readline';
process.stdin.setRawMode?.(true);
const line = createInterface({ input: process.stdin, terminal: false });
process.stdout.write('Waiting for test credentials on stdin. Credentials are not saved.\n');
for await (const input of line) {
  const accounts = JSON.parse(input); line.close();
  for (const account of accounts) {
    const origin = 'https://warranty-evidence.omnisuiteai.com/api/v1';
    const response = await fetch(origin + '/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(account), signal: AbortSignal.timeout(15000) });
    const data = await response.json(); const result = data.data || data; const token = result.token || result.accessToken || result.access_token;
    console.log(JSON.stringify({ account: account.roleLabel, loginStatus: response.status, userRole: result.user?.role, sessionValid: !!token }));
    if (!token) continue;
    for (const endpoint of ['/auth/me', '/sites', '/brands', '/warranty-cases?limit=2', '/loan-agreements?status=ACTIVE', '/hoists', '/test-drives?limit=2', ...(account.roleLabel === 'admin' ? ['/auth/users'] : [])]) {
      try { const r = await fetch(origin + endpoint, { headers: { Authorization: 'Bearer ' + token }, signal: AbortSignal.timeout(15000) }); const json = await r.json(); const values = Array.isArray(json) ? json : json.data || json.items; console.log(JSON.stringify({ account: account.roleLabel, endpoint, status: r.status, count: Array.isArray(values) ? values.length : undefined, keys: !Array.isArray(json) ? Object.keys(json).filter(k => !/token|password/i.test(k)) : undefined })); } catch(e) { console.log(JSON.stringify({ account: account.roleLabel, endpoint, error: e.message })); }
    }
  }
  break;
}

