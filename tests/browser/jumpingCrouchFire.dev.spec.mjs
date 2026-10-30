import { test, expect } from './helpers/test.mjs'
import { readFileSync } from 'node:fs'
import { useLevelFixtures } from './helpers/jumpingLevels.mjs'
import { goalDoor } from '../../src/games/jumping/goal.ts'

const { level } = JSON.parse(readFileSync(new URL('../fixtures/jumping-lockout2-crouch.json', import.meta.url), 'utf8'))
test('keyboard-only Lock Out II fires low from the pump plate and returns to the exit', async ({ page }, info) => {
  test.setTimeout(120000)
  await page.setViewportSize({ width: 1440, height: 960 })
  const errors = []; page.on('pageerror', error => errors.push(error.message))
  await useLevelFixtures(page, [level])
  await page.goto('/lab?motionDebug=1')
  await page.getByRole('button', { name: 'Play Lock Out II', exact: true }).click()
  await expect(page.locator('.jumping-game > canvas')).toBeFocused({ timeout: 30000 })
  await expect(page.locator('.jumping-state')).not.toHaveText('Entering the level', { timeout: 30000 })
  const motion = () => page.evaluate(() => window.jumpingMotion.read().recent.at(-1))
  const until = predicate => expect.poll(async () => predicate(await motion()), { timeout: 15000, intervals: [25] }).toBe(true)
  async function tap(key, duration = 100) {
    await page.keyboard.down(key); await page.waitForTimeout(duration); await page.keyboard.up(key)
  }
  await page.keyboard.down('Shift'); await page.keyboard.down('ArrowRight'); await until(p => p.x >= 205)
  await page.keyboard.up('ArrowRight'); await page.keyboard.up('Shift')
  await tap('e')
  await page.keyboard.down('ArrowRight'); await until(p => p.x >= 1660)
  await page.keyboard.up('ArrowRight')
  await until(p => p.signals.grounded && Math.abs(p.y - 220) < 1)
  await tap('ArrowLeft', 60); await page.waitForTimeout(4500)
  const before = await motion()
  expect(before.x).toBeGreaterThan(1630)
  expect(before.signals.facing).toBe(-1)
  await page.keyboard.down('ArrowDown'); await page.waitForTimeout(500)
  for (let shot = 0; shot < 3; shot++) { await tap('f', 160); await page.waitForTimeout(650) }
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
  await expect(page.getByRole('dialog', { name: 'Level complete', exact: true })).toBeVisible({ timeout: 20000 })
  expect(errors).toEqual([])
})
