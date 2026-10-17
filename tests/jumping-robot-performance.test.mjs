import test from 'node:test'
import assert from 'node:assert/strict'
import { robotPlatforms, robotSupport } from '../src/games/jumping/robotPhysics.ts'
import { platformLedges } from '../src/games/jumping/terrainLedges.ts'

test('an exactly settled flat wheel support stops repeating the same terrain queries', () => {
  let outlineReads = 0
  const floor = { x: 0, y: 500, w: 1000, h: 420, get polygon() { outlineReads++; return undefined } }
  assert.deepEqual(robotSupport([floor], 500, 500), { x: 500, y: 500, angle: 0 })
  assert.ok(outlineReads < 40, `flat footing should not repeat all twelve passes (${outlineReads} reads)`)
})

test('bot collision snapshots reuse a quiet pose and refresh every change in its silhouette', () => {
  const robot = { x: 500, y: 500, angle: 0, facing: 1, phase: 'patrol' }
  const initial = robotPlatforms(robot), original = JSON.stringify(initial)
  assert.equal(robotPlatforms(robot), initial)
  let previous = initial
  for (const change of [{ x: 501 }, { y: 501 }, { angle: .2 }, { facing: -1 }, { phase: 'windup' }, { phase: 'patrol' }]) {
    Object.assign(robot, change)
    const shapes = robotPlatforms(robot)
    assert.notEqual(shapes, previous)
    assert.deepEqual(shapes, robotPlatforms({ ...robot }), 'cached geometry matches a freshly built hull')
    assert.equal(robotPlatforms(robot), shapes)
    assert.ok(shapes.every(shape => platformLedges(shape).length === 0))
    assert.equal(JSON.stringify(initial), original, 'older contact worlds keep their original geometry')
    previous = shapes
  }
})
