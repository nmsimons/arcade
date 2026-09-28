import { test, expect } from './helpers/test.mjs'
import { useLevelFixtures } from './helpers/jumpingLevels.mjs'
import { blankTrial, levelProblems } from '../../src/games/jumping/level.ts'
import { bodyPolygon, polygonIntersects } from '../../src/games/jumping/geometry.ts'
import { ballShape } from '../../src/games/jumping/propGeometry.ts'

for (const reverse of [false, true]) test(`holding left between a small box and a bot-driven ball keeps the drawn body stable (${reverse ? 'reversed' : 'normal'} prop order)`, async ({ page }, info) => {
  const level = { ...blankTrial(), name: 'Small prop gap', width: 1200, height: 600, floor: 500,
    spawn: { x: 650, y: 500 }, goal: { x: 100, y: 500 },
    platforms: [{ x: 400, y: 200, w: 200, h: 300 }],
    props: [{ kind: 'box', x: 615, y: 500, size: 30 }, { kind: 'ball', x: 668, y: 500, size: 30 }],
    robots: [{ x: 710, y: 500, left: 300, right: 1000 }] }
  if (reverse) level.props.reverse()
  expect(levelProblems(level)).toEqual([])
  await useLevelFixtures(page, [level])
  const errors = []; page.on('pageerror', error => errors.push(error.message))
  await page.clock.install({ time: new Date('2026-01-01T00:00:00Z') })
  await page.addInitScript(() => {
    const proto = CanvasRenderingContext2D.prototype, rect = proto.fillRect, ellipse = proto.ellipse
    proto.fillRect = function (...args) {
      if (args[0] === 0 && args[1] === 0 && this.fillStyle === '#f1f1ed') this.canvas.gapCamera = this.getTransform().inverse()
      return rect.apply(this, args)
    }
    proto.ellipse = function (...args) {
      if (args[2] === 6.2 && args[3] === 6.2 && this.canvas.gapCamera) {
        const transform = this.canvas.gapCamera.multiply(this.getTransform())
        const head = transform.transformPoint(new DOMPoint(args[0], args[1]))
        this.canvas.gapFrames ??= []
        this.canvas.gapFrames.push({ time: performance.now(), headX: head.x, headY: head.y, x: transform.e, y: transform.f })
      }
      return ellipse.apply(this, args)
    }
  })
  await page.goto('/untitled-jumping-game?motionDebug=1')
  await expect(page.locator('.jumping-level-card[aria-pressed=true]')).toBeVisible()
  await page.clock.pauseAt(new Date('2026-01-01T01:00:00Z'))
  await page.locator('.jumping-level-card[aria-pressed=true]').click()
  const canvas = page.getByRole('img', { name: 'Small prop gap: activate the goal' })
  await expect(canvas).toBeFocused(); await page.clock.runFor(64)
  await page.keyboard.down('w'); await page.clock.runFor(16); await page.keyboard.up('w')
  await page.clock.runFor(2000)
  await page.screenshot({ path: info.outputPath('idle-in-gap.png') })
  for (let cycle = 0; cycle < 2; cycle++) {
    await page.keyboard.down('a'); await page.clock.runFor(150)
    await canvas.evaluate(c => { c.gapFrames = [] })
    await page.clock.runFor(2000)
    const frames = await canvas.evaluate(c => c.gapFrames)
    expect(frames.length).toBeGreaterThan(100)
    for (let i = 1; i < frames.length; i++) {
      const before = frames[i - 1], after = frames[i]
      expect(Math.hypot(after.headX - before.headX, after.headY - before.headY)).toBeLessThan(5)
      expect(Math.abs(after.x - 642)).toBeLessThan(10)
    }
    const samples = (await page.evaluate(() => window.jumpingMotion.read())).recent
    expect(samples.filter(s => s.signals.sliding).length).toBeGreaterThan(60)
    for (let i = 1; i < samples.length; i++) {
      const before = samples[i - 1], after = samples[i]
      for (const joint of [0, 1, 2]) expect(Math.hypot(...after.points[joint].map((v, axis) => v - before.points[joint][axis]))).toBeLessThan(3)
    }
    await page.screenshot({ path: info.outputPath(`holding-left-${cycle}.png`) })
    await page.keyboard.up('a'); await page.clock.runFor(500)
  }
  expect(errors).toEqual([])
})

test('a shovebot cannot squeeze the player inside two balls, and jumping remains available', async ({ page }, info) => {
  const level = { ...blankTrial(), name: 'Ball squeeze', width: 1000, height: 500, floor: 420,
    spawn: { x: 650, y: 420 }, goal: { x: 150, y: 420 },
    platforms: [{ x: 744, y: 100, w: 20, h: 320 }],
    robots: [{ x: 450, y: 420, left: 450, right: 900 }],
    props: [{ kind: 'box', x: 520, y: 420, size: 80 }, { kind: 'ball', x: 594, y: 420, size: 68 }, { kind: 'ball', x: 710, y: 420, size: 68 }] }
  expect(levelProblems(level)).toEqual([])
  await useLevelFixtures(page, [level])
  const errors = []; page.on('pageerror', error => errors.push(error.message))
  await page.clock.install({ time: new Date('2026-01-01T00:00:00Z') })
  await page.addInitScript(() => {
    const proto = CanvasRenderingContext2D.prototype, rect = proto.fillRect, arc = proto.arc, ellipse = proto.ellipse
    proto.fillRect = function (...args) {
      if (args[0] === 0 && args[1] === 0 && this.fillStyle === '#f1f1ed') {
        this.canvas.squeezeCamera = this.getTransform().inverse(); this.canvas.squeezeBalls = []
      }
      return rect.apply(this, args)
    }
    proto.arc = function (...args) {
      if (this.fillStyle === '#8f9e98' && this.canvas.squeezeCamera) {
        const center = this.canvas.squeezeCamera.multiply(this.getTransform()).transformPoint(new DOMPoint(args[0], args[1]))
        this.canvas.squeezeBalls.push({ x: center.x, y: center.y + args[2], size: args[2] * 2 })
      }
      return arc.apply(this, args)
    }
    proto.ellipse = function (...args) {
      if (args[2] === 6.2 && args[3] === 6.2 && this.canvas.squeezeCamera) {
        const root = this.canvas.squeezeCamera.multiply(this.getTransform())
        this.canvas.squeezeFrames ??= []
        this.canvas.squeezeFrames.push({ x: root.e, y: root.f, balls: this.canvas.squeezeBalls })
      }
      return ellipse.apply(this, args)
    }
  })
  await page.goto('/untitled-jumping-game?motionDebug=1')
  await expect(page.locator('.jumping-level-card[aria-pressed=true]')).toBeVisible()
  await page.clock.pauseAt(new Date('2026-01-01T01:00:00Z'))
  await page.locator('.jumping-level-card[aria-pressed=true]').click()
  const canvas = page.getByRole('img', { name: 'Ball squeeze: activate the goal' })
  await expect(canvas).toBeFocused(); await page.clock.runFor(64)
  // A short movement input starts the run; the rest of the squeeze is passive.
  await page.keyboard.down('d'); await page.clock.runFor(16); await page.keyboard.up('d')
  await canvas.evaluate(c => { c.squeezeFrames = [] })
  await page.clock.runFor(3000)
  const frames = await canvas.evaluate(c => c.squeezeFrames)
  expect(frames.length).toBeGreaterThan(100)
  expect(frames.at(-1).x).toBeGreaterThan(660)
  for (const frame of frames) {
    expect(frame.balls).toHaveLength(2)
    for (const ball of frame.balls) expect(polygonIntersects(bodyPolygon(frame.x, frame.y, 62), ballShape(ball), .002)).toBe(false)
  }
  const settled = frames.slice(-60).map(f => f.x)
  expect(Math.max(...settled) - Math.min(...settled)).toBeLessThan(.01)
  expect((await page.evaluate(() => window.jumpingMotion.read())).reports).toEqual([])
  await page.screenshot({ path: info.outputPath('standing-between-balls.png') })
  await page.keyboard.down('Space'); await page.clock.runFor(200); await page.keyboard.up('Space'); await page.clock.runFor(240)
  expect((await canvas.evaluate(c => c.squeezeFrames.at(-1))).y).toBeLessThan(340)
  await page.screenshot({ path: info.outputPath('jumping-out-of-squeeze.png') })
  expect(errors).toEqual([])
})
