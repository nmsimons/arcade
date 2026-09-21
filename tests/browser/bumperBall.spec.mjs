import { test, expect } from './helpers/test.mjs'
import { hold, tap } from './helpers/controller.mjs'

// Observe actual canvas output without exposing or changing simulation state.
async function setup(page) {
  await page.clock.install({ time: new Date('2026-01-01T00:00:00Z') })
  await page.addInitScript(() => {
    const proto = CanvasRenderingContext2D.prototype
    for (const method of ['fillRect', 'arcTo', 'arc', 'roundRect', 'fillText']) {
      const original = proto[method]
      proto[method] = function (...args) {
        if (method === 'fillRect' && this.fillStyle === '#070c0b' && args[2] === this.canvas.width && args[3] === this.canvas.height) {
          window.bumperFrame = { width: this.canvas.width, height: this.canvas.height, walls: [], fixtures: [], cars: {}, text: [] }
        }
        const frame = window.bumperFrame
        if (frame) {
          const { a, b, c, d, e, f } = this.getTransform()
          const transform = { a, b, c, d, e, f }
          if (method === 'arcTo') frame.walls.push(args)
          if (method === 'arc' && ((args[2] === 20 && this.strokeStyle === '#d8b674' && this.lineWidth === 1.5) || args[2] === 60)) {
            frame.fixtures.push({ x: args[0], y: args[1], radius: args[2], transform })
          }
          if (method === 'arc' && args[2] === 30) frame.ball = { x: args[0], y: args[1] }
          // The chassis stays centered while the suspension and tires animate.
          if (method === 'roundRect' && args[0] === -14 && args[1] === -8 && args[2] === 29 && args[3] === 16) frame.cars[this.strokeStyle] = transform
          if (method === 'fillText') frame.text.push({ value: args[0], x: args[1], y: args[2], transform })
        }
        return original.apply(this, args)
      }
    }
  })
  await page.goto('/bumper-ball')
  await expect(page.getByRole('heading', { name: 'BUMPER BALL', exact: true })).toBeVisible()
  await page.clock.pauseAt(new Date('2026-01-01T01:00:00Z'))
}

async function frame(page) {
  await page.clock.runFor(32)
  return page.evaluate(() => window.bumperFrame)
}

function playerPosition(output) {
  const camera = output.fixtures[0].transform
  return { x: (output.width / 2 - camera.e) / camera.a, y: (output.height / 2 - camera.f) / camera.d }
}

function expectCentered(output) {
  const player = output.cars['#87bfff']
  // Browser canvas transforms use single-precision components internally.
  expect(player.e).toBeCloseTo(output.width / 2, 3)
  expect(player.f).toBeCloseTo(output.height / 2, 3)
  const camera = output.fixtures[0].transform
  expect(camera.a).toBeGreaterThanOrEqual(1)
  expect(camera.d).toBe(camera.a)
  for (const text of output.text) {
    expect(text.transform).toEqual({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 })
  }
}

test('single-player menu supports mouse and keyboard without a two-player option', async ({ page }) => {
  await setup(page)
  await expect(page.getByRole('button')).toHaveText(['Play', 'Back'])
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/\/$/)
  await page.getByRole('button', { name: 'Bumper Ball', exact: true }).click()
  await page.clock.runFor(64)
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('heading', { name: 'BUMPER BALL', exact: true })).toHaveCount(0)
  expectCentered(await frame(page))
})

test('larger windows zoom in while preserving the fixed arena, centered player and paused match', async ({ page }) => {
  await setup(page)
  await page.getByRole('button', { name: 'Play', exact: true }).click()
  await page.clock.runFor(700)
  await page.keyboard.press('p')
  await expect(page.getByRole('heading', { name: 'PAUSED', exact: true })).toBeVisible()
  const before = await frame(page)
  expect(before.walls).toEqual([[1600, 0, 1600, 30, 30], [1600, 1000, 1570, 1000, 30], [0, 1000, 0, 970, 30], [0, 0, 30, 0, 30]])
  expect(before.fixtures).toHaveLength(12)
  const fixtures = output => output.fixtures.map(({ x, y, radius }) => ({ x, y, radius }))
  const relativeOpponent = output => ({
    x: (output.cars['#f18e7d'].e - output.cars['#87bfff'].e) / output.fixtures[0].transform.a,
    y: (output.cars['#f18e7d'].f - output.cars['#87bfff'].f) / output.fixtures[0].transform.d,
  })
  for (const [viewport, zoom] of [
    [{ width: 640, height: 480 }, 1],
    [{ width: 1920, height: 1080 }, 1.35],
    [{ width: 2560, height: 1600 }, 2],
    [{ width: 3840, height: 2160 }, 2.7],
    [{ width: 3440, height: 1440 }, 1.8],
    [{ width: 900, height: 700 }, 1],
  ]) {
    await page.setViewportSize(viewport)
    await expect(page.locator('canvas')).toHaveAttribute('width', String(viewport.width))
    await expect(page.locator('canvas')).toHaveAttribute('height', String(viewport.height))
    const after = await frame(page)
    expectCentered(after)
    expect(after.fixtures[0].transform.a).toBeCloseTo(zoom, 5)
    // Car and fixtures enlarge together, while HUD text remains unscaled.
    expect(Math.hypot(after.cars['#87bfff'].a, after.cars['#87bfff'].b)).toBeCloseTo(zoom, 5)
    expect(after.walls).toEqual(before.walls)
    expect(fixtures(after)).toEqual(fixtures(before))
    expect(after.ball).toEqual(before.ball)
    for (const axis of ['x', 'y']) {
      expect(playerPosition(after)[axis]).toBeCloseTo(playerPosition(before)[axis], 3)
      expect(relativeOpponent(after)[axis]).toBeCloseTo(relativeOpponent(before)[axis], 3)
    }
    expect(after.text.map(text => text.value)).toEqual(before.text.map(text => text.value))
  }
})

for (const [turn, reverse] of [['ArrowLeft', 'ArrowDown'], ['a', 's']]) test(`${turn}/${reverse} drives the centered blue player to the fixed top wall`, async ({ page }) => {
  if (turn === 'a') await page.setViewportSize({ width: 2560, height: 1600 })
  await setup(page)
  await page.getByRole('button', { name: 'Play', exact: true }).click()
  const before = await frame(page)
  expectCentered(before)
  // Turn toward a clear lane so the test reaches a wall without hitting bumpers.
  await page.keyboard.down(turn)
  await page.clock.runFor(400)
  await page.keyboard.up(turn)
  await page.keyboard.down(reverse)
  await page.clock.runFor(1000)
  const moving = await frame(page)
  expectCentered(moving)
  expect(playerPosition(moving).y).toBeLessThan(playerPosition(before).y - 30)
  expect(moving.cars['#f18e7d'].e).not.toBe(before.cars['#f18e7d'].e)
  await page.clock.runFor(7000)
  await page.keyboard.up(reverse)
  const atWall = await frame(page)
  expectCentered(atWall)
  expect(playerPosition(atWall).y).toBeLessThan(25)
  expect(playerPosition(atWall).y).toBeGreaterThanOrEqual(15)
})

async function setupController(page, mapping = 'standard') {
  await page.addInitScript(mapping => {
    window.testPad = { index: 1, id: 'Bumper Ball test controller', mapping, connected: true,
      axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) }
    Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => [null, window.testPad] })
  }, mapping)
  await setup(page)
  await frame(page)
}

const heading = output => Math.atan2(output.cars['#87bfff'].b, output.cars['#87bfff'].a)
const angleDelta = (after, before) => Math.atan2(Math.sin(heading(after) - heading(before)), Math.cos(heading(after) - heading(before)))

test('controller navigates menus, starts, turns proportionally without stick throttle, pauses, resumes and exits', async ({ page }) => {
  await setupController(page)
  await expect(page.getByText('RT / R2 forward · LT / L2 reverse', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeFocused()
  await tap(page, 13)
  await expect(page.getByRole('button', { name: 'Back', exact: true })).toBeFocused()
  await page.evaluate(() => { window.testPad.axes[1] = -1 })
  await page.clock.runFor(64)
  await page.evaluate(() => { window.testPad.axes[1] = 0 })
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeFocused()
  await tap(page, 0)
  await expect(page.locator('canvas')).toBeFocused()
  const initial = await frame(page)
  for (const y of [-1, 1, 0]) {
    await page.evaluate(y => { window.testPad.axes[1] = y; window.testPad.axes[0] = .1 }, y)
    await page.clock.runFor(64)
  }
  const neutral = await frame(page)
  expect(playerPosition(neutral)).toEqual(playerPosition(initial))
  expect(heading(neutral)).toBe(heading(initial))
  await page.evaluate(() => { window.testPad.axes[0] = .59 })
  await page.clock.runFor(160)
  await page.evaluate(() => { window.testPad.axes[0] = 0 })
  const halfTurn = await frame(page)
  await page.evaluate(() => { window.testPad.axes[0] = 1 })
  await page.clock.runFor(160)
  await page.evaluate(() => { window.testPad.axes[0] = 0 })
  const fullTurn = await frame(page)
  expect(angleDelta(halfTurn, neutral)).toBeCloseTo(.32, 2)
  expect(angleDelta(fullTurn, halfTurn)).toBeCloseTo(.64, 2)
  expect(playerPosition(fullTurn)).toEqual(playerPosition(initial))
  expectCentered(fullTurn)
  await tap(page, 9)
  await expect(page.getByRole('dialog', { name: 'Bumper Ball paused', exact: true })).toBeVisible()
  await tap(page, 1)
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await tap(page, 9)
  await tap(page, 13)
  await expect(page.getByRole('button', { name: 'Back', exact: true })).toBeFocused()
  await tap(page, 0)
  await expect(page).toHaveURL(/\/$/)
})

for (const [button, name, direction] of [[7, 'RT', -1], [6, 'LT', 1]]) {
  for (const pressure of [.25, 1]) test(`${name} at ${pressure} pressure drives in the correct direction`, async ({ page }) => {
    await setupController(page)
    await tap(page, 0)
    const before = await frame(page)
    await hold(page, button, .02, 100)
    expect(playerPosition(await frame(page))).toEqual(playerPosition(before))
    await hold(page, button, pressure, 250)
    const after = await frame(page)
    expect((playerPosition(after).x - playerPosition(before).x) * direction).toBeGreaterThan(.5)
    expect(playerPosition(after).y).toBeCloseTo(playerPosition(before).y, 3)
    expect(heading(after)).toBe(heading(before))
    expectCentered(after)
  })
}

test('held stick and partial triggers stay neutral when starting and resuming', async ({ page }) => {
  await setupController(page)
  await page.evaluate(() => {
    window.testPad.axes[0] = .7
    for (const index of [6, 7]) window.testPad.buttons[index] = { pressed: false, value: .25 }
  })
  await tap(page, 0)
  const initial = await frame(page)
  await page.clock.runFor(200)
  expect(playerPosition(await frame(page))).toEqual(playerPosition(initial))
  expect(heading(await frame(page))).toBe(heading(initial))
  // Release, then press pause and driving controls together. Pause wins that frame.
  await page.evaluate(() => {
    window.testPad.axes[0] = 0
    for (const index of [6, 7]) window.testPad.buttons[index] = { pressed: false, value: 0 }
  })
  await frame(page)
  await page.evaluate(() => {
    window.testPad.axes[0] = .7
    window.testPad.buttons[7] = { pressed: false, value: .25 }
    window.testPad.buttons[9] = { pressed: true, value: 1 }
  })
  await frame(page)
  await expect(page.getByRole('dialog', { name: 'Bumper Ball paused', exact: true })).toBeVisible()
  await hold(page, 9, 0)
  await tap(page, 9)
  await page.clock.runFor(200)
  const resumed = await frame(page)
  expect(playerPosition(resumed)).toEqual(playerPosition(initial))
  expect(heading(resumed)).toBe(heading(initial))
  await page.evaluate(() => { window.testPad.axes[0] = 0 })
  await hold(page, 7, 0)
  await hold(page, 7, .25, 250)
  expect(playerPosition(await frame(page)).x).toBeLessThan(playerPosition(initial).x)
})

test('disconnecting or losing focus pauses; reconnecting requires neutral controls before driving', async ({ page }) => {
  await setupController(page)
  await tap(page, 0)
  await page.evaluate(() => { window.testPad.connected = false })
  await frame(page)
  await expect(page.getByRole('dialog', { name: 'Bumper Ball paused', exact: true })).toBeVisible()
  const stopped = await frame(page)
  await page.evaluate(() => {
    window.testPad.connected = true
    window.testPad.axes[0] = 1
    window.testPad.buttons[7] = { pressed: true, value: 1 }
  })
  await frame(page)
  await tap(page, 1)
  await page.clock.runFor(200)
  expect(playerPosition(await frame(page))).toEqual(playerPosition(stopped))
  expect(heading(await frame(page))).toBe(heading(stopped))
  await page.evaluate(() => { window.dispatchEvent(new Event('blur')) })
  await expect(page.getByRole('dialog', { name: 'Bumper Ball paused', exact: true })).toBeVisible()
  await page.evaluate(() => { window.dispatchEvent(new Event('focus')) })
  await frame(page)
  await tap(page, 1)
  expect(playerPosition(await frame(page))).toEqual(playerPosition(stopped))
  await page.evaluate(() => { window.testPad.axes[0] = 0 })
  await hold(page, 7, 0)
  await hold(page, 7, 1, 200)
  expect(playerPosition(await frame(page)).x).toBeLessThan(playerPosition(stopped).x)
})

test('unsupported controllers leave keyboard driving and menu navigation available', async ({ page }) => {
  await setupController(page, '')
  await expect(page.getByText('RT / R2 forward · LT / L2 reverse', { exact: true })).toHaveCount(0)
  await page.keyboard.press('Enter')
  const before = await frame(page)
  await hold(page, 7, 1, 200)
  expect(playerPosition(await frame(page))).toEqual(playerPosition(before))
  await page.keyboard.down('ArrowUp')
  await page.clock.runFor(200)
  await page.keyboard.up('ArrowUp')
  expect(playerPosition(await frame(page)).x).toBeLessThan(playerPosition(before).x)
})

const boostLabel = output => output.text.find(text => text.value.startsWith('BOOST'))?.value

test('Space boosts once per press, shows recharge, and freezes the cooldown while paused', async ({ page }) => {
  await setup(page)
  // Space also activates Play: that press must not carry into the match.
  await page.keyboard.press('Space')
  expect(boostLabel(await frame(page))).toBe('BOOST READY · SPACE')
  await page.keyboard.down('ArrowLeft')
  await page.clock.runFor(390)
  await page.keyboard.up('ArrowLeft')
  const before = await frame(page)
  await page.keyboard.down('Space')
  await page.clock.runFor(300)
  const bursting = await frame(page)
  expect(boostLabel(bursting)).toBe('BOOSTING')
  expect(playerPosition(bursting).y - playerPosition(before).y).toBeGreaterThan(40)
  expectCentered(bursting)
  await page.clock.runFor(300)
  expect(boostLabel(await frame(page))).toMatch(/^BOOST · 2\.[0-9]s$/)
  await page.keyboard.press('p')
  const paused = await frame(page)
  await page.clock.runFor(5000)
  expect(boostLabel(await frame(page))).toBe(boostLabel(paused))
  await page.keyboard.press('p')
  await page.clock.runFor(3000)
  expect(boostLabel(await frame(page))).toBe('BOOST READY · SPACE')
  // OS key repeat after resuming cannot spend the freshly recharged boost.
  await page.keyboard.down('Space')
  expect(boostLabel(await frame(page))).toBe('BOOST READY · SPACE')
  await page.keyboard.up('Space')
  await page.keyboard.press('Space')
  expect(boostLabel(await frame(page))).toBe('BOOSTING')
})

test('controller A boosts after release, cannot retrigger while held, and respects pause priority', async ({ page }) => {
  await setupController(page)
  await expect(page.getByText('A / × boosts', { exact: true })).toBeVisible()
  await hold(page, 0, 1, 200)
  expect(boostLabel(await frame(page))).toBe('BOOST READY · A / ×')
  await hold(page, 0, 0)
  await page.evaluate(() => { window.testPad.axes[0] = -1 })
  await page.clock.runFor(390)
  await page.evaluate(() => { window.testPad.axes[0] = 0 })
  const before = await frame(page)
  await hold(page, 0, 1, 300)
  const bursting = await frame(page)
  expect(boostLabel(bursting)).toBe('BOOSTING')
  expect(playerPosition(bursting).y - playerPosition(before).y).toBeGreaterThan(40)
  await page.clock.runFor(3300)
  expect(boostLabel(await frame(page))).toBe('BOOST READY · A / ×')
  await hold(page, 0, 0)
  await page.evaluate(() => {
    for (const index of [0, 9]) window.testPad.buttons[index] = { pressed: true, value: 1 }
  })
  await frame(page)
  await expect(page.getByRole('heading', { name: 'PAUSED', exact: true })).toBeVisible()
  expect(boostLabel(await frame(page))).toBe('BOOST READY · A / ×')
  await hold(page, 9, 0)
  await tap(page, 9)
  expect(boostLabel(await frame(page))).toBe('BOOST READY · A / ×')
  await hold(page, 0, 0)
  await tap(page, 0)
  expect(boostLabel(await frame(page))).toBe('BOOSTING')
})
