import { test, expect } from './helpers/test.mjs'
import { useLevelFixtures } from './helpers/jumpingLevels.mjs'
import { blankTrial } from '../../src/games/jumping/level.ts'

test('motion diagnostics observe real controls and pushing resumes smoothly after a brief release', async ({ page }, info) => {
  const level = blankTrial(); level.spawn = { x: 474.5, y: 920 }
  level.props = [{ kind: 'box', x: 540, y: 920, size: 80 }]
  level.platforms = [{ x: 580, y: 700, w: 100, h: 220 }]
  const errors = []; page.on('pageerror', error => errors.push(error.message))
  await useLevelFixtures(page, [level])
  await page.clock.install({ time: new Date('2026-01-01T00:00:00Z') })
  await page.goto('/untitled-jumping-game?motionDebug=1')
  await expect(page.locator('.jumping-level-card[aria-pressed=true]')).toBeVisible()
  await page.clock.pauseAt(new Date('2026-01-01T01:00:00Z'))
  await page.locator('.jumping-level-card[aria-pressed=true]').click()
  await expect(page.locator('canvas')).toBeFocused()
  await page.clock.runFor(64)
  await page.keyboard.down('d'); await page.clock.runFor(800)
  const read = () => page.evaluate(() => window.jumpingMotion.read())
  expect((await read()).recent.at(-1).blends.push).toBe(1)
  for (let i = 0; i < 6; i++) {
    await page.keyboard.up('d'); await page.clock.runFor(16)
    expect((await read()).recent.at(-1).signals.push).toBeNull()
    await page.keyboard.down('d'); await page.clock.runFor(32)
    expect((await read()).recent.at(-1).blends.push).toBeGreaterThan(.85)
  }
  await page.screenshot({ path: info.outputPath('resumed-push.png') })
  await page.keyboard.down('Space'); await page.clock.runFor(400)
  await page.keyboard.up('Space'); await page.clock.runFor(64)
  const jumping = (await read()).recent.at(-1)
  expect(jumping.signals.grounded).toBe(false)
  expect(jumping.signals.push).toBeNull()
  expect(jumping.blends.push).toBe(0)
  expect((await read()).reports).toEqual([])
  await page.keyboard.up('d'); await page.keyboard.press('Escape'); await page.clock.runFor(32)
  expect((await read()).recent).toEqual([])
  expect(errors).toEqual([])
})

test('production play does not enable diagnostics without the flag', async ({ page }) => {
  await useLevelFixtures(page, [blankTrial()])
  await page.goto('/untitled-jumping-game')
  await expect(page.locator('.jumping-level-card[aria-pressed=true]')).toBeVisible()
  expect(await page.evaluate(() => window.jumpingMotion)).toBeUndefined()
})
