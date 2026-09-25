import { restartFromPause, useLevelFixtures } from './helpers/jumpingLevels.mjs'
import { DEFAULT_LEVEL } from '../helpers/jumping-fixtures.mjs'
import { test, expect } from './helpers/test.mjs'
import { hold, tap } from './helpers/controller.mjs'

async function setup(page, controller = false, level = DEFAULT_LEVEL) {
  await useLevelFixtures(page, [level])
  await page.clock.install({ time: new Date('2026-01-01T00:00:00Z') })
  await page.addInitScript(({ controller }) => {
    if (controller) {
      window.testPad = { index: 0, id: 'Jump test controller', connected: true, mapping: 'standard', axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) }
      Object.defineProperty(navigator, 'getGamepads', { value: () => [window.testPad] })
    }
    // Measure the rendered athlete against the rendered terrain; no simulation backdoor.
    const proto = CanvasRenderingContext2D.prototype, rect = proto.fillRect, ellipse = proto.ellipse
    proto.fillRect = function (...args) {
      if (args[0] === 0 && args[1] === 0 && this.fillStyle === '#f1f1ed') window.jumpCamera = this.getTransform()
      return rect.apply(this, args)
    }
    proto.ellipse = function (...args) {
      if (args[2] === 6.2 && args[3] === 6.2 && window.jumpCamera) {
        const body = this.getTransform(), camera = window.jumpCamera
        window.jumpPlayer = { x: (body.e - camera.e) / camera.a, y: (body.f - camera.f) / camera.d }
        window.jumpHead = { x: (body.e + body.a * args[0] + body.c * args[1] - camera.e) / camera.a,
          y: (body.f + body.b * args[0] + body.d * args[1] - camera.f) / camera.d }
        const now = performance.now()
        window.jumpMotion = [...(window.jumpMotion ?? []).filter(point => now - point.time < 200), { x: window.jumpPlayer.x, time: now }]
        window.jumpScreen = { x: body.e / this.canvas.width, y: (body.f - Math.abs(body.d) * 31) / this.canvas.height }
      }
      return ellipse.apply(this, args)
    }
  }, { controller })
  await page.goto('/untitled-jumping-game')
  await expect(page.locator('.jumping-level-card[aria-pressed=true]')).toBeVisible()
  await page.clock.pauseAt(new Date('2026-01-01T01:00:00Z'))
  await page.clock.runFor(64)
}
const position = page => page.evaluate(() => window.jumpPlayer)
const speed = page => page.evaluate(() => {
  const first = window.jumpMotion[0], last = window.jumpMotion.at(-1)
  return Math.abs(last.x - first.x) / ((last.time - first.time) / 1000) / 60
})

test('jumping across slopes restores traction while holding uphill, then permits stopping and jumping', async ({ page }, info) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message))
  const level = {
    version: 1, id: 'slope-friction', name: 'Slope friction', width: 2000, height: 1400,
    spawn: { x: 600, y: 900 }, checkpoints: [],
    platforms: [{ x: 0, y: 640, w: 2000, h: 760,
      polygon: [[0, 160], [400, 160], [800, 360], [1200, 0], [2000, 0], [2000, 760], [0, 760]] }],
    climbables: { ladders: [], ropes: [] },
  }
  await setup(page, false, level); await enter(page)
  await page.keyboard.down('d'); await page.clock.runFor(300)
  await page.keyboard.down('Space'); await page.clock.runFor(24); await page.keyboard.up('Space')
  await page.clock.runFor(600)
  const landed = await position(page)
  expect(landed.x).toBeGreaterThan(800)
  expect(landed.y).toBeCloseTo(1000 - (landed.x - 800) * .9, 3)
  await expect(page.locator('.jumping-state')).toHaveText(/^(Ready|Walking|Running)$/)
  await page.screenshot({ path: info.outputPath('uphill-landing-traction.png') })
  let previousX = landed.x
  for (let i = 0; i < 5; i++) {
    await page.clock.runFor(64)
    const p = await position(page)
    expect(p.y).toBeCloseTo(1000 - (p.x - 800) * .9, 3)
    expect(p.x).toBeGreaterThan(previousX); previousX = p.x
    await expect(page.locator('.jumping-state')).toHaveText(/^(Ready|Walking|Running)$/)
  }
  await page.clock.runFor(96)
  await expect(page.locator('.jumping-state')).toHaveText('Walking')
  await page.keyboard.up('d'); await page.clock.runFor(500)
  const stopped = await position(page)
  await page.clock.runFor(400)
  expect(await position(page)).toEqual(stopped)
  await expect(page.locator('.jumping-state')).toHaveText('Ready')
  await page.keyboard.down('Space'); await page.clock.runFor(400); await page.keyboard.up('Space')
  await page.clock.runFor(64)
  await expect(page.locator('.jumping-state')).toHaveText('Rising')
  expect((await position(page)).y).toBeLessThan(stopped.y - 30)
  expect(errors).toEqual([])
})
async function expectCentered(page) {
  const point = await page.evaluate(() => window.jumpScreen)
  expect(point.x).toBeCloseTo(.5, 5); expect(point.y).toBeCloseTo(.5, 5)
}
async function enter(page) {
  await page.locator('.jumping-level-card[aria-pressed=true]').click()
  await page.clock.runFor(64)
  await expect(page.locator('canvas')).toBeFocused()
}

for (const controller of [false, true]) test(`${controller ? 'controller' : 'keyboard'} keeps grip above 45 degrees and releases it for a jump`, async ({ page }, info) => {
  const level = {
    version: 1, id: 'grip-balance', name: 'Grip balance', width: 1600, height: 2200,
    spawn: { x: 800, y: 1024 }, checkpoints: [],
    platforms: [{ x: 0, y: 200, w: 1600, h: 2000, polygon: [[0, 0], [1600, 1648], [1600, 2000], [0, 2000]] }],
    climbables: { ladders: [], ropes: [] },
  }
  const move = value => controller ? page.evaluate(value => { window.testPad.axes[0] = value }, value)
    : value ? page.keyboard.down('a') : page.keyboard.up('a')
  const jump = value => controller ? page.evaluate(value => { window.testPad.buttons[0] = { pressed: value, value: Number(value) } }, value)
    : value ? page.keyboard.down('Space') : page.keyboard.up('Space')
  await setup(page, controller, level); await enter(page)
  await page.clock.runFor(500)
  const start = await position(page)
  expect(start.x).toBeCloseTo(800, 3); expect(start.y).toBeCloseTo(1024, 3)
  await expect(page.locator('.jumping-state')).toHaveText('Ready')
  await move(-1); await page.clock.runFor(600)
  const climbing = await position(page)
  expect(climbing.x).toBeLessThan(start.x - 15)
  expect(climbing.y).toBeCloseTo(200 + climbing.x * 1.03, 3)
  await expect(page.locator('.jumping-state')).toHaveText('Walking')
  await page.screenshot({ path: info.outputPath('grip-above-45.png') })
  await move(0); await page.clock.runFor(500)
  const stopped = await position(page)
  await page.clock.runFor(300)
  expect(await position(page)).toEqual(stopped)
  await jump(true); await page.clock.runFor(400); await jump(false); await page.clock.runFor(128)
  await expect(page.locator('.jumping-state')).toHaveText('Rising')
  expect((await position(page)).y).toBeLessThan(stopped.y - 30)
})

test('controller stays steady where a gentle slope meets a steep face, then walks away and jumps', async ({ page }, info) => {
  const level = {
    version: 1, id: 'angled-slope-base', name: 'Angled slope base', width: 1600, height: 1200,
    spawn: { x: 650, y: 580 }, checkpoints: [],
    platforms: [{ x: 0, y: 200, w: 1600, h: 1000,
      polygon: [[0, 640], [700, 360], [900, 40], [1200, 0], [1600, 0], [1600, 1000], [0, 1000]] }],
    climbables: { ladders: [], ropes: [] },
  }
  await setup(page, true, level); await enter(page)
  const move = value => page.evaluate(value => { window.testPad.axes[0] = value }, value)
  await move(1); await page.clock.runFor(1800)
  const blocked = await position(page), head = await page.evaluate(() => window.jumpHead)
  expect(blocked.x).toBeGreaterThan(695); expect(blocked.x).toBeLessThan(700)
  for (let i = 0; i < 24; i++) {
    await page.clock.runFor(16)
    const current = await position(page), currentHead = await page.evaluate(() => window.jumpHead)
    expect(Math.hypot(current.x - blocked.x, current.y - blocked.y)).toBeLessThan(.001)
    expect(Math.hypot(currentHead.x - head.x, currentHead.y - head.y)).toBeLessThan(.01)
    await expect(page.locator('.jumping-state')).toHaveText('Ready')
  }
  await page.screenshot({ path: info.outputPath('stable-at-angled-corner.png') })
  await move(0); await page.clock.runFor(300)
  expect((await position(page)).x).toBeCloseTo(blocked.x, 3)
  await move(-1); await page.clock.runFor(400)
  expect((await position(page)).x).toBeLessThan(blocked.x - 30)
  await move(1); await page.clock.runFor(1500)
  await hold(page, 0, 1, 400); await hold(page, 0, 0, 128)
  await expect(page.locator('.jumping-state')).toHaveText('Rising')
  expect((await position(page)).y).toBeLessThan(blocked.y - 30)
})

test('holding uphill against steep terrain stays still, then jumping onto it produces a supported slide', async ({ page }, info) => {
  const rise = 500 * Math.tan(55 * Math.PI / 180)
  const level = {
    version: 1, id: 'slope-base', name: 'Slope base', width: 1800, height: 1000,
    spawn: { x: 550, y: 1000 }, checkpoints: [],
    platforms: [{ x: 600, y: 1000 - rise, w: 500, h: rise, polygon: [[0, rise], [500, 0], [500, rise]] }],
    climbables: { ladders: [], ropes: [] },
  }
  await setup(page, false, level); await enter(page)
  await page.keyboard.down('d'); await page.clock.runFor(1500)
  const blocked = await position(page), head = await page.evaluate(() => window.jumpHead)
  await expect(page.locator('.jumping-state')).toHaveText('Ready')
  for (let i = 0; i < 10; i++) {
    await page.clock.runFor(64)
    const current = await position(page), currentHead = await page.evaluate(() => window.jumpHead)
    expect(Math.hypot(current.x - blocked.x, current.y - blocked.y)).toBeLessThan(.001)
    expect(Math.hypot(currentHead.x - head.x, currentHead.y - head.y)).toBeLessThan(.01)
    await expect(page.locator('.jumping-state')).toHaveText('Ready')
  }
  await page.screenshot({ path: info.outputPath('stable-at-slope-base.png') })
  await page.keyboard.down('Space'); await page.clock.runFor(400); await page.keyboard.up('Space')
  await page.clock.runFor(128)
  await expect(page.locator('.jumping-state')).toHaveText('Rising')
  expect((await position(page)).y).toBeLessThan(blocked.y - 50)
  await page.clock.runFor(800)
  await expect(page.locator('.jumping-state')).toHaveText('Sliding')
  await page.screenshot({ path: info.outputPath('balanced-slide.png') })
})

for (const trial of [false, true]) test(`${trial ? 'trial' : 'playground'} camera leaves bottom padding and centers the player after climbing`, async ({ page }, info) => {
  const bottom = 1800
  const level = {
    version: 1, id: 'camera-floor', name: 'Camera floor', width: 2000, height: bottom,
    spawn: { x: 1000, y: bottom }, checkpoints: [], platforms: [],
    climbables: { ladders: [{ x: 1000, top: 200, bottom, platform: -1, side: 1 }], ropes: [] },
    ...(trial ? { height: 2000, floor: bottom, goal: { x: 1500, y: bottom }, times: { gold: 30, silver: 60, bronze: 120 },
      props: [], mechanisms: [], triggers: [], robots: [] } : {}),
  }
  await setup(page, false, level); await enter(page)
  const visibleBottom = () => page.evaluate(() => (document.querySelector('canvas').height - window.jumpCamera.f) / window.jumpCamera.d)
  const floorPadding = () => page.evaluate(bottom => {
    const canvas = document.querySelector('canvas'), camera = window.jumpCamera
    return (1 - (bottom * camera.d + camera.f) / canvas.height) * canvas.getBoundingClientRect().height
  }, bottom)
  for (const viewport of [{ width: 1280, height: 800 }, { width: 640, height: 480 }]) {
    await page.setViewportSize(viewport); await page.clock.runFor(64)
    expect(await floorPadding()).toBeCloseTo(32, 3)
    expect((await page.evaluate(() => window.jumpScreen)).y).toBeGreaterThan(.85)
    expect((await position(page)).y).toBeCloseTo(bottom, 3)
  }
  await page.screenshot({ path: info.outputPath('camera-at-floor.png') })
  await page.keyboard.down('w'); await page.clock.runFor(1000)
  expect(await floorPadding()).toBeCloseTo(32, 3)
  expect((await page.evaluate(() => window.jumpScreen)).y).toBeGreaterThan(.5)
  await page.clock.runFor(9000); await page.keyboard.up('w')
  await expect(page.locator('.jumping-state')).toContainText('Ladder')
  await expectCentered(page)
  expect(await visibleBottom()).toBeLessThan(bottom)
  await page.screenshot({ path: info.outputPath('camera-following-climb.png') })
  await page.keyboard.down('ArrowDown'); await page.clock.runFor(10000); await page.keyboard.up('ArrowDown')
  expect((await position(page)).y).toBeCloseTo(bottom, 3)
  expect(await floorPadding()).toBeCloseTo(32, 3)
})

for (const controller of [false, true]) test(`${controller ? 'controller' : 'keyboard'} maximum-length rope holds steady and permits a controlled descent off its end`, async ({ page }, info) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message))
  const level = {
    version: 1, id: 'long-rope-regression', name: 'Long rope', width: 2000, height: 2600,
    spawn: { x: 990, y: 2300 }, checkpoints: [],
    platforms: [{ x: 0, y: 2300, w: 2000, h: 300 }],
    climbables: { ladders: [], ropes: [{ x: 1000, y: 200, length: 2000, segments: 250 }] },
  }
  await setup(page, controller, level); await enter(page)
  if (controller) await tap(page, 0)
  else await page.keyboard.press('Space')
  await page.clock.runFor(1600)
  await expect(page.locator('.jumping-state')).toHaveText('Rope · holding')
  const held = await position(page)
  await page.clock.runFor(2000)
  const settled = await position(page)
  expect(Math.abs(settled.y - held.y)).toBeLessThan(.5)
  expect(Math.abs(settled.x - held.x)).toBeLessThan(.5)
  await page.screenshot({ path: info.outputPath('long-rope-hanging.png') })
  if (controller) await page.evaluate(() => { window.testPad.axes[0] = 1 })
  else await page.keyboard.down('d')
  await page.clock.runFor(700)
  if (controller) await page.evaluate(() => { window.testPad.axes[0] = 0 })
  else await page.keyboard.up('d')
  await expect(page.locator('.jumping-state')).toHaveText('Rope · holding')
  await page.screenshot({ path: info.outputPath('long-rope-swing.png') })
  const before = await position(page)
  if (controller) await page.evaluate(() => { window.testPad.axes[1] = 1 })
  else await page.keyboard.down('ArrowDown')
  await page.clock.runFor(500)
  if (controller) await page.evaluate(() => { window.testPad.axes[1] = 0 })
  else await page.keyboard.up('ArrowDown')
  await expect(page.locator('.jumping-state')).not.toContainText('Rope')
  const after = await position(page)
  expect(Math.abs(after.x - before.x)).toBeLessThan(150)
  expect(after.y).toBeGreaterThan(before.y)
  await page.screenshot({ path: info.outputPath('long-rope-released.png') })
  expect(errors).toEqual([])
})

test('keyboard walks and runs, quick taps jump, and a charged jump goes higher', async ({ page }, info) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message))
  await setup(page); await enter(page)
  await expectCentered(page)
  await page.keyboard.down('Shift'); await page.keyboard.down('d'); await page.clock.runFor(350)
  expect(Math.abs(await speed(page) - 2.1)).toBeLessThan(.2)
  await page.keyboard.up('Shift'); await page.clock.runFor(300)
  expect(Math.abs(await speed(page) - 5.8)).toBeLessThan(.2)
  const runStart = await position(page)
  await page.keyboard.down('Space'); await page.clock.runFor(400)
  expect(Math.abs(await speed(page) - 5.8)).toBeLessThan(.2)
  expect((await position(page)).x - runStart.x).toBeGreaterThan(130)
  await expectCentered(page)
  await page.screenshot({ path: info.outputPath('running-charge.png') })
  await page.keyboard.up('Space')
  await page.keyboard.up('d'); await restartFromPause(page); await page.clock.runFor(64)
  await page.keyboard.press('Space'); await page.clock.runFor(200)
  const short = await position(page); expect(short.y).toBeLessThan(592); expect(short.y).toBeGreaterThan(582)
  await page.clock.runFor(700)
  await page.keyboard.down('Space'); await page.clock.runFor(800)
  expect((await position(page)).y).toBeCloseTo(620)
  await page.keyboard.up('Space'); await page.clock.runFor(480)
  expect((await position(page)).y).toBeLessThan(short.y - 100)
  await expectCentered(page)
  await page.screenshot({ path: info.outputPath('charged-jump.png') })
  await page.clock.runFor(700); await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog', { name: 'Game paused' })).toBeVisible()
  await page.getByRole('button', { name: 'Back to arcade' }).click()
  await expect(page.getByRole('heading', { name: 'Select Game' })).toBeVisible()
  expect(errors).toEqual([])
})

test('controller-only play gates launch, supports analog speed and charge, and pauses on disconnect', async ({ page }) => {
  await setup(page, true)
  await hold(page, 0, 1, 850)
  await expect(page.getByRole('dialog')).toHaveCount(0)
  expect((await position(page)).y).toBeCloseTo(620)
  await hold(page, 0, 0); expect((await position(page)).y).toBeCloseTo(620)
  await page.evaluate(() => { window.testPad.axes[0] = .59 }); await page.clock.runFor(400)
  expect(Math.abs(await speed(page) - 2.9)).toBeLessThan(.2)
  await page.evaluate(() => { window.testPad.axes[0] = 0 }); await page.clock.runFor(200)
  await hold(page, 0, 1, 800); await hold(page, 0, 0, 480)
  expect((await position(page)).y).toBeLessThan(440)
  await page.clock.runFor(800)
  await page.evaluate(() => { window.testPad.connected = false }); await page.clock.runFor(64)
  await expect(page.getByRole('dialog')).toContainText('Controller disconnected')
  const paused = await position(page); await page.clock.runFor(1000); expect(await position(page)).toEqual(paused)
  await page.getByRole('button', { name: 'Resume', exact: true }).click(); await page.clock.runFor(64)
  await page.keyboard.down('a'); await page.clock.runFor(200); await page.keyboard.up('a')
  expect((await position(page)).x).toBeLessThan(paused.x)
})

test('keyboard walks over the opening ramp with continuous footing and no level text', async ({ page }, info) => {
  await setup(page); await enter(page)
  await page.evaluate(() => {
    window.levelText = []
    const original = CanvasRenderingContext2D.prototype.fillText
    CanvasRenderingContext2D.prototype.fillText = function (text, ...args) {
      window.levelText.push(text)
      return original.call(this, text, ...args)
    }
  })
  await page.keyboard.down('Shift'); await page.keyboard.down('d')
  let previous = await position(page), highest = previous.y
  for (let frame = 0; frame < 38; frame++) {
    await page.clock.runFor(80)
    const current = await position(page)
    expect(Math.abs(current.y - previous.y)).toBeLessThan(4.6)
    expect(await page.locator('.jumping-state').textContent()).toBe('Walking')
    highest = Math.min(highest, current.y); previous = current
    if (frame === 16 || frame === 29) await page.screenshot({ path: info.outputPath(frame === 16 ? 'slope-uphill.png' : 'slope-downhill.png') })
  }
  await page.keyboard.up('d'); await page.keyboard.up('Shift'); await page.clock.runFor(250)
  expect(highest).toBeCloseTo(582)
  expect((await position(page)).x).toBeGreaterThan(550)
  expect((await position(page)).y).toBeCloseTo(620)
  expect(await page.evaluate(() => window.levelText)).toEqual([])
})

test('controller pause cancels the charge and reset is available only through the menu', async ({ page }) => {
  await setup(page, true); await enter(page)
  const initial = await position(page)
  await hold(page, 0, 1, 500); await tap(page, 9)
  await expect(page.getByRole('button', { name: 'Resume', exact: true })).toBeFocused()
  await tap(page, 9); await page.clock.runFor(300); await hold(page, 0, 0)
  expect((await position(page)).y).toBeCloseTo(620)
  await expect(page.getByRole('meter')).toHaveCount(0)
  await hold(page, 0, 1, 100); await hold(page, 0, 0, 200)
  expect((await position(page)).y).toBeLessThan(600)
  await page.clock.runFor(800)
  await page.evaluate(() => { window.testPad.axes[0] = -1 }); await page.clock.runFor(250)
  await page.evaluate(() => { window.testPad.axes[0] = 0 }); await page.clock.runFor(400)
  const moved = await position(page)
  expect(moved.x).toBeLessThan(initial.x - 20)
  await tap(page, 3)
  expect(await position(page)).toEqual(moved)
  await expect(page.getByRole('button')).toHaveCount(0)
  await tap(page, 9)
  await expect(page.getByRole('button', { name: 'Resume', exact: true })).toBeFocused()
  await tap(page, 3)
  await expect(page.getByRole('dialog', { name: 'Game paused' })).toBeVisible()
  expect(await position(page)).toEqual(moved)
  await tap(page, 13)
  await expect(page.getByRole('button', { name: 'Reset position', exact: true })).toBeFocused()
  await tap(page, 0)
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.locator('canvas')).toBeFocused()
  expect(await position(page)).toEqual(initial)
})

test('focus loss pauses and resizing preserves the world position', async ({ page }) => {
  await setup(page); await enter(page)
  await page.keyboard.down('d'); await page.clock.runFor(300)
  await page.evaluate(() => window.dispatchEvent(new Event('blur'))); await page.keyboard.up('d')
  await expect(page.getByRole('dialog')).toContainText('out of focus')
  const before = await position(page)
  for (const viewport of [{ width: 640, height: 480 }, { width: 1920, height: 1080 }]) {
    await page.setViewportSize(viewport); await page.clock.runFor(100)
    const after = await position(page)
    expect(after.x).toBeCloseTo(before.x, 2); expect(after.y).toBeCloseTo(before.y, 2)
    await expectCentered(page)
  }
})

async function reachOverhang(page) {
  await page.keyboard.down('d'); await page.clock.runFor(1500); await page.keyboard.up('d')
  await page.keyboard.down('Space'); await page.clock.runFor(800); await page.keyboard.up('Space')
  await page.keyboard.down('d'); await page.clock.runFor(350); await page.keyboard.up('d'); await page.clock.runFor(850)
  expect((await position(page)).y).toBeCloseTo(566)
  // Build speed on the first step and carry it through the jump to the second.
  await page.keyboard.down('Space'); await page.clock.runFor(250); await page.keyboard.down('d')
  for (let i = 0; i < 80 && (await position(page)).x < 720; i++) await page.clock.runFor(16)
  await page.keyboard.up('Space'); await page.keyboard.up('d'); await page.clock.runFor(1100)
  expect((await position(page)).y).toBeCloseTo(502)
  // This lip is 102 units higher and across a 170-unit gap. Give the running
  // jump enough charge to reach it; a minimum tap falls short of the catch.
  await page.keyboard.down('d')
  for (let i = 0; i < 80 && (await position(page)).x < 928; i++) await page.clock.runFor(16)
  await page.keyboard.down('Space'); await page.clock.runFor(96); await page.keyboard.up('Space')
  await page.clock.runFor(700); await page.keyboard.up('d')
  await page.clock.runFor(100) // Let the throttled movement readout publish the caught ledge.
  await expect(page.locator('.jumping-state')).toHaveText('Hanging')
}

test('the authored course supports jumping the steps, catching and climbing the tall ledge, and clearing the gap', async ({ page }, info) => {
  await setup(page); await enter(page); await reachOverhang(page)
  await expectCentered(page)
  await page.screenshot({ path: info.outputPath('ledge-grab.png') })
  await page.keyboard.down('ArrowUp'); await page.clock.runFor(350); await page.keyboard.up('ArrowUp')
  await expect(page.locator('.jumping-state')).toHaveText('Climbing')
  await expectCentered(page)
  await page.screenshot({ path: info.outputPath('ledge-pull-up.png') })
  await page.clock.runFor(600)
  expect((await position(page)).y).toBeCloseTo(400)
  await page.keyboard.down('d'); await page.clock.runFor(1400)
  await expect(page.locator('.jumping-state')).toHaveText('Rope · holding')
  await page.screenshot({ path: info.outputPath('automatic-rope-catch.png') })
  await page.keyboard.press('Space'); await page.clock.runFor(100)
  // Transfer to the second rope without pressing up, then swing out over the gap.
  for (let i = 0; i < 30 && await page.locator('.jumping-state').textContent() !== 'Rope · holding'; i++) await page.clock.runFor(50)
  await expect(page.locator('.jumping-state')).toHaveText('Rope · holding')
  expect((await position(page)).x).toBeGreaterThan(1730)
  for (let i = 0; i < 40 && (await position(page)).x < 1850; i++) await page.clock.runFor(50)
  expect((await position(page)).x).toBeGreaterThan(1850)
  await page.keyboard.press('Space'); await page.clock.runFor(900); await page.keyboard.up('d')
  expect((await position(page)).x).toBeGreaterThan(1990)
  expect((await position(page)).y).toBeCloseTo(620)
  await restartFromPause(page); await page.clock.runFor(64)
  expect((await position(page)).x).toBeCloseTo(2050)
  await expectCentered(page)
})

test('keyboard ladders descend from the platform, and controller ropes climb, swing and release', async ({ page }, info) => {
  await setup(page, true); await enter(page); await reachOverhang(page)
  await page.keyboard.down('ArrowUp'); await page.clock.runFor(1100); await page.keyboard.up('ArrowUp')
  expect((await position(page)).y).toBeCloseTo(400)
  await page.keyboard.down('ArrowDown'); await page.clock.runFor(3600); await page.keyboard.up('ArrowDown')
  expect((await position(page)).y).toBeCloseTo(620)
  await page.keyboard.down('ArrowUp'); await page.clock.runFor(700); await page.keyboard.up('ArrowUp'); await page.clock.runFor(100)
  await expect(page.locator('.jumping-state')).toHaveText('Ladder · holding')
  const held = await position(page); await page.clock.runFor(300); expect(await position(page)).toEqual(held)
  await page.screenshot({ path: info.outputPath('ladder-back-view.png') })
  await page.keyboard.down('ArrowDown'); await page.clock.runFor(800); await page.keyboard.up('ArrowDown')
  expect((await position(page)).y).toBeCloseTo(620)
  await page.keyboard.down('d')
  for (let i = 0; i < 40 && (await position(page)).x < 1518; i++) await page.clock.runFor(50)
  await page.keyboard.up('d'); await page.clock.runFor(200)
  await tap(page, 0); await page.clock.runFor(200)
  await expect(page.locator('.jumping-state')).toHaveText('Rope · holding')
  await page.evaluate(() => { window.testPad.axes[1] = -1 }); await page.clock.runFor(700)
  await expect(page.locator('.jumping-state')).toHaveText('Rope · ascending')
  const ropeStart = await position(page)
  await page.evaluate(() => { window.testPad.axes[0] = .8; window.testPad.axes[1] = 0 }); await page.clock.runFor(600)
  expect((await position(page)).x).toBeGreaterThan(ropeStart.x + 20)
  await expect(page.locator('.jumping-state')).toHaveText('Rope · holding')
  await expectCentered(page)
  await page.screenshot({ path: info.outputPath('rope-back-view-swing.png') })
  await page.evaluate(() => { window.testPad.axes[0] = 0; window.testPad.axes[1] = 1 }); await page.clock.runFor(200)
  await expect(page.locator('.jumping-state')).toHaveText('Rope · descending')
  await page.evaluate(() => { window.testPad.axes[1] = 0 }); await hold(page, 0, 1, 120)
  await expect(page.locator('.jumping-state')).toHaveText('Rope · holding')
  await hold(page, 0, 0, 100)
  await expect(page.locator('.jumping-state')).toHaveText('Rising')
})

for (const controller of [false, true]) test(`${controller ? 'controller' : 'keyboard'} down lowers from an edge and waits for a fresh press before dropping`, async ({ page }, info) => {
  await setup(page, controller); await enter(page); await reachOverhang(page)
  await page.keyboard.down('ArrowUp'); await page.clock.runFor(1100); await page.keyboard.up('ArrowUp')
  await page.keyboard.down('d')
  for (let i = 0; i < 20 && (await position(page)).x < 1335; i++) await page.clock.runFor(50)
  await page.keyboard.up('d'); await page.clock.runFor(200)
  expect((await position(page)).y).toBeCloseTo(400)
  const down = async pressed => {
    if (controller) await page.evaluate(value => { window.testPad.axes[1] = value }, pressed ? 1 : 0)
    else if (pressed) await page.keyboard.down('ArrowDown')
    else await page.keyboard.up('ArrowDown')
  }
  await down(true); await page.clock.runFor(350)
  await expect(page.locator('.jumping-state')).toHaveText('Lowering')
  await page.screenshot({ path: info.outputPath('lowering-from-edge.png') })
  await page.clock.runFor(850)
  await expect(page.locator('.jumping-state')).toHaveText('Hanging')
  const held = await position(page)
  expect(held.x).toBeCloseTo(1394); expect(held.y).toBeCloseTo(474)
  await page.clock.runFor(400); expect(await position(page)).toEqual(held)
  await expectCentered(page)
  await page.screenshot({ path: info.outputPath('hanging-from-edge.png') })
  await down(false); await page.clock.runFor(100); await down(true); await page.clock.runFor(120)
  await expect(page.locator('.jumping-state')).toHaveText('Falling')
  expect((await position(page)).y).toBeGreaterThan(held.y)
  await down(false)
})

test('the playground remains readable at compact sizes', async ({ page }, info) => {
  await setup(page)
  for (const viewport of [{ width: 390, height: 844 }, { width: 844, height: 390 }]) {
    await page.setViewportSize(viewport); await page.clock.runFor(64)
    const dialog = page.getByRole('dialog')
    expect(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true)
    await page.locator('.jumping-level-card[aria-pressed=true]').focus()
    await expect(page.locator('.jumping-level-card[aria-pressed=true]')).toBeInViewport()
    await page.screenshot({ path: info.outputPath(`playground-menu-${viewport.width}.png`) })
  }
})

for (const controller of [false, true]) test(`${controller ? 'controller' : 'keyboard'} vertical directions leave the standing pose unchanged`, async ({ page }) => {
  await setup(page, controller); await enter(page)
  for (const direction of controller ? [13, 12, 1, -1] : ['ArrowDown', 'ArrowUp', 's', 'w']) {
    if (controller) {
      if (Math.abs(direction) === 1) await page.evaluate(y => { window.testPad.axes[1] = y }, direction)
      else await hold(page, direction, 1)
    } else await page.keyboard.down(direction)
    await page.clock.runFor(200)
    await expect(page.locator('.jumping-state')).toHaveText('Ready')
    expect((await position(page)).y).toBeCloseTo(620)
    if (controller) {
      if (Math.abs(direction) === 1) await page.evaluate(() => { window.testPad.axes[1] = 0 })
      else await hold(page, direction, 0)
    } else await page.keyboard.up(direction)
    await page.clock.runFor(200)
  }
})
