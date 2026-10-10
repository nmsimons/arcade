import { readFileSync } from 'node:fs'
import { expect } from './test.mjs'
import { useLevelFixtures } from './jumpingLevels.mjs'

/** Observe the real game canvas, without exposing mutable simulation state. */
export async function playWaterPerformanceFixture(page) {
  const level = JSON.parse(readFileSync(new URL('../../fixtures/jumping/single-block-pool.json', import.meta.url)))
  level.goal = { ...level.goal, id: 'closed', power: 'switched' }
  level.props = [{ kind: 'box', x: 1020, y: 355, size: 60 }]
  await useLevelFixtures(page, [level])
  await page.setViewportSize({ width: 640, height: 360 })
  await page.addInitScript(() => {
    Object.defineProperty(window, 'devicePixelRatio', { configurable: true, value: 2 })
    const proto = CanvasRenderingContext2D.prototype, fillRect = proto.fillRect, stroke = proto.stroke
    proto.fillRect = function (...args) {
      if (args[0] === 0 && args[1] === 0 && this.fillStyle === '#f1f1ed') this.canvas.waterEffectsFrame = { surface: 0, droplets: 0, flat: 0 }
      const frame = this.canvas.waterEffectsFrame
      if (frame && this.fillStyle === '#58a9df') frame.flat++
      if (frame && this.fillStyle === '#bce3f2') frame.droplets++
      return fillRect.apply(this, args)
    }
    proto.stroke = function (...args) {
      if (this.canvas.waterEffectsFrame && this.strokeStyle === '#bce3f2') this.canvas.waterEffectsFrame.surface++
      return stroke.apply(this, args)
    }
  })
  await page.clock.install()
  await page.goto('/untitled-jumping-game?motionDebug=1')
  await page.getByRole('button', { name: `Play ${level.name}`, exact: true }).click()
  const canvas = page.locator('.jumping-game > canvas')
  await expect(canvas).toBeFocused()
  await page.keyboard.down('d'); await page.clock.runFor(3000); await page.keyboard.up('d')
  await page.clock.runFor(500)
  expect((await waterEffectsFrame(page)).surface).toBeGreaterThan(0)
  expect((await waterEffectsFrame(page)).droplets).toBe(0)
  return { fullPixels: await canvas.evaluate(c => c.width * c.height) }
}

export const waterEffectsFrame = page => page.locator('.jumping-game > canvas').evaluate(c => c.waterEffectsFrame)
export async function slowWaterFrames(page) {
  await page.evaluate(() => {
    window.requestAnimationFrame = callback => window.setTimeout(() => callback(performance.now()), 100)
    window.cancelAnimationFrame = id => window.clearTimeout(id)
  })
  await page.clock.runFor(3200)
}
