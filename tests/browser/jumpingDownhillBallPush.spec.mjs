import { writeFile } from 'node:fs/promises'
import { test, expect } from './helpers/test.mjs'
import { useLevelFixtures } from './helpers/jumpingLevels.mjs'
import { downhillBallLevel } from '../helpers/jumpingDownhillBallScenarios.mjs'
import { TUNING } from '../../src/games/jumping/model.ts'

for (const direction of [-1, 1]) for (const mode of ['run', 'walk', 'crouch', 'gentle walk']) {
  test(`a downhill ball releases its working hands during ${mode}, direction ${direction}`, async ({ page }, info) => {
    const level = downhillBallLevel(100, direction, mode === 'gentle walk' ? .1 : .3)
    await useLevelFixtures(page, [level])
    const errors = []; page.on('pageerror', error => errors.push(error.message))
    await page.setViewportSize({ width: 852, height: 393 })
    await page.clock.install({ time: new Date('2026-10-09T12:00:00Z') })
    // Observe the ball's real drawn coordinates, without exposing/mutating Run.
    await page.addInitScript(() => {
      const arc = CanvasRenderingContext2D.prototype.arc
      CanvasRenderingContext2D.prototype.arc = function (...args) {
        if (this.fillStyle === '#8f9e98' && args[2] === 50) this.canvas.downhillBallX = args[0]
        return arc.apply(this, args)
      }
    })
    await page.goto('/untitled-jumping-game/levels/built-in/00-fixture.json?motionDebug=1')
    const canvas = page.getByRole('img', { name: `${level.name}: reach the exit`, exact: true })
    await expect(canvas).toBeFocused()
    await page.clock.pauseAt(new Date('2026-10-09T13:00:00Z')); await page.clock.runFor(64)
    if (mode.includes('walk')) await page.keyboard.down('Shift')
    if (mode === 'crouch') await page.keyboard.down('s')
    const key = direction > 0 ? 'd' : 'a'
    await page.keyboard.down(key)
    const samples = new Map()
    for (let phase = 0; phase < 20; phase++) {
      await page.clock.runFor(192)
      for (const sample of await page.evaluate(() => window.jumpingMotion.read().recent)) samples.set(sample.time, sample)
      if ([1, 4, 10, 19].includes(phase)) await page.screenshot({ path: info.outputPath(`release-${phase}.png`) })
    }
    await page.keyboard.up(key); await page.keyboard.up('Shift'); await page.keyboard.up('s')
    await page.clock.runFor(600)
    const ordered = [...samples.values()].sort((a, b) => a.time - b.time)
    const moving = ordered.filter(sample => sample.input.move * direction > 0)
    const limit = mode === 'run' ? TUNING.runSpeed : TUNING.walkSpeed
    expect(Math.max(...moving.map(sample => sample.vx * direction))).toBeLessThanOrEqual(limit + .01)
    const pushing = moving.map(sample => !!sample.signals.push)
    const starts = pushing.filter((value, index) => value && (!index || !pushing[index - 1])).length
    expect(starts).toBeLessThanOrEqual(1)
    expect(moving.slice(-60).every(sample => !sample.signals.push && sample.blends.push === 0)).toBe(true)
    const final = await page.evaluate(() => window.jumpingMotion.read().recent.at(-1))
    expect(final.vx).toBeCloseTo(0, 2)
    expect(final.signals.push).toBeNull()
    const ballX = await canvas.evaluate(element => element.downhillBallX)
    expect((ballX - final.x) * direction - 50).toBeGreaterThan(60)
    await page.screenshot({ path: info.outputPath('rest-after-ball-escapes.png') })
    expect(errors).toEqual([])
    await writeFile(info.outputPath('ball-release-motion.json'), JSON.stringify({ mode, direction, starts, ballX, final, samples: ordered }, null, 2))
  })
}
