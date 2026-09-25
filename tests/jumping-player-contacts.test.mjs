import test from 'node:test'
import assert from 'node:assert/strict'
import { createRun, stepRun } from '../src/games/jumping/challenge.ts'
import { blankTrial } from '../src/games/jumping/level.ts'
import { createPlayer, NEUTRAL_INPUT, STEP, stepPlayer, TUNING } from '../src/games/jumping/model.ts'
import { playerContacts } from '../src/games/jumping/playerContacts.ts'
import { ballShape, boxShape } from '../src/games/jumping/propGeometry.ts'
import { platformSurface } from '../src/games/jumping/terrain.ts'
import { athletePose } from '../src/games/jumping/athlete.ts'
import { bodyIntersects } from '../src/games/jumping/geometry.ts'

const advance = (run, frames, input = {}) => {
  for (let i = 0; i < frames; i++) stepRun(run, { ...NEUTRAL_INPUT, ...input })
}

test('nearest contact wins in either direction, independent of collider order, and a wall shields props', () => {
  for (const direction of [-1, 1]) {
    const floor = { x: 0, y: 920, w: 2000, h: 40 }
    const p = createPlayer({ x: 600, y: 920 })
    const make = gap => ({ kind: 'box', x: p.x + direction * (gap + 40), y: 920, size: 80, angle: 0, grounded: true, vx: 0, vy: 0 })
    const near = make(25), far = make(35)
    const collider = (id, prop) => ({ id, prop, platform: boxShape(prop) })
    const a = collider('near', near), b = collider('far', far), ground = { id: 'floor', platform: floor }
    for (const colliders of [[ground, a, b], [b, a, ground]]) {
      const world = { colliders, platforms: colliders.map(c => c.platform) }
      const contacts = playerContacts(p, { ...NEUTRAL_INPUT, move: direction }, world)
      assert.equal(contacts.support.collider.id, 'floor')
      assert.equal(contacts.push.collider.prop, near)
      assert.equal(playerContacts({ ...p, charging: true, jumpHeld: true }, { ...NEUTRAL_INPUT, move: direction }, world).push, null,
        'a released jump must not apply a final shove before takeoff')
    }
    const wall = { id: 'wall', platform: { x: p.x + direction * 30 - (direction < 0 ? 2 : 0), y: 700, w: 2, h: 220 } }
    const colliders = [b, ground, wall]
    assert.equal(playerContacts(p, { ...NEUTRAL_INPUT, move: direction }, { colliders, platforms: colliders.map(c => c.platform) }).push, null,
      'a wall outside bracing reach still prevents a shove through it')
  }
})

test('one resolved frame drives wall and box bracing, with no pose double-step', () => {
  for (const prop of [false, true]) {
    const level = blankTrial(); level.spawn = { x: 474.5, y: 920 }
    if (prop) level.props = [{ kind: 'box', x: 540, y: 920, size: 80 }]
    else level.platforms = [{ x: 500, y: 700, w: 80, h: 220 }]
    const run = createRun(level), p = run.player
    for (let i = 1; i <= 24; i++) {
      const before = { x: p.x, y: p.y }
      advance(run, 1, { move: 1 })
      assert.ok(p.contacts.push)
      assert.ok(Math.abs(p.pushing.amount - Math.min(1, i * STEP / .14)) < 1e-12)
      assert.equal(p.pushing.wallX, p.contacts.push.hands.wallX)
      assert.ok(Math.abs(p.contacts.motion.x - (p.x - before.x)) < 1e-10)
      assert.ok(Math.abs(p.contacts.motion.y - (p.y - before.y)) < 1e-10)
    }
    advance(run, 1, { move: -1 })
    assert.equal(p.contacts.push, null); assert.equal(p.pushing, null)
  }
})

test('a blocked box keeps the solved body and animation still and releases for a jump', () => {
  const level = blankTrial(); level.spawn = { x: 474.5, y: 920 }
  level.props = [{ kind: 'box', x: 540, y: 920, size: 80 }]
  level.platforms = [{ x: 580, y: 700, w: 100, h: 220 }]
  const run = createRun(level), p = run.player
  advance(run, 240, { move: 1 })
  const start = { x: p.x, y: p.y, head: athletePose(p).head }
  for (let i = 0; i < 120; i++) {
    advance(run, 1, { move: 1 })
    assert.ok(p.contacts.motion.speed < .02)
    assert.ok(p.gait.speed < .001)
    assert.ok(Math.hypot(p.x - start.x, p.y - start.y) < .01)
    assert.ok(Math.hypot(...athletePose(p).head.map((v, j) => v - start.head[j])) < .01)
  }
  advance(run, 30, { move: 1, jump: true }); advance(run, 1, { move: 1 })
  assert.equal(p.contacts.support, null); assert.equal(p.contacts.push, null); assert.equal(p.pushing, null)
  assert.ok(p.vy < -600)
})

test('moving support carries planted feet without creating a walking gait', () => {
  for (const kind of ['box', 'ball', 'lift']) {
    const level = blankTrial()
    if (kind === 'lift') {
      level.mechanisms = [{ id: 'lift', kind: 'lift', x: 650, y: 840, w: 100, h: 20, travel: 180 }]
      level.triggers = [{ x: 300, y: 920, w: 100, target: 'lift', mode: 'weight' }]
      level.props = [{ kind: 'box', x: 350, y: 920, size: 40 }]
    } else level.props = [{ kind, x: 700, y: 920, size: 80 }]
    const run = createRun(level), p = run.player; run.started = true
    Object.assign(p, { x: 700, y: 840, vx: 0, vy: 0, footwork: null })
    advance(run, 30)
    const start = { x: p.x, y: p.y }
    let travel = 0
    for (let i = 0; i < 60; i++) {
      if (kind !== 'lift') run.props[0].vx = 60
      advance(run, 1)
      assert.ok(p.contacts.support, `${kind} provides support`)
      assert.ok(p.contacts.motion.speed < .05, `${kind} transport is not walking`)
      assert.ok(p.gait.speed < .001)
      assert.equal(p.footwork.feet.every(f => f.planted), true)
      travel = Math.hypot(p.x - start.x, p.y - start.y)
    }
    assert.ok(travel > 15, `${kind} actually moved the player`)
  }
})

test('leaving a support publishes airborne contacts and animation only sees the final sweep', () => {
  const floor = { x: 0, y: 500, w: 150, h: 100 }, p = createPlayer({ x: 130, y: 500 })
  let fell = false
  for (let i = 0; i < 90; i++) {
    const x = p.x, y = p.y
    stepPlayer(p, { ...NEUTRAL_INPUT, move: 1 }, STEP, [floor])
    assert.equal(p.contacts.motion.x, p.x - x)
    assert.equal(p.contacts.motion.y, p.y - y)
    if (p.x > 150) {
      fell = true
      assert.equal(p.grounded, false); assert.equal(p.contacts.support, null); assert.equal(p.contacts.push, null)
      assert.equal(p.footwork, null)
    }
  }
  assert.ok(fell)
})

test('bracing against a wall transfers the shove through the feet and rolls a supporting ball back', () => {
  for (const direction of [-1, 1]) {
    const level = blankTrial(), wall = direction > 0 ? 850 : 950
    level.platforms = [{ x: wall - (direction < 0 ? 30 : 0), y: 600, w: 30, h: 320 }]
    level.props = [{ kind: 'ball', x: wall - direction * 34, y: 920, size: 68 }]
    const run = createRun(level), p = run.player, ball = run.props[0]; run.started = true
    const x = wall - direction * 25.5, dx = x - ball.x
    Object.assign(p, { x, y: 886 - Math.sqrt(34 ** 2 - dx ** 2), facing: direction, footwork: null })
    advance(run, 10)
    const start = ball.x
    let recoiled = false
    for (let i = 0; i < 90; i++) {
      advance(run, 1, { move: direction })
      recoiled ||= ball.vx * direction < -20
      assert.ok(Math.abs(ball.vx) < TUNING.walkSpeed, 'the reaction remains slower than walking speed')
    }
    assert.ok(recoiled, 'the supporting ball receives the opposite force')
    assert.ok((ball.x - start) * direction < -8, 'the ball rolls away from the wall')
  }
})

test('standing still anywhere on the grippable crown does not propel a ball', () => {
  for (const size of [68, 160]) for (const offset of [-.6, -.25, 0, .25, .6]) for (const besideWall of [false, true]) {
    const level = blankTrial(), x = 800, direction = Math.sign(offset) || 1
    level.props = [{ kind: 'ball', x, y: 920, size }]
    if (besideWall) level.platforms = [{ x: x + direction * size / 2 - (direction < 0 ? 30 : 0), y: 500, w: 30, h: 420 }]
    const run = createRun(level), p = run.player, ball = run.props[0]; run.started = true
    const playerX = x + offset * size / 2
    Object.assign(p, { x: playerX, y: platformSurface(ballShape(ball), playerX).y, vx: 0, vy: 0, footwork: null })
    for (let i = 0; i < 600; i++) {
      advance(run, 1)
      assert.ok(p.grounded, 'the player keeps stable footing')
      assert.ok(Math.abs(ball.x - x) < .05, `neutral stance must not roll a size ${size} ball at offset ${offset}`)
      assert.ok(Math.abs(ball.vx) < .05, 'neutral contact must not continually accelerate the ball')
    }
  }
})

test('an airborne player wedged between a ball and a wall transfers load and can escape', () => {
  for (const direction of [-1, 1]) for (const move of [-1, 0, 1]) {
    const level = blankTrial(), wall = direction > 0 ? 900 : 700
    level.platforms = [{ x: wall - (direction < 0 ? 30 : 0), y: 600, w: 30, h: 320 }]
    level.props = [{ kind: 'ball', x: wall - direction * 56, y: 920, size: 68 }]
    const run = createRun(level), p = run.player, ball = run.props[0]; run.started = true
    Object.assign(p, { x: wall - direction * 21, y: 899, grounded: false, vy: 200, facing: -direction, footwork: null })
    const start = ball.x
    let supported = false, separating = false
    for (let i = 0; i < 300; i++) {
      advance(run, 1, { move })
      separating ||= p.contacts.body.some(c => c.collider.prop === ball && c.load > 0)
      supported ||= p.grounded
      assert.ok(Math.abs(p.vy) < 900, 'being wedged must not accumulate unbounded falling speed')
    }
    assert.ok(separating, 'the airborne hull transmits load into the ball')
    assert.ok((ball.x - start) * direction < 0, 'the ball yields instead of trapping the player')
    assert.equal(bodyIntersects(p.x, p.y, ballShape(ball)), false, 'the resolved body has room beside the ball')
    assert.ok(supported, 'the player regains usable footing')
  }
})
