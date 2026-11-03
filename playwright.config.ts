import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;

/**
 * E2E + accessibility tests against a real server on an in-memory database, with the date
 * simulated to 10 December and demo data (59 completions → 3 pieces; the next tick unlocks #4).
 * Each test resets the database through the test-only /api/test/reset endpoint, so tests run
 * serially.
 */
export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium-desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'webkit-phone', use: { ...devices['iPhone 13'] } },
  ],
  webServer: {
    command: 'npx vite build && node src/api/main.ts',
    url: `http://localhost:${PORT}/health`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      APP_ENV: 'test',
      PORT: String(PORT),
      HOST: '127.0.0.1',
      PGLITE_DIR: 'memory://',
      AUTH_MODE: 'dev',
      FAKE_TODAY: '2026-12-10',
      SEED_DEMO: 'true',
    },
  },
});
