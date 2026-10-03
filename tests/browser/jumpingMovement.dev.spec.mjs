import { test, expect } from './helpers/test.mjs'
import { restartFromPause, useLevelFixtures } from './helpers/jumpingLevels.mjs'
import { blankTrial } from '../../src/games/jumping/level.ts'

const sample = page => page.evaluate(() => window.jumpingMotion.read().recent.at(-1))
async function start(page) {
  const level = { ...blankTrial(), name: 'Jump experiment', width: 3000, height: 1200, floor: 1000, spawn: { x: 200, y: 1000 }, goal: { x: 2800, y: 1000 } }
  await useLevelFixtures(page, [level])
  await page.clock.install({ time: new Date('2026-01-01T00:00:00Z') })
  await page.goto('/untitled-jumping-game')
  await page.getByRole('button', { name: 'Play Jump experiment', exact: true }).waitFor()
  await page.clock.pauseAt(new Date('2026-01-01T01:00:00Z'))
  await page.getByRole('button', { name: 'Play Jump experiment', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await page.clock.runFor(64)
}

test('jump fires while Space is still held, Up increases height and a held button does not repeat', async ({ page }) => {
  await start(page)
  await page.keyboard.down('Space'); await page.clock.runFor(64)
  const base = await sample(page)
  expect(base.y).toBeLessThan(1000); expect(base.vy).toBeLessThan(-350)
  await page.clock.runFor(2000)
  expect((await sample(page)).signals.grounded).toBe(true)
  await page.keyboard.up('Space')
  await page.keyboard.down('ArrowUp'); await page.keyboard.down('Space'); await page.clock.runFor(64)
  const high = await sample(page)
  expect(high.vy).toBeLessThan(base.vy - 200); expect(high.x).toBeCloseTo(base.x)
  await page.keyboard.up('Space'); await page.keyboard.up('ArrowUp')
})

test('a quick Up and Jump tap retains its strength when both keys release before the next frame', async ({ page }) => {
  await start(page)
  await page.keyboard.down('ArrowUp'); await page.keyboard.press('Space'); await page.keyboard.up('ArrowUp')
  await page.clock.runFor(64)
  const high = await sample(page)
  expect(high.vy).toBeLessThan(-650); expect(high.x).toBeCloseTo(200)
})

test('direction pressed after Jump cannot strengthen an already queued standing jump', async ({ page }) => {
  await start(page)
  await page.keyboard.press('Space'); await page.keyboard.down('ArrowUp')
  await page.clock.runFor(64)
  const base = await sample(page)
  expect(base.vy).toBeLessThan(-350); expect(base.vy).toBeGreaterThan(-500)
  await page.keyboard.up('ArrowUp')
})

test('the movement experiment panel and saved overrides are removed', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('jumping:movement-experiment:v1', JSON.stringify({ jumpSpeed: 1000, directedJumpSpeed: 1200, runSpeed: 600 })))
  await start(page)
  await page.keyboard.press('Backquote')
  await expect(page.getByRole('slider')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Reset movement defaults' })).toHaveCount(0)
  await page.keyboard.press('Escape')
  await page.keyboard.down('Space'); await page.clock.runFor(64)
  const base = await sample(page)
  expect(base.vy).toBeLessThan(-350); expect(base.vy).toBeGreaterThan(-500)
  await page.keyboard.up('Space'); await restartFromPause(page); await page.clock.runFor(64)
  await page.keyboard.press('Escape')
  await expect(page.getByRole('button', { name: /^Movement settings/ })).toHaveCount(0)
})
