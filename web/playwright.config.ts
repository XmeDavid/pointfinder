import { defineConfig } from '@playwright/test'
export default defineConfig({
  testDir: './e2e', fullyParallel: false, workers: 1, timeout: 60_000,
  use: { browserName: 'chromium', locale: 'en', trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  projects: [
    { name: 'browser', use: { baseURL: 'http://127.0.0.1:4173', viewport: { width: 1280, height: 800 } } },
    { name: 'native-shell', use: { baseURL: 'http://127.0.0.1:4174', viewport: { width: 390, height: 844 } } },
  ],
  webServer: [
    { command: 'bun run preview --host 127.0.0.1 --port 4173', url: 'http://127.0.0.1:4173', reuseExistingServer: !process.env.CI },
    { command: 'bun run preview --outDir dist-native --host 127.0.0.1 --port 4174', url: 'http://127.0.0.1:4174', reuseExistingServer: !process.env.CI },
  ],
})
