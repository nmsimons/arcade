export type Vector2 = { x: number; y: number }
export type Vehicle = {
  pos: Vector2
  vel: Vector2
  angle: number
  wheelAngle: number
  side: 'left' | 'right'
}

export type Ball = {
  pos: Vector2
  vel: Vector2
  radius: number
}

export type Bumper = {
  pos: Vector2
  radius: number
  hitTimer: number
}

export type Goal = {
  pos: Vector2
  radius: number
  gravityRadius: number
  side: 'left' | 'right'
}

export const FIELD = { left: 0, right: 1600, top: 0, bottom: 1000 } as const
export const CENTER = { x: (FIELD.left + FIELD.right) / 2, y: (FIELD.top + FIELD.bottom) / 2 }

export const segmentDistanceToPoint = (ax: number, ay: number, bx: number, by: number, px: number, py: number) => {
  const abx = bx - ax
  const aby = by - ay
  const apx = px - ax
  const apy = py - ay
  const ab2 = abx * abx + aby * aby
  if (ab2 <= 0.0001) return Math.hypot(apx, apy)
  const t = Math.max(0, Math.min(1, (apx * abx + apy * aby) / ab2))
  const cx = ax + abx * t
  const cy = ay + aby * t
  return Math.hypot(px - cx, py - cy)
}

export function createArena() {
  const field = FIELD

  const fieldWidth = field.right - field.left
  const fieldHeight = field.bottom - field.top
  const centerX = (field.left + field.right) / 2
  const centerY = (field.top + field.bottom) / 2

  // Generate bumpers in a pattern
  const bumpers: Bumper[] = []
  const bumperRadius = 20

  // Center circle bumper (just visual, the center is open)
  // Add bumpers in strategic positions

  // Top row
  bumpers.push({ pos: { x: centerX - fieldWidth * 0.25, y: field.top + fieldHeight * 0.25 }, radius: bumperRadius, hitTimer: 0 })
  bumpers.push({ pos: { x: centerX + fieldWidth * 0.25, y: field.top + fieldHeight * 0.25 }, radius: bumperRadius, hitTimer: 0 })

  // Middle row (flanking center)
  bumpers.push({ pos: { x: centerX - fieldWidth * 0.15, y: centerY }, radius: bumperRadius, hitTimer: 0 })
  bumpers.push({ pos: { x: centerX + fieldWidth * 0.15, y: centerY }, radius: bumperRadius, hitTimer: 0 })

  // Bottom row
  bumpers.push({ pos: { x: centerX - fieldWidth * 0.25, y: field.bottom - fieldHeight * 0.25 }, radius: bumperRadius, hitTimer: 0 })
  bumpers.push({ pos: { x: centerX + fieldWidth * 0.25, y: field.bottom - fieldHeight * 0.25 }, radius: bumperRadius, hitTimer: 0 })

  // Side bumpers near goals
  bumpers.push({ pos: { x: field.left + fieldWidth * 0.15, y: field.top + fieldHeight * 0.35 }, radius: bumperRadius, hitTimer: 0 })
  bumpers.push({ pos: { x: field.left + fieldWidth * 0.15, y: field.bottom - fieldHeight * 0.35 }, radius: bumperRadius, hitTimer: 0 })
  bumpers.push({ pos: { x: field.right - fieldWidth * 0.15, y: field.top + fieldHeight * 0.35 }, radius: bumperRadius, hitTimer: 0 })
  bumpers.push({ pos: { x: field.right - fieldWidth * 0.15, y: field.bottom - fieldHeight * 0.35 }, radius: bumperRadius, hitTimer: 0 })

  // Goals - circles with gravity (ball radius is 30, so 60+ allows full containment)
  const goalRadius = 60
  const goalGravityRadius = 200
  const goalOffset = 100 // Offset from field edge

  const goals: Goal[] = [
    { pos: { x: field.left + goalOffset, y: centerY }, radius: goalRadius, gravityRadius: goalGravityRadius, side: 'left' },
    { pos: { x: field.right - goalOffset, y: centerY }, radius: goalRadius, gravityRadius: goalGravityRadius, side: 'right' },
  ]

  return { field, bumpers, goals }
}

export interface PhysicsWorld {
  field: typeof FIELD
  vehicle1: Vehicle
  vehicle2: Vehicle
  ball: Ball
  bumpers: Bumper[]
  goals: Goal[]
}
export interface PhysicsSounds { bump(): void; kick(vehicle: Vehicle): void; wallBounce(): void }
const SILENT: PhysicsSounds = { bump() {}, kick() {}, wallBounce() {} }
/** Shared by the live match and deterministic opponent trials. Mutates bodies in place. */
export function stepPhysics(world: PhysicsWorld, dt: number, sounds: PhysicsSounds = SILENT): Goal | undefined {
  // A burst and an oncoming ball can cross between frames. Keep their relative
  // travel below a collision radius, preserving the original per-frame drag.
  const carSpeed = Math.max(Math.hypot(world.vehicle1.vel.x, world.vehicle1.vel.y), Math.hypot(world.vehicle2.vel.x, world.vehicle2.vel.y))
  const ballSpeed = Math.hypot(world.ball.vel.x, world.ball.vel.y)
  const steps = Math.max(1, Math.ceil(Math.max(carSpeed * 2, carSpeed + ballSpeed) * dt / 20))
  for (let i = 0; i < steps; i++) {
    const goal = advancePhysics(world, dt / steps, sounds, 1 / steps)
    if (goal) return goal
  }
}

function advancePhysics(world: PhysicsWorld, dt: number, sounds: PhysicsSounds, frameFraction: number): Goal | undefined {
  const { field, vehicle1, vehicle2, ball, bumpers, goals } = world
  // Vehicle physics helper function
  const vRadius = 15
  const updateVehiclePhysics = (vehicle: Vehicle) => {
    // Drift physics
    const speed = Math.hypot(vehicle.vel.x, vehicle.vel.y)
    const frameGrip = Math.max(0.02, 0.08 - speed * 0.0003)
    const gripFactor = frameFraction === 1 ? frameGrip : 1 - Math.pow(1 - frameGrip, frameFraction)
    const facingX = Math.cos(vehicle.angle)
    const facingY = Math.sin(vehicle.angle)
    const dot = vehicle.vel.x * facingX + vehicle.vel.y * facingY
    vehicle.vel.x += (facingX * dot - vehicle.vel.x) * gripFactor
    vehicle.vel.y += (facingY * dot - vehicle.vel.y) * gripFactor

    // Friction
    const friction = Math.pow(0.97, frameFraction)
    vehicle.vel.x *= friction
    vehicle.vel.y *= friction

    // Animate wheels
    vehicle.wheelAngle += speed * dt * 0.3

    // Move vehicle
    vehicle.pos.x += vehicle.vel.x * dt
    vehicle.pos.y += vehicle.vel.y * dt

    // Wall collision
    if (vehicle.pos.x < field.left + vRadius) {
      vehicle.pos.x = field.left + vRadius
      vehicle.vel.x *= -0.5
    }
    if (vehicle.pos.x > field.right - vRadius) {
      vehicle.pos.x = field.right - vRadius
      vehicle.vel.x *= -0.5
    }
    if (vehicle.pos.y < field.top + vRadius) {
      vehicle.pos.y = field.top + vRadius
      vehicle.vel.y *= -0.5
    }
    if (vehicle.pos.y > field.bottom - vRadius) {
      vehicle.pos.y = field.bottom - vRadius
      vehicle.vel.y *= -0.5
    }

    // Bumper collision
    for (const bumper of bumpers) {
      const dx = vehicle.pos.x - bumper.pos.x
      const dy = vehicle.pos.y - bumper.pos.y
      const dist = Math.hypot(dx, dy)
      const minDist = vRadius + bumper.radius
      if (dist < minDist && dist > 0) {
        const nx = dx / dist
        const ny = dy / dist
        const push = minDist - dist
        vehicle.pos.x += nx * push
        vehicle.pos.y += ny * push
        const dotV = vehicle.vel.x * nx + vehicle.vel.y * ny
        vehicle.vel.x -= 2.2 * dotV * nx
        vehicle.vel.y -= 2.2 * dotV * ny
        const boostSpeed = 120
        vehicle.vel.x += nx * boostSpeed
        vehicle.vel.y += ny * boostSpeed
        bumper.hitTimer = 200
        sounds.bump()
      }
    }
}

// Update both vehicles
updateVehiclePhysics(vehicle1)
updateVehiclePhysics(vehicle2)

// Vehicle-Vehicle collision
const v1v2Dx = vehicle2.pos.x - vehicle1.pos.x
const v1v2Dy = vehicle2.pos.y - vehicle1.pos.y
const v1v2Dist = Math.hypot(v1v2Dx, v1v2Dy)
const v1v2MinDist = vRadius * 2
if (v1v2Dist < v1v2MinDist && v1v2Dist > 0) {
  const nx = v1v2Dx / v1v2Dist
  const ny = v1v2Dy / v1v2Dist
  const push = (v1v2MinDist - v1v2Dist) / 2
  vehicle1.pos.x -= nx * push
  vehicle1.pos.y -= ny * push
  vehicle2.pos.x += nx * push
  vehicle2.pos.y += ny * push

  // Exchange momentum
  const relVelX = vehicle1.vel.x - vehicle2.vel.x
  const relVelY = vehicle1.vel.y - vehicle2.vel.y
  const relVelDot = relVelX * nx + relVelY * ny
  if (relVelDot > 0) {
    vehicle1.vel.x -= relVelDot * nx * 0.8
    vehicle1.vel.y -= relVelDot * ny * 0.8
    vehicle2.vel.x += relVelDot * nx * 0.8
    vehicle2.vel.y += relVelDot * ny * 0.8
    sounds.bump()
  }
}

// Ball physics
const prevBallPos = { x: ball.pos.x, y: ball.pos.y }
const ballFriction = Math.pow(0.995, frameFraction) // Very low friction on ball
ball.vel.x *= ballFriction
ball.vel.y *= ballFriction
ball.pos.x += ball.vel.x * dt
ball.pos.y += ball.vel.y * dt

// Ball collision with walls
// Goal gravity effect on ball
for (const goal of goals) {
  const dx = goal.pos.x - ball.pos.x
  const dy = goal.pos.y - ball.pos.y
  const dist = Math.hypot(dx, dy)

  // Continuous scoring check to avoid tunneling at high speeds.
  // If the ball center crosses into the inner goal circle at any point during this frame,
  // treat it as a score (equivalent to "fully inside" at some moment).
  const innerRadius = goal.radius - ball.radius
  const segDist = innerRadius > 0
    ? segmentDistanceToPoint(prevBallPos.x, prevBallPos.y, ball.pos.x, ball.pos.y, goal.pos.x, goal.pos.y)
    : Number.POSITIVE_INFINITY
  const enteredGoalThisFrame = segDist < innerRadius

  // Check if ball is FULLY inside goal (ball edge must be within goal circle)
  if (enteredGoalThisFrame || (dist + ball.radius < goal.radius)) {
    return goal
  }
  // Apply gravity when ball is within gravity radius
  if (dist < goal.gravityRadius && dist > 0) {
    const gravityStrength = 400 * (1 - dist / goal.gravityRadius) // Stronger as it gets closer
    const nx = dx / dist
    const ny = dy / dist
    ball.vel.x += nx * gravityStrength * dt
    ball.vel.y += ny * gravityStrength * dt
  }
}

// Ball collision with walls (no more goal openings in walls)
if (ball.pos.x < field.left + ball.radius) {
  ball.pos.x = field.left + ball.radius
  ball.vel.x *= -0.8
  sounds.wallBounce()
}
if (ball.pos.x > field.right - ball.radius) {
  ball.pos.x = field.right - ball.radius
  ball.vel.x *= -0.8
  sounds.wallBounce()
}
if (ball.pos.y < field.top + ball.radius) {
  ball.pos.y = field.top + ball.radius
  ball.vel.y *= -0.8
  sounds.wallBounce()
}
if (ball.pos.y > field.bottom - ball.radius) {
  ball.pos.y = field.bottom - ball.radius
  ball.vel.y *= -0.8
  sounds.wallBounce()
}

// Ball collision with bumpers
for (const bumper of bumpers) {
  // Decay hit timer
  if (bumper.hitTimer > 0) {
    bumper.hitTimer -= dt * 1000
  }

  const dx = ball.pos.x - bumper.pos.x
  const dy = ball.pos.y - bumper.pos.y
  const dist = Math.hypot(dx, dy)
  const minDist = ball.radius + bumper.radius
  if (dist < minDist && dist > 0) {
    const nx = dx / dist
    const ny = dy / dist
    const push = minDist - dist
    ball.pos.x += nx * push
    ball.pos.y += ny * push
    // Bounce with energy boost (like pinball)
    const dot = ball.vel.x * nx + ball.vel.y * ny
    ball.vel.x -= 2.5 * dot * nx
    ball.vel.y -= 2.5 * dot * ny
    // Add acceleration boost in bounce direction
    const boostSpeed = 150
    ball.vel.x += nx * boostSpeed
    ball.vel.y += ny * boostSpeed
    // Trigger animation
    bumper.hitTimer = 200
    sounds.bump()
  }
}

// Vehicle-Ball collision helper (vRadius defined above)
const handleVehicleBallCollision = (vehicle: Vehicle) => {
  const bvDx = ball.pos.x - vehicle.pos.x
  const bvDy = ball.pos.y - vehicle.pos.y
  const bvDist = Math.hypot(bvDx, bvDy)
  const bvMinDist = ball.radius + vRadius
  if (bvDist < bvMinDist && bvDist > 0) {
    const nx = bvDx / bvDist
    const ny = bvDy / bvDist
    const push = bvMinDist - bvDist
    ball.pos.x += nx * push
    ball.pos.y += ny * push

    const relVelX = vehicle.vel.x - ball.vel.x
    const relVelY = vehicle.vel.y - ball.vel.y
    const relVelDot = relVelX * nx + relVelY * ny

    if (relVelDot > 0) {
      const kickPower = 1.8
      ball.vel.x += relVelDot * nx * kickPower
      ball.vel.y += relVelDot * ny * kickPower
      vehicle.vel.x -= relVelDot * nx * 0.3
      vehicle.vel.y -= relVelDot * ny * 0.3
        sounds.kick(vehicle)
    }
  }
}

handleVehicleBallCollision(vehicle1)
handleVehicleBallCollision(vehicle2)

// Limit ball speed
const ballSpeed = Math.hypot(ball.vel.x, ball.vel.y)
const maxBallSpeed = 600
if (ballSpeed > maxBallSpeed) {
  ball.vel.x = (ball.vel.x / ballSpeed) * maxBallSpeed
  ball.vel.y = (ball.vel.y / ballSpeed) * maxBallSpeed
}

}
