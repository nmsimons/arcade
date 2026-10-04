import { test, expect } from './helpers/test.mjs'
import { blankTrial, levelProblems } from '../../src/games/jumping/level.ts'
import { nearestBoundary } from '../../src/games/jumping/geometry.ts'
import { restartFromPause, useLevelFixtures } from './helpers/jumpingLevels.mjs'

for (const slope of [-3, 3]) test(`normal controls start a bot patrolling up and down a steep ramp (${slope})`, async ({ page }, info) => {
  const level = { ...blankTrial(), name: 'Bot slope', width: 1200, height: 1200, floor: 1200,
    spawn: { x: 1100, y: 1200 }, goal: { x: 1040, y: 1200 },
    platforms: [{ x: 300, y: 400, w: 200, h: 620,
      polygon: slope > 0 ? [[0, 0], [200, 600], [200, 620], [0, 20]] : [[0, 600], [200, 0], [200, 20], [0, 620]] }],
    robots: [{ x: 400, y: 700, left: 280, right: 520 }] }
  expect(levelProblems(level)).toEqual([])
  await useLevelFixtures(page, [level])
  const errors = []; page.on('pageerror', error => errors.push(error.message))
  await page.clock.install({ time: new Date('2026-01-01T00:00:00Z') })
  await page.addInitScript(() => {
    const proto = CanvasRenderingContext2D.prototype, rect = proto.fillRect, arc = proto.arc
    proto.fillRect = function (...args) {
      if (args[0] === 0 && args[1] === 0 && this.fillStyle === '#f1f1ed') this.canvas.slopeCamera = this.getTransform().inverse()
      return rect.apply(this, args)
    }
    proto.arc = function (...args) {
      if (args[2] === 9 && this.fillStyle === '#68736e' && this.canvas.slopeCamera) {
        const transform = this.canvas.slopeCamera.multiply(this.getTransform())
        const point = transform.transformPoint(new DOMPoint(args[0], args[1]))
        if (args[0] === -17) this.canvas.slopeWheels = []
        this.canvas.slopeWheels.push({ x: point.x, y: point.y })
        if (args[0] === 17) {
          const [a, b] = this.canvas.slopeWheels
          const facing = Math.sign(transform.a * transform.d - transform.b * transform.c)
          this.canvas.slopeFrames ??= []
          this.canvas.slopeFrames.push({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 + 9,
            angle: Math.atan2(transform.b * facing, transform.a * facing), wheels: this.canvas.slopeWheels })
        }
      }
      return arc.apply(this, args)
    }
  })
  await page.goto('/untitled-jumping-game')
  await page.getByRole('button', { name: 'Play Bot slope', exact: true }).waitFor()
  await page.clock.pauseAt(new Date('2026-01-01T01:00:00Z'))
  await page.getByRole('button', { name: 'Play Bot slope', exact: true }).click()
  const canvas = page.getByRole('img', { name: 'Bot slope: reach the exit' })
  await expect(canvas).toBeFocused(); await page.clock.runFor(64)
  const state = () => canvas.evaluate(c => c.slopeFrames.at(-1))
  const initial = await state()
  expect(initial.angle).toBeCloseTo(Math.atan(slope), 3)
  await page.screenshot({ path: info.outputPath('bot-starts-on-slope.png') })
  await canvas.evaluate(c => { c.slopeFrames = [] })
  await page.keyboard.down('w'); await page.clock.runFor(64); await page.keyboard.up('w')
  await page.clock.runFor(936)
  const left = await state()
  expect(left.x).toBeLessThan(initial.x - 85)
  expect((left.y - initial.y) * -Math.sign(slope)).toBeGreaterThan(200)
  await page.clock.runFor(2000)
  expect((await state()).x).toBeGreaterThan(initial.x + 70)
  for (const frame of await canvas.evaluate(c => c.slopeFrames)) for (const wheel of frame.wheels) {
    expect(Math.abs(nearestBoundary(level.platforms[0], wheel.x, wheel.y).distance - 9)).toBeLessThan(.01)
    expect(wheel.x).toBeGreaterThanOrEqual(300); expect(wheel.x).toBeLessThanOrEqual(500)
  }
  await page.screenshot({ path: info.outputPath('bot-turns-and-traverses-slope.png') })
  await restartFromPause(page); await page.clock.runFor(64)
  expect(await state()).toEqual(initial)
  expect(errors).toEqual([])
})
