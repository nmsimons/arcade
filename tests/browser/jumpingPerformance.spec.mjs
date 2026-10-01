import { test, expect } from './helpers/test.mjs'
import { useLevelFixtures } from './helpers/jumpingLevels.mjs'
import { FIRST_LEVEL } from '../helpers/jumping-fixtures.mjs'

for (const { savedPreference, nightMode } of [
  { savedPreference: null, nightMode: true },
  { savedPreference: 'false', nightMode: true },
  { savedPreference: 'true', nightMode: true },
  { savedPreference: null, nightMode: false },
]) {
  test(`production adapts lighting with preference ${savedPreference ?? 'default'} at ${nightMode ? 'night' : 'day'} and hides developer tools`, async ({ page }) => {
    await page.setViewportSize({ width: 640, height: 360 })
    const level = structuredClone(FIRST_LEVEL)
    level.version = 2
    level.lighting = { nightMode, ambient: 25, lights: [] }
    await useLevelFixtures(page, [level])
    await page.addInitScript(value => {
      localStorage.setItem('jumping:performance-monitor', 'true')
      if (value !== null) localStorage.setItem('jumping:lighting-performance-mode', value)
      Object.defineProperty(window, 'devicePixelRatio', { configurable: true, value: 2 })
    }, savedPreference)
    await page.clock.install()
    await page.goto('/untitled-jumping-game')
    await page.getByRole('button', { name: `Play ${level.name}`, exact: true }).click()
    const canvas = page.locator('.jumping-game > canvas')
    await expect(canvas).toBeFocused()
    const fullPixels = await canvas.evaluate(c => c.width * c.height)
    expect(fullPixels).toBeGreaterThan(640 * 360)
    await page.evaluate(() => {
      window.requestAnimationFrame = callback => window.setTimeout(() => callback(performance.now()), 100)
      window.cancelAnimationFrame = id => window.clearTimeout(id)
    })
    await page.clock.runFor(3200)
    await page.keyboard.press('Backquote')
    await expect(page.getByRole('dialog', { name: 'Developer panel' })).toHaveCount(0)
    await page.clock.runFor(600)
    await expect(page.getByRole('complementary', { name: 'Performance monitor' })).toHaveCount(0)
    const adaptive = nightMode && savedPreference !== 'false'
    const pixels = await canvas.evaluate(c => c.width * c.height)
    if (adaptive) expect(pixels).toBeLessThan(fullPixels)
    else expect(pixels).toBe(fullPixels)
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog', { name: 'Game paused' })).toBeVisible()
    await expect(page.getByRole('switch', { name: /Performance monitor|Lighting performance mode/ })).toHaveCount(0)
    await expect(page.locator('#jumping-performance-mode-help')).toHaveCount(0)
    await page.keyboard.press('Backquote')
    await expect(page.getByRole('dialog', { name: 'Developer panel' })).toHaveCount(0)
    await expect(page.getByRole('complementary', { name: 'Performance monitor' })).toHaveCount(0)
    expect(await page.evaluate(() => [localStorage.getItem('jumping:performance-monitor'), localStorage.getItem('jumping:lighting-performance-mode')]))
      .toEqual(['true', savedPreference])
    await page.getByRole('button', { name: 'Resume', exact: false }).click()
    await expect(canvas).toBeFocused()
    await page.keyboard.press('Escape')
    await page.getByRole('button', { name: 'Restart level', exact: true }).click()
    await expect(canvas).toBeFocused()
    await page.clock.runFor(200)
    expect(await canvas.evaluate(c => c.width * c.height)).toBe(fullPixels)
  })
}
