import { test, expect } from './helpers/test.mjs'
import { useLevelFixtures } from './helpers/jumpingLevels.mjs'
import { blankTrial } from '../../src/games/jumping/level.ts'

test('walking off a high platform falls prone, lands flat and gets up with normal controls', async ({ page }, info) => {
  const level = blankTrial()
  Object.assign(level, { height: 1400, floor: 1400, spawn: { x: 200, y: 160 }, goal: { x: 1620, y: 1400 },
    platforms: [{ x: 100, y: 160, w: 220, h: 24 }] })
  const errors = []; page.on('pageerror', error => errors.push(error.message))
  await useLevelFixtures(page, [level])
  await page.clock.install({ time: new Date('2026-01-01T00:00:00Z') })
  await page.goto('/untitled-jumping-game?motionDebug=1')
  await expect(page.locator('.jumping-level-card[aria-pressed=true]')).toBeVisible()
  await page.clock.pauseAt(new Date('2026-01-01T01:00:00Z'))
  await page.getByRole('button', { name: 'Play Untitled level', exact: true }).click()
  await page.clock.runFor(64)
  await expect(page.locator('canvas[tabindex="0"]')).toBeFocused()
  const read = () => page.evaluate(() => window.jumpingMotion.read())
  const sample = async () => (await read()).recent.at(-1)
  // Walk off and release early enough to stop in the air. Running until the
  // prone phase retains forward momentum at impact and now correctly starts
  // the moving recovery, which has its own supported-running browser check.
  await page.keyboard.down('Shift'); await page.keyboard.down('d'); await page.clock.runFor(1400)
  await page.keyboard.up('d'); await page.keyboard.up('Shift')
  for (let i = 0; i < 80 && (await sample()).blends.fall < 1; i++) await page.clock.runFor(16)
  const falling = await sample()
  expect(falling.signals.mode).toBe('fall')
  expect(falling.blends.fall).toBe(1)
  expect(Math.abs(falling.points[1][1] - falling.points[0][1])).toBeLessThan(2)
  await page.screenshot({ path: info.outputPath('prone-flight.png') })
  await page.keyboard.down('a')
  await page.clock.runFor(64)
  expect((await sample()).vx).toBeLessThan(falling.vx)
  expect((await sample()).signals.facing).toBe(-1)
  await page.keyboard.up('a')
  for (let i = 0; i < 70 && !(await sample()).signals.grounded; i++) await page.clock.runFor(16)
  const landed = await sample()
  expect(landed.vx).toBe(0)
  expect(landed.signals.mode).toBe('get-up')
  expect(landed.points[2][1]).toBeGreaterThan(-12)
  await page.screenshot({ path: info.outputPath('flat-landing.png') })
  await page.clock.runFor(360)
  expect((await sample()).signals.mode).toBe('get-up')
  expect((await sample()).signals.grounded).toBe(true)
  await page.screenshot({ path: info.outputPath('getting-up.png') })
  await page.clock.runFor(440)
  expect((await sample()).signals.mode).toBe('get-up')
  expect((await sample()).signals.grounded).toBe(true)
  await page.clock.runFor(260)
  expect((await sample()).signals.mode).toBe('free')
  await page.keyboard.down('a'); await page.clock.runFor(64)
  expect((await sample()).vx).toBeLessThan(0)
  expect((await sample()).signals.grounded).toBe(true)
  await page.keyboard.down('Space'); await page.clock.runFor(64)
  expect((await sample()).signals.grounded).toBe(false)
  expect((await sample()).vy).toBeLessThan(0)
  expect((await read()).reports).toEqual([])
  expect(errors).toEqual([])
})

test('an upward grav lift eases into a prone floating pose while steering remains available', async ({ page }, info) => {
  const level = { ...blankTrial(), name: 'Prone grav lift', height: 2000, floor: 2000,
    spawn: { x: 700, y: 2000 }, goal: { x: 1620, y: 2000 },
    gravityPlates: [{ id: 'lift', x: 100, y: 80, w: 1500, h: 1920, gravity: -1, power: 'always' }] }
  const errors = []; page.on('pageerror', error => errors.push(error.message))
  await useLevelFixtures(page, [level])
  await page.clock.install({ time: new Date('2026-01-01T00:00:00Z') })
  await page.goto('/untitled-jumping-game?motionDebug=1')
  await expect(page.getByRole('button', { name: 'Play Prone grav lift', exact: true })).toBeEnabled()
  await page.clock.pauseAt(new Date('2026-01-01T01:00:00Z'))
  await page.getByRole('button', { name: 'Play Prone grav lift', exact: true }).click()
  await page.clock.runFor(64)
  await expect(page.locator('canvas[tabindex="0"]')).toBeFocused()
  const sample = () => page.evaluate(() => window.jumpingMotion.read().recent.at(-1))
  await page.keyboard.down('d'); await page.clock.runFor(800)
  expect((await sample()).blends.fall).toBe(0)
  await page.clock.runFor(500)
  const floating = await sample()
  expect(floating.blends.fall).toBe(1)
  expect(floating.vy).toBeLessThan(0)
  expect(floating.signals.grounded).toBe(false)
  expect(Math.abs(floating.points[1][1] - floating.points[0][1])).toBeLessThan(2)
  await page.screenshot({ path: info.outputPath('prone-grav-lift.png') })
  await page.keyboard.up('d'); await page.keyboard.down('a'); await page.clock.runFor(100)
  expect((await sample()).vx).toBeLessThan(floating.vx)
  expect((await sample()).signals.facing).toBe(-1)
  expect((await sample()).blends.fall).toBe(1)
  expect(errors).toEqual([])
})

test('zero-g drift becomes prone, bumps a floating ball with neutral input and slows in the air', async ({ page }, info) => {
  const level = { ...blankTrial(), name: 'Weightless drift', height: 1400, floor: 1400,
    spawn: { x: 300, y: 500 }, goal: { x: 1620, y: 1400 },
    platforms: [{ x: 100, y: 500, w: 260, h: 24 }],
    props: [{ kind: 'ball', x: 720, y: 500, size: 60 }],
    gravityPlates: [{ id: 'zero-g', x: 20, y: 20, w: 1760, h: 1360, gravity: 0, power: 'always' }] }
  const errors = []; page.on('pageerror', error => errors.push(error.message))
  await useLevelFixtures(page, [level])
  await page.addInitScript(() => {
    const arc = CanvasRenderingContext2D.prototype.arc
    CanvasRenderingContext2D.prototype.arc = function (...args) {
      if (this.fillStyle === '#8f9e98' && args[2] === 30) this.canvas.floatingBallX = args[0]
      return arc.apply(this, args)
    }
  })
  await page.clock.install({ time: new Date('2026-01-01T00:00:00Z') })
  await page.goto('/untitled-jumping-game?motionDebug=1')
  await expect(page.getByRole('button', { name: 'Play Weightless drift', exact: true })).toBeEnabled()
  await page.clock.pauseAt(new Date('2026-01-01T01:00:00Z'))
  await page.getByRole('button', { name: 'Play Weightless drift', exact: true }).click()
  await page.clock.runFor(64)
  await expect(page.locator('canvas[tabindex="0"]')).toBeFocused()
  const sample = () => page.evaluate(() => window.jumpingMotion.read().recent.at(-1))
  const ballX = () => page.locator('canvas[tabindex="0"]').evaluate(canvas => canvas.floatingBallX)
  await page.keyboard.down('d')
  await page.clock.runFor(32)
  for (let i = 0; i < 80 && (await sample()).x < 600; i++) await page.clock.runFor(16)
  await page.keyboard.up('d')
  const released = await sample()
  expect(released.signals.grounded).toBe(false)
  expect(released.blends.fall).toBe(0)
  expect(released.vx).toBeGreaterThan(300)
  await page.clock.runFor(1000)
  const floating = await sample()
  expect(floating.blends.fall).toBe(1)
  expect(floating.vx).toBeGreaterThan(0)
  expect(floating.vx).toBeLessThan(released.vx / 2)
  expect(floating.y).toBeCloseTo(500, 1)
  expect(await ballX()).toBeGreaterThan(800)
  expect(floating.points[7][1]).toBeGreaterThan(floating.points[0][1])
  await page.screenshot({ path: info.outputPath('prone-zero-g.png') })
  const ballBefore = await ballX()
  await page.clock.runFor(1000)
  expect((await sample()).vx).toBeLessThan(floating.vx * .6)
  expect(await ballX()).toBeGreaterThan(ballBefore + 100)
  await page.keyboard.down('a'); await page.clock.runFor(500)
  expect((await sample()).vx).toBeLessThan(0)
  expect((await sample()).blends.fall).toBe(1)
  expect(errors).toEqual([])
})

test('rolling away a sleeping ball support in 0.1 gravity makes the upper ball fall', async ({ page }, info) => {
  const level = { ...blankTrial(), name: 'Weak gravity stack', spawn: { x: 630, y: 920 },
    props: [{ kind: 'ball', x: 700, y: 920, size: 80 }, { kind: 'ball', x: 700, y: 840, size: 80 }],
    gravityPlates: [{ id: 'weak', x: 0, y: 0, w: 1800, h: 920, gravity: .1, power: 'always' }] }
  const errors = []; page.on('pageerror', error => errors.push(error.message))
  await useLevelFixtures(page, [level])
  await page.addInitScript(() => {
    const proto = CanvasRenderingContext2D.prototype, fill = proto.fillRect, arc = proto.arc
    proto.fillRect = function (...args) {
      if (args[0] === 0 && args[1] === 0 && this.fillStyle === '#f1f1ed') this.canvas.stackBalls = []
      return fill.apply(this, args)
    }
    proto.arc = function (...args) {
      if (this.canvas.stackBalls && this.fillStyle === '#8f9e98' && args[2] === 40) this.canvas.stackBalls.push({ x: args[0], y: args[1] + 40 })
      return arc.apply(this, args)
    }
  })
  await page.clock.install({ time: new Date('2026-01-01T00:00:00Z') })
  await page.goto('/untitled-jumping-game?motionDebug=1')
  await expect(page.getByRole('button', { name: 'Play Weak gravity stack', exact: true })).toBeEnabled()
  await page.clock.pauseAt(new Date('2026-01-01T01:00:00Z'))
  await page.getByRole('button', { name: 'Play Weak gravity stack', exact: true }).click()
  await page.clock.runFor(64)
  await expect(page.locator('canvas[tabindex="0"]')).toBeFocused()
  const balls = () => page.locator('canvas[tabindex="0"]').evaluate(canvas => canvas.stackBalls)
  await page.keyboard.down('a'); await page.clock.runFor(32); await page.keyboard.up('a')
  await page.clock.runFor(3000)
  const settled = await balls()
  expect(settled).toHaveLength(2)
  expect(settled[1].y).toBeCloseTo(840, 0)
  await page.keyboard.down('d'); await page.clock.runFor(2000); await page.keyboard.up('d')
  const released = await balls()
  expect(released[0].x).toBeGreaterThan(settled[0].x + 150)
  expect(released[1].y).toBeGreaterThan(settled[1].y + 20)
  await page.screenshot({ path: info.outputPath('weak-gravity-ball-falling.png') })
  await page.keyboard.down('a'); await page.clock.runFor(1000); await page.keyboard.up('a')
  await page.clock.runFor(2000)
  expect((await balls())[1].y).toBeCloseTo(920, 0)
  await page.screenshot({ path: info.outputPath('weak-gravity-balls-settled.png') })
  expect(errors).toEqual([])
})

for (const gravity of [1, .1]) test(`normal controls push a settled touching ball pair at ${gravity} gravity`, async ({ page }, info) => {
  const name = `Sleeping ball pair ${gravity}`, level = { ...blankTrial(), name, spawn: { x: 630, y: 920 },
    props: [{ kind: 'ball', x: 700, y: 920, size: 80 }, { kind: 'ball', x: 780, y: 920, size: 80 }],
    gravityPlates: [{ id: 'gravity', x: 0, y: 0, w: 1800, h: 920, gravity, power: 'always' }] }
  const errors = []; page.on('pageerror', error => errors.push(error.message))
  await useLevelFixtures(page, [level])
  await page.addInitScript(() => {
    const proto = CanvasRenderingContext2D.prototype, fill = proto.fillRect, arc = proto.arc
    proto.fillRect = function (...args) {
      if (args[0] === 0 && args[1] === 0 && this.fillStyle === '#f1f1ed') this.canvas.pairBalls = []
      return fill.apply(this, args)
    }
    proto.arc = function (...args) {
      if (this.canvas.pairBalls && this.fillStyle === '#8f9e98' && args[2] === 40) this.canvas.pairBalls.push(args[0])
      return arc.apply(this, args)
    }
  })
  await page.clock.install({ time: new Date('2026-01-01T00:00:00Z') })
  await page.goto('/untitled-jumping-game?motionDebug=1')
  await expect(page.getByRole('button', { name: `Play ${name}`, exact: true })).toBeEnabled()
  await page.clock.pauseAt(new Date('2026-01-01T01:00:00Z'))
  await page.getByRole('button', { name: `Play ${name}`, exact: true }).click()
  await page.clock.runFor(64)
  await expect(page.locator('canvas[tabindex="0"]')).toBeFocused()
  const balls = () => page.locator('canvas[tabindex="0"]').evaluate(canvas => canvas.pairBalls)
  await page.keyboard.down('a'); await page.clock.runFor(32); await page.keyboard.up('a')
  await page.clock.runFor(3000)
  const settled = await balls()
  expect(settled).toHaveLength(2)
  await page.keyboard.down('d'); await page.clock.runFor(2600); await page.keyboard.up('d')
  const pushed = await balls()
  expect(pushed[0]).toBeGreaterThan(settled[0] + 150)
  expect(pushed[1]).toBeGreaterThan(settled[1] + 150)
  expect(pushed[1] - pushed[0]).toBeGreaterThanOrEqual(79.9)
  await page.screenshot({ path: info.outputPath('sleeping-pair-pushed.png') })
  expect(errors).toEqual([])
})
