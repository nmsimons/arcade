import test from 'node:test'
import assert from 'node:assert/strict'
import { stepRun } from '../src/games/jumping/challenge.ts'
import { STEP } from '../src/games/jumping/model.ts'
import { athletePose, handOutline } from '../src/games/jumping/athlete.ts'
import { createWaterCluster, clusterStages, clusterInput } from './helpers/jumpingWaterCluster.mjs'
import { blankTrial } from '../src/games/jumping/level.ts'
import { createRun } from '../src/games/jumping/challenge.ts'
import { NEUTRAL_INPUT } from '../src/games/jumping/model.ts'

const rigPoints = pose => [pose.hip, pose.waist, pose.shoulder, pose.head,
  ...[pose.frontArm, pose.backArm, pose.frontLeg, pose.backLeg].flatMap(limb => [limb.root, limb.joint, limb.end])]
for (const dt of [STEP, 1 / 30]) for (const side of [-1, 1]) for (const spacing of [41, 48, 64]) for (const depth of [50, 120]) {
  test(`six small floats retain smooth contacts, reaches and knees (${dt}, ${side}, ${spacing}, ${depth})`, () => {
    const run = createWaterCluster(side, spacing, depth, dt), p = run.player
    let previous, previousBalls = run.props.map(b => [b.x, b.y]), underwaterFrames = 0, pushingFrames = 0
    for (const [label, seconds, intent] of clusterStages) for (let frame = 0; frame < Math.round(seconds / dt); frame++) {
      stepRun(run, clusterInput(intent, side), dt)
      const pose = athletePose(p), current = rigPoints(pose).map(([x, y]) => [p.x + x * p.facing, p.y + y])
      if (previous) for (const [i, point] of current.entries()) {
        const distance = Math.hypot(point[0] - previous[i][0], point[1] - previous[i][1])
        assert.ok(distance < 600 * dt + .8, `${label}, frame ${frame}, joint ${i} snapped ${distance.toFixed(2)} units`)
      }
      previous = current
      underwaterFrames += Number(p.waterMotion?.underwater)
      pushingFrames += Number((p.pushing?.amount ?? 0) > .5)
      for (const limb of [pose.frontArm, pose.backArm, pose.frontLeg, pose.backLeg]) {
        const leg = 'footAngle' in limb
        assert.ok(Math.abs(Math.hypot(limb.joint[0] - limb.root[0], limb.joint[1] - limb.root[1], limb.jointDepth ?? 0) - (leg ? 15 : 10)) < 1e-5)
        assert.ok(Math.abs(Math.hypot(limb.end[0] - limb.joint[0], limb.end[1] - limb.joint[1], (limb.endDepth ?? 0) - (limb.jointDepth ?? 0)) - (leg ? 14.5 : 9)) < 1e-5)
      }
      for (const [i, b] of run.props.entries()) {
        const clearance = ([x, y]) => Math.hypot(p.x + x * p.facing - b.x, p.y + y - b.y + 20) - 20
        assert.ok(clearance(pose.head) > 6.05, 'the head stays outside every float')
        if (p.contacts.push?.collider.prop === b && p.pushing?.amount > .99) for (const arm of [pose.frontArm, pose.backArm]) for (const point of handOutline(arm)) assert.ok(clearance(point) > -.01, 'working palms meet the float surface')
        const travel = Math.hypot(b.x - previousBalls[i][0], b.y - previousBalls[i][1])
        assert.ok(travel < 220 * dt, 'ball contacts do not reset positions')
        previousBalls[i] = [b.x, b.y]
      }
      if (p.waterMotion?.underwater && p.contacts.push?.swimming) {
        for (const [i, arm] of [pose.frontArm, pose.backArm].entries()) {
          const palm = p.contacts.push.hands.palms[i]
          assert.ok(Math.hypot(palm.x - p.x - arm.root[0] * p.facing, palm.y - p.y - arm.root[1]) < 25, 'underwater grips remain near the visible shoulder')
        }
      }
    }
    assert.ok(underwaterFrames > 2 / dt, 'the route swims underneath the cluster')
    if (depth === 50) assert.ok(pushingFrames > .1 / dt, 'surface swimming actually pushes the floats')
    const snapshot = structuredClone(p)
    athletePose(p); athletePose(p)
    assert.deepEqual(p, snapshot, 'rendering cannot advance the tuck or reach')
  })
}

for (const dt of [STEP, 1 / 30]) for (const side of [-1, 1]) test(`swimming below six balls cannot move them through an invisible standing hull (${dt}, ${side})`, () => {
  const at = x => side > 0 ? x : 1800 - x
  const level = { ...blankTrial(), spawn: { x: at(420), y: 500 },
    goal: { x: 1700, y: 900, id: 'closed', power: 'switched' },
    props: Array.from({ length: 6 }, (_, i) => ({ kind: 'ball', x: at(570 + i * 48), y: 420, size: 40 })),
    gravityPlates: [{ id: 'water', x: 0, y: 400, w: 1800, h: 500, effect: 'water' }] }
  const run = createRun(level), quiet = createRun({ ...level, spawn: { x: at(1500), y: 500 } })
  for (const r of [run, quiet]) { r.started = true; r.player.grounded = false; r.player.coyote = 0 }
  let passed = false
  for (const [seconds, move] of [[6, side], [1, 0], [5, -side], [1, 0]]) for (let i = 0; i < Math.round(seconds / dt); i++) {
    stepRun(run, { ...NEUTRAL_INPUT, move }, dt); stepRun(quiet, NEUTRAL_INPUT, dt)
    const p = run.player
    passed ||= (p.x - at(570 + 5 * 48)) * side > 40
    assert.equal(p.contacts.body.some(c => c.collider.prop), false, 'there is open water between swimmer and floats')
    assert.equal(p.contacts.push?.swimming ?? false, false, 'swimming beneath a ball never adopts a side shove')
    for (const [j, b] of run.props.entries()) {
      assert.ok(Math.hypot(b.x - quiet.props[j].x, b.y - quiet.props[j].y) < .001, 'balls follow the same idle buoyancy as an untouched group')
    }
  }
  assert.ok(passed, 'normal steering swims under the entire cluster')
})

// Slight pitch used to restore a tall standing cap despite a visibly prone rig.
test('the loose-prop sweep follows the head and torso through pitched swims and turns', async () => {
  const { createPlayer } = await import('../src/games/jumping/model.ts')
  const { playerContactBody, playerCollisionOutline, playerContacts } = await import('../src/games/jumping/playerContacts.ts')
  const { ballShape } = await import('../src/games/jumping/propGeometry.ts')
  const { moveBody } = await import('../src/games/jumping/geometry.ts')
  for (const facing of [-1, 1]) for (const amount of [.45, .65, 1]) for (const dive of [-.75, -.25, 0, .25, .75]) for (const heading of [-1, 0, 1]) {
    const p = createPlayer({ x: 600, y: 500 }); p.grounded = false; p.coyote = 0; p.facing = facing
    p.gravity = 0; p.swimAcceleration = 0; p.vx = facing * 70
    p.waterMotion = { amount, dive, phase: .8, heading, leadHeading: heading, underwater: true, steering: 1 }
    const pose = athletePose(p)
    const skin = [[pose.head, 6.25], [pose.hip, 3.7], [pose.waist, 2.8], [pose.shoulder, 2.4]]
    const [upper, radius] = skin.reduce((a, b) => a[0][1] - a[1] < b[0][1] - b[1] ? a : b)
    const prop = { kind: 'ball', x: p.x + upper[0] * facing, y: p.y + upper[1] - radius - 2, size: 40, waterImmersion: 1, vx: 0, vy: 0, angularVelocity: 0 }
    const platform = ballShape(prop), world = { platforms: [platform], colliders: [{ id: 'prop:0', platform, prop }] }
    const hull = playerContactBody(p, true), outline = playerCollisionOutline(p, world, hull)
    const sweep = moveBody([p.x, p.y], [p.x + facing, p.y], world.platforms, hull.height, 1, 0, outline)
    assert.equal(sweep.contacts.length, 0, `open water above the ${amount}/${dive}/${heading} rig remains passable`)
    const contacts = playerContacts(p, { ...NEUTRAL_INPUT, move: facing }, world)
    assert.equal(contacts.body.length, 0)
    assert.equal(contacts.push, null, 'an overhead ball cannot attract the underwater arms')
    assert.equal(playerContactBody(p).outline, undefined, 'field sampling uses the cheap buoyancy envelope')
  }
})
