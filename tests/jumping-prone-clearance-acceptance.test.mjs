import test from 'node:test'
import assert from 'node:assert/strict'
import { createRun, stepRun } from '../src/games/jumping/challenge.ts'
import { parseLevel, levelProblems } from '../src/games/jumping/level.ts'
import { createPlayer, stepPlayer, NEUTRAL_INPUT, STEP, TUNING } from '../src/games/jumping/model.ts'
import { athletePose } from '../src/games/jumping/athlete.ts'
import { pointInside, nearestBoundary } from '../src/games/jumping/geometry.ts'
import { athleteOutlinePoints } from './helpers/jumpingAthleteOutline.mjs'
import { PRONE_CLEARANCE_SCENARIOS, PRONE_DROP_SCENARIOS, proneClearancePlayer, proneDropLevel, proneDropInput } from './helpers/jumpingProneScenarios.mjs'

const worldPoint = (p, q) => [p.x + q[0] * p.facing, p.y + q[1] * (p.inverted ? -1 : 1)]
function clearSkin(p, solids, balls, context) {
  for (const point of athleteOutlinePoints(p)) {
    const [x, y] = worldPoint(p, point)
    for (const solid of solids) {
      const ball = balls.find(ball => Math.abs(solid.w - ball.r * 2) < .01 && Math.abs(solid.x - ball.x + ball.r) < .01
        && Math.abs(solid.y - ball.y + ball.r) < .01)
      const depth = ball ? ball.r - Math.hypot(x - ball.x, y - ball.y)
        : pointInside(solid, x, y) ? nearestBoundary(solid, x, y).distance : 0
      assert.ok(depth <= .02, context + ': final drawn skin penetrated by ' + depth)
    }
  }
}
function fixedRig(pose, context) {
  for (const limb of [pose.frontArm, pose.backArm, pose.frontLeg, pose.backLeg]) {
    const leg = 'footAngle' in limb
    assert.ok(Math.abs(Math.hypot(...limb.joint.map((v, i) => v - limb.root[i]), limb.jointDepth ?? 0) - (leg ? 15 : 10)) < 1e-5, context + ': upper bone')
    assert.ok(Math.abs(Math.hypot(...limb.end.map((v, i) => v - limb.joint[i]), (limb.endDepth ?? 0) - (limb.jointDepth ?? 0)) - (leg ? 14.5 : 9)) < 1e-5, context + ': lower bone')
  }
}

test('the reported prone head and extended limb caps stay outside the neighboring wall', () => {
  const p = createPlayer({ x: 500, y: 500 }), wall = { x: 520, y: 0, w: 200, h: 1400 }
  Object.assign(p, { grounded: false, coyote: 0, vy: 300, facing: 1, freeFall: { time: 2, amount: 1, recovery: null } })
  stepPlayer(p, NEUTRAL_INPUT, STEP, [wall])
  const pose = athletePose(p)
  assert.ok(p.x + pose.head[0] + 6.2 <= wall.x + .02, 'the exact 6.2-unit head-circle reproduction clears the face')
  assert.equal(p.wallBrace, null, 'clearance cannot invent a grip or wall-jump contact')
  clearSkin(p, [wall], [], 'reported wall')
})

test('the complete prone skin clears walls, corners, caps, undercuts and prop outlines in both gravity frames', () => {
  for (const direction of [-1, 1]) for (const inverted of [false, true]) for (const config of PRONE_CLEARANCE_SCENARIOS) {
    const { player: p, solids, balls } = proneClearancePlayer(config, direction, inverted)
    for (let tick = 0; tick < 240; tick++) {
      stepPlayer(p, NEUTRAL_INPUT, STEP, solids, undefined, undefined, undefined, undefined, inverted ? -TUNING.gravity : TUNING.gravity)
      const context = `${config.name}; direction=${direction}; inverted=${inverted}; tick=${tick}`
      const before = structuredClone(p), pose = athletePose(p)
      fixedRig(pose, context)
      clearSkin(p, solids, balls, context)
      assert.deepEqual(p, before, context + ': drawing cannot move the root or create a contact')
    }
  }
})

test('normal walk-off, long fall, catch, drift, release and recovery clear actual terrain, moving solids and player-only fields', () => {
  for (const direction of [-1, 1]) for (const kind of PRONE_DROP_SCENARIOS) {
    const level = parseLevel(proneDropLevel(kind, direction))
    assert.deepEqual(levelProblems(level), [], kind + ': the fixture loads as an ordinary playable level')
    const run = createRun(level), p = run.player
    let prone = 0, caught = false, departed = false, previous, gateStart
    for (let tick = 0; tick < 600; tick++) {
      stepRun(run, proneDropInput(tick, direction))
      const context = `${kind}; direction=${direction}; tick=${tick}`, pose = athletePose(p)
      prone += +(p.freeFall?.amount === 1)
      caught ||= !!p.hang
      departed ||= caught && tick > 480 && !p.hang
      if (tick === 0 && kind === 'moving gate') gateStart = run.mechanisms[0].y
      fixedRig(pose, context)
      const points = [pose.hip, pose.shoulder, pose.head, pose.frontArm.joint, pose.frontArm.end,
        pose.backArm.joint, pose.backArm.end, pose.frontLeg.joint, pose.frontLeg.end, pose.backLeg.joint, pose.backLeg.end].map(q => worldPoint(p, q))
      // A caught moving lip transports the hand independently of root travel.
      const carrierTravel = kind === 'moving gate' && p.hang && previous
        ? Math.abs(run.mechanisms[0].y - previous.carrierY) : 0
      if (previous) for (let i = 0; i < points.length; i++) assert.ok(
        Math.hypot(points[i][0] - previous.points[i][0], points[i][1] - previous.points[i][1])
          < Math.hypot(p.x - previous.x, p.y - previous.y) + carrierTravel + 6,
        context + ': joint ' + i + ' stays continuous beyond the actual motor travel')
      previous = { points, x: p.x, y: p.y, carrierY: run.mechanisms[0]?.y }
      if (tick % 4 === 0 || p.hang && p.hang.time < .18) {
        const before = structuredClone(p)
        clearSkin(p, p.terrain, run.props.filter(prop => prop.kind === 'ball').map(prop => ({ x: prop.x, y: prop.y - prop.size / 2, r: prop.size / 2 })), context)
        assert.deepEqual(p, before, context + ': final presentation remains read-only')
      }
    }
    assert.ok(prone > 20, kind + ': the normal trace really reaches complete prone flight')
    if (kind === 'undercut') assert.ok(caught && departed, 'a real concave ledge catches the prone body and X releases it')
    if (kind === 'moving gate') assert.ok(Math.abs(run.mechanisms[0].y - gateStart) > 5, 'the moving solid really traverses during the encounter')
    if (kind === 'force field') assert.ok(run.forceFields[0].platform && !run.platforms.includes(run.forceFields[0].platform), 'the field retains player-only solidity')
  }
})
