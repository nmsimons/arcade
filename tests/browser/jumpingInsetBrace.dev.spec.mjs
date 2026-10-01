import { test, expect } from './helpers/test.mjs'
import { useLevelFixtures } from './helpers/jumpingLevels.mjs'
import { readLevelAsset } from '../helpers/jumping-fixtures.mjs'
import { levelProblems } from '../../src/games/jumping/level.ts'

for (const side of [1, -1]) test(`ordinary movement braces on an inset wall and rolls its supporting ball (${side})`, async ({ page }, info) => {
  const level = structuredClone(readLevelAsset('inset-wall-brace.json'))
  if (side === -1) {
    level.spawn.x = level.width - level.spawn.x
    level.goal = { x: level.width - level.goal.x, y: level.goal.y, flipX: true }
    level.props[0].x = level.width - level.props[0].x
    level.platforms = level.platforms.map(b => ({ ...b, x: level.width - b.x - b.w,
      polygon: b.polygon?.map(([x, y]) => [b.w - x, y]) }))
    level.mechanisms[0].x = level.width - level.mechanisms[0].x - level.mechanisms[0].w
  }
  expect(levelProblems(level)).toEqual([])
  await useLevelFixtures(page, [level])
  const errors = []; page.on('pageerror', error => errors.push(error.message))
  await page.clock.install({ time: new Date('2026-01-01T00:00:00Z') })
  await page.addInitScript(() => {
    const proto = CanvasRenderingContext2D.prototype, arc = proto.arc
    proto.arc = function (...args) {
      if (this.fillStyle === '#8f9e98' && args[2] === 27) this.canvas.braceBallX = args[0]
      return arc.apply(this, args)
    }
  })
  await page.goto('/untitled-jumping-game?motionDebug=1')
  await expect(page.locator('.jumping-level-card[aria-pressed=true]')).toBeVisible()
  await page.clock.pauseAt(new Date('2026-01-01T01:00:00Z'))
  await page.locator('.jumping-level-card[aria-pressed=true]').click()
  const canvas = page.getByRole('img', { name: 'Inset wall brace: activate the goal' })
  await expect(canvas).toBeFocused(); await page.clock.runFor(64)
  const start = await canvas.evaluate(c => c.braceBallX)
  await page.keyboard.down('Shift')
  await page.keyboard.down(side === 1 ? 'd' : 'a')
  await page.clock.runFor(450)
  await page.screenshot({ path: info.outputPath('inset-wall-brace.png') })
  await page.clock.runFor(1050)
  const { recent } = await page.evaluate(() => window.jumpingMotion.read())
  expect(recent.some(s => s.signals.push === 'terrain:0' && s.signals.support === 'prop:0')).toBe(true)
  expect(((await canvas.evaluate(c => c.braceBallX)) - start) * side).toBeLessThan(-8)
  await page.screenshot({ path: info.outputPath('ball-rolled-away.png') })
  await page.keyboard.up(side === 1 ? 'd' : 'a'); await page.keyboard.up('Shift')
  await page.clock.runFor(100)
  expect((await page.evaluate(() => window.jumpingMotion.read())).recent.at(-1).signals.push).toBeNull()
  expect(errors).toEqual([])
})
