import { test, expect } from './helpers/test.mjs'
import { useLevelFixtures } from './helpers/jumpingLevels.mjs'
import { blankTrial, levelProblems } from '../../src/games/jumping/level.ts'
import { writeFile } from 'node:fs/promises'

const sizes = [{ width: 320, height: 740 }, { width: 390, height: 844 }, { width: 844, height: 390 }, { width: 1280, height: 800 }]
async function open(page, level, size) {
  await page.setViewportSize(size)
  expect(levelProblems(level), 'the camera scenario must be a playable level').toEqual([])
  await useLevelFixtures(page, [level])
  await page.addInitScript(() => {
    const fill = CanvasRenderingContext2D.prototype.fillRect
    CanvasRenderingContext2D.prototype.fillRect = function (...args) {
      if (args[0] === 0 && args[1] === 0 && this.fillStyle === '#f1f1ed' && this.canvas.matches('.jumping-game > canvas')) {
        const t = this.getTransform(), rect = this.canvas.getBoundingClientRect(), ratio = this.canvas.width / rect.width
        const c = { time: performance.now(), x: -t.e / t.a, y: -t.f / t.d, zoom: t.a / ratio }
        window.cameraFrames ??= []
        if (window.cameraFrames.at(-1)?.time === c.time) window.cameraFrames[window.cameraFrames.length - 1] = c
        else window.cameraFrames.push(c)
      }
      return fill.apply(this, args)
    }
  })
  await page.clock.install({ time: new Date('2026-01-01T00:00:00Z') })
  await page.goto('/untitled-jumping-game?motionDebug=1')
  await expect(page.locator('.jumping-level-card[aria-pressed=true]')).toBeVisible()
  await page.clock.pauseAt(new Date('2026-01-01T01:00:00Z'))
  await page.locator('.jumping-level-card[aria-pressed=true]').click()
  await expect(page.locator('canvas')).toBeFocused()
  await page.clock.runFor(64)
}
const read = page => page.evaluate(() => ({ camera: window.cameraFrames.at(-1), frames: window.cameraFrames, motion: window.jumpingMotion.read() }))

for (const size of sizes) for (const night of [false, true]) test(`running held jump shows destination before takeoff and frames the full turn at ${size.width}x${size.height} ${night ? 'night' : 'day'}`, async ({ page }, info) => {
  const level = { ...blankTrial(), version: 2, width: 4000, height: 1000, floor: 1000, spawn: { x: 1500, y: 600 }, goal: { x: 3800, y: 1000 },
    platforms: [{ x: 0, y: 600, w: 1780, h: 400 }, { x: 2030, y: 600, w: 450, h: 400 }],
    lighting: { nightMode: night, ambient: 35, lights: [] } }
  await open(page, level, size)
  const still = await read(page)
  expect(62 * still.camera.zoom).toBeGreaterThanOrEqual(37)
  await page.keyboard.down('d'); await page.clock.runFor(400)
  const before = await read(page), p = before.motion.recent.at(-1), c = before.camera
  expect(p.vx).toBe(410)
  expect((2030 - c.x) * c.zoom).toBeLessThanOrEqual(size.width - 24 * c.zoom)
  expect((600 - c.y) * c.zoom).toBeGreaterThan(16)
  expect((600 - c.y) * c.zoom).toBeLessThan(size.height - 16)
  const approach = info.outputPath('approach-framing.json')
  await writeFile(approach, JSON.stringify({ player: { x: p.x, y: p.y, vx: p.vx }, camera: c, ahead: c.x + size.width / c.zoom - p.x, destinationDistance: 2030 - p.x, groundStopDistance: 30 }, null, 2))
  await info.attach('approach-framing', { path: approach, contentType: 'application/json' })
  await page.screenshot({ path: info.outputPath('before-commitment.png') })
  await page.keyboard.down('Space'); await page.clock.runFor(180); await page.keyboard.up('Space')
  await page.clock.runFor(440)
  await page.screenshot({ path: info.outputPath('held-apex.png') })
  await page.clock.runFor(540)
  const landed = await read(page), final = landed.motion.recent.at(-1)
  expect(final.signals.grounded).toBe(true); expect(final.y).toBe(600); expect(final.x).toBeGreaterThan(2030)
  await page.keyboard.up('d'); await page.keyboard.down('a'); await page.clock.runFor(500)
  await page.screenshot({ path: info.outputPath('after-reversal.png') })
  await page.keyboard.up('a'); await page.clock.runFor(640)
  const result = await read(page), last = result.motion.recent.at(-1)
  expect(Math.abs(last.vx)).toBeLessThan(1)
  expect(Math.abs((last.x - result.camera.x) * result.camera.zoom - size.width / 2)).toBeLessThan(1)
  for (let i = 1; i < result.frames.length; i++) {
    const a = result.frames[i - 1], b = result.frames[i]
    expect(Math.abs(b.x - a.x) * b.zoom).toBeLessThan(13)
  }
  expect(result.motion.reports).toEqual([])
  const trajectory = info.outputPath('camera-trajectory.json')
  await writeFile(trajectory, JSON.stringify(result.frames))
  await info.attach('camera-trajectory', { path: trajectory, contentType: 'application/json' })
})

test('portrait short-room framing remains still through a real gravity reversal and the ceiling contact stays clear', async ({ page }, info) => {
  const size = { width: 390, height: 844 }, level = { ...blankTrial(), version: 2, width: 1400, height: 600, floor: 600, spawn: { x: 600, y: 600 }, goal: { x: 1200, y: 600 },
    lighting: { nightMode: false, ambient: 100, lights: [] },
    gravityPlates: [{ id: 'reverse', x: 0, y: 0, w: 1400, h: 600, gravity: -1, power: 'always' }] }
  await open(page, level, size)
  await page.keyboard.down('d'); await page.clock.runFor(16); await page.keyboard.up('d')
  await page.clock.runFor(1500)
  const result = await read(page), p = result.motion.recent.at(-1), ys = result.frames.map(c => c.y)
  expect(p.signals.inverted).toBe(true); expect(p.signals.grounded).toBe(true); expect(Math.abs(p.y)).toBe(0)
  expect(Math.max(...ys) - Math.min(...ys)).toBeLessThan(.01)
  const top = -result.camera.y * result.camera.zoom, bottom = size.height - (600 - result.camera.y) * result.camera.zoom
  expect(Math.abs(top - bottom)).toBeLessThan(.01)
  expect(top).toBeGreaterThan(32)
  await page.screenshot({ path: info.outputPath('portrait-inverted-support.png') })
})
