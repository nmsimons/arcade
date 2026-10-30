import { test, expect } from './helpers/test.mjs'
import { readFileSync } from 'node:fs'
import { finishJumpingEntrance, useLevelFixtures } from './helpers/jumpingLevels.mjs'
import { advanceJumpingSimulation } from './helpers/simulation.mjs'
import { goalDoor } from '../../src/games/jumping/goal.ts'

const { level } = JSON.parse(readFileSync(new URL('../fixtures/jumping-lockout2-crouch.json', import.meta.url), 'utf8'))
test('keyboard-only Lock Out II fires low from the pump plate and returns to the exit', async ({ page }, info) => {
  test.setTimeout(240000)
  await page.setViewportSize({ width: 1440, height: 960 })
  const errors = []; page.on('pageerror', error => errors.push(error.message))
  await useLevelFixtures(page, [level])
  // Software renderers can draw only a few frames per second. A paused clock
  // keeps gameplay time, input timing and polling independent of that speed.
  await page.clock.install({ time: new Date('2026-01-01T00:00:00Z') })
  await page.goto('/lab?motionDebug=1')
  const play = page.getByRole('button', { name: 'Play Lock Out II', exact: true })
  await expect(play).toBeEnabled(); await page.clock.pauseAt(new Date('2026-01-01T01:00:00Z'))
  await play.click(); await finishJumpingEntrance(page)
  const motion = () => page.evaluate(() => window.jumpingMotion.read().recent.at(-1))
  // Advance gameplay until the predicate holds, within a gameplay-time budget.
  async function until(predicate, seconds = 15) {
    const start = (await motion()).time
    for (let p = await motion(); !predicate(p); p = await motion()) {
      expect(p.time - start, `condition not met within ${seconds}s of gameplay: ${JSON.stringify({ x: p.x, y: p.y, signals: p.signals })}`).toBeLessThan(seconds)
      await advanceJumpingSimulation(page, 48)
    }
  }
  // Pump filling, shot duration and cooldowns use gameplay time.
  const waitForGameplay = milliseconds => advanceJumpingSimulation(page, milliseconds)
  async function tap(key, duration = 100) {
    await page.keyboard.down(key); await waitForGameplay(duration); await page.keyboard.up(key)
  }
  await page.keyboard.down('Shift'); await page.keyboard.down('ArrowRight'); await until(p => p.x >= 205)
  await page.keyboard.up('ArrowRight'); await page.keyboard.up('Shift')
  await tap('e')
  await page.keyboard.down('ArrowRight'); await until(p => p.x >= 1660)
  await page.keyboard.up('ArrowRight')
  await until(p => p.signals.grounded && Math.abs(p.y - 220) < 1)
  // Turn at crouch speed and observe the facing change rather than timing a
  // running tap, which could walk off the pump.
  await page.keyboard.down('ArrowDown'); await page.keyboard.down('ArrowLeft')
  await until(p => p.signals.facing === -1); await page.keyboard.up('ArrowLeft')
  await waitForGameplay(4500)
  const before = await motion()
  expect(before.x).toBeGreaterThan(1630)
  expect(before.signals.facing).toBe(-1)
  await waitForGameplay(500)
  for (let shot = 0; shot < 3; shot++) { await tap('f', 160); await waitForGameplay(650) }
  const crouched = await motion()
  expect(crouched.signals.grounded).toBe(true)
  expect(crouched.x).toBeCloseTo(before.x)
  const elbow = crouched.points[5], wrist = crouched.points[6]
  expect(Math.abs(wrist[1] - elbow[1])).toBeLessThan(4)
  expect(wrist[0]).toBeGreaterThan(elbow[0])
  await page.locator('.jumping-game > canvas').screenshot({ path: info.outputPath('crouched-plate-shot.png') })
  await page.keyboard.up('ArrowDown'); await page.keyboard.down('ArrowLeft')
  const door = goalDoor(level.goal), center = door.x + door.w / 2
  await until(p => p.x <= center + 150)
  await page.keyboard.down('Shift'); await until(p => p.x <= center + 10)
  await page.keyboard.up('ArrowLeft'); await page.keyboard.up('Shift')
  // Stay in the opening while the delivered float finishes settling.
  const complete = page.getByRole('dialog', { name: 'Level complete', exact: true })
  for (let frame = 0; frame < 20 / .048 && !await complete.isVisible(); frame++) await advanceJumpingSimulation(page, 48)
  await expect(complete).toBeVisible()
  expect(errors).toEqual([])
})
