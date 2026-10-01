import test from 'node:test'
import assert from 'node:assert/strict'
import { blankTrial } from '../src/games/jumping/level.ts'
import { createRun, stepRun } from '../src/games/jumping/challenge.ts'
import { NEUTRAL_INPUT } from '../src/games/jumping/model.ts'
import { ballShape } from '../src/games/jumping/propGeometry.ts'
import { exposedSide, exposedWallFaces, platformSurface } from '../src/games/jumping/terrain.ts'
import { bodyIntersects } from '../src/games/jumping/geometry.ts'
import { athletePose } from '../src/games/jumping/athlete.ts'
import { readLevelAsset } from './helpers/jumping-fixtures.mjs'

// A beam, gate header and distant post share one terrain outline. The post
// extends to the floor, but there is empty space under the beam beside the gate.
const frame = { x: 700, y: 660, w: 400, h: 260,
  polygon: [[0,40],[380,40],[380,0],[400,0],[400,260],[380,260],[380,60],[100,60],[100,160],[80,160],[80,60],[0,60]] }
const mirrored = p => ({ ...p, x: 1800 - p.x - p.w, polygon: p.polygon.map(([x, y]) => [p.w - x, y]) })
const setup = (side, size = 30) => {
  const level = blankTrial(), wall = side === 1 ? 780 : 1020
  level.platforms = [side === 1 ? frame : mirrored(frame)]
  level.mechanisms = [{ id: 'gate', kind: 'gate', x: side === 1 ? wall : wall - 20, y: 820, w: 20, h: 100, travel: 100 }]
  level.props = [{ kind: 'ball', x: wall - side * size / 2, y: 920, size }]
  const run = createRun(level), p = run.player, ball = run.props[0], x = wall - side * 12.5
  Object.assign(p, { x, y: platformSurface(ballShape(ball), x).y, facing: side, footwork: null })
  run.started = true
  return { run, p, ball, wall }
}

test('a gate face below concave terrain stays exposed from either side', () => {
  for (const side of [1, -1]) for (const reverse of [false, true]) {
    const terrain = side === 1 ? frame : mirrored(frame)
    const outline = { ...terrain, polygon: reverse ? [...terrain.polygon].reverse() : terrain.polygon }
    const gate = { x: side === 1 ? 780 : 1000, y: 820, w: 20, h: 100 }
    assert.equal(exposedSide([outline, gate], gate, side, 844, 846), true)
    const cover = { x: side === 1 ? 750 : 1020, y: 830, w: 30, h: 50 }
    assert.equal(exposedSide([outline, gate, cover], gate, side, 844, 846), false, 'real covering geometry still blocks the hands')
  }
})

test('pushing a closed gate rolls a small supporting ball back under an overhang', () => {
  for (const side of [1, -1]) for (const size of [30, 40]) {
    const { run, p, ball, wall } = setup(side, size), start = ball.x
    let braced = false, reaction = false, handsOnGate = false
    for (let i = 0; i < 100; i++) {
      stepRun(run, { ...NEUTRAL_INPUT, move: side })
      braced ||= p.contacts.push?.collider.id === 'mechanism:0' && p.pushing?.effort > 0
      reaction ||= ball.vx * side < -20
      if (p.pushing?.amount === 1 && p.contacts.support?.collider.prop === ball) {
        const pose = athletePose(p)
        handsOnGate ||= [pose.frontArm, pose.backArm].every(arm => arm.hand && Math.abs(p.x + arm.hand[0] * side - wall) < 3)
      }
      assert.equal(p.mantle, null)
      assert.ok((p.x - wall) * side < 0, 'the gate keeps the player on the original side')
      assert.ok(run.platforms.every(b => !bodyIntersects(p.x, p.y, b)), 'the player does not clip through the gate or ball')
    }
    assert.ok(braced, 'the hands brace against the gate')
    assert.ok(handsOnGate, 'the bracing pose reaches the gate while standing on the ball')
    assert.ok(reaction, 'the supporting ball receives the opposite force')
    assert.ok((ball.x - start) * side < -8, 'the ball rolls away')
    assert.equal(run.mechanisms[0].y, 820, 'a shove does not open the gate')
  }
})

test('neutral contact beside the same gate leaves the supporting ball stationary', () => {
  for (const side of [1, -1]) {
    const { run, p, ball } = setup(side), start = ball.x
    for (let i = 0; i < 240; i++) {
      stepRun(run, NEUTRAL_INPUT)
      assert.ok(p.grounded)
      assert.equal(p.contacts.push, null)
    }
    assert.ok(Math.abs(ball.x - start) < .05)
    assert.ok(Math.abs(ball.vx) < .05)
  }
})

test('bracing against an inset polygon face above a gate rolls the supporting ball away', () => {
  for (const side of [1, -1]) for (const reversed of [false, true]) for (const effort of [.35, 1]) {
    const level = structuredClone(readLevelAsset('inset-wall-brace.json'))
    if (side === -1) {
      level.spawn.x = level.width - level.spawn.x
      level.props[0].x = level.width - level.props[0].x
      level.platforms = level.platforms.map(b => ({ ...b, x: level.width - b.x - b.w,
        polygon: b.polygon?.map(([x, y]) => [b.w - x, y]) }))
      level.mechanisms[0].x = level.width - level.mechanisms[0].x - level.mechanisms[0].w
    }
    if (reversed) level.platforms[0].polygon.reverse()
    const run = createRun(level), p = run.player, ball = run.props[0], wall = side === 1 ? 800 : 400
    run.started = true
    for (let i = 0; i < 120; i++) stepRun(run, NEUTRAL_INPUT)
    const start = ball.x
    assert.ok(p.grounded, 'the fresh spawn stands on its approach shelf')
    assert.ok(p.y - 44 < level.mechanisms[0].y, 'the hands are above the gate, beside the inset stone face')
    let braced = false, handsOnWall = false, onBall = false
    for (let i = 0; i < 180; i++) {
      stepRun(run, { ...NEUTRAL_INPUT, move: side * effort })
      onBall ||= p.contacts.support?.collider.prop === ball
      braced ||= p.contacts.push?.collider.id === 'terrain:0' && p.pushing?.effort > 0
      if (p.pushing?.amount >= .7 && p.contacts.push?.collider.id === 'terrain:0' && p.contacts.support?.collider.prop === ball) {
        const pose = athletePose(p)
        handsOnWall ||= [pose.frontArm, pose.backArm].every(arm => arm.hand && Math.abs(p.x + arm.hand[0] * side - wall) < 3)
      }
      assert.ok(run.platforms.every(b => !bodyIntersects(p.x, p.y, b)), 'the player stays outside the wall, gate and ball')
    }
    assert.ok(braced, 'the inset stone face supplies the brace')
    assert.ok(onBall, 'ordinary movement steps off the shelf onto the ball')
    // Running rolls the ball away before the presentation blend finishes.
    if (effort === .35) assert.ok(handsOnWall, 'the hands reach the actual face rather than the terrain bounding edge')
    assert.ok((ball.x - start) * side < -8, 'the foot reaction rolls the ball away from the wall')
    assert.equal(run.mechanisms[0].y, 840, 'bracing does not open the gate')
  }
})

test('disjoint outer faces of one polygon do not fill its open side', () => {
  const shape = { x: 100, y: 100, w: 100, h: 200,
    polygon: [[0,0],[100,0],[100,200],[0,200],[0,180],[80,180],[80,20],[0,20]] }
  assert.equal(exposedSide([shape], shape, 1, 150, 160), false)
  assert.equal(exposedSide([shape], shape, 1, 110, 115), true)
  assert.equal(exposedSide([shape], shape, 1, 285, 290), true)
  assert.deepEqual(exposedWallFaces([shape], shape, 1, 150, 160), [180], 'the inset face is the only wall inside the opening')
  const cover = { x: 170, y: 140, w: 10, h: 30 }
  assert.deepEqual(exposedWallFaces([shape, cover], shape, 1, 150, 160), [], 'a touching solid hides the inset seam')
})

function joinedGateLedge(side, reversed = false, ceiling = false) {
  const level = blankTrial()
  level.width = 1200; level.height = level.floor = 660
  level.spawn = { x: 100, y: 660 }; level.goal = { x: 1000, y: 660 }
  const mirror = b => side === 1 ? b : { ...b, x: 1200 - b.x - b.w }
  // The narrow post and adjacent beam form the same top as a single L shape.
  level.platforms = [{ x: 600, y: 500, w: 20, h: 80 }, { x: 620, y: 500, w: 280, h: 20 }].map(mirror)
  if (ceiling) level.platforms.push(mirror({ x: 610, y: 400, w: 100, h: 61 }))
  if (reversed) level.platforms.reverse()
  level.mechanisms = [{ id: 'gate', kind: 'gate', ...mirror({ x: 600, y: 580, w: 20, h: 80 }), travel: 80 }]
  const run = createRun(level); run.started = true
  Object.assign(run.player, { x: 600 - side * 14, y: 574, grounded: false, coyote: 0, vy: 60, facing: side })
  for (let i = 0; i < 60; i++) stepRun(run, NEUTRAL_INPUT)
  assert.ok(run.player.hang)
  return run
}

test('a narrow post joined to a beam above a gate allows pulling up from either side', () => {
  for (const side of [-1, 1]) for (const reversed of [false, true]) {
    const run = joinedGateLedge(side, reversed), p = run.player
    let climbing = false
    for (let i = 0; i < 180; i++) {
      stepRun(run, { ...NEUTRAL_INPUT, climb: true })
      climbing ||= !!p.mantle
      const gate = run.mechanisms[0]
      assert.ok(!bodyIntersects(p.x, p.y, { ...gate.definition, x: gate.x, y: gate.y }), 'the gate remains solid')
    }
    assert.ok(climbing && p.grounded, 'Up climbs onto the continuous top surface')
    assert.equal(p.hang, null); assert.equal(p.mantle, null)
    assert.equal(p.x, 600 + side * 20); assert.equal(p.y, 500)
  }
})

test('a ceiling with less than crouching clearance still blocks pulling up above a gate', () => {
  for (const side of [-1, 1]) {
    const run = joinedGateLedge(side, false, true), p = run.player
    for (let i = 0; i < 180; i++) {
      stepRun(run, { ...NEUTRAL_INPUT, climb: true })
      assert.ok(p.hang); assert.equal(p.mantle, null)
      assert.ok(run.platforms.every(b => !bodyIntersects(p.x, p.y, b)))
    }
  }
})
