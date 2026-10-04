import test from 'node:test'
import assert from 'node:assert/strict'
import { createPlayer, NEUTRAL_INPUT, STEP, stepPlayer } from '../src/games/jumping/model.ts'
import { createRope, ropeGripDistance, ropeImpulse, ropePoint, stepRope } from '../src/games/jumping/climbables.ts'
import { prepareRope } from '../src/games/jumping/ropeLayout.ts'

function scene(length, distance = length - 8, speed = 0) {
  const definition = { x: 500, y: 100, length, segments: 12 }
  const world = { ladders: [], ropes: [definition] }, rope = createRope(definition)
  ropeImpulse(rope, distance, speed, 0, STEP)
  const p = createPlayer({ x: 490, y: definition.y + distance + 56 })
  Object.assign(p, { grounded: false, ropes: [rope] })
  const tick = (input = {}) => stepPlayer(p, { ...NEUTRAL_INPUT, ...input }, STEP, [], world)
  tick()
  assert.equal(p.climbing?.kind, 'rope')
  return { p, rope, tick }
}

test('a player at the end of a long rope settles without stretching or bouncing', () => {
  for (const length of [600, 1200, 1997, 2000]) {
    const { p, rope, tick } = scene(length)
    for (let frame = 0; frame < 60; frame++) tick()
    const y = p.y
    for (let frame = 0; frame < 300; frame++) {
      tick()
      assert.equal(p.climbing?.rope, rope)
      assert.ok(Math.abs(p.y - y) < .1, `idle body bounced on a ${length}-unit rope`)
      assert.ok(Math.abs(p.vy) < 1, `idle rope supplied release speed: ${p.vy}`)
      assert.ok(ropePoint(rope, ropeGripDistance(p.climbing))[1] <= rope.definition.y + length + .1)
    }
  }
})

test('a long loaded rope keeps its length and swings back under gravity', () => {
  const length = 2000, distance = length - 8, rope = createRope({ x: 0, y: 0, length, segments: 12 })
  ropeImpulse(rope, distance, 350, 0, STEP)
  let peak = 0, crossed = false, previousVx = 350
  for (let frame = 0; frame < 720; frame++) {
    stepRope(rope, STEP, [], { distance, move: 0 })
    const grip = ropePoint(rope, distance), old = ropePoint(rope, distance, true)
    const vx = (grip[0] - old[0]) / STEP
    peak = Math.max(peak, grip[0]); crossed ||= grip[0] < -10
    const pathLength = rope.nodes.slice(1).reduce((sum, n, i) => sum + Math.hypot(n.x - rope.nodes[i].x, n.y - rope.nodes[i].y), 0)
    assert.ok(pathLength < length + 3, `rope stretched to ${pathLength}`)
    if (frame > 120) assert.ok(Math.abs(vx - previousVx) < 8, 'swing must not jerk or reverse suddenly')
    previousVx = vx
  }
  assert.ok(peak > 40 && crossed, 'the player must carry momentum into a gravity-driven return swing')
  assert.deepEqual([rope.nodes[0].x, rope.nodes[0].y], [0, 0])
})

test('catching a prepared long rope cannot release stored stretching as a launch', () => {
  const definition = prepareRope({ x: 500, y: 100, length: 2000, segments: 250 }, [])
  const world = { ladders: [], ropes: [definition] }, rope = createRope(definition)
  const grip = ropePoint(rope, 1992), p = createPlayer({ x: grip[0] - 10, y: grip[1] + 56 })
  Object.assign(p, { grounded: false, ropes: [rope] })
  for (let frame = 0; frame < 40; frame++) {
    stepPlayer(p, NEUTRAL_INPUT, STEP, [], world)
    assert.equal(p.climbing?.rope, rope)
    assert.ok(Math.hypot(p.vx, p.vy) * STEP < .1, `a stationary catch supplied ${p.vy} vertical speed`)
  }
  const saved = { ...definition, rest: { ...definition.rest, key: definition.rest.key.replace(/^7:/, '6:') } }
  const rebuilt = prepareRope(saved, [])
  assert.notEqual(rebuilt.rest.key, saved.rest.key, 'older saved layouts must be rebuilt with corrected tension')
  assert.deepEqual(rebuilt.rest.points, definition.rest.points)
})

test('descending off a long swinging rope inherits rope motion without an end-of-rope launch', () => {
  for (const length of [600, 1997, 2000]) for (const speed of [-300, 0, 300]) {
    const { p, tick } = scene(length, length - 60, speed)
    for (let frame = 0; frame < 40; frame++) tick()
    let released = false
    for (let frame = 0; frame < 100 && p.climbing; frame++) {
      const c = p.climbing, incomingVx = p.vx
      tick({ descend: true })
      if (p.climbing) continue
      released = true
      assert.ok(Math.abs(p.vx - incomingVx) < 15, 'leaving the last grip must not inject a sideways impulse')
      assert.ok(Math.abs(p.vx) < 180, `descending generated a sideways launch: ${p.vx}`)
      assert.ok(Math.abs(p.vy) < 240, `descending generated a vertical launch: ${p.vy}`)
      assert.equal(c.hangBlend, 1, 'the feet must hang freely before the last grip is released')
    }
    assert.ok(released, 'continued descent must let go of the final handhold')
    for (let frame = 0; frame < 12; frame++) { tick(); assert.equal(p.climbing, null) }
  }
})

test('dropping during the last climbing stroke does not turn animation into momentum', () => {
  for (const direction of [-1, 1]) {
    const { p, rope, tick } = scene(2000, 1940, direction * 300)
    for (let frame = 0; frame < 40; frame++) tick()
    for (let frame = 0; frame < 55; frame++) tick({ descend: true })
    assert.ok(p.climbing)
    const vx = p.vx, x = p.x, y = p.y
    assert.ok(Math.abs(vx) < 180, `climbing pose injected speed before drop: ${vx}`)
    tick({ detach: true, move: direction })
    assert.equal(p.climbing, null)
    assert.equal(p.vx, vx)
    assert.deepEqual([p.x, p.y], [x, y], 'dropping cannot snap the player to an extrapolated rope pose')
    assert.ok(rope.nodes.every(n => Number.isFinite(n.x) && Number.isFinite(n.y)))
  }
})
