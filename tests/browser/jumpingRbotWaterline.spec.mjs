import { readFileSync } from 'node:fs'
import { test, expect } from './helpers/test.mjs'
import { useLevelFixtures } from './helpers/jumpingLevels.mjs'

test('Waterline II: Rbot swims out of the right pool at normal speed', async ({ page }, info) => {
  test.setTimeout(45000)
  await page.setViewportSize({ width: 2500, height: 800 })
  const level = JSON.parse(readFileSync(new URL('../fixtures/jumping/waterline-ii-rbot-water.json', import.meta.url), 'utf8'))
  await useLevelFixtures(page, [level])
  await page.addInitScript(() => {
    const proto = CanvasRenderingContext2D.prototype, rect = proto.fillRect, fill = proto.fill
    proto.fillRect = function (...args) {
      if (this.canvas.matches?.('.jumping-game > canvas') && args[0] === 0 && args[1] === 0 && this.fillStyle === '#f1f1ed') {
        this.canvas.botCamera = this.getTransform(); this.canvas.botDrawn = false
      }
      return rect.apply(this, args)
    }
    proto.fill = function (...args) {
      if (this.canvas.matches?.('.jumping-game > canvas') && args[0] instanceof Path2D && this.fillStyle === '#b66d65'
        && this.canvas.botCamera && !this.canvas.botDrawn) {
        const t = this.getTransform(), camera = this.canvas.botCamera
        this.canvas.botFrames ??= []
        this.canvas.botFrames.push({ x: (t.e - camera.e) / camera.a, y: (t.f - camera.f) / camera.d })
        this.canvas.botDrawn = true
      }
      return fill.apply(this, args)
    }
  })
  const errors = []; page.on('pageerror', error => errors.push(error.message))
  await page.goto('/lab')
  await page.locator('.jumping-level-card').filter({ hasText: level.name }).click()
  const canvas = page.locator('.jumping-game > canvas')
  await expect(canvas).toBeFocused()
  await expect.poll(() => canvas.evaluate(c => c.botFrames?.some(p => p.y > 990)), { timeout: 15000 }).toBe(true)
  const screenshot = async name => {
    const box = await canvas.boundingBox(), clip = await canvas.evaluate((c, box) => {
      const t = c.botCamera, ratio = c.width / box.width
      const x = Math.max(box.x, box.x + (1780 * t.a + t.e) / ratio)
      const y = Math.max(box.y, box.y + (745 * t.d + t.f) / ratio)
      return { x, y, width: Math.min(box.x + box.width - x, 620 * t.a / ratio), height: Math.min(box.y + box.height - y, 655 * t.d / ratio) }
    }, box)
    await page.screenshot({ path: info.outputPath(name), clip })
  }
  await screenshot('waterline-rbot-swimming.png')
  await expect.poll(() => canvas.evaluate(c => c.botFrames?.some(p => p.x >= 2120 && p.x <= 2320 && Math.abs(p.y - 845) < .1)), { timeout: 15000 }).toBe(true)
  await screenshot('waterline-rbot-on-bank.png')
  expect(errors).toEqual([])
})
