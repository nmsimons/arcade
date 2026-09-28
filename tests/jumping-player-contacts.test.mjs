import test from 'node:test'
import assert from 'node:assert/strict'
import { createRun, stepRun } from '../src/games/jumping/challenge.ts'
import { blankTrial } from '../src/games/jumping/level.ts'
import { createPlayer, finishPlayerStep, NEUTRAL_INPUT, STEP, stepPlayer, TUNING } from '../src/games/jumping/model.ts'
import { playerContacts } from '../src/games/jumping/playerContacts.ts'
import { ballShape, boxShape } from '../src/games/jumping/propGeometry.ts'
import { platformSurface } from '../src/games/jumping/terrain.ts'
import { athletePose } from '../src/games/jumping/athlete.ts'
import { bodyIntersects } from '../src/games/jumping/geometry.ts'

const advance = (run, frames, input = {}) => {
  for (let i = 0; i < frames; i++) stepRun(run, { ...NEUTRAL_INPUT, ...input })
}

test('briefly losing a pushing surface resumes the existing pose without snapping', () => {
  for (const dt of [STEP, 1 / 60]) for (const direction of [-1, 1]) for (const kind of ['box', 'ball', 'bot']) {
    const p = createPlayer({ x: 500, y: 620 }); p.facing = direction
    const floor = { id: 'floor', platform: { x: 0, y: 620, w: 1200, h: 40 } }
    const prop = { kind, x: p.x + direction * 65.5, y: 620, size: 80, angle: 0 }
    const obstacle = { id: kind, ...(kind === 'bot' ? {} : { prop }), platform: kind === 'ball' ? ballShape(prop) : boxShape(prop) }
    const settle = (present = true) => {
      // Model a final contact dropping out for one tick as movable hulls settle.
      const colliders = present ? [floor, obstacle] : [floor]
      finishPlayerStep(p, { ...NEUTRAL_INPUT, move: direction }, dt,
        { colliders, platforms: colliders.map(c => c.platform) }, [p.x, p.y])
    }
    for (let i = 0; i < 60; i++) settle()
    let previous = athletePose(p)
    for (let i = 0; i < 24; i++) {
      settle(i % 2 !== 0)
      assert.ok(p.pushing.amount > .85, `${kind}: a brief gap cannot restart a settled pose`)
      if (i % 2 === 0) {
        assert.equal(p.contacts.push, null, 'the lost contact releases its physical constraint immediately')
        assert.equal(p.pushing.effort, 0, 'only the fading presentation survives')
      }
      const pose = athletePose(p)
      for (const arm of ['frontArm', 'backArm']) {
        assert.ok(Math.hypot(...pose[arm].end.map((v, j) => v - previous[arm].end[j])) < 2,
          `${kind}: reacquiring the same surface must not throw the hands down`)
      }
      previous = pose
    }
    obstacle.id = `${kind}:different`
    settle()
    assert.ok(p.pushing.amount < .13, 'a different surface does not inherit the old contact blend')
    for (let i = 0; i < 30; i++) settle(false)
    assert.equal(p.pushing, null, 'a sustained release still returns to the ordinary pose')
    settle()
    assert.ok(p.pushing.amount < .13, 'a fresh approach starts a new blend after release')
  }
})

test('crouch walking clears a two-tile opening without pushing its overhead edge', () => {
  for (const dt of [STEP, 1 / 60]) for (const direction of [-1, 1]) for (const braceFirst of [false, true]) {
    const ceiling = { x: 300, y: 540, w: 160, h: 40 }
    const world = [{ x: 0, y: 620, w: 1200, h: 40 }, ceiling]
    const p = createPlayer({ x: direction > 0 ? 200 : 560, y: 620 })
    const step = input => stepPlayer(p, { ...NEUTRAL_INPUT, ...input }, dt, world)
    if (braceFirst) {
      for (let t = 0; t < 1; t += dt) step({ move: direction })
      assert.ok(p.pushing, 'standing still braces against the block')
    }
    for (let t = 0; t < .3; t += dt) step({ descend: true })
    let crossedMiddle = false
    for (let t = 0; t < 3; t += dt) {
      step({ move: direction, descend: true })
      assert.equal(p.contacts.push, null, 'the overhead face cannot arrest the crouch walk')
      assert.equal(p.grounded, true)
      assert.equal(p.y, 620)
      const pose = athletePose(p), headX = p.x + pose.head[0] * p.facing
      if (headX + 6.2 > ceiling.x && headX - 6.2 < ceiling.x + ceiling.w) {
        assert.ok(p.y + pose.head[1] - 6.2 >= 580, 'the existing crouch pose clears the ceiling')
      }
      if (!crossedMiddle && Math.abs(p.x - 380) < 3) {
        crossedMiddle = true
        for (let idle = 0; idle < .3; idle += dt) step({})
        assert.equal(p.crouching, true, 'releasing Down cannot stand up through the ceiling')
      }
    }
    assert.ok(crossedMiddle)
    assert.ok(direction > 0 ? p.x > 480 : p.x < 280, 'walks completely through the opening')
    assert.equal(p.vx, direction * TUNING.walkSpeed, 'crouch speed stays unchanged')
    for (let t = 0; t < .3; t += dt) step({})
    assert.equal(p.crouching, false, 'stands normally after clearing the opening')
  }
})

test('crouching still respects openings smaller than two tiles and real walls', () => {
  for (const gap of [0, 39]) for (const direction of [-1, 1]) {
    const ceiling = { x: 300, y: 500, w: 160, h: 120 - gap }
    const world = [{ x: 0, y: 620, w: 1200, h: 40 }, ceiling]
    const p = createPlayer({ x: direction > 0 ? 200 : 560, y: 620 })
    for (let i = 0; i < 360; i++) stepPlayer(p, { ...NEUTRAL_INPUT, move: direction, descend: true }, STEP, world)
    assert.ok(direction > 0 ? p.x < 300 : p.x > 460)
    assert.ok(p.contacts.push, 'a genuinely obstructing face still supports pushing')
    assert.equal(bodyIntersects(p.x, p.y, ceiling, TUNING.crouchHeight), false)
  }
})

test('pressing Down while still pushing an overhead edge enters the two-tile opening', () => {
  for (const direction of [-1, 1]) for (const down of [{ crouch: true }, { descend: true }]) {
    const level = blankTrial(); level.width = 1200; level.height = level.floor = 620
    level.spawn = { x: direction > 0 ? 200 : 560, y: 620 }; level.goal = { x: 1040, y: 620 }
    level.platforms = [{ x: 300, y: 540, w: 160, h: 40 }]
    const run = createRun(level), p = run.player
    advance(run, 90, { move: direction })
    assert.ok(p.contacts.push, 'the first approach reaches the standing push pose')
    const outside = p.x
    advance(run, 1, { move: direction, ...down })
    assert.equal(p.crouching, true)
    assert.equal(p.contacts.push, null, 'Down releases the false wall contact without releasing movement')
    advance(run, 120, { move: direction, ...down })
    assert.ok((p.x - outside) * direction > 100, 'the player enters without backing away or retrying')
    assert.ok(p.x > 320 && p.x < 440)
    advance(run, 36)
    assert.equal(p.crouching, true, 'stopping under the block keeps the player crouched')
    assert.ok(p.y + athletePose(p).head[1] - 6.2 >= 580, 'the resting head also clears the ceiling')
    advance(run, 180, { move: direction, ...down })
    assert.ok(direction > 0 ? p.x > 480 : p.x < 280, 'the same held input finishes the crossing')
    assert.equal(p.y, 620)
  }
})

test('pushing varied prop sizes keeps palms on the surface and feet moving with the body', () => {
  for (const kind of ['box', 'ball']) for (const size of [30, 40, 50, 60, 100, 200]) for (const direction of [-1, 1]) {
    const level = blankTrial(); level.props = [{ kind, x: 900, y: 920, size }]
    level.spawn.x = 900 - direction * (size / 2 + 26)
    const run = createRun(level), p = run.player; run.started = true; p.facing = direction
    let previous, previousLegs, contacts = 0
    for (let i = 0; i < 600; i++) {
      advance(run, 1, { move: direction })
      const pose = athletePose(p)
      if (i > 100) {
        if (kind === 'ball') {
          assert.ok(Math.abs(run.props[0].vx) <= 90.1, 'pushing a ball uses the same speed limit as a box')
          assert.ok(p.contacts.motion.speed <= 90.1, 'the feet follow the slower pushing travel')
          for (const [j, leg] of [pose.frontLeg, pose.backLeg].entries()) {
            assert.ok(Math.hypot(leg.joint[0] - previousLegs[j].joint[0], leg.joint[1] - previousLegs[j].joint[1]) < 4,
              `a deeply bent knee must not flip while stepping past the hip: size ${size}, side ${direction}, frame ${i}, leg ${j}, delta ${Math.hypot(leg.joint[0] - previousLegs[j].joint[0], leg.joint[1] - previousLegs[j].joint[1])}`)
            const foot = p.footwork.feet[j]
            assert.ok(Math.hypot(p.x + leg.end[0] * direction - foot.x, p.y + leg.end[1] - foot.y) < 1.5,
              'the leg must reach its small pushing step without floor corrections launching the ankle')
          }
        }
        assert.ok(p.pushing?.palms, `${kind} ${size} retains both hand contacts`)
        contacts++
        for (const [j, arm] of [pose.frontArm, pose.backArm].entries()) {
          const palm = p.pushing.palms[j]
          assert.ok(Math.hypot(p.x + arm.hand[0] * direction - palm.x - palm.nx * 1.6,
            p.y + arm.hand[1] - palm.y - palm.ny * 1.6) < 2, 'palms follow the visible surface')
        }
        assert.ok(pose.hip[1] < -10, 'a planted leg must not drag the pelvis down to the floor')
        assert.ok(Math.hypot(...pose.shoulder.map((v, j) => v - previous[j])) < 3, 'a turning box must not snap the torso between edge heights')
      }
      previous = pose.shoulder
      previousLegs = [pose.frontLeg, pose.backLeg]
    }
    assert.ok(contacts > 200)
    assert.ok((run.props[0].x - 900) * direction > 60)
  }
})

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

test('descending beside a yielding ball blends intermittent sliding contacts without snapping the pose', () => {
  for (const joined of [false, true]) for (const direction of [-1, 1]) {
    const level = blankTrial(), mirror = x => direction > 0 ? x : level.width - x
    const shapes = joined ? [{ x: 600, y: 420, w: 160, h: 120,
      polygon: [[0,80],[120,80],[120,0],[160,0],[160,120],[0,120]] }]
      : [{ x: 600, y: 500, w: 160, h: 40 }, { x: 720, y: 420, w: 40, h: 80 }]
    level.platforms = direction > 0 ? shapes : shapes.map(b => ({ ...b, x: mirror(b.x + b.w),
      polygon: b.polygon?.map(([x, y]) => [b.w - x, y]) }))
    level.spawn = { x: mirror(708), y: 400 }
    level.props = [{ kind: 'ball', x: mirror(666), y: 500, size: 100 }]
    const run = createRun(level), p = run.player, ball = run.props[0]; run.started = true
    Object.assign(p, { grounded: false, footwork: null, facing: -direction })
    let previous = null, contacts = 0, releases = 0, loaded = false
    for (let i = 0; i < 300; i++) {
      stepRun(run, { ...NEUTRAL_INPUT, move: i < 26 ? -direction : 0 })
      const pose = athletePose(p), current = { sliding: !!p.sliding?.active, free: !p.hang && !p.mantle && !p.grounded,
        facing: p.facing, points: [pose.hip, pose.shoulder, pose.head, pose.frontArm.end, pose.backArm.end,
          pose.frontLeg.joint, pose.backLeg.joint, pose.frontLeg.end, pose.backLeg.end] }
      loaded ||= p.contacts.body.some(c => c.collider.prop === ball && c.load > 0)
      assert.equal(bodyIntersects(p.x, p.y, ballShape(ball)), false)
      for (const b of run.terrain) assert.equal(bodyIntersects(p.x, p.y, b), false)
      if (previous?.free && current.free && previous.facing === current.facing && previous.sliding !== current.sliding) {
        if (current.sliding) contacts++; else releases++
        for (const [j, point] of current.points.entries()) assert.ok(Math.hypot(...point.map((v, axis) => v - previous.points[j][axis])) < 4,
          `brief ball contact must blend every joint: side ${direction}, joined ${joined}, frame ${i}, joint ${j}`)
      }
      previous = current
    }
    assert.ok(contacts >= 6 && releases >= 6, 'the moving ball really produces repeated contact/release cycles')
    assert.ok(loaded && (ball.x - mirror(666)) * direction < -20, 'the descending body still rolls the ball away')
    assert.ok(p.y >= 494, 'the descent reaches the lower platform or its ledge grip')
  }
})

test('large balls yield to a player falling beside a wall, including on a pressure plate', () => {
  for (const size of [68, 160, 200]) for (const direction of [-1, 1]) for (const move of [-1, 0, 1]) for (const plate of [false, true]) {
    const level = blankTrial(), wall = 900
    level.platforms = [{ x: wall - (direction < 0 ? 30 : 0), y: 300, w: 30, h: 620 }]
    level.props = [{ kind: 'ball', x: wall - direction * (size / 2 + 8), y: 920, size }]
    if (plate) level.triggers = [{ x: wall - size - 80, y: 920, w: size * 2 + 160, mode: 'weight', targets: [] }]
    const run = createRun(level), p = run.player, ball = run.props[0]; run.started = true
    Object.assign(p, { x: wall - direction * 12, y: 920 - size - 20, grounded: false, vy: 200, footwork: null })
    let supported = false, loaded = false
    // Gameplay always advances at STEP, including during slower render frames.
    for (let i = 0; i < Math.ceil(5 / STEP); i++) {
      advance(run, 1, { move })
      loaded ||= p.contacts.body.some(c => c.collider.prop === ball && c.load > 0)
      supported ||= p.grounded
      assert.equal(bodyIntersects(p.x, p.y, level.platforms[0]), false, 'the player stays outside the wall')
      assert.equal(bodyIntersects(p.x, p.y, ballShape(ball)), false, 'the player stays outside the ball')
      assert.ok((ball.x - wall) * direction + size / 2 < .01, 'the ball stays outside the wall')
      assert.ok(ball.y <= 920.01, 'the ball stays above the floor')
    }
    assert.ok(loaded, 'the falling player actually loads the ball')
    assert.ok(supported, `size ${size}, side ${direction}, input ${move}, plate ${plate}: the player regains footing`)
  }
})
