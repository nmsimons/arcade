import { test, expect } from './helpers/test.mjs'
import { blankTrial } from '../../src/games/jumping/level.ts'
import { restartFromPause, useLevelFixtures } from './helpers/jumpingLevels.mjs'

const level = () => ({ ...blankTrial(), id: 'stopwatch-browser-test', name: 'Stopwatch run', width: 1000, height: 600, floor: 600,
  spawn: { x: 160, y: 600 }, goal: { x: 800, y: 600 },
  pickups: [{ kind: 'stopwatch', x: 320, y: 568 }, { kind: 'stopwatch', x: 560, y: 568 }],
  timers: [{ x: 80, y: 420 }, { x: 600, y: 420 }] })

async function open(page) {
  await useLevelFixtures(page, [level()])
  await page.clock.install({ time: new Date('2026-01-01T00:00:00Z') })
  await page.addInitScript(() => {
    const proto = CanvasRenderingContext2D.prototype, rect = proto.fillRect, fill = proto.fill, text = proto.fillText
    proto.fillRect = function (...args) {
      if (args[0] === 0 && args[1] === 0 && this.fillStyle === '#f1f1ed') { this.canvas.pickupScales = []; this.canvas.timerReadings = []; this.canvas.worldZoom = this.getTransform().a }
      if (this.fillStyle === '#eee3ce') this.canvas.clockStopped = true
      if (this.fillStyle === '#e2e7da') this.canvas.clockStopped = false
      return rect.apply(this, args)
    }
    proto.fill = function (...args) {
      if (this.fillStyle === '#ba8542') this.canvas.pickupScales?.push(this.getTransform().a / this.canvas.worldZoom)
      return fill.apply(this, args)
    }
    proto.fillText = function (value, ...args) {
      if (/^-?\d+:\d{2}\.\d{2}$/.test(value)) this.canvas.timerReadings?.push(value)
      return text.call(this, value, ...args)
    }
  })
  await page.goto('/untitled-jumping-game')
  await page.locator('.jumping-level-card[aria-pressed=true]').waitFor()
  await page.clock.pauseAt(new Date('2026-01-01T01:00:00Z'))
}
const state = page => page.getByRole('img', { name: 'Stopwatch run: activate the goal' }).evaluate(c => ({ scales: c.pickupScales, times: c.timerReadings, stopped: c.clockStopped }))

test('stopwatches freeze only the clock, animate through the effect, pause and restart correctly, and save the stopped time', async ({ page }, info) => {
  // Simulate the full ten-second freeze and a second run; hosted runners need
  // headroom to render every frame without shortening the gameplay assertions.
  test.setTimeout(60000)
  await open(page)
  await page.locator('.jumping-level-card[aria-pressed=true]').click()
  await expect(page.locator('canvas[role="img"]')).toBeFocused()
  await page.clock.runFor(64)
  expect((await state(page)).scales).toEqual([1, 1, 1, 1])
  expect((await state(page)).times).toEqual(['0:00.00', '0:00.00'])
  await page.screenshot({ path: info.outputPath('stopwatches-ready.png') })
  await page.keyboard.down('d')
  for (let i = 0; i < 80 && !(await state(page)).stopped; i++) await page.clock.runFor(16)
  await page.keyboard.up('d')
  await page.clock.runFor(48)
  const pulse = await state(page)
  expect(pulse.times[0]).toMatch(/^0:00\./); expect(pulse.times[1]).toBe(pulse.times[0])
  expect(pulse.scales[0]).toBeGreaterThan(1)
  await page.screenshot({ path: info.outputPath('stopwatch-pulse.png') })
  await page.keyboard.press('Escape'); await page.clock.runFor(1000)
  expect(await state(page)).toEqual(pulse)
  await page.getByRole('button', { name: 'Resume', exact: true }).click(); await page.clock.runFor(150)
  expect((await state(page)).scales[0]).toBeLessThan(.6)
  await page.screenshot({ path: info.outputPath('stopwatch-shrink.png') })
  await page.clock.runFor(250)
  expect((await state(page)).scales).toEqual([1, 1])
  expect((await state(page)).times).toEqual(pulse.times)
  await page.clock.runFor(8000)
  expect((await state(page)).times).toEqual(pulse.times)
  expect((await state(page)).stopped).toBe(true)
  await page.clock.runFor(2000)
  expect((await state(page)).stopped).toBe(false)
  expect((await state(page)).times[0]).not.toBe(pulse.times[0])
  await restartFromPause(page); await page.clock.runFor(64)
  expect((await state(page)).scales).toEqual([1, 1, 1, 1])
  expect((await state(page)).times).toEqual(['0:00.00', '0:00.00'])
  await page.keyboard.down('d'); await page.clock.runFor(4000); await page.keyboard.up('d')
  await expect(page.getByRole('dialog', { name: 'Level complete' })).toBeVisible()
  await expect(page.getByText('Gold medal', { exact: true })).toBeVisible()
  await expect(page.locator('.jumping-result-time')).toHaveText(/^0:00\./)
  expect((await state(page)).scales).toEqual([])
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('arcade.jumping.times.v1'))['stopwatch-browser-test'])
  expect(saved).toBeGreaterThan(0); expect(saved).toBeLessThan(1)
  await page.screenshot({ path: info.outputPath('stopped-clock-result.png') })
  await page.clock.resume(); await page.reload()
  await expect(page.getByRole('img', { name: 'Stopwatch run: activate the goal' })).toBeFocused()
  await page.keyboard.press('Escape'); await page.getByRole('button', { name: 'Level menu', exact: true }).click()
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('arcade.jumping.times.v1'))['stopwatch-browser-test'])).toBe(saved)
})

test('a zero-second personal best remains intact when opening the picker', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('arcade.jumping.times.v1', JSON.stringify({ 'stopwatch-browser-test': 0 })))
  await open(page)
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('arcade.jumping.times.v1'))['stopwatch-browser-test'])).toBe(0)
})
