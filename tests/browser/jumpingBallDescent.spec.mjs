import { test, expect } from './helpers/test.mjs'
import { useLevelFixtures } from './helpers/jumpingLevels.mjs'
import { blankTrial, levelProblems } from '../../src/games/jumping/level.ts'

for (const walking of [false, true]) test(`walking off a ledge beside a ball keeps brief slide contacts visually continuous${walking ? ' at walking speed' : ''}`, async ({ page }, info) => {
  const level = { ...blankTrial(), name: 'Ball descent', width: 1000, height: 620, floor: 620,
    spawn: { x: 740, y: 420 }, goal: { x: 150, y: 620 },
    platforms: [{ x: 600, y: 420, w: 160, h: 120, polygon: [[0,80],[120,80],[120,0],[160,0],[160,120],[0,120]] }],
    props: [{ kind: 'ball', x: 666, y: 500, size: 100 }] }
  expect(levelProblems(level)).toEqual([])
  await useLevelFixtures(page, [level])
  const errors = []; page.on('pageerror', error => errors.push(error.message))
  await page.clock.install({ time: new Date('2026-01-01T00:00:00Z') })
  await page.addInitScript(() => {
    const proto = CanvasRenderingContext2D.prototype, arc = proto.arc
    proto.arc = function (...args) {
      if (this.fillStyle === '#8f9e98' && args[2] === 50) this.canvas.descentBallX = args[0]
      return arc.apply(this, args)
    }
  })
  await page.goto('/untitled-jumping-game?motionDebug=1')
  await expect(page.locator('.jumping-level-card[aria-pressed=true]')).toBeVisible()
  await page.clock.pauseAt(new Date('2026-01-01T01:00:00Z'))
  await page.locator('.jumping-level-card[aria-pressed=true]').click()
  const canvas = page.getByRole('img', { name: 'Ball descent: activate the goal' })
  await expect(canvas).toBeFocused(); await page.clock.runFor(64)
  if (walking) await page.keyboard.down('Shift')
  await page.keyboard.down('a'); await page.clock.runFor(walking ? 850 : 350)
  await page.screenshot({ path: info.outputPath('descending-beside-ball.png') })
  if (walking) await page.clock.runFor(150)
  await page.keyboard.up('a'); await page.keyboard.up('Shift'); await page.clock.runFor(600)
  const { recent } = await page.evaluate(() => window.jumpingMotion.read())
  let transitions = 0
  for (let i = 1; i < recent.length; i++) {
    const before = recent[i - 1], after = recent[i]
    if (before.signals.mode !== 'free' || after.signals.mode !== 'free' || before.signals.grounded || after.signals.grounded
      || before.signals.facing !== after.signals.facing || before.signals.sliding === after.signals.sliding) continue
    transitions++
    for (let j = 0; j < after.points.length; j++) expect(Math.hypot(...after.points[j].map((v, axis) => v - before.points[j][axis]))).toBeLessThan(4)
  }
  expect(transitions).toBeGreaterThanOrEqual(2)
  expect(recent.at(-1).y).toBeCloseTo(500, 2)
  expect(recent.at(-1).signals.grounded).toBe(true)
  expect(await canvas.evaluate(c => c.descentBallX)).toBeLessThan(646)
  await page.screenshot({ path: info.outputPath('landed-after-ball-yields.png') })
  expect(errors).toEqual([])
})
