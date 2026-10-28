import test from 'node:test'
import assert from 'node:assert/strict'
import { athletePose, handOutline } from '../src/games/jumping/athlete.ts'
import { createPlayer, gaitPose } from '../src/games/jumping/model.ts'
import { mirrorPlatform, mirrorPlayerState } from '../src/games/jumping/gravityFrame.ts'

for (const side of [-1, 1]) for (const inverted of [false, true]) {
  test(`an approaching ledge retains a folded arm before gradually reaching: side=${side}, inverted=${inverted}`, () => {
    const p = createPlayer({ x: side > 0 ? 486 : 1214, y: 442 })
    const wall = { x: 500, y: 400, w: 700, h: 80 }
    Object.assign(p, { grounded: false, facing: side, vy: 400, gait: gaitPose(200, true), terrain: [wall] })
    if (inverted) { mirrorPlayerState(p); p.inverted = true; p.terrain = [mirrorPlatform(wall)] }
    const free = athletePose(p)
    // The approved larger palm needs a slightly different bend beside the lip;
    // retain a substantial depth fold, rather than prescribing its old angle.
    assert.ok(free.frontArm.jointDepth > 2.5, 'the clear arm is genuinely folded through depth beside the lip')
    p.ledgeReach = { x: side > 0 ? 500 : 1200, y: inverted ? -400 : 400, amount: 0 }
    let previous
    for (let frame = 0; frame <= 100; frame++) {
      p.ledgeReach.amount = frame / 100
      const before = structuredClone(p), pose = athletePose(p)
      assert.deepEqual(p, before, 'drawing remains read-only')
      for (const name of ['frontArm', 'backArm']) {
        const arm = pose[name], a = free[name]
        assert.ok(Math.abs(Math.hypot(arm.joint[0] - arm.root[0], arm.joint[1] - arm.root[1], arm.jointDepth ?? 0) - 10) < 1e-6)
        assert.ok(Math.abs(Math.hypot(arm.end[0] - arm.joint[0], arm.end[1] - arm.joint[1], (arm.endDepth ?? 0) - (arm.jointDepth ?? 0)) - 9) < 1e-6)
        if (frame === 0) {
          for (const point of ['joint', 'end']) assert.ok(Math.hypot(...arm[point].map((v, i) => v - a[point][i])) < 1e-6,
            'a zero-weight reach cannot extend the already cleared limb')
          const before = handOutline(a), after = handOutline(arm)
          assert.ok(after.every((point, i) => Math.hypot(...point.map((n, j) => n - before[i][j])) < 1e-6),
            'a zero-weight reach also retains the real palm position and orientation')
        }
        if (previous) for (const point of ['joint', 'end']) assert.ok(Math.hypot(...arm[point].map((v, i) => v - previous[name][point][i])) < .4,
          'the projected reach changes gradually as its depth unfolds')
      }
      previous = pose
    }
  })
}
