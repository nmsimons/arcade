import { test, expect } from './helpers/test.mjs'
import { hold, tap } from './helpers/controller.mjs'

async function setup(page, controller = false) {
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
        window.jumpScreen = { x: body.e / this.canvas.width, y: (body.f - Math.abs(body.d) * 31) / this.canvas.height }
      }
      return ellipse.apply(this, args)
    }
  }, { controller })
  await page.goto('/untitled-jumping-game')
  await expect(page.getByRole('button', { name: 'Enter playground' })).toBeVisible()
  await page.clock.pauseAt(new Date('2026-01-01T01:00:00Z'))
  await page.clock.runFor(64)
}
const position = page => page.evaluate(() => window.jumpPlayer)
async function expectCentered(page) {
  const point = await page.evaluate(() => window.jumpScreen)
  expect(point.x).toBeCloseTo(.5, 5); expect(point.y).toBeCloseTo(.5, 5)
}
async function enter(page) {
  await page.getByRole('button', { name: 'Enter playground' }).click()
  await page.clock.runFor(64)
  await expect(page.locator('canvas')).toBeFocused()
}

test('keyboard walks and runs, quick taps jump, and a charged jump goes higher', async ({ page }, info) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message))
  await setup(page); await enter(page)
  await expectCentered(page)
  await page.keyboard.down('Shift'); await page.keyboard.down('d'); await page.clock.runFor(350)
  await expect(page.getByTestId('jump-speed')).toHaveText('2.1')
  await page.keyboard.up('Shift'); await page.clock.runFor(300)
  await expect(page.getByTestId('jump-speed')).toHaveText('5.8')
  const runStart = await position(page)
  await page.keyboard.down('Space'); await page.clock.runFor(400)
  await expect(page.getByTestId('jump-speed')).toHaveText('5.8')
  await expect(page.getByRole('meter')).toHaveAttribute('value', '1')
  expect((await position(page)).x - runStart.x).toBeGreaterThan(130)
  await expectCentered(page)
  await page.screenshot({ path: info.outputPath('running-charge.png') })
  await page.keyboard.up('Space')
  await page.keyboard.up('d'); await page.keyboard.press('r'); await page.clock.runFor(64)
  await page.keyboard.press('Space'); await page.clock.runFor(280)
  const short = await position(page); expect(short.y).toBeLessThan(570); expect(short.y).toBeGreaterThan(540)
  await page.clock.runFor(700)
  await page.keyboard.down('Space'); await page.clock.runFor(800)
  await expect(page.getByRole('meter')).toHaveAttribute('value', '1')
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
  await tap(page, 13) // The time trial is first; choose the movement playground below it.
  await hold(page, 0, 1, 850)
  await expect(page.getByRole('dialog')).toHaveCount(0)
  expect((await position(page)).y).toBeCloseTo(620)
  await hold(page, 0, 0); expect((await position(page)).y).toBeCloseTo(620)
  await page.evaluate(() => { window.testPad.axes[0] = .59 }); await page.clock.runFor(400)
  await expect(page.getByTestId('jump-speed')).toHaveText('2.9')
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

test('pausing while charging cancels the charge and requires fresh controller input', async ({ page }) => {
  await setup(page, true); await enter(page)
  await hold(page, 0, 1, 500); await tap(page, 9)
  await expect(page.getByRole('button', { name: 'Resume', exact: true })).toBeFocused()
  await tap(page, 9); await page.clock.runFor(300); await hold(page, 0, 0)
  expect((await position(page)).y).toBeCloseTo(620)
  await expect(page.getByRole('meter')).toHaveAttribute('value', '0')
  await hold(page, 0, 1, 100); await hold(page, 0, 0, 200)
  expect((await position(page)).y).toBeLessThan(600)
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
  // A short running hop approaches the lip from below for the automatic catch.
  await page.keyboard.down('d')
  for (let i = 0; i < 80 && (await position(page)).x < 958; i++) await page.clock.runFor(16)
  await page.keyboard.press('Space'); await page.clock.runFor(700); await page.keyboard.up('d')
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
  await page.keyboard.press('r'); await page.clock.runFor(64)
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
  await expect(page.locator('.jumping-state')).toHaveText('Rising')
  await hold(page, 0, 0)
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
    await page.getByRole('button', { name: 'Enter playground' }).focus()
    await expect(page.getByRole('button', { name: 'Enter playground' })).toBeInViewport()
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
