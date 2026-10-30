import { test, expect } from './helpers/test.mjs'
import { readFileSync } from 'node:fs'
import { useLevelFixtures } from './helpers/jumpingLevels.mjs'

const { level } = JSON.parse(readFileSync(new URL('../fixtures/jumping-lockout2-runs.json', import.meta.url), 'utf8'))

for (const viewport of [{ width: 1440, height: 960 }, { width: 390, height: 844 }]) test(`Lock Out II: real-time fill, delivery, drain and exit at ${viewport.width}px`, async ({ page }, info) => {
  test.setTimeout(120000)
  await page.setViewportSize(viewport)
  const errors = []; page.on('pageerror', error => errors.push(error.message))
  await useLevelFixtures(page, [level])
  await page.goto('/lab?motionDebug=1')
  await page.getByRole('button', { name: 'Play Lock Out II', exact: true }).click()
  const canvas = page.locator('.jumping-game > canvas')
  await expect(canvas).toBeFocused({ timeout: 30000 })
  await expect(page.locator('.jumping-state')).not.toHaveText('Entering the level', { timeout: 30000 })
  const motion = () => page.evaluate(() => window.jumpingMotion.read().recent.at(-1))
  const until = predicate => expect.poll(async () => predicate(await motion()), { timeout: 15000, intervals: [25] }).toBe(true)
  const key = async (code, ms) => { await page.keyboard.down(code); await page.waitForTimeout(ms); await page.keyboard.up(code) }
  await canvas.screenshot({ path: info.outputPath('lockout2-dry-overview.png') })
  // Walk into pickup range so a slow observer cannot run past the sleeve.
  await page.keyboard.down('Shift'); await page.keyboard.down('ArrowRight'); await until(p => p.x >= 205)
  await page.keyboard.up('ArrowRight'); await page.keyboard.up('Shift')
  await key('e', 80)
  await page.keyboard.down('ArrowRight'); await until(p => p.x >= 1680); await page.keyboard.up('ArrowRight')
  await page.waitForTimeout(2200)
  await page.keyboard.down('ArrowLeft'); await until(p => p.x <= 1220); await page.keyboard.up('ArrowLeft')
  await page.waitForTimeout(900)
  const stance = await motion()
  expect(stance.signals.grounded).toBe(true)
  expect(stance.y).toBeCloseTo(260)
  await canvas.screenshot({ path: info.outputPath('lockout2-full-reservoir.png') })
  await key('f', 160); await page.waitForTimeout(1450)
  // Jump before moving beneath the overhang. Separate input calls and live
  // polling can otherwise carry the player past the takeoff in software CI.
  await page.keyboard.down('Space'); await page.keyboard.down('ArrowRight')
  await until(p => p.signals.mode === 'hang' || p.signals.grounded && p.y <= 125)
  await page.keyboard.up('ArrowRight')
  await page.keyboard.up('Space')
  await page.keyboard.down('Shift'); await page.keyboard.down('ArrowUp'); await page.keyboard.down('ArrowRight')
  await until(p => p.x >= 1340 && p.y <= 125)
  await page.keyboard.up('ArrowRight'); await page.keyboard.up('ArrowUp'); await page.keyboard.up('Shift')
  await until(p => p.signals.grounded && Math.abs(p.y - 125) < 1)
  await page.waitForTimeout(2400)
  await canvas.screenshot({ path: info.outputPath('lockout2-drained-receiver.png') })
  await page.keyboard.down('ArrowRight')
  await expect(page.getByRole('dialog', { name: 'Level complete', exact: true })).toBeVisible({ timeout: 15000 })
  await page.keyboard.up('ArrowRight')
  await page.screenshot({ path: info.outputPath('lockout2-complete.png') })
  expect(errors).toEqual([])
})
