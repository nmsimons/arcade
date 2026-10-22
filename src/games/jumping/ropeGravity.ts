import type { Climbing, Point } from './climbables.ts'
import { climbRoot, ropeGripDistance, ropePoint } from './climbables.ts'
import type { Platform, Player } from './model.ts'
import { TUNING } from './movementTuning.ts'
import { bodyPolygon, moveBody, polygonIntersects } from './geometry.ts'
import { mirrorPlatform } from './gravityFrame.ts'
import { groundAt } from './terrain.ts'
import { canGrip } from './friction.ts'

const TURN_SPEED = Math.PI / .45, GRAVITY_DEADBAND = TUNING.gravity * .05
const AIR_TURN_TIME = .35
export const playerTurnAngle = (p: Player) => p.climbing?.turn?.angle ?? p.releaseTurn?.angle ?? 0

/** Up/Down follow screen height, including ropes floating away from a floor anchor.
 * Keep the last direction on a nearly horizontal span rather than chattering. */
export function ropeScreenDirection(c: Climbing, vertical: number, frameDirection: number) {
  const distance = ropeGripDistance(c), a = ropePoint(c.rope!, Math.max(0, distance - 8)), b = ropePoint(c.rope!, Math.min(c.rope!.definition.length, distance + 8))
  if (Math.abs(b[1] - a[1]) > Math.hypot(b[0] - a[0], b[1] - a[1]) * .25) c.screenAxis = Math.sign(b[1] - a[1])
  return vertical * frameDirection * (c.screenAxis ?? 1)
}
export const ropeWantsTurn = (c: Climbing, gravity: number) => !!c.turn || gravity < -GRAVITY_DEADBAND

/** Changing from hand-over-hand climbing to a hang must retain its material grip. */
export function keepRopeGrip(c: Climbing, grip: number) {
  let low = 12, high = c.rope!.definition.length - 8
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
  const center: Point = [p.x + Math.sin(before) * 31, p.y - Math.cos(before) * 31]
  let from: Point = [p.x, p.y]
  for (let i = 1; i <= 3; i++) {
    const angle = before + (next - before) * i / 3, root: Point = [center[0] - Math.sin(angle) * 31, center[1] + Math.cos(angle) * 31]
    const safe = moveBody(from, root, terrain, TUNING.height, 1, angle)
    const dx = safe.x - root[0], dy = safe.y - root[1]
    // Allow only the local clearance created by this small angular step.
    // A narrow passage still blocks rotation; it cannot eject the whole body.
    if (Math.hypot(dx, dy) > TUNING.height * Math.abs(next - before) / 3 + .05
      || terrain.some(b => polygonIntersects(bodyPolygon(safe.x, safe.y, TUNING.height, 1, angle), b, .001))) return
    center[0] += dx; center[1] += dy
    from = [safe.x, safe.y]
  }
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
  if (p.releaseTurn?.pose && (p.releaseTurn.time ?? 0) < .18) return
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
    }
  }
  if (p.climbing?.turn) { const grip = p.climbing.turn.grip; delete p.climbing.turn; keepRopeGrip(p.climbing, grip) }
  delete p.releaseTurn
}
