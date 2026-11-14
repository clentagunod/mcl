import base from './playwright.config';

export default {
  ...base,
  testMatch: '**/printing-session.e2e.ts',
  outputDir: './.tmp/printing-session',
  timeout: 60_000,
  webServer: undefined,
  use: { ...base.use, baseURL: 'http://127.0.0.1:4180' },
};
