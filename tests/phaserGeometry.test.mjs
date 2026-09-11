import assert from 'node:assert/strict'
import test from 'node:test'

import {
  getToroidalRayCopies,
  toroidalRayCircleHitDistance,
  wrapCoordinate,
} from '../src/games/hardVacuum/phaserGeometry.ts'

const assertCopiesPointForward = (copies, direction) => {
  assert.ok(copies.length > 0)
  for (const copy of copies) {
    const dx = copy.end.x - copy.start.x
    const dy = copy.end.y - copy.start.y
    assert.ok(dx * direction.x + dy * direction.y > 0)
  }
}

test('wrapped render copies preserve cardinal firing direction', () => {
  assertCopiesPointForward(getToroidalRayCopies({ x: 400, y: 300 }, { x: 1, y: 0 }, 520, 800, 600), { x: 1, y: 0 })
  assertCopiesPointForward(getToroidalRayCopies({ x: 640, y: 360 }, { x: 0, y: -1 }, 520, 1280, 720), { x: 0, y: -1 })
})

test('diagonal rays expose all wrapped segments', () => {
  const copies = getToroidalRayCopies({ x: 700, y: 500 }, { x: 0.8, y: 0.6 }, 300, 800, 600)
  assertCopiesPointForward(copies, { x: 0.8, y: 0.6 })
  assert.ok(copies.length >= 3)
})

test('collision finds forward targets beyond the nearest-image half screen', () => {
  assert.equal(
    toroidalRayCircleHitDistance({ x: 400, y: 300 }, { x: 1, y: 0 }, 520, { x: 100, y: 300 }, 5, 800, 600),
    500,
  )
  assert.equal(
    toroidalRayCircleHitDistance({ x: 640, y: 360 }, { x: 0, y: -1 }, 520, { x: 640, y: 580 }, 5, 1280, 720),
    500,
  )
})

test('collision rejects targets beyond beam range', () => {
  assert.equal(
    toroidalRayCircleHitDistance({ x: 400, y: 300 }, { x: 1, y: 0 }, 520, { x: 150, y: 300 }, 5, 800, 600),
    null,
  )
})

test('coordinate wrapping supports multiple crossings', () => {
  assert.equal(wrapCoordinate(820, 320), 180)
  assert.equal(wrapCoordinate(-680, 320), 280)
})
