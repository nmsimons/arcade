import { readFileSync } from 'node:fs'
import { test, expect } from './helpers/test.mjs'
import { useLevelFixtures } from './helpers/jumpingLevels.mjs'

test.use({ video: 'on' })
test('Impact Lab: normal-speed drop, get-up and return ladder use ordinary controls', async ({ page }, info) => {
  test.setTimeout(60000)
  const file = JSON.parse(readFileSync(new URL('../../dev/levels/jumping/Impact Lab.jump-level.json', import.meta.url), 'utf8'))
  const errors = []; page.on('pageerror', error => errors.push(error.message))
  await useLevelFixtures(page, [file])
  await page.goto('/lab?motionDebug=1')
  await page.getByRole('button', { name: 'Play Impact Lab', exact: true }).click()
  await expect(page.getByRole('dialog', { name: 'Preparing level', exact: true })).toHaveCount(0)
  await expect(page.locator('.jumping-state')).not.toHaveText('Entering the level')
  await expect(page.locator('.jumping-game > canvas')).toBeFocused()
  const read = () => page.evaluate(() => window.jumpingMotion.read().recent.at(-1))
  await page.keyboard.down('d')
  await expect.poll(async () => (await read())?.x, { intervals: [16], timeout: 8000 }).toBeGreaterThan(470)
  await page.keyboard.up('d')
  await expect.poll(async () => (await read())?.signals.ragdoll, { intervals: [16], timeout: 8000 }).toBe('landing')
  await page.waitForTimeout(80)
  await page.screenshot({ path: info.outputPath('impact-recoil.png') })
  await expect.poll(async () => (await read())?.signals.mode, { intervals: [32] }).toBe('free')
  expect((await read()).signals.grounded).toBe(true)
  // The bottom landing has a usable way back, reached through the same inputs
  // as an ordinary play session. The tall ladder is deliberately left of it.
  await page.keyboard.down('Shift'); await page.keyboard.down('a'); await page.keyboard.down('w')
  await expect.poll(async () => (await read())?.signals.mode, { intervals: [16], timeout: 10000 }).toBe('ladder')
  await page.keyboard.up('a'); await page.keyboard.up('Shift')
  await expect.poll(async () => (await read())?.y, { timeout: 30000, intervals: [32] }).toBeLessThan(240)
  await page.keyboard.up('w')
  await expect.poll(async () => (await read())?.signals.grounded, { intervals: [32] }).toBe(true)
  await page.screenshot({ path: info.outputPath('return-ladder.png') })
  expect(errors).toEqual([])
})
