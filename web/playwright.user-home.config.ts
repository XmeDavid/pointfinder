import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e-design",
  fullyParallel: false,
  workers: 1,
  projects: [
    { name: 'account', testMatch: 'user-home.spec.ts' },
    { name: 'guest', testMatch: 'guest.spec.ts', use: {baseURL: 'http://127.0.0.1:5189'} },
  ],
  use: {
    baseURL: "http://127.0.0.1:5188",
    browserName: "chromium",
    trace: "retain-on-failure",
  },
  webServer: [{
    command: "PF_LOCAL_DESIGN=1 bun run dev --host 0.0.0.0 --port 5188 --strictPort",
    url: "http://127.0.0.1:5188",
    reuseExistingServer: !process.env.CI,
  }, {
    command: "PF_LOCAL_API=1 bun run dev --host 127.0.0.1 --port 5189 --strictPort",
    url: "http://127.0.0.1:5189",
    reuseExistingServer: !process.env.CI,
  }],
});
