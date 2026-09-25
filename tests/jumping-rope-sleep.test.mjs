import test from 'node:test'
import assert from 'node:assert/strict'
import { createRope, stepRope, ropeImpulse, ropePoint } from '../src/games/jumping/climbables.ts'
import { prepareRope } from '../src/games/jumping/ropeLayout.ts'
import { ropeCanSleep } from '../src/games/jumping/ropeSleep.ts'
import { STEP } from '../src/games/jumping/model.ts'
import { lineBlocked } from '../src/games/jumping/geometry.ts'

const free = (length = 2000) => createRope(prepareRope({ x: 0, y: 0, length, segments: Math.ceil(length / 8) }, []))
const advance = (rope, terrain = [], load = null, frames = 120) => {
  for (let i = 0; i < frames; i++) stepRope(rope, STEP, terrain, load)
}

test('prepared long ropes start asleep and retain their exact editor geometry in play', () => {
  const rope = free(), before = structuredClone(rope)
  assert.equal(ropeCanSleep(rope, [], false), true)
  advance(rope, [], null, 1000)
  assert.deepEqual(rope, before, 'idle ropes do not keep solving and drifting')
})

test('long ropes anchored on either cliff face settle outside the wall and start asleep', () => {
  const wall = { x: 0, y: 0, w: 400, h: 2400 }
  for (const side of [-1, 1]) {
    const x = side === 1 ? wall.w : 0
    const rope = createRope(prepareRope({ x, y: 100, length: 2000, segments: 250 }, [wall]))
    assert.equal(ropeCanSleep(rope, [wall], false), true)
    assert.ok(Math.abs(rope.nodes.at(-1).x - (x + side * 1.5)) < .01)
    assert.ok(Math.abs(rope.nodes.at(-1).y - 2100) < .01)
    rope.nodes.slice(1).forEach((n, i) => assert.equal(lineBlocked([rope.nodes[i].x, rope.nodes[i].y], [n.x, n.y], [wall]), false))
    const before = structuredClone(rope)
    advance(rope, [wall])
    assert.deepEqual(rope, before)
  }
})

test('unprepared ropes settle before sleeping and then stop doing physical work', () => {
  const rope = createRope({ x: 0, y: 0, length: 1200, segments: 150 })
  assert.equal(ropeCanSleep(rope, [], false), false)
  advance(rope, [], null, 180)
  assert.equal(ropeCanSleep(rope, [], false), true)
  const before = structuredClone(rope)
  advance(rope)
  assert.deepEqual(rope, before)
})

test('grabbing and impulses wake sleeping ropes without injecting stored velocity', () => {
  for (const impulse of [false, true]) {
    const rope = free(), before = ropePoint(rope, 1900)
    if (impulse) ropeImpulse(rope, 1900, 150, 0, STEP)
    const load = impulse ? null : { distance: 1900, move: 1 }
    assert.equal(ropeCanSleep(rope, [], !impulse), false)
    advance(rope, [], load, 60)
    assert.ok(ropePoint(rope, 1900)[0] > before[0] + 5)
    assert.ok(rope.nodes.every(n => Math.hypot(n.x - n.oldX, n.y - n.oldY) / STEP < 400))
  }
})

test('equivalent live geometry does not wake a rope but a moving gate does', () => {
  const rope = free(240), gate = { x: 40, y: 100, w: 20, h: 80 }
  assert.equal(ropeCanSleep(rope, [gate], false), true)
  for (let i = 0; i < 120; i++) {
    const live = [{ ...gate }]
    advance(rope, live, null, 1)
    assert.equal(ropeCanSleep(rope, live, false), true)
  }
  const before = structuredClone(rope.nodes)
  gate.x = -10
  assert.equal(ropeCanSleep(rope, [gate], false), false)
  advance(rope, [gate], null, 4)
  assert.notDeepEqual(rope.nodes, before, 'the new obstacle must participate in the solver')
})

test('a new prop overlapping the saved layout is resolved on the first live step', () => {
  const rope = free(240), box = { x: -10, y: 100, w: 20, h: 20 }
  assert.equal(ropeCanSleep(rope, [box], false), false)
  const before = structuredClone(rope.nodes)
  advance(rope, [box], null, 1)
  assert.notDeepEqual(rope.nodes, before)
})

test('removing a support wakes a resting rope and lets its tail fall', () => {
  const floor = { x: -1000, y: 240, w: 2000, h: 50 }
  const rope = createRope(prepareRope({ x: 0, y: 100, length: 300, segments: 38 }, [floor]))
  assert.equal(ropeCanSleep(rope, [floor], false), true)
  const y = rope.nodes.at(-1).y
  advance(rope, [], null, 60)
  assert.ok(rope.nodes.at(-1).y > y + 10)
})

test('polygon edits and anchor changes invalidate sleep even without replacing their objects', () => {
  const shape = { x: 20, y: 100, w: 80, h: 80, polygon: [[0,0],[80,0],[80,80],[0,80]] }
  const rope = free(240)
  assert.equal(ropeCanSleep(rope, [shape], false), true)
  assert.equal(ropeCanSleep(rope, [structuredClone(shape)], false), true)
  shape.polygon[0][1] = 10
  assert.equal(ropeCanSleep(rope, [shape], false), false)
  const moved = free(240)
  assert.equal(ropeCanSleep(moved, [], false), true)
  moved.definition.x = 10
  assert.equal(ropeCanSleep(moved, [], false), false)
  advance(moved, [], null, 1)
  assert.equal(moved.nodes[0].x, 10)
})
