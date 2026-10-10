import { readFileSync } from 'node:fs'
import { test, expect } from './helpers/test.mjs'
import { useLevelFixtures } from './helpers/jumpingLevels.mjs'

const level = JSON.parse(readFileSync(new URL('../fixtures/jumping/water-tunnel.json', import.meta.url), 'utf8'))
test.setTimeout(90000)

test('normal keyboard swimming holds depth, collects submerged coins, recovers in a covered passage and exits', async ({ page }, info) => {
  const errors = []
  page.on('pageerror', error => errors.push(String(error)))
  await useLevelFixtures(page, [level])
  await page.clock.install({ time: new Date('2026-01-01T00:00:00Z') })
  await page.goto('/untitled-jumping-game?motionDebug=1')
  await expect(page.locator('.jumping-level-card[aria-pressed=true]')).toBeVisible()
  await page.clock.pauseAt(new Date('2026-01-01T01:00:00Z'))
  await page.locator('.jumping-level-card[aria-pressed=true]').click()
  await expect(page.locator('canvas')).toBeFocused()
  const p = () => page.evaluate(() => window.jumpingMotion.read().recent.at(-1))
  async function hold(keys, ms) {
    for (const key of keys) await page.keyboard.down(key)
    await page.clock.runFor(ms)
    for (const key of keys) await page.keyboard.up(key)
  }
  const records = []
  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt) await page.keyboard.press('Escape')
    await hold(['ArrowUp'], 8000)
    await hold(['ArrowDown'], 2400); await hold([], 1000)
    const stopped = await p()
    expect(stopped.waterCenter).toBeGreaterThan(630)
    expect(stopped.waterCenter).toBeLessThan(675)
    await hold(['d'], 4000)
    const middle = await p()
    expect(middle.x).toBeGreaterThan(740)
    expect(Math.abs(middle.waterCenter - stopped.waterCenter)).toBeLessThan(1)
    if (!attempt) await page.screenshot({ path: info.outputPath('underwater-passage.png') })
    await hold([], 1500)
    const hover = await p()
    await hold([], 1500)
    const resting = await p()
    expect(Math.abs(resting.x - hover.x)).toBeLessThan(.1)
    expect(Math.abs(resting.waterCenter - hover.waterCenter)).toBeLessThan(.1)
    expect(resting.blends.fall).toBe(0)
    expect(resting.points[2][1]).toBeLessThan(resting.points[0][1] - 20)
    if (!attempt) await page.screenshot({ path: info.outputPath('underwater-upright-float.png') })
    await hold(['a'], 1200); await hold(['d'], 6600)
    const beyondRoof = await p()
    expect(beyondRoof.x).toBeGreaterThan(1230)
    expect(Math.abs(beyondRoof.vy)).toBeLessThan(.1)
    await hold(['ArrowUp'], 4000)
    const surfaced = await p()
    expect(surfaced.blends.fall).toBe(0)
    expect(Math.abs(surfaced.vy)).toBeLessThan(4)
    await hold(['d', 'ArrowUp'], 6000)
    await expect(page.getByRole('heading', { name: /Level complete/ })).toBeVisible()
    records.push({ stopped, middle, hover: resting, beyondRoof, surfaced })
  }
  await info.attach('underwater-route', { body: JSON.stringify(records, null, 2), contentType: 'application/json' })
  expect(errors).toEqual([])
})
