import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './e2e', testMatch: 'redesign.spec.ts', fullyParallel: false, workers: 1,
  timeout: 30_000, expect: { timeout: 10_000 },
  use: { baseURL: 'http://127.0.0.1:8080', channel: 'chrome', headless: true, screenshot: 'only-on-failure' },
  outputDir: 'artifacts/redesign/test-results', reporter: 'list',
});
