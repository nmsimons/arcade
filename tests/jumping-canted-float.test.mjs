import test from 'node:test'
import assert from 'node:assert/strict'
import { stepPlayer, NEUTRAL_INPUT, STEP } from '../src/games/jumping/model.ts'
import { athletePose, handOutline } from '../src/games/jumping/athlete.ts'
import { floatingWall } from './helpers/jumping-canted-float.mjs'

for (const dt of [STEP, 1 / 30]) for (const side of [-1, 1]) for (const inverted of [false, true]) {
  test(`bobbing on a canted wall keeps palms braced at ${Math.round(1 / dt)} Hz, side ${side}, inverted ${inverted}`, () => {
    const { p, terrain, field } = floatingWall(side, inverted)
    let previous, reversals = 0, previousDirection, peak = 0, contacts = 0
    for (let frame = 0; frame < 4 / dt; frame++) {
      stepPlayer(p, { ...NEUTRAL_INPUT, move: side }, dt, terrain, undefined, undefined, undefined, field)
      const pose = athletePose(p), direction = Math.sign(p.vy)
      if (previousDirection && direction && direction !== previousDirection) reversals++
      if (direction) previousDirection = direction
      const points = [pose.frontArm, pose.backArm].flatMap(arm => [
        [...arm.joint, arm.jointDepth ?? 0], [...arm.end, arm.endDepth ?? 0],
      ])
      if (previous) peak = Math.max(peak, ...points.map((point, i) => Math.hypot(...point.map((n, axis) => n - previous[i][axis]))))
      previous = points
      for (const arm of [pose.frontArm, pose.backArm]) {
        assert.ok(Math.abs(Math.hypot(arm.joint[0] - arm.root[0], arm.joint[1] - arm.root[1], arm.jointDepth ?? 0) - 10) < 1e-6)
        assert.ok(Math.abs(Math.hypot(arm.end[0] - arm.joint[0], arm.end[1] - arm.joint[1], (arm.endDepth ?? 0) - (arm.jointDepth ?? 0)) - 9) < 1e-6)
      }
      if (!p.wallBrace?.active || p.wallBrace.amount < 1 || p.wallBrace.hands.some(weight => weight < 1)) continue
      assert.equal(p.releaseTurn, undefined, 'loaded palms retain their brace while the field reverses')
      contacts++
      // The pose is in the player's gravity frame, including the brace face.
      const brace = inverted ? { ...p.wallBrace, wallY: -p.wallBrace.wallY, normal: [p.wallBrace.normal[0], -p.wallBrace.normal[1]] } : p.wallBrace
      const y = inverted ? -p.y : p.y
      const distance = ([x, offset]) => (p.x + x * side - brace.wallX) * brace.normal[0]
        + (y + offset - brace.wallY) * brace.normal[1]
      assert.ok(distance(pose.head) >= 6.2 - .05, 'the relaxed brace keeps the head clear of the wall')
      for (const arm of [pose.frontArm, pose.backArm]) {
        const gap = Math.min(...handOutline(arm).map(distance))
        assert.ok(Math.abs(gap) < .05, `palm left the wall by ${gap} at ${frame}`)
      }
    }
    assert.ok(contacts > 2 / dt, 'the body keeps real wall contact through several bobs')
    assert.ok(reversals >= 4, 'the check crosses several rising/falling transitions')
    assert.ok(peak < 600 * dt, `arm travel ${peak} exceeds the visible transition speed`)
  })
}
