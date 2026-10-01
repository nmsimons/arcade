import { test, expect } from './helpers/test.mjs'
import { useLevelFixtures } from './helpers/jumpingLevels.mjs'
import { readLevelAsset } from '../helpers/jumping-fixtures.mjs'
import { lineBlocked } from '../../src/games/jumping/geometry.ts'

for (const transfer of [false, true]) test(`${transfer ? 'rope to window transfer' : 'climbing beside an open gate'} keeps the rendered rope clear`, async ({ page }, info) => {
  const level = readLevelAsset(transfer ? 'rope-window-transfer.json' : 'rope-window-gate.json')
  await useLevelFixtures(page, [level])
  const errors = []; page.on('pageerror', e => errors.push(e.message))
  await page.clock.install({ time: new Date('2026-01-01T00:00:00Z') })
  await page.addInitScript(() => {
    const proto = CanvasRenderingContext2D.prototype
    const begin = proto.beginPath, move = proto.moveTo, line = proto.lineTo, stroke = proto.stroke, rect = proto.roundRect, clear = proto.clearRect
    proto.beginPath = function (...args) { this.ropeTestPath = []; return begin.apply(this, args) }
    proto.moveTo = function (x, y) { this.ropeTestPath?.push([x, y]); return move.call(this, x, y) }
    proto.lineTo = function (x, y) { this.ropeTestPath?.push([x, y]); return line.call(this, x, y) }
    proto.clearRect = function (...args) { this.canvas.ropeTestGates = []; return clear.apply(this, args) }
    proto.roundRect = function (x, y, w, h, ...rest) {
      if (this.fillStyle === '#8f9e98' && w === 20 && h === 100) (this.canvas.ropeTestGates ??= []).push({ x, y, w, h })
      return rect.call(this, x, y, w, h, ...rest)
    }
    proto.stroke = function (...args) {
      if (this.strokeStyle === '#998263' && this.ropeTestPath?.length > 2) {
        const frames = this.canvas.ropeTestFrames ??= []
        frames.push({ path: this.ropeTestPath, gates: this.canvas.ropeTestGates?.slice(-2) ?? [] })
      }
      return stroke.apply(this, args)
    }
  })
  await page.goto('/untitled-jumping-game?motionDebug=1')
  await expect(page.locator('.jumping-level-card[aria-pressed=true]')).toBeVisible()
  await page.clock.pauseAt(new Date('2026-01-01T01:00:00Z'))
  await page.locator('.jumping-level-card[aria-pressed=true]').click()
  const canvas = page.getByRole('img', { name: `${level.name}: reach the exit` })
  await expect(canvas).toBeFocused()
  await page.keyboard.down('Shift')
  if (transfer) {
    await page.keyboard.down('d'); await page.clock.runFor(65); await page.keyboard.up('d')
    await page.keyboard.up('Shift'); await page.clock.runFor(1250)
  } else {
    await page.keyboard.down('a'); await page.keyboard.down('ArrowDown')
    await page.clock.runFor(1350)
    await page.keyboard.up('a'); await page.keyboard.up('ArrowDown'); await page.keyboard.up('Shift')
  }
  await canvas.evaluate(c => { c.ropeTestFrames = [] })
  await page.keyboard.down('ArrowUp')
  if (transfer) await page.keyboard.down('d')
  await page.clock.runFor(transfer ? 1900 : 4000)
  if (transfer) { await page.keyboard.up('ArrowUp'); await page.keyboard.up('d') }
  const samples = (await page.evaluate(() => window.jumpingMotion.read())).recent
  expect(samples.some(s => s.signals.mode === 'rope')).toBe(true)
  if (transfer) {
    expect(samples.some(s => s.signals.mode === 'hang' || s.signals.mode === 'mantle')).toBe(true)
    expect(samples.some(s => s.signals.grounded && s.y === 560 && s.x >= 360)).toBe(true)
  } else expect(samples.at(-1).y).toBeLessThan(level.spawn.y - 100)
  const frames = await canvas.evaluate(c => c.ropeTestFrames)
  expect(frames.length).toBeGreaterThan(50)
  for (const [i, { path, gates }] of frames.entries()) {
    expect(gates.length).toBe(2)
    expect(gates[1].y).toBe(level.mechanisms[1].y - 100)
    for (let j = 2; j < path.length; j++) expect(lineBlocked(path[j - 1], path[j], [...level.platforms, ...gates]), `frame ${i}, span ${j}`).toBe(false)
  }
  await page.screenshot({ path: info.outputPath(transfer ? 'window-transfer.png' : 'loaded-rope-gate.png') })
  await page.keyboard.up('ArrowUp'); if (transfer) await page.keyboard.up('d')
  expect(errors).toEqual([])
})
