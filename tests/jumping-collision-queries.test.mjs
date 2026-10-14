import test from 'node:test'
import assert from 'node:assert/strict'
import Matter from 'matter-js'
import { CollisionQueries } from '../src/games/jumping/collisionQueries.ts'

const snapshot = hits => hits.map(hit => ({
  a: hit.bodyA.id, b: hit.bodyB.id, depth: hit.depth, normal: hit.normal,
  tangent: hit.tangent, penetration: hit.penetration, supportCount: hit.supportCount,
  supports: hit.supports.slice(0, hit.supportCount).map(v => [v.body.id, v.index, v.x, v.y]),
}))
const compare = (queries, body, others) => assert.deepEqual(snapshot(queries.collides(body, others)), snapshot(Matter.Query.collides(body, others)))

test('ordered queries reuse exact hull pairs and invalidate translations and rotations', () => {
  const queries = new CollisionQueries(), a = Matter.Bodies.rectangle(0, 0, 32, 32)
  const b = Matter.Bodies.circle(24, 0, 16), c = Matter.Bodies.rectangle(0, 24, 32, 32)
  const old = Matter.Collision.collides
  let calls = 0
  Matter.Collision.collides = (...args) => { calls++; return old(...args) }
  try {
    const first = queries.collides(a, [b, c]), firstCalls = calls
    assert.equal(first.length, 2)
    assert.deepEqual(queries.collides(a, [b, c]), first)
    assert.equal(calls, firstCalls, 'unchanged queries skip SAT')
    compare(queries, a, [c, b]); compare(queries, b, [a])
    Matter.Body.translate(b, { x: -.01, y: .003 }); compare(queries, a, [b, c])
    Matter.Body.rotate(a, .03); compare(queries, a, [b, c])
    Matter.Body.setStatic(c, true); Matter.Sleeping.set(b, true)
    compare(queries, a, [b, c])
  } finally { Matter.Collision.collides = old }
})

test('null collisions and exactly touching faces remain equivalent through motion', () => {
  const queries = new CollisionQueries(), a = Matter.Bodies.rectangle(0, 0, 32, 32), b = Matter.Bodies.rectangle(32, 0, 32, 32)
  assert.deepEqual(queries.collides(a, [b]), [])
  for (const x of [32 - 1e-10, 32, 32 + 1e-10, 100, 31, -31]) {
    Matter.Body.setPosition(b, { x, y: 0 }); compare(queries, a, [b])
  }
})

test('coordinate edits and replaced vertices invalidate even without a changed pose', () => {
  const queries = new CollisionQueries(), a = Matter.Bodies.rectangle(0, 0, 32, 32), b = Matter.Bodies.rectangle(24, 0, 32, 32)
  compare(queries, a, [b])
  b.vertices[0].x += 1e-9; compare(queries, a, [b])
  b.axes[0].x += 1e-9; compare(queries, a, [b])
  b.vertices[0] = { ...b.vertices[0] }
  const hits = queries.collides(a, [b]), fresh = Matter.Query.collides(a, [b])
  assert.deepEqual(snapshot(hits), snapshot(fresh))
  for (let i = 0; i < hits[0].supportCount; i++) assert.equal(hits[0].supports[i], fresh[0].supports[i])
})

test('compound bodies and padded probe objects use Matter traversal unchanged', () => {
  const queries = new CollisionQueries(), a = Matter.Bodies.rectangle(0, 0, 32, 32)
  const compound = Matter.Body.create({ parts: [Matter.Bodies.rectangle(24, 0, 16, 16), Matter.Bodies.rectangle(24, 30, 16, 16)] })
  compare(queries, a, [compound]); compare(queries, compound, [a])
  const probe = { ...a, vertices: a.vertices.map(v => ({ ...v, x: v.x * 1.001, y: v.y * 1.001 })) }
  compare(queries, probe, [compound])
})

test('tracked correction queries reuse unchanged hulls and invalidate every edited participant', t => {
  const queries = new CollisionQueries(true), a = Matter.Bodies.rectangle(0, 0, 32, 32)
  const b = Matter.Bodies.circle(24, 0, 16), original = Matter.Collision.collides
  let calls = 0
  t.mock.method(Matter.Collision, 'collides', (...args) => { calls++; return original(...args) })
  queries.collides(a, [b]); const first = calls
  queries.collides(a, [b]); assert.equal(calls, first)
  for (const body of [a, b]) {
    Matter.Body.translate(body, { x: .01, y: .003 }); queries.invalidate(body); compare(queries, a, [b]); compare(queries, b, [a])
    Matter.Body.rotate(body, .03); queries.invalidate(body); compare(queries, a, [b])
    body.vertices[0].x += 1e-9; queries.invalidate(body); compare(queries, a, [b])
  }
})
