import test from 'node:test'
import assert from 'node:assert/strict'
import { blankTrial } from '../src/games/jumping/level.ts'
import { createRun, stepRun } from '../src/games/jumping/challenge.ts'
import { NEUTRAL_INPUT, STEP } from '../src/games/jumping/model.ts'
import { LEDGE_CLIMB_TIME } from '../src/games/jumping/ledge.ts'
import { athletePose } from '../src/games/jumping/athlete.ts'
import { ballShape, boxShape } from '../src/games/jumping/propGeometry.ts'
import { playerContactBody } from '../src/games/jumping/playerContacts.ts'
import { bodyIntersects, polygonIntersects, polygonPoints } from '../src/games/jumping/geometry.ts'

function setup(side, pinned = false, size = 30) {
  const level = blankTrial()
  level.platforms = [{ x: side === 1 ? 400 : 0, y: 300, w: 400, h: 620 }]
  if (pinned) level.platforms.push({ x: side === 1 ? 440 : 300, y: 0, w: 60, h: 300 })
  level.climbables.ropes = [{ x: 400, y: 300, length: 560, segments: 70 }]
  level.props = [{ kind: 'ball', x: 400 + side * 6, y: 300, size }]
  const run = createRun(level); run.started = true
  Object.assign(run.player, { x: 400 - side * 23, y: 410, grounded: false, facing: side, vx: 0, vy: 0 })
  return run
}
function step(run, input) {
  stepRun(run, { ...NEUTRAL_INPUT, ...input })
  const p = run.player, b = run.props[0]
  assert.ok(!bodyIntersects(p.x, p.y, ballShape(b)), 'the movement hull stays outside the ball')
  if (p.mantle) {
    const head = athletePose(p).head
    assert.ok(Math.hypot(p.x + head[0] * p.facing - b.x, p.y + head[1] - b.y + b.size / 2) >= b.size / 2 + 6.2 - .1,
      'the forward-leaning head also stays outside the ball')
  }
  assert.ok(!run.terrain.some(terrain => polygonIntersects(polygonPoints(ballShape(b)), terrain, .01)), 'the ball stays outside terrain')
}

test('a small ball on the rope exit is pushed aside by the climb on either face', () => {
  for (const side of [-1, 1]) {
    const run = setup(side), p = run.player
    let caught = false, mantled = false, pressed = false
    for (let i = 0; i < 300; i++) {
      step(run, { climb: true })
      caught ||= !!p.climbing; mantled ||= !!p.mantle
      pressed ||= p.contacts.body.some(c => c.collider.prop === run.props[0] && c.load > 0)
    }
    assert.ok(caught && mantled && pressed)
    assert.equal(p.climbing, null); assert.equal(p.hang, null); assert.equal(p.mantle, null)
    assert.ok(p.grounded); assert.equal(p.y, 300); assert.equal(p.x, 400 + side * 20)
    assert.ok((run.props[0].x - 400) * side > 50)
  }
})

test('a pinned ball pauses the climb without jitter and Down returns to a usable ledge hold', () => {
  for (const side of [-1, 1]) for (const size of [30, 60]) {
    const run = setup(side, true, size), p = run.player
    for (let i = 0; i < 300; i++) step(run, { climb: true })
    assert.ok(p.mantle, 'a blocked prop keeps the climb supported')
    const position = { x: p.x, y: p.y, time: p.mantle.time }
    for (let i = 0; i < 120; i++) {
      step(run, { climb: true })
      assert.deepEqual({ x: p.x, y: p.y, time: p.mantle.time }, position)
      assert.equal(p.mantle.edgeX, 400, 'prop collisions cannot move the gripped terrain edge')
    }
    for (let i = 0; i < 130; i++) step(run, { descend: true })
    assert.equal(p.mantle, null); assert.ok(p.hang)
    assert.equal(p.y, 374); assert.equal(p.x, 400 - side * 14)
    step(run, {})
    step(run, { jump: true, move: -side })
    assert.equal(p.hang, null); assert.equal(p.climbing, null)
    assert.ok(p.vy < 0 && p.vx * side < 0, 'the player can jump away after retreating')
  }
})

test('a pull-up uses the available pocket beside a box at normal pace, then pushes with planted feet', () => {
  for (const side of [-1, 1]) for (const size of [60, 80, 160]) for (const gap of [20, 24, 26, 40]) {
    const level = blankTrial()
    level.platforms = [{ x: side > 0 ? 600 : 200, y: 300, w: 400, h: 40 }]
    level.props = [{ kind: 'box', x: 600 + side * (gap + size / 2), y: 300, size }]
    level.spawn = { x: 600 - side * 14, y: 374 }
    const run = createRun(level), p = run.player, box = run.props[0]
    let climbed = false, duration = 0
    for (let frame = 0; frame < 240; frame++) {
      const mantle = p.mantle, time = mantle?.time
      stepRun(run, { ...NEUTRAL_INPUT, climb: true, move: side })
      const body = playerContactBody(p)
      assert.equal(bodyIntersects(body.x, body.y, boxShape(box), body.height), false)
      if (mantle) {
        duration += STEP
        if (p.mantle === mantle) assert.ok(Math.abs(mantle.time - time - STEP) < 1e-9, 'the unblocked choreography keeps its normal pace')
      }
      climbed ||= !!p.mantle
      if (climbed && !p.mantle) break
    }
    assert.ok(climbed && p.grounded && !p.mantle)
    assert.ok(duration <= LEDGE_CLIMB_TIME + STEP)
    assert.equal((p.x - 600) * side, Math.min(20, gap - 12))
    assert.ok(Math.abs(box.x - level.props[0].x) < .1, 'the climb does not shove a box unnecessarily')
    const boxX = box.x
    for (let i = 0; i < 120; i++) {
      stepRun(run, { ...NEUTRAL_INPUT, move: side })
      assert.ok(!p.mantle && Math.abs(p.y - 300) < .01, 'the following shove stays on the ledge')
      assert.equal(bodyIntersects(p.x, p.y, boxShape(box)), false)
    }
    assert.ok((box.x - boxX) * side > 30, 'holding forward uses the ordinary grounded push')
    assert.ok(p.pushing?.effort > 0)
  }
})

test('a resisted pull takes a compact route as soon as the moving box leaves room', () => {
  for (const side of [-1, 1]) for (const size of [60, 80, 160]) {
    const level = blankTrial()
    level.platforms = [{ x: side > 0 ? 600 : 200, y: 300, w: 400, h: 40 }]
    level.props = [{ kind: 'box', x: 600 + side * (18 + size / 2), y: 300, size }]
    level.spawn = { x: 600 - side * 14, y: 374 }
    const run = createRun(level), p = run.player, box = run.props[0]
    let climbed = false, adapted = false, partialSteps = 0, frozen = 0, longestFreeze = 0, duration = 0, previousHead
    for (let frame = 0; frame < 1200; frame++) {
      const mantle = p.mantle, time = mantle?.time, boxX = box.x, inset = mantle?.inset
      stepRun(run, { ...NEUTRAL_INPUT, climb: true, move: side })
      const body = playerContactBody(p)
      assert.equal(bodyIntersects(body.x, body.y, boxShape(box), body.height), false, 'partial progress stays outside the box')
      assert.ok(!run.terrain.some(terrain => polygonIntersects(polygonPoints(boxShape(box)), terrain, .01)))
      const pose = athletePose(p), head = [p.x + pose.head[0] * p.facing, p.y + pose.head[1]]
      if (mantle && p.mantle === mantle) {
        if (previousHead) assert.ok(Math.hypot(head[0] - previousHead[0], head[1] - previousHead[1]) < 3, 'adapting the route cannot snap the head')
        adapted ||= (mantle.inset ?? 20) < 20
        const advance = mantle.time - time
        assert.ok(advance >= 0 && advance <= STEP + 1e-9)
        if (advance > 1e-6 && advance < STEP - 1e-6) partialSteps++
        // Static obstruction may stop the pull. A yielding box should not make
        // the pose freeze while it waits for a whole animation step to fit.
        frozen = advance < 1e-6 && mantle.inset === inset && (box.x - boxX) * side > 1e-5 ? frozen + 1 : 0
        longestFreeze = Math.max(longestFreeze, frozen)
        duration += STEP; climbed = true
      }
      previousHead = head
      if (climbed && !p.mantle) break
    }
    assert.ok(partialSteps > 10, 'the initial shove retains smooth collision-safe progress')
    assert.ok(longestFreeze < 3, `a moving box must not freeze the pose for ${longestFreeze} ticks`)
    assert.ok(adapted && duration > .9 && duration < 2, 'use the space the box opens without waiting for the full reach')
    assert.equal(p.mantle, null); assert.ok(p.grounded); assert.equal(p.y, 300)
    assert.ok((box.x - level.props[0].x) * side > 2, 'the climb really displaces the box')
  }
})

test('a ball pinned against a wall leaves a usable narrow pull-up and lowering route', () => {
  for (const side of [-1, 1]) for (const singlePolygon of [false, true]) {
    const level = blankTrial()
    level.platforms = [{ x: side > 0 ? 600 : 440, y: 300, w: 160, h: 40 },
      { x: side > 0 ? 720 : 440, y: 220, w: 40, h: 80 }]
    if (singlePolygon) level.platforms = [{ x: side > 0 ? 600 : 440, y: 220, w: 160, h: 120,
      polygon: side > 0 ? [[0,80],[120,80],[120,0],[160,0],[160,120],[0,120]] : [[0,0],[40,0],[40,80],[160,80],[160,120],[0,120]] }]
    level.props = [{ kind: 'ball', x: 600 + side * 10, y: 300, size: 100 }]
    level.spawn = { x: 600 - side * 14, y: 374 }
    const run = createRun(level), p = run.player, ball = run.props[0]
    let adapted = false, previous
    const tick = input => {
      stepRun(run, { ...NEUTRAL_INPUT, ...input })
      adapted ||= (p.mantle?.inset ?? 20) < 20
      const body = playerContactBody(p), shape = ballShape(ball), pose = athletePose(p)
      assert.equal(bodyIntersects(body.x, body.y, shape, body.height), false, 'the complete contact hull clears the ball')
      const head = [p.x + pose.head[0] * p.facing, p.y + pose.head[1]]
      assert.ok(Math.hypot(head[0] - ball.x, head[1] - ball.y + 50) >= 56.1, 'the head stays outside the ball')
      if (previous) assert.ok(Math.hypot(head[0] - previous[0], head[1] - previous[1]) < 4, 'changing landing space cannot snap the head')
      previous = head
      assert.ok(!run.terrain.some(terrain => polygonIntersects(polygonPoints(shape), terrain, .01)), 'the ball cannot pass through its stop')
    }
    for (let cycle = 0; cycle < 2; cycle++) {
      for (let i = 0; i < 1200 && !p.grounded; i++) tick({ climb: true, move: side })
      assert.ok(p.grounded, 'the blocked normal reach must find the clear near-edge stance')
      assert.ok(adapted); assert.equal(p.mantle, null)
      assert.ok((p.x - 600) * side >= 8 && (p.x - 600) * side < 12)
      assert.equal(p.y, 300)
      assert.ok(Math.abs(ball.x - (600 + side * 70)) < .1, 'the ball is pinned at the wall')
      // The completed climb carries no special permission: Down has to find
      // the route anew from an ordinary standing player, as after landing a jump.
      for (let i = 0; i < 180; i++) tick({ descend: true })
      assert.ok(p.hang); assert.equal(p.mantle, null)
      assert.equal(p.x, 600 - side * 14); assert.equal(p.y, 374)
      tick({})
    }
  }
})
