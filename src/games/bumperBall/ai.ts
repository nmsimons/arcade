import { crossedGoal, resolveFieldBoundary, segmentDistanceToPoint } from './physics.ts'
import type { PhysicsWorld, Vehicle, Goal, Bumper, Vector2 } from './physics'
import { boostLaneClear, createBoost, startBoost, updateBoost } from './boost.ts'
import type { BoostState } from './boost'

type AiOffenseState = 'orbit' | 'setup' | 'strike'

export type AiMemory = {
  offenseState: AiOffenseState
  orbitSideSign: 1 | -1
  commitMs: number
  stuckMs: number
  lastPos: Vector2
  lastDistToBall: number
  heldDir: Vector2
  heldDirMs: number
  boost: BoostState
  boostRequested: boolean
}

export const createAiMemory = (): AiMemory => ({
  offenseState: 'orbit', orbitSideSign: 1, commitMs: 0, stuckMs: 0,
  lastPos: { x: 0, y: 0 }, lastDistToBall: Number.POSITIVE_INFINITY,
  heldDir: { x: 1, y: 0 }, heldDirMs: 0,
  boost: createBoost(), boostRequested: false,
})

/** Chooses and executes the computer's controls using only the current world. */
export function driveComputer(world: PhysicsWorld, memory: AiMemory, dt: number): boolean {
  const { field, vehicle1, vehicle2, ball, bumpers, goals } = world
  // Red computer opponent driving.
  const accel = 350
  let isAccelerating = false
  memory.boostRequested = false

  const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))
  const normalizeAngle = (a: number) => {
    let angle = a
    while (angle > Math.PI) angle -= Math.PI * 2
    while (angle < -Math.PI) angle += Math.PI * 2
    return angle
  }

  const rotate = (v: Vector2, angle: number): Vector2 => {
    const c = Math.cos(angle)
    const s = Math.sin(angle)
    return { x: v.x * c - v.y * s, y: v.x * s + v.y * c }
  }

  const normalize = (v: Vector2): Vector2 => {
    const d = Math.hypot(v.x, v.y)
    if (d <= 0.0001) return { x: 1, y: 0 }
    return { x: v.x / d, y: v.y / d }
  }

  // Anticipate rebounds rather than chasing a point beyond a wall or bumper.
  const predictBallState = (seconds: number) => {
    const pos = { ...ball.pos }, vel = { ...ball.vel }
    const steps = Math.max(1, Math.ceil(seconds * 60)), step = seconds / steps
    for (let i = 0; i < steps; i++) {
      const friction = Math.pow(0.995, step * 60)
      vel.x *= friction; vel.y *= friction
      const previous = { ...pos }
      pos.x += vel.x * step; pos.y += vel.y * step
      resolveFieldBoundary({ pos, vel }, ball.radius, goals)
      if (goals.some(goal => crossedGoal(goal, previous, pos, ball.radius))) return { pos, vel }
      for (const bumper of bumpers) {
        const dx = pos.x - bumper.pos.x, dy = pos.y - bumper.pos.y, distance = Math.hypot(dx, dy)
        const clearance = bumper.radius + ball.radius
        if (distance > 0 && distance < clearance) {
          const nx = dx / distance, ny = dy / distance, dot = vel.x * nx + vel.y * ny
          pos.x += nx * (clearance - distance); pos.y += ny * (clearance - distance)
          vel.x += nx * (150 - 2.5 * dot); vel.y += ny * (150 - 2.5 * dot)
        }
      }
      const speed = Math.hypot(vel.x, vel.y)
      if (speed > 600) { vel.x *= 600 / speed; vel.y *= 600 / speed }
    }
    return { pos, vel }
  }

  const chooseDesiredDir = (
    ballPos: Vector2,
    baseDir: Vector2,
    scoringTarget: Vector2,
    attackGoal: Goal | undefined,
    avoidGoal: Goal | undefined,
    ballVelocity: Vector2,
  ) => {
    // Sample candidate directions around baseDir and pick the one that
    // best converts into a goal (when attacking) while still avoiding hazards.
    //
    // Roll shots through the actual posts and goal lines, including rebounds.
    const base = normalize(baseDir)
    const sampleAngles = [-1.1, -0.85, -0.6, -0.4, -0.25, -0.12, 0, 0.12, 0.25, 0.4, 0.6, 0.85, 1.1]
    const horizon = 420
    const ballClear = ball.radius + 14
    const ballRadius = ball.radius

    const rolloutScore = (dir: Vector2) => {
      if (!attackGoal) return 0
      // Approximate a normal-speed contact using the collision's relative
      // velocity and restitution, including predicted rebound momentum.
      const impulse = Math.max(0, 180 - ballVelocity.x * dir.x - ballVelocity.y * dir.y) * 1.8
      const simulated = {
        pos: { ...ballPos },
        vel: { x: ballVelocity.x + dir.x * impulse, y: ballVelocity.y + dir.y * impulse },
      }
      const { pos, vel } = simulated
      const speed = Math.hypot(vel.x, vel.y)
      if (speed > 520) { vel.x *= 520 / speed; vel.y *= 520 / speed }
      let bestDistance = Number.POSITIVE_INFINITY
      const dtSim = 1 / 30
      for (let i = 0; i < 45; i++) {
        const previous = { ...pos }
        const friction = Math.pow(0.995, dtSim * 60)
        vel.x *= friction; vel.y *= friction
        pos.x += vel.x * dtSim; pos.y += vel.y * dtSim
        resolveFieldBoundary(simulated, ballRadius, goals)
        if (crossedGoal(attackGoal, previous, pos, ballRadius)) return -20000 + i * 180
        if (avoidGoal && crossedGoal(avoidGoal, previous, pos, ballRadius)) return 20000
        bestDistance = Math.min(bestDistance, Math.hypot(attackGoal.pos.x - pos.x, attackGoal.pos.y - pos.y))
        for (const bumper of bumpers) {
          const dx = pos.x - bumper.pos.x, dy = pos.y - bumper.pos.y, distance = Math.hypot(dx, dy)
          const clearance = bumper.radius + ballRadius
          if (distance <= 0 || distance >= clearance) continue
          const nx = dx / distance, ny = dy / distance, dot = vel.x * nx + vel.y * ny
          pos.x += nx * (clearance - distance); pos.y += ny * (clearance - distance)
          vel.x += nx * (150 - 2.5 * dot); vel.y += ny * (150 - 2.5 * dot)
        }
        const speed = Math.hypot(vel.x, vel.y)
        if (speed > 600) { vel.x *= 600 / speed; vel.y *= 600 / speed }
      }
      return bestDistance
    }
    let bestDir = base
    let bestScore = Number.POSITIVE_INFINITY

    for (const a of sampleAngles) {
      const dir = normalize(rotate(base, a))
      const endX = ballPos.x + dir.x * horizon
      const endY = ballPos.y + dir.y * horizon

      // Primary objective: progress toward scoringTarget (goal center for attack, center-ish for defense).
      const distToTarget = Math.hypot(scoringTarget.x - endX, scoringTarget.y - endY)
      let score = distToTarget

      // Reward shots that actually cross the goal line.
      score += rolloutScore(dir)

      // Penalize paths that would clip bumpers.
      for (const bumper of bumpers) {
        const d = segmentDistanceToPoint(ballPos.x, ballPos.y, endX, endY, bumper.pos.x, bumper.pos.y)
        const minSafe = bumper.radius + ballClear
        if (d < minSafe) {
          score += (minSafe - d) * 30
        }
      }

      // An opposing car is solid too: do not plan an otherwise open shot
      // straight through it, especially when challenging a stationary ball.
      const opponentClearance = segmentDistanceToPoint(ballPos.x, ballPos.y, endX, endY, vehicle2.pos.x, vehicle2.pos.y)
      score += Math.max(0, ballRadius + 24 - opponentClearance) * 35

      // Prefer clearances away from our goal mouth.
      if (avoidGoal) {
        const d0 = segmentDistanceToPoint(ballPos.x, ballPos.y, endX, endY, avoidGoal.pos.x, avoidGoal.pos.y)
        if (d0 < 220) {
          score += (220 - d0) * 18
        }
        if (crossedGoal(avoidGoal, ballPos, { x: endX, y: endY }, ballRadius)) {
          score += 20000
        }
      }

      // Penalize hugging walls (makes the ball easy to pin and hard to re-angle).
      const wallPad = ballRadius + 55
      const distLeft = endX - field.left
      const distRight = field.right - endX
      const distTop = endY - field.top
      const distBottom = field.bottom - endY
      const wallMin = Math.min(distLeft, distRight, distTop, distBottom)
      const aimedIntoGoal = attackGoal && crossedGoal(attackGoal, ballPos, { x: endX, y: endY }, ballRadius)
      if (wallMin < wallPad && !aimedIntoGoal) {
        score += (wallPad - wallMin) * 8
      }

      // Mild penalty for aiming away from the base direction (keeps intent consistent).
      const alignment = dir.x * base.x + dir.y * base.y
      score += (1 - alignment) * 80

      if (score < bestScore) {
        bestScore = score
        bestDir = dir
      }
    }

    return bestDir
  }

  const applyAvoidanceToTarget = (
    vehicle: Vehicle,
    opponent: Vehicle,
    target: Vector2,
    mode: 'none' | 'hard' | 'soft',
  ) => {
    if (mode === 'none') return target
    // Solid walls are avoided; the goal mouths remain traversable.
    const vehicleRadiusForAvoid = 20
    let steerAwayX = 0
    let steerAwayY = 0

    // During travel, apply hard avoidance when dangerously close.
    const hardOnly = mode === 'hard'
    const doSoft = mode === 'soft'

    for (const bumper of bumpers) {
      const toBumperX = bumper.pos.x - vehicle.pos.x
      const toBumperY = bumper.pos.y - vehicle.pos.y
      const distToBumper = Math.hypot(toBumperX, toBumperY)
      if (distToBumper <= 0) continue

      const hardDist = bumper.radius + vehicleRadiusForAvoid + 26
      if (distToBumper < hardDist) {
        const strength = (hardDist - distToBumper) / hardDist
        steerAwayX -= (toBumperX / distToBumper) * strength * 380
        steerAwayY -= (toBumperY / distToBumper) * strength * 380
        continue
      }

      if (!hardOnly && doSoft) {
        const avoidDist = bumper.radius + vehicleRadiusForAvoid + 120
        if (distToBumper < avoidDist) {
          const strength = (avoidDist - distToBumper) / avoidDist
          steerAwayX -= (toBumperX / distToBumper) * strength * 200
          steerAwayY -= (toBumperY / distToBumper) * strength * 200
        }
      }
    }

    // Opponent avoidance (soft/hard). Hard is only when very close.
    const toOpponentX = opponent.pos.x - vehicle.pos.x
    const toOpponentY = opponent.pos.y - vehicle.pos.y
    const distToOpponent = Math.hypot(toOpponentX, toOpponentY)
    if (distToOpponent > 0) {
      const hardDist = 52
      if (distToOpponent < hardDist) {
        const strength = (hardDist - distToOpponent) / hardDist
        steerAwayX -= (toOpponentX / distToOpponent) * strength * 260
        steerAwayY -= (toOpponentY / distToOpponent) * strength * 260
      } else if (!hardOnly && doSoft) {
        const avoidDist = 90
        if (distToOpponent < avoidDist) {
          const strength = (avoidDist - distToOpponent) / avoidDist
          steerAwayX -= (toOpponentX / distToOpponent) * strength * 120
          steerAwayY -= (toOpponentY / distToOpponent) * strength * 120
        }
      }
    }

    const wallMargin = 60
    const openAt = (side: Goal['side']) => goals.some(goal => goal.side === side
      && Math.abs(vehicle.pos.y - goal.pos.y) < goal.height / 2 - goal.postRadius - 25)
    if (vehicle.pos.x < field.left + wallMargin && !openAt('left')) {
      steerAwayX += (wallMargin - (vehicle.pos.x - field.left)) * 1.5
    }
    if (vehicle.pos.x > field.right - wallMargin && !openAt('right')) {
      steerAwayX -= (wallMargin - (field.right - vehicle.pos.x)) * 1.5
    }
    if (vehicle.pos.y < field.top + wallMargin) {
      steerAwayY += (wallMargin - (vehicle.pos.y - field.top)) * 1.5
    }
    if (vehicle.pos.y > field.bottom - wallMargin) {
      steerAwayY -= (wallMargin - (field.bottom - vehicle.pos.y)) * 1.5
    }

    return { x: target.x + steerAwayX, y: target.y + steerAwayY }
  }

  const applyAiDriving = (
    vehicle: Vehicle,
    moveTarget: Vector2,
    aimTarget: Vector2,
    accelMult: number,
    allowReverse: boolean,
    allowDetour: boolean,
    detourSideSign: 1 | -1,
    striking: boolean,
  ) => {
    const planDetourAroundBumpers = (from: Vector2, to: Vector2, preferSideSign: 1 | -1) => {
      const dx = to.x - from.x
      const dy = to.y - from.y
      const dist = Math.hypot(dx, dy)
      if (dist < 120) return to

      const dirX = dx / dist
      const dirY = dy / dist
      const perpX = -dirY
      const perpY = dirX

      // Route around the ball as well when getting to its other side;
      // an orbit waypoint must not accidentally kick it on the way past.
      let bestBumper: Bumper | null = null
      let bestPenetration = 0
      const obstacles = memory.offenseState === 'orbit'
        ? [...bumpers, { pos: ball.pos, radius: ball.radius, hitTimer: 0 }]
        : bumpers
      for (const bumper of obstacles) {
        const d = segmentDistanceToPoint(from.x, from.y, to.x, to.y, bumper.pos.x, bumper.pos.y)
        const expanded = bumper.radius + 42 // approx vehicle radius + safety
        const penetration = expanded - d
        if (penetration > bestPenetration) {
          bestPenetration = penetration
          bestBumper = bumper
        }
      }
      if (!bestBumper) return to

      // Choose detour side: prefer stable orbit side, but also avoid detouring *into* the bumper.
      const bx = bestBumper.pos.x - from.x
      const by = bestBumper.pos.y - from.y
      const cross = dirX * by - dirY * bx
      const sideFromGeometry: 1 | -1 = cross > 0 ? -1 : 1
      const side: 1 | -1 = (Math.abs(cross) > 25 ? sideFromGeometry : preferSideSign)

      const detourDist = bestBumper.radius + 105
      const waypoint = {
        x: bestBumper.pos.x + perpX * detourDist * side,
        y: bestBumper.pos.y + perpY * detourDist * side,
      }

      // Keep the waypoint on the field.
      const pad = 30
      return {
        x: clamp(waypoint.x, field.left + pad, field.right - pad),
        y: clamp(waypoint.y, field.top + pad, field.bottom - pad),
      }
    }

    // Route the move target around bumpers to prevent "slow ramming".
    const plannedMoveTarget = allowDetour
      ? planDetourAroundBumpers(vehicle.pos, moveTarget, detourSideSign)
      : moveTarget
    const isDetouring = allowDetour && (Math.hypot(plannedMoveTarget.x - moveTarget.x, plannedMoveTarget.y - moveTarget.y) > 1.5)

    const moveDx = plannedMoveTarget.x - vehicle.pos.x
    const moveDy = plannedMoveTarget.y - vehicle.pos.y
    const distToMoveTarget = Math.hypot(moveDx, moveDy)

    // Reach the approach point before lining up the shot. Steering through
    // the ball too early ignores both the contact point and bumper detours.
    const plannedAimTarget = striking ? aimTarget : isDetouring || distToMoveTarget > 35 ? plannedMoveTarget : aimTarget

    // Counter the current drift instead of steering as though we were stopped.
    const aimDx = plannedAimTarget.x - vehicle.pos.x - vehicle.vel.x * (striking ? 0.1 : 0.3)
    const aimDy = plannedAimTarget.y - vehicle.pos.y - vehicle.vel.y * (striking ? 0.1 : 0.3)
    const distToAimTarget = Math.hypot(aimDx, aimDy)

    // If we're already at the aim target (or very close), don't force angle to atan2(0,0)=0.
    const targetAngle = distToAimTarget > 0.5 ? Math.atan2(aimDy, aimDx) : vehicle.angle
    const angleDiff = normalizeAngle(targetAngle - vehicle.angle)

    // Use the same maximum turn rate as the player.
    const turn = clamp(angleDiff * 5, -4, 4)
    vehicle.angle += turn * dt

    // Slow for arrival, but keep up with a moving setup point. Treating it
    // like a parked target leaves the car following forever at a fixed gap.
    const targetSpeed = memory.offenseState === 'setup'
      ? Math.max(0, ball.vel.x * Math.cos(vehicle.angle) + ball.vel.y * Math.sin(vehicle.angle))
      : 0
    const closeSlowdown = Math.min(1, distToMoveTarget / 120 + targetSpeed / 180)
    const facingOk = Math.abs(angleDiff) < Math.PI / 2

    // Additional speed limiting near bumpers (prevents ramming them),
    // but avoid globally slowing the AI down. Only slow when a bumper is
    // close AND roughly in front of the car, and never while detouring.
    let bumperSpeedMult = 1.0
    if (!isDetouring) {
      let nearestBumper: Bumper | null = null
      let nearestBumperDist = Number.POSITIVE_INFINITY
      for (const bumper of bumpers) {
        const d = Math.hypot(bumper.pos.x - vehicle.pos.x, bumper.pos.y - vehicle.pos.y) - bumper.radius
        if (d < nearestBumperDist) {
          nearestBumperDist = d
          nearestBumper = bumper
        }
      }

      if (nearestBumper && nearestBumperDist < 70) {
        const toBx = nearestBumper.pos.x - vehicle.pos.x
        const toBy = nearestBumper.pos.y - vehicle.pos.y
        const toBd = Math.hypot(toBx, toBy)
        if (toBd > 0.001) {
          const hx = Math.cos(vehicle.angle)
          const hy = Math.sin(vehicle.angle)
          const dotAhead = (hx * (toBx / toBd)) + (hy * (toBy / toBd))
          // Only slow if the bumper is actually in front.
          if (dotAhead > 0.35) {
            const t = clamp(nearestBumperDist / 70, 0.55, 1.0)
            bumperSpeedMult = t
          }
        }
      }
    }

    if (facingOk) {
      const effectiveAccel = Math.min(1, accelMult * closeSlowdown * bumperSpeedMult)
      if (effectiveAccel > 0.001) {
        vehicle.vel.x += Math.cos(vehicle.angle) * accel * effectiveAccel * dt
        vehicle.vel.y += Math.sin(vehicle.angle) * accel * effectiveAccel * dt
        isAccelerating = true
      }
    } else if (allowReverse && distToMoveTarget > 110) {
      vehicle.vel.x -= Math.cos(vehicle.angle) * accel * 0.35 * dt
      vehicle.vel.y -= Math.sin(vehicle.angle) * accel * 0.35 * dt
    }
  }

  const runKickballAi = (opts: {
    vehicle: Vehicle
    opponent: Vehicle
    memory: AiMemory
    attackGoal: Goal
    defendGoal: Goal
  }) => {
    const { vehicle, opponent, memory: mem, attackGoal, defendGoal } = opts

    // Countdown "held direction" timer (used to prevent dead-ball dithering).
    if (mem.heldDirMs > 0) mem.heldDirMs = Math.max(0, mem.heldDirMs - dt * 1000)

    const carToBallX = ball.pos.x - vehicle.pos.x
    const carToBallY = ball.pos.y - vehicle.pos.y
    const carToBallDist = Math.hypot(carToBallX, carToBallY)

    // Decide whether we are in a "danger" situation and should clear defensively.
    const ballToDefGoalX = ball.pos.x - defendGoal.pos.x
    const ballToDefGoalY = ball.pos.y - defendGoal.pos.y
    const ballToDefGoalDist = Math.hypot(ballToDefGoalX, ballToDefGoalY)
    const ballSpeed = Math.hypot(ball.vel.x, ball.vel.y)
    const ballIsStill = ballSpeed < 28

    const isOnOwnSide = defendGoal.side === 'left' ? ball.pos.x < (field.left + field.right) / 2 : ball.pos.x > (field.left + field.right) / 2
    const movingTowardOwnGoal = defendGoal.side === 'left' ? ball.vel.x < -40 : ball.vel.x > 40
    const inDanger = ballToDefGoalDist < 260 || (isOnOwnSide && movingTowardOwnGoal && ballSpeed > 80)

    // Emergency clear: ball is moving toward our goal and likely to enter soon.
    // In this mode, the defender should aggressively hit the ball away.
    const tThreat = 0.45
    const threatEnd = { x: ball.pos.x + ball.vel.x * tThreat, y: ball.pos.y + ball.vel.y * tThreat }
    const toDefX = defendGoal.pos.x - ball.pos.x
    const toDefY = defendGoal.pos.y - ball.pos.y
    const toDefD = Math.hypot(toDefX, toDefY)
    const towardDef = toDefD > 0.001 ? ((ball.vel.x * (toDefX / toDefD) + ball.vel.y * (toDefY / toDefD)) > 55) : false
    const emergencyClear = crossedGoal(defendGoal, ball.pos, threatEnd, ball.radius) || (towardDef && ballToDefGoalDist < 260)

    // Lead by the time until contact, not a fixed delay that aims beyond an
    // incoming ball even when it is already touching the car.
    const closingSpeed = Math.max(100, Math.hypot(vehicle.vel.x, vehicle.vel.y)
      - (ball.vel.x * carToBallX + ball.vel.y * carToBallY) / Math.max(1, carToBallDist))
    const tLead = clamp((carToBallDist - ball.radius - 15) / closingSpeed, 0, 0.7)

    const predictedBall = predictBallState(ballSpeed < 1 ? 0 : tLead)
    const ballPred = predictedBall.pos

    // Choose a strategic push direction.
    // Aim into the net, not at the goal line: the entire ball must cross it.
    // This matters especially for steep shots from the end-wall corners.
    const attackTarget = {
      x: attackGoal.pos.x + (attackGoal.side === 'right' ? 1 : -1) * (ball.radius + 1),
      y: attackGoal.pos.y,
    }
    const attackBase = { x: attackTarget.x - ballPred.x, y: attackTarget.y - ballPred.y }
    const defendClearTarget = {
      x: (field.left + field.right) / 2 + (defendGoal.side === 'left' ? 120 : -120),
      y: (field.top + field.bottom) / 2,
    }

    // Defensive block point: get between ball and our goal to stop easy pushes.
    const toBallFromDefX = ballPred.x - defendGoal.pos.x
    const toBallFromDefY = ballPred.y - defendGoal.pos.y
    const toBallFromDefD = Math.hypot(toBallFromDefX, toBallFromDefY)
    const goalieDist = 180
    const goaliePoint = toBallFromDefD > 0.001
      ? { x: defendGoal.pos.x + (toBallFromDefX / toBallFromDefD) * goalieDist, y: defendGoal.pos.y + (toBallFromDefY / toBallFromDefD) * goalieDist }
      : { x: defendGoal.pos.x + (defendGoal.side === 'left' ? 1 : -1) * goalieDist, y: defendGoal.pos.y }
    const defendBase = { x: defendClearTarget.x - ballPred.x, y: defendClearTarget.y - ballPred.y }

    const base = inDanger ? defendBase : attackBase
    const goalPosForScoring = inDanger ? defendClearTarget : attackTarget
    let desiredDir = chooseDesiredDir(
      ballPred,
      base,
      goalPosForScoring,
      inDanger ? undefined : attackGoal,
      defendGoal,
      predictedBall.vel,
    )

    // When the ball is basically stopped, hold the chosen direction briefly.
    // This keeps contact points stable and stops micro-oscillation.
    if (!inDanger && !emergencyClear && ballIsStill) {
      if (mem.heldDirMs > 0) {
        desiredDir = mem.heldDir
      } else {
        mem.heldDir = desiredDir
        mem.heldDirMs = 380
      }
    } else {
      mem.heldDirMs = 0
    }

    // Where the car can actually be (center point constraints)
    const vehicleRadiusForContact = 15
    const boundsPad = 2
    const minX = field.left + vehicleRadiusForContact + boundsPad
    const maxX = field.right - vehicleRadiusForContact - boundsPad
    const minY = field.top + vehicleRadiusForContact + boundsPad
    const maxY = field.bottom - vehicleRadiusForContact - boundsPad
    const isInBounds = (p: Vector2) => p.x >= minX && p.x <= maxX && p.y >= minY && p.y <= maxY
    const clampToBounds = (p: Vector2): Vector2 => ({ x: clamp(p.x, minX, maxX), y: clamp(p.y, minY, maxY) })

    // Contact point: where the car should be so it pushes ball along desiredDir
    const contactOffset = ball.radius + vehicleRadiusForContact + 35
    let contactPoint = {
      x: ballPred.x - desiredDir.x * contactOffset,
      y: ballPred.y - desiredDir.y * contactOffset,
    }

    // Cars are smaller than the ball. Skim its outside edge to peel it off
    // the rail rather than repeatedly driving it into a wall and pinning it.
    if (!isInBounds(contactPoint)) {
      contactPoint = clampToBounds(contactPoint)
      desiredDir = normalize({ x: ballPred.x - contactPoint.x, y: ballPred.y - contactPoint.y })
    }

    // Always clamp the computed targets so we don't "orbit" to impossible points near walls.
    contactPoint = clampToBounds(contactPoint)

    const toCarX = vehicle.pos.x - ballPred.x
    const toCarY = vehicle.pos.y - ballPred.y
    const behindMetric = toCarX * desiredDir.x + toCarY * desiredDir.y
    // Increase margin slightly when the ball is still to avoid state jitter near the ball.
    const behindEnough = behindMetric < (ballIsStill ? -28 : -18)
    const wrongSide = behindMetric > (ballIsStill ? 28 : 18)

    const perp = { x: -desiredDir.y, y: desiredDir.x }
    const cross = toCarX * desiredDir.y - toCarY * desiredDir.x
    // Reduce orbit-side jitter near walls / close geometry
    if (Math.abs(cross) > 35) {
      mem.orbitSideSign = cross > 0 ? -1 : 1
    }

    // State machine: orbit -> setup -> strike
    const facing = { x: Math.cos(vehicle.angle), y: Math.sin(vehicle.angle) }
    const headingAlign = facing.x * desiredDir.x + facing.y * desiredDir.y
    const distToContact = Math.hypot(contactPoint.x - vehicle.pos.x, contactPoint.y - vehicle.pos.y)
    const distToBallPred = Math.hypot(ballPred.x - vehicle.pos.x, ballPred.y - vehicle.pos.y)
    const contactDir = normalize({ x: ballPred.x - vehicle.pos.x, y: ballPred.y - vehicle.pos.y })
    const shotEnd = { x: ballPred.x + contactDir.x * 1800, y: ballPred.y + contactDir.y * 1800 }
    // A clear lane anywhere between the posts is already a valid finish. Do
    // not brake and circle just to make a center-of-goal contact more perfect.
    const openShot = !inDanger && carToBallDist < 300
      && facing.x * contactDir.x + facing.y * contactDir.y > .98
      && crossedGoal(attackGoal, ballPred, shotEnd, ball.radius)
      && bumpers.every(bumper => segmentDistanceToPoint(ballPred.x, ballPred.y, shotEnd.x, shotEnd.y, bumper.pos.x, bumper.pos.y) > ball.radius + bumper.radius + 5)
      && segmentDistanceToPoint(ballPred.x, ballPred.y, shotEnd.x, shotEnd.y, opponent.pos.x, opponent.pos.y) > ball.radius + 20

    // Countdown commit timer (reduces state flip-flopping).
    if (mem.commitMs > 0) mem.commitMs = Math.max(0, mem.commitMs - dt * 1000)

    // Simple stuck detector: if we're not making progress toward the ball, flip orbit side.
    const distToBallNow = Math.hypot(ballPred.x - vehicle.pos.x, ballPred.y - vehicle.pos.y)
    if (!Number.isFinite(mem.lastDistToBall)) {
      mem.lastPos = { x: vehicle.pos.x, y: vehicle.pos.y }
      mem.lastDistToBall = distToBallNow
      mem.stuckMs = 0
    }
    const moved = Math.hypot(vehicle.pos.x - mem.lastPos.x, vehicle.pos.y - mem.lastPos.y)
    const progress = mem.lastDistToBall - distToBallNow
    const verySlow = moved < 0.6
    const notProgressing = progress < 0.2
    const liningUp = mem.offenseState === 'setup' && distToContact < 40 && behindEnough
    if (verySlow && notProgressing && !liningUp) mem.stuckMs += dt * 1000
    else mem.stuckMs = Math.max(0, mem.stuckMs - dt * 650)
    mem.lastPos = { x: vehicle.pos.x, y: vehicle.pos.y }
    mem.lastDistToBall = distToBallNow

    if (mem.stuckMs > 520) {
      mem.orbitSideSign = (mem.orbitSideSign === 1 ? -1 : 1)
      mem.offenseState = 'orbit'
      mem.commitMs = 220
      mem.stuckMs = 0
    }

    // Commit prevents retreats from flip-flopping, not a ready strike.
    const canChange = mem.commitMs <= 0

    // Dead-ball behavior: commit to getting the ball moving instead of orbit-dithering.
    if (!inDanger && ballIsStill && canChange && distToBallPred < 210) {
      if (mem.offenseState === 'orbit') {
        mem.offenseState = 'setup'
        mem.commitMs = Math.max(mem.commitMs, 420)
      }
    }

    if (mem.offenseState === 'strike') {
      // A touch is not a permanent license to chase: without goal gravity,
      // following a ball off the shot line just drives it into the end wall.
      if (canChange && wrongSide) mem.offenseState = 'orbit'
      else if (canChange && !openShot && (distToBallPred > 180 || Math.abs(cross) > 18)) mem.offenseState = 'setup'
    } else if (mem.offenseState === 'setup') {
      if (canChange && !behindEnough) mem.offenseState = 'orbit'
      else if (distToContact < 70 && Math.abs(cross) < 22 && headingAlign > 0.92) {
        mem.offenseState = 'strike'
        mem.commitMs = ballIsStill ? 520 : 280
      }
    } else {
      // orbit
      if (canChange && behindEnough && distToContact < 280) {
        mem.offenseState = 'setup'
        mem.commitMs = 220
      }
    }

    // When in danger, bias toward more decisive clears.
    if (inDanger && mem.offenseState === 'setup' && distToBallPred < 150) {
      mem.offenseState = 'strike'
      mem.commitMs = Math.max(mem.commitMs, 320)
    }
    if (openShot) { mem.offenseState = 'strike'; mem.commitMs = Math.max(mem.commitMs, 200) }

    const orbitRadius = wrongSide ? 200 : 150
    const orbitBack = contactOffset + 60
    let orbitTarget = {
      x: ballPred.x - desiredDir.x * orbitBack + perp.x * orbitRadius * mem.orbitSideSign,
      y: ballPred.y - desiredDir.y * orbitBack + perp.y * orbitRadius * mem.orbitSideSign,
    }

    // If orbit target would push into top/bottom, flip orbit side
    if (orbitTarget.y < field.top + 50 || orbitTarget.y > field.bottom - 50) {
      mem.orbitSideSign = (mem.orbitSideSign === 1 ? -1 : 1)
      orbitTarget = {
        x: ballPred.x - desiredDir.x * orbitBack + perp.x * orbitRadius * mem.orbitSideSign,
        y: ballPred.y - desiredDir.y * orbitBack + perp.y * orbitRadius * mem.orbitSideSign,
      }
    }

    orbitTarget = clampToBounds(orbitTarget)

    let moveTarget: Vector2
    let aimTarget: Vector2
    let accelMult = 1.0
    let allowAvoidance = true
    let allowReverse = true

    const goalSideOfBall = (vehicle.pos.x - ball.pos.x) * (defendGoal.pos.x - ball.pos.x)
      + (vehicle.pos.y - ball.pos.y) * (defendGoal.pos.y - ball.pos.y) > 0
    if (emergencyClear && goalSideOfBall) {
      // Full send: hit the ball away from our goal as hard as possible.
      const away = normalize({ x: ballPred.x - defendGoal.pos.x, y: ballPred.y - defendGoal.pos.y })
      const centerBias = normalize({
        x: ((field.left + field.right) / 2) - ballPred.x,
        y: ((field.top + field.bottom) / 2) - ballPred.y,
      })
      const clearDir = normalize({ x: away.x * 0.9 + centerBias.x * 0.35, y: away.y * 0.9 + centerBias.y * 0.35 })
      moveTarget = { x: ballPred.x + clearDir.x * 420, y: ballPred.y + clearDir.y * 420 }
      aimTarget = ballPred
      accelMult = 1.75
      allowAvoidance = false
      allowReverse = false
      mem.offenseState = 'strike'
      mem.commitMs = Math.max(mem.commitMs, 520)
    } else if (inDanger && distToBallPred > 140 && ballToDefGoalDist < 340) {
      // Goalkeeping: block first, then clear.
      moveTarget = goaliePoint
      aimTarget = ballPred
      accelMult = 1.05
      allowAvoidance = true
      allowReverse = true
    } else if (mem.offenseState === 'orbit') {
      moveTarget = orbitTarget
      aimTarget = orbitTarget
      accelMult = carToBallDist > 260 ? 1.05 : 0.95
      allowAvoidance = true
      allowReverse = true
    } else if (mem.offenseState === 'setup') {
      // Move to contact point, but AIM through the ball so we don't stop facing a zero-vector.
      moveTarget = contactPoint
      aimTarget = { x: ballPred.x + desiredDir.x * 280, y: ballPred.y + desiredDir.y * 280 }

      // If far from the contact point, keep moving; when close, prioritize alignment.
      // Near walls / dead balls: allow a bit more "creep" to finish lining up instead of stalling.
      if (distToContact > 45) accelMult = 0.75
      else accelMult = headingAlign > 0.15 ? 0.65 : (ballIsStill ? 0.28 : 0.12)

      // Allow soft avoidance while far from the contact point (prevents bumper-route stalls),
      // but keep close-in setup clean. When ball is dead, allow a bit more maneuvering.
      allowAvoidance = distToContact > (ballIsStill ? 70 : 120)
      allowReverse = ballIsStill && distToContact > 120
    } else {
      // strike: drive through ball along desiredDir
      moveTarget = { x: ballPred.x + desiredDir.x * 360, y: ballPred.y + desiredDir.y * 360 }
      aimTarget = ballPred
      if (!inDanger) {
        const dToAttackGoal = Math.hypot(attackGoal.pos.x - ballPred.x, attackGoal.pos.y - ballPred.y)
        // A controlled final touch keeps a close shot between the posts.
        if (dToAttackGoal < 190) {
          accelMult = ballSpeed > 240 ? 0.9 : 1.1
        } else {
          accelMult = 1.25
        }
      } else {
        accelMult = 1.35
      }
      allowAvoidance = false
      allowReverse = false
    }

    // Follow the striking line continuously as the ball moves, rather than
    // waiting at a moving setup point for a full stop and turn.
    if (behindEnough && !(emergencyClear && goalSideOfBall)) {
      const underPressure = Math.hypot(opponent.pos.x - ball.pos.x, opponent.pos.y - ball.pos.y) < 220
        && contactDir.x > 0.35
      const approachBack = Math.min(underPressure ? 60 : 180, Math.abs(cross) * 2)
      const approach = clampToBounds({ x: ballPred.x - desiredDir.x * approachBack, y: ballPred.y - desiredDir.y * approachBack })
      const ready = approachBack < 45 || openShot
      mem.offenseState = ready ? 'strike' : 'setup'
      aimTarget = openShot ? ballPred : approach
      moveTarget = ready ? { x: ballPred.x + desiredDir.x * 360, y: ballPred.y + desiredDir.y * 360 } : approach
      accelMult = 1
      allowAvoidance = carToBallDist > 240
      allowReverse = false
    }

    // Avoidance can destabilize close-in ball control; keep it mostly for orbiting
    const avoidanceMode: 'none' | 'hard' | 'soft' = allowAvoidance && carToBallDist > 90 ? 'soft' : 'none'
    const finalMoveTarget = applyAvoidanceToTarget(vehicle, opponent, moveTarget, avoidanceMode)
    const finalAimTarget = allowAvoidance ? finalMoveTarget : aimTarget
    const allowDetour = allowAvoidance && mem.offenseState !== 'strike' && distToBallPred > 120
    applyAiDriving(vehicle, finalMoveTarget, finalAimTarget, accelMult, allowReverse, allowDetour, mem.orbitSideSign, mem.offenseState === 'strike')

    if (mem.boost.activeRemaining <= 0 && mem.boost.cooldownRemaining <= 0) {
      const hx = Math.cos(vehicle.angle), hy = Math.sin(vehicle.angle)
      const forwardSpeed = vehicle.vel.x * hx + vehicle.vel.y * hy
      const sidewaysSpeed = Math.abs(vehicle.vel.x * hy - vehicle.vel.y * hx)
      const boostTarget = openShot ? ballPred : finalMoveTarget
      const targetX = boostTarget.x - vehicle.pos.x, targetY = boostTarget.y - vehicle.pos.y
      const targetDistance = Math.hypot(targetX, targetY)
      const aligned = targetDistance > 1 && (targetX * hx + targetY * hy) / targetDistance > 0.99
      const ballAhead = carToBallX * hx + carToBallY * hy
      const ballAcross = Math.abs(carToBallX * hy - carToBallY * hx)
      const awayFromOwnGoal = (vehicle.pos.x - defendGoal.pos.x) * hx + (vehicle.pos.y - defendGoal.pos.y) * hy > 0
      const ballWallClearance = Math.min(ball.pos.x - field.left, field.right - ball.pos.x,
        ball.pos.y - field.top, field.bottom - ball.pos.y)
      const finishing = mem.offenseState === 'strike' && behindEnough && ballAhead > 65 && ballAhead < 300
        && ballAcross < 18 && (openShot || headingAlign > 0.97) && awayFromOwnGoal
        && (openShot || ballWallClearance > ball.radius + 50)
        && Math.hypot(ball.pos.x - attackGoal.pos.x, ball.pos.y - attackGoal.pos.y) > 220
      const repositioning = carToBallDist > 400 && targetDistance > 360
      // Spend the boost on a lined-up hit or a long straight recovery, never
      // while turning, sliding sideways, setting up a delicate touch, or in traffic.
      memory.boostRequested = aligned && forwardSpeed > 15 && forwardSpeed < 250 && sidewaysSpeed < 55
        && (finishing || repositioning) && boostLaneClear(world, vehicle)
    }
  }

  const rightGoal = goals.find(g => g.side === 'right')
  const leftGoal = goals.find(g => g.side === 'left')
  if (rightGoal && leftGoal) {
    runKickballAi({
      vehicle: vehicle1,
      opponent: vehicle2,
      memory,
      attackGoal: rightGoal,
      defendGoal: leftGoal,
    })
  }

  return isAccelerating
}

/** Separate from normal driving so both cars use the same boost and cooldown. */
export function advanceComputerBoost(world: PhysicsWorld, memory: AiMemory, dt: number): boolean {
  const started = memory.boostRequested && startBoost(memory.boost, world.vehicle1)
  memory.boostRequested = false
  updateBoost(memory.boost, world.vehicle1, dt)
  return started
}
