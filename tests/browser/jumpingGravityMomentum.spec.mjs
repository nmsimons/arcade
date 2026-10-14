import { test, expect } from './helpers/test.mjs'
import { finishJumpingEntrance, useLevelFixtures } from './helpers/jumpingLevels.mjs'
import { blankTrial } from '../../src/games/jumping/level.ts'

test('a button-powered dry lift launches the player beyond its field in a room with water', async ({ page }, info) => {
  const level = { ...blankTrial(), name: 'Gravity launch', height: 2000, floor: 2000,
    entrance: { x: 360, y: 2000 }, goal: { x: 1650, y: 2000 },
    props: [{ kind: 'box', x: 650, y: 2000, size: 80 }, { kind: 'ball', x: 850, y: 2000, size: 80 }],
    gravityPlates: [{ id: 'lift', x: 400, y: 1600, w: 600, h: 400, gravity: -1 },
      { id: 'pool', x: 100, y: 1400, w: 200, h: 600, gravity: -1, effect: 'water' }],
    triggers: [{ x: 420, y: 2000, w: 120, targets: ['lift'], mode: 'touch', behavior: 'toggle' }] }
  const errors = []; page.on('pageerror', error => errors.push(error.message))
  await useLevelFixtures(page, [level])
  await page.clock.install({ time: new Date('2026-01-01T00:00:00Z') })
  await page.goto('/lab?motionDebug=1')
  const play = page.getByRole('button', { name: 'Play Gravity launch', exact: true })
  await expect(play).toBeEnabled()
  await page.clock.pauseAt(new Date('2026-01-01T01:00:00Z'))
  await play.click(); await finishJumpingEntrance(page); await page.clock.runFor(64)
  const sample = () => page.evaluate(() => window.jumpingMotion.read().recent.at(-1))
  await page.keyboard.down('Shift'); await page.keyboard.down('d')
  let onPlate
  for (let frame = 0; frame < 100; frame++) {
    await page.clock.runFor(16); onPlate = await sample()
    if (onPlate.x >= 460) break
  }
  expect(onPlate.x).toBeGreaterThanOrEqual(460)
  await page.keyboard.up('d'); await page.keyboard.up('Shift')
  let exit
  for (let frame = 0; frame < 200; frame++) {
    await page.clock.runFor(16); exit = await sample()
    if (exit.y < 1600) break
  }
  expect(exit.y).toBeLessThan(1600)
  expect(exit.vy).toBeLessThan(-300)
  expect(exit.signals.grounded).toBe(false)
  await page.clock.runFor(120)
  const beyond = await sample()
  expect(beyond.y).toBeLessThan(exit.y - 30)
  expect(beyond.vy).toBeLessThan(-100)
  await page.screenshot({ path: info.outputPath('dry-field-launch.png') })
  expect(errors).toEqual([])
})
