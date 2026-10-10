import { test, expect } from './helpers/test.mjs'
import { playWaterPerformanceFixture, waterEffectsFrame, slowWaterFrames } from './helpers/jumpingWaterPerformance.mjs'

test('disabling performance mode restores water effects without replaying skipped entry effects', async ({ page }) => {
  const { fullPixels } = await playWaterPerformanceFixture(page)
  await slowWaterFrames(page)
  expect(await waterEffectsFrame(page)).toEqual({ surface: 0, droplets: 0, flat: 1 })
  await page.keyboard.press('Backquote')
  const mode = page.getByRole('switch', { name: 'Performance mode', exact: true })
  await expect(mode).toBeChecked()
  await expect(page.getByText(/water surface effects are off for this run/)).toBeVisible()
  await mode.click()
  await page.keyboard.press('Backquote'); await page.clock.runFor(200)
  expect(await page.locator('.jumping-game > canvas').evaluate(c => c.width * c.height)).toBe(fullPixels)
  const frame = await waterEffectsFrame(page)
  expect(frame.surface).toBeGreaterThan(0); expect(frame.flat).toBe(1); expect(frame.droplets).toBe(0)
})
