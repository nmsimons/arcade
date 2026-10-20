import { installAthleteHeadObserver } from './helpers/athleteHead.mjs'
import { test, expect } from './helpers/test.mjs'
import { blankTrial } from '../../src/games/jumping/level.ts'
import { finishJumpingEntrance, restartFromPause, useLevelFixtures } from './helpers/jumpingLevels.mjs'

test('contact turns the bot toward its rider, who can stand, crouch and jump from its body', async ({ page }, info) => {
  const level = { ...blankTrial(), name: 'Bot rider', width: 1200, height: 600, floor: 600,
    entrance: { x: 520, y: 500 }, goal: { x: 1040, y: 600 }, platforms: [{ x: 300, y: 500, w: 240, h: 100 }],
    robots: [{ x: 600, y: 600, left: 100, right: 1000 }] }
  await useLevelFixtures(page, [level])
  await page.clock.install({ time: new Date('2026-01-01T00:00:00Z') })
  await installAthleteHeadObserver(page)
  await page.addInitScript(() => {
    const proto = CanvasRenderingContext2D.prototype, rect = proto.fillRect, arc = proto.arc
    proto.fillRect = function (...args) {
      if (args[0] === 0 && args[1] === 0 && this.fillStyle === '#f1f1ed') this.canvas.riderCamera = this.getTransform()
      if (args[2] === 5 && args[3] === 5 && ['#94433f', '#a5b3a7'].includes(this.fillStyle)) {
        this.canvas.botEye = this.fillStyle
        this.canvas.botFacing = Math.sign(this.getTransform().a)
        if (this.canvas.riderCamera) {
          const t = this.canvas.riderCamera.inverse().multiply(this.getTransform())
          this.canvas.botRoof = t.transformPoint({ x: 0, y: args[1] - 10 }).y
        }
      }
      return rect.apply(this, args)
    }
    window.addEventListener('jumping-athlete-head', ({ detail: { canvas, body } }) => {
      if (canvas.riderCamera) {
        const t = canvas.riderCamera.inverse().multiply(body)
        canvas.rider = { x: t.e, y: t.f }
      }
    })
    proto.arc = function (...args) {
      if (args[2] === 9 && this.fillStyle === '#68736e' && this.canvas.riderCamera) {
        const t = this.canvas.riderCamera.inverse().multiply(this.getTransform())
        this.canvas.bot = { x: t.e, y: t.f }
      }
      return arc.apply(this, args)
    }
  })
  await page.goto('/lab?motionDebug=1')
  await page.locator('.jumping-level-card[aria-pressed=true]').waitFor()
  await page.clock.pauseAt(new Date('2026-01-01T01:00:00Z'))
  await page.locator('.jumping-level-card[aria-pressed=true]').click(); await finishJumpingEntrance(page)
  const canvas = page.getByRole('img', { name: 'Bot rider: reach the exit' })
  await expect(canvas).toBeFocused()
  const state = () => canvas.evaluate(c => ({ player: c.rider, bot: c.bot, eye: c.botEye, facing: c.botFacing, roof: c.botRoof }))
  const expectSupported = async () => {
    const sample = await page.evaluate(() => window.jumpingMotion.read().recent.at(-1))
    expect(sample.signals.grounded).toBe(true)
    expect(sample.signals.support).toBe('robot:0:0')
    const pose = await state()
    expect(pose.player.y).toBeCloseTo(pose.roof, 1)
    expect(Math.abs(pose.player.x - pose.bot.x)).toBeLessThan(24)
  }
  await page.clock.runFor(64)
  // Step off the ledge onto the bot, then cross its roof while it is blocked.
  // Roof contact turns the bot toward its rider and keeps it reacting.
  await page.keyboard.down('d'); await page.clock.runFor(120); await page.keyboard.up('d'); await page.clock.runFor(500)
  await info.attach('boarding', { body: JSON.stringify(await state()), contentType: 'application/json' })
  await expectSupported()
  await page.keyboard.down('s'); await page.keyboard.down('d'); await page.clock.runFor(140)
  await page.keyboard.up('d'); await page.keyboard.up('s'); await page.clock.runFor(650)
  const standing = await state()
  expect(standing.player.x - standing.bot.x).toBeLessThan(0)
  expect(standing.player.x - standing.bot.x).toBeGreaterThan(-24)
  expect(standing.player.y).toBeCloseTo(554, 1)
  expect(standing.facing).toBe(-1)
  expect(standing.eye).toBe('#94433f')
  await page.screenshot({ path: info.outputPath('standing-on-bot.png') })
  await page.clock.runFor(500)
  // Continued reactions can turn it either way or lower the windup roof.
  // The rider must keep contact with the currently rendered chassis.
  await expectSupported()
  await page.keyboard.down('s'); await page.clock.runFor(200); await page.keyboard.up('s')
  await expectSupported()
  await page.keyboard.down('Space'); await page.clock.runFor(100); await page.keyboard.up('Space')
  await page.clock.runFor(128)
  expect((await state()).player.y).toBeLessThan(544)
  await page.screenshot({ path: info.outputPath('jumping-from-bot.png') })
  await restartFromPause(page); await page.clock.runFor(64)
  expect((await state()).player.y).toBeCloseTo(500, 1)
})
