import { test, expect } from './helpers/test.mjs'
import { hold, tap } from './helpers/controller.mjs'

async function setup(page, controller = false) {
  await page.clock.install({ time: new Date('2026-01-01T00:00:00Z') })
  await page.addInitScript(controller => {
    if (controller) {
      window.testPad = { index: 1, id: 'Urban Fire controller', mapping: 'standard', connected: true,
        axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) }
      Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => [null, window.testPad] })
    }
    const proto = CanvasRenderingContext2D.prototype
    for (const method of ['fillRect', 'drawImage', 'strokeRect', 'fillText', 'lineTo', 'arc']) {
      const original = proto[method]
      proto[method] = function (...args) {
        if (this.canvas.getAttribute('aria-label') === 'Urban Fire battlefield') {
          if (method === 'fillRect' && args[0] === 0 && args[1] === 0 && args[2] === this.canvas.width && args[3] === this.canvas.height) {
            window.urbanFrame = { width: this.canvas.width, height: this.canvas.height, enemies: [], shots: [], hud: [] }
          }
          const frame = window.urbanFrame
          if (frame) {
            const { a, b, c, d, e, f } = this.getTransform(), transform = { a, b, c, d, e, f }
            if (method === 'drawImage') frame.city = { width: args[0].width, height: args[0].height, transform }
            if (method === 'strokeRect' && args[0] === -9 && args[1] === -4 && args[2] === 6 && args[3] === 8) frame.jeep = transform
            if (method === 'arc' && args[2] === 2.4) frame.enemies.push(transform)
            if (method === 'lineTo' && this.strokeStyle === '#d8f2df') frame.shots.push(args)
            if (method === 'fillText') frame.hud.push({ text: args[0], transform })
          }
        }
        return original.apply(this, args)
      }
    }
  }, controller)
  await page.goto('/urban-fire')
  await expect(page.getByRole('heading', { name: 'Urban Fire', exact: true })).toBeVisible()
  await page.clock.pauseAt(new Date('2026-01-01T01:00:00Z'))
  await page.clock.runFor(32)
}
const frame = async page => { await page.clock.runFor(32); return page.evaluate(() => window.urbanFrame) }
const position = f => ({ x: (f.width / 2 - f.city.transform.e) / f.city.transform.a, y: (f.height / 2 - f.city.transform.f) / f.city.transform.d })
function centered(f) {
  expect(f.jeep.e).toBeCloseTo(f.width / 2, 3); expect(f.jeep.f).toBeCloseTo(f.height / 2, 3)
  expect([f.city.width, f.city.height]).toEqual([1624, 1124])
  for (const h of f.hud) expect(h.transform).toEqual({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 })
}

test('fixed battlefield stays centered while driving, zooming, pausing and resizing', async ({ page }) => {
  await setup(page)
  await page.keyboard.press('Enter')
  const before = await frame(page); centered(before)
  await page.keyboard.down('ArrowUp'); await page.clock.runFor(800); await page.keyboard.up('ArrowUp')
  const moved = await frame(page); centered(moved)
  expect(position(moved).y).toBeLessThan(position(before).y - 35)
  await page.keyboard.press('p'); await expect(page.getByRole('heading', { name: 'PAUSED' })).toBeVisible()
  const frozen = position(await frame(page))
  for (const [width, height, zoom] of [[640, 480, 1], [2560, 1600, 2], [3440, 1440, 1.8], [1280, 800, 1]]) {
    await page.setViewportSize({ width, height })
    await expect(page.locator('canvas')).toHaveAttribute('width', String(width))
    await expect(page.locator('canvas')).toHaveAttribute('height', String(height))
    const output = await frame(page); centered(output)
    expect(output.city.transform.a).toBeCloseTo(zoom, 5)
    expect(position(output).x).toBeCloseTo(frozen.x, 3); expect(position(output).y).toBeCloseTo(frozen.y, 3)
  }
  await page.keyboard.press('p'); await expect(page.getByRole('heading', { name: 'PAUSED' })).toHaveCount(0)
  await page.keyboard.press('Escape'); await expect(page).toHaveURL(/\/$/)
})

test('firing respects the two-shot cap, pause freezes combat, and focus loss pauses', async ({ page }) => {
  await setup(page); await page.getByRole('button', { name: 'Deploy', exact: true }).click()
  for (let i = 0; i < 3; i++) { await page.keyboard.press('Space'); await page.clock.runFor(32) }
  expect((await frame(page)).shots).toHaveLength(2)
  await page.keyboard.press('p'); const before = await frame(page)
  await page.clock.runFor(2000)
  const after = await frame(page)
  expect(after.shots).toEqual(before.shots); expect(after.enemies).toEqual(before.enemies)
  await page.getByRole('button', { name: 'Resume' }).click()
  await page.evaluate(() => window.dispatchEvent(new Event('blur')))
  await expect(page.getByRole('heading', { name: 'PAUSED' })).toBeVisible()
})

test('controller deploys, turns, uses triggers, fires and resumes without stale inputs', async ({ page }) => {
  await setup(page, true)
  await hold(page, 7, .7); await tap(page, 0)
  const start = position(await frame(page))
  await page.clock.runFor(300); expect(position(await frame(page)).y).toBeCloseTo(start.y, 3)
  await hold(page, 7, 0); await frame(page); await hold(page, 7, .7); await page.clock.runFor(500)
  expect(position(await frame(page)).y).toBeLessThan(start.y - 10)
  await hold(page, 7, 0)
  await page.clock.runFor(700)
  const reverseStart = position(await frame(page))
  await hold(page, 6, 1); await page.clock.runFor(700); await hold(page, 6, 0)
  expect(position(await frame(page)).y).toBeGreaterThan(reverseStart.y + 10)
  await page.evaluate(() => { window.testPad.axes[0] = .6 }); await page.clock.runFor(200)
  const turned = await frame(page); expect(Math.abs(turned.jeep.a)).toBeGreaterThan(.15)
  await page.evaluate(() => { window.testPad.axes[0] = 0 }); await tap(page, 0)
  expect((await frame(page)).shots).toHaveLength(1)
  await tap(page, 9); await expect(page.getByRole('heading', { name: 'PAUSED' })).toBeVisible()
  await tap(page, 1); await expect(page.getByRole('heading', { name: 'PAUSED' })).toHaveCount(0)
  await page.evaluate(() => { window.testPad.connected = false }); await frame(page)
  await expect(page.getByRole('heading', { name: 'PAUSED' })).toBeVisible()
})
