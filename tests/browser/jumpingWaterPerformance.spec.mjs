import { test, expect } from './helpers/test.mjs'
import { playWaterPerformanceFixture, waterEffectsFrame, slowWaterFrames } from './helpers/jumpingWaterPerformance.mjs'

test('production low performance fallback disables water effects and restart restores them', async ({ page }) => {
  const { fullPixels } = await playWaterPerformanceFixture(page)
  await slowWaterFrames(page)
  const canvas = page.locator('.jumping-game > canvas')
  expect(await canvas.evaluate(c => c.width * c.height)).toBeLessThan(fullPixels)
  expect(await waterEffectsFrame(page)).toEqual({ surface: 0, droplets: 0, flat: 1 })
  const before = await page.evaluate(() => window.jumpingMotion.read().recent.at(-1).waterCenter)
  await page.keyboard.down('ArrowDown'); await page.clock.runFor(1200); await page.keyboard.up('ArrowDown')
  const after = await page.evaluate(() => window.jumpingMotion.read().recent.at(-1).waterCenter)
  expect(after).toBeGreaterThan(before + 35)
  expect(await waterEffectsFrame(page)).toEqual({ surface: 0, droplets: 0, flat: 1 })
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'Restart level', exact: true }).click()
  await expect(canvas).toBeFocused()
  await page.clock.runFor(200)
  expect(await canvas.evaluate(c => c.width * c.height)).toBe(fullPixels)
  expect((await waterEffectsFrame(page)).surface).toBeGreaterThan(0)
})
