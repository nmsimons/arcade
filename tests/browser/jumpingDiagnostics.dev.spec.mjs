import { test, expect } from './helpers/test.mjs'
import { blankTrial } from '../../src/games/jumping/level.ts'
import { finishJumpingEntrance, useLevelFixtures } from './helpers/jumpingLevels.mjs'

for (const enabled of [false, true]) test(`motion diagnostics are ${enabled ? 'available when requested' : 'absent during ordinary development play'}`, async ({ page }) => {
  await useLevelFixtures(page, [blankTrial()])
  await page.clock.install({ time: new Date('2026-01-01T00:00:00Z') })
  await page.goto(enabled ? '/lab?motionDebug=1' : '/lab')
  const card = page.locator('.jumping-level-card[aria-pressed=true]')
  await expect(card).toBeVisible()
  await page.clock.pauseAt(new Date('2026-01-01T01:00:00Z'))
  await card.click(); await finishJumpingEntrance(page)
  await page.keyboard.down('Space'); await page.clock.runFor(64); await page.keyboard.up('Space')
  expect(await page.evaluate(() => !!window.jumpingMotion)).toBe(enabled)
  if (enabled) {
    const sample = await page.evaluate(() => window.jumpingMotion.read().recent.at(-1))
    expect(sample.vy).toBeLessThan(0)
    expect(sample.signals.grounded).toBe(false)
  }
  await expect(page.locator('.jumping-game > canvas')).toBeFocused()
})
