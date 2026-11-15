import { defineConfig, devices } from '@playwright/test'

// E2E for revenue-critical flows only: real browser, real API, real MongoDB.
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'pnpm --filter @taskflow/api e2e:server',
      url: 'http://localhost:4000/health',
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      command: 'pnpm --filter @taskflow/web dev',
      url: 'http://localhost:5173',
      reuseExistingServer: !process.env.CI,
    },
  ],
})
