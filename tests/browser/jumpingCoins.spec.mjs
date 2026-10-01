import { test, expect } from './helpers/folderTest.mjs'
import { blankTrial } from '../../src/games/jumping/level.ts'
import { selectBuilderOption, selectBuilderObject, installTestFolder, reopenTestLevel, restartFromPause, saveTestLevel, useLevelFixtures } from './helpers/jumpingLevels.mjs'

const level = (orientation = 'horizontal') => ({ ...blankTrial(), id: 'coins-browser-test', name: 'Coin collection', width: 1200, height: 600, floor: 600,
  spawn: { x: 160, y: 600 }, goal: { x: 1040, y: 600 },
  pickups: [300, 500, 700].map(x => ({ kind: 'coin', x, y: 568 })),
  triggers: [{ mode: 'coins', x: 360, y: 320, ...(orientation === 'vertical' ? { orientation, w: 20, h: 200 } : { w: 200 }), threshold: 3, targets: ['gate'] }],
  mechanisms: [{ id: 'gate', kind: 'gate', x: 820, y: 420, w: 20, h: 180, travel: 180 }] })

async function open(page, editor = false, orientation = 'horizontal') {
  await useLevelFixtures(page, [level(orientation)])
  if (editor) await installTestFolder(page, { 'fixture.json': level() })
  await page.clock.install({ time: new Date('2026-01-01T00:00:00Z') })
  await page.addInitScript(() => {
    const proto = CanvasRenderingContext2D.prototype, rect = proto.fillRect, ellipse = proto.ellipse, rounded = proto.roundRect
    proto.fillRect = function (...args) {
      if (args[0] === 0 && args[1] === 0 && this.fillStyle === '#f1f1ed') {
        this.canvas.coinCamera = this.getTransform(); this.canvas.coinWidths = []; this.canvas.coinMeter = { cells: [], full: false }; this.canvas.coinSegments = 0
      }
      return rect.apply(this, args)
    }
    proto.ellipse = function (...args) {
      if (this.fillStyle === '#dfb44f' && args[3] === 18 && this.canvas.coinCamera && this.getTransform().a / this.canvas.coinCamera.a > .9) this.canvas.coinWidths.push(args[2])
      return ellipse.apply(this, args)
    }
    proto.roundRect = function (...args) {
      if (this.canvas.coinMeter && (args[2] === 8 || args[3] === 8) && ['#18271e', '#dfb44f', '#a9ef82'].includes(this.fillStyle)) {
        this.canvas.coinSegments++
        if (this.fillStyle !== '#18271e') {
          this.canvas.coinMeter.cells.push({ x: args[0], y: args[1], width: args[2], height: args[3] })
          this.canvas.coinMeter.full = this.fillStyle === '#a9ef82'
        }
      }
      if (args[0] === 820 && args[2] === 20 && args[3] === 180) this.canvas.coinGateY = args[1]
      return rounded.apply(this, args)
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
    await expect(page.getByRole('img', { name: 'Coin collection: reach the exit' })).toBeFocused()
  }
  await page.clock.runFor(64)
}
const state = page => page.getByRole('img', { name: 'Coin collection: reach the exit' }).evaluate(c => ({ coins: c.coinWidths, meter: c.coinMeter, segments: c.coinSegments, gate: c.coinGateY }))

for (const orientation of ['horizontal', 'vertical']) test(`${orientation} meters fill in the correct direction, open a gate, pause, and reset`, async ({ page }, info) => {
  await open(page, false, orientation)
  const vertical = orientation === 'vertical', fillSize = meter => meter.cells.length
  const ready = await state(page)
  expect(ready.segments).toBe(3)
  expect(ready.coins).toHaveLength(3); expect(ready.meter).toEqual({ cells: [], full: false }); expect(ready.gate).toBe(420)
  await page.clock.runFor(500)
  expect((await state(page)).coins).not.toEqual(ready.coins)
  await page.screenshot({ path: info.outputPath('coins-ready.png') })
  await page.keyboard.down('d')
  for (let i = 0; i < 80 && fillSize((await state(page)).meter) === 0; i++) await page.clock.runFor(16)
  await page.keyboard.up('d'); await page.clock.runFor(400)
  const partial = await state(page)
  expect(partial.coins).toHaveLength(2); expect(fillSize(partial.meter)).toBe(1)
  const cell = partial.meter.cells[0]
  if (vertical) {
    expect(cell.y + cell.height).toBeCloseTo(192.5, 8); expect(cell.width).toBe(8)
  } else {
    expect(cell.x).toBe(7.5); expect(cell.height).toBe(8)
  }
  expect(partial.meter.full).toBe(false); expect(partial.gate).toBe(420)
  await page.screenshot({ path: info.outputPath('coin-meter-partial.png') })
  await page.keyboard.press('Escape'); await page.clock.runFor(1000)
  expect(await state(page)).toEqual(partial)
  await page.getByRole('button', { name: 'Resume', exact: true }).click()
  await page.keyboard.down('d')
  for (let i = 0; i < 160 && !(await state(page)).meter.full; i++) await page.clock.runFor(16)
  await page.keyboard.up('d'); await page.clock.runFor(1500)
  const full = await state(page)
  expect(full.coins).toHaveLength(0); expect(full.meter.cells).toHaveLength(3); expect(full.meter.full).toBe(true); expect(full.gate).toBe(240)
  await page.screenshot({ path: info.outputPath('coin-switch-active.png') })
  await restartFromPause(page); await page.clock.runFor(64)
  const reset = await state(page)
  expect(reset.coins).toHaveLength(3); expect(reset.meter).toEqual(ready.meter); expect(reset.gate).toBe(420)
})

test('Coin is visible in the toolbox; coins and switches place, edit, undo, save and reopen', async ({ page }, info) => {
  await open(page, true)
  const canvas = page.getByRole('application', { name: 'Level canvas' })
  const selected = page.getByRole('combobox', { name: 'Selected object' })
  const coin = page.getByRole('button', { name: 'Coin', exact: true })
  await expect(coin).toBeVisible(); await expect(page.getByRole('heading', { name: 'Collectibles', exact: true })).toBeVisible()
  const collectibles = page.locator('.builder-tool-group').filter({ has: page.getByRole('heading', { name: 'Collectibles', exact: true }) })
  await expect(collectibles.getByRole('button', { name: 'Stopwatch', exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Power-ups', exact: true })).toHaveCount(0)
  await coin.click(); await canvas.click({ position: { x: 240, y: 250 } }); await page.clock.runFor(32)
  await expect(selected).toHaveAttribute('data-value', 'pickup:3')
  await expect(selected).toHaveText('Coin 4')
  await page.getByRole('button', { name: 'Duplicate', exact: true }).click()
  await expect(selected).toHaveAttribute('data-value', 'pickup:4')
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await selected.click()
  await expect(page.getByRole('listbox').locator('[role=option][data-value="pickup:4"]')).toHaveCount(0)
  await selected.press('Escape')
  await page.getByRole('button', { name: 'Coin switch', exact: true }).click()
  await canvas.click({ position: { x: 300, y: 160 } }); await page.clock.runFor(32)
  await expect(selected).toHaveAttribute('data-value', 'trigger:1')
  await expect(page.getByRole('button', { name: /Place on surface/ })).toHaveCount(0)
  const threshold = page.getByRole('spinbutton', { name: 'Coins required', exact: true })
  await threshold.fill('4'); await threshold.press('Enter')
  const connection = page.getByRole('checkbox', { name: 'Gate 1', exact: true })
  await connection.uncheck(); await connection.check()
  await expect(threshold).toHaveValue('4')
  await selectBuilderOption(page, 'Coin switch display', 'bar')
  const orientation = page.getByRole('combobox', { name: 'Coin switch orientation', exact: true })
  await selectBuilderOption(page, 'Coin switch orientation', 'vertical')
  const height = page.getByRole('spinbutton', { name: 'Object h', exact: true })
  await expect(height).toHaveValue('120')
  await expect(page.getByRole('spinbutton', { name: 'Object w', exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await selectBuilderObject(page, 'trigger:1'); await expect(orientation).toHaveAttribute('data-value', 'horizontal')
  await page.getByRole('button', { name: 'Redo', exact: true }).click()
  await selectBuilderObject(page, 'trigger:1'); await expect(orientation).toHaveAttribute('data-value', 'vertical')
  await height.fill('160'); await height.press('Enter')
  await page.clock.runFor(32)
  await page.screenshot({ path: info.outputPath('coin-switch-inspector.png') })
  const saved = await saveTestLevel(page)
  expect(saved.level.pickups).toHaveLength(4)
  expect(saved.level.triggers[1]).toMatchObject({ mode: 'coins', threshold: 4, targets: ['gate'], orientation: 'vertical', w: 20, h: 160 })
  await reopenTestLevel(page, saved); await selectBuilderObject(page, 'trigger:1')
  await expect(threshold).toHaveValue('4'); await expect(connection).toBeChecked()
  await expect(orientation).toHaveAttribute('data-value', 'vertical'); await expect(height).toHaveValue('160')
})
