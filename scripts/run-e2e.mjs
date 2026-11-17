import { spawn } from 'node:child_process';
// Start Vite directly so Windows can reliably terminate the exact preview process.
const preview = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--host', '127.0.0.1', '--port', '4173', '--strictPort'], { stdio: 'inherit', windowsHide: true });
try {
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt++) {
    if (preview.exitCode !== null) throw new Error('Preview server exited before browser tests could start.');
    try { ready = (await fetch('http://localhost:4173/', { signal: AbortSignal.timeout(500) })).ok; } catch {}
    if (ready) break;
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  if (!ready) throw new Error('Preview server did not become available. Run npm run build first.');
  const runner = spawn(process.execPath, ['node_modules/@playwright/test/cli.js', 'test', ...process.argv.slice(2)], { stdio: 'inherit', windowsHide: true });
  process.exitCode = await new Promise((resolve, reject) => { runner.on('error', reject); runner.on('exit', code => resolve(code || 0)); });
} finally { preview.kill(); }
