import { readFile, writeFile } from 'node:fs/promises'
import { test, expect } from './helpers/test.mjs'
import { finishJumpingEntrance, useLevelFixtures } from './helpers/jumpingLevels.mjs'
import { towerWallCatchLevel } from '../helpers/jumpingTowerWallCatch.mjs'

test('Tower II wall return catches the upper lip and pulls up with normal keys', async ({ page }, info) => {
  test.setTimeout(60_000)
  const level = towerWallCatchLevel(JSON.parse(await readFile(new URL('../../public/levels/jumping/Tower II.jump-level.json', import.meta.url), 'utf8')))
  await useLevelFixtures(page, [level])
  const errors = []; page.on('pageerror', error => errors.push(error.message))
  await page.clock.install({ time: new Date('2026-10-17T12:00:00Z') })
  await page.goto('/lab/levels/built-in/00-fixture.json?motionDebug=1')
  await expect(page.locator('.jumping-game > canvas')).toBeFocused()
  await expect(page.getByRole('dialog', { name: 'Preparing level', exact: true })).toHaveCount(0)
  await page.clock.pauseAt(new Date('2026-10-17T13:00:00Z'))
  await finishJumpingEntrance(page)
  const read = () => page.evaluate(() => window.jumpingMotion.read().recent.at(-1))
  const until = async predicate => {
    for (let tick = 0; tick < 250; tick++) {
      await page.clock.runFor(8)
      const sample = await read()
      if (sample && predicate(sample)) return sample
    }
    throw new Error(`Movement phase did not finish: ${JSON.stringify(await read())}`)
  }
  await page.keyboard.down('d')
  const runUp = await until(s => s.x >= 1240)
  await page.keyboard.down('Space'); await page.clock.runFor(184); await page.keyboard.up('Space')
  const wall = await until(s => s.x > 1450 && s.signals.bracing)
  await page.clock.runFor(40)
  await page.keyboard.down('Space'); await page.keyboard.up('d'); await page.keyboard.down('a')
  await page.clock.runFor(184); await page.keyboard.up('Space')
  const caught = await until(s => s.signals.mode === 'hang')
  expect(caught.y).toBeGreaterThan(1138)
  expect(caught.y).toBeLessThan(1170)
  await page.keyboard.up('a'); await page.clock.runFor(400)
  const quiet = await read()
  expect(quiet.signals.mode).toBe('hang')
  expect(quiet.vx).toBe(0); expect(quiet.vy).toBe(0)
  await page.screenshot({ path: info.outputPath('tower-wall-grip.png') })
  await page.keyboard.down('w'); await page.clock.runFor(1300); await page.keyboard.up('w')
  const standing = await read()
  expect(standing.signals.grounded).toBe(true)
  expect(standing.y).toBeCloseTo(1080, 4)
  expect(errors).toEqual([])
  await page.screenshot({ path: info.outputPath('tower-wall-pull-up.png') })
  await writeFile(info.outputPath('tower-wall-catch.json'), JSON.stringify({ runUp, wall, caught, quiet, standing }, null, 2))
})
