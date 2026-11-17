import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests', testMatch: '**/*.spec.ts', fullyParallel: false,
  timeout: 45000, workers: 1, reporter: 'list',
  use: { channel: 'chrome', baseURL: 'http://localhost:4173', viewport: { width: 390, height: 844 }, screenshot: 'only-on-failure', trace: 'retain-on-failure' },
});
