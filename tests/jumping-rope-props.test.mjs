import test from 'node:test'
import assert from 'node:assert/strict'
import { createRun, stepRun } from './helpers/jumping-active-run.mjs'
import { readLevelAsset } from './helpers/jumping-fixtures.mjs'
import { NEUTRAL_INPUT, STEP } from '../src/games/jumping/model.ts'
import { ropePath } from '../src/games/jumping/climbables.ts'
import { levelProblems } from '../src/games/jumping/level.ts'

for (const side of [1, -1]) for (const dt of [STEP, 1 / 30]) {
  test(`rolling a ball over a rope's fixed pin stays stable (${side}, ${Math.round(1 / dt)} Hz)`, () => {
    const level = readLevelAsset('rope-ball-ledge.json')
    if (side === -1) {
      const mirror = x => level.width - x
      level.entrance.x = mirror(level.entrance.x); level.goal.x = mirror(level.goal.x)
      level.platforms.forEach(b => { b.x = mirror(b.x + b.w) })
      level.props.forEach(p => { p.x = mirror(p.x) })
      level.climbables.ropes.forEach(r => { r.x = mirror(r.x) })
    }
    assert.deepEqual(levelProblems(level), [])
    const run = createRun(level), rope = run.player.ropes[0], pin = rope.definition, ball = run.props[0]
    let closest = Infinity, speed = 0, length = 0, span = 0
    for (let frame = 0; frame < Math.ceil(6 / dt); frame++) {
      // Ordinary grounded pushing carries the ball across the pin and off the shelf.
      stepRun(run, { ...NEUTRAL_INPUT, move: frame * dt < 110 * STEP ? side : 0 }, dt)
      if (Math.abs(ball.y - pin.y) < .1) closest = Math.min(closest, Math.abs(ball.x - pin.x))
      const path = ropePath(pin, rope)
      length = Math.max(length, path.slice(1).reduce((sum, b, i) => sum + Math.hypot(b[0] - path[i][0], b[1] - path[i][1]), 0))
      for (let i = 1; i < rope.nodes.length; i++) {
        const a = rope.nodes[i - 1], b = rope.nodes[i], bend = rope.bends[i - 1]
        const distance = bend ? Math.hypot(a.x - bend[0], a.y - bend[1]) + Math.hypot(b.x - bend[0], b.y - bend[1]) : Math.hypot(a.x - b.x, a.y - b.y)
        span = Math.max(span, distance)
        speed = Math.max(speed, Math.hypot(b.x - b.oldX, b.y - b.oldY) / dt)
      }
      assert.deepEqual([rope.nodes[0].x, rope.nodes[0].y], [pin.x, pin.y])
    }
    assert.ok(closest < 4, `the bottom of the ball passes directly over the pin: ${closest}`)
    assert.ok((ball.x - pin.x) * side > ball.size && ball.y > pin.y + pin.length, 'the ball rolls clear and falls below the rope')
    assert.ok(length < pin.length + 3, `the rope retains its length: ${length}`)
    assert.ok(span < 10, `no segment stretches across the level: ${span}`)
    assert.ok(speed < 200, `anchor clearance does not inject a launch velocity: ${speed}`)
  })
}
