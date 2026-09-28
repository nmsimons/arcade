import test from 'node:test'
import assert from 'node:assert/strict'
import { triangulateCaster, clipShadowPolygon } from '../src/games/jumping/lightingGpuGeometry.ts'
import { polygonPoints, pointInside } from '../src/games/jumping/geometry.ts'
import { athleteCasters } from '../src/games/jumping/athleteShadow.ts'
import { createPlayer, gaitPose } from '../src/games/jumping/model.ts'
import { shadowQuad } from '../src/games/jumping/lightingModel.ts'

const area = points => points.reduce((sum, a, i) => {
  const b = points[(i + 1) % points.length]; return sum + a[0] * b[1] - a[1] * b[0]
}, 0) / 2
const triangleArea = points => {
  let sum = 0
  for (let i = 0; i < points.length; i += 3) sum += area(points.slice(i, i + 3))
  return sum
}

test('GPU triangulation keeps concave cavities open and handles collinear outline points', () => {
  const shape = { x: 0, y: 0, w: 100, h: 100, polygon: [[0, 0], [50, 0], [100, 0], [100, 100], [80, 100], [80, 20], [20, 20], [20, 100], [0, 100]] }
  for (const polygon of [shape.polygon, [...shape.polygon].reverse()]) {
    const points = polygonPoints({ ...shape, polygon }), triangles = triangulateCaster(points)
    assert.ok(Math.abs(triangleArea(triangles) - area(points)) < 1e-7)
    for (let x = 5; x < 100; x += 10) for (let y = 5; y < 100; y += 10) {
      let filled = false
      for (let i = 0; i < triangles.length; i += 3) filled ||= pointInside({ ...shape, polygon: triangles.slice(i, i + 3) }, x, y)
      assert.equal(filled, pointInside(shape, x, y), `cavity sample ${x},${y}`)
    }
  }
})

test('GPU triangle coverage follows animated player outlines in both facings', () => {
  const player = createPlayer()
  let checked = 0
  for (const facing of [-1, 1]) for (const crouch of [0, .5, 1]) for (const grounded of [false, true]) for (const stride of [0, .8, 1.6, 2.4, 3.2, 4.8]) {
    Object.assign(player, { facing, crouch, grounded, stride, vx: 180, vy: -120, gait: gaitPose(180, !grounded) })
    for (const shape of athleteCasters(player)) {
      const points = polygonPoints(shape), triangles = triangulateCaster(points)
      assert.ok(Math.abs(triangleArea(triangles) - area(points)) < 1e-6, `pose ${facing}/${crouch}/${grounded}/${stride}`)
      checked++
    }
  }
  assert.ok(checked > 1000)
})

test('clipping retains distant and near-source shadows within finite GPU coordinates', () => {
  const view = { x: 10000, y: 0, w: 1280, h: 720 }
  for (const edge of [[[1, -1000], [1, 1000]], [[.01, -1000], [.01, 1000]], [[6000, 60], [6000, 140]]]) {
    const polygon = shadowQuad({ x: 0, y: 100 }, edge[0], edge[1], 20000)
    const clipped = clipShadowPolygon(polygon, view)
    assert.ok(clipped.length >= 3)
    for (const [x, y] of clipped) {
      assert.ok(Number.isFinite(x) && Number.isFinite(y))
      assert.ok(x >= view.x - 1e-6 && x <= view.x + view.w + 1e-6)
      assert.ok(y >= view.y - 1e-6 && y <= view.y + view.h + 1e-6)
    }
  }
  assert.deepEqual(clipShadowPolygon([[0, 0], [1, 0], [0, 1]], view), [])
})
