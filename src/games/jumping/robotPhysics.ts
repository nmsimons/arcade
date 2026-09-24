import type { Platform } from './model.ts'
import type { RobotState } from './challenge.ts'
import { polygonIntersects, polygonPoints } from './geometry.ts'
import type { Vec } from './geometry.ts'
import { groundAt } from './terrain.ts'

const RADIUS = 9, HALF_AXLE = 17

/** Height of a round wheel against exposed edges and their rounded corners. */
function wheelHeight(platforms: readonly Platform[], x: number, nearY: number, reach: number) {
  // Do not drive a wheel past a cliff just because its rim can still touch
  // the last corner. Connected ramp surfaces remain traversable.
  if (!groundAt(platforms, x, nearY + RADIUS, reach + RADIUS * 2)) return null
  let height = Infinity
  const accept = (y: number) => { if (Math.abs(y - nearY) <= reach) height = Math.min(height, y) }
  for (const platform of platforms) {
    if (x + RADIUS < platform.x || x - RADIUS > platform.x + platform.w) continue
    const points = polygonPoints(platform)
    for (let i = 0; i < points.length; i++) {
      const a = points[i], b = points[(i + 1) % points.length], dx = b[0] - a[0], dy = b[1] - a[1]
      if (dx <= 1e-7) continue
      const length = Math.hypot(dx, dy), projectionX = x - dy / length * RADIUS
      if (projectionX >= a[0] && projectionX <= b[0]) accept(a[1] + (x - a[0]) * dy / dx - RADIUS * length / dx)
      for (const end of [a, b]) if (Math.abs(x - end[0]) < RADIUS) accept(end[1] - Math.sqrt(RADIUS ** 2 - (x - end[0]) ** 2))
    }
  }
  return Number.isFinite(height) ? height : null
}

/** Solve both wheel contacts together, preserving the axle length at seams. */
export function robotSupport(platforms: readonly Platform[], x: number, y: number, angle = 0, reach = 6) {
  let centerY = y - RADIUS
  for (let i = 0; i < 12; i++) {
    const dx = HALF_AXLE * Math.cos(angle), dy = HALF_AXLE * Math.sin(angle)
    const left = wheelHeight(platforms, x - dx, centerY - dy, reach)
    const right = wheelHeight(platforms, x + dx, centerY + dy, reach)
    if (left === null || right === null) return null
    angle = Math.atan2(right - left, dx * 2); centerY = (left + right) / 2
  }
  const c = Math.cos(angle), s = Math.sin(angle)
  const hull: Vec[] = [[-25, -37], [24, -37], [24, -3], [-25, -3]].map(([px, py]) => [x + px * c - py * s, centerY + px * s + py * c])
  if (platforms.some(p => polygonIntersects(hull, p, .05))) return null
  return { x, y: centerY + RADIUS, angle }
}

export function prepareRobots(platforms: readonly Platform[], robots: RobotState[]) {
  for (const robot of robots) {
    const support = robotSupport(platforms, robot.x, robot.y, 0, 55)
    if (support) Object.assign(robot, support)
  }
}

export function moveRobot(platforms: readonly Platform[], robot: RobotState, destination: number) {
  const distance = destination - robot.x, steps = Math.max(1, Math.ceil(Math.abs(distance) / 2)), dx = distance / steps
  for (let i = 0; i < steps; i++) {
    const next = robotSupport(platforms, robot.x + dx, robot.y, robot.angle, Math.abs(dx) * 2 + 2)
    if (!next) return false
    Object.assign(robot, next)
  }
  return true
}
