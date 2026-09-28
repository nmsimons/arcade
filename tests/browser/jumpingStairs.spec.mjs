import { test, expect } from './helpers/test.mjs'
import { useLevelFixtures } from './helpers/jumpingLevels.mjs'
import { blankTrial, levelProblems } from '../../src/games/jumping/level.ts'
import { bodyPolygon, polygonIntersects } from '../../src/games/jumping/geometry.ts'

for (const tread of [20, 40]) test(`${tread}-unit stair treads climb with ordinary movement controls`, async ({ page }, info) => {
  const steps = Array.from({ length: 5 }, (_, i) => ({ x: 300 + i * tread, y: 400 - i * 20, w: i === 4 ? 420 - i * tread : tread }))
  const stairs = { x: 300, y: 320, w: 420, h: 100,
    polygon: [...steps.flatMap(s => [[s.x - 300, s.y - 320], [s.x + s.w - 300, s.y - 320]]), [420,100],[0,100]] }
  const level = { ...blankTrial(), name: 'Stair treads', width: 1000, height: 420, floor: 420,
    spawn: { x: 250, y: 420 }, goal: { x: 100, y: 420 }, platforms: [stairs] }
  expect(levelProblems(level)).toEqual([])
  await useLevelFixtures(page, [level])
  const errors = []; page.on('pageerror', error => errors.push(error.message))
  await page.clock.install({ time: new Date('2026-01-01T00:00:00Z') })
  await page.addInitScript(() => {
    const proto = CanvasRenderingContext2D.prototype, rect = proto.fillRect, ellipse = proto.ellipse
    proto.fillRect = function (...args) {
      if (args[0] === 0 && args[1] === 0 && this.fillStyle === '#f1f1ed') this.canvas.stairCamera = this.getTransform().inverse()
      return rect.apply(this, args)
    }
    proto.ellipse = function (...args) {
      if (args[2] === 6.2 && args[3] === 6.2 && this.canvas.stairCamera) {
        const root = this.canvas.stairCamera.multiply(this.getTransform())
        this.canvas.stairFrames ??= []
        this.canvas.stairFrames.push({ x: root.e, y: root.f })
      }
      return ellipse.apply(this, args)
    }
  })
  await page.goto('/untitled-jumping-game')
  await expect(page.locator('.jumping-level-card[aria-pressed=true]')).toBeVisible()
  await page.clock.pauseAt(new Date('2026-01-01T01:00:00Z'))
  await page.locator('.jumping-level-card[aria-pressed=true]').click()
  const canvas = page.getByRole('img', { name: 'Stair treads: activate the goal' })
  await expect(canvas).toBeFocused(); await page.clock.runFor(64)
  await canvas.evaluate(c => { c.stairFrames = [] })
  await page.keyboard.down('d'); await page.clock.runFor(850)
  await page.screenshot({ path: info.outputPath('climbing-stairs.png') })
  for (let i = 0; i < 30; i++) {
    const last = await canvas.evaluate(c => c.stairFrames.at(-1))
    if (last.x > 330 + 4 * tread && Math.abs(last.y - 320) < .01) break
    await page.clock.runFor(32)
  }
  await page.keyboard.up('d'); await page.clock.runFor(200)
  const frames = await canvas.evaluate(c => c.stairFrames)
  expect(frames.at(-1).y).toBeCloseTo(320, 2)
  expect(frames.at(-1).x).toBeGreaterThan(320 + 4 * tread)
  for (let i = 0; i < frames.length; i++) {
    const frame = frames[i]
    expect(polygonIntersects(bodyPolygon(frame.x, frame.y, 62), stairs, .002)).toBe(false)
    if (i) expect(Math.hypot(frame.x - frames[i - 1].x, frame.y - frames[i - 1].y)).toBeLessThan(15)
  }
  for (const y of [400, 380, 360, 340, 320]) expect(frames.some(f => Math.abs(f.y - y) < .01)).toBe(true)
  await page.screenshot({ path: info.outputPath('reached-top.png') })
  expect(errors).toEqual([])
})
