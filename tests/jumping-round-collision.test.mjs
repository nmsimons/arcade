import test from 'node:test'
import assert from 'node:assert/strict'
import Matter from 'matter-js'
import { ballHull } from '../src/games/jumping/propGeometry.ts'
import { collisionPenetration, registerRoundBody, registerRoundProbe, roundCollision, roundQuery } from '../src/games/jumping/roundCollision.ts'

const ball = (size, x, y, wet = false) => {
  const body = Matter.Body.create({ position: { x, y }, vertices: ballHull(size, wet).map(([x, y]) => ({ x, y })) })
  registerRoundBody(body)
  return body
}
const snapshot = hit => hit && ({ a: hit.bodyA, b: hit.bodyB, parentA: hit.parentA, parentB: hit.parentB,
  depth: hit.depth, normal: { ...hit.normal }, tangent: { ...hit.tangent }, penetration: { ...hit.penetration },
  supports: hit.supports.slice(0, hit.supportCount) })
const compare = (a, b) => {
  const aa = a.axes, ba = b.axes
  assert.deepEqual(snapshot(roundCollision(a, b)), snapshot(Matter.Collision.collides(a, b)))
  assert.equal(a.axes, aa); assert.equal(b.axes, ba)
  const hit = collisionPenetration(a, b), expected = Matter.Collision.collides(a, b)
  assert.deepEqual(hit, expected && { bodyA: expected.bodyA, bodyB: expected.bodyB, normal: expected.normal, depth: expected.depth })
}

test('correction-only SAT retains exact polygon axes, ties, normals and record refresh', () => {
  const a = Matter.Bodies.rectangle(0, 0, 30, 50), b = Matter.Bodies.trapezoid(10, 0, 40, 35, .3)
  let previous
  for (let i = 0; i < 240; i++) {
    Matter.Body.setPosition(b, { x: Math.cos(i * .13) * 50, y: Math.sin(i * .19) * 50 })
    Matter.Body.setAngle(a, i * .07); Matter.Body.setAngle(b, -i * .11)
    for (const [first, second] of [[a, b], [b, a]]) {
      const expected = Matter.Collision.collides(first, second)
      const hit = collisionPenetration(first, second, previous)
      assert.deepEqual(hit, expected && { bodyA: expected.bodyA, bodyB: expected.bodyB, normal: expected.normal, depth: expected.depth })
      if (hit) previous = hit
    }
  }
})

test('round projections preserve exact contacts across direction, depth, rotation and translation', () => {
  for (const wet of [false, true]) for (const size of [16, 30, 49, 80, 200]) {
    const a = ball(size, 240, 1800, wet), b = ball(40, 240, 1800, wet)
    const box = Matter.Bodies.rectangle(240, 1800, 50, 35)
    for (let i = 0; i < 64; i++) {
      const angle = i * Math.PI / 32
      Matter.Body.setAngle(a, angle * .13); Matter.Body.setAngle(box, angle * .37)
      for (const distance of [0, (size + 40) / 2 - 1e-10, (size + 40) / 2, (size + 40) / 2 + .01, 500]) {
        Matter.Body.setPosition(b, { x: 240 + Math.cos(angle) * distance, y: 1800 + Math.sin(angle) * distance })
        compare(a, b); compare(b, a); compare(a, box); compare(box, a)
      }
    }
    Matter.Body.translate(a, { x: 1000000, y: -1000000 })
    Matter.Body.setPosition(b, a.position)
    compare(a, b)
  }
})

test('cached extremum indices refresh for edited axes, ball resizing and water hull changes', () => {
  const a = ball(40, 240, 1800), b = Matter.Bodies.rectangle(240, 1800, 45, 55)
  compare(a, b)
  for (let i = 0; i < 80; i++) {
    Matter.Body.setAngle(b, i * .07)
    Matter.Body.setAngle(a, -i * .019)
    compare(a, b)
  }
  for (const [size, wet] of [[30, true], [60, false], [40, true], [200, true]]) {
    Matter.Body.setAngle(a, 0)
    Matter.Body.setVertices(a, ballHull(size, wet).map(([x, y]) => ({ x: a.position.x + x, y: a.position.y + y })))
    compare(a, b); compare(b, a)
  }
})

test('padded sleeping probes retain compound traversal, contact order and exact supports', () => {
  const a = ball(40, 240, 1800)
  const compound = Matter.Body.create({ parts: [Matter.Bodies.rectangle(260, 1800, 30, 30), Matter.Bodies.rectangle(240, 1825, 30, 30)] })
  const b = ball(40, 278, 1800), wall = Matter.Bodies.rectangle(215, 1800, 12, 200)
  Matter.Sleeping.set(a, true)
  for (const padding of [.001, .01]) {
    const scale = 1 + padding / 20, center = a.position
    const probe = { ...a, bounds: { min: { x: a.bounds.min.x - padding, y: a.bounds.min.y - padding },
      max: { x: a.bounds.max.x + padding, y: a.bounds.max.y + padding } },
      vertices: a.vertices.map(v => ({ ...v, x: center.x + (v.x - center.x) * scale, y: center.y + (v.y - center.y) * scale })) }
    registerRoundProbe(a, probe)
    const others = [compound, b, wall]
    assert.deepEqual(roundQuery(probe, others).map(snapshot), Matter.Query.collides(probe, others).map(snapshot))
    compare(probe, b)
  }
})

test('unregistered polygons use the original narrow phase', t => {
  const a = Matter.Bodies.rectangle(0, 0, 30, 50), b = Matter.Bodies.rectangle(20, 0, 30, 50)
  const original = Matter.Collision.collides
  let calls = 0
  t.mock.method(Matter.Collision, 'collides', (...args) => { calls++; return original(...args) })
  const aa = a.axes, ba = b.axes
  roundCollision(a, b)
  assert.equal(calls, 1)
  assert.equal(a.axes, aa); assert.equal(b.axes, ba)
})

test('dense round contacts retain 64 vertices while avoiding full scans on every axis', () => {
  const a = ball(40, 240, 1800), b = ball(40, 265, 1810)
  let reads = 0
  for (const body of [a, b]) for (const vertex of body.vertices) for (const key of ['x', 'y']) {
    const value = vertex[key]
    Object.defineProperty(vertex, key, { configurable: true, enumerable: true, get() { reads++; return value } })
  }
  const original = snapshot(Matter.Collision.collides(a, b)), originalReads = reads
  reads = 0
  assert.deepEqual(snapshot(roundCollision(a, b)), original)
  assert.ok(reads < originalReads / 4, `${reads} optimized reads versus ${originalReads} original reads`)
  assert.equal(a.vertices.length, 64); assert.equal(b.vertices.length, 64)
})
