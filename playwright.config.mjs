import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests/browser',
  fullyParallel: true,
  workers: 2,
  forbidOnly: !!process.env.CI,
  retries: 0,
  use: {
    baseURL: 'http://127.0.0.1:4175',
    browserName: 'chromium',
    viewport: { width: 1280, height: 800 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'production', testIgnore: /\.dev\.spec\.mjs$/ },
    { name: 'development', testMatch: /\.dev\.spec\.mjs$/, use: { baseURL: 'http://127.0.0.1:4176' } },
  ],
  webServer: [{
    command: 'npm run preview -- --host 127.0.0.1 --port 4175 --strictPort',
    url: 'http://127.0.0.1:4175',
    reuseExistingServer: false,
  }, {
    command: 'npm run dev -- --host 127.0.0.1 --port 4176 --strictPort',
    // Public, deliberately nonfunctional IDs; account tests intercept the providers.
    env: { VITE_GOOGLE_CLIENT_ID: 'arcade-browser-test.apps.googleusercontent.com', VITE_MICROSOFT_CLIENT_ID: '00000000-0000-4000-8000-000000000001' },
    url: 'http://127.0.0.1:4176',
    reuseExistingServer: false,
  }],
})
