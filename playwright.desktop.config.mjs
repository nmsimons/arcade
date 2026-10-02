import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests/desktop', workers: 1, fullyParallel: false,
  outputDir: './test-results-desktop',
  forbidOnly: !!process.env.CI, retries: 0, timeout: 60000,
  use: { trace: 'retain-on-failure' },
})
