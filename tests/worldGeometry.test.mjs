import assert from 'node:assert/strict'
import test from 'node:test'

import {
  CAVERN_MAPS,
  WORLD_CENTER,
  distanceToCavernWall,
  getCavernMap,
  isInsideCavern,
  raycastCavern,
  resolveCircleInCavern,
  worldDelta,
} from '../src/games/hardVacuum/worldGeometry.ts'

const polygonCenter = (polygon) => ({
  x: polygon.reduce((sum, point) => sum + point.x, 0) / polygon.length,
  y: polygon.reduce((sum, point) => sum + point.y, 0) / polygon.length,
})

const polygonIsConvex = (polygon) => {
  let sign = 0
  for (let index = 0; index < polygon.length; index++) {
    const a = polygon[index]
    const b = polygon[(index + 1) % polygon.length]
    const c = polygon[(index + 2) % polygon.length]
    const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x)
    if (Math.abs(cross) < 1e-6) continue
    const nextSign = Math.sign(cross)
    if (sign !== 0 && nextSign !== sign) return false
    sign = nextSign
  }
  return true
}

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

test('ten named maps increase formation complexity and clamp after map ten', () => {
  assert.equal(CAVERN_MAPS.length, 10)
  assert.equal(new Set(CAVERN_MAPS.map((map) => map.name)).size, 10)
  assert.deepEqual(
    CAVERN_MAPS.map((map) => map.id),
    [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
  )

  for (let index = 1; index < CAVERN_MAPS.length; index++) {
    assert.ok(CAVERN_MAPS[index].obstacles.length > CAVERN_MAPS[index - 1].obstacles.length)
  }
  assert.equal(getCavernMap(0), CAVERN_MAPS[0])
  assert.equal(getCavernMap(999), CAVERN_MAPS[9])
})

test('every map keeps a clear base, convex formations, and ample asteroid spawn space', () => {
  for (const map of CAVERN_MAPS) {
    assert.equal(isInsideCavern(WORLD_CENTER, 360, map), true, `${map.name} crowds the mining base`)

    for (const obstacle of map.obstacles) {
      assert.equal(polygonIsConvex(obstacle), true, `${map.name} has a non-convex formation`)
      for (const point of obstacle) {
        assert.equal(isInsideCavern(point, 35, CAVERN_MAPS[0]), true, `${map.name} formation approaches outer wall`)
      }
    }

    let spawnCells = 0
    for (let y = 150; y <= 2050; y += 100) {
      for (let x = 150; x <= 2850; x += 100) {
        const distanceFromBase = Math.hypot(x - WORLD_CENTER.x, y - WORLD_CENTER.y)
        if (distanceFromBase >= 430 && distanceFromBase <= 950 && isInsideCavern({ x, y }, 78, map)) spawnCells++
      }
    }
    assert.ok(spawnCells >= 80, `${map.name} only has ${spawnCells} safe spawn cells`)
  }
})

test('the navigable space remains connected through all ten maps', () => {
  const spacing = 100
  const directions = [-1, 0, 1].flatMap((dx) => [-1, 0, 1].map((dy) => ({ dx, dy }))).filter(({ dx, dy }) => dx || dy)

  for (const map of CAVERN_MAPS) {
    const navigable = new Set()
    for (let y = 100; y <= 2100; y += spacing) {
      for (let x = 100; x <= 2900; x += spacing) {
        // 78px covers the largest initial asteroid plus its spawn buffer.
        if (isInsideCavern({ x, y }, 78, map)) navigable.add(`${x},${y}`)
      }
    }

    const start = `${WORLD_CENTER.x},${WORLD_CENTER.y}`
    assert.equal(navigable.has(start), true, `${map.name} blocks the start`)
    const visited = new Set([start])
    const queue = [start]
    while (queue.length > 0) {
      const [x, y] = queue.shift().split(',').map(Number)
      for (const { dx, dy } of directions) {
        const key = `${x + dx * spacing},${y + dy * spacing}`
        if (!navigable.has(key) || visited.has(key)) continue
        visited.add(key)
        queue.push(key)
      }
    }

    assert.ok(visited.size / navigable.size >= 0.97, `${map.name} has disconnected navigable pockets`)
  }
})

test('formations block lasers and push circles back into navigable space', () => {
  const map = CAVERN_MAPS[1]
  const obstacleCenter = polygonCenter(map.obstacles[0])
  const direction = {
    x: obstacleCenter.x - WORLD_CENTER.x,
    y: obstacleCenter.y - WORLD_CENTER.y,
  }
  const targetDistance = Math.hypot(direction.x, direction.y)
  const laserHit = raycastCavern(WORLD_CENTER, direction, 5000, map)
  assert.ok(laserHit > 0 && laserHit < targetDistance)

  const pos = { ...obstacleCenter }
  const original = { ...pos }
  const vel = { x: 80, y: 20 }
  const result = resolveCircleInCavern(pos, vel, 15, 0.5, map)
  assert.equal(result.collided, true)
  assert.equal(isInsideCavern(pos, 14.99, map), true)
  assert.ok(Math.hypot(pos.x - original.x, pos.y - original.y) > 100)
})
