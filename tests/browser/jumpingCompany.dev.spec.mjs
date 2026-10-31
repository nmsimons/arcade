import { readFileSync } from 'node:fs'
import { test, expect } from './helpers/test.mjs'
import { finishJumpingEntrance, useLevelFixtures } from './helpers/jumpingLevels.mjs'

// Preserve the reviewed encounter while authors keep editing the live catalog.
const company = JSON.parse(readFileSync(new URL('../fixtures/jumping/company-pod.json', import.meta.url), 'utf8'))
const motion = page => page.evaluate(() => window.jumpingMotion.read().recent.at(-1))

test('Company reveals its sleeping response unit and completes the rope escape with normal keys', async ({ page }, info) => {
  test.setTimeout(180000)
  const errors = []; page.on('pageerror', error => errors.push(error.message))
  await page.setViewportSize({ width: 1280, height: 800 })
  await useLevelFixtures(page, [company])
  await page.clock.install({ time: new Date('2026-01-01T00:00:00Z') })
  await page.goto('/lab?motionDebug=1&renderControl=1')
  const play = page.getByRole('button', { name: 'Play Company', exact: true })
  await expect(play).toBeEnabled({ timeout: 30000 })
  await page.clock.pauseAt(new Date('2026-01-01T01:00:00Z'))
  await play.click()
  await finishJumpingEntrance(page)
  await page.clock.runFor(64)
  await page.screenshot({ path: info.outputPath('company-sleeping.png') })
  // Keep full-size mood frames, but replay the long lit climb at a small
  // viewport so software-rendered CI spends its budget on the actual route.
  await page.setViewportSize({ width: 400, height: 300 }); await page.clock.runFor(32)
  await page.keyboard.down('ArrowRight')
  await page.clock.runFor(4800)
  let samples = 0
  while ((await motion(page)).x < 1080 && samples++ < 15) await page.clock.runFor(80)
  expect((await motion(page)).x).toBeGreaterThanOrEqual(1080)
  await page.screenshot({ path: info.outputPath('company-awakening.png') })
  await page.keyboard.down('Space'); await page.clock.runFor(48); await page.keyboard.up('Space')
  samples = 0
  while ((await motion(page)).signals.mode !== 'rope' && samples++ < 30) await page.clock.runFor(48)
  await page.keyboard.up('ArrowRight')
  expect((await motion(page)).signals.mode).toBe('rope')
  await page.keyboard.down('ArrowUp')
  await page.clock.runFor(2400)
  await page.setViewportSize({ width: 1280, height: 800 }); await page.clock.runFor(32)
  await page.screenshot({ path: info.outputPath('company-pursuit.png') })
  await page.setViewportSize({ width: 400, height: 300 }); await page.clock.runFor(32)
  await page.clock.runFor(5200)
  samples = 0
  while ((await motion(page)).y > 151 && samples++ < 15) await page.clock.runFor(80)
  await page.keyboard.up('ArrowUp')
  expect((await motion(page)).y).toBeLessThanOrEqual(151)
  await page.keyboard.down('ArrowRight'); await page.clock.runFor(4000); await page.keyboard.up('ArrowRight')
  await expect(page.getByRole('dialog', { name: 'Level complete', exact: true })).toBeVisible()
  await page.screenshot({ path: info.outputPath('company-complete.png') })
  expect(errors).toEqual([])
})
