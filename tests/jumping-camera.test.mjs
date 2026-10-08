import test from 'node:test'
import assert from 'node:assert/strict'
import { GameCamera, gameCamera, LEVEL_BOTTOM_PADDING } from '../src/games/jumping/camera.ts'
import { blankTrial, levelHeight } from '../src/games/jumping/level.ts'
import { createRun, stepRun } from '../src/games/jumping/challenge.ts'
import { createPlayer, NEUTRAL_INPUT, STEP, TUNING } from '../src/games/jumping/model.ts'

const sizes = [{ width: 320, height: 740 }, { width: 390, height: 844 }, { width: 844, height: 390 }, { width: 1280, height: 800 }]
const room = (height = 600, width = 4000) => ({ ...blankTrial(), width, height, floor: height, spawn: { x: 1500, y: height }, goal: { x: width - 200, y: height } })
const screen = (c, point) => [(point[0] - c.x) * c.zoom, (point[1] - c.y) * c.zoom]

test('phone challenge framing gives a readable figure and balances unused short-room space', () => {
  const level = room(), p = createPlayer(level.spawn)
  for (const size of sizes) {
    const c = gameCamera(size.width, size.height, p, level, true)
    assert.ok(TUNING.height * c.zoom >= 37, 'the standing hull occupies at least 37 CSS pixels')
    const top = screen(c, [p.x, 0])[1], bottom = size.height - screen(c, [p.x, levelHeight(level)])[1]
    if (levelHeight(level) * c.zoom + LEVEL_BOTTOM_PADDING * 2 <= size.height) {
      assert.ok(Math.abs(top - bottom) < 1e-7, 'unused space is shared above and below the whole short room')
      for (const inverted of [false, true]) for (const y of [62, 300, 600]) {
        assert.deepEqual(gameCamera(size.width, size.height, { ...p, y, inverted }, level, true), c, 'moving or flipping inside a fitting room does not move the frame vertically')
      }
    } else assert.ok(bottom >= LEVEL_BOTTOM_PADDING - 1e-7, 'larger rooms retain floor padding')
  }
})

test('tall-room framing keeps enclosing support visible and is continuous where a resize begins fitting the whole room', () => {
  for (const challenge of [false, true]) for (const inverted of [false, true]) {
    const level = room(1800), p = createPlayer({ x: 1500, y: inverted ? 0 : 1800 }); p.inverted = inverted
    const c = gameCamera(390, 844, p, level, challenge)
    const sole = screen(c, [p.x, p.y])[1]
    assert.ok(sole >= LEVEL_BOTTOM_PADDING - 1e-7 && sole <= 844 - LEVEL_BOTTOM_PADDING + 1e-7, 'the gravity-facing contact stays inside the padded view')
    const short = room(600), positions = [62, 300, 600]
    for (const y of positions) {
      const anchor = { ...p, y }, frames = []
      for (let height = 422; height <= 426; height += .1) frames.push(gameCamera(320, height, anchor, short, true))
      for (let i = 1; i < frames.length; i++) {
        assert.ok(Math.abs(frames[i].y - frames[i - 1].y) * frames[i].zoom < .11, 'the fitted-room boundary does not reset framing')
      }
    }
  }
})

test('a narrow-screen running held jump reveals useful destination footing before commitment and lands through the ordinary motor', () => {
  for (const size of sizes) {
    const level = room(1000); level.spawn.y = 600
    level.platforms = [{ x: 0, y: 600, w: 1780, h: 400 }, { x: 2030, y: 600, w: 450, h: 400 }]
    const run = createRun(level), camera = new GameCamera()
    camera.view(size.width, size.height, run.player, level, true)
    for (let i = 0; i < 48; i++) {
      stepRun(run, { ...NEUTRAL_INPUT, move: 1 })
      camera.view(size.width, size.height, run.player, level, true, STEP)
    }
    const before = structuredClone(run.player), c = camera.view(size.width, size.height, run.player, level, true)
    assert.deepEqual(run.player, before, 'a view sample does not change motor or presentation state')
    const [landingX, landingY] = screen(c, [2030, 600])
    assert.ok(landingX >= 0 && landingX <= size.width - 24 * c.zoom, 'at least a body-width strip of the next support is visible before pressing jump')
    assert.ok(landingY > 0 && landingY < size.height - 16, 'the useful top contact is in view')
    const frames = []
    for (let i = 0; i < 156; i++) {
      stepRun(run, { ...NEUTRAL_INPUT, move: i < 140 ? 1 : 0, jump: i < 22 })
      const c = camera.view(size.width, size.height, run.player, level, true, STEP)
      const body = screen(c, [run.player.x, run.player.y - TUNING.height / 2])
      assert.ok(body[0] > 24 && body[0] < size.width - 24, 'the figure retains space behind it')
      assert.ok(body[1] > 24 && body[1] < size.height - 24, 'the flight and contact remain visible')
      frames.push({ ...c, x: run.player.x, y: run.player.y, grounded: run.player.grounded })
    }
    assert.ok(frames.some(f => !f.grounded), 'the route uses a jump')
    assert.ok(frames.some(f => f.grounded && f.x > 2030 && f.y === 600), 'the actual destination supplies the landing')
  }
})

test('walking stays centered; running lead blends through real reversal and settles without facing-driven snaps', () => {
  const size = { width: 320, height: 740 }, level = room(), run = createRun(level), camera = new GameCamera()
  let previous, maxShift = 0
  for (let i = 0; i < 480; i++) {
    const move = i < 60 ? TUNING.walkSpeed / TUNING.runSpeed : i < 150 ? 1 : i < 240 ? -1 : 0
    stepRun(run, { ...NEUTRAL_INPUT, move })
    const c = camera.view(size.width, size.height, run.player, level, true, STEP), bodyX = screen(c, [run.player.x, run.player.y])[0]
    if (i < 60) assert.ok(Math.abs(bodyX - size.width / 2) < 1e-7, 'precision walking remains centered')
    if (previous) maxShift = Math.max(maxShift, Math.abs(c.x - previous.x) * c.zoom)
    assert.ok(bodyX > 24 && bodyX < size.width - 24)
    previous = c
  }
  assert.ok(maxShift < 7, `camera changes continuously across the complete turn: ${maxShift}`)
  assert.ok(Math.abs(screen(previous, [run.player.x, run.player.y])[0] - size.width / 2) < .001, 'stopping returns to calm centered framing')
  const p = run.player, c = camera.view(size.width, size.height, p, level, true), before = structuredClone(p)
  p.facing *= -1
  assert.deepEqual(camera.view(size.width, size.height, p, level, true), c, 'a facing flip alone does not change the camera')
  p.facing *= -1; assert.deepEqual(p, before)
})

test('running toward both room ends keeps the room clamp and resets lead for a fresh player', () => {
  const level = room(1000), camera = new GameCamera(), p = createPlayer({ x: 3800, y: 1000 })
  p.vx = 410
  for (let i = 0; i < 120; i++) camera.view(320, 740, p, level, true, STEP)
  const right = camera.view(320, 740, p, level, true)
  assert.ok(right.x + 320 / right.zoom <= level.width + 40 + 1e-7)
  p.x = 200; p.vx = -410
  for (let i = 0; i < 120; i++) camera.view(320, 740, p, level, true, STEP)
  assert.ok(camera.view(320, 740, p, level, true).x >= -40)
  const next = createPlayer({ x: 1500, y: 1000 })
  assert.deepEqual(camera.view(320, 740, next, level, true), gameCamera(320, 740, next, level, true), 'restarting does not inherit the preceding run direction')
})
