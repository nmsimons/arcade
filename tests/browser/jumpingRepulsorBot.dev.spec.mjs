import { test, expect } from './helpers/test.mjs'
import { blankTrial, levelProblems, parseLevel } from '../../src/games/jumping/level.ts'
import { restartFromPause, useLevelFixtures } from './helpers/jumpingLevels.mjs'
import { readFileSync } from 'node:fs'

test.setTimeout(60000)
const motion = page => page.evaluate(() => window.jumpingMotion.read().recent.at(-1))
function fixture() {
  return { ...blankTrial(), id: 'repulsorbot-browser', name: 'Repulsorbot controls', width: 1400, height: 700, floor: 700,
    entrance: { x: 260, y: 700 }, goal: { x: 1300, y: 700, flipX: true }, timing: 'untimed',
    robots: [{ kind: 'repulsor', x: 800, y: 700, left: 26, right: 1374 }] }
}
async function open(page, file) {
  expect(() => parseLevel(file)).not.toThrow()
  expect(levelProblems(file)).toEqual([])
  await useLevelFixtures(page, [file])
  await page.addInitScript(() => {
    const proto = CanvasRenderingContext2D.prototype, fillRect = proto.fillRect, fill = proto.fill
    proto.fillRect = function (...args) {
      if (args[0] === 0 && args[1] === 0 && this.fillStyle === '#f1f1ed') {
        this.canvas.botCamera = this.getTransform(); this.canvas.repulsorBots = []
      }
      return fillRect.apply(this, args)
    }
    proto.fill = function (...args) {
      if (this.fillStyle === '#b66d65' && this.canvas.botCamera && !this.canvas.repulsorBots.length) {
        const t = this.getTransform(), camera = this.canvas.botCamera
        this.canvas.repulsorBots.push({ x: (t.e - camera.e) / camera.a, y: (t.f - camera.f) / camera.d })
      }
      return fill.apply(this, args)
    }
  })
  await page.clock.install({ time: new Date('2026-01-01T00:00:00Z') })
  await page.goto('/lab?motionDebug=1')
  const card = page.locator('.jumping-level-card[aria-pressed=true]').filter({ hasText: file.name })
  await expect(card).toBeVisible({ timeout: 15000 })
  await card.click()
  await expect(page.locator('.jumping-game > canvas')).toBeFocused({ timeout: 30000 })
  await expect(page.getByRole('dialog', { name: 'Preparing level', exact: true })).toHaveCount(0)
  await page.clock.pauseAt(new Date('2026-01-01T01:00:00Z'))
  await restartFromPause(page)
}

test('the broader player rig charges and fires from its palm, pushing the player through normal motion', async ({ page }, info) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message))
  await open(page, fixture())
  const start = (await motion(page)).x
  await page.clock.runFor(400)
  expect((await motion(page)).x).toBeCloseTo(start, 1)
  await page.screenshot({ path: info.outputPath('rbot-palm-charge.png') })
  let fired = false
  for (let i = 0; i < 60 && !fired; i++) {
    const before = (await motion(page)).x
    await page.clock.runFor(16)
    const after = (await motion(page)).x
    expect(Math.abs(after - before)).toBeLessThan(20)
    if (after < start - 1) { fired = true; await page.screenshot({ path: info.outputPath('rbot-palm-shot.png') }) }
  }
  expect(fired).toBe(true)
  await page.clock.runFor(300)
  expect((await motion(page)).x).toBeLessThan(start - 80)
  expect(await page.locator('canvas').evaluate(canvas => canvas.repulsorBots.length)).toBe(1)
  expect(errors).toEqual([])
})

test('the humanoid completes an ordinary ledge climb and keeps traversing instead of hanging up', async ({ page }, info) => {
  const file = fixture(); file.entrance.x = 1200; file.goal.x = 200; file.goal.flipX = false
  file.robots[0].x = 300
  file.platforms = [{ x: 450, y: 560, w: 160, h: 140 }, { x: 1000, y: 0, w: 30, h: 700 }]
  await open(page, file)
  const positions = []
  for (let i = 0; i < 20; i++) {
    await page.clock.runFor(300)
    positions.push(await page.locator('canvas').evaluate(canvas => canvas.repulsorBots[0]))
    if ([3, 7, 12].includes(i)) await page.screenshot({ path: info.outputPath(`rbot-climb-${i}.png`) })
  }
  expect(Math.min(...positions.map(p => p.y))).toBeLessThan(600)
  expect(Math.max(...positions.map(p => p.x))).toBeGreaterThan(800)
})

test('Uninvited Company patrol while the player waits at the entrance', async ({ page }, info) => {
  test.setTimeout(180000)
  const file = JSON.parse(readFileSync(new URL('../fixtures/jumping/uninvited-rbot-routes.json', import.meta.url), 'utf8').replace(/^\uFEFF/, ''))
  await open(page, file)
  const positions = []
  for (let i = 0; i < 8; i++) {
    await page.clock.runFor(1000)
    positions.push(await page.locator('canvas').evaluate(canvas => canvas.repulsorBots[0]))
    if ([0, 9, 19].includes(i)) await page.screenshot({ path: info.outputPath(`uninvited-entrance-${i + 1}s.png`) })
    if (positions.at(-1)?.x < 350 && positions.at(-1)?.y > 1130) break
  }
  expect(positions.every(position => position?.y > 600)).toBe(true)
  expect(positions.at(-1)?.x).toBeLessThan(350)
  expect(positions.at(-1)?.y).toBeGreaterThan(1130)
  await page.screenshot({ path: info.outputPath('uninvited-entrance-hunt.png') })
  await info.attach('patrol-positions.json', { body: JSON.stringify(positions), contentType: 'application/json' })
})

test('Aloft Rbot catches and climbs the final rope when lured into the upper structure', async ({ page }, info) => {
  test.setTimeout(180000)
  const file = JSON.parse(readFileSync(new URL('../fixtures/jumping/aloft-rbot-routes.json', import.meta.url), 'utf8'))
  // Isolate the upper encounter. Geometry, red fields, plates and wiring retain
  // their authored definitions; all play after entry uses normal controller input.
  file.name = 'Aloft upper structure lure'; file.entrance = { x: 1020, y: 1115 }
  // Begin at the end of the previous mantle: little speed and little runway.
  const robot = file.robots.find(robot => robot.kind === 'repulsor'); robot.x = 510; robot.y = 1690
  await page.addInitScript(() => {
    window.testPad = { index: 0, id: 'Lure controller', connected: true, mapping: 'standard', axes: [0, 0, 0, 0],
      buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) }
    Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => [window.testPad] })
  })
  await open(page, file)
  let wait = 0, entered = false, reachedRope = false, climbed = false, crossing = false
  const positions = []
  for (let frame = 0; frame < 150 && !entered; frame++) {
    const p = await motion(page), bot = await page.locator('canvas').evaluate(canvas => canvas.repulsorBots[0])
    const moving = ++wait >= 3, move = moving && p.x < 2050 ? 1 : 0
    if (moving && p.signals.grounded && p.x > 1615 && p.x < 1650) crossing = true
    if (p.x > 1780) crossing = false
    const jump = crossing
    if (bot.x > 850 && bot.y > 1400) reachedRope = true
    if (reachedRope && bot.y < 1250 && bot.x > 850 && bot.x < 1070) climbed = true
    entered = bot.x > 1120 && bot.y > 1100 && bot.y < 1130
    positions.push({ player: { x: p.x, y: p.y }, bot })
    await page.evaluate(({ move, jump, climb }) => {
      window.testPad.axes[0] = move ? Math.sign(move) * (.18 + .82 * Math.abs(move)) : 0
      window.testPad.buttons[0] = { pressed: jump, value: Number(jump) }
      window.testPad.buttons[12] = { pressed: climb, value: Number(climb) }
    }, { move, jump, climb: moving })
    await page.clock.runFor(96)
  }
  await info.attach('aloft-lure-positions.json', { body: JSON.stringify(positions), contentType: 'application/json' })
  await page.screenshot({ path: info.outputPath('aloft-rbot-lured-inside.png') })
  expect(reachedRope).toBe(true); expect(climbed).toBe(true); expect(entered).toBe(true)
})

test('Aloft Rbot follows the player out through the open upper structure exit', async ({ page }, info) => {
  test.setTimeout(180000)
  const file = JSON.parse(readFileSync(new URL('../fixtures/jumping/aloft-rbot-routes.json', import.meta.url), 'utf8'))
  file.name = 'Aloft open exit hunt'; file.entrance = { x: 1020, y: 1115 }
  const robot = file.robots.find(robot => robot.kind === 'repulsor')
  Object.assign(robot, { x: 1200, y: 1115, left: 26, right: file.width - 26 })
  await open(page, file)
  await page.clock.runFor(250) // Stand on the ordinary entrance toggle to open it.
  const positions = []; let followed = false, rope = false
  for (let frame = 0; frame < 150 && !followed; frame++) {
    const p = await motion(page), bot = await page.locator('canvas').evaluate(canvas => canvas.repulsorBots[0])
    rope ||= p.signals.mode === 'rope'
    const move = !rope && p.x > 935, down = p.y < 1450
    if (move) await page.keyboard.down('ArrowLeft'); else await page.keyboard.up('ArrowLeft')
    if (down) await page.keyboard.down('ArrowDown'); else await page.keyboard.up('ArrowDown')
    positions.push({ player: { x: p.x, y: p.y, mode: p.signals.mode }, bot })
    followed = !!bot && bot.x < 960 && bot.y > 1250
    await page.clock.runFor(96)
  }
  await page.keyboard.up('ArrowLeft'); await page.keyboard.up('ArrowDown')
  await info.attach('aloft-open-exit-positions.json', { body: JSON.stringify(positions), contentType: 'application/json' })
  await page.screenshot({ path: info.outputPath('aloft-rbot-followed-out.png') })
  expect((await motion(page)).x).toBeLessThan(965)
  expect(followed).toBe(true)
})
