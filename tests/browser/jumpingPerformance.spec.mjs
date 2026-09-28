import { test, expect } from './helpers/test.mjs'
import { useLevelFixtures } from './helpers/jumpingLevels.mjs'
import { FIRST_LEVEL } from '../helpers/jumping-fixtures.mjs'

for (const savedPreference of ['false', 'true']) {
  test(`production hides performance tools and ignores saved preference ${savedPreference}`, async ({ page }) => {
    const level = structuredClone(FIRST_LEVEL)
    level.version = 2
    level.lighting = { nightMode: true, ambient: 25, lights: [] }
    await useLevelFixtures(page, [level])
    await page.addInitScript(value => {
      localStorage.setItem('jumping:performance-monitor', value)
      localStorage.setItem('jumping:lighting-performance-mode', value)
      Object.defineProperty(window, 'devicePixelRatio', { configurable: true, value: 2 })
    }, savedPreference)
    await page.clock.install()
    await page.goto('/untitled-jumping-game')
    await page.getByRole('button', { name: `Play ${level.name}`, exact: true }).click()
    const canvas = page.locator('.jumping-game > canvas')
    await expect(canvas).toBeFocused()
    const fullPixels = await canvas.evaluate(c => c.width * c.height)
    expect(fullPixels).toBeGreaterThan(1_005_000)
    await page.evaluate(() => {
      window.requestAnimationFrame = callback => window.setTimeout(() => callback(performance.now()), 40)
      window.cancelAnimationFrame = id => window.clearTimeout(id)
    })
    await page.clock.runFor(3200)
    await page.keyboard.press('F2')
    await page.clock.runFor(600)
    await expect(page.getByRole('complementary', { name: 'Performance monitor' })).toHaveCount(0)
    expect(await canvas.evaluate(c => c.width * c.height)).toBe(fullPixels)
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog', { name: 'Game paused' })).toBeVisible()
    await expect(page.getByRole('switch', { name: /Performance monitor|Lighting performance mode/ })).toHaveCount(0)
    await expect(page.locator('#jumping-performance-mode-help')).toHaveCount(0)
    await page.keyboard.press('F2')
    await expect(page.getByRole('complementary', { name: 'Performance monitor' })).toHaveCount(0)
    expect(await page.evaluate(() => [localStorage.getItem('jumping:performance-monitor'), localStorage.getItem('jumping:lighting-performance-mode')]))
      .toEqual([savedPreference, savedPreference])
    await page.getByRole('button', { name: 'Resume', exact: false }).click()
    await expect(canvas).toBeFocused()
  })
}
