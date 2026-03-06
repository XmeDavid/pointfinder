import { defineConfig } from '@playwright/test';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '.env') });

export default defineConfig({
  testDir: '.',
  testMatch: ['api/**/*.spec.ts', 'web/**/*.spec.ts'],
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: process.env.BASE_URL || 'https://pointfinder.pt',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    locale: 'en',
  },
  outputDir: './artifacts',
  projects: [
    {
      name: 'api',
      testMatch: 'api/**/*.spec.ts',
    },
    {
      name: 'web',
      testMatch: 'web/**/*.spec.ts',
      use: {
        browserName: 'chromium',
      },
    },
  ],
});
