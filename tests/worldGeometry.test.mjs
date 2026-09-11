import assert from 'node:assert/strict'
import test from 'node:test'

import {
  WORLD_CENTER,
  distanceToCavernWall,
  isInsideCavern,
  raycastCavern,
  resolveCircleInCavern,
  worldDelta,
} from '../src/games/hardVacuum/worldGeometry.ts'

test('the cavern contains its center and rejects distant points', () => {
  assert.equal(isInsideCavern(WORLD_CENTER, 100), true)
  assert.equal(isInsideCavern({ x: -10, y: WORLD_CENTER.y }), false)
  assert.ok(distanceToCavernWall(WORLD_CENTER) > 900)
})

test('cavern collision pushes a body inward and reflects outward velocity', () => {
  const pos = { x: 40, y: 1090 }
  const vel = { x: -100, y: 0 }
  const result = resolveCircleInCavern(pos, vel, 15, 0.5)

  assert.equal(result.collided, true)
  assert.ok(result.maxImpactSpeed > 90)
  assert.equal(isInsideCavern(pos, 14.99), true)
  assert.ok(vel.x > 0)
})

test('cavern raycasts stop lasers at a physical wall', () => {
  const hit = raycastCavern(WORLD_CENTER, { x: 1, y: 0 }, 5000)
  assert.ok(hit > 1200)
  assert.ok(hit < 1500)
})

test('world deltas never wrap across viewport-sized distances', () => {
  assert.deepEqual(worldDelta(2900, 1100, 100, 1100), { dx: -2800, dy: 0 })
})
