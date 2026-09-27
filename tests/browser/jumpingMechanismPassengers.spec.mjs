import { test, expect } from './helpers/test.mjs'
import { blankTrial } from '../../src/games/jumping/level.ts'
import { useLevelFixtures } from './helpers/jumpingLevels.mjs'

for (const kind of ['gate', 'lift']) test(`a horizontal ${kind} slides out from under a crate blocked by an overhang`, async ({ page }, info) => {
  const name = `Unloading ${kind}`, level = { ...blankTrial(), name,
    spawn: { x: 100, y: 920 },
    platforms: [{ x: 820, y: 600, w: 20, h: 80 }],
    props: [{ kind: 'box', x: 740, y: 700, size: 60 }],
    mechanisms: [{ id: 'carrier', kind, orientation: 'horizontal', flipX: true, x: 700, y: 700, w: 160, h: 20, travel: 300 }],
    triggers: [{ mode: 'touch', x: 50, y: 920, w: 100, targets: ['carrier'] }],
  }
  await useLevelFixtures(page, [level])
  await page.clock.install({ time: new Date('2026-01-01T00:00:00Z') })
  await page.addInitScript(() => {
    const proto = CanvasRenderingContext2D.prototype, fillRect = proto.fillRect, roundRect = proto.roundRect
    proto.fillRect = function (...args) {
      if (args[0] === 0 && args[1] === 0 && this.fillStyle === '#f1f1ed') this.canvas.passengerCamera = this.getTransform().inverse()
      return fillRect.apply(this, args)
    }
    proto.roundRect = function (...args) {
      if (this.canvas.passengerCamera) {
        const transform = this.canvas.passengerCamera.multiply(this.getTransform())
        if (args[2] === 160 && args[3] === 20 && ['#b3a28d', '#8f9e98'].includes(this.fillStyle)) {
          this.canvas.carrier = transform.transformPoint(new DOMPoint(args[0], args[1])).toJSON()
        }
        if (args[2] === 60 && args[3] === 60 && this.fillStyle === '#b3a28d') {
          const center = transform.transformPoint(new DOMPoint(args[0] + 30, args[1] + 30))
          this.canvas.cargo = { x: center.x, y: center.y + 30 }
        }
      }
      return roundRect.apply(this, args)
    }
  })
  await page.goto('/untitled-jumping-game')
  await page.locator('.jumping-level-card[aria-pressed=true]').waitFor()
  await page.clock.pauseAt(new Date('2026-01-01T01:00:00Z'))
  await page.locator('.jumping-level-card[aria-pressed=true]').click()
  const canvas = page.getByRole('img', { name: `${name}: activate the goal` })
  await expect(canvas).toBeFocused()
  await page.keyboard.down('s'); await page.clock.runFor(100); await page.keyboard.up('s')
  await page.clock.runFor(1100)
  const blocked = await canvas.evaluate(c => ({ carrier: c.carrier, cargo: c.cargo }))
  expect(blocked.cargo.x).toBeLessThanOrEqual(790.1)
  await page.clock.runFor(2400)
  const released = await canvas.evaluate(c => ({ carrier: c.carrier, cargo: c.cargo }))
  expect(released.carrier.x).toBeCloseTo(kind === 'gate' ? 860 : 1000, 1)
  expect(released.carrier.y).toBeCloseTo(700, 1)
  expect(released.cargo.y).toBeGreaterThan(850)
  expect(released.cargo.x).toBeLessThan(released.carrier.x - 30)
  await page.screenshot({ path: info.outputPath('unloaded-crate.png') })
})
