import test from 'node:test'
import assert from 'node:assert/strict'
import { createPlayer, stepPlayer, NEUTRAL_INPUT, STEP } from '../src/games/jumping/model.ts'
import { athletePose, captureRopeTurnRelease, handOutline } from '../src/games/jumping/athlete.ts'
import { climbRoot, ropeGripDistance } from '../src/games/jumping/climbables.ts'
import { mirrorPlayerState } from '../src/games/jumping/gravityFrame.ts'

function turningHang(side, angle) {
  const p = createPlayer({ x: 500 - side * 10, y: 480 })
  Object.assign(p, { grounded: false, facing: side })
  const world = { ladders: [], ropes: [{ x: 500, y: 100, length: 600, segments: 75 }] }
  for (let i = 0; i < 120; i++) stepPlayer(p, NEUTRAL_INPUT, STEP, [], world)
  p.climbing.turn = { angle, target: side * Math.PI, grip: ropeGripDistance(p.climbing) }
  ;[p.x, p.y] = climbRoot(p.climbing, p.facing)
  return p
}

test('the android head follows a rope gravity turn in both facings and reflected frames', () => {
  for (const side of [-1, 1]) for (const inverted of [false, true]) for (const angle of [.3, Math.PI / 2, 2.8]) {
    const p = turningHang(side, side * angle)
    if (inverted) { mirrorPlayerState(p); p.inverted = true }
    const before = structuredClone(p), pose = athletePose(p)
    assert.ok(Math.abs((pose.headTilt ?? 0) - angle) < 1e-6, 'the asymmetric shell rotates with the body')
    assert.deepEqual(p, before, 'pose queries leave simulation state unchanged')
  }
})

test('a rope release preserves the outgoing head and complete palms before blending', () => {
  for (const side of [-1, 1]) for (const inverted of [false, true]) for (const angle of [.3, Math.PI / 2, 2.8]) {
    const held = turningHang(side, side * angle), released = structuredClone(held)
    released.releaseTurn = captureRopeTurnRelease(released)
    released.climbing = null
    if (inverted) for (const p of [held, released]) { mirrorPlayerState(p); p.inverted = true }
    const before = athletePose(held), after = athletePose(released)
    assert.ok(Math.abs((after.headTilt ?? 0) - (before.headTilt ?? 0)) < 1e-6)
    for (const name of ['frontArm', 'backArm']) {
      const oldPalm = handOutline(before[name]), newPalm = handOutline(after[name])
      for (let i = 0; i < oldPalm.length; i++) assert.ok(
        Math.hypot(oldPalm[i][0] - newPalm[i][0], oldPalm[i][1] - newPalm[i][1]) < 1e-6,
        `the zero-weight transition retains the entire ${name} palm: side=${side}, inverted=${inverted}, angle=${angle}`)
    }
  }
})
