import { readFileSync } from 'node:fs'
import { test, expect } from './helpers/test.mjs'
import { useLevelFixtures } from './helpers/jumpingLevels.mjs'

const level = JSON.parse(readFileSync(new URL('../fixtures/jumping/water-tunnel.json', import.meta.url), 'utf8'))
test.setTimeout(60000)

test('normal swimming reaches a tunnel ceiling and releases the palms at its exit', async ({ page }, info) => {
  const errors = []
  page.on('pageerror', error => errors.push(String(error)))
  await useLevelFixtures(page, [level])
  await page.clock.install({ time: new Date('2026-01-01T00:00:00Z') })
  await page.goto('/untitled-jumping-game?motionDebug=1')
  await expect(page.locator('.jumping-level-card[aria-pressed=true]')).toBeVisible()
  await page.clock.pauseAt(new Date('2026-01-01T01:00:00Z'))
  await page.locator('.jumping-level-card[aria-pressed=true]').click()
  await expect(page.locator('canvas')).toBeFocused()
  const sample = () => page.evaluate(() => window.jumpingMotion.read().recent.at(-1))
  async function hold(keys, ms) {
    for (const key of keys) await page.keyboard.down(key)
    await page.clock.runFor(ms)
    for (const key of keys) await page.keyboard.up(key)
  }
  await hold(['ArrowUp'], 8000)
  await hold(['ArrowDown'], 2400)
  await hold([], 1000)
  await hold(['d'], 3000)
  const inside = await sample()
  expect(inside.x).toBeGreaterThan(600)
  expect(inside.x).toBeLessThan(850)
  await hold(['ArrowUp'], 1600)
  const contact = await sample()
  expect(contact.blends.ceiling).toBeGreaterThan(.95)
  // Check the visible rig against the underside; the compact swimming hull
  // no longer holds its foot root at the standing body's 62-unit offset.
  const roof = level.platforms[1].y + level.platforms[1].h
  const headGap = contact.y + contact.points[2][1] - 6.2 - roof
  expect(headGap).toBeGreaterThan(2)
  expect(headGap).toBeLessThan(5)
  expect(Math.abs(contact.vy)).toBeLessThan(.1)
  expect(Math.min(...contact.contacts.hands.map(h => h.y)) - roof).toBeLessThan(4)
  await page.screenshot({ path: info.outputPath('tunnel-ceiling-contact.png') })
  await hold(['d', 'ArrowUp'], 8200)
  const leaving = await sample()
  expect(leaving.x).toBeGreaterThan(1250)
  expect(leaving.blends.ceiling).toBe(0)
  expect(leaving.y).toBeLessThan(contact.y - 15)
  await page.screenshot({ path: info.outputPath('tunnel-ceiling-release.png') })
  await info.attach('ceiling-route', { body: JSON.stringify({ inside, contact, leaving }, null, 2), contentType: 'application/json' })
  expect(errors).toEqual([])
})
