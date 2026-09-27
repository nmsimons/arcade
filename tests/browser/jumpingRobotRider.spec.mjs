import { test, expect } from './helpers/test.mjs'
import { blankTrial } from '../../src/games/jumping/level.ts'
import { restartFromPause, useLevelFixtures } from './helpers/jumpingLevels.mjs'

test('the player stands on the plain bot body and falls off its charge without a launch', async ({ page }, info) => {
  const level = { ...blankTrial(), name: 'Bot rider', width: 1200, height: 600, floor: 600,
    spawn: { x: 539, y: 500 }, goal: { x: 1040, y: 600 }, platforms: [{ x: 300, y: 500, w: 240, h: 100 }],
    robots: [{ x: 600, y: 600, left: 100, right: 1000 }] }
  await useLevelFixtures(page, [level])
  await page.clock.install({ time: new Date('2026-01-01T00:00:00Z') })
  await page.addInitScript(() => {
    const proto = CanvasRenderingContext2D.prototype, rect = proto.fillRect, ellipse = proto.ellipse, arc = proto.arc
    proto.fillRect = function (...args) {
      if (args[0] === 0 && args[1] === 0 && this.fillStyle === '#f1f1ed') this.canvas.riderCamera = this.getTransform()
      return rect.apply(this, args)
    }
    proto.ellipse = function (...args) {
      if (args[2] === 6.2 && args[3] === 6.2 && this.canvas.riderCamera) {
        const t = this.canvas.riderCamera.inverse().multiply(this.getTransform())
        this.canvas.rider = { x: t.e, y: t.f }
      }
      return ellipse.apply(this, args)
    }
    proto.arc = function (...args) {
      if (args[2] === 9 && this.fillStyle === '#68736e' && this.canvas.riderCamera) {
        const t = this.canvas.riderCamera.inverse().multiply(this.getTransform())
        this.canvas.bot = { x: t.e, y: t.f }
      }
      return arc.apply(this, args)
    }
  })
  await page.goto('/untitled-jumping-game')
  await page.locator('.jumping-level-card[aria-pressed=true]').waitFor()
  await page.clock.pauseAt(new Date('2026-01-01T01:00:00Z'))
  await page.locator('.jumping-level-card[aria-pressed=true]').click()
  const canvas = page.getByRole('img', { name: 'Bot rider: activate the goal' })
  await expect(canvas).toBeFocused()
  const state = () => canvas.evaluate(c => ({ player: c.rider, bot: c.bot }))
  await page.clock.runFor(64)
  // Step off the ledge onto the bot. Move across its roof while it is blocked
  // by the ledge, then let its next charge carry it away to the right.
  await page.keyboard.down('d'); await page.clock.runFor(120); await page.keyboard.up('d'); await page.clock.runFor(250)
  expect((await state()).player.y).toBeCloseTo(554, 1)
  await page.keyboard.down('s'); await page.keyboard.down('d'); await page.clock.runFor(140)
  await page.keyboard.up('d'); await page.keyboard.up('s'); await page.clock.runFor(650)
  const standing = await state()
  expect(standing.player.x - standing.bot.x).toBeGreaterThan(0)
  expect(standing.player.x - standing.bot.x).toBeLessThan(20)
  expect(standing.player.y).toBeCloseTo(554, 1)
  await page.screenshot({ path: info.outputPath('standing-on-bot.png') })
  await page.clock.runFor(200)
  const windup = await state()
  expect(windup.player.y).toBeCloseTo(561, 1)
  await page.clock.runFor(300)
  const falling = await state()
  expect(falling.bot.x).toBeGreaterThan(falling.player.x + 45)
  expect(falling.player.x).toBeLessThan(standing.player.x + 25)
  expect(falling.player.y).toBeGreaterThan(554)
  await page.screenshot({ path: info.outputPath('falling-behind-bot.png') })
  await page.clock.runFor(200)
  expect((await state()).player.y).toBeCloseTo(600, 1)
  await restartFromPause(page); await page.clock.runFor(64)
  expect((await state()).player.y).toBeCloseTo(500, 1)
})
