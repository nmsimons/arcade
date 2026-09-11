import type { Vector2 } from './types'

export const WORLD_WIDTH = 3000
export const WORLD_HEIGHT = 2200
export const WORLD_CENTER: Vector2 = { x: WORLD_WIDTH / 2, y: WORLD_HEIGHT / 2 }

// A deliberately broad, convex first cavern. Convexity keeps collision handling
// predictable while the individual wall segments still make the space feel natural.
export const CAVERN_POINTS: readonly Vector2[] = [
  { x: 610, y: 150 },
  { x: 1450, y: 70 },
  { x: 2310, y: 155 },
  { x: 2800, y: 500 },
  { x: 2930, y: 1070 },
  { x: 2800, y: 1660 },
  { x: 2310, y: 2040 },
  { x: 1490, y: 2140 },
  { x: 670, y: 2040 },
  { x: 200, y: 1680 },
  { x: 70, y: 1090 },
  { x: 190, y: 500 },
]

export const worldDelta = (ax: number, ay: number, bx: number, by: number) => ({
  dx: bx - ax,
  dy: by - ay,
})

const inwardNormal = (a: Vector2, b: Vector2) => {
  const ex = b.x - a.x
  const ey = b.y - a.y
  const length = Math.max(1e-9, Math.hypot(ex, ey))
  let nx = -ey / length
  let ny = ex / length
  const midpointX = (a.x + b.x) / 2
  const midpointY = (a.y + b.y) / 2
  if ((WORLD_CENTER.x - midpointX) * nx + (WORLD_CENTER.y - midpointY) * ny < 0) {
    nx = -nx
    ny = -ny
  }
  return { nx, ny }
}

export const distanceToCavernWall = (point: Vector2) => {
  let nearest = Infinity
  for (let i = 0; i < CAVERN_POINTS.length; i++) {
    const a = CAVERN_POINTS[i]
    const b = CAVERN_POINTS[(i + 1) % CAVERN_POINTS.length]
    const { nx, ny } = inwardNormal(a, b)
    nearest = Math.min(nearest, (point.x - a.x) * nx + (point.y - a.y) * ny)
  }
  return nearest
}

export const isInsideCavern = (point: Vector2, clearance = 0) => distanceToCavernWall(point) >= clearance

export const resolveCircleInCavern = (
  pos: Vector2,
  vel: Vector2,
  radius: number,
  restitution = 0.55,
) => {
  let collided = false
  let maxImpactSpeed = 0

  // Multiple passes make corner contacts settle without allowing tunnelling.
  for (let pass = 0; pass < 3; pass++) {
    let adjusted = false
    for (let i = 0; i < CAVERN_POINTS.length; i++) {
      const a = CAVERN_POINTS[i]
      const b = CAVERN_POINTS[(i + 1) % CAVERN_POINTS.length]
      const { nx, ny } = inwardNormal(a, b)
      const distance = (pos.x - a.x) * nx + (pos.y - a.y) * ny
      if (distance >= radius) continue

      const correction = radius - distance
      pos.x += nx * correction
      pos.y += ny * correction
      collided = true
      adjusted = true

      const normalVelocity = vel.x * nx + vel.y * ny
      if (normalVelocity < 0) {
        maxImpactSpeed = Math.max(maxImpactSpeed, -normalVelocity)
        vel.x -= (1 + restitution) * normalVelocity * nx
        vel.y -= (1 + restitution) * normalVelocity * ny
      }
    }
    if (!adjusted) break
  }

  return { collided, maxImpactSpeed }
}

const cross = (ax: number, ay: number, bx: number, by: number) => ax * by - ay * bx

/** Returns the first distance from a ray origin to the cavern wall. */
export const raycastCavern = (origin: Vector2, direction: Vector2, maxDistance: number) => {
  const magnitude = Math.hypot(direction.x, direction.y)
  if (magnitude < 1e-9 || maxDistance <= 0) return 0
  const dx = direction.x / magnitude
  const dy = direction.y / magnitude
  let nearest = maxDistance

  for (let i = 0; i < CAVERN_POINTS.length; i++) {
    const a = CAVERN_POINTS[i]
    const b = CAVERN_POINTS[(i + 1) % CAVERN_POINTS.length]
    const ex = b.x - a.x
    const ey = b.y - a.y
    const denominator = cross(dx, dy, ex, ey)
    if (Math.abs(denominator) < 1e-9) continue

    const ox = a.x - origin.x
    const oy = a.y - origin.y
    const distance = cross(ox, oy, ex, ey) / denominator
    const edgeT = cross(ox, oy, dx, dy) / denominator
    if (distance >= 0 && distance <= nearest && edgeT >= 0 && edgeT <= 1) nearest = distance
  }

  return nearest
}
