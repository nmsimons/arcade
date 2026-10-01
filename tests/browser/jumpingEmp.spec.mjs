import { test, expect } from './helpers/folderTest.mjs'
import { blankTrial, levelProblems } from '../../src/games/jumping/level.ts'
import { selectBuilderObject, installTestFolder, reopenTestLevel, restartFromPause, saveTestLevel, useLevelFixtures } from './helpers/jumpingLevels.mjs'

const level = () => ({ ...blankTrial(), id: 'emp-browser-test', name: 'Power cut', width: 1200, height: 600, floor: 600,
  spawn: { x: 160, y: 600 }, goal: { x: 1040, y: 600 }, timers: [{ x: 80, y: 420 }],
  pickups: [{ kind: 'emp', x: 360, y: 568 }, { kind: 'coin', x: 420, y: 568 }],
  mechanisms: [
    { id: 'gate', kind: 'gate', x: 1000, y: 420, w: 20, h: 180, travel: 180 },
    { id: 'lift', kind: 'lift', x: 800, y: 560, w: 140, h: 20, travel: 160 },
  ],
  triggers: [{ mode: 'coins', x: 420, y: 360, w: 200, threshold: 1, targets: ['gate', 'lift'] }],
  robots: [{ x: 650, y: 600, left: 350, right: 760 }] })
async function open(page, editor = false) {
  const fixture = level()
  expect(levelProblems(fixture)).toEqual([])
  await useLevelFixtures(page, [fixture])
  if (editor) await installTestFolder(page, { 'fixture.json': fixture })
  await page.clock.install({ time: new Date('2026-01-01T00:00:00Z') })
  await page.addInitScript(() => {
    const proto = CanvasRenderingContext2D.prototype, rect = proto.fillRect, rounded = proto.roundRect, arc = proto.arc, fill = proto.fill, begin = proto.beginPath, move = proto.moveTo
    proto.beginPath = function (...args) { this.empPath = []; return begin.apply(this, args) }
    proto.moveTo = function (x, y) { this.empPath?.push([x, y]); return move.call(this, x, y) }
    proto.fillRect = function (...args) {
      if (args[0] === 0 && args[1] === 0 && this.fillStyle === '#f1f1ed') {
        this.canvas.empFrame = { bolts: 0, eyes: 0, meter: null, discs: 0, edges: 0 }
        this.canvas.empCamera = this.getTransform()
      }
      const frame = this.canvas.empFrame
      if (frame && args[2] === 5 && args[3] === 5 && ['#94433f', '#a5b3a7'].includes(this.fillStyle)) frame.eyes++
      if (frame && args[0] === 66 && args[1] === 12 && args[2] === 3 && args[3] === 3) frame.clock = this.empDigits
      return rect.apply(this, args)
    }
    proto.roundRect = function (...args) {
      if (this.canvas.empFrame && args[2] === 185 && args[3] === 8 && ['#dfb44f', '#a9ef82'].includes(this.fillStyle)) this.canvas.empFrame.meter = this.fillStyle
      if (this.canvas.empFrame && args[2] === 20 && args[3] === 180) this.canvas.empFrame.gateY = args[1]
      if (this.canvas.empFrame && args[2] === 140 && args[3] === 20) this.canvas.empFrame.liftY = args[1]
      return rounded.apply(this, args)
    }
    proto.arc = function (...args) {
      if (this.canvas.empFrame && args[2] === 20 && this.fillStyle === '#dfb44f') this.canvas.empFrame.discs++
      if (args[2] === 9 && this.fillStyle === '#68736e' && this.canvas.empCamera) {
        const t = this.canvas.empCamera.inverse().multiply(this.getTransform())
        this.canvas.empFrame.botX = t.e
      }
      return arc.apply(this, args)
    }
    proto.fill = function (...args) {
      if (this.shadowBlur === 3) this.empDigits = JSON.stringify(this.empPath)
      if (this.canvas.empFrame && this.fillStyle === '#ac7b35' && args[0] instanceof Path2D) this.canvas.empFrame.edges++
      if (this.canvas.empFrame && this.fillStyle === '#dfb44f' && args[0] instanceof Path2D) {
        this.canvas.empFrame.bolts++
        const t = this.canvas.empCamera.inverse().multiply(this.getTransform())
        this.canvas.empFrame.boltWidth = Math.hypot(t.a, t.b)
      }
      return fill.apply(this, args)
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
    await expect(page.getByRole('img', { name: 'Power cut: reach the exit' })).toBeFocused()
  }
  await page.clock.runFor(64)
}
const state = page => page.getByRole('img', { name: 'Power cut: reach the exit' }).evaluate(c => c.empFrame)

test('EMP cuts power, defers a full coin switch, pauses, restores power and restarts in production', async ({ page }, info) => {
  await open(page)
  const zeroClock = (await state(page)).clock; expect(zeroClock).toBeTruthy()
  expect(await state(page)).toMatchObject({ bolts: 1, edges: 1, discs: 0, eyes: 1, meter: null, clock: zeroClock, gateY: 420, liftY: 560 })
  const idleWidth = (await state(page)).boltWidth
  await page.screenshot({ path: info.outputPath('emp-before.png') })
  await page.clock.runFor(600)
  expect(Math.abs((await state(page)).boltWidth - idleWidth)).toBeGreaterThan(.1)
  expect((await state(page)).clock).toBe(zeroClock)
  await page.screenshot({ path: info.outputPath('emp-turning.png') })
  await page.keyboard.down('d'); await page.clock.runFor(700)
  await page.screenshot({ path: info.outputPath('emp-pulse.png') })
  await page.clock.runFor(200); await page.keyboard.up('d')
  await page.clock.runFor(400)
  const disabled = await state(page)
  expect(disabled).toMatchObject({ bolts: 0, eyes: 0, meter: '#dfb44f', gateY: 420, liftY: 560 })
  await page.clock.runFor(1000)
  const later = await state(page)
  expect(later.botX).toBe(disabled.botX); expect(later.gateY).toBe(disabled.gateY); expect(later.liftY).toBe(disabled.liftY)
  expect(later.clock).not.toBe(disabled.clock)
  await page.screenshot({ path: info.outputPath('emp-outage.png') })
  await page.keyboard.press('Escape'); await expect(page.getByRole('dialog', { name: 'Game paused' })).toBeVisible()
  const paused = await state(page); await page.clock.runFor(6000); expect(await state(page)).toEqual(paused)
  await page.getByRole('button', { name: /^Resume/ }).click()
  await page.clock.runFor(4000)
  const restored = await state(page)
  expect(restored.eyes).toBe(1); expect(restored.meter).toBe('#a9ef82')
  expect(restored.gateY).toBeLessThan(420); expect(restored.liftY).toBeLessThan(560)
  await page.screenshot({ path: info.outputPath('emp-restored.png') })
  await restartFromPause(page); await page.clock.runFor(64)
  expect(await state(page)).toMatchObject({ bolts: 1, eyes: 1, meter: null, clock: zeroClock, gateY: 420, liftY: 560 })
})

test('EMP places, undoes, saves, reopens and playtests in the builder', async ({ page }, info) => {
  await open(page, true)
  const selected = page.getByRole('combobox', { name: 'Selected object' })
  await page.getByRole('button', { name: 'EMP', exact: true }).click()
  await page.getByRole('application', { name: 'Level canvas' }).click({ position: { x: 420, y: 200 } })
  await expect(selected).toHaveAttribute('data-value', 'pickup:2'); await expect(selected).toHaveText('EMP 3')
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await selected.click()
  await expect(page.getByRole('listbox').locator('[role=option][data-value="pickup:2"]')).toHaveCount(0)
  await selected.press('Escape')
  await page.getByRole('button', { name: 'Redo', exact: true }).click()
  await selectBuilderObject(page, 'pickup:2'); await expect(selected).toHaveText('EMP 3')
  await page.screenshot({ path: info.outputPath('emp-builder.png') })
  const saved = await saveTestLevel(page)
  expect(saved.level.pickups[2]).toMatchObject({ kind: 'emp' })
  await reopenTestLevel(page, saved); await selectBuilderObject(page, 'pickup:2')
  await expect(selected).toHaveText('EMP 3')
  await saveTestLevel(page, 'Save and Test'); await page.clock.runFor(64)
  expect((await state(page)).bolts).toBe(2)
})
