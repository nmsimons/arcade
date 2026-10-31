import { test, expect } from './helpers/test.mjs'
import { readFileSync } from 'node:fs'
import { finishJumpingEntrance, useLevelFixtures } from './helpers/jumpingLevels.mjs'
import { advanceJumpingSimulation, withoutIntermediateFrames } from './helpers/simulation.mjs'

const { level } = JSON.parse(readFileSync(new URL('../fixtures/jumping-lockout2-runs.json', import.meta.url), 'utf8'))

for (const viewport of [{ width: 1440, height: 960 }, { width: 390, height: 844 }]) test(`Lock Out II: keyboard fill, delivery, drain and exit at ${viewport.width}px`, async ({ page }, info) => {
  test.setTimeout(240000)
  await page.setViewportSize(viewport)
  const errors = []; page.on('pageerror', error => errors.push(error.message))
  await useLevelFixtures(page, [level])
  // Software renderers can draw only a few frames per second. A paused clock
  // keeps gameplay time, input timing and polling independent of that speed.
  await page.clock.install({ time: new Date('2026-01-01T00:00:00Z') })
  await page.goto('/lab?motionDebug=1&renderControl=1')
  const play = page.getByRole('button', { name: 'Play Lock Out II', exact: true })
  await expect(play).toBeEnabled(); await page.clock.pauseAt(new Date('2026-01-01T01:00:00Z'))
  await play.click(); await finishJumpingEntrance(page)
  const canvas = page.locator('.jumping-game > canvas')
  const motion = () => page.evaluate(() => window.jumpingMotion.read().recent.at(-1))
  // Advance gameplay until the predicate holds, within a gameplay-time budget.
  const until = (predicate, seconds = 15) => withoutIntermediateFrames(page, async () => {
    const start = (await motion()).time
    for (let p = await motion(); !predicate(p); p = await motion()) {
      expect(p.time - start, `condition not met within ${seconds}s of gameplay: ${JSON.stringify({ x: p.x, y: p.y, signals: p.signals })}`).toBeLessThan(seconds)
      await advanceJumpingSimulation(page, 48)
    }
  })
  const key = async (code, ms) => { await page.keyboard.down(code); await advanceJumpingSimulation(page, ms); await page.keyboard.up(code) }
  await canvas.screenshot({ path: info.outputPath('lockout2-dry-overview.png') })
  // Walk into pickup range so the player stops beside the sleeve.
  await page.keyboard.down('Shift'); await page.keyboard.down('ArrowRight'); await until(p => p.x >= 205)
  await page.keyboard.up('ArrowRight'); await page.keyboard.up('Shift')
  await key('e', 80)
  await page.keyboard.down('ArrowRight'); await until(p => p.x >= 1680); await page.keyboard.up('ArrowRight')
  await advanceJumpingSimulation(page, 2200)
  await page.keyboard.down('ArrowLeft'); await until(p => p.x <= 1220); await page.keyboard.up('ArrowLeft')
  await advanceJumpingSimulation(page, 900)
  const stance = await motion()
  expect(stance.signals.grounded).toBe(true)
  expect(stance.y).toBeCloseTo(260)
  await canvas.screenshot({ path: info.outputPath('lockout2-full-reservoir.png') })
  await key('f', 160); await advanceJumpingSimulation(page, 1450)
  // Jump before moving beneath the overhang.
  await page.keyboard.down('Space'); await page.keyboard.down('ArrowRight')
  await until(p => p.signals.mode === 'hang' || p.signals.grounded && p.y <= 125)
  await page.keyboard.up('ArrowRight')
  await page.keyboard.up('Space')
  await page.keyboard.down('Shift'); await page.keyboard.down('ArrowUp'); await page.keyboard.down('ArrowRight')
  await until(p => p.x >= 1340 && p.y <= 125)
  await page.keyboard.up('ArrowRight'); await page.keyboard.up('ArrowUp'); await page.keyboard.up('Shift')
  await until(p => p.signals.grounded && Math.abs(p.y - 125) < 1)
  await advanceJumpingSimulation(page, 2400)
  await canvas.screenshot({ path: info.outputPath('lockout2-drained-receiver.png') })
  const complete = page.getByRole('dialog', { name: 'Level complete', exact: true })
  await page.keyboard.down('ArrowRight')
  // The result dialog follows the goal light by 1.5 seconds of gameplay.
  for (let frame = 0; frame < 15 / .048 && !await complete.isVisible(); frame++) await advanceJumpingSimulation(page, 48)
  await expect(complete).toBeVisible()
  await page.keyboard.up('ArrowRight')
  await page.screenshot({ path: info.outputPath('lockout2-complete.png') })
  expect(errors).toEqual([])
})
