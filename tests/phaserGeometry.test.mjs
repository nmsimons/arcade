import assert from 'node:assert/strict'
import test from 'node:test'

import { rayCircleHitDistance } from '../src/games/hardVacuum/phaserGeometry.ts'

test('collision finds the entry point of targets in front of the beam', () => {
  assert.equal(
    rayCircleHitDistance({ x: 400, y: 300 }, { x: 1, y: 0 }, 520, { x: 700, y: 300 }, 5),
    295,
  )
  assert.equal(
    rayCircleHitDistance({ x: 640, y: 360 }, { x: 0, y: -1 }, 520, { x: 640, y: 140 }, 5),
    215,
  )
})

test('collision rejects targets behind or beyond the beam', () => {
  assert.equal(
    rayCircleHitDistance({ x: 400, y: 300 }, { x: 1, y: 0 }, 520, { x: 150, y: 300 }, 5),
    null,
  )
  assert.equal(
    rayCircleHitDistance({ x: 400, y: 300 }, { x: 1, y: 0 }, 520, { x: 1000, y: 300 }, 5),
    null,
  )
})

test('collision includes a circle whose near edge overlaps the beam endpoint', () => {
  assert.equal(
    rayCircleHitDistance({ x: 0, y: 0 }, { x: 1, y: 0 }, 520, { x: 525, y: 0 }, 10),
    515,
  )
})
