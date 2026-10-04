import type { Platform, Player } from './model.ts'
import type { RobotState } from './challenge.ts'
import { bodyIntersects, lineBlocked, moveBody, polygonIntersects, polygonPoints } from './geometry.ts'
import type { Vec } from './geometry.ts'
import { groundAt } from './terrain.ts'
import { disablePlatformLedges } from './terrainLedges.ts'
import { playerContactBody, translatePlayer } from './playerContacts.ts'
import type { ContactWorld } from './playerContacts.ts'
import { playerTurnAngle } from './ropeGravity.ts'

const RADIUS = 9, HALF_AXLE = 17

export const robotDrive = (r: Pick<RobotState, 'phase'>) => r.phase === 'charge' ? 540 : r.phase === 'chase' ? 235 : r.phase === 'patrol' ? 92 : 0
export const robotTop = (r: Pick<RobotState, 'phase'>) => r.phase === 'windup' ? -39 : -46

/** One forward sight line from the eye to the player's body. Facing, range and
 * shape bounds reject irrelevant geometry before any polygon edges are tested. */
export function robotSensesPlayer(r: RobotState, p: Player, obstacles: Iterable<Platform>) {
  if ((p.x - r.x) * r.facing <= 0 || Math.abs(p.y - r.y) >= 240 || Math.abs(p.x - r.x) >= 850
    || p.x < r.definition.left - 200 || p.x > r.definition.right + 200) return false
  const c = Math.cos(r.angle), s = Math.sin(r.angle), eyeX = 13.5 * r.facing, eyeY = robotTop(r) + 21.5
  const eye: Vec = [r.x + eyeX * c - eyeY * s, r.y - 9 + eyeX * s + eyeY * c]
  const body = playerContactBody(p)
  return !lineBlocked(eye, [body.x, body.y + body.height / 2 * (p.inverted ? 1 : -1)], obstacles)
}

/** Reuse this step's solid shapes without allocating a filtered list per bot. */
export function* robotSightObstacles(world: ContactWorld, observer: RobotState) {
  for (const collider of world.colliders) if (collider.robot !== observer && !collider.playerOnly) yield collider.platform
}

/** Just the chassis and wheels: no projecting mechanism to trap a foot. */
export function robotHulls(r: Pick<RobotState, 'x' | 'y' | 'angle' | 'facing' | 'phase'>): Vec[][] {
  const c = Math.cos(r.angle), s = Math.sin(r.angle)
  const rectangle = (x: number, y: number, w: number, h: number): Vec[] => [[x, y], [x + w, y], [x + w, y + h], [x, y + h]]
  const top = robotTop(r)
  const pieces = [rectangle(-26, top, 51, -12 - top),
    ...[-HALF_AXLE, HALF_AXLE].map(x => Array.from({ length: 32 }, (_, i): Vec => {
      const angle = i * Math.PI / 16
      return [x + RADIUS * Math.cos(angle), -RADIUS + RADIUS * Math.sin(angle)]
    }))]
  return pieces.map(piece => {
    const points = piece.map(([x, y]): Vec => [r.x + x * r.facing * c - (y + RADIUS) * s, r.y - RADIUS + x * r.facing * s + (y + RADIUS) * c])
    return r.facing < 0 ? points.reverse() : points
  })
}

/** Player contact uses the same chassis and wheels as loose objects.
 * Bots offer footing, but no ledge grabs that could tether a falling rider. */
export function robotPlatforms(robot: Parameters<typeof robotHulls>[0]): Platform[] {
  return robotHulls(robot).map(points => {
    const x = Math.min(...points.map(p => p[0])), y = Math.min(...points.map(p => p[1]))
    const shape: Platform = { x, y, w: Math.max(...points.map(p => p[0])) - x, h: Math.max(...points.map(p => p[1])) - y,
      polygon: points.map(p => [p[0] - x, p[1] - y]) }
    disablePlatformLedges(shape)
    return shape
  })
}

export function robotTouchesProps(robot: RobotState, props: readonly Platform[], distance = 0) {
  const hulls = robotHulls({ ...robot, x: robot.x + robot.facing * distance })
  return props.some(prop => hulls.some(hull => polygonIntersects(hull, prop, .001)))
}

/** Height of a round wheel against exposed edges and their rounded corners. */
function wheelHeight(platforms: readonly Platform[], x: number, nearY: number, reach: number) {
  // Do not drive a wheel past a cliff just because its rim can still touch
  // the last corner. Connected ramp surfaces remain traversable.
  // A wheel's vertical clearance is radius / cos(slope), not one radius.
  // Keep the cliff check directly below its center without imposing a flat-
  // ground height allowance that rejects a valid steep downhill contact.
  if (!groundAt(platforms, x, nearY + RADIUS, Infinity,
    surface => Math.abs(surface.y - RADIUS / Math.cos(surface.angle) - nearY) <= reach + RADIUS * 2)) return null
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
export function robotSupport(platforms: readonly Platform[], x: number, y: number, angle = 0, reach = 6, obstacles = platforms) {
  let centerY = y - RADIUS
  for (let i = 0; i < 12; i++) {
    const dx = HALF_AXLE * Math.cos(angle), dy = HALF_AXLE * Math.sin(angle)
    const left = wheelHeight(platforms, x - dx, centerY - dy, reach)
    const right = wheelHeight(platforms, x + dx, centerY + dy, reach)
    if (left === null || right === null) return null
    angle = Math.atan2(right - left, dx * 2); centerY = (left + right) / 2
  }
  const c = Math.cos(angle), s = Math.sin(angle)
  const hull: Vec[] = [[-26, -37], [26, -37], [26, -3], [-26, -3]].map(([px, py]) => [x + px * c - py * s, centerY + px * s + py * c])
  if (obstacles.some(p => polygonIntersects(hull, p, .05))) return null
  return { x, y: centerY + RADIUS, angle }
}

export function prepareRobots(platforms: readonly Platform[], robots: RobotState[]) {
  for (const robot of robots) {
    const surface = groundAt(platforms, robot.x, robot.y, 55)
    const support = robotSupport(platforms, robot.x, robot.y, surface?.angle ?? 0, 55)
    if (support) Object.assign(robot, support)
  }
}

/** Tilt an authored bot on its surface without snapping floating editor items. */
export function robotPreviewPose(platforms: readonly Platform[], robot: Pick<RobotState, 'x' | 'y'>) {
  const surface = groundAt(platforms, robot.x, robot.y, .1)
  return surface && robotSupport(platforms, robot.x, robot.y, surface.angle, 55)
    || { x: robot.x, y: robot.y, angle: 0 }
}

/** A moving support can leave a wheel in the air even when the motor is idle.
 * Re-seat locally at the current x; the drive query still refuses cliff edges. */
export function settleRobot(platforms: readonly Platform[], robot: RobotState, dt: number, player?: Player, playerBarriers: readonly Platform[] = []) {
  const centerY = robot.y - RADIUS, dx = HALF_AXLE * Math.cos(robot.angle), dy = HALF_AXLE * Math.sin(robot.angle)
  if (wheelHeight(platforms, robot.x - dx, centerY - dy, .1) !== null
    && wheelHeight(platforms, robot.x + dx, centerY + dy, .1) !== null) return
  const reach = HALF_AXLE * 2 + 2
  const target = robotSupport(platforms, robot.x, robot.y, robot.angle, reach)
  // Settling cannot climb onto a higher object or invent support over a drop.
  if (!target || target.y < robot.y - .01) return
  const angle = robot.angle + Math.max(-2 * dt, Math.min(2 * dt, target.angle - robot.angle))
  const nextDx = HALF_AXLE * Math.cos(angle), nextDy = HALF_AXLE * Math.sin(angle)
  const left = wheelHeight(platforms, robot.x - nextDx, centerY - nextDy, reach)
  const right = wheelHeight(platforms, robot.x + nextDx, centerY + nextDy, reach)
  if (left === null || right === null) return
  // The higher contact constrains the chassis while the other wheel lowers.
  const y = Math.min(left + nextDy, right - nextDy) + RADIUS
  if (y < robot.y - .01) return
  const next = { ...robot, y: Math.min(y, robot.y + 130 * dt), angle }
  if (robotTouchesProps(next, platforms)) return
  placeRobot(platforms, robot, next, player, playerBarriers)
}

function placeRobot(platforms: readonly Platform[], robot: RobotState, next: { x: number; y: number; angle: number }, player?: Player, playerBarriers: readonly Platform[] = []) {
  if (player) {
    const contactBody = playerContactBody(player), { height } = contactBody
    const hulls = robotPlatforms({ ...robot, ...next })
    // Only the moving bot can initiate this correction. A distant bot
    // must not resolve a ledge animation against the ordinary upright hull
    // and transport its grip away from the actual corner.
    const angle = playerTurnAngle(player)
    if (hulls.some(b => bodyIntersects(contactBody.x, contactBody.y, b, height, player.inverted ? -1 : 1, angle))) {
      if (player.hang || player.mantle || player.climbing) return false
      const obstacles = [...platforms, ...playerBarriers, ...hulls]
      // A pinned player blocks the bot; neither actor can pass through a wall.
      const safe = moveBody([player.x, player.y], [player.x, player.y], obstacles, height, player.inverted ? -1 : 1, angle)
      if (obstacles.some(b => bodyIntersects(safe.x, safe.y, b, height, player.inverted ? -1 : 1, angle))) return false
      translatePlayer(player, safe.x - player.x, safe.y - player.y)
    }
  }
  robot.x = next.x; robot.y = next.y; robot.angle = next.angle
  return true
}

export function moveRobot(platforms: readonly Platform[], robot: RobotState, destination: number, props: readonly Platform[] = [], player?: Player, footing?: Platform, playerBarriers: readonly Platform[] = []) {
  const distance = destination - robot.x, steps = Math.max(1, Math.ceil(Math.abs(distance) / 2)), dx = distance / steps
  for (let i = 0; i < steps; i++) {
    // A prop being separated by the contact solver may already support a
    // wheel. Include its surface without rejecting the unresolved body contact.
    const next = robotSupport(footing ? [...platforms, footing] : platforms, robot.x + dx, robot.y, robot.angle, Math.abs(dx) * 2 + 2, platforms)
    if (!next) return false
    const pose = { ...robot, ...next }
    if (robotTouchesProps(pose, props)) return false
    if (!placeRobot(platforms, robot, next, player, playerBarriers)) return false
  }
  return true
}
