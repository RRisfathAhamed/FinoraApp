import { defineConfig } from '@playwright/test';

/**
 * End-to-end tests run against the real Vite dev server so IndexedDB,
 * FileReader/canvas image processing and JSZip all behave exactly as in the app.
 * Each test gets a fresh browser context, therefore a clean IndexedDB.
 */
export default defineConfig({
  testDir: './tests',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:5174',
    viewport: { width: 390, height: 844 },
    acceptDownloads: true,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 5174 --strictPort',
    url: 'http://127.0.0.1:5174',
    reuseExistingServer: true,
    timeout: 60_000,
  },
  projects: [{ name: 'mobile-chromium', use: { browserName: 'chromium' } }],
});
