import { test, expect } from './helpers/test.mjs'
import { blankTrial } from '../../src/games/jumping/level.ts'
import { finishJumpingEntrance, useLevelFixtures } from './helpers/jumpingLevels.mjs'
import { tap } from './helpers/controller.mjs'

test.setTimeout(60000)

const motion = page => page.evaluate(() => window.jumpingMotion.read().recent.at(-1))
function fixture(emp = false) {
  return { ...blankTrial(), id: 'gadget-browser', name: 'Gadget controls', width: 1800, height: 600, floor: 600,
    entrance: { x: 180, y: 600 }, goal: { x: 1700, y: 600, flipX: true }, timing: 'untimed',
    props: [{ kind: 'box', gadget: emp ? 'emp' : 'repulsor', x: 210, y: 600, size: 40 },
      { kind: 'ball', x: 700, y: 600, size: 68 }],
    forceFields: [{ id: 'red', mode: 'objects', orientation: 'vertical', x: 500, y: 100, w: 12, h: 500 }] }
}
async function open(page, level, controller = false) {
  await useLevelFixtures(page, [level])
  await page.addInitScript(controller => {
    if (controller) {
      window.testPad = { index: 0, id: 'Gadget pad', connected: true, mapping: 'standard', axes: [0, 0, 0, 0],
        buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) }
      Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => [window.testPad] })
    }
    const proto = CanvasRenderingContext2D.prototype, fill = proto.fillRect, round = proto.roundRect
    proto.fillRect = function (...args) {
      if (args[0] === 0 && args[1] === 0 && this.fillStyle === '#f1f1ed') {
        this.canvas.gadgetCamera = this.getTransform(); this.canvas.sleeves = []; this.canvas.gadgetRobots = []
      }
      return fill.apply(this, args)
    }
    proto.roundRect = function (...args) {
      if (args[0] === -26 && args[2] === 51 && this.canvas.gadgetCamera) {
        const t = this.getTransform(), camera = this.canvas.gadgetCamera
        this.canvas.gadgetRobots.push({ x: (t.e - camera.e) / camera.a, y: (t.f - camera.f) / camera.d })
      }
      if (args[0] === -8 && args[1] === -4 && args[2] === 16 && args[3] === 8 && this.canvas.gadgetCamera) {
        const t = this.getTransform(), camera = this.canvas.gadgetCamera
        this.canvas.sleeves.push({ x: (t.e - camera.e) / camera.a, y: (t.f - camera.f) / camera.d,
          angle: Math.atan2(t.b, t.a), upright: t.d > 0 })
      }
      return round.apply(this, args)
    }
  }, controller)
  await page.clock.install({ time: new Date('2026-01-01T00:00:00Z') })
  await page.goto('/lab?motionDebug=1')
  const card = page.locator('.jumping-level-card[aria-pressed=true]').filter({ hasText: level.name })
  await expect(card).toBeVisible({ timeout: 15000 })
  await page.clock.pauseAt(new Date('2026-01-01T01:00:00Z'))
  await card.click(); await finishJumpingEntrance(page); await page.clock.runFor(200)
}
async function key(page, key) {
  await page.keyboard.down(key); await page.clock.runFor(48)
  await page.keyboard.up(key); await page.clock.runFor(160)
}

test('keyboard movement aims in eight directions, red fields detach, and restart restores the tool', async ({ page }, info) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message))
  await open(page, fixture())
  await key(page, 'e')
  await expect(page.getByLabel('Available actions')).toContainText('Repulsor rifle')
  const x = (await motion(page)).x
  await page.keyboard.down('ArrowUp'); await page.clock.runFor(200)
  expect((await motion(page)).x).toBeCloseTo(x, 1)
  await page.screenshot({ path: info.outputPath('sleeve-aim-up.png') })
  await page.keyboard.down('Shift'); await page.keyboard.down('ArrowRight'); await page.clock.runFor(300)
  const diagonal = await motion(page)
  expect(diagonal.x).toBeGreaterThan(x + 15)
  expect(Math.atan2(diagonal.points[4][1] - diagonal.points[3][1], diagonal.points[4][0] - diagonal.points[3][0])).toBeCloseTo(-Math.PI / 4, 6)
  await page.keyboard.up('ArrowUp'); await page.keyboard.up('ArrowRight'); await page.keyboard.up('Shift'); await page.clock.runFor(64)
  await key(page, 'f')
  await page.keyboard.down('d'); await page.clock.runFor(2200); await page.keyboard.up('d'); await page.clock.runFor(200)
  expect((await motion(page)).x).toBeGreaterThan(520)
  const sleeves = await page.locator('canvas').evaluate(canvas => canvas.sleeves)
  expect(sleeves).toHaveLength(1)
  expect(sleeves[0].x).toBeLessThan(500)
  await expect(page.getByLabel('Available actions')).not.toContainText('F fire')
  await page.keyboard.press('Escape'); await page.getByRole('button', { name: 'Restart level', exact: true }).click()
  await finishJumpingEntrance(page); await page.clock.runFor(200)
  await expect(page.getByLabel('Available actions')).toContainText('E · Repulsor rifle')
  expect(errors).toEqual([])
})

test('controller snaps to eight directions while moving and keeps the sleeve upright through turns', async ({ page }, info) => {
  await open(page, fixture(), true); await tap(page, 2)
  for (const [degrees, snapped] of [[-17, 0], [-33, -45], [-80, -90], [-121, -135], [-163, -180], [12, 0], [37, 45], [80, 90], [137, 135]]) {
    const angle = degrees * Math.PI / 180
    const before = await motion(page)
    await page.evaluate(angle => { window.testPad.axes = [Math.cos(angle) * .8, Math.sin(angle) * .8, 0, 0] }, angle)
    await page.clock.runFor(100)
    const expected = snapped * Math.PI / 180
    const sample = await motion(page), face = Math.abs(Math.cos(expected)) < .01 ? before.signals.facing : Math.cos(expected) < 0 ? -1 : 1
    expect(sample.signals.facing).toBe(face)
    if (Math.abs(Math.cos(angle)) > .5) expect(Math.abs(sample.x - before.x)).toBeGreaterThan(.1)
    const elbow = sample.points[face < 0 ? 5 : 3], wrist = sample.points[face < 0 ? 6 : 4]
    const visible = Math.atan2(wrist[1] - elbow[1], (wrist[0] - elbow[0]) * face)
    expect(Math.atan2(Math.sin(visible - expected), Math.cos(visible - expected))).toBeCloseTo(0, 6)
    await page.screenshot({ path: info.outputPath(`eight-direction-aim-${degrees}.png`) })
  }
  await page.evaluate(() => { window.testPad.axes = [-.8, 0, 0, 0] }); await page.clock.runFor(100)
  const leftSleeve = await page.locator('canvas').evaluate(canvas => canvas.sleeves.find(sleeve => sleeve.y < 580))
  expect(leftSleeve.upright).toBe(true)
  await page.screenshot({ path: info.outputPath('right-arm-left-facing.png') })
  await page.evaluate(() => { window.testPad.axes = [0, 0, 0, 0] }); await page.clock.runFor(64)
  await page.evaluate(() => { window.testPad.axes = [.8, 0, 0, 0] }); await page.clock.runFor(100)
  const rightSleeve = await page.locator('canvas').evaluate(canvas => canvas.sleeves.find(sleeve => sleeve.y < 580))
  expect(rightSleeve.upright).toBe(true)
  await page.screenshot({ path: info.outputPath('right-arm-right-facing.png') })
})

test('normal Up controls climb with the sleeve, then keep climbing after a red field strips it off', async ({ page }, info) => {
  const level = fixture()
  level.climbables.ladders = [{ x: 180, top: 120, bottom: 600, platform: -1, side: 1 }]
  level.forceFields = [{ id: 'red', mode: 'objects', orientation: 'horizontal', x: 80, y: 360, w: 200, h: 12 }]
  await open(page, level); await key(page, 'e')
  await page.keyboard.down('ArrowUp'); await page.clock.runFor(700)
  expect((await motion(page)).y).toBeLessThan(550)
  await expect(page.getByLabel('Available actions')).toContainText('Repulsor rifle')
  await page.screenshot({ path: info.outputPath('sleeve-climbing.png') })
  await page.clock.runFor(2600); await page.keyboard.up('ArrowUp')
  expect((await motion(page)).y).toBeLessThan(360)
  await expect(page.getByLabel('Available actions')).not.toContainText('F fire')
  const sleeves = await page.locator('canvas').evaluate(canvas => canvas.sleeves)
  expect(sleeves).toHaveLength(1)
  expect(sleeves[0].y).toBeGreaterThan(372)
  await page.screenshot({ path: info.outputPath('red-field-climb-detached.png') })
})

test('carried EMP activates on Use and clears the red barrier', async ({ page }) => {
  await open(page, fixture(true)); await key(page, 'e')
  await expect(page.getByLabel('Available actions')).toContainText('Carried EMP')
  await key(page, 'f')
  await page.keyboard.down('d'); await page.clock.runFor(1600); await page.keyboard.up('d')
  expect((await motion(page)).x).toBeGreaterThan(520)
})

test('the sleeve follows its supporting forearm through both directions of a rope swing', async ({ page }, info) => {
  const level = fixture()
  level.forceFields = []
  level.climbables.ropes = [{ x: 180, y: 100, length: 450, segments: 57 }]
  await open(page, level); await key(page, 'e')
  await page.keyboard.down('ArrowUp'); await page.clock.runFor(700); await page.keyboard.up('ArrowUp')
  await page.clock.runFor(400)
  expect((await motion(page)).signals.mode).toBe('rope')
  for (const key of ['ArrowRight', 'ArrowLeft']) {
    await page.keyboard.down(key)
    for (let frame = 0; frame < 4; frame++) {
      await page.clock.runFor(180)
      const sample = await motion(page), face = sample.signals.facing
      expect(sample.signals.mode).toBe('rope')
      const elbow = sample.points[face < 0 ? 5 : 3], wrist = sample.points[face < 0 ? 6 : 4]
      const sleeve = await page.locator('canvas').evaluate(canvas => canvas.sleeves.find(sleeve => sleeve.y < 580))
      expect(sleeve.x).toBeCloseTo(sample.x + (elbow[0] + wrist[0]) * .5 * face, 1)
      expect(sleeve.y).toBeCloseTo(sample.y + (elbow[1] + wrist[1]) * .5, 1)
      await page.screenshot({ path: info.outputPath(`swing-${key}-${frame}.png`) })
    }
    await page.keyboard.up(key)
  }
})

test('a repulsor shot visibly recoils the shovebot across successive frames', async ({ page }, info) => {
  const level = fixture()
  level.forceFields = []; level.props = level.props.slice(0, 1)
  level.robots = [{ x: 700, y: 600, left: 400, right: 1200 }]
  await open(page, level); await key(page, 'e')
  const position = () => page.locator('canvas').evaluate(canvas => canvas.gadgetRobots[0].x)
  const start = await position(); let previous = start
  await page.keyboard.down('f')
  for (let frame = 0; frame < 12; frame++) {
    await page.clock.runFor(16)
    const current = await position()
    expect(current).toBeGreaterThan(previous)
    expect(current - previous).toBeLessThan(17)
    previous = current
    if ([0, 5, 11].includes(frame)) await page.screenshot({ path: info.outputPath(`shovebot-recoil-${frame}.png`) })
  }
  await page.keyboard.up('f')
  expect(previous - start).toBeGreaterThan(90)
  expect(previous - start).toBeLessThan(180)
})
