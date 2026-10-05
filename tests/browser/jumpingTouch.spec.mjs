import { test, expect } from './helpers/test.mjs'
import { blankTrial } from '../../src/games/jumping/level.ts'
import { useLevelFixtures } from './helpers/jumpingLevels.mjs'
import { advanceJumpingSimulation as advance } from './helpers/simulation.mjs'

test.use({ viewport: { width: 852, height: 393 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true })
async function open(page, level = blankTrial()) {
  await useLevelFixtures(page, [level])
  await page.addInitScript(() => {
    const proto = CanvasRenderingContext2D.prototype, rect = proto.fillRect, ellipse = proto.ellipse
    proto.fillRect = function (...args) {
      if (args[0] === 0 && args[1] === 0 && this.fillStyle === '#f1f1ed') this.canvas.touchCamera = this.getTransform()
      return rect.apply(this, args)
    }
    proto.ellipse = function (...args) {
      if (args[2] === 6.2 && args[3] === 6.2 && this.canvas.touchCamera) {
        const body = this.getTransform(), camera = this.canvas.touchCamera
        window.touchPlayer = { x: (body.e - camera.e) / camera.a, y: (body.f - camera.f) / camera.d }
        window.touchMinY = Math.min(window.touchMinY ?? Infinity, window.touchPlayer.y)
      }
      return ellipse.apply(this, args)
    }
  })
  await page.clock.install({ time: new Date('2026-01-01T00:00:00Z') })
  await page.goto('/untitled-jumping-game')
  await expect(page.locator('.jumping-level-card[aria-pressed=true]')).toBeVisible()
  await page.clock.pauseAt(new Date('2026-01-01T01:00:00Z'))
  await page.locator('.jumping-level-card[aria-pressed=true]').click()
  await expect(page.getByRole('button', { name: 'Pause game', exact: true })).toBeVisible()
  await advance(page, 100)
  return level
}
const position = page => page.evaluate(() => window.touchPlayer)
async function pointer(page, type, id, x = 700, y = 270) {
  await page.locator('.jumping-game > canvas').evaluate((canvas, p) => canvas.dispatchEvent(new PointerEvent(p.type, {
    pointerType: 'touch', pointerId: p.id, isPrimary: p.id === 1,
    clientX: p.x, clientY: p.y, buttons: p.type === 'pointerup' ? 0 : 1, bubbles: true, cancelable: true,
  })), { type, id, x, y })
}
async function flick(page, id, direction) {
  await pointer(page, 'pointerdown', id, 180, 240)
  await page.clock.runFor(32)
  await pointer(page, 'pointermove', id, 180, 240 - direction * 40)
  await page.clock.runFor(32)
  await pointer(page, 'pointerup', id, 180, 240 - direction * 40)
}
async function verticalHold(page, id, direction) {
  await pointer(page, 'pointerdown', id, 180, 240)
  await page.clock.runFor(32)
  await pointer(page, 'pointermove', id, 180, 240 - direction * 40)
  await advance(page, 150)
}

test('native tap jumps once; an upward flick gives greater height and gameplay suppresses browser defaults', async ({ page }) => {
  const level = await open(page)
  const canvas = page.locator('.jumping-game > canvas')
  const styles = await canvas.evaluate(c => {
    const style = getComputedStyle(c)
    return { action: style.touchAction, select: style.getPropertyValue('-webkit-user-select') || style.userSelect }
  })
  expect(styles).toEqual({ action: 'none', select: 'none' })
  expect(await canvas.evaluate(c => {
    const e = new MouseEvent('contextmenu', { bubbles: true, cancelable: true }); c.dispatchEvent(e); return e.defaultPrevented
  })).toBe(true)
  await page.touchscreen.tap(426, 240)
  await advance(page, 1300)
  const low = level.spawn.y - await page.evaluate(() => window.touchMinY)
  expect(low).toBeGreaterThan(45); expect(low).toBeLessThan(55)
  expect((await position(page)).y).toBeCloseTo(level.spawn.y, 1)
  await page.evaluate(() => { window.touchMinY = Infinity })
  await flick(page, 1, 1); await advance(page, 1400)
  const high = level.spawn.y - await page.evaluate(() => window.touchMinY)
  expect(high).toBeGreaterThan(190); expect(high).toBeLessThan(225)
  expect((await position(page)).y).toBeCloseTo(level.spawn.y, 1)
  await advance(page, 500)
  await expect(page.locator('.jumping-state')).toHaveText('Ready')
})

test('two fingers walk, run, jump and crouch without switching ownership or jumping on movement release', async ({ page }, info) => {
  const level = await open(page)
  await pointer(page, 'pointerdown', 1)
  await advance(page, 120)
  expect((await position(page)).x).toBeCloseTo(level.spawn.x, 1)
  await advance(page, 500)
  await expect(page.locator('.jumping-touch-contact')).toHaveText('Walk →')
  const walked = await position(page)
  expect(walked.x).toBeGreaterThan(level.spawn.x + 40)
  expect(walked.y).toBeCloseTo(level.spawn.y, 1)
  await pointer(page, 'pointermove', 1, 740, 270); await advance(page, 450)
  await expect(page.locator('.jumping-touch-contact')).toHaveText('Run →')
  const running = await position(page)
  expect(running.x).toBeGreaterThan(walked.x + 130)
  await pointer(page, 'pointerdown', 2, 180, 240); await page.clock.runFor(32)
  await pointer(page, 'pointerup', 2, 180, 240); await advance(page, 1200)
  expect((await position(page)).x).toBeGreaterThan(running.x + 350)
  await expect(page.locator('.jumping-touch-contact')).toHaveText('Run →')
  await verticalHold(page, 2, -1); await advance(page, 350)
  await expect(page.locator('.jumping-state')).toHaveText('Crouching')
  await page.screenshot({ path: info.outputPath('touch-crouch-walk.png') })
  await pointer(page, 'pointerup', 2, 180, 280)
  await pointer(page, 'pointermove', 1, 700, 270); await advance(page, 400)
  await expect(page.locator('.jumping-touch-contact')).toHaveText('Run ←')
  await pointer(page, 'pointerup', 1, 700, 270); await advance(page, 500)
  const stopped = await position(page)
  await advance(page, 300); expect(await position(page)).toEqual(stopped)
  expect(stopped.y).toBeCloseTo(level.spawn.y, 1)
})

test('cancellation, lost capture, pause and rotation clear held movement and queued actions', async ({ page }, info) => {
  const level = await open(page)
  for (const cancel of ['pointercancel', 'lostpointercapture']) {
    await pointer(page, 'pointerdown', 1); await pointer(page, 'pointermove', 1, 740, 270)
    await advance(page, 250)
    await pointer(page, 'pointerdown', 2, 180, 240); await pointer(page, 'pointerup', 2, 180, 240)
    await pointer(page, cancel, 1, 740, 270)
    await advance(page, 400)
    expect((await position(page)).y).toBeCloseTo(level.spawn.y, 1)
    const stopped = await position(page)
    await advance(page, 200); expect(await position(page)).toEqual(stopped)
  }
  await pointer(page, 'pointerdown', 1); await advance(page, 300)
  await page.getByRole('button', { name: 'Pause game', exact: true }).click()
  await expect(page.getByRole('dialog', { name: 'Game paused' })).toBeVisible()
  expect(await page.locator('.jumping-game > canvas').evaluate(c => getComputedStyle(c).touchAction)).toBe('auto')
  await page.getByRole('button', { name: 'Controls', exact: true }).click()
  await expect(page.getByRole('region', { name: 'How to play' })).toContainText('flick up and lift')
  await expect(page.getByRole('heading', { name: 'Controls.', exact: true })).toBeInViewport()
  await expect(page.getByText('Jump / higher jump', { exact: true })).toBeInViewport()
  await expect(page.getByRole('button', { name: 'Back', exact: true })).toBeInViewport()
  await page.screenshot({ path: info.outputPath('touch-controls.png') })
  await page.getByText('Let go', { exact: true }).scrollIntoViewIfNeeded()
  await expect(page.getByText('Let go', { exact: true })).toBeInViewport()
  await expect(page.getByRole('button', { name: 'Back', exact: true })).toBeInViewport()
  await page.getByRole('button', { name: 'Back', exact: true }).click()
  await page.getByRole('button', { name: /^Resume/ }).click()
  await pointer(page, 'pointerup', 1); await advance(page, 500)
  const resumed = await position(page)
  await advance(page, 300); expect(await position(page)).toEqual(resumed)
  expect(resumed.y).toBeCloseTo(level.spawn.y, 1)
  await pointer(page, 'pointerdown', 1); await advance(page, 200)
  await page.evaluate(() => window.dispatchEvent(new Event('orientationchange')))
  await expect(page.getByRole('dialog', { name: 'Game paused' })).toContainText('orientation changed')
})

test('vertical holds climb and descend a ladder; a down flick lets go and a tap jumps away', async ({ page }, info) => {
  const level = blankTrial()
  level.climbables.ladders = [{ x: level.spawn.x, top: 600, bottom: level.spawn.y, platform: -1, side: 1 }]
  await open(page, level)
  await verticalHold(page, 1, 1); await advance(page, 550)
  await expect(page.locator('.jumping-state')).toHaveText('Ladder · ascending')
  const upper = await position(page)
  expect(upper.y).toBeLessThan(level.spawn.y - 30)
  await pointer(page, 'pointerup', 1, 180, 200)
  await verticalHold(page, 1, -1); await advance(page, 200)
  const lower = await position(page)
  expect(lower.y).toBeGreaterThan(upper.y + 12)
  await pointer(page, 'pointerup', 1, 180, 280)
  await flick(page, 1, -1); await page.clock.runFor(32)
  await expect(page.locator('.jumping-touch-contact')).toHaveCount(0)
  await advance(page, 100)
  await expect(page.locator('.jumping-state')).toHaveText('Falling')
  await advance(page, 600)
  await verticalHold(page, 1, 1); await advance(page, 400)
  await pointer(page, 'pointerup', 1, 180, 200)
  const beforeJump = await position(page)
  await page.touchscreen.tap(426, 240); await advance(page, 128)
  expect((await position(page)).y).toBeLessThan(beforeJump.y - 30)
  await expect(page.locator('.jumping-state')).toHaveText('Rising')
  await page.screenshot({ path: info.outputPath('touch-ladder-jump.png') })
})

test('trusted simultaneous contacts retain capture when the action finger lifts', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'Native multitouch injection requires Chromium CDP; WebKit covers native taps and adapter sequences.')
  const level = await open(page)
  await page.evaluate(() => {
    window.touchNativeIds = []
    document.addEventListener('pointerdown', e => {
      if (e.pointerType === 'touch') window.touchNativeIds.push(e.pointerId)
    })
  })
  const session = await page.context().newCDPSession(page)
  const mover = { id: 1, x: 700, y: 270 }, action = { id: 2, x: 180, y: 240 }
  await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [mover] })
  await advance(page, 180)
  mover.x = 740
  await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [mover] })
  await advance(page, 250)
  await expect(page.locator('.jumping-touch-contact')).toHaveText('Run →')
  expect((await position(page)).x).toBeGreaterThan(level.spawn.x + 50)
  await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [mover, action] })
  await page.clock.runFor(32)
  expect(await page.locator('.jumping-game > canvas').evaluate(c => window.touchNativeIds.map(id => c.hasPointerCapture(id)))).toEqual([true, true])
  // Release the action contact while retaining the captured movement contact.
  await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [action] })
  await advance(page, 200)
  await expect(page.locator('.jumping-touch-contact')).toHaveText('Run →')
  expect((await position(page)).y).toBeLessThan(level.spawn.y - 30)
  expect(await page.locator('.jumping-game > canvas').evaluate(c => c.hasPointerCapture(window.touchNativeIds[0]))).toBe(true)
  await session.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] })
  await advance(page, 1000)
  await expect(page.locator('.jumping-touch-contact')).toHaveCount(0)
  const stopped = await position(page)
  await advance(page, 250)
  expect(await position(page)).toEqual(stopped)
  expect(stopped.y).toBeCloseTo(level.spawn.y, 1)
  await session.detach()
})
