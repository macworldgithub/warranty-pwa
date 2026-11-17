import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: '.', testMatch: '**/*.spec.ts', workers: 1, timeout: 30000, reporter: 'list',
  use: { channel: 'chrome', baseURL: 'http://localhost:4173', viewport: { width: 390, height: 844 }, screenshot: 'only-on-failure', trace: 'retain-on-failure' },
});
