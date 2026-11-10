import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { createRun, stepRun } from './helpers/jumping-active-run.mjs'
import { parseLevel } from '../src/games/jumping/level.ts'
import { NEUTRAL_INPUT, playerState } from '../src/games/jumping/model.ts'
import { presentedAthletePose } from '../src/games/jumping/athletePose.ts'
import { FOREARM, SHIN, THIGH, UPPER_ARM, solve } from '../src/games/jumping/athleteRig.ts'
import { MIN_JOINT_OPENING, boneLengths, jointOpening, rigLimitCorrections, rigViolations, withinRigLimits } from '../src/games/jumping/athleteLimits.ts'

const levels = new URL('../public/levels/jumping/', import.meta.url)
const arm = (bend, depth = 0) => {
  // Shoulder at the origin, upper arm straight down, forearm folded back up by `bend` from straight.
  const joint = [0, UPPER_ARM], angle = Math.PI - bend
  return { root: [0, 0], joint, jointDepth: 0, end: [Math.sin(angle) * FOREARM * Math.cos(depth), UPPER_ARM - Math.cos(angle) * FOREARM], endDepth: Math.sin(angle) * FOREARM * Math.sin(depth),
    hand: [Math.sin(angle) * FOREARM * Math.cos(depth) + 1, UPPER_ARM - Math.cos(angle) * FOREARM] }
}
const leg = () => ({ ...solve([0, -28], [0, 0], THIGH, SHIN, -1), footAngle: 0, toeAngle: 0, footFacing: 1, planted: true })
const pose = (frontArm = arm(1)) => ({ hip: [0, -28], waist: [0, -37], shoulder: [0, -47], head: [0, -55], frontArm, backArm: arm(1.2),
  frontLeg: leg(), backLeg: leg() })

test('a folded hinge reopens to the minimum about its own plane, keeping its root, joint and bone lengths', () => {
  for (const depth of [0, .7]) for (const folded of [0, .05, MIN_JOINT_OPENING / 2]) {
    const limb = arm(Math.PI - folded, depth), before = pose(limb)
    assert.ok(jointOpening(limb) < MIN_JOINT_OPENING)
    const after = withinRigLimits({}, before), fixed = after.frontArm
    assert.ok(Math.abs(jointOpening(fixed) - MIN_JOINT_OPENING) < 1e-6, `reopened exactly to the minimum: fold ${folded}, depth ${depth}`)
    assert.deepEqual(fixed.root, limb.root); assert.deepEqual(fixed.joint, limb.joint)
    const [upper, lower] = boneLengths(fixed)
    assert.ok(Math.abs(upper - UPPER_ARM) < 1e-9 && Math.abs(lower - FOREARM) < 1e-9, 'bones keep their lengths')
    assert.ok(Math.abs(fixed.hand[0] - fixed.end[0] - (limb.hand[0] - limb.end[0])) < 1e-9 && Math.abs(fixed.hand[1] - fixed.end[1] - (limb.hand[1] - limb.end[1])) < 1e-9,
      'the hand travels with the wrist')
    assert.deepEqual(rigViolations(after), [])
  }
})

test('a valid pose passes through unchanged, and a non-finite pose never reaches the screen', () => {
  const actor = {}, valid = pose()
  assert.deepEqual(rigViolations(valid), [])
  assert.equal(withinRigLimits(actor, valid), valid, 'no copy, no change')
  const broken = pose({ ...arm(1), end: [NaN, 3] })
  assert.deepEqual(rigViolations(broken), ['non-finite'])
  assert.equal(withinRigLimits(actor, broken), valid, 'the last valid pose stands in')
})

test('the leg and arm proportions the limits check are the ones the solvers build', () => {
  assert.equal(UPPER_ARM + FOREARM, 19); assert.equal(THIGH + SHIN, 29.5)
})

// Every recorded control route, every frame: the drawn rig stays inside its envelope.
// Before #106 these routes folded knees on ladders and elbows on ropes and jumps.
test('every presented pose on every recorded route is inside the rig limits', () => {
  const recordings = JSON.parse(readFileSync(new URL('./fixtures/jumping-builtin-medal-runs.json', import.meta.url), 'utf8'))
  const before = rigLimitCorrections()
  let frames = 0
  for (const recording of recordings.runs) {
    const file = new URL(encodeURIComponent(recording.file), levels)
    if (recording.historical || !existsSync(file)) continue
    const run = createRun(parseLevel(JSON.parse(readFileSync(file, 'utf8'))))
    let frame = 0
    for (const { frames: count, input } of recording.trace) for (let i = 0; i < count && !run.finished; i++, frame++) {
      stepRun(run, { ...NEUTRAL_INPUT, ...input }); frames++
      const problems = rigViolations(presentedAthletePose(run.player))
      assert.deepEqual(problems, [], `${recording.file} frame ${frame} (${playerState(run.player)})`)
    }
  }
  assert.ok(frames > 40000, `the sweep covered the routes: ${frames} frames`)
  assert.ok(rigLimitCorrections() > before, 'the routes still exercise the correction')
})
