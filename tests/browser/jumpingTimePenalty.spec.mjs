import { test, expect } from './helpers/folderTest.mjs'
import { blankTrial } from '../../src/games/jumping/level.ts'
import { TIME_PENALTY_COLOR } from '../../src/games/jumping/pickups.ts'
import { installTestFolder, reopenTestLevel, restartFromPause, saveTestLevel, useLevelFixtures } from './helpers/jumpingLevels.mjs'

const level = () => ({ ...blankTrial(), id: 'time-penalty-browser-test', name: 'Bad timing', width: 1200, height: 600, floor: 600,
  spawn: { x: 160, y: 600 }, goal: { x: 1040, y: 600 }, timers: [{ x: 80, y: 420 }],
  pickups: [{ kind: 'time-penalty', seconds: 5, x: 360, y: 568 }, { kind: 'fast-stopwatch', x: 640, y: 568 }] })
async function open(page, editor = false) {
  const fixture = level()
  await useLevelFixtures(page, [fixture])
  if (editor) await installTestFolder(page, { 'fixture.json': fixture })
  await page.clock.install({ time: new Date('2026-01-01T00:00:00Z') })
  await page.addInitScript(color => {
    const proto = CanvasRenderingContext2D.prototype, rect = proto.fillRect, text = proto.fillText
    proto.fillRect = function (...args) {
      if (args[0] === 0 && args[1] === 0 && this.fillStyle === '#f1f1ed') {
        this.canvas.penaltyFrame = { numbers: [], labels: [], times: [], fast: false }
        this.canvas.penaltyCamera = this.getTransform()
      }
      if (args[2] === 200 && args[3] === 60 && this.fillStyle === color && this.canvas.penaltyFrame) this.canvas.penaltyFrame.fast = true
      return rect.apply(this, args)
    }
    proto.fillText = function (value, ...args) {
      const frame = this.canvas.penaltyFrame
      if (frame && this.fillStyle === color) {
        const transform = this.canvas.penaltyCamera.inverse().multiply(this.getTransform())
        const point = transform.transformPoint(new DOMPoint(args[0], args[1]))
        if (/^[1-9]$/.test(value)) frame.numbers.push({ value, right: point.x + this.measureText(value).width / 2 })
        if (/^\+[1-9]$/.test(value)) frame.labels.push({ value, right: point.x, y: point.y, opacity: this.globalAlpha })
      }
      if (/^\d+:\d{2}\.\d{2}$/.test(value)) frame?.times.push(value)
      return text.call(this, value, ...args)
    }
  }, TIME_PENALTY_COLOR)
  await page.goto('/untitled-jumping-game')
  await page.locator('.jumping-level-card[aria-pressed=true]').waitFor()
  await page.clock.pauseAt(new Date('2026-01-01T01:00:00Z'))
  if (editor) {
    await page.getByRole('button', { name: 'Level builder', exact: true }).click()
    await page.getByRole('button', { name: 'Library', exact: true }).click()
    await page.getByRole('button', { name: 'Choose folder', exact: true }).click()
    await page.getByRole('button', { name: 'Open fixture.json', exact: true }).click()
  } else {
    await page.locator('.jumping-level-card[aria-pressed=true]').click()
    await expect(page.getByRole('img', { name: 'Bad timing: activate the goal' })).toBeFocused()
  }
  await page.clock.runFor(64)
}
const state = page => page.getByRole('img', { name: 'Bad timing: activate the goal' }).evaluate(c => c.penaltyFrame)
const seconds = frame => { const [m, s] = frame.times[0].split(':').map(Number); return m * 60 + s }

test('red pickups penalize the clock, animate, pause, expire and reset in production gameplay', async ({ page }, info) => {
  await open(page)
  const before = await state(page)
  expect(before.numbers.map(n => n.value)).toEqual(['5'])
  await page.screenshot({ path: info.outputPath('harmful-pickups-ready.png') })
  await page.keyboard.down('d'); await page.clock.runFor(650); await page.keyboard.up('d'); await page.clock.runFor(100)
  const first = await state(page)
  expect(first.numbers).toEqual([]); expect(seconds(first)).toBeGreaterThan(5)
  expect(first.labels[0].value).toBe('+5')
  expect(first.labels[0].right).toBeCloseTo(before.numbers[0].right, 6)
  await page.clock.runFor(200)
  const fading = await state(page)
  expect(fading.labels[0].y).toBeLessThan(first.labels[0].y)
  expect(fading.labels[0].opacity).toBeLessThan(first.labels[0].opacity)
  await page.screenshot({ path: info.outputPath('time-penalty-collected.png') })
  await page.keyboard.down('d'); await page.clock.runFor(700); await page.keyboard.up('d'); await page.clock.runFor(400)
  const fast = await state(page)
  expect(fast.labels).toEqual([]); expect(fast.fast).toBe(true)
  await page.screenshot({ path: info.outputPath('double-speed-timer.png') })
  await page.clock.runFor(1000)
  expect(seconds(await state(page)) - seconds(fast)).toBeCloseTo(2, 1)
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog', { name: 'Game paused' })).toBeVisible()
  const paused = await state(page)
  await page.clock.runFor(6000)
  expect(await state(page)).toEqual(paused)
  await page.getByRole('button', { name: /^Resume/ }).click()
  await page.clock.runFor(1000)
  const resumed = await state(page)
  expect(resumed.fast).toBe(true)
  expect(seconds(resumed) - seconds(paused)).toBeCloseTo(2, 1)
  await page.clock.runFor(4000)
  const expired = await state(page)
  expect(expired.fast).toBe(false)
  await page.clock.runFor(1000)
  expect(seconds(await state(page)) - seconds(expired)).toBeCloseTo(1, 1)
  await restartFromPause(page); await page.clock.runFor(64)
  const reset = await state(page)
  expect(reset.times).toEqual(['0:00.00']); expect(reset.fast).toBe(false)
  expect(reset.numbers.map(n => n.value)).toEqual(['5']); expect(reset.labels).toEqual([])
})

test('both harmful pickups place, edit, undo, save and reopen in the builder', async ({ page }, info) => {
  await open(page, true)
  const selected = page.getByRole('combobox', { name: 'Selected object' })
  await page.getByRole('button', { name: 'Time penalty', exact: true }).click()
  await page.getByRole('application', { name: 'Level canvas' }).click({ position: { x: 280, y: 200 } })
  await expect(selected).toHaveValue('pickup:2')
  await expect(selected.locator('option:checked')).toHaveText('Time penalty 3')
  const amount = page.getByRole('spinbutton', { name: 'Seconds added', exact: true })
  await expect(amount).toHaveValue('5')
  await amount.fill('9'); await amount.press('Enter')
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await selected.selectOption('pickup:2'); await expect(amount).toHaveValue('5')
  await page.getByRole('button', { name: 'Redo', exact: true }).click()
  await selected.selectOption('pickup:2'); await expect(amount).toHaveValue('9')
  await page.getByRole('button', { name: 'Fast stopwatch', exact: true }).click()
  await page.getByRole('application', { name: 'Level canvas' }).click({ position: { x: 420, y: 200 } })
  await expect(selected).toHaveValue('pickup:3')
  await expect(selected.locator('option:checked')).toHaveText('Fast stopwatch 4')
  await expect(amount).toHaveCount(0)
  await selected.selectOption('pickup:2'); await page.clock.runFor(32)
  await page.screenshot({ path: info.outputPath('harmful-pickup-inspector.png') })
  const saved = await saveTestLevel(page)
  expect(saved.level.pickups[2]).toMatchObject({ kind: 'time-penalty', seconds: 9 })
  expect(saved.level.pickups[3]).toMatchObject({ kind: 'fast-stopwatch' })
  await reopenTestLevel(page, saved); await selected.selectOption('pickup:2')
  await expect(amount).toHaveValue('9')
  await saveTestLevel(page, 'Save and Test')
  await page.clock.runFor(64)
  expect((await state(page)).numbers.map(n => n.value)).toEqual(['5', '9'])
})
