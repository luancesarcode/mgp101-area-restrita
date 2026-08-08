import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/browser',
  fullyParallel: false,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:4173/game/',
    viewport: { width: 1280, height: 720 },
  },
  webServer: {
    command: 'npm run build && npm run preview -- --port 4173 --strictPort',
    url: 'http://127.0.0.1:4173/game/',
    reuseExistingServer: true,
    timeout: 120000,
  },
});
