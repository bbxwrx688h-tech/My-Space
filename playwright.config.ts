import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/browser',
  workers: 1,
  timeout: 60000,
  use: {
    baseURL: 'http://127.0.0.1:3191',
    viewport: { width: 1487, height: 1058 },
    locale: 'he-IL',
    timezoneId: 'Asia/Jerusalem',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'npm run build && node tests/browser-server.cjs',
    url: 'http://127.0.0.1:3191/api/auth/options',
    reuseExistingServer: false,
    gracefulShutdown: { signal: 'SIGTERM', timeout: 5000 },
  },
});
