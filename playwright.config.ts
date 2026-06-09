import { defineConfig, devices } from '@playwright/test'
import { SPA_PORT } from './tests/e2e/fixtures/config'

export default defineConfig({
  testDir: './tests/e2e/journeys',
  // Journeys use the `.e2e.ts` suffix (not `.spec.ts`/`.test.ts`) so Bun's test
  // runner never discovers them — `bun test` would fail on @playwright/test's
  // `test()` outside its own runner. Keep this suffix for any new journey file.
  testMatch: '**/*.e2e.ts',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL: `http://localhost:${SPA_PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'bun run tests/e2e/serve-fixture.ts',
    url: `http://localhost:${SPA_PORT}`,
    reuseExistingServer: !process.env.CI,
    stdout: 'pipe',
    stderr: 'pipe',
  },
})
