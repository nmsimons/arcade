import { test, expect } from './helpers/test.mjs'
import { blankTrial, levelProblems } from '../../src/games/jumping/level.ts'
import { useLevelFixtures } from './helpers/jumpingLevels.mjs'

async function openSightLevel(page, level) {
  expect(levelProblems(level)).toEqual([])
  await useLevelFixtures(page, [level])
  await page.clock.install({ time: new Date('2026-01-01T00:00:00Z') })
  await page.addInitScript(() => {
    const proto = CanvasRenderingContext2D.prototype, rect = proto.fillRect
    proto.fillRect = function (...args) {
      if (args[0] === 0 && args[1] === 0 && this.fillStyle === '#f1f1ed') this.canvas.sightCamera = this.getTransform()
      if (args[2] === 5 && args[3] === 5 && ['#94433f', '#a5b3a7'].includes(this.fillStyle)) {
        this.canvas.botEye = this.fillStyle
        this.canvas.botX = this.canvas.sightCamera.inverse().multiply(this.getTransform()).e
      }
      return rect.apply(this, args)
    }
  })
  await page.goto('/untitled-jumping-game')
  await page.locator('.jumping-level-card[aria-pressed=true]').waitFor()
  await page.clock.pauseAt(new Date('2026-01-01T01:00:00Z'))
  await page.locator('.jumping-level-card[aria-pressed=true]').click()
  const canvas = page.getByRole('img', { name: `${level.name}: reach the exit` })
  await expect(canvas).toBeFocused(); await page.clock.runFor(64)
  return canvas
}

test('a player behind the bot is unseen until its patrol turns toward them', async ({ page }, info) => {
  const level = { ...blankTrial(), name: 'Forward sight', width: 1400, height: 600, floor: 600,
    spawn: { x: 800, y: 600 }, goal: { x: 1240, y: 600 },
    robots: [{ x: 400, y: 600, left: 300, right: 1000 }] }
  const canvas = await openSightLevel(page, level)
  const state = () => canvas.evaluate(c => ({ eye: c.botEye, x: c.botX }))
  expect((await state()).eye).toBe('#a5b3a7')
  await page.keyboard.down('w'); await page.clock.runFor(500); await page.keyboard.up('w')
  const unseen = await state()
  expect(unseen.eye).toBe('#a5b3a7'); expect(unseen.x).toBeLessThan(400)
  await page.screenshot({ path: info.outputPath('player-behind-bot-unseen.png') })
  await page.clock.runFor(900)
  const seen = await state()
  expect(seen.eye).toBe('#94433f'); expect(seen.x).toBeGreaterThan(unseen.x)
  await page.screenshot({ path: info.outputPath('patrol-turn-reveals-player.png') })
})

test('a gate hides the player, opening reveals them, and closing restores the calm eye', async ({ page }, info) => {
  const level = { ...blankTrial(), name: 'Bot sight', width: 1400, height: 600, floor: 600,
    spawn: { x: 820, y: 500 }, goal: { x: 1240, y: 600 },
    platforms: [{ x: 100, y: 500, w: 380, h: 100 }, { x: 700, y: 500, w: 400, h: 100 }],
    robots: [{ x: 300, y: 500, left: 100, right: 1250 }],
    mechanisms: [{ id: 'cover', kind: 'gate', x: 580, y: 300, w: 40, h: 200, travel: 240 }],
    triggers: [{ x: 790, y: 500, w: 60, mode: 'touch', target: 'cover' }] }
  const canvas = await openSightLevel(page, level)
  const eye = () => canvas.evaluate(c => c.botEye)
  expect(await eye()).toBe('#a5b3a7')
  // Up starts time on the pressure plate. Let the patrol turn toward the player.
  await page.keyboard.down('w'); await page.clock.runFor(2600); await page.keyboard.up('w')
  expect(await eye()).toBe('#94433f')
  await page.screenshot({ path: info.outputPath('gate-open-bot-sees-player.png') })
  await page.keyboard.down('d'); await page.clock.runFor(300); await page.keyboard.up('d')
  // The gap keeps the bot on its side while the gate completes its slow close.
  await page.clock.runFor(3000)
  expect(await eye()).toBe('#a5b3a7')
  expect(await canvas.evaluate(c => c.botX)).toBeLessThan(480)
  await page.screenshot({ path: info.outputPath('gate-closed-player-hidden.png') })
})
