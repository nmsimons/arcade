import { test, expect } from './helpers/test.mjs'
import { blankTrial } from '../../src/games/jumping/level.ts'
import { restartFromPause, useLevelFixtures } from './helpers/jumpingLevels.mjs'

function fixture(horizontal) {
  const level = blankTrial(); level.id = 'mounted-plate-playtest'; level.name = 'Mounted plate'
  level.spawn.x = 170
  level.mechanisms = [
    { id: 'carrier', kind: 'lift', x: 260, y: 900, w: 240, h: 20, travel: 240, ...(horizontal ? { orientation: 'horizontal', flipX: true } : {}) },
    { id: 'gate', kind: 'gate', x: 1300, y: 740, w: 20, h: 180, travel: 180, switchLogic: 'and' },
  ]
  level.wallLights = [{ id: 'indicator', x: 600, y: 300, relay: true, switchLogic: 'xor', targets: ['gate'] }]
  level.triggers = [{ mode: 'weight', x: 280, y: 900, w: 160, mount: { mechanism: 'carrier', x: 20 }, targets: ['carrier', 'indicator'] }]
  return level
}

for (const horizontal of [false, true]) test(`normal controls load a mounted plate on a moving ${horizontal ? 'platform' : 'elevator'} and drive a wall-light relay`, async ({ page }, info) => {
  await useLevelFixtures(page, [fixture(horizontal)])
  await page.clock.install({ time: new Date('2026-01-01T00:00:00Z') })
  await page.addInitScript(() => {
    const proto = CanvasRenderingContext2D.prototype, rect = proto.fillRect, arc = proto.arc, rounded = proto.roundRect
    proto.fillRect = function (...args) {
      if (args[2] === 166 && args[3] === 3 && this.fillStyle === '#738575') this.canvas.mountPosition = { x: args[0] + 3, y: args[1] + 3 }
      if (args[2] === 160 && args[3] === 3 && ['#9bb878', '#c4a66b'].includes(this.fillStyle)) this.canvas.mountActive = this.fillStyle === '#9bb878'
      return rect.apply(this, args)
    }
    proto.arc = function (...args) {
      if (args[0] === 600 && args[1] === 300 && args[2] === 11) this.canvas.wallFace = this.fillStyle
      if (args[0] === 600 && args[1] === 300 && args[2] === 14) this.canvas.wallRim = this.fillStyle
      return arc.apply(this, args)
    }
    proto.roundRect = function (...args) {
      if (args[0] === 1300 && args[2] === 20 && args[3] === 180) this.canvas.gateY = args[1]
      return rounded.apply(this, args)
    }
  })
  await page.goto('/untitled-jumping-game')
  await page.locator('.jumping-level-card[aria-pressed=true]').waitFor()
  await page.clock.pauseAt(new Date('2026-01-01T01:00:00Z'))
  await page.locator('.jumping-level-card[aria-pressed=true]').click()
  const canvas = page.getByRole('img', { name: 'Mounted plate: reach the exit' })
  await expect(canvas).toBeFocused(); await page.clock.runFor(64)
  const state = () => canvas.evaluate(c => ({ plate: c.mountPosition, active: c.mountActive, face: c.wallFace, rim: c.wallRim, gate: c.gateY }))
  const initial = await state()
  expect(initial).toEqual({ plate: { x: 280, y: 900 }, active: false, face: '#9aa38e', rim: '#738575', gate: 740 })
  await page.keyboard.down('d')
  await page.clock.runFor(200)
  // Walk during takeoff so the immediate jump lands on the mounted plate.
  await page.keyboard.down('Shift')
  await page.keyboard.down('Space'); await page.clock.runFor(100); await page.keyboard.up('Space')
  for (let i = 0; i < 120 && !(await state()).active; i++) await page.clock.runFor(16)
  await page.keyboard.up('d')
  await page.keyboard.up('Shift')
  await page.clock.runFor(400)
  const loaded = await state()
  expect(loaded.active).toBe(true); expect(loaded.face).toBe('#a9d56b'); expect(loaded.rim).toBe('#738575')
  expect(loaded.plate).not.toEqual(initial.plate); expect(loaded.gate).toBeLessThan(initial.gate)
  await page.clock.runFor(400)
  expect((await state()).active).toBe(true)
  await page.screenshot({ path: info.outputPath('mounted-plate-wall-relay.png') })
  await restartFromPause(page); await page.clock.runFor(64)
  expect(await state()).toEqual(initial)
})
