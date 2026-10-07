import { test, expect } from './helpers/test.mjs'
import { useLevelFixtures } from './helpers/jumpingLevels.mjs'
import { blankTrial } from '../../src/games/jumping/level.ts'

for (const night of [false, true]) test(`subtle foot jets follow normal jump, steering and braking controls in ${night ? 'darkness' : 'daylight'}`, async ({ page }, info) => {
  test.setTimeout(60000)
  const level = { ...blankTrial(), name: 'Booster check', width: 3000, height: 1200, floor: 1000,
    spawn: { x: 600, y: 1000 }, goal: { x: 2800, y: 1000 } }
  if (night) { level.version = 2; level.lighting = { nightMode: true, ambient: 0, lights: [] } }
  await useLevelFixtures(page, [level])
  await page.addInitScript(() => {
    window.boosterFills = []
    const fill = CanvasRenderingContext2D.prototype.fill
    CanvasRenderingContext2D.prototype.fill = function (...args) {
      if (['#c58b68', '#ecd4ad'].includes(this.fillStyle)) {
        const t = this.getTransform()
        window.boosterFills.push({ x: t.e, y: t.f, dx: t.a, dy: t.b, alpha: this.globalAlpha })
        if (window.boosterFills.length > 500) window.boosterFills.shift()
      }
      return fill.apply(this, args)
    }
  })
  await page.clock.install({ time: new Date('2026-01-01T00:00:00Z') })
  await page.goto('/untitled-jumping-game?motionDebug=1')
  await page.getByRole('button', { name: 'Play Booster check', exact: true }).waitFor()
  await page.clock.pauseAt(new Date('2026-01-01T01:00:00Z'))
  await page.getByRole('button', { name: 'Play Booster check', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.locator('canvas')).toBeFocused()
  await page.clock.runFor(64)
  expect(await page.evaluate(() => window.boosterFills)).toEqual([])
  await page.keyboard.down('ArrowRight'); await page.keyboard.down('Space')
  await page.clock.runFor(96)
  const lift = await page.evaluate(() => window.boosterFills.slice(-4))
  expect(lift.length).toBe(4)
  expect(lift.every(jet => jet.dx < 0 && jet.dy > 0 && jet.alpha <= .6)).toBe(true)
  await page.screenshot({ path: info.outputPath('held-jump.png') })
  await page.keyboard.up('Space'); await page.clock.runFor(96)
  const steering = await page.evaluate(() => window.boosterFills.slice(-4))
  expect(steering.every(jet => jet.dx < 0 && Math.abs(jet.dy) < .001)).toBe(true)
  await page.screenshot({ path: info.outputPath('air-steering.png') })
  await page.keyboard.up('ArrowRight'); await page.clock.runFor(64)
  const braking = await page.evaluate(() => window.boosterFills.slice(-4))
  expect(braking.every(jet => jet.dx > 0 && Math.abs(jet.dy) < .001)).toBe(true)
  await page.screenshot({ path: info.outputPath('air-braking.png') })
  await page.clock.runFor(900)
  expect(await page.evaluate(() => window.jumpingMotion.read().recent.at(-1).signals.grounded)).toBe(true)
  await page.evaluate(() => { window.boosterFills = [] })
  await page.clock.runFor(64)
  expect(await page.evaluate(() => window.boosterFills)).toEqual([])
})

test('the booster hiss is quiet, has no tone, reuses its voice and fades to silence', async ({ page }) => {
  await page.goto('/untitled-jumping-game')
  const result = await page.evaluate(async () => {
    const { JumpingSound } = await import('/src/games/jumping/sound.ts')
    const rate = 24000, ctx = new OfflineAudioContext(2, rate, rate), sound = new JumpingSound(ctx)
    let sources = 0
    const create = ctx.createBufferSource.bind(ctx)
    ctx.createBufferSource = () => { sources++; return create() }
    const loop = { id: 'player:booster', kind: 'booster', volume: 1, pan: 0, pace: 1, size: 0 }
    const stages = [[.1, () => sound.update({ loops: [loop], cues: [] })],
      [.25, () => sound.update({ loops: [{ ...loop, volume: .5 }], cues: [] })],
      [.4, () => sound.update({ loops: [], cues: [] })],
      [.6, () => sound.update({ loops: [loop], cues: [] })], [.8, () => sound.silence()]]
      .map(([time, action]) => ({ ready: ctx.suspend(time), action }))
    const rendering = ctx.startRendering()
    for (const stage of stages) { await stage.ready; stage.action(); await ctx.resume() }
    const data = (await rendering).getChannelData(0)
    const rms = (start, end) => {
      const samples = data.slice(start * rate, end * rate)
      return Math.sqrt(samples.reduce((sum, value) => sum + value * value, 0) / samples.length)
    }
    const result = { full: rms(.18, .24), half: rms(.34, .39), stopped: rms(.5, .59),
      resumed: rms(.7, .79), paused: rms(.9, 1), sources,
      peak: data.reduce((max, value) => Math.max(max, Math.abs(value)), 0) }
    sound.dispose(); return result
  })
  expect(result.full).toBeGreaterThan(.0001)
  expect(result.full).toBeLessThan(.006)
  expect(result.half).toBeLessThan(result.full * .8)
  expect(result.peak).toBeLessThan(.02)
  expect(result.resumed).toBeGreaterThan(.0001)
  expect(result.stopped).toBe(0); expect(result.paused).toBe(0)
  expect(result.sources).toBe(1)
})
