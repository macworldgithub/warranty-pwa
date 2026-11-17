import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createTopicHandler } from './push-topics.mjs';
// Node 22+ reads server environment files without copying secrets into assets.
for (const file of ['.env', '.env.local']) { try { process.loadEnvFile(file); } catch (error) { if (error.code !== 'ENOENT') throw error; } }
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist');
const base = process.env.VITE_BASE_PATH || '/';
const apiUrl = (process.env.PWA_API_HOST || process.env.VITE_API_HOST || 'https://warranty-evidence.omnisuiteai.com').replace(/\/+$/, '') + '/api/v1';
const topics = createTopicHandler({ apiUrl });
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml', '.wasm': 'application/wasm', '.gz': 'application/gzip' };
export const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (!url.pathname.startsWith(base)) { res.writeHead(404); res.end(); return; }
    if (url.pathname === base + 'pwa-api/push/topics') {
      if (req.method !== 'POST') { res.writeHead(405); res.end(); return; }
      let body = ''; for await (const chunk of req) { body += chunk; if (body.length > 8192) { res.writeHead(413); res.end(); return; } }
      const request = new Request(url, { method: 'POST', headers: req.headers, body });
      const response = await topics(request); res.writeHead(response.status, Object.fromEntries(response.headers)); res.end(await response.text()); return;
    }
    if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405); res.end(); return; }
    const relative = decodeURIComponent(url.pathname.slice(base.length));
    let target = path.resolve(root, relative || 'index.html');
    if (target !== root && !target.startsWith(root + path.sep)) { res.writeHead(403); res.end(); return; }
    let contents;
    try { contents = await fs.readFile(target); } catch (error) { if (path.extname(target)) { res.writeHead(404); res.end(); return; } target = path.join(root, 'index.html'); contents = await fs.readFile(target); }
    res.writeHead(200, { 'Content-Type': types[path.extname(target)] || 'application/octet-stream', 'Cache-Control': /(?:index.html|sw.js)$/.test(target) ? 'no-cache' : 'public, max-age=3600', 'X-Content-Type-Options': 'nosniff' });
    res.end(req.method === 'HEAD' ? undefined : contents);
  } catch (error) { console.error('PWA server:', error.message); res.writeHead(503, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ message: 'Push service is unavailable. Check server configuration.' })); }
});
server.listen(Number(process.env.PORT || 4173), process.env.HOST || '127.0.0.1', () => console.log('PWA server listening on port ' + (process.env.PORT || 4173)));
