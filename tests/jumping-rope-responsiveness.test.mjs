import test from 'node:test'
import assert from 'node:assert/strict'
import { createPlayer, stepPlayer, NEUTRAL_INPUT, STEP } from '../src/games/jumping/model.ts'
import { ropeGripDistance, ropePoint } from '../src/games/jumping/climbables.ts'

function hang(length, side = 1) {
  const world = { ladders: [], ropes: [{ x: 500, y: 100, length, segments: 12 }] }
  const p = createPlayer({ x: 500 - side * 10, y: 100 + length - 45 + 56 })
  p.grounded = false; p.facing = side
  const tick = (move = 0) => stepPlayer(p, { ...NEUTRAL_INPUT, move }, STEP, [], world, { checkpoints: [], fallY: Infinity })
  for (let frame = 0; frame < 120; frame++) tick()
  assert.equal(p.climbing?.kind, 'rope')
  const rope = p.climbing.rope, distance = ropeGripDistance(p.climbing)
  return { p, rope, tick, point: () => ropePoint(rope, distance) }
}

test('a brief weight shift gets short and long ropes moving promptly in either direction', () => {
  for (const length of [350, 600, 1300]) for (const side of [-1, 1]) {
    const s = hang(length, side)
    for (let frame = 0; frame < 60; frame++) s.tick(frame < 42 ? side : 0)
    assert.ok((s.point()[0] - 500) * side > 48, `a ${length}-unit rope should travel at least two player widths within half a second`)
    assert.equal(s.p.climbing?.rope, s.rope)
    assert.deepEqual([s.rope.nodes[0].x, s.rope.nodes[0].y], [500, 100])
  }
})

test('a long free hang carries most of a single push through its return without repeated input', () => {
  const s = hang(1300), samples = []
  for (let frame = 0; frame < 1440; frame++) {
    s.tick(frame < 42 ? 1 : 0)
    samples.push(s.point()[0] - 500)
  }
  const peaks = samples.filter((x, i) => i > 0 && i < samples.length - 1 && x > samples[i - 1] && x >= samples[i + 1])
  assert.ok(samples.some(x => x < -40), 'gravity carries the swing back through center')
  assert.ok(peaks.length >= 2 && peaks[1] > peaks[0] * .75, 'the next outward swing retains at least three quarters of the first amplitude')
  assert.equal(s.p.climbing?.rope, s.rope)
})
