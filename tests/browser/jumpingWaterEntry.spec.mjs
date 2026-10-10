import { readFileSync } from 'node:fs'
import { test, expect } from './helpers/test.mjs'
import { useLevelFixtures } from './helpers/jumpingLevels.mjs'
import { waterBindingLevel } from '../helpers/jumpingWaterBindings.mjs'

const pool = JSON.parse(readFileSync(new URL('../fixtures/jumping/single-block-pool.json', import.meta.url), 'utf8'))

test('the controller stick folds an upright float before extending down at the surface and underwater', async ({ page }, info) => {
  test.setTimeout(90000)
  await useLevelFixtures(page, [waterBindingLevel()])
  await page.addInitScript(() => {
    window.testPad = { index: 0, id: 'Float to dive', connected: true, mapping: 'standard', axes: [0, 0, 0, 0],
      buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) }
    Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => [window.testPad] })
  })
  await page.clock.install({ time: new Date('2026-01-01T00:00:00Z') })
  await page.goto('/untitled-jumping-game?motionDebug=1')
  const play = page.getByRole('button', { name: 'Play Water clear 1', exact: true })
  await expect(play).toBeEnabled(); await page.clock.pauseAt(new Date('2026-01-01T01:00:00Z'))
  await play.click(); await expect(page.locator('canvas[tabindex="0"]')).toBeFocused(); await page.clock.runFor(150)
  const stick = async (y, ms) => {
    await page.evaluate(y => { window.testPad.axes[1] = y }, y)
    await page.clock.runFor(ms)
  }
  const state = () => page.evaluate(() => window.jumpingMotion.read().recent.at(-1))
  await stick(-1, 8000); await stick(0, 1000)
  const records = []
  for (const start of ['surface', 'underwater']) {
    const upright = await state()
    expect(upright.blends.fall).toBe(0)
    expect(upright.points[2][1]).toBeLessThan(upright.points[0][1] - 20)
    await stick(1, 350)
    const frames = await page.evaluate(time => window.jumpingMotion.read().recent.filter(s => s.time > time), upright.time)
    expect(frames.every(s => s.input.swimVertical > .99)).toBe(true)
    expect(Math.min(...frames.map(s => Math.hypot(s.points[8][0] - s.points[0][0], s.points[8][1] - s.points[0][1])))).toBeLessThan(16)
    await page.screenshot({ path: info.outputPath(`stick-dive-fold-${start}.png`) })
    await stick(1, 1050)
    const diving = await state()
    expect(diving.points[2][1]).toBeGreaterThan(diving.points[0][1] + 20)
    expect(diving.vy).toBeGreaterThan(99); expect(diving.vy).toBeLessThan(101)
    await page.screenshot({ path: info.outputPath(`stick-dive-extended-${start}.png`) })
    await stick(0, 3000)
    const resting = await state()
    expect(resting.blends.fall).toBe(0)
    expect(Math.abs(resting.vy)).toBeLessThan(.1)
    records.push({ start, upright, folded: frames.at(-1), diving, resting })
  }
  await info.attach('stick-dive-transitions', { body: JSON.stringify(records), contentType: 'application/json' })
})

for (const device of ['keyboard', 'controller']) test(`${device} holding Down through a bank jump slows into a controlled dive`, async ({ page }, info) => {
  test.setTimeout(60000)
  await useLevelFixtures(page, [pool])
  if (device === 'controller') await page.addInitScript(() => {
    window.testPad = { index: 0, id: 'Dive entry', connected: true, mapping: 'standard', axes: [0, 0, 0, 0],
      buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) }
    Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => [window.testPad] })
  })
  await page.clock.install({ time: new Date('2026-01-01T00:00:00Z') })
  await page.goto('/untitled-jumping-game?motionDebug=1')
  const play = page.getByRole('button', { name: 'Play Single block pool', exact: true })
  await expect(play).toBeEnabled()
  await page.clock.pauseAt(new Date('2026-01-01T01:00:00Z'))
  await play.click(); await page.clock.runFor(64)
  await expect(page.locator('canvas[tabindex="0"]')).toBeFocused()
  // Let the committed gameplay screen sample a released controller before
  // moving its stick; menu-to-play input is deliberately blocked until then.
  await page.clock.runFor(64)
  if (device === 'controller') await page.evaluate(() => { window.testPad.axes[0] = 1 })
  else await page.keyboard.down('d')
  await page.clock.runFor(1000)
  if (device === 'controller') await page.evaluate(() => { window.testPad.axes[1] = 1 })
  else await page.keyboard.down('ArrowDown')
  await page.clock.runFor(64)
  if (device === 'controller') await page.evaluate(() => { window.testPad.buttons[0] = { pressed: true, value: 1 } })
  else await page.keyboard.down('Space')
  await page.clock.runFor(180)
  if (device === 'controller') await page.evaluate(() => { window.testPad.buttons[0] = { pressed: false, value: 0 } })
  else await page.keyboard.up('Space')
  await page.clock.runFor(1700)
  const samples = await page.evaluate(() => window.jumpingMotion.read().recent)
  await info.attach('entry-motion', { body: JSON.stringify(samples), contentType: 'application/json' })
  const entry = samples.find(p => p.waterCenter > 315 && p.vy > 250)
  expect(entry, 'the ordinary jump carries speed through the waterline').toBeTruthy()
  const slowed = samples.find(p => p.time >= entry.time + .5)
  expect(slowed.vy).toBeLessThan(125)
  expect(slowed.waterCenter - entry.waterCenter).toBeLessThan(135)
  const diving = samples.at(-1)
  expect(diving.vy).toBeGreaterThan(60)
  expect(diving.vy).toBeLessThan(100)
  expect(diving.signals.grounded).toBe(false)
  await page.screenshot({ path: info.outputPath('controlled-dive-entry.png') })
  await info.attach('dive-entry', { body: JSON.stringify({ entry, slowed, diving }, null, 2), contentType: 'application/json' })
})
