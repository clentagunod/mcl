import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests', testMatch: '**/*.e2e.ts', outputDir: './.tmp/playwright',
  reporter: 'list', workers: 1, globalTimeout: 180_000,
  use: { browserName: 'chromium', channel: 'chrome', baseURL: 'http://127.0.0.1:4175', viewport: { width: 1600, height: 1000 }, timezoneId: 'Asia/Singapore', acceptDownloads: true },
  webServer: { command: `"${process.execPath}" node_modules/vite/bin/vite.js --host 127.0.0.1 --port 4175 --strictPort`, url: 'http://127.0.0.1:4175', reuseExistingServer: !process.env.CI },
});
