import { readFileSync } from 'node:fs'
import { test, expect } from './helpers/test.mjs'
import { useLevelFixtures } from './helpers/jumpingLevels.mjs'

const pool = JSON.parse(readFileSync(new URL('../fixtures/jumping/single-block-pool.json', import.meta.url), 'utf8'))

test('a normal bank jump and dive reaches the floor hand first before standing', async ({ page }, info) => {
  await useLevelFixtures(page, [pool])
  await page.clock.install({ time: new Date('2026-10-10T00:00:00Z') })
  await page.goto('/untitled-jumping-game?motionDebug=1')
  const play = page.getByRole('button', { name: 'Play Single block pool', exact: true })
  await expect(play).toBeEnabled()
  await page.clock.pauseAt(new Date('2026-10-10T01:00:00Z'))
  await play.click(); await page.clock.runFor(128)
  await expect(page.locator('canvas[tabindex="0"]')).toBeFocused()
  await page.keyboard.down('d'); await page.clock.runFor(1000)
  await page.keyboard.down('ArrowDown'); await page.clock.runFor(64)
  await page.keyboard.down('Space'); await page.clock.runFor(180); await page.keyboard.up('Space')
  await page.clock.runFor(1700); await page.keyboard.up('d')
  const state = () => page.evaluate(() => window.jumpingMotion.read().recent.at(-1))
  let touch
  for (let i = 0; i < 100; i++) {
    await page.clock.runFor(80)
    const sample = await state()
    if (sample.signals.waterLanding) { touch = sample; break }
  }
  expect(touch).toBeTruthy()
  expect(touch.y).toBeGreaterThan(755)
  expect(touch.points[2][1]).toBeGreaterThan(touch.points[0][1])
  expect(touch.contacts.floorHand.y).toBeCloseTo(765, 3)
  expect(touch.contacts.feet.every(foot => !foot.planted && foot.y < 750)).toBe(true)
  await page.screenshot({ path: info.outputPath('hand-first.png') })
  await page.clock.runFor(320)
  expect((await state()).signals.waterLanding).toBe(true)
  await page.screenshot({ path: info.outputPath('gather-onto-floor.png') })
  await page.keyboard.up('ArrowDown'); await page.clock.runFor(900)
  const standing = await state()
  expect(standing.signals.waterLanding).toBe(false)
  expect(standing.signals.grounded).toBe(true)
  expect(standing.points[2][1]).toBeLessThan(standing.points[0][1] - 20)
  expect(standing.contacts.feet.some(foot => foot.planted)).toBe(true)
  await page.screenshot({ path: info.outputPath('standing-after-dive.png') })
  await page.clock.runFor(600)
  expect((await state()).y).toBeCloseTo(standing.y, 5)
  await page.keyboard.down('ArrowUp'); await page.clock.runFor(700); await page.keyboard.up('ArrowUp')
  expect((await state()).signals.grounded).toBe(false)
  expect((await state()).y).toBeLessThan(standing.y - 25)
  await info.attach('floor-landing', { body: JSON.stringify({ touch, standing }, null, 2), contentType: 'application/json' })
})
