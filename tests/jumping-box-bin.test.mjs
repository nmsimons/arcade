import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import Matter from 'matter-js'
import { parseLevel } from '../src/games/jumping/level.ts'
import { createRun, stepRun } from './helpers/jumping-active-run.mjs'
import { NEUTRAL_INPUT } from '../src/games/jumping/model.ts'
import { boxShape } from '../src/games/jumping/propGeometry.ts'
import { polygonIntersects, polygonPoints } from '../src/games/jumping/geometry.ts'

const fixture = () => parseLevel(JSON.parse(readFileSync(new URL('fixtures/jumping/box-bin.json', import.meta.url))))
function clear(run) {
  const shapes = run.props.map(boxShape)
  for (let i = 0; i < shapes.length; i++) {
    const points = polygonPoints(shapes[i])
    for (const other of [...run.terrain, ...shapes.slice(i + 1)]) {
      assert.equal(polygonIntersects(points, other, .05), false, 'the packed cargo remains outside its neighbours and bin')
    }
  }
}

test('the mixed-size heavy box bin settles and stays quiet', () => {
  const run = createRun(fixture())
  for (let f = 0; f < 480; f++) stepRun(run, NEUTRAL_INPUT)
  clear(run)
  const settled = run.props.map(({ x, y, angle }) => [x, y, angle])
  for (let f = 0; f < 600; f++) stepRun(run, NEUTRAL_INPUT)
  assert.deepEqual(run.props.map(({ x, y, angle }) => [x, y, angle]), settled)
  assert.ok(run.props.every(prop => prop.grounded && Math.hypot(prop.vx, prop.vy) < .01))
})

test('holding forward into the loaded bin keeps the coupled cargo and walls separate', t => {
  const level = fixture()
  level.entrance = { x: 630, y: 1620 }
  const run = createRun(level)
  for (let f = 0; f < 480; f++) stepRun(run, NEUTRAL_INPUT)
  const create = Matter.Collision.create
  let manifolds = 0, maxManifolds = 0
  t.mock.method(Matter.Collision, 'create', (...args) => { manifolds++; return create(...args) })
  let loaded = false
  for (let f = 0; f < 600; f++) {
    manifolds = 0
    stepRun(run, { ...NEUTRAL_INPUT, move: 1 })
    maxManifolds = Math.max(maxManifolds, manifolds)
    loaded ||= run.player.contacts.body.some(contact => contact.collider.prop && contact.load > 0 && Math.abs(contact.normal[0]) > .5)
    clear(run)
  }
  assert.ok(loaded, 'the player supplies a real side load to the mixed-weight stack')
  assert.ok(maxManifolds < 250, `ten loaded crates should not create hundreds of manifolds per tick (${maxManifolds})`)
})
