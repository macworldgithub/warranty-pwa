import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { build } from 'esbuild';
import { loadEnv } from 'vite';
const env = loadEnv('production', process.cwd(), '');
const base = env.VITE_BASE_PATH || '/';
if (!base.startsWith('/') || !base.endsWith('/')) throw new Error('VITE_BASE_PATH must start and end with /.');
async function files(dir) {
  const list = [];
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const name = path.join(dir, entry.name);
    if (entry.isDirectory()) list.push(...await files(name)); else list.push(name);
  }
  return list;
}
const output = (await files('dist')).filter(file => !file.endsWith('sw.js'));
const hash = crypto.createHash('sha256');
for (const file of output) hash.update(await fs.readFile(file));
await build({ entryPoints: ['web/sw.ts'], bundle: true, minify: true, outfile: 'dist/sw.js', format: 'iife', target: 'es2020', define: {
  __PRECACHE_MANIFEST__: JSON.stringify(output.map(file => base + path.relative('dist', file).replaceAll('\\', '/'))),
  __CACHE_VERSION__: JSON.stringify(hash.digest('hex').slice(0, 16)), __BASE__: JSON.stringify(base),
  __FIREBASE_CONFIG__: JSON.stringify({ apiKey: env.VITE_FIREBASE_API_KEY, authDomain: env.VITE_FIREBASE_AUTH_DOMAIN, projectId: env.VITE_FIREBASE_PROJECT_ID, storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET, messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID, appId: env.VITE_FIREBASE_APP_ID }),
} });
console.log(`Service worker generated with ${output.length} precached assets.`);
