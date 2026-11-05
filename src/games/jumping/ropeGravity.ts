import type { Climbing, Point } from './climbables.ts'
import { ROPE_TOP_GRIP, climbRoot, ropeGripDistance, ropeGripLimit, ropePoint } from './climbables.ts'
import type { Platform, Player } from './model.ts'
import { TUNING } from './movementTuning.ts'
import { bodyPolygon, moveBody, polygonIntersects } from './geometry.ts'
import { mirrorPlatform } from './gravityFrame.ts'
import { groundAt } from './terrain.ts'
import { canGrip } from './friction.ts'

const TURN_SPEED = Math.PI / .45, GRAVITY_DEADBAND = TUNING.gravity * .05
const AIR_TURN_TIME = .35
export const playerTurnAngle = (p: Player) => p.climbing?.turn?.angle ?? p.releaseTurn?.angle ?? 0

/**
 * Up/Down follow screen height, including ropes floating away from a floor
 * anchor. Hanging by its arms from a rope with one anchor, the robot is held
 * from the anchor side, so Up climbs toward the anchor wherever the rope
 * carries on down past the hands, even over a hump or along a sill, and away
 * from it only where the rope floats, rising on both sides of the hands. Its small
 * wiggles are not a direction. A tied rope follows a clearly steep stretch at
 * the hands, else its longer course toward the first anchor. Keep the last
 * direction only where that is level too.
 */
export function ropeScreenDirection(c: Climbing, vertical: number, frameDirection: number) {
  const rope = c.rope!, distance = ropeGripDistance(c), a = ropePoint(rope, Math.max(0, distance - 8)), b = ropePoint(rope, Math.min(rope.definition.length, distance + 8))
  const slope = (from: Point, to: Point) => Math.abs(to[1] - from[1]) / (Math.hypot(to[0] - from[0], to[1] - from[1]) || 1)
  if (!rope.definition.end) {
    const grip = ropePoint(rope, distance), past = ropePoint(rope, Math.min(rope.definition.length, distance + 24)), before = ropePoint(rope, Math.max(0, distance - 24))
    const falls = past[1] - grip[1], rises = grip[1] - before[1]
    // Floating means rising on both sides of the hands: up from a lower anchor and on up past them.
    if (falls < -4 && rises < -4) c.screenAxis = -1
    else if (falls > 4 || rises > 4) c.screenAxis = 1
  } else if (slope(a, b) > .7) c.screenAxis = Math.sign(b[1] - a[1])
  else {
    const toward = ropePoint(rope, Math.max(0, distance - 64))
    if (slope(toward, b) > .25) c.screenAxis = Math.sign(b[1] - toward[1])
    else if (slope(a, b) > .25) c.screenAxis = Math.sign(b[1] - a[1])
  }
  return vertical * frameDirection * (c.screenAxis ?? 1)
}
export const ropeWantsTurn = (c: Climbing, gravity: number) => !!c.turn || gravity < -GRAVITY_DEADBAND

// On a tied rope, Left/Right carries the robot along spans flatter than about
// 45 degrees, and Up/Down climbs spans steeper than 20. Between the two either
// works, so a slack rope can be followed from its sagging middle up either side.
// The gap between entering and leaving the shimmy range avoids chattering.
const SHIMMY_ENTER = Math.tan(40 * Math.PI / 180), SHIMMY_LEAVE = Math.tan(50 * Math.PI / 180)
const CLIMB_SLOPE = Math.tan(20 * Math.PI / 180)
/** The rope's direction at the grip, toward the far end: a short chord around the hands. */
function ropeTangent(c: Climbing): Point {
  const distance = ropeGripDistance(c), a = ropePoint(c.rope!, Math.max(0, distance - 12)), b = ropePoint(c.rope!, Math.min(c.rope!.definition.length, distance + 12))
  return [b[0] - a[0], b[1] - a[1]]
}
const ropeSlope = (c: Climbing) => { const [dx, dy] = ropeTangent(c); return Math.abs(dy) / (Math.abs(dx) || 1e-9) }
/**
 * Whether Left/Right can carry the robot along a tied rope here. Ropes hanging
 * from one anchor never shimmy; Left/Right swings them.
 */
export function updateRopeShimmy(c: Climbing) {
  if (!c.rope?.definition.end) { c.shimmy = false; return false }
  c.shimmy = ropeSlope(c) < (c.shimmy ? SHIMMY_LEAVE : SHIMMY_ENTER)
  return c.shimmy
}
/** Whether Up/Down climbs a tied rope here. On a level span they would have no height to follow. */
export const ropeClimbable = (c: Climbing) => !c.rope?.definition.end || ropeSlope(c) > CLIMB_SLOPE
/**
 * Which way the robot faces to travel along a rope here: the way its grip
 * moves across the screen. Where the rope runs straight up and down it keeps
 * its facing (0): a rope tied at both ends turns it once it leans about 7
 * degrees from vertical, a rope draped from one anchor about 12.
 */
export function ropeTravelFacing(c: Climbing, materialVertical: number, facing: number) {
  // A rope tied at both ends holds its shape, so its live direction counts. A rope with one anchor
  // sways as it is climbed; where it lies over terrain, the robot follows its laid-out course instead,
  // and a rope that hangs free never turns the robot about.
  const tied = !!c.rope?.definition.end, [dx, dy] = tied ? ropeTangent(c) : restTangent(c)
  const across = -dx * Math.sign(materialVertical) / (Math.hypot(dx, dy) || 1)
  return Math.sign(across) === facing || Math.abs(across) > (tied ? .12 : .2) ? Math.sign(across) : 0
}
/** A one-anchor rope's laid-out direction at the grip, a chord of 24 like ropeTangent; straight down without a layout. */
function restTangent(c: Climbing): Point {
  const rope = c.rope!.definition, rest = rope.rest, grip = ropeGripDistance(c)
  // A layout belongs to this anchor; a rope released from its first anchor hangs from the other end.
  if (!rest || rest.points.length < 2 || Math.hypot(rest.points[0][0] - rope.x, rest.points[0][1] - rope.y) > 2) return [0, 1]
  const spacing = rope.length / (rest.points.length - 1)
  const at = (distance: number): Point => {
    const d = Math.max(0, Math.min(rope.length, distance)), distances = rest.distances
    let i = 1
    if (distances) while (i < distances.length - 1 && distances[i] < d) i++
    else i = Math.max(1, Math.min(rest.points.length - 1, Math.ceil(d / spacing)))
    const d0 = distances ? distances[i - 1] : (i - 1) * spacing, d1 = distances ? distances[i] : i * spacing
    const t = d1 > d0 ? Math.max(0, Math.min(1, (d - d0) / (d1 - d0))) : 0, a = rest.points[i - 1], b = rest.points[i]
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]
  }
  const a = at(grip - 12), b = at(grip + 12)
  return [b[0] - a[0], b[1] - a[1]]
}
/** How steep the rope runs at the grip, from 0 (level) to 1 (vertical). */
export function ropeVerticality(c: Climbing) {
  const [dx, dy] = ropeTangent(c)
  return Math.abs(dy) / (Math.hypot(dx, dy) || 1)
}
/** Left/Right as travel along the rope: positive climbs toward the first anchor, like Up. */
export function ropeShimmyDirection(c: Climbing, move: number) {
  if (Math.abs(move) < .1) return 0
  const [dx] = ropeTangent(c)
  return -Math.sign(move) * (Math.sign(dx) || 1)
}

/** Changing from hand-over-hand climbing to a hang must retain its material grip. */
export function keepRopeGrip(c: Climbing, grip: number) {
  let low = ROPE_TOP_GRIP, high = ropeGripLimit(c.rope!.definition)
  for (let i = 0; i < 24; i++) {
    c.distance = (low + high) / 2
    if (ropeGripDistance(c) < grip) low = c.distance; else high = c.distance
  }
  c.distance = (low + high) / 2
}
function clearTurn(from: Point, to: Point, angle: number, terrain: readonly Platform[]) {
  const hull = bodyPolygon(to[0], to[1], TUNING.height, 1, angle)
  if (terrain.some(b => polygonIntersects(hull, b, .001))) return false
  const safe = moveBody(from, to, terrain, TUNING.height, 1, angle)
  return Math.hypot(safe.x - to[0], safe.y - to[1]) < .01
}

/** Rotate around the held hands. Arc samples check the actual rotated body;
 * a blocked turn waits for clearance and never pushes the grip through rock. */
export function stepRopeTurn(c: Climbing, gravity: number, facing: number, terrain: readonly Platform[], dt: number) {
  if (!c.turn) c.turn = { angle: 0, target: facing * Math.PI, grip: ropeGripDistance(c) }
  const turn = c.turn
  if (Math.abs(gravity) <= GRAVITY_DEADBAND) return
  if (gravity > GRAVITY_DEADBAND) turn.target = 0
  else if (gravity < -GRAVITY_DEADBAND) turn.target = Math.sign(turn.target || turn.angle || facing) * Math.PI
  const advance = () => {
    const before = turn.angle, next = before + Math.max(-TURN_SPEED * dt, Math.min(TURN_SPEED * dt, turn.target - before))
    let from = climbRoot(c, facing)
    for (let i = 1; i <= 3; i++) {
      turn.angle = before + (next - before) * i / 3
      const root = climbRoot(c, facing)
      if (!clearTurn(from, root, turn.angle, terrain)) { turn.angle = before; return false }
      from = root
    }
    return true
  }
  if (!advance() && turn.angle === 0 && turn.target) { turn.target = -turn.target; advance() }
}

/** A release during a turn continues around the body center in free flight,
 * using ordinary contact separation as its changing hull meets a surface.
 * Keeping the center rigid would trap a tilted body against a ceiling forever. */
export function stepReleasedTurn(p: Player, terrain: readonly Platform[], dt: number, gravity = p.gravity ?? TUNING.gravity) {
  const turn = p.releaseTurn
  if (!turn) return
  if (turn.time !== undefined) turn.time += dt
  if (Math.abs(gravity) <= GRAVITY_DEADBAND) return
  if (gravity > GRAVITY_DEADBAND) turn.target = 0
  else if (gravity < -GRAVITY_DEADBAND) turn.target = Math.sign(turn.target || turn.angle || p.facing) * Math.PI
  const before = turn.angle
  const progress = turn.progress === undefined ? undefined : Math.max(0, Math.min(1,
    turn.progress + (turn.target ? 1 : -1) * dt / AIR_TURN_TIME))
  const next = progress === undefined ? before + Math.max(-TURN_SPEED * dt, Math.min(TURN_SPEED * dt, turn.target - before))
    : Math.sign(turn.target || before || p.facing) * Math.PI * progress * progress * (3 - 2 * progress)
  const advance = (height: number): Point | null => {
    const center: Point = [p.x + Math.sin(before) * 31, p.y - Math.cos(before) * 31]
    let from: Point = [p.x, p.y]
    for (let i = 1; i <= 3; i++) {
      const angle = before + (next - before) * i / 3, root: Point = [center[0] - Math.sin(angle) * 31, center[1] + Math.cos(angle) * 31]
      const safe = moveBody(from, root, terrain, height, 1, angle)
      const dx = safe.x - root[0], dy = safe.y - root[1]
      // Allow only the local clearance created by this small angular step.
      // A narrow passage still blocks rotation; it cannot eject the whole body.
      if (Math.hypot(dx, dy) > TUNING.height * Math.abs(next - before) / 3 + .05
        || terrain.some(b => polygonIntersects(bodyPolygon(safe.x, safe.y, height, 1, angle), b, .001))) return null
      center[0] += dx; center[1] += dy
      from = [safe.x, safe.y]
    }
    return from
  }
  let from = advance(p.crouching ? TUNING.crouchHeight : TUNING.height)
  // A free roll can finish crouched beneath a low ceiling. Keep the actual
  // compact hull through the turn instead of freezing a standing hull halfway.
  if (!from && turn.progress !== undefined && !p.crouching) {
    from = advance(TUNING.crouchHeight)
    if (from) p.crouching = true
  }
  if (!from) return
  p.x = from[0]; p.y = from[1]; turn.angle = next
  if (progress !== undefined) turn.progress = progress
}

/** A blocked hand-pivot turn may already be resting on a usable ceiling.
 * Release into the existing free turn only on real gravity-facing contact,
 * with room for the full standing body at that same surface. */
export function ropeTurnHasSupport(p: Player, gravity: number, terrain: readonly Platform[]) {
  const turn = p.climbing?.turn
  if (!turn || Math.abs(gravity) <= GRAVITY_DEADBAND) return false
  const direction = Math.sign(gravity), angle = turn.angle
  const center: Point = [p.x + Math.sin(angle) * 31, p.y - Math.cos(angle) * 31]
  const probe = moveBody([p.x, p.y], [p.x, p.y + direction * .2], terrain, TUNING.height, 1, angle)
  return probe.contacts.some(contact => {
    if (contact.platform.looseProp || contact.normal[1] * direction >= -.01) return false
    const faceAngle = Math.atan2(contact.normal[0], -contact.normal[1] * direction)
    if (!canGrip(faceAngle)) return false
    const surface = groundAt([direction < 0 ? mirrorPlatform(contact.platform) : contact.platform], center[0],
      center[1] * direction, TUNING.height / 2 + TUNING.width / 2, s => Math.abs(s.angle - faceAngle) < 1e-4)
    if (!surface) return false
    const hull = bodyPolygon(center[0], surface.y * direction, TUNING.height, direction)
    return !terrain.some(b => polygonIntersects(hull, b, .001))
  })
}

/** A completed half-turn becomes the existing reflected controller with the
 * same occupied space. Facing follows the physical turn. */
export function finishGravityTurn(p: Player) {
  const turn = p.climbing?.turn ?? p.releaseTurn
  if (!turn || Math.abs(turn.angle - turn.target) > 1e-6) return
  // Every released turn captures its outgoing rig at time 0; hold the physical
  // turn for that blend without reading the captured pose itself.
  if (p.releaseTurn && (p.releaseTurn.time ?? 0) < .18) return
  if (p.climbing?.caught.releaseTurn && p.climbing.time < .16) return
  if (Math.abs(turn.angle) > 3) {
    p.inverted = !p.inverted; p.facing = -p.facing
    const c = p.climbing
    if (c) {
      c.lean = -c.lean
      if (c.bodyMotion) {
        const m = c.bodyMotion
        m.angle = -m.angle; m.velocity = -m.velocity; m.legs = -m.legs; m.legVelocity = -m.legVelocity
      }
      if (c.swingAngle) {
        const m = c.swingAngle
        m.angle = -m.angle; m.velocity = -m.velocity; m.legs = -(m.legs ?? 0); m.legVelocity = -(m.legVelocity ?? 0)
      }
      if (c.sway) { c.sway.x = -c.sway.x; c.sway.vx = -c.sway.vx }
      if (c.setback) c.setback = -c.setback
    }
  }
  if (p.climbing?.turn) { const grip = p.climbing.turn.grip; delete p.climbing.turn; keepRopeGrip(p.climbing, grip) }
  delete p.releaseTurn
}
