import { defineConfig } from '@playwright/test'
import config from './playwright.config.mjs'

// Exercise the built homepage without starting the development server or games.
// These tests are also included in the regular production browser suite.
export default defineConfig({
  ...config,
  testMatch: /(?:homepage|desktopDownloads)\.spec\.mjs$/,
  projects: [{ name: 'homepage' }],
  webServer: config.webServer[0],
})
