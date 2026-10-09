import test from 'node:test'
import assert from 'node:assert/strict'
import { createRun, stepRun } from '../src/games/jumping/challenge.ts'
import { blankTrial } from '../src/games/jumping/level.ts'
import { athletePose } from '../src/games/jumping/athlete.ts'
import { NEUTRAL_INPUT, gaitPose, TUNING } from '../src/games/jumping/model.ts'
import { footPoint, FOOT_BALL, strideProfile } from '../src/games/jumping/footwork.ts'

const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1])
const elbowBend = arm => Math.acos(Math.max(-1, Math.min(1,
  ((arm.joint[0] - arm.root[0]) * (arm.end[0] - arm.joint[0])
    + (arm.joint[1] - arm.root[1]) * (arm.end[1] - arm.joint[1]))
    / (distance(arm.root, arm.joint) * distance(arm.joint, arm.end)))))

test('precision walking stays a walk and rising analog speed promptly becomes a jog', () => {
  assert.equal(gaitPose(TUNING.walkSpeed).run, 0)
  assert.ok(strideProfile(gaitPose(150).run).duty > .5, 'brisk walking retains overlapping foot support')
  assert.ok(strideProfile(gaitPose(180).run).duty < .5, 'a slow jog introduces a brief flight phase')
  assert.ok(gaitPose(240).run > .7, 'most of the middle analog range no longer uses a walking stride')
  assert.equal(gaitPose(TUNING.runSpeed).run, 1)
})

test('walking and running arms reach behind the torso while the opposite arm folds forward', () => {
  for (const speed of [125, 410]) {
    const run = createRun({ ...blankTrial(), width: 4000, height: 1000, floor: 900,
      spawn: { x: 1500, y: 900 }, goal: { x: 3900, y: 900 } })
    let rearReach = 0, frontReach = 0
    for (let tick = 0; tick < 360; tick++) {
      stepRun(run, { ...NEUTRAL_INPUT, move: speed / TUNING.runSpeed })
      if (tick < 120) continue
      const pose = athletePose(run.player)
      for (const arm of [pose.frontArm, pose.backArm]) {
        rearReach = Math.max(rearReach, arm.root[0] - arm.end[0])
        frontReach = Math.max(frontReach, arm.end[0] - arm.root[0])
      }
    }
    assert.ok(rearReach > (speed === 125 ? 8 : 14), 'the free rearward swing is readable in both gaits')
    assert.ok(frontReach > (speed === 125 ? 9 : 8), 'the opposite arm still travels forward')
  }
})

test('slow walking carries the chest forward and settles into soft elbows with fixed feet', () => {
  for (const direction of [-1, 1]) for (const gravity of [-1, 1]) {
    const level = { ...blankTrial(), width: 2400, height: 1000, floor: 900,
      spawn: { x: 1200, y: gravity === 1 ? 900 : 100 }, goal: { x: 2300, y: 900 },
      platforms: gravity === 1 ? [] : [{ x: 0, y: 0, w: 2400, h: 100 }],
      gravityPlates: gravity === 1 ? [] : [{ id: 'ceiling', x: 0, y: 0, w: 2400, h: 1000, gravity: -1, power: 'always' }] }
    const run = createRun(level), p = run.player
    // Use the real partial movement command that selects the precision walk.
    for (let tick = 0; tick < 240; tick++) {
      stepRun(run, { ...NEUTRAL_INPUT, move: direction * 125 / 410 })
      if (tick < 120) continue
      const pose = athletePose(p)
      assert.ok(p.grounded && p.footwork.feet.some(foot => foot.planted))
      assert.ok(pose.shoulder[0] - pose.hip[0] > 1.5, 'every walking phase has a modest forward chest pitch')
      assert.ok(pose.shoulder[0] - pose.hip[0] < 3, 'precision walking does not borrow the sprint lean')
    }
    for (let tick = 0; tick < 360; tick++) stepRun(run, NEUTRAL_INPUT)
    const settled = athletePose(p), anchors = p.footwork.feet.map(foot => [foot.x, foot.y])
    for (const arm of [settled.frontArm, settled.backArm]) {
      assert.ok(elbowBend(arm) > .2 && elbowBend(arm) < .4, 'idle elbows bend softly, without a held working pose')
      assert.ok(Math.abs(distance(arm.root, arm.joint) - 10) < 1e-6)
      assert.ok(Math.abs(distance(arm.joint, arm.end) - 9) < 1e-6)
    }
    assert.ok(distance(settled.frontArm.end, settled.backArm.end) > 6, 'quiet hands remain separate')
    assert.ok(Math.abs(settled.shoulder[0] - settled.hip[0]) < .01, 'the walk lean relaxes at rest')
    for (let tick = 0; tick < 240; tick++) stepRun(run, NEUTRAL_INPUT)
    assert.deepEqual(p.footwork.feet.map(foot => [foot.x, foot.y]), anchors)
    assert.deepEqual(athletePose(p), settled, 'softening the arms adds no idle shuffling')
  }
})

test('walking toe-off visibly lifts each heel while the loaded forefoot stays on its footprint', () => {
  for (const direction of [-1, 1]) for (const speed of [35, 80, 125]) {
    const run = createRun({ ...blankTrial(), width: 3000, height: 1000, floor: 900,
      spawn: { x: 1500, y: 900 }, goal: { x: 2900, y: 900 } })
    const lifted = [0, 0]
    for (let tick = 0; tick < 600; tick++) {
      stepRun(run, { ...NEUTRAL_INPUT, move: direction * speed / 410 })
      if (tick < 120) continue
      const p = run.player, pose = athletePose(p)
      for (const [index, leg] of [pose.frontLeg, pose.backLeg].entries()) {
        if (!leg.planted || leg.footAngle < .42) continue
        lifted[index]++
        const angle = leg.footAngle * leg.footFacing, bend = leg.toeAngle * leg.footFacing
        const heel = footPoint([-1.8, 2.8], angle, bend), ball = footPoint(FOOT_BALL, angle, bend)
        const toe = footPoint([4.5, 2.8], angle, bend)
        assert.ok(ball[1] - heel[1] > 1.6, 'heel rise is separate from the grounded forefoot')
        assert.ok(Math.abs(toe[1] - ball[1]) < 1e-6, 'the loaded toe counter-rotates and stays flat')
        const foot = p.footwork.feet[index]
        assert.ok(Math.abs(p.x + (leg.end[0] + ball[0] * leg.footFacing) * p.facing
          - foot.anchorX - FOOT_BALL[0] * p.facing) < 1e-6, 'the ball of the foot does not skid')
        assert.ok(Math.abs(p.y + leg.end[1] + toe[1] - run.level.floor) < 1e-6)
      }
    }
    assert.ok(lifted.every(frames => frames > 8), 'both walking feet show repeated supported heel lift')
  }
})
