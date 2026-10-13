import { flattenFixtureEntrance } from '../helpers/jumping-entrance-bank.mjs'
import { writeFile } from 'node:fs/promises'
import { test, expect } from './helpers/test.mjs'
import { finishJumpingEntrance, useLevelFixtures } from './helpers/jumpingLevels.mjs'
import { outwardBankLevel } from '../helpers/jumpingBankLedges.mjs'

for (const device of ['keyboard', 'stick']) for (const direction of [-1, 1]) {
  test(`${device} swims from the bottom, catches and climbs an outward bank, direction ${direction}`, async ({ page }, info) => {
    test.setTimeout(60000)
    const level = outwardBankLevel(direction, 20, .05), edgeX = direction > 0 ? 660 : 1140
    const errors = []; page.on('pageerror', error => errors.push(error.message))
    await useLevelFixtures(page, [level])
    if (device === 'stick') await page.addInitScript(() => {
      window.testPad = { index: 0, id: 'Bank acceptance pad', connected: true, mapping: 'standard', axes: [0, 0, 0, 0],
        buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) }
      Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => [window.testPad] })
    })
    await page.setViewportSize({ width: 852, height: 393 })
    await page.clock.install({ time: new Date('2026-10-10T12:00:00Z') })
    await page.goto('/lab?motionDebug=1')
    const play = page.getByRole('button', { name: `Play ${level.name}`, exact: true })
    await expect(play).toBeEnabled(); await page.clock.pauseAt(new Date('2026-10-10T13:00:00Z'))
    await play.click(); await finishJumpingEntrance(page); await page.clock.runFor(128)
    await expect(page.locator('canvas[tabindex="0"]')).toBeFocused()
    const state = () => page.evaluate(() => window.jumpingMotion.read().recent.at(-1))
    let keys = []
    const input = async (intent = {}, ms = 64) => {
      if (device === 'stick') await page.evaluate(intent => {
        window.testPad.axes[0] = intent.move ?? 0; window.testPad.axes[1] = -(intent.vertical ?? 0)
      }, intent)
      else {
        const next = [intent.move > 0 ? 'd' : intent.move < 0 ? 'a' : null,
          intent.vertical > 0 ? 'ArrowUp' : intent.vertical < 0 ? 'ArrowDown' : null].filter(Boolean)
        for (const key of keys) if (!next.includes(key)) await page.keyboard.up(key)
        for (const key of next) if (!keys.includes(key)) await page.keyboard.down(key)
        keys = next
      }
      await page.clock.runFor(ms)
    }
    await input({ vertical: -1 }, 1000); await input({}, 1000)
    const bottom = await state()
    expect(bottom.signals.grounded).toBe(true); expect(bottom.y).toBeCloseTo(920, 5)
    await input({ vertical: 1 }, 8000)
    const surface = await state()
    expect(surface.signals.grounded).toBe(false); expect(surface.y).toBeLessThan(460)
    let caught
    for (let frame = 0; frame < 40; frame++) {
      // Up during a catch deliberately queues the pull-up. Approach sideways
      // to exercise the bank's automatic catch and a quiet released grip.
      await input({ move: direction }); caught = await state()
      if (caught.signals.mode === 'hang') break
    }
    expect(caught.signals.mode).toBe('hang')
    await input({}, 640)
    const quiet = await state()
    expect(quiet.signals.mode).toBe('hang'); expect(quiet.vx).toBe(0); expect(quiet.vy).toBe(0)
    expect((edgeX - quiet.x) * direction).toBeCloseTo(14, 5)
    await page.screenshot({ path: info.outputPath('outward-bank-grip.png') })
    await input({ vertical: 1 }, 1600); await input()
    const standing = await state()
    expect(standing.signals.grounded).toBe(true); expect(standing.signals.mode).not.toBe('mantle')
    expect((standing.x - edgeX) * direction).toBeGreaterThan(0)
    expect(standing.y).toBeCloseTo(380 - (standing.x - edgeX) * direction * .05, 2)
    expect(errors).toEqual([])
    await writeFile(info.outputPath('outward-bank-diagnostic.json'), JSON.stringify({ device, direction, bottom, surface, caught, quiet, standing }, null, 2))
    await page.screenshot({ path: info.outputPath('outward-bank-pull-up.png') })
  })
}

for (const direction of [-1, 1]) for (const uphill of [0, .05]) {
  test(`running leaves an outward bank at full speed, direction ${direction}, uphill ${uphill}`, async ({ page }, info) => {
    const level = outwardBankLevel(direction, 20, uphill), edgeX = direction > 0 ? 660 : 1140
    level.gravityPlates = []; level.entrance = { x: edgeX + direction * 150, y: 380 - 150 * uphill }
    if (uphill) flattenFixtureEntrance(level)
    const errors = []; page.on('pageerror', error => errors.push(error.message))
    await useLevelFixtures(page, [level])
    await page.clock.install({ time: new Date('2026-10-10T12:00:00Z') })
    await page.goto('/lab?motionDebug=1')
    const play = page.getByRole('button', { name: `Play ${level.name}`, exact: true })
    await expect(play).toBeEnabled(); await page.clock.pauseAt(new Date('2026-10-10T13:00:00Z'))
    await play.click(); await finishJumpingEntrance(page); await page.clock.runFor(64)
    await expect(page.locator('canvas[tabindex="0"]')).toBeFocused()
    const key = direction > 0 ? 'a' : 'd'
    await page.keyboard.down(key); await page.clock.runFor(1000); await page.keyboard.up(key)
    const samples = await page.evaluate(() => window.jumpingMotion.read().recent)
    const departure = samples.filter(s => (edgeX - s.x) * direction > 0)
    expect(departure.length).toBeGreaterThan(20)
    for (const sample of departure) {
      expect(sample.signals.grounded).toBe(false); expect(sample.signals.sliding).toBe(false)
      expect(-sample.vx * direction).toBeGreaterThan(400)
    }
    const final = samples.at(-1)
    expect((edgeX - final.x) * direction).toBeGreaterThan(180)
    expect(final.y).toBeGreaterThan(380); expect(errors).toEqual([])
    await writeFile(info.outputPath('outward-bank-run-off.json'), JSON.stringify({ direction, uphill, samples }, null, 2))
    await page.screenshot({ path: info.outputPath('outward-bank-run-off.png') })
  })
}
