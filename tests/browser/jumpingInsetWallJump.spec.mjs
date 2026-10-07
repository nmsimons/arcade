import { test, expect } from './helpers/test.mjs'
import { useLevelFixtures } from './helpers/jumpingLevels.mjs'
import { readLevelAsset } from '../helpers/jumping-fixtures.mjs'
import { levelProblems } from '../../src/games/jumping/level.ts'

for (const cant of [-15, 0, 15]) for (const side of [-1, 1]) test(`normal keyboard controls wall-jump from the inside of an L (${side}, cant ${cant}°)`, async ({ page }, info) => {
  const level = structuredClone(readLevelAsset('inset-wall-jump.json'))
  if (cant) {
    const lean = Math.tan(Math.abs(cant) * Math.PI / 180) * 680
    const top = 80 + (cant < 0 ? lean : 0), bottom = 80 + (cant > 0 ? lean : 0)
    level.platforms[0].polygon = [[0,0],[top,0],[bottom,680],[400,680],[400,800],[0,800]]
    level.spawn.x = 300 + bottom + 30
  }
  if (side === 1) {
    level.spawn.x = level.width - level.spawn.x
    level.goal = { ...level.goal, x: level.width - level.goal.x, flipX: true }
    level.platforms = level.platforms.map(p => ({ ...p, x: level.width - p.x - p.w,
      polygon: p.polygon.map(([x,y]) => [p.w-x,y]) }))
  }
  expect(levelProblems(level)).toEqual([])
  await useLevelFixtures(page, [level])
  const errors = []; page.on('pageerror', error => errors.push(error.message))
  await page.clock.install({ time: new Date('2026-01-01T00:00:00Z') })
  await page.goto('/untitled-jumping-game?motionDebug=1')
  await expect(page.locator('.jumping-level-card[aria-pressed=true]')).toBeVisible()
  await page.clock.pauseAt(new Date('2026-01-01T01:00:00Z'))
  await page.getByRole('button', { name: `Play ${level.name}`, exact: true }).click()
  const canvas = page.getByRole('img', { name: `${level.name}: reach the exit` })
  await expect(canvas).toBeFocused(); await page.clock.runFor(64)
  const toward = side === -1 ? 'a' : 'd'
  await page.keyboard.down(toward); await page.clock.runFor(100)
  // Meet the overhanging lean during ascent; the opposite lean remains in
  // contact while falling. Release before the fresh wall-jump press in both.
  await page.keyboard.down('Space'); await page.clock.runFor(cant < 0 ? 64 : 400)
  await page.keyboard.up('Space'); await page.clock.runFor(cant < 0 ? 32 : 450)
  if (!cant) await expect(page.locator('.jumping-state')).toHaveText('Bracing')
  const before = await page.evaluate(() => window.jumpingMotion.read().recent.at(-1))
  expect(before.signals.bracing).toBe(true)
  expect(before.signals.grounded).toBe(false)
  await page.screenshot({ path: info.outputPath('inside-L-brace.png') })
  await page.keyboard.down('Space'); await page.clock.runFor(32)
  await page.keyboard.up('Space'); await page.clock.runFor(100)
  const after = await page.evaluate(() => window.jumpingMotion.read().recent.at(-1))
  expect((after.x - before.x) * -side).toBeGreaterThan(25)
  expect(after.y).toBeLessThan(before.y - 40)
  await expect(page.locator('.jumping-state')).toHaveText('Wall jump')
  await page.screenshot({ path: info.outputPath('inside-L-wall-jump.png') })
  await page.keyboard.up(toward)
  expect(errors).toEqual([])
})
