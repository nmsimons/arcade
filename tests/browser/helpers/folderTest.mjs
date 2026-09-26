import { test as base, expect } from './test.mjs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// Chromium needs a normal profile to restore structured-cloned filesystem handles.
export const test = base.extend({
  context: async ({ playwright, baseURL, viewport }, use) => {
    const profile = await mkdtemp(join(tmpdir(), 'jumping-files-browser-'))
    const context = await playwright.chromium.launchPersistentContext(profile, { channel: process.env.PLAYWRIGHT_CHANNEL || 'chromium', headless: true, baseURL, viewport })
    await context.addInitScript(() => { Object.defineProperty(Navigator.prototype, 'getGamepads', { configurable: true, value: () => [] }) })
    try { await use(context) } finally { await context.close(); await rm(profile, { recursive: true, force: true }) }
  },
})
export { expect }
