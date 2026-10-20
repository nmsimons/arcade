import { test, expect } from './helpers/test.mjs'
import { finishJumpingEntrance, useLevelFixtures } from './helpers/jumpingLevels.mjs'
import { readLevelAsset } from '../helpers/jumping-fixtures.mjs'

test('pushing a ball over the ledge keeps every rendered rope frame stable', async ({ page }, info) => {
  const level = readLevelAsset('rope-ball-ledge.json')
  await useLevelFixtures(page, [level])
  const errors = []; page.on('pageerror', error => errors.push(error.message))
  await page.clock.install({ time: new Date('2026-01-01T00:00:00Z') })
  await page.addInitScript(() => {
    const proto = CanvasRenderingContext2D.prototype
    const begin = proto.beginPath, move = proto.moveTo, line = proto.lineTo, stroke = proto.stroke, arc = proto.arc
    proto.beginPath = function (...args) { this.ropePropPath = []; return begin.apply(this, args) }
    proto.moveTo = function (x, y) { this.ropePropPath?.push([x, y]); return move.call(this, x, y) }
    proto.lineTo = function (x, y) { this.ropePropPath?.push([x, y]); return line.call(this, x, y) }
    proto.stroke = function (...args) {
      if (this.strokeStyle === '#998263' && this.ropePropPath?.length > 2) (this.canvas.ropePropFrames ??= []).push(this.ropePropPath)
      return stroke.apply(this, args)
    }
    proto.arc = function (x, y, radius, ...args) {
      if (this.fillStyle === '#8f9e98' && radius === 34) (this.canvas.ropePropBalls ??= []).push({ x, y: y + radius })
      return arc.call(this, x, y, radius, ...args)
    }
  })
  await page.goto('/lab')
  await expect(page.locator('.jumping-level-card[aria-pressed=true]')).toBeVisible()
  await page.clock.pauseAt(new Date('2026-01-01T01:00:00Z'))
  await page.locator('.jumping-level-card[aria-pressed=true]').click()
  await finishJumpingEntrance(page)
  const canvas = page.getByRole('img', { name: `${level.name}: reach the exit` })
  await expect(canvas).toBeFocused()
  await canvas.evaluate(c => { c.ropePropFrames = []; c.ropePropBalls = [] })
  await page.keyboard.down('d'); await page.clock.runFor(940); await page.keyboard.up('d')
  await page.screenshot({ path: info.outputPath('ball-crossing-pin.png') })
  await page.clock.runFor(1200)
  const { frames, balls } = await canvas.evaluate(c => ({ frames: c.ropePropFrames, balls: c.ropePropBalls }))
  expect(frames.length).toBeGreaterThan(100)
  expect(Math.min(...balls.filter(b => Math.abs(b.y - 400) < .1).map(b => Math.abs(b.x - 630)))).toBeLessThan(5)
  expect(balls.at(-1).x).toBeGreaterThan(700)
  expect(balls.at(-1).y).toBeGreaterThan(690)
  let maxLength = 0, maxSpan = 0
  for (const path of frames) {
    expect(path[0]).toEqual([630, 400])
    let length = 0
    for (let i = 1; i < path.length; i++) {
      const span = Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1])
      maxSpan = Math.max(maxSpan, span); length += span
    }
    maxLength = Math.max(maxLength, length)
  }
  expect(maxLength).toBeLessThan(293)
  expect(maxSpan).toBeLessThan(10)
  expect(errors).toEqual([])
})
