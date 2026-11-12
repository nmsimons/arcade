import type { Climbing, Point } from './climbables.ts'
import { TUNING } from './movementTuning.ts'

export interface RopeBodyMotion {
  angle: number; velocity: number; legs: number; legVelocity: number
  gripVx: number; gripVy: number; acceleration: number; weight: number
}
const clamp = (n: number, limit: number) => Math.max(-limit, Math.min(limit, n))
const smooth = (n: number) => { const t = Math.max(0, Math.min(1, n)); return t * t * (3 - 2 * t) }
const lerpNumber = (a: number, b: number, t: number) => a + (b - a) * t

/** Two damped followers respond to acceleration at the same material grip.
 * They never feed forces or presentation velocity back into the rope. */
export function stepRopeBodyMotion(c: Climbing, gripVx: number, gripVy: number, gravity: number, dt: number) {
  if (!(dt > 0)) return
  const m = c.bodyMotion ??= { angle: 0, velocity: 0, legs: 0, legVelocity: 0, gripVx, gripVy, acceleration: 0, weight: 1 }
  const acceleration = clamp((gripVx - m.gripVx) / dt, 3000)
  const verticalAcceleration = clamp((gripVy - m.gripVy) / dt, 3000)
  m.gripVx = gripVx; m.gripVy = gripVy
  m.acceleration += (acceleration - m.acceleration) * (1 - Math.exp(-dt / .07))
  const weight = Math.max(0, Math.min(1, (gravity - verticalAcceleration) * Math.cos(c.turn?.angle ?? 0) / TUNING.gravity))
  m.weight += (weight - m.weight) * (1 - Math.exp(-dt / .16))
  const free = smooth(c.hangBlend) * (1 - smooth(c.wallBlend ?? Number(!!c.wall)))
  const stiffness = 4 + Math.min(3100, Math.abs(gravity)) / 50
  const damping = 2.5 + Math.sqrt(stiffness) * .55 + (1 - free) * 12
  // Small substeps keep the followers consistent at both 120 and 30 Hz.
  const steps = Math.ceil(dt * 240), h = dt / steps
  for (let i = 0; i < steps; i++) {
    const drive = -m.acceleration * Math.cos(c.turn?.angle ?? 0) * free
    m.velocity += (drive / 48 - stiffness * m.angle - damping * m.velocity) * h
    m.angle = clamp(m.angle + m.velocity * h, .38)
    if (Math.abs(m.angle) === .38 && m.angle * m.velocity > 0) m.velocity = 0
    m.legVelocity += (drive / 65 + stiffness * .65 * (m.angle - m.legs) - damping * .75 * m.legVelocity) * h
    m.legs = clamp(m.legs + m.legVelocity * h, .6)
    if (Math.abs(m.legs) === .6 && m.legs * m.legVelocity > 0) m.legVelocity = 0
  }
}

/** Pumping and passive follow-through share fixed-length spine segments.
 * During a gravity turn the pelvis curls ahead of the trailing, gathered feet. */
export function ropePump(c: Climbing, turnAngle = c.turn?.angle ?? 0, facing = 1, longLegs = true) {
  const direction = Math.sign(c.lean), turn = smooth(Math.abs(c.lean) / .65)
  const gather = Math.abs(c.lean) * (1 - Math.max(0, Math.min(1, c.lean * c.swingVelocity)))
  const passive = (c.bodyMotion?.angle ?? 0) * (1 - turn * .7), legs = c.bodyMotion?.legs ?? 0
  const slack = 1 - (c.bodyMotion?.weight ?? 1)
  const curl = Math.sin(turnAngle), tuck = curl * curl
  const chestAngle = c.lean * .18 + direction * gather * .28 + passive * .7 + curl * .14 + facing * .01 * (1 - turn)
  const hipAngle = c.lean * .62 + direction * gather * .6 + passive * 1.2 + curl * .5 - facing * .025 * (1 - turn)
  const waist: Point = [Math.sin(chestAngle) * 10.1, Math.cos(chestAngle) * 10.1]
  const hip: Point = [waist[0] + Math.sin(hipAngle) * 6.5, waist[1] + Math.cos(hipAngle) * 6.5]
  const trail = Math.sin(legs) * 24 + curl * 10
  // Pumping, the legs stay long: toward the facing they pike forward, the other way the body arches with the
  // legs swept back, instead of tucking into a seat.
  // Wall contact still reads the tucked legs (longLegs false), so a swing's long legs don't brace any sooner.
  const pike = (foot: Point): Point => {
    // Leaning into a swing at all, the legs stay long, at both ends of the swing as well as mid-pump.
    const length = Math.hypot(foot[0], foot[1]) || 1, reach = 30.6 - slack, weight = longLegs ? Math.min(1, Math.max(gather * 3, turn * 1.5, Math.abs(c.swingVelocity) * 2)) : 0
    return length < reach ? [foot[0] * lerpNumber(1, reach / length, weight), foot[1] * lerpNumber(1, reach / length, weight)] : foot
  }
  const frontFoot: Point = pike([c.lean * (16 + gather * 8) + trail - facing * 2 * (1 - turn),
    27.5 - turn * 3.5 - gather * (longLegs ? 9 : 16.5) - tuck * 13 - slack * 3])
  const backFoot: Point = pike([c.lean * (9 + gather * 8) + trail * .8 + facing * 2 * (1 - turn),
    26 - turn * 2.5 - gather * (longLegs ? 7 : 14) - tuck * 16 - slack * 4])
  return { waist, hip, frontFoot, backFoot, curl }
}

/**
 * How far below the grip the chest hangs. At rest the arms are nearly straight
 * overhead, the elbows a little flexed. Traveling a level rope, the chest stays 20 below it, the head clear
 * under the rope, so the hands can reach ahead and behind. Climbing a
 * steep rope it rides up to 8.5 below the grip, beside the rope, so a hand
 * reaches from full stretch overhead down to the chest.
 */
export function ropeArmReach(c: Climbing) {
  // A loaded hang keeps a little flex in the elbows; as the rope drops away and the load eases, they soften.
  const rest = 17.6 + .7 * (c.bodyMotion?.weight ?? 1) + .5 * smooth(Math.abs(c.lean) / .65)
  const traveling = 20 - 11.5 * (c.ropeVertical ?? 1)
  return rest + (traveling - rest) * smooth(c.shimmyBlend ?? 0)
}
/**
 * Traveling hand over hand, the body is drawn just behind the rope, so the
 * robot faces the rope it holds. Turning around carries it smoothly to the
 * other side. It is presentation only; collision keeps the body on the rope.
 */
export function stepRopeSetback(c: Climbing, facing: number, dt: number) {
  // Climbing a steep rope, the head stays clear behind it; a level rope passes overhead.
  const setback = 5 + 5 * (c.ropeVertical ?? 1)
  const target = -facing * setback * smooth(c.shimmyBlend ?? 0), current = c.setback ?? 0
  c.setback = current + Math.max(-90 * dt, Math.min(90 * dt, target - current))
}

/** The collision root follows the articulated pelvis, including through turns. */
export function ropeHangOffset(c: Climbing, facing: number, angle = c.turn?.angle ?? 0): Point {
  const spread = 3.9 * (1 - smooth(Math.abs(c.lean) / .65)), out = c.lean * 7
  const pump = ropePump(c, angle, facing), reach = ropeArmReach(c)
  return [out + pump.hip[0], Math.sqrt(reach ** 2 - (Math.abs(out) + spread) ** 2) - .7 + pump.hip[1] + 32]
}
