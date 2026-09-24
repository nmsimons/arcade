import { test, expect } from './helpers/test.mjs'
import { hold } from './helpers/controller.mjs'
import { restartFromPause, useLevelFixtures } from './helpers/jumpingLevels.mjs'
import { CAMPAIGN } from '../helpers/jumping-fixtures.mjs'
import { blankTrial } from '../../src/games/jumping/level.ts'

async function setup(page, lesson = 0, levels = CAMPAIGN) {
  await useLevelFixtures(page, levels)
  await page.clock.install({ time: new Date('2026-01-01T00:00:00Z') })
  await page.addInitScript(() => {
    const proto = CanvasRenderingContext2D.prototype, rect = proto.fillRect, ellipse = proto.ellipse, arc = proto.arc, text = proto.fillText
    proto.arc = function (...args) {
      if (args[2] === 11 && ['#a9d56b', '#9aa38e'].includes(this.fillStyle)) {
        const t = this.getTransform()
        window.goalLight = { lit: this.fillStyle === '#a9d56b', x: (args[0] * t.a + t.e) / this.canvas.width, y: (args[1] * t.d + t.f) / this.canvas.height }
      }
      return arc.apply(this, args)
    }
    proto.fillRect = function (...args) {
      if (args[0] === 0 && args[1] === 0 && this.fillStyle === '#f1f1ed') { window.levelCamera = this.getTransform(); window.wallTimerReadings = []; window.goalDoor = null }
      if (this.fillStyle === '#000000' && args[3] === 80) window.goalDoor = { x: args[0], y: args[1], w: args[2], h: args[3] }
      return rect.apply(this, args)
    }
    proto.fillText = function (value, ...args) {
      if (/^\d+:\d{2}\.\d{2}$/.test(value)) window.wallTimerReadings.push(value)
      return text.call(this, value, ...args)
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
  await expect(page.getByRole('button', { name: 'Start level', exact: false })).toBeVisible()
  await page.clock.pauseAt(new Date('2026-01-01T01:00:00Z'))
  if (lesson) await page.getByRole('button', { name: `Level ${lesson + 1}:`, exact: false }).click()
}
const position = page => page.evaluate(() => window.levelPlayer)
async function enter(page) { await page.getByRole('button', { name: 'Start level' }).click(); await page.clock.runFor(64) }
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
  await page.getByRole('button', { name: 'Level 3: Hand Over Hand' }).click()
  await expect(page.locator('.jumping-level-detail')).toContainText('Transfer from the first rope')
})
test('the trial waits, pauses, restarts, completes, saves a best and advances to the next lesson', async ({ page }, info) => {
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
  await page.getByRole('button', { name: 'Next level' }).click(); await page.clock.runFor(100)
  await expect(page.getByRole('img', { name: 'A Little Swing: activate the goal' })).toBeFocused()
  expect((await position(page)).x).toBeCloseTo(170); await expect(page.getByTestId('level-time')).toHaveText('0:00.00')
  await page.clock.resume(); await page.reload(); await expect(page.getByText(/Gold · 0:02/)).toBeVisible()
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
  const before = await position(page)
  await page.keyboard.down('Space'); await page.clock.runFor(64); await page.keyboard.up('Space')
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
for (const controller of [false, true]) test(`${controller ? 'controller' : 'keyboard'} braces, falls, and jumps away on a fresh press`, async ({ page }, info) => {
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
  const beforeKick = await position(page)
  await jump(true, 100) // Holding toward the wall must not cancel the outward kick.
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
  await expect(page.getByRole('region', { name: 'How to play' })).toContainText('Hold, release to jump')
  await expect(page.getByRole('button', { name: 'Resume', exact: true })).toBeFocused()
  await expect(page.getByRole('button', { name: 'Restart level', exact: true })).toBeInViewport()
  await page.screenshot({ path: info.outputPath('pause-controls-mobile.png') })
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

test('the light opens a hidden black door, locks the timer, and waits for a pausable exit before saving results', async ({ page }, info) => {
  const level = blankTrial(); level.goal.x = 500; level.spawn.x = 450
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
  await expect(page.getByTestId('level-time')).toHaveText(time)
  expect(await page.evaluate(() => window.wallTimerReadings)).toEqual([time, time])
  expect(await page.evaluate(() => localStorage.getItem('arcade.jumping.times.v1'))).toBeNull()
  await page.screenshot({ path: info.outputPath('hidden-door-open.png') })
  await page.keyboard.down('d')
  for (let i = 0; i < 100 && await page.locator('.jumping-state').innerText() !== 'Entering the exit'; i++) await page.clock.runFor(16)
  await page.keyboard.up('d'); await page.clock.runFor(160)
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
  await expect(page.locator('.jumping-result-time')).toHaveText(time)
  expect(await page.evaluate(id => JSON.parse(localStorage.getItem('arcade.jumping.times.v1'))[id], level.id)).toBeGreaterThan(0)
})

test('an object can open a distant exit without moving the camera or completing; restart hides it again', async ({ page }, info) => {
  const level = blankTrial(); level.goal.x = 1500
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
