import { test, expect } from './helpers/folderTest.mjs'
import { blankTrial } from '../../src/games/jumping/level.ts'
import { selectBuilderObject, installTestFolder, reopenTestLevel, restartFromPause, saveTestLevel, useLevelFixtures } from './helpers/jumpingLevels.mjs'
import { installDigitalClockSpy } from './helpers/digitalClock.mjs'

const level = () => ({ ...blankTrial(), id: 'time-bonus-browser-test', name: 'Time bonus trial', width: 1200, height: 600, floor: 600,
  spawn: { x: 160, y: 600 }, goal: { x: 1040, y: 600 }, timers: [{ x: 80, y: 420 }],
  pickups: [{ kind: 'time-bonus', seconds: 5, x: 360, y: 568 }, { kind: 'time-bonus', seconds: 9, x: 640, y: 568 }] })
async function open(page, editor = false, crouch = false) {
  const fixture = level()
  if (crouch) {
    fixture.pickups = []
    fixture.platforms = [{ x: 280, y: 500, w: 280, h: 55 }]
  }
  await useLevelFixtures(page, [fixture])
  if (editor) await installTestFolder(page, { 'fixture.json': fixture })
  await page.clock.install({ time: new Date('2026-01-01T00:00:00Z') })
  await installDigitalClockSpy(page)
  await page.addInitScript(() => {
    const proto = CanvasRenderingContext2D.prototype, rect = proto.fillRect, text = proto.fillText, ellipse = proto.ellipse
    proto.fillRect = function (...args) {
      if (args[0] === 0 && args[1] === 0 && this.fillStyle === '#f1f1ed') {
        this.canvas.bonusNumbers = []; this.canvas.bonusLabels = []; this.canvas.bonusCamera = this.getTransform()
      }
      return rect.apply(this, args)
    }
    proto.fillText = function (value, ...args) {
      if (this.fillStyle === '#ba8542' && /^[1-9]$/.test(value)) this.canvas.bonusNumbers?.push(value)
      if (this.fillStyle === '#ba8542' && /^−[1-9]$/.test(value) && this.canvas.bonusCamera) {
        const transform = this.canvas.bonusCamera.inverse().multiply(this.getTransform())
        const point = transform.transformPoint(new DOMPoint(args[0], args[1]))
        this.canvas.bonusLabels?.push({ value, y: point.y, opacity: this.globalAlpha })
      }
      return text.call(this, value, ...args)
    }
    proto.ellipse = function (x, y, rx, ry, ...args) {
      if (rx === 6.2 && ry === 6.2 && this.canvas.bonusCamera) {
        const transform = this.canvas.bonusCamera.inverse().multiply(this.getTransform())
        this.canvas.playerRoot = { x: transform.e, y: transform.f, head: y }
      }
      return ellipse.call(this, x, y, rx, ry, ...args)
    }
  })
  await page.goto('/untitled-jumping-game')
  await page.locator('.jumping-level-card[aria-pressed=true]').waitFor()
  await page.clock.pauseAt(new Date('2026-01-01T01:00:00Z'))
  if (editor) {
    await page.getByRole('button', { name: 'Level studio', exact: true }).click()
    await page.getByRole('button', { name: 'Library', exact: true }).click()
    await page.getByRole('button', { name: 'Choose folder', exact: true }).click()
    await page.getByRole('button', { name: 'Open fixture.json', exact: true }).click()
  } else {
    await page.locator('.jumping-level-card[aria-pressed=true]').click()
    await expect(page.getByRole('img', { name: 'Time bonus trial: reach the exit' })).toBeFocused()
  }
  await page.clock.runFor(64)
}
const state = page => page.getByRole('img', { name: 'Time bonus trial: reach the exit' }).evaluate(c => ({ numbers: c.bonusNumbers, labels: c.bonusLabels, times: c.digitalClocks.map(clock => clock.value), player: c.playerRoot }))

test('numbered bonuses subtract elapsed time, clamp to zero, disappear and return on restart', async ({ page }, info) => {
  await open(page)
  expect((await state(page)).numbers).toEqual(['5', '9'])
  await page.screenshot({ path: info.outputPath('time-bonuses-ready.png') })
  await page.keyboard.down('w'); await page.clock.runFor(6000); await page.keyboard.up('w')
  const before = (await state(page)).times[0]
  expect(before).toBe('00:06')
  await page.keyboard.down('d'); await page.clock.runFor(650); await page.keyboard.up('d'); await page.clock.runFor(100)
  const firstLabel = (await state(page)).labels[0]
  expect(firstLabel.value).toBe('−5')
  await page.clock.runFor(300)
  const collected = await state(page)
  expect(collected.numbers).toEqual(['9'])
  expect(collected.times[0]).toBe('00:02')
  expect(collected.labels).toHaveLength(1)
  expect(collected.labels[0].value).toBe('−5')
  expect(collected.labels[0].y).toBeLessThan(firstLabel.y)
  expect(collected.labels[0].opacity).toBeGreaterThan(0)
  expect(collected.labels[0].opacity).toBeLessThan(firstLabel.opacity)
  await page.screenshot({ path: info.outputPath('time-bonus-collected.png') })
  await page.keyboard.down('d'); await page.clock.runFor(700); await page.keyboard.up('d'); await page.clock.runFor(400)
  expect((await state(page)).numbers).toEqual([])
  expect((await state(page)).times[0]).toBe('00:00')
  expect((await state(page)).labels.map(label => label.value)).toEqual(['−9'])
  await page.clock.runFor(1000)
  expect((await state(page)).times[0]).toBe('00:01')
  expect((await state(page)).labels).toEqual([])
  await restartFromPause(page); await page.clock.runFor(64)
  expect((await state(page)).numbers).toEqual(['5', '9'])
  expect((await state(page)).labels).toEqual([])
  expect((await state(page)).times).toEqual(['00:00'])
})

test('Time bonus places, edits its number, undoes, saves and reopens', async ({ page }, info) => {
  await open(page, true)
  const selected = page.getByRole('combobox', { name: 'Selected object' })
  await page.getByRole('button', { name: 'Time bonus', exact: true }).click()
  await page.getByRole('application', { name: 'Level canvas' }).click({ position: { x: 280, y: 200 } })
  await expect(selected).toHaveAttribute('data-value', 'pickup:2')
  await expect(selected).toHaveText('Time bonus 3')
  const seconds = page.getByRole('spinbutton', { name: 'Seconds off', exact: true })
  await expect(seconds).toHaveValue('5')
  await seconds.fill('7'); await seconds.press('Enter')
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await selectBuilderObject(page, 'pickup:2'); await expect(seconds).toHaveValue('5')
  await page.getByRole('button', { name: 'Redo', exact: true }).click()
  await selectBuilderObject(page, 'pickup:2'); await expect(seconds).toHaveValue('7')
  await page.clock.runFor(32)
  await page.screenshot({ path: info.outputPath('time-bonus-inspector.png') })
  const saved = await saveTestLevel(page)
  expect(saved.level.pickups[2]).toMatchObject({ kind: 'time-bonus', seconds: 7 })
  await reopenTestLevel(page, saved); await selectBuilderObject(page, 'pickup:2')
  await expect(seconds).toHaveValue('7')
})

test('Down visibly crouches, walks through a low tunnel and stands only when clear', async ({ page }, info) => {
  await open(page, false, true)
  const standing = (await state(page)).player
  await page.keyboard.down('d'); await page.clock.runFor(400)
  const blocked = (await state(page)).player
  await page.keyboard.down('s'); await page.clock.runFor(650)
  const crouched = (await state(page)).player
  expect(crouched.x).toBeGreaterThan(blocked.x + 50)
  expect(crouched.x).toBeLessThan(blocked.x + 100)
  expect(crouched.head).toBeGreaterThan(standing.head + 15)
  await page.screenshot({ path: info.outputPath('crouch-walk.png') })
  await page.keyboard.up('s'); await page.clock.runFor(500)
  expect((await state(page)).player.head).toBeGreaterThan(standing.head + 15)
  await page.clock.runFor(1800); await page.keyboard.up('d')
  // Let braking and both recovery steps settle before comparing the idle poses.
  await page.clock.runFor(600)
  const clear = (await state(page)).player
  expect(clear.x).toBeGreaterThan(crouched.x + 230)
  expect(clear.head).toBeLessThan(standing.head + 5)
})
