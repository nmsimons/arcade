import test from 'node:test'
import assert from 'node:assert/strict'
import { CROUCHED_PUSH_SCENARIOS, crouchedPushScenario } from './helpers/jumpingCrouchedPushScenarios.mjs'
import { athleteOutlinePoints } from './helpers/jumpingAthleteOutline.mjs'
import { athletePose } from '../src/games/jumping/athlete.ts'
import { createRun, stepRun } from '../src/games/jumping/challenge.ts'
import { blankTrial } from '../src/games/jumping/level.ts'
import { NEUTRAL_INPUT } from '../src/games/jumping/model.ts'
import { nearestBoundary, pointInside } from '../src/games/jumping/geometry.ts'
import { boxShape } from '../src/games/jumping/propGeometry.ts'

const worldPoint = (p, point) => [p.x + point[0] * p.facing, p.y + point[1] * (p.inverted ? -1 : 1)]
const joints = pose => [pose.hip, pose.waist, pose.shoulder, pose.head,
  ...[pose.frontArm, pose.backArm].flatMap(limb => [limb.root, limb.joint, limb.end])]

function fixedLimbs(pose, context) {
  for (const limb of [pose.frontArm, pose.backArm, pose.frontLeg, pose.backLeg]) {
    const leg = 'footAngle' in limb
    assert.ok(Math.abs(Math.hypot(...limb.joint.map((v, i) => v - limb.root[i]), limb.jointDepth ?? 0) - (leg ? 15 : 10)) < 1e-5, context + ': fixed upper limb')
    assert.ok(Math.abs(Math.hypot(...limb.end.map((v, i) => v - limb.joint[i]), (limb.endDepth ?? 0) - (limb.jointDepth ?? 0)) - (leg ? 14.5 : 9)) < 1e-5, context + ': fixed lower limb')
  }
}

function clearSkin(run, context) {
  const p = run.player, solids = [...run.terrain, ...run.props.filter(prop => prop.kind === 'box').map(boxShape)]
  for (const point of athleteOutlinePoints(p)) {
    const [x, y] = worldPoint(p, point)
    for (const solid of solids) if (x >= solid.x && x <= solid.x + solid.w && y >= solid.y && y <= solid.y + solid.h && pointInside(solid, x, y)) {
      // Rounded sole sampling on a slope can differ by <.005 world units.
      // .02 is a geometry tolerance, far below the reproduced 2.58-unit arm intrusion.
      assert.ok(nearestBoundary(solid, x, y).distance <= .02, context + ': final drawn outline clears polygon')
    }
    for (const ball of run.props.filter(prop => prop.kind === 'ball')) assert.ok(
      ball.size / 2 - Math.hypot(x - ball.x, y - ball.y + ball.size / 2) <= .02,
      context + ': final drawn outline clears the visible ball circle')
  }
}

test('the reported blocked 80-unit crate keeps the final crouched head outside its face', () => {
  for (const facing of [-1, 1]) {
    const level = { ...blankTrial(), spawn: { x: 540 - facing * 65.5, y: 920 },
      props: [{ kind: 'box', x: 540, y: 920, size: 80 }],
      platforms: [{ x: facing > 0 ? 580 : 380, y: 650, w: 120, h: 270 }] }
    const run = createRun(level)
    for (let tick = 0; tick < 360; tick++) stepRun(run, { ...NEUTRAL_INPUT, move: facing, crouch: true })
    const p = run.player, head = worldPoint(p, athletePose(p).head), face = facing > 0 ? 500 : 580
    assert.ok((face - head[0]) * facing >= 6.2 - .02, 'the final rendered head radius clears the reported crate face')
    clearSkin(run, 'reported blocked crate; facing=' + facing)
  }
})

test('a tilted moving crate cannot intersect the final crouched forearm after fitting the wrists', () => {
  for (const facing of [-1, 1]) {
    const run = crouchedPushScenario({ name: 'tilted crate', kind: 'box', size: 80, angle: facing * .2 }, facing)
    for (let tick = 0; tick <= 280; tick++) stepRun(run, { ...NEUTRAL_INPUT, move: facing, crouch: tick >= 120 })
    clearSkin(run, 'tilted crate at the reproduced forearm intrusion; facing=' + facing)
  }
})

test('crouch entry, loaded work and release retain the complete skin, palms and supported rig in both gravity frames', () => {
  for (const inverted of [false, true]) for (const facing of [-1, 1]) for (const config of CROUCHED_PUSH_SCENARIOS) {
    // Passive props roll off a slope during the six-second gravity-switch setup;
    // normal slopes and the existing mirrored slope/rig tests cover that axis.
    if (inverted && config.slope) continue
    const run = crouchedPushScenario(config, facing, inverted), p = run.player
    assert.equal(p.inverted, inverted, 'the real gravity plate establishes the encounter')
    let loaded = 0, previous, previousLoaded = false
    for (let tick = 0; tick < 600; tick++) {
      stepRun(run, { ...NEUTRAL_INPUT, move: tick < 480 ? facing : 0, crouch: config.ceiling || tick >= 120 && tick < 360 })
      const context = `${config.name}; facing=${facing}; inverted=${inverted}; tick=${tick}`
      const pose = athletePose(p)
      fixedLimbs(pose, context)
      assert.ok(p.grounded && p.footwork.feet.some(foot => foot.planted), context + ': real support remains')
      for (const [i, leg] of [pose.frontLeg, pose.backLeg].entries()) if (p.footwork.feet[i].planted) {
        const foot = p.footwork.feet[i], [x, y] = worldPoint(p, leg.end)
        assert.ok(Math.hypot(x - foot.x, y - foot.y) < 1e-6, context + ': loaded shoe retains its motor ankle')
      }
      const points = joints(pose).map(point => worldPoint(p, point))
      // The first physical force fixes a wrist to the real surface. The
      // supported trunk stays continuous even then; unloaded/loaded arm
      // transitions are reviewed in the paired native/browser recordings.
      if (previous) for (let i = 0; i < points.length; i++) if (i < 4 || previousLoaded === !!p.pushing?.effort) assert.ok(
        Math.hypot(points[i][0] - previous[i][0], points[i][1] - previous[i][1]) < 8,
        context + ': joint ' + i + ' remains continuous')
      previous = points
      previousLoaded = !!p.pushing?.effort
      if (p.pushing?.effort) {
        loaded++
        for (const [i, arm] of [pose.frontArm, pose.backArm].entries()) {
          const palm = p.pushing.palms[i], [x, y] = worldPoint(p, arm.hand)
          assert.ok(Math.hypot(x - palm.x - palm.nx * 1.6, y - palm.y - palm.ny * 1.6) < .5,
            context + ': real force keeps the existing palm offset')
        }
      }
      // Check every transition frame as well as the entire working/resting cycle.
      if (tick % 8 === 0 || Math.abs(tick - 120) < 20 || Math.abs(tick - 360) < 20 || Math.abs(tick - 480) < 20) {
        const before = structuredClone(p)
        clearSkin(run, context)
        assert.deepEqual(p, before, context + ': presentation cannot move the physical player or contacts')
      }
    }
    assert.ok(loaded > 350, config.name + ': sustained physical force is exercised')
    if (!config.ceiling) {
      stepRun(run, { ...NEUTRAL_INPUT, jump: true })
      assert.ok(!p.grounded && p.vy * (inverted ? -1 : 1) < 0, config.name + ': fresh jump escape stays immediate')
    }
  }
})
