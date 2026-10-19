import test from 'node:test'
import assert from 'node:assert/strict'
import { limbOnBend, limbReach } from '../src/games/jumping/limbPose.ts'

test('the shared limb frame keeps both bones fixed through short, extended and depth-facing reaches', () => {
  for (const [upper, lower] of [[10, 9], [15, 14.5]]) for (const target of [[0, 0], [0, 1], [0, 100], [8, -12]]) {
    for (const depth of [0, 6]) for (const opening of [0, Math.PI / 4]) {
      const frame = limbReach([0, 0], target, upper, lower, depth, opening)
      for (const bend of [[1, 2, 3], frame.axis, [0, 0, 0]]) {
        const limb = limbOnBend(frame, bend)
        assert.ok(Math.abs(Math.hypot(...limb.joint, limb.jointDepth) - upper) < 1e-6)
        assert.ok(Math.abs(Math.hypot(limb.end[0] - limb.joint[0], limb.end[1] - limb.joint[1], limb.endDepth - limb.jointDepth) - lower) < 1e-6)
        assert.ok(limb.end.every(Number.isFinite) && Number.isFinite(limb.endDepth))
      }
    }
  }
})
