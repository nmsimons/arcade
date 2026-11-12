import { defineConfig } from '@playwright/test'
import { readdirSync, readFileSync } from 'node:fs'

// JUMPING_WEBGL=1 runs LAB's specs with the game drawing through WebGL (docs/jumping-webgl-renderer.md),
// in headless Edge, whose WebGL runs on the GPU (headless Chromium's is software: the game refuses it,
// and accepting it is too slow for the suite). The *-edge-canvas projects run the same specs in Edge with
// Canvas alone, the baseline for telling the renderer's failures from the browser's. Needs Edge and a
// GPU, so it is a local check, not CI's.
const webgl = process.env.JUMPING_WEBGL === '1'
const canvasOnly = origin => ({ origin, localStorage: [{ name: 'jumping:renderer', value: 'canvas' }] })
const canvasStorage = { cookies: [], origins: [canvasOnly('http://127.0.0.1:4175'), canvasOnly('http://127.0.0.1:4176')] }
const edge = { channel: 'msedge', launchOptions: { args: ['--enable-gpu'] } }
// Specs that watch the drawing by patching Canvas 2D calls (directly, or through the water-performance
// helper) cannot see WebGL draw: they run on Canvas only, in the ordinary projects.
const canvasHooked = webgl ? readdirSync('tests/browser').filter(file => /^jumping.*\.spec\.mjs$/.test(file)
  && /CanvasRenderingContext2D\.prototype|helpers\/jumpingWaterPerformance/.test(readFileSync(`tests/browser/${file}`, 'utf8')))
  .map(file => new RegExp(`[/\\\\]${file.replace(/\./g, '\\.')}$`)) : []

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
  projects: webgl ? [
    { name: 'production-webgl', testMatch: /jumping[^/\\]*\.spec\.mjs$/, testIgnore: [/\.dev\.spec\.mjs$/, ...canvasHooked], use: edge },
    { name: 'development-webgl', testMatch: /jumping[^/\\]*\.dev\.spec\.mjs$/, testIgnore: canvasHooked, use: { ...edge, baseURL: 'http://127.0.0.1:4176' } },
    { name: 'production-edge-canvas', testMatch: /jumping[^/\\]*\.spec\.mjs$/, testIgnore: /\.dev\.spec\.mjs$/, use: { ...edge, storageState: canvasStorage } },
    { name: 'development-edge-canvas', testMatch: /jumping[^/\\]*\.dev\.spec\.mjs$/, use: { ...edge, storageState: canvasStorage, baseURL: 'http://127.0.0.1:4176' } },
  ] : [
    { name: 'production', testIgnore: /\.dev\.spec\.mjs$/ },
    { name: 'development', testMatch: /\.dev\.spec\.mjs$/, use: { baseURL: 'http://127.0.0.1:4176' } },
    { name: 'iphone-webkit', testMatch: /jumping(?:WallText\.dev|Touch)\.spec\.mjs$/, use: {
      baseURL: 'http://127.0.0.1:4176', browserName: 'webkit',
      viewport: { width: 852, height: 393 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true,
    } },
  ],
  webServer: [{
    command: 'npm run preview -- --host 127.0.0.1 --port 4175 --strictPort',
    url: 'http://127.0.0.1:4175',
    reuseExistingServer: false,
  }, {
    command: 'npm run dev -- --host 127.0.0.1 --port 4176 --strictPort',
    // Public, deliberately nonfunctional IDs; account tests intercept the providers.
    env: { VITE_GOOGLE_CLIENT_ID: 'arcade-browser-test.apps.googleusercontent.com', VITE_GOOGLE_PICKER_API_KEY: 'browser-test-picker-key', VITE_GOOGLE_PROJECT_NUMBER: '123456789', VITE_MICROSOFT_CLIENT_ID: '00000000-0000-4000-8000-000000000001' },
    url: 'http://127.0.0.1:4176',
    reuseExistingServer: false,
  }],
})
