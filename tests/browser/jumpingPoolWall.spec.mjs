import { readFileSync } from 'node:fs'
import { test, expect } from './helpers/test.mjs'
import { useLevelFixtures } from './helpers/jumpingLevels.mjs'

const pool = JSON.parse(readFileSync(new URL('../fixtures/jumping/single-block-pool.json', import.meta.url), 'utf8'))
test.setTimeout(90000)

for (const side of [-1, 1]) test(`normal swimming stays stable against the ${side > 0 ? 'right' : 'left'} inner wall of a single terrain block`, async ({ page }, info) => {
  const level = { ...pool, spawn: { x: side > 0 ? 115 : 1685, y: 290 }, goal: { ...pool.goal, id: 'closed', power: 'switched' } }
  const toward = side > 0 ? 'd' : 'a', away = side > 0 ? 'a' : 'd', errors = []
  page.on('pageerror', error => errors.push(String(error)))
  await useLevelFixtures(page, [level])
  await page.clock.install({ time: new Date('2026-01-01T00:00:00Z') })
  await page.goto('/untitled-jumping-game?motionDebug=1')
  await expect(page.locator('.jumping-level-card[aria-pressed=true]')).toBeVisible()
  await page.clock.pauseAt(new Date('2026-01-01T01:00:00Z'))
  await page.locator('.jumping-level-card[aria-pressed=true]').click()
  await expect(page.locator('canvas')).toBeFocused()
  const player = () => page.evaluate(() => window.jumpingMotion.read().recent.at(-1))
  async function hold(keys, ms) {
    for (const key of keys) await page.keyboard.down(key)
    await page.clock.runFor(ms)
    for (const key of keys) await page.keyboard.up(key)
  }
  await hold([toward], 3000)
  await hold(['ArrowDown'], 2000); await hold([], 1000)
  const submerged = await player()
  expect(submerged.waterCenter).toBeGreaterThan(490)
  await hold([toward], 9000)
  const blocked = await player(), wallX = side > 0 ? 1475 : 570
  // Submerged contacts follow the visible swimming head and torso. The foot
  // root no longer has the standing body's fixed 12-unit wall offset.
  const headGap = (wallX - blocked.x - blocked.points[2][0] * blocked.signals.facing) * side
  expect(headGap).toBeGreaterThanOrEqual(6.15)
  expect(headGap).toBeLessThan(7.25)
  expect(Math.abs(blocked.vx)).toBeLessThan(.01)
  expect(Math.abs(blocked.waterCenter - submerged.waterCenter)).toBeLessThan(2)
  await hold([toward], 2000)
  const steady = await player()
  expect(Math.abs(steady.waterCenter - blocked.waterCenter)).toBeLessThan(.01)
  expect(Math.abs(steady.vy)).toBeLessThan(.01)
  expect(steady.blends.fall).toBe(1)
  for (const [i, point] of steady.points.entries()) {
    // Quiet hands and ankles may scull; the torso must not gather and extend.
    expect(Math.hypot(point[0] - blocked.points[i][0], point[1] - blocked.points[i][1])).toBeLessThan(i < 3 ? .01 : 3)
  }
  await page.screenshot({ path: info.outputPath('pool-wall-blocked.png') })
  await hold([], 2000)
  const floating = await player()
  expect(floating.blends.fall).toBe(0)
  expect(floating.points[2][1]).toBeLessThan(floating.points[0][1] - 20)
  expect(Math.abs(floating.waterCenter - blocked.waterCenter)).toBeLessThan(.01)
  await page.screenshot({ path: info.outputPath('pool-wall-upright.png') })
  await hold([away], 1000)
  const separated = await player()
  expect((separated.x - steady.x) * -side).toBeGreaterThan(60)
  await hold(['ArrowUp'], 4000)
  await hold([toward, 'ArrowUp'], 4000)
  const bank = await player()
  expect(bank.y).toBeLessThanOrEqual(290.1)
  expect((bank.x - wallX) * side).toBeGreaterThan(12)
  await page.screenshot({ path: info.outputPath('pool-bank-recovered.png') })
  await info.attach('single-block-wall-route', { body: JSON.stringify({ submerged, blocked, steady, floating, separated, bank }, null, 2), contentType: 'application/json' })
  expect(errors).toEqual([])
})
