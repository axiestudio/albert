/**
 * Playwright Config — Albert Law Agent E2E Tests
 *
 * Usage:
 *   bunx playwright test --config Albert/tests/e2e/playwright.law-agent.config.ts
 *
 * Expects both services running:
 *   Frontend:  localhost:3000  (cd Albert/frontend && bun run dev)
 *   Backend:   localhost:3001  (cd Albert/backend && bun run dev)
 */

import { defineConfig, devices } from '@playwright/test'

const LAW_AGENT_URL = process.env.LAW_AGENT_URL || 'http://localhost:3000'
const API_URL = process.env.API_URL || 'http://localhost:3001'

export default defineConfig({
  testDir: '.',
  testMatch: '**/*.spec.ts',

  // Law agent responses can take a while (tool calls, LLM streaming)
  timeout: 180_000,
  expect: { timeout: 30_000 },

  retries: 0,
  workers: 1, // Sequential — one chat at a time to avoid rate limits
  fullyParallel: false,

  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? 'github' : 'list',
  outputDir: '../../../playwright-results/law-agent',

  webServer: [
    {
      command: 'cd Albert/frontend && bun run dev',
      url: LAW_AGENT_URL,
      timeout: 60_000,
      reuseExistingServer: true,
    },
    {
      command: 'cd Albert/backend && bun run dev',
      url: `${API_URL}/health`,
      timeout: 120_000,
      reuseExistingServer: true,
    },
  ],

  use: {
    baseURL: LAW_AGENT_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 15_000,
    navigationTimeout: 20_000,
  },

  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 900 },
      },
    },
  ],
})
