import { test, expect } from './helpers/test.mjs'
import { hold } from './helpers/controller.mjs'
import { restartFromPause, useLevelFixtures } from './helpers/jumpingLevels.mjs'
import { CAMPAIGN } from '../helpers/jumping-fixtures.mjs'
import { blankTrial, levelProblems } from '../../src/games/jumping/level.ts'
import { installDigitalClockSpy, wallTimeFromHud } from './helpers/digitalClock.mjs'
import { ropeSlope, slopedLip } from '../helpers/rope-slope.mjs'

async function setup(page, lesson = 0, levels = CAMPAIGN) {
  await useLevelFixtures(page, levels)
  await page.clock.install({ time: new Date('2026-01-01T00:00:00Z') })
  await installDigitalClockSpy(page)
  await page.addInitScript(() => {
    const proto = CanvasRenderingContext2D.prototype, rect = proto.fillRect, ellipse = proto.ellipse, arc = proto.arc
    proto.arc = function (...args) {
      if (args[2] === 11 && ['#a9d56b', '#9aa38e'].includes(this.fillStyle)) {
        const t = this.getTransform()
        window.goalLight = { lit: this.fillStyle === '#a9d56b', x: (args[0] * t.a + t.e) / this.canvas.width, y: (args[1] * t.d + t.f) / this.canvas.height }
      }
      return arc.apply(this, args)
    }
    proto.fillRect = function (...args) {
      if (args[0] === 0 && args[1] === 0 && this.fillStyle === '#f1f1ed') { window.levelCamera = this.canvas.levelCamera = this.getTransform(); window.goalDoor = null }
      if (this.fillStyle === '#000000' && args[3] === 80) window.goalDoor = { x: args[0], y: args[1], w: args[2], h: args[3] }
      return rect.apply(this, args)
    }
    proto.ellipse = function (...args) {
      if (args[2] === 6.2 && args[3] === 6.2 && window.levelCamera) {
        const body = this.getTransform(), camera = window.levelCamera
        window.levelPlayer = { x: (body.e - camera.e) / camera.a, y: (body.f - camera.f) / camera.d }
      }
      return ellipse.apply(this, args)
    }
  })
  await page.goto('/untitled-jumping-game')
  await expect(page.locator('.jumping-level-card[aria-pressed=true]')).toBeVisible()
  await page.clock.pauseAt(new Date('2026-01-01T01:00:00Z'))
  if (lesson) await page.getByRole('button', { name: `Level ${lesson + 1}:`, exact: false }).focus()
}
const position = page => page.evaluate(() => window.levelPlayer)
async function enter(page) {
  await page.locator('.jumping-level-card[aria-pressed=true]').click()
  await expect(page.locator('canvas[role="img"]')).toBeFocused()
  await page.clock.runFor(64)
}
async function launch(page) {
  await page.keyboard.down('d'); await page.keyboard.down('Space')
  for (let i = 0; i < 150 && (await position(page)).x < 533; i++) await page.clock.runFor(16)
  await page.keyboard.up('Space'); await page.keyboard.down('w')
}
async function finishFirst(page) {
  await launch(page); await page.clock.runFor(4000); await page.keyboard.up('d'); await page.keyboard.up('w')
  await expect(page.getByRole('dialog', { name: 'Level complete' })).toBeVisible()
}

test('the new level menu presents a readable progression', async ({ page }, info) => {
  await setup(page); await page.screenshot({ path: info.outputPath('campaign-menu.png') })
  await expect(page.getByRole('button', { name: 'Level 1: First Leap' })).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('button', { name: 'Level 3: Hand Over Hand' }).focus()
  await expect(page.locator('.jumping-level-detail').getByRole('heading', { name: 'Hand Over Hand', exact: true })).toBeVisible()
  await expect(page.locator('.jumping-level-detail .jumping-medal-times')).toHaveText('Gold 11sSilver 18sBronze 32s')
})
test('the trial waits, pauses, restarts, completes, saves a best and advances to the next lesson', async ({ page }, info) => {
  // Advancing the virtual clock still renders every frame on the CI runner.
  test.setTimeout(60000)
  await setup(page); await enter(page)
  await page.clock.runFor(1500); await expect(page.getByTestId('level-time')).toHaveText('0:00.00')
  await page.keyboard.down('d'); await page.clock.runFor(400); await page.keyboard.up('d')
  await page.keyboard.press('Escape'); await page.clock.runFor(5000)
  await page.getByRole('button', { name: 'Resume', exact: true }).click(); await page.clock.runFor(100)
  expect(await page.getByTestId('level-time').innerText()).toMatch(/^0:00\./)
  await page.clock.runFor(300)
  const moved = await position(page)
  expect(moved.x).toBeGreaterThan(200)
  for (const key of ['r', 'y', 'p']) { await page.keyboard.press(key); await page.clock.runFor(64) }
  expect(await position(page)).toEqual(moved)
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await page.keyboard.press('Escape')
  await expect(page.getByRole('button', { name: 'Resume', exact: true })).toBeFocused()
  await page.keyboard.press('r')
  await expect(page.getByRole('dialog', { name: 'Game paused' })).toBeVisible()
  await page.keyboard.press('ArrowDown')
  await expect(page.getByRole('button', { name: 'Restart level', exact: true })).toBeFocused()
  await page.keyboard.press('Enter'); await page.clock.runFor(100)
  expect((await position(page)).x).toBeCloseTo(170)
  await expect(page.getByTestId('level-time')).toHaveText('0:00.00')
  await page.screenshot({ path: info.outputPath('first-leap.png') })
  await finishFirst(page); await expect(page.getByText('Gold medal')).toBeVisible()
  await page.screenshot({ path: info.outputPath('first-leap-medal.png') })
  const record = await page.evaluate(() => JSON.parse(localStorage.getItem('arcade.jumping.times.v1'))['first-leap'])
  expect(record).toBeGreaterThan(2); expect(record).toBeLessThan(3.5)
  // Hold the real worker request to exercise a next level that finishes loading
  // after the paused animation clock has advanced, as it can on a busy CI runner.
  let releasePreparation
  const preparation = new Promise(resolve => { releasePreparation = resolve })
  const delayPreparation = async route => { await preparation; await route.continue() }
  await page.route('**/ropeLayout.worker*', delayPreparation)
  await page.getByRole('button', { name: 'Next level' }).click()
  await expect(page.getByRole('dialog', { name: 'Preparing level', exact: true })).toBeVisible()
  await page.clock.runFor(100)
  releasePreparation()
  await expect(page.getByRole('img', { name: 'A Little Swing: reach the exit' })).toBeFocused()
  // Read the new level only after it has rendered and published its reset timer.
  await page.clock.runFor(100)
  await page.unroute('**/ropeLayout.worker*', delayPreparation)
  expect((await position(page)).x).toBeCloseTo(170); await expect(page.getByTestId('level-time')).toHaveText('0:00.00')
  await page.clock.resume(); await page.reload()
  await expect(page.getByRole('img', { name: 'A Little Swing: reach the exit' })).toBeFocused()
  await page.keyboard.press('Escape'); await page.getByRole('button', { name: 'Level menu', exact: true }).click()
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('arcade.jumping.times.v1'))['first-leap'])).toBe(record)
})
for (const lesson of [1, 2]) test(`lesson ${lesson + 1} can be completed with ${lesson} rope${lesson > 1 ? 's' : ''} using the keyboard`, async ({ page }, info) => {
  test.setTimeout(90000); await setup(page, lesson); await enter(page); await launch(page)
  for (let rope = 0; rope < lesson; rope++) {
    for (let i = 0; i < 120 && !(await page.locator('.jumping-state').innerText()).startsWith('Rope'); i++) await page.clock.runFor(32)
    await expect(page.locator('.jumping-state')).toContainText('Rope')
    await page.keyboard.up('d')
    const climbY = lesson === 1 ? 380 : 330
    for (let i = 0; i < 200 && (await position(page)).y > climbY; i++) await page.clock.runFor(16)
    await page.keyboard.up('w'); await page.keyboard.down('d')
    const anchor = lesson === 1 ? 850 : rope === 0 ? 810 : 1140
    let previous = await position(page), forward = false, direction = 1
    for (let i = 0; i < 240; i++) {
      await page.clock.runFor(32)
      const current = await position(page)
      const velocity = (current.x - previous.x) / .032
      forward = i >= 7 && current.x > anchor + 55 && velocity > 120
      previous = current
      if (forward) break
      // Pump with the swing, as in the gameplay route test. Holding one direction
      // can miss the launch window depending on the timing of the incoming catch.
      if (Math.abs(velocity) > 3 && Math.sign(velocity) !== direction) {
        await page.keyboard.up(direction > 0 ? 'd' : 'a'); direction = Math.sign(velocity)
        await page.keyboard.down(direction > 0 ? 'd' : 'a')
      }
    }
    expect(forward).toBe(true)
    await page.keyboard.up('a'); await page.keyboard.down('d')
    await page.screenshot({ path: info.outputPath(`lesson-${lesson + 1}-rope-${rope + 1}.png`) })
    await page.keyboard.down('Space'); await page.clock.runFor(32); await page.keyboard.up('Space'); await page.keyboard.down('w'); await page.clock.runFor(160)
  }
  await page.clock.runFor(5000); await page.keyboard.up('d'); await page.keyboard.up('w')
  await expect(page.getByRole('dialog', { name: 'Level complete' })).toBeVisible()
  expect(await page.getByText(/^(Gold|Silver|Bronze) medal$/).count()).toBe(1)
})
test('jumping again during a rope catch does not launch at catch-animation speed', async ({ page }) => {
  await setup(page, 1); await enter(page); await launch(page)
  for (let i = 0; i < 120 && !(await page.locator('.jumping-state').innerText()).startsWith('Rope'); i++) await page.clock.runFor(32)
  await expect(page.locator('.jumping-state')).toContainText('Rope')
  await page.keyboard.up('w'); await page.clock.runFor(80)
  await page.keyboard.down('Space'); await page.clock.runFor(64)
  await expect(page.locator('.jumping-state')).toContainText('Rope')
  const before = await position(page)
  await page.keyboard.up('Space'); await page.clock.runFor(64)
  const after = await position(page)
  await expect(page.locator('.jumping-state')).not.toContainText('Rope')
  expect(after.x - before.x).toBeGreaterThan(10)
  expect(after.x - before.x).toBeLessThan(31)
})
test('a fall is recoverable by the ladder and does not restart the clock', async ({ page }) => {
  await setup(page); await enter(page)
  await page.keyboard.down('d'); await page.clock.runFor(1400); await page.keyboard.up('d'); await page.clock.runFor(1300)
  expect((await position(page)).y).toBeCloseTo(920)
  await page.keyboard.down('a')
  for (let i = 0; i < 80 && (await position(page)).x > 578; i++) await page.clock.runFor(16)
  await page.keyboard.up('a'); await page.keyboard.down('w'); await page.clock.runFor(6500); await page.keyboard.up('w')
  expect((await position(page)).y).toBeCloseTo(520); expect((await position(page)).x).toBeLessThan(560)
  await expect(page.getByTestId('level-time')).not.toHaveText('0:00.00')
})
for (const controller of [false, true]) test(`${controller ? 'controller' : 'keyboard'} braces, falls, and jumps away on release`, async ({ page }, info) => {
  if (controller) await page.addInitScript(() => {
    window.testPad = { index: 0, id: 'Wall brace controller', connected: true, mapping: 'standard', axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) }
    Object.defineProperty(navigator, 'getGamepads', { value: () => [window.testPad] })
  })
  await setup(page); await enter(page)
  const jump = async (down, ms) => {
    if (controller) await hold(page, 0, Number(down), ms)
    else {
      await page.keyboard[down ? 'down' : 'up']('Space')
      await page.clock.runFor(ms)
    }
  }
  if (controller) await page.evaluate(() => { window.testPad.axes[0] = 1 })
  else await page.keyboard.down('d')
  await page.clock.runFor(2400)
  expect((await position(page)).y).toBeCloseTo(920)
  expect((await position(page)).x).toBeGreaterThan(850)
  await jump(true, 400); await jump(false, 440)
  const before = await position(page)
  expect(before.y).toBeLessThan(815)
  expect(before.x).toBeCloseTo(868)
  await expect(page.locator('.jumping-state')).toHaveText('Bracing')
  await page.clock.runFor(400)
  expect((await position(page)).x).toBeCloseTo(868)
  await expect(page.locator('.jumping-state')).toHaveText('Bracing')
  await page.screenshot({ path: info.outputPath('wall-brace.png') })
  const falling = await position(page)
  await page.clock.runFor(120)
  expect((await position(page)).y).toBeGreaterThan(falling.y + 15)
  expect((await position(page)).x).toBeCloseTo(868)
  const charging = await position(page)
  await jump(true, 32)
  expect((await position(page)).x).toBeCloseTo(charging.x)
  await expect(page.locator('.jumping-state')).toHaveText('Bracing')
  const beforeKick = await position(page)
  await jump(false, 100) // Holding toward the wall must not cancel the released kick.
  expect((await position(page)).x).toBeLessThan(beforeKick.x - 25)
  expect((await position(page)).y).toBeLessThan(beforeKick.y - 40)
  await expect(page.locator('.jumping-state')).toHaveText('Wall jump')
  await page.screenshot({ path: info.outputPath('wall-jump.png') })
  const kicked = await position(page)
  await jump(false, 300)
  expect((await position(page)).x).toBeLessThan(kicked.x - 65)
  const apex = await position(page)
  await page.clock.runFor(200)
  expect((await position(page)).x).toBeLessThan(apex.x - 25)
  expect((await position(page)).y).toBeGreaterThan(apex.y)
  await page.clock.runFor(600)
  expect((await position(page)).y).toBeCloseTo(920)
  await expect(page.locator('.jumping-state')).not.toHaveText('Bracing')
})
test('the simple level view remains usable on a narrow screen', async ({ page }, info) => {
  await setup(page); await enter(page)
  await expect(page.getByRole('button')).toHaveCount(0)
  await expect(page.locator('.jumping-header, .jumping-footer, .jumping-telemetry')).toHaveCount(0)
  await expect(page.getByRole('meter')).toHaveCount(0)
  await page.screenshot({ path: info.outputPath('simple-terrain.png') })
  await page.setViewportSize({ width: 390, height: 740 }); await page.clock.runFor(100)
  await expect(page.getByRole('button')).toHaveCount(0)
  await page.screenshot({ path: info.outputPath('trial-mobile.png') })
  await page.keyboard.press('Escape')
  await expect(page.getByRole('button', { name: 'Resume', exact: true })).toBeFocused()
  await expect(page.getByRole('button', { name: 'Restart level', exact: true })).toBeInViewport()
  await expect(page.getByRole('region', { name: 'How to play' })).toHaveCount(0)
  const pauseBounds = await page.locator('.jumping-dialog-panel').boundingBox()
  await page.getByRole('button', { name: 'Controls', exact: true }).click()
  await expect(page.getByRole('region', { name: 'How to play' })).toContainText('Hold, release to jump')
  expect(await page.locator('.jumping-dialog-panel').boundingBox()).toEqual(pauseBounds)
  await expect(page.getByRole('button', { name: 'Back', exact: true })).toBeFocused()
  await page.screenshot({ path: info.outputPath('pause-controls-mobile.png') })
  await page.keyboard.press('Escape')
  await expect(page.getByRole('button', { name: 'Controls', exact: true })).toBeFocused()
  await page.getByRole('button', { name: 'Resume', exact: true }).click(); await page.clock.runFor(64)
  await expect(page.getByRole('region', { name: 'How to play' })).toHaveCount(0)
})

test('pushing a ball transfers motion to a box without either prop passing through the other', async ({ page }, info) => {
  await page.addInitScript(() => {
    const proto = CanvasRenderingContext2D.prototype, arc = proto.arc, roundRect = proto.roundRect
    window.propPositions = {}
    proto.arc = function (...args) {
      if (args[2] === 40 && this.fillStyle === '#8f9e98') window.propPositions.ball = { x: args[0], y: args[1] + 40 }
      return arc.apply(this, args)
    }
    proto.roundRect = function (...args) {
      if (args[2] === 80 && args[3] === 80 && this.fillStyle === '#b3a28d') {
        const t = this.getTransform()
        window.propPositions.box = { x: args[0] + 40, y: args[1] + 80, angle: Math.atan2(t.b, t.a) }
      }
      return roundRect.apply(this, args)
    }
  })
  const level = blankTrial(); level.spawn.x = 250
  level.props = [{ kind: 'ball', x: 360, y: 920, size: 80 }, { kind: 'box', x: 460, y: 920, size: 80 }]
  await setup(page, 0, [level]); await enter(page)
  await page.keyboard.down('d')
  for (let i = 0; i < 30; i++) {
    await page.clock.runFor(64)
    const { ball, box } = await page.evaluate(() => window.propPositions)
    const c = Math.cos(box.angle), s = Math.sin(box.angle), dx = ball.x - box.x, dy = ball.y - box.y
    const x = dx * c + dy * s, y = -dx * s + dy * c
    const distance = Math.hypot(x - Math.max(-40, Math.min(40, x)), y - Math.max(-40, Math.min(40, y)))
    expect(distance).toBeGreaterThanOrEqual(39.95)
    expect(ball.y).toBeCloseTo(920, 1)
    expect(box.y - 40 + 40 * (Math.abs(c) + Math.abs(s))).toBeCloseTo(920, 1)
  }
  await page.keyboard.up('d')
  expect((await page.evaluate(() => window.propPositions.box)).x).toBeGreaterThan(500)
  await page.screenshot({ path: info.outputPath('ball-pushing-box.png') })
})

test('a rolling ball stops against the player at a closed gate on a slope', async ({ page }, info) => {
  const level = blankTrial()
  level.platforms = [{ x: 200, y: 550, w: 1200, h: 370, polygon: [[0,0],[1200,360],[1200,370],[0,370]] }]
  level.spawn = { x: 870, y: 751 }
  level.mechanisms = [{ id: 'gate', kind: 'gate', x: 900, y: 350, w: 20, h: 570, travel: 570 }]
  level.props = [{ kind: 'ball', x: 710, y: 703, size: 100 }]
  await setup(page, 0, [level]); await enter(page)
  await page.keyboard.down('w'); await page.clock.runFor(32); await page.keyboard.up('w')
  for (let i = 0; i < 60; i++) {
    await page.clock.runFor(64)
    expect((await position(page)).x).toBeLessThanOrEqual(888.01)
  }
  expect((await position(page)).x).toBeGreaterThan(885)
  await page.screenshot({ path: info.outputPath('ball-player-gate-contact.png') })
})

test('the player can jump out from a ball beside a tilted box and closed gate', async ({ page }, info) => {
  const level = blankTrial()
  level.platforms = [{ x: 200, y: 737, w: 1200, h: 183, profile: [[0,183],[440,0],[880,183],[1200,183]] }]
  level.mechanisms = [{ id: 'gate', kind: 'gate', x: 750, y: 450, w: 20, h: 470, travel: 300 }]
  level.props = [{ kind: 'ball', x: 716, y: 769, size: 68 }, { kind: 'box', x: 650, y: 778, size: 80 }]
  level.platforms.push({ x: 550, y: 620, w: 80, h: 12 })
  level.spawn = { x: 600, y: 620 }
  await setup(page, 0, [level]); await enter(page)
  await page.keyboard.down('d')
  for (let i = 0; i < 80 && (await position(page)).x < 685; i++) await page.clock.runFor(16)
  await page.keyboard.up('d'); await page.clock.runFor(1200)
  const before = await position(page)
  expect(before.x).toBeGreaterThan(690); expect(before.x).toBeLessThan(740)
  expect(before.y).toBeGreaterThan(690); expect(before.y).toBeLessThan(725)
  await page.keyboard.down('a'); await page.clock.runFor(300)
  await page.keyboard.down('Space'); await page.clock.runFor(180); await page.keyboard.up('Space')
  await page.clock.runFor(330)
  expect((await position(page)).y).toBeLessThan(before.y - 50)
  await page.screenshot({ path: info.outputPath('jumping-out-from-ball.png') })
  await page.clock.runFor(750); await page.keyboard.up('a')
  expect((await position(page)).x).toBeLessThan(before.x - 80)
})

test('a separate Switch plate opens a hidden black door; entering stops the timer and a pausable exit saves results', async ({ page }, info) => {
  const level = blankTrial(); level.goal.x = 500; level.spawn.x = 450
  level.goal.id = 'exit'; level.goal.power = 'switched'
  level.triggers = [{ x: 480, y: 920, w: 80, mode: 'weight', behavior: 'switch', targets: ['exit'] }]
  level.timers = [{ x: 340, y: 740 }, { x: 740, y: 660 }]
  await setup(page, 0, [level]); await enter(page)
  expect(await page.evaluate(() => window.goalDoor)).toBeNull()
  expect((await page.evaluate(() => window.goalLight)).lit).toBe(false)
  await page.screenshot({ path: info.outputPath('hidden-door-closed.png') })
  await page.keyboard.down('d')
  for (let i = 0; i < 100 && !await page.evaluate(() => window.goalLight.lit); i++) await page.clock.runFor(16)
  await page.keyboard.up('d'); await page.clock.runFor(500)
  const time = await page.getByTestId('level-time').innerText()
  expect(await page.evaluate(() => window.goalDoor)).toEqual({ x: 580, y: 840, w: 40, h: 80 })
  await page.clock.runFor(4000)
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.getByTestId('level-time')).not.toHaveText(time)
  const runningTime = await page.getByTestId('level-time').innerText()
  const wallTimes = await page.getByRole('img', { name: 'Untitled level: reach the exit' }).evaluate(c => c.digitalClocks.map(clock => clock.value))
  expect(wallTimes).toEqual([wallTimeFromHud(runningTime), wallTimeFromHud(runningTime)])
  expect(wallTimes[0]).not.toBe(wallTimeFromHud(time))
  expect(await page.evaluate(() => localStorage.getItem('arcade.jumping.times.v1'))).toBeNull()
  await page.screenshot({ path: info.outputPath('hidden-door-open.png') })
  await page.keyboard.down('d')
  for (let i = 0; i < 100 && await page.locator('.jumping-state').innerText() !== 'Entering the exit'; i++) await page.clock.runFor(16)
  await page.keyboard.up('d'); await page.clock.runFor(160)
  const finishTime = await page.getByTestId('level-time').innerText()
  expect(finishTime).not.toBe(runningTime)
  expect(await page.getByRole('img', { name: 'Untitled level: reach the exit' }).evaluate(c => c.digitalClocks.map(clock => clock.value)))
    .toEqual([wallTimeFromHud(finishTime), wallTimeFromHud(finishTime)])
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await page.screenshot({ path: info.outputPath('entering-hidden-door.png') })
  await page.keyboard.press('Escape')
  const paused = await position(page)
  await page.clock.runFor(3000)
  await expect(page.getByRole('dialog', { name: 'Game paused' })).toBeVisible()
  expect(await position(page)).toEqual(paused)
  await page.getByRole('button', { name: 'Resume', exact: true }).click(); await page.clock.runFor(1000)
  await expect(page.getByRole('dialog', { name: 'Level complete' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Level complete.' })).toBeVisible()
  await expect(page.locator('.jumping-result-time')).toHaveText(finishTime)
  expect(await page.evaluate(id => JSON.parse(localStorage.getItem('arcade.jumping.times.v1'))[id], level.id)).toBeGreaterThan(0)
})

test('an object can open a distant exit without moving the camera or completing; restart hides it again', async ({ page }, info) => {
  const level = blankTrial(); level.goal.x = 1500
  level.goal.id = 'exit'; level.goal.power = 'switched'
  level.triggers = [{ x: 1472, y: 920, w: 56, mode: 'weight', behavior: 'switch', targets: ['exit'] }]
  level.props = [{ kind: 'ball', x: 1500, y: level.floor - 80, size: 80 }]
  await setup(page, 0, [level]); await enter(page)
  await page.keyboard.down('w'); await page.clock.runFor(32); await page.keyboard.up('w')
  for (let i = 0; i < 90 && !await page.evaluate(() => window.goalLight.lit); i++) await page.clock.runFor(16)
  expect((await page.evaluate(() => window.goalLight)).lit).toBe(true)
  expect((await position(page)).x).toBeLessThan(200)
  await page.clock.runFor(650)
  expect((await position(page)).x).toBeLessThan(200)
  expect(await page.evaluate(() => window.goalDoor)).not.toBeNull()
  await page.clock.runFor(4000); await expect(page.getByRole('dialog')).toHaveCount(0)
  await page.screenshot({ path: info.outputPath('remote-ball-goal-lit.png') })
  await page.keyboard.press('Escape'); await page.clock.runFor(4000)
  await expect(page.getByRole('dialog', { name: 'Game paused' })).toBeVisible()
  await page.getByRole('button', { name: 'Resume', exact: true }).click(); await page.clock.runFor(200)
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await restartFromPause(page); await page.clock.runFor(2000)
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.getByTestId('level-time')).toHaveText('0:00.00')
  expect((await page.evaluate(() => window.goalLight)).lit).toBe(false)
  expect(await page.evaluate(() => window.goalDoor)).toBeNull()
})

for (const anchor of ['summit', 'shoulder']) test(`Up climbs a rope draped over a steep shoulder (${anchor} anchor)`, async ({ page }, info) => {
  // The full rope simulation can render slower than real time on shared runners.
  test.setTimeout(60000)
  await setup(page, 0, [ropeSlope(false, { anchor, length: anchor === 'shoulder' ? 180 : 380 })]); await enter(page)
  await page.keyboard.down('Space'); await page.clock.runFor(370); await page.keyboard.up('Space')
  await page.keyboard.down('d'); await page.keyboard.down('w')
  for (let i = 0; i < 70 && !(await page.locator('.jumping-state').innerText()).startsWith('Rope'); i++) await page.clock.runFor(16)
  await page.keyboard.up('d')
  await expect(page.locator('.jumping-state')).toContainText('Rope')
  if (anchor === 'shoulder') {
    for (let i = 0; i < 240 && await page.locator('.jumping-state').innerText() !== 'Climbing'; i++) await page.clock.runFor(16)
    await expect(page.locator('.jumping-state')).toHaveText('Climbing')
    await page.clock.runFor(200)
  } else await page.clock.runFor(900)
  await page.screenshot({ path: info.outputPath('rope-slope-climbing.png') })
  await page.clock.runFor(4000); await page.keyboard.up('w')
  await expect(page.locator('.jumping-state')).toHaveText('Ready')
  const landed = await position(page)
  expect(landed.x).toBeGreaterThanOrEqual(760); expect(landed.x).toBeLessThan(900)
  expect(landed.y).toBeGreaterThanOrEqual(360); expect(landed.y).toBeLessThanOrEqual(400)
  await page.screenshot({ path: info.outputPath('rope-slope-standing.png') })
  await page.keyboard.down('d'); await page.clock.runFor(160); await page.keyboard.up('d')
  expect((await position(page)).x).toBeGreaterThan(landed.x + 10)
})

for (const slope of [-.2, .2]) test(`Up climbs around a sloped lip (${slope})`, async ({ page }, info) => {
  await setup(page, 0, [slopedLip(false, slope)]); await enter(page)
  await page.keyboard.down('w')
  for (let i = 0; i < 350 && await page.locator('.jumping-state').innerText() !== 'Climbing'; i++) await page.clock.runFor(16)
  await expect(page.locator('.jumping-state')).toHaveText('Climbing')
  await page.clock.runFor(420)
  await page.screenshot({ path: info.outputPath('sloped-lip-pull-up.png') })
  await page.clock.runFor(1600)
  await expect(page.locator('.jumping-state')).toHaveText('Ready')
  const landed = await position(page)
  expect(landed.x).toBeCloseTo(1140); expect(landed.y).toBeCloseTo(460 + 20 * slope)
  await page.screenshot({ path: info.outputPath('sloped-lip-standing.png') })
  await page.keyboard.up('w'); await page.keyboard.down('a'); await page.clock.runFor(160); await page.keyboard.up('a')
  expect((await position(page)).x).toBeLessThan(landed.x - 10)
})

test('a pointed ramp with an inward-slanting face supports a jump, hang, and pull-up', async ({ page }, info) => {
  const level = blankTrial(); level.name = 'Pointed ramp'; level.width = 1200; level.height = level.floor = 600
  level.spawn = { x: 514, y: 580 }; level.goal = { x: 1040, y: 580 }
  level.platforms = [{ x: 0, y: 300, w: 1200, h: 300,
    polygon: [[0,280],[320,280],[500,180],[480,280],[1200,280],[1200,300],[0,300]] }]
  await setup(page, 0, [level]); await enter(page)
  await page.keyboard.down('a'); await page.keyboard.down('Space'); await page.clock.runFor(32)
  await page.keyboard.up('Space'); await page.clock.runFor(550); await page.keyboard.up('a'); await page.clock.runFor(150)
  await expect(page.locator('.jumping-state')).toHaveText('Hanging')
  expect((await position(page)).x).toBeCloseTo(514); expect((await position(page)).y).toBeCloseTo(554)
  await page.screenshot({ path: info.outputPath('pointed-ramp-hanging.png') })
  await page.keyboard.down('w'); await page.clock.runFor(1500); await page.keyboard.up('w')
  await expect(page.locator('.jumping-state')).toHaveText('Ready')
  expect((await position(page)).x).toBeCloseTo(480); expect((await position(page)).y).toBeCloseTo(480 + 20 * 100 / 180)
  await page.screenshot({ path: info.outputPath('pointed-ramp-climbed.png') })
})

test('objects occlude collectibles, wall timers and text in thumbnails and gameplay', async ({ page }, info) => {
  const level = blankTrial(); level.name = 'Wall layers'; level.width = 1280; level.height = level.floor = 620
  level.spawn = { x: 80, y: 620 }; level.goal = { x: 1120, y: 620 }
  const kinds = ['coin', 'stopwatch', 'fast-stopwatch', 'time-bonus', 'time-penalty', 'emp']
  level.pickups = kinds.map((kind, i) => ({ kind, x: 200 + i * 160, y: 560,
    ...(['time-bonus', 'time-penalty'].includes(kind) ? { seconds: 5 } : {}) }))
  level.props = kinds.map((_, i) => ({ kind: i % 2 ? 'box' : 'ball', x: 200 + i * 160, y: 620, size: 120 }))
  level.props.push({ kind: 'box', x: 430, y: 350, size: 200 }, { kind: 'box', x: 800, y: 350, size: 200 })
  level.platforms = [{ x: 310, y: 350, w: 240, h: 20 }, { x: 680, y: 350, w: 240, h: 20 }]
  level.timers = [{ x: 330, y: 220 }]
  level.texts = [{ x: 715, y: 225, w: 150, h: 60, text: 'BEHIND', fontSize: 24, align: 'left' }]
  expect(levelProblems(level)).toEqual([])
  const regions = [...level.pickups.map(p => ({ x: p.x - 24, y: p.y - 32, w: 48, h: 60 })),
    { x: 330, y: 220, w: 200, h: 60 }, { x: 715, y: 225, w: 150, h: 60 }]
  const exposed = level.pickups.map(p => ({ ...p, y: 430 }))
  level.pickups.push(...exposed)
  const exposedRegions = exposed.map(p => ({ x: p.x - 24, y: p.y - 32, w: 48, h: 60 }))
  const visibleInk = (canvas, areas = regions) => canvas.evaluate((c, regions) => {
    const ctx = c.getContext('2d'), m = c.levelCamera
    const wall = new Set(['ba8542', 'dfb44f', 'ac7b35', '94433f', '718074', 'e2e7da', '40574a'])
    const objects = new Set(['8f9e98', '667b72', 'b3a28d', '938777'])
    return regions.map(r => {
      const x = Math.ceil(r.x * m.a + m.e), y = Math.ceil(r.y * m.d + m.f)
      const data = ctx.getImageData(x, y, Math.floor(r.w * m.a), Math.floor(r.h * m.d)).data
      let leaked = 0, object = 0
      for (let i = 0; i < data.length; i += 4) {
        const color = [data[i], data[i + 1], data[i + 2]].map(v => v.toString(16).padStart(2, '0')).join('')
        if (wall.has(color)) leaked++
        if (objects.has(color)) object++
      }
      return { leaked, object }
    })
  }, areas)
  const check = async canvas => {
    const samples = await visibleInk(canvas)
    for (const sample of samples) { expect(sample.leaked).toBe(0); expect(sample.object).toBeGreaterThan(0) }
  }
  await setup(page, 0, [level])
  const thumbnail = page.locator('.jumping-level-card[aria-pressed=true] canvas')
  await expect.poll(() => thumbnail.evaluate(c => c.width)).toBeGreaterThan(1)
  await check(thumbnail)
  await enter(page)
  await check(page.locator('canvas[role="img"]'))
  for (const sample of await visibleInk(page.locator('canvas[role="img"]'), exposedRegions)) {
    expect(sample.leaked, 'each uncovered collectible is still drawn').toBeGreaterThan(0)
  }
  await page.screenshot({ path: info.outputPath('wall-items-behind-objects.png') })
})

test('the first staircase approach and a restart keep the rendered leg outside the second step', async ({ page }, info) => {
  const level = blankTrial(); level.name = 'Staircase clearance'; level.width = 1200; level.height = level.floor = 620
  level.spawn = { x: 268, y: 620 }; level.goal = { x: 1040, y: 620 }
  level.platforms = [{ x: 300, y: 420, w: 380, h: 200,
    polygon: [[0,180],[80,180],[80,140],[180,140],[180,80],[280,80],[280,0],[380,0],[380,200],[0,200]] }]
  expect(levelProblems(level)).toEqual([])
  await setup(page, 0, [level]); await enter(page)
  for (const attempt of ['first', 'restart']) {
    if (attempt === 'restart') { await restartFromPause(page); await page.clock.runFor(64) }
    await page.keyboard.down('d')
    let sampled = 0, saved = false
    for (let i = 0; i < 110 && (await position(page)).x < 420; i++) {
      await page.clock.runFor(16)
      const p = await position(page)
      if (p.x < 345) continue
      const ink = await page.evaluate(feetY => {
        const canvas = document.querySelector('canvas[role="img"]'), camera = window.levelCamera
        // Restrict the pixel probe to the legs; a hand can legitimately grip the lip.
        const x = Math.ceil(381 * camera.a + camera.e), y = Math.ceil(Math.max(561, feetY - 28) * camera.d + camera.f)
        const w = Math.floor(477 * camera.a + camera.e) - x, h = Math.floor(619 * camera.d + camera.f) - y
        const pixels = canvas.getContext('2d').getImageData(x, y, w, h).data
        let count = 0
        for (let j = 0; j < pixels.length; j += 4) if (pixels[j] === 104 && pixels[j + 1] === 107 && pixels[j + 2] === 110) count++
        return count
      }, p.y)
      expect(ink, `${attempt} approach at ${p.x},${p.y}: leg silhouette inside solid terrain`).toBe(0)
      sampled++
      if (!saved && p.x > 367 && p.y > 580) {
        await page.screenshot({ path: info.outputPath(`staircase-${attempt}-leg-clearance.png`) }); saved = true
      }
    }
    await page.keyboard.up('d')
    expect(sampled).toBeGreaterThan(15)
    expect((await position(page)).x).toBeGreaterThanOrEqual(420)
    expect((await position(page)).y).toBeCloseTo(560)
  }
})

test('sustained walking pulls up a three-tile ledge without a jump', async ({ page }, info) => {
  const level = blankTrial(); level.name = 'Three tile climb'; level.width = 1200; level.height = level.floor = 620
  level.spawn = { x: 220, y: 620 }; level.goal = { x: 1040, y: 620 }
  level.platforms = [{ x: 300, y: 560, w: 300, h: 60 }]
  expect(levelProblems(level)).toEqual([])
  await setup(page, 0, [level]); await enter(page)
  await page.keyboard.down('d')
  for (let i = 0; i < 40 && await page.locator('.jumping-state').innerText() !== 'Pushing'; i++) await page.clock.runFor(16)
  expect((await position(page)).y).toBeCloseTo(620)
  await expect(page.locator('.jumping-state')).toHaveText('Pushing')
  for (let i = 0; i < 30 && await page.locator('.jumping-state').innerText() !== 'Climbing'; i++) await page.clock.runFor(16)
  await expect(page.locator('.jumping-state')).toHaveText('Climbing')
  await page.clock.runFor(32)
  await page.screenshot({ path: info.outputPath('three-tile-pull-up.png') })
  await page.clock.runFor(450); await page.keyboard.up('d'); await page.clock.runFor(200)
  expect((await position(page)).x).toBeGreaterThan(320)
  expect((await position(page)).y).toBeCloseTo(560)
  await expect(page.locator('.jumping-state')).toHaveText('Ready')
})

test('crouch walking passes through a two-tile opening after bracing against it', async ({ page }, info) => {
  const level = blankTrial(); level.name = 'Two tile clearance'; level.width = 1200; level.height = level.floor = 620
  level.spawn = { x: 220, y: 620 }; level.goal = { x: 1040, y: 620 }
  level.platforms = [{ x: 300, y: 540, w: 160, h: 40 }]
  expect(levelProblems(level)).toEqual([])
  await setup(page, 0, [level]); await enter(page)
  await page.keyboard.down('d'); await page.clock.runFor(700)
  expect((await position(page)).x).toBeCloseTo(274.5)
  await page.keyboard.down('s'); await page.clock.runFor(800)
  expect((await position(page)).x).toBeGreaterThan(350)
  expect((await position(page)).x).toBeLessThan(390)
  await page.screenshot({ path: info.outputPath('two-tile-crouch-walk.png') })
  await page.keyboard.up('d'); await page.keyboard.up('s'); await page.clock.runFor(300)
  await expect(page.locator('.jumping-state')).toHaveText('Crouching')
  await page.keyboard.down('s'); await page.keyboard.down('d'); await page.clock.runFor(1200)
  await page.keyboard.up('d'); await page.keyboard.up('s'); await page.clock.runFor(300)
  expect((await position(page)).x).toBeGreaterThan(480)
  await expect(page.locator('.jumping-state')).toHaveText('Ready')
})

for (const pointed of [false, true]) test(`crouch-walking lowers from a ${pointed ? 'pointed' : 'flat'} lip under a low ceiling and pulls back up`, async ({ page }, info) => {
  const level = blankTrial(); level.name = 'Low ceiling ledge'; level.width = 1800; level.height = level.floor = 700
  level.spawn = { x: 360, y: pointed ? 560 : 480 }; level.goal = { x: 1640, y: 700 }
  level.robots = [{ x: 1200, y: 700, left: 900, right: 1500 }]
  level.platforms = [
    { x: 260, y: 380, w: 400, h: pointed ? 240 : 200,
      polygon: pointed ? [[0,240],[400,0],[360,240]] : [[0,200],[200,0],[400,0],[400,200]] },
    { x: 460, y: 300, w: 360, h: 40 },
  ]
  expect(levelProblems(level)).toEqual([])
  await setup(page, 0, [level]); await enter(page)
  await page.keyboard.down('s'); await page.keyboard.down('d'); await page.clock.runFor(5500)
  await page.keyboard.up('d'); await page.keyboard.up('s'); await page.clock.runFor(80)
  await expect(page.locator('.jumping-state')).toHaveText('Hanging')
  expect((await position(page)).x).toBeCloseTo(674); expect((await position(page)).y).toBeCloseTo(454)
  await page.screenshot({ path: info.outputPath('low-ceiling-hanging.png') })
  await page.keyboard.down('w'); await page.clock.runFor(650)
  await page.screenshot({ path: info.outputPath('low-ceiling-pull-up.png') })
  await page.clock.runFor(650); await page.keyboard.up('w'); await page.clock.runFor(200)
  await expect(page.locator('.jumping-state')).toHaveText('Crouching')
  expect((await position(page)).x).toBeCloseTo(640); expect((await position(page)).y).toBeCloseTo(pointed ? 392 : 380)
  await page.screenshot({ path: info.outputPath('low-ceiling-crouched.png') })
})

test('clutter below a low ledge keeps a stable grip and allows a crouched pull-up after restart', async ({ page }, info) => {
  const level = { ...blankTrial(), name: 'Cluttered ledge', width: 1400, height: 700, floor: 620,
    spawn: { x: 460, y: 560 }, goal: { x: 1240, y: 620 },
    platforms: [
      { x: 400, y: 520, w: 300, h: 100, polygon: [[0,100],[100,0],[300,0],[300,100]] },
      { x: 540, y: 440, w: 320, h: 40 },
    ],
    props: [{ kind: 'box', x: 715, y: 620, size: 30 }, { kind: 'ball', x: 745, y: 620, size: 30 }],
    robots: [{ x: 820, y: 620, left: 400, right: 1000 }],
  }
  expect(levelProblems(level)).toEqual([])
  await setup(page, 0, [level]); await enter(page)
  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt) { await restartFromPause(page); await page.clock.runFor(64) }
    await page.keyboard.down('s'); await page.keyboard.down('d'); await page.clock.runFor(4000)
    await page.keyboard.up('d'); await page.keyboard.up('s'); await page.clock.runFor(80)
    await expect(page.locator('.jumping-state')).toHaveText('Hanging')
    expect((await position(page)).x).toBeCloseTo(714); expect((await position(page)).y).toBeCloseTo(594)
    for (let i = 0; i < 20; i++) {
      await page.clock.runFor(32)
      expect((await position(page)).x).toBeCloseTo(714); expect((await position(page)).y).toBeCloseTo(594)
    }
    await page.screenshot({ path: info.outputPath(`cluttered-ledge-hang-${attempt}.png`) })
    await page.keyboard.down('w'); await page.clock.runFor(450)
    await page.screenshot({ path: info.outputPath(`cluttered-ledge-pull-${attempt}.png`) })
    await page.clock.runFor(1050); await page.keyboard.up('w')
    await expect(page.locator('.jumping-state')).toHaveText('Crouching')
    expect((await position(page)).x).toBeCloseTo(680); expect((await position(page)).y).toBeCloseTo(520)
  }
})

test('Up climbs a narrow post joined to a platform above a closed gate', async ({ page }, info) => {
  const level = blankTrial(); level.name = 'Joined gate ledge'; level.width = 1200; level.height = level.floor = 660
  level.spawn = { x: 550, y: 660 }; level.goal = { x: 1000, y: 660 }
  level.platforms = [{ x: 600, y: 500, w: 20, h: 80 }, { x: 620, y: 500, w: 280, h: 20 }]
  level.mechanisms = [{ id: 'gate', kind: 'gate', x: 600, y: 580, w: 20, h: 80, travel: 80 }]
  await setup(page, 0, [level]); await enter(page)
  await page.keyboard.down('Space'); await page.clock.runFor(170); await page.keyboard.up('Space')
  await page.keyboard.down('d'); await page.clock.runFor(900); await page.keyboard.up('d')
  await expect(page.locator('.jumping-state')).toHaveText('Hanging')
  const hanging = await position(page)
  expect(hanging.x).toBeCloseTo(586); expect(hanging.y).toBeCloseTo(574)
  await page.screenshot({ path: info.outputPath('joined-gate-hanging.png') })
  await page.keyboard.down('w'); await page.clock.runFor(1700); await page.keyboard.up('w')
  await expect(page.locator('.jumping-state')).toHaveText('Ready')
  expect((await position(page)).x).toBeCloseTo(620); expect((await position(page)).y).toBeCloseTo(500)
  await page.screenshot({ path: info.outputPath('joined-gate-climbed.png') })
})

test('a player can jump to a large box, hang, and climb onto its flat top', async ({ page }, info) => {
  const level = blankTrial(); level.name = 'Box ledge'; level.spawn = { x: 370, y: 920 }
  level.props = [{ kind: 'box', x: 500, y: 920, size: 160 }]
  await setup(page, 0, [level]); await enter(page)
  await page.keyboard.down('Space'); await page.clock.runFor(170); await page.keyboard.up('Space')
  await page.keyboard.down('d'); await page.clock.runFor(900); await page.keyboard.up('d')
  await expect(page.locator('.jumping-state')).toHaveText('Hanging')
  await page.clock.runFor(1000)
  const hanging = await position(page)
  expect(hanging.x).toBeCloseTo(406, 0); expect(hanging.y).toBeCloseTo(834, 0)
  await page.screenshot({ path: info.outputPath('box-hanging.png') })
  await page.keyboard.down('w'); await page.clock.runFor(1700); await page.keyboard.up('w')
  await expect(page.locator('.jumping-state')).toHaveText('Ready')
  expect((await position(page)).y).toBeCloseTo(760, 0)
  await page.screenshot({ path: info.outputPath('box-climbed.png') })
})
