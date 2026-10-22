import type { Platform, Player } from './model.ts'
import type { RobotState } from './challenge.ts'
import { bodyIntersects, bodyPolygon, lineBlocked, moveBody, platformOutline, polygonIntersects } from './geometry.ts'
import { TUNING } from './model.ts'
import type { Vec } from './geometry.ts'
import { groundAt } from './terrain.ts'
import { disablePlatformLedges } from './terrainLedges.ts'
import { playerContactBody, translatePlayer } from './playerContacts.ts'
import type { ContactWorld } from './playerContacts.ts'
import { playerTurnAngle } from './ropeGravity.ts'

const RADIUS = 9, HALF_AXLE = 17
/** Flat chassis and wheel footprint; no additional authoring inset. */
export const ROBOT_HALF_WIDTH = HALF_AXLE + RADIUS
const REPULSE_SPEED = 900, REPULSE_DECELERATION = 2250, REPULSE_AIR_DECELERATION = 225

export function faceRobotToward(robot: RobotState, x: number) {
  if (Math.abs(x - robot.x) > .5) robot.facing = Math.sign(x - robot.x)
  if (robot.actor) robot.actor.facing = robot.facing
}

/** A contact-sized sweep uses the actual player envelope and bot pieces, not
 * a proximity/sight radius. This also catches passive side bumps and riders. */
export function robotTouchesPlayer(robot: RobotState, player: Player) {
  if (Math.abs(player.x - robot.x) > 80 || Math.abs(player.y - robot.y) > 150) return false
  const body = playerContactBody(player, true), flip = player.inverted ? -1 : 1
  const x = body.x + Math.sign(robot.x - body.x) * .25
  const y = body.y + Math.sign(robot.y - 26 - (body.y - body.height / 2 * flip)) * .25
  return moveBody([body.x, body.y], [x, y], robotPlatforms(robot), body.height, flip, playerTurnAngle(player), body.outline).contacts.length > 0
}

/** Recoil is velocity resolved by swept wheel/contact movement on
 * subsequent simulation steps, never an immediate positional correction. */
export function repulseRobot(robot: RobotState, horizontal: number, sourceX?: number) {
  robot.recoilVx = Math.max(-REPULSE_SPEED, Math.min(REPULSE_SPEED, (robot.recoilVx ?? 0) + horizontal * REPULSE_SPEED))
  if (robot.phase !== 'recover') robot.time = 0
  robot.phase = 'recover'
  if (sourceX !== undefined) faceRobotToward(robot, sourceX)
}

export function stepRobotRecoil(platforms: readonly Platform[], robot: RobotState, dt: number, props: readonly Platform[], player: Player,
  playerBarriers: readonly Platform[], objectBarriers: readonly Platform[]) {
  const velocity = robot.recoilVx ?? 0
  if (!velocity || !(dt > 0)) return
  // Losing wheel footing also loses the grounded braking force. Retaining
  // momentum carries the chassis clear instead of parking it over the lip.
  const deceleration = robot.fallVelocity === undefined ? REPULSE_DECELERATION : REPULSE_AIR_DECELERATION
  const direction = Math.sign(velocity), time = Math.min(dt, Math.abs(velocity) / deceleration)
  const distance = velocity * time - direction * deceleration * time ** 2 / 2
  const destination = robot.x + distance
  const supported = robot.fallVelocity === undefined && moveRobot(platforms, robot, destination, props, player, undefined, playerBarriers, objectBarriers)
  const clear = supported || translateRobot(platforms, robot, destination - robot.x, 0, props, player, playerBarriers, objectBarriers)
  const solids = [...platforms, ...objectBarriers]
  if (!robotSupport(solids, robot.x, robot.y, robot.angle, .2)) robot.fallVelocity ??= 0
  if (robot.x < robot.definition.left - .01 || robot.x > robot.definition.right + .01) robot.deactivated = true
  robot.recoilVx = clear ? direction * Math.max(0, Math.abs(velocity) - deceleration * dt) : 0
}

/** External force can cross an unsupported edge. Sweep every actual hull piece;
 * patrol's two-wheel footing rule and authored lane limits apply only to drive. */
function translateRobot(platforms: readonly Platform[], robot: RobotState, dx: number, dy: number, props: readonly Platform[], player: Player,
  playerBarriers: readonly Platform[], objectBarriers: readonly Platform[]) {
  const solids = [...platforms, ...props, ...objectBarriers], delta = dx || dy
  if (!delta) return true
  let fraction = 1
  for (const hull of robotHulls(robot)) {
    const outline: Vec[] = hull.map(([x, y]) => [x - robot.x, y - robot.y])
    const safe = moveBody([robot.x, robot.y], [robot.x + dx, robot.y + dy], solids, 62, 1, 0, outline)
    fraction = Math.min(fraction, Math.max(0, Math.min(1, (dx ? safe.x - robot.x : safe.y - robot.y) / delta)))
  }
  if (!placeRobot(solids, robot, { x: robot.x + dx * fraction, y: robot.y + dy * fraction, angle: robot.angle }, player, playerBarriers)) return false
  return fraction > 1 - 1e-6
}

export function stepRobotFall(platforms: readonly Platform[], robot: RobotState, dt: number, props: readonly Platform[], player: Player,
  playerBarriers: readonly Platform[], objectBarriers: readonly Platform[]) {
  if (robot.fallVelocity === undefined) return
  const solids = [...platforms, ...objectBarriers]
  const support = robotSupport(solids, robot.x, robot.y, robot.angle, .2)
  if (support) { delete robot.fallVelocity; return }
  const velocity = robot.fallVelocity
  robot.fallVelocity = Math.min(1400, velocity + TUNING.gravity * dt)
  const distance = (velocity + robot.fallVelocity) * dt / 2
  if (!translateRobot(platforms, robot, 0, distance, props, player, playerBarriers, objectBarriers)) robot.fallVelocity = 0
}

export const robotDrive = (r: Pick<RobotState, 'phase'> & Partial<Pick<RobotState, 'definition' | 'deactivated'>>) => r.deactivated || r.definition?.kind === 'repulsor' ? 0 : r.phase === 'charge' ? 540 : r.phase === 'chase' ? 235 : r.phase === 'patrol' ? 92 : 0
export const robotTop = (r: Pick<RobotState, 'phase'> & Partial<Pick<RobotState, 'definition'>>) => r.definition?.kind === 'repulsor' ? -TUNING.height : r.phase === 'windup' ? -39 : -46

/** One forward sight line from the eye to the player's body. Facing, range and
 * shape bounds reject irrelevant geometry before any polygon edges are tested. */
export function robotSensesPlayer(r: RobotState, p: Player, obstacles: Iterable<Platform>) {
  if ((p.x - r.x) * r.facing <= 0 || Math.abs(p.y - r.y) >= (r.definition.kind === 'repulsor' ? 480 : 240) || Math.abs(p.x - r.x) >= 850
    || r.definition.kind !== 'repulsor' && (p.x < r.definition.left - 200 || p.x > r.definition.right + 200)) return false
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
export function robotHulls(r: Pick<RobotState, 'x' | 'y' | 'angle' | 'facing' | 'phase'> & Partial<Pick<RobotState, 'definition' | 'actor'>>): Vec[][] {
  if (r.definition?.kind === 'repulsor') {
    const body = r.actor ? playerContactBody(r.actor, true) : { x: r.x, y: r.y, height: TUNING.height }
    return [bodyPolygon(body.x, body.y, body.height, r.actor?.inverted ? -1 : 1, r.actor ? playerTurnAngle(r.actor) : 0, body.outline)]
  }
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

const robotShapes = new WeakMap<object, { x: number; y: number; angle: number; facing: number; top: number; platforms: Platform[] }>()
/** Player contact uses the same chassis and wheels as loose objects. These
 * read-only snapshots are reusable until the exact pose changes. Bots offer
 * footing, but no ledge grabs that could tether a falling rider. */
export function robotPlatforms(robot: Parameters<typeof robotHulls>[0]): readonly Platform[] {
  const saved = robotShapes.get(robot), top = robotTop(robot)
  if (robot.definition?.kind !== 'repulsor' && saved && Object.is(saved.x, robot.x) && Object.is(saved.y, robot.y) && Object.is(saved.angle, robot.angle)
    && saved.facing === robot.facing && saved.top === top) return saved.platforms
  const platforms = robotHulls(robot).map(points => {
    const x = Math.min(...points.map(p => p[0])), y = Math.min(...points.map(p => p[1]))
    const shape: Platform = { x, y, w: Math.max(...points.map(p => p[0])) - x, h: Math.max(...points.map(p => p[1])) - y,
      polygon: points.map(p => [p[0] - x, p[1] - y]) }
    disablePlatformLedges(shape)
    return shape
  })
  robotShapes.set(robot, { x: robot.x, y: robot.y, angle: robot.angle, facing: robot.facing, top, platforms })
  return platforms
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
    const points = platformOutline(platform)
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
    const nextAngle = Math.atan2(right - left, dx * 2), nextY = (left + right) / 2
    // Exact convergence makes all remaining passes identical. Keep the full
    // budget on changing slopes and contacts; no approximate early exit.
    const settled = Object.is(angle, nextAngle) && Object.is(centerY, nextY)
    angle = nextAngle; centerY = nextY
    if (settled) break
  }
  const c = Math.cos(angle), s = Math.sin(angle)
  const hull: Vec[] = [[-26, -37], [26, -37], [26, -3], [-26, -3]].map(([px, py]) => [x + px * c - py * s, centerY + px * s + py * c])
  if (obstacles.some(p => polygonIntersects(hull, p, .05))) return null
  return { x, y: centerY + RADIUS, angle }
}

export function prepareRobots(platforms: readonly Platform[], robots: RobotState[]) {
  for (const robot of robots) {
    if (robot.definition.kind === 'repulsor') continue
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
export function settleRobot(platforms: readonly Platform[], robot: RobotState, dt: number, player?: Player, playerBarriers: readonly Platform[] = [], objectBarriers: readonly Platform[] = []) {
  const solids = objectBarriers.length ? [...platforms, ...objectBarriers] : platforms
  const centerY = robot.y - RADIUS, dx = HALF_AXLE * Math.cos(robot.angle), dy = HALF_AXLE * Math.sin(robot.angle)
  if (wheelHeight(solids, robot.x - dx, centerY - dy, .1) !== null
    && wheelHeight(solids, robot.x + dx, centerY + dy, .1) !== null) return
  const reach = HALF_AXLE * 2 + 2
  const target = robotSupport(solids, robot.x, robot.y, robot.angle, reach)
  // Settling cannot climb onto a higher object or invent support over a drop.
  if (!target || target.y < robot.y - .01) return
  const angle = robot.angle + Math.max(-2 * dt, Math.min(2 * dt, target.angle - robot.angle))
  const nextDx = HALF_AXLE * Math.cos(angle), nextDy = HALF_AXLE * Math.sin(angle)
  const left = wheelHeight(solids, robot.x - nextDx, centerY - nextDy, reach)
  const right = wheelHeight(solids, robot.x + nextDx, centerY + nextDy, reach)
  if (left === null || right === null) return
  // The higher contact constrains the chassis while the other wheel lowers.
  const y = Math.min(left + nextDy, right - nextDy) + RADIUS
  if (y < robot.y - .01) return
  const next = { ...robot, y: Math.min(y, robot.y + 130 * dt), angle }
  if (robotTouchesProps(next, solids)) return
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

export function moveRobot(platforms: readonly Platform[], robot: RobotState, destination: number, props: readonly Platform[] = [], player?: Player, footing?: Platform, playerBarriers: readonly Platform[] = [], objectBarriers: readonly Platform[] = []) {
  const solids = objectBarriers.length ? [...platforms, ...objectBarriers] : platforms
  const distance = destination - robot.x, steps = Math.max(1, Math.ceil(Math.abs(distance) / 2)), dx = distance / steps
  for (let i = 0; i < steps; i++) {
    // A prop being separated by the contact solver may already support a
    // wheel. Include its surface without rejecting the unresolved body contact.
    const next = robotSupport(footing ? [...solids, footing] : solids, robot.x + dx, robot.y, robot.angle, Math.abs(dx) * 2 + 2, solids)
    if (!next) return false
    const pose = { ...robot, ...next }
    if (robotTouchesProps(pose, props)) {
      // Yielding to a prop already under a wheel belongs to the contact solver;
      // do not partially drive farther onto that unresolved support.
      if (footing) return false
      // Finish the clear fraction of this small drive step. Stopping a whole
      // substep early leaves a visible gap and prevents real contact attacks.
      let low = 0, high = 1
      let clear
      for (let search = 0; search < 8; search++) {
        const middle = (low + high) / 2
        // Wheel support is nonlinear around a prop corner. Interpolating the
        // two end poses can lower a wheel into cargo trapped against a floor.
        const trial = robotSupport(footing ? [...solids, footing] : solids,
          robot.x + dx * middle, robot.y, robot.angle, Math.abs(dx) * 2 + 2, solids)
        // Keep a sub-pixel contact skin so a small rotating box cannot be
        // wedged between the wheel and floor by the final separation pass.
        if (!trial || robotTouchesProps({ ...robot, ...trial }, props, .1 * Math.sign(dx) * robot.facing)) high = middle
        else { low = middle; clear = trial }
      }
      if (clear) placeRobot(platforms, robot, clear, player, playerBarriers)
      return false
    }
    if (!placeRobot(platforms, robot, next, player, playerBarriers)) return false
  }
  return true
}
