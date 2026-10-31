import { test, expect } from './helpers/test.mjs'
import { readFileSync } from 'node:fs'
import { finishJumpingEntrance, useLevelFixtures } from './helpers/jumpingLevels.mjs'

const { level } = JSON.parse(readFileSync(new URL('../fixtures/jumping-lockout2-runs.json', import.meta.url), 'utf8'))

async function play(page, query) {
  await page.setViewportSize({ width: 390, height: 844 })
  await useLevelFixtures(page, [level])
  await page.clock.install({ time: new Date('2026-01-01T00:00:00Z') })
  await page.goto(`/lab${query}`)
  const button = page.getByRole('button', { name: 'Play Lock Out II', exact: true })
  await expect(button).toBeEnabled(); await page.clock.pauseAt(new Date('2026-01-01T01:00:00Z'))
  await button.click(); await finishJumpingEntrance(page)
}
const pixels = page => page.evaluate(() => document.querySelector('.jumping-game > canvas').toDataURL())
const position = page => page.evaluate(() => window.jumpingMotion.read().recent.at(-1).x)

test('render control is absent unless the page opts in', async ({ page }) => {
  await play(page, '?motionDebug=1')
  expect(await page.evaluate(() => typeof window.jumpingRendering)).toBe('undefined')
})

test('paused rendering keeps simulating and draws the current frame on resume', async ({ page }) => {
  await play(page, '?motionDebug=1&renderControl=1')
  const before = { x: await position(page), image: await pixels(page) }
  await page.evaluate(() => window.jumpingRendering.pause())
  await page.keyboard.down('ArrowRight')
  // The fixture's clock wrapper nests its own pause inside this one.
  await page.clock.runFor(600)
  await page.keyboard.up('ArrowRight')
  const paused = { x: await position(page), image: await pixels(page) }
  expect(paused.x).toBeGreaterThan(before.x + 100)
  expect(paused.image).toBe(before.image)
  await page.evaluate(() => window.jumpingRendering.resume())
  expect(await pixels(page)).not.toBe(before.image)
  // Each wrapped clock advance still returns with its final frame drawn.
  const resumed = await pixels(page)
  await page.keyboard.down('ArrowLeft'); await page.clock.runFor(300); await page.keyboard.up('ArrowLeft')
  expect(await pixels(page)).not.toBe(resumed)
})

test.describe.serial('skipped drawing leaves gameplay unchanged', () => {
  const traces = {}
  for (const query of ['?motionDebug=1', '?motionDebug=1&renderControl=1']) test(`keyboard trace with ${query}`, async ({ page }) => {
    // The ordinary run draws every frame of its software-rendered reference.
    test.setTimeout(120000)
    await play(page, query)
    for (const [keys, ms] of [[['ArrowRight'], 700], [['ArrowRight', 'Space'], 180], [['ArrowRight'], 900], [[], 400], [['ArrowLeft', 'Shift'], 500]]) {
      for (const key of keys) await page.keyboard.down(key)
      await page.clock.runFor(ms)
      for (const key of keys) await page.keyboard.up(key)
    }
    traces[query] = await page.evaluate(() => window.jumpingMotion.read().recent.map(({ time, x, y, vx, vy, signals }) => ({ time, x, y, vx, vy, mode: signals.mode })))
    if (Object.keys(traces).length === 2) expect(traces['?motionDebug=1&renderControl=1']).toEqual(traces['?motionDebug=1'])
  })
})
