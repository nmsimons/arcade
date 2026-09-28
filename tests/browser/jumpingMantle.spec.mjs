import { test, expect } from './helpers/test.mjs'
import { useLevelFixtures } from './helpers/jumpingLevels.mjs'
import { blankTrial, levelProblems } from '../../src/games/jumping/level.ts'

for (const gap of [24, 18]) test(`a pull-up beside a box uses available space (${gap}-unit gap)`, async ({ page }, info) => {
  const level = { ...blankTrial(), name: 'Resisted pull-up', width: 1200, height: 600, floor: 420,
    spawn: { x: 586, y: 420 }, goal: { x: 300, y: 420 },
    platforms: [{ x: 600, y: 300, w: 400, h: 40 }], props: [{ kind: 'box', x: 600 + gap + 40, y: 300, size: 80 }] }
  expect(levelProblems(level)).toEqual([])
  await useLevelFixtures(page, [level])
  const errors = []; page.on('pageerror', error => errors.push(error.message))
  await page.clock.install({ time: new Date('2026-01-01T00:00:00Z') })
  await page.addInitScript(() => {
    const proto = CanvasRenderingContext2D.prototype, rect = proto.fillRect, ellipse = proto.ellipse
    proto.fillRect = function (...args) {
      if (args[0] === 0 && args[1] === 0 && this.fillStyle === '#f1f1ed') this.canvas.climbCamera = this.getTransform().inverse()
      return rect.apply(this, args)
    }
    proto.ellipse = function (...args) {
      if (args[2] === 6.2 && args[3] === 6.2 && this.canvas.climbCamera) {
        const transform = this.canvas.climbCamera.multiply(this.getTransform())
        const head = transform.transformPoint(new DOMPoint(args[0], args[1]))
        const sample = { time: performance.now(), x: head.x, y: head.y, rootX: transform.e, rootY: transform.f }
        this.canvas.climbFrames ??= []
        this.canvas.climbFrames.push(sample)
      }
      return ellipse.apply(this, args)
    }
  })
  await page.goto('/untitled-jumping-game')
  await expect(page.locator('.jumping-level-card[aria-pressed=true]')).toBeVisible()
  await page.clock.pauseAt(new Date('2026-01-01T01:00:00Z'))
  await page.locator('.jumping-level-card[aria-pressed=true]').click()
  const canvas = page.getByRole('img', { name: 'Resisted pull-up: activate the goal' })
  await expect(canvas).toBeFocused(); await page.clock.runFor(64)
  await page.keyboard.down('Space'); await page.clock.runFor(100); await page.keyboard.up('Space')
  await page.keyboard.down('d'); await page.clock.runFor(650); await page.keyboard.up('d')
  await expect(page.locator('.jumping-state')).toHaveText('Hanging')
  await canvas.evaluate(c => { c.climbFrames = [] })
  await page.keyboard.down('w'); await page.clock.runFor(gap === 24 ? 1000 : 2000); await page.keyboard.up('w')
  await expect(page.locator('.jumping-state')).toHaveText('Ready')
  const frames = await canvas.evaluate(c => c.climbFrames)
  const landed = frames.findIndex(f => Math.abs(f.rootY - 300) < .001)
  expect(landed).toBeGreaterThan(0)
  expect(frames[landed].time - frames[0].time).toBeLessThan(gap === 24 ? 900 : 2000)
  expect(frames[landed].rootX).toBeCloseTo(gap === 24 ? 612 : 608, 4)
  // A compact climb retains normal timing. The tighter case must still push
  // before changing route, with continuous head motion throughout.
  let frozen = 0, longestFreeze = 0
  for (let i = 1; i < landed; i++) {
    const before = frames[i - 1], after = frames[i]
    expect(Math.hypot(after.x - before.x, after.y - before.y)).toBeLessThan(6)
    frozen = Math.hypot(after.x - before.x, after.y - before.y) < 1e-5 ? frozen + 1 : 0
    longestFreeze = Math.max(longestFreeze, frozen)
  }
  expect(longestFreeze).toBeLessThan(3)
  await page.screenshot({ path: info.outputPath('compact-pull-up.png') })
  await page.keyboard.down('d'); await page.clock.runFor(800); await page.keyboard.up('d')
  const pushed = await canvas.evaluate(c => c.climbFrames.at(-1))
  expect(pushed.rootX - frames[landed].rootX).toBeGreaterThan(15)
  expect(pushed.rootY).toBeCloseTo(300, 4)
  await page.screenshot({ path: info.outputPath('standing-push.png') })
  expect(errors).toEqual([])
})

for (const start of ['below', 'narrow landing']) test(`a pinned ball allows pulling up and lowering from ${start}`, async ({ page }, info) => {
  const level = { ...blankTrial(), name: 'Narrow ledge', width: 1000, height: 420, floor: 420,
    spawn: start === 'below' ? { x: 586, y: 420 } : { x: 608, y: 300 }, goal: { x: 150, y: 420 },
    platforms: [{ x: 600, y: 300, w: 160, h: 40 }, { x: 720, y: 220, w: 40, h: 80 }],
    props: [{ kind: 'ball', x: start === 'below' ? 610 : 670, y: 300, size: 100 }] }
  expect(levelProblems(level)).toEqual([])
  await useLevelFixtures(page, [level])
  const errors = []; page.on('pageerror', error => errors.push(error.message))
  await page.clock.install({ time: new Date('2026-01-01T00:00:00Z') })
  await page.addInitScript(() => {
    const proto = CanvasRenderingContext2D.prototype, rect = proto.fillRect, ellipse = proto.ellipse
    proto.fillRect = function (...args) {
      if (args[0] === 0 && args[1] === 0 && this.fillStyle === '#f1f1ed') this.canvas.ledgeCamera = this.getTransform().inverse()
      return rect.apply(this, args)
    }
    proto.ellipse = function (...args) {
      if (args[2] === 6.2 && args[3] === 6.2 && this.canvas.ledgeCamera) {
        const transform = this.canvas.ledgeCamera.multiply(this.getTransform())
        this.canvas.ledgePlayer = { x: transform.e, y: transform.f }
      }
      return ellipse.apply(this, args)
    }
  })
  await page.goto('/untitled-jumping-game')
  await expect(page.locator('.jumping-level-card[aria-pressed=true]')).toBeVisible()
  await page.clock.pauseAt(new Date('2026-01-01T01:00:00Z'))
  await page.locator('.jumping-level-card[aria-pressed=true]').click()
  const canvas = page.getByRole('img', { name: 'Narrow ledge: activate the goal' })
  await expect(canvas).toBeFocused(); await page.clock.runFor(64)
  if (start === 'below') {
    await page.keyboard.down('Space'); await page.clock.runFor(100); await page.keyboard.up('Space')
    await page.keyboard.down('d'); await page.clock.runFor(650); await page.keyboard.up('d')
  } else {
    await page.keyboard.down('s'); await page.clock.runFor(1500); await page.keyboard.up('s')
  }
  await expect(page.locator('.jumping-state')).toHaveText('Hanging')
  for (let cycle = 0; cycle < 2; cycle++) {
    await page.keyboard.down('w'); await page.clock.runFor(cycle ? 2200 : 6000); await page.keyboard.up('w')
    await expect(page.locator('.jumping-state')).toHaveText('Ready')
    const standing = await canvas.evaluate(c => c.ledgePlayer)
    expect(standing.x).toBeGreaterThanOrEqual(608 - .001); expect(standing.x).toBeLessThan(612)
    expect(standing.y).toBeCloseTo(300, 5)
    if (!cycle) await page.screenshot({ path: info.outputPath('standing-in-narrow-space.png') })
    await page.keyboard.down('s'); await page.clock.runFor(1500); await page.keyboard.up('s')
    await expect(page.locator('.jumping-state')).toHaveText('Hanging')
    const hanging = await canvas.evaluate(c => c.ledgePlayer)
    expect(hanging.x).toBeCloseTo(586, 5); expect(hanging.y).toBeCloseTo(374, 5)
  }
  expect(errors).toEqual([])
})
