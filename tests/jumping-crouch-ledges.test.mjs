import test from 'node:test'
import assert from 'node:assert/strict'
import { createPlayer, stepPlayer, NEUTRAL_INPUT, STEP, TUNING } from '../src/games/jumping/model.ts'
import { athletePose } from '../src/games/jumping/athlete.ts'
import { bodyIntersects, nearestBoundary, pointInside } from '../src/games/jumping/geometry.ts'
import { blankTrial } from '../src/games/jumping/level.ts'
import { createRun, stepRun } from '../src/games/jumping/challenge.ts'

function fixture(slope, side, gap = 40) {
  const outline = slope ? [[0,240],[400,0],[360,240]] : [[0,200],[160,0],[400,0],[400,240],[0,240]]
  const platform = { x: 100, y: 300, w: 400, h: 240, polygon: outline.map(([x, y]) => [side === -1 ? x : 400 - x, y]) }
  const ceiling = { x: 50, y: 260 - gap, w: 500, h: 40 }
  return { world: [platform, ceiling], ceiling, edgeX: side === -1 ? 500 : 100, edgeY: 300 }
}
const tick = (p, world, input = {}, dt = STEP) => stepPlayer(p, { ...NEUTRAL_INPUT, ...input }, dt, world)
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-6, `${actual} ≈ ${expected}`)
const landmarks = p => {
  const pose = athletePose(p)
  return [pose.hip, pose.waist, pose.shoulder, pose.head,
    ...[pose.frontArm, pose.backArm, pose.frontLeg, pose.backLeg].flatMap(limb => [limb.root, limb.joint, limb.end])]
    .map(([x, y]) => [p.x + x * p.facing, p.y + y])
}
function headClear(p, ceiling) {
  const pose = athletePose(p), x = p.x + pose.head[0] * p.facing, y = p.y + pose.head[1]
  assert.equal(pointInside(ceiling, x, y), false, 'the head never passes through the ceiling')
  assert.ok(nearestBoundary(ceiling, x, y).distance >= 5.9, 'the drawn head stays below the ceiling, allowing subpixel gait motion')
}

for (const slope of [0, .6]) for (const side of [-1, 1]) for (const dt of [STEP, 1 / 60]) {
  test(`crouch-walk lowers and pulls up under a two-tile ceiling: slope ${slope}, side ${side}, ${Math.round(1 / dt)} Hz`, () => {
    const { world, ceiling, edgeX, edgeY } = fixture(slope, side)
    const p = createPlayer({ x: edgeX + side * 50, y: edgeY + 50 * slope })
    Object.assign(p, { facing: -side, crouching: true, crouch: 1 })
    let lowered = false, turned = false, previous = landmarks(p)
    for (let i = 0; i < Math.ceil(2 / dt); i++) {
      const before = !!p.mantle
      tick(p, world, { move: -side, descend: true, crouch: true }, dt)
      lowered ||= !!p.mantle?.descending
      if (!before && p.mantle?.descending) {
        turned = true
        landmarks(p).forEach((point, i) => assert.ok(Math.hypot(point[0] - previous[i][0], point[1] - previous[i][1]) < 5,
          'turning into the lowered grip preserves the incoming crouched pose'))
      }
      headClear(p, ceiling); previous = landmarks(p)
    }
    assert.ok(lowered && turned && p.hang, 'held Down catches the edge rather than walking off')
    near(p.x, edgeX - side * 14); near(p.y, edgeY + TUNING.hangReach)
    assert.equal(p.hang.braced, slope === 0)
    tick(p, world)
    let pulledUp = false
    for (let i = 0; i < Math.ceil(1.3 / dt); i++) {
      tick(p, world, { climb: true }, dt)
      pulledUp ||= !!p.mantle?.crouched
      headClear(p, ceiling)
    }
    assert.ok(pulledUp && p.grounded && p.crouching)
    near(p.x, edgeX + side * 20); near(p.y, edgeY + 20 * slope)
    for (const b of world) assert.equal(bodyIntersects(p.x, p.y, b, TUNING.crouchHeight), false)
    // Releasing Up cannot force a stand through the ceiling. Leaving the
    // low passage, however, must return to ordinary standing automatically.
    for (let i = 0; i < 20; i++) tick(p, world)
    assert.equal(p.crouching, true)
    for (let i = 0; i < 10; i++) tick(p, [world[0]])
    assert.equal(p.crouching, false)
  })
}

test('a low ceiling and ledge in the same polygon still allow a crouched pull-up', () => {
  const world = [{ x: 100, y: 100, w: 400, h: 400,
    polygon: [[0,0],[400,0],[400,40],[60,40],[60,80],[280,80],[280,100],[60,100],[60,360],[400,360],[400,400],[0,400]] }]
  const p = createPlayer({ x: 394, y: 254 }); Object.assign(p, { grounded: false, vy: 60, facing: -1 })
  tick(p, world); assert.ok(p.hang)
  for (let i = 0; i < 180; i++) tick(p, world, { climb: true })
  assert.ok(p.grounded && p.crouching); near(p.x, 360); near(p.y, 180)
  assert.equal(bodyIntersects(p.x, p.y, world[0], TUNING.crouchHeight), false)
})

for (const side of [-1, 1]) test(`an opening smaller than a crouch stays blocked on side ${side}, without trapping the player`, () => {
  const { world, edgeX, edgeY } = fixture(0, side, 39)
  const p = createPlayer({ x: edgeX - side * 14, y: edgeY + TUNING.hangReach })
  Object.assign(p, { grounded: false, vy: 60, facing: side })
  tick(p, world); assert.ok(p.hang)
  for (let i = 0; i < 180; i++) {
    tick(p, world, { climb: true }); assert.ok(p.hang); assert.equal(p.mantle, null)
  }
  tick(p, world, { detach: true }); assert.equal(p.hang, null); assert.ok(p.vy > 0)
})

test('a crouched pull-up can be canceled back to the same grip', () => {
  const { world, edgeX, edgeY } = fixture(0, -1)
  const p = createPlayer({ x: edgeX + 14, y: edgeY + TUNING.hangReach })
  Object.assign(p, { grounded: false, vy: 60, facing: -1 })
  tick(p, world)
  for (let i = 0; i < 60; i++) tick(p, world, { climb: true })
  assert.ok(p.mantle?.crouched)
  for (let i = 0; i < 90; i++) tick(p, world, { descend: true })
  assert.ok(p.hang); near(p.x, edgeX + 14); near(p.y, edgeY + TUNING.hangReach)
})

for (const pointed of [false, true]) for (const dt of [STEP, 1 / 60]) test(`a distant shovebot cannot move the first ledge grip: ${pointed ? 'pointed' : 'flat'}, ${1 / dt} Hz`, () => {
  const level = { ...blankTrial(), width: 1800, height: 700, floor: 700,
    spawn: { x: 360, y: pointed ? 560 : 480 }, goal: { x: 1640, y: 700 },
    platforms: [
      { x: 260, y: 380, w: 400, h: pointed ? 240 : 200,
        polygon: pointed ? [[0,240],[400,0],[360,240]] : [[0,200],[200,0],[400,0],[400,200]] },
      { x: 460, y: 300, w: 360, h: 40 },
    ], robots: [{ x: 1200, y: 700, left: 900, right: 1500 }] }
  const run = createRun(level), botStart = run.robots[0].x
  const advance = (seconds, input) => {
    for (let i = 0; i < Math.ceil(seconds / dt); i++) {
      stepRun(run, { ...NEUTRAL_INPUT, ...input }, dt)
      const grip = run.player.hang ?? run.player.mantle
      if (grip) { near(grip.edgeX, 660); near(grip.edgeY, 380) }
    }
  }
  for (let cycle = 0; cycle < 2; cycle++) {
    advance(cycle ? 2 : 6, { move: 1, crouch: true, descend: true, drop: true })
    assert.ok(run.player.hang)
    const p = run.player, pose = athletePose(p)
    near(p.x + pose.frontArm.hand[0] * p.facing, 658)
    near(p.y + pose.frontArm.hand[1], 378.7 + (pointed ? 1.2 : 0))
    advance(1.5, { climb: true })
    assert.ok(p.grounded && p.crouching)
  }
  assert.notEqual(run.robots[0].x, botStart, 'the bot is actually moving during the test')
})
