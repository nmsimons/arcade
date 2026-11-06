import { gravityAtPoint } from './gravity.ts'
import type { GravityField } from './gravity.ts'
import type { NamedObject } from './objectNames.ts'
import type { CaughtAnimation, Platform, Player } from './characterTypes.ts'
import { TUNING } from './movementTuning.ts'
import { lineBlocked, moveBody, movePoint, nearestBoundary, nearbyBoundary, pointInside, segmentPenetration, ropeBend, polygonIntersects, withTerrainQueries } from './geometry.ts'
import { initRopeSleep, ropeCanSleep, settleRopeSleep } from './ropeSleep.ts'
import { ropeHangOffset, ropePump } from './ropeBodyMotion.ts'
import type { RopeBodyMotion } from './ropeBodyMotion.ts'
import type { SwitchLogic } from './switchPower.ts'

export type Point = [number, number]
export const ROPE_CLEARANCE = 1.5
const ROPE_PUSH_STRENGTH = 268.8
const ROPE_SWING_PUSH_STRENGTH = 360
// Short ropes retain fine contact/grip resolution around anchors and slopes.
// Longer chains use modestly wider spans; terrain corners still add bend joints.
export const ropeSegmentLength = (length: number) => length > 800 ? 12 : 8
export const ropeSegmentCount = (length: number) => Math.ceil(length / ropeSegmentLength(length))
export interface Ladder extends NamedObject { x: number; top: number; bottom: number; platform: number; side: number }
/** An anchor attached to a terrain edge, in that terrain's local coordinates. */
export interface RopeAnchor { platform: number; x: number; y: number }
/** A tied rope's second anchor. It has the first anchor's shape so edits treat both alike. */
export interface RopeEnd { x: number; y: number; anchor?: RopeAnchor }
/**
 * A switch can let go of one anchor of a tied rope. For the rest of the run the
 * rope hangs from the other anchor, like any rope.
 */
export interface RopeRelease { id: string; anchor: 'start' | 'end'; switchLogic?: SwitchLogic; switchReversed?: boolean }
export interface Rope extends NamedObject {
  x: number; y: number; length: number; segments: number; anchor?: RopeAnchor
  /** Tied at both ends: any length beyond the span between the anchors is slack. */
  end?: RopeEnd
  release?: RopeRelease
  rest?: { key: string; points: Point[]; distances?: number[]; bends?: (Point | null)[] }
}
/** Every anchored end of a rope: its first anchor, and a tied rope's second. */
export const ropeEnds = (rope: Rope): { x: number; y: number; anchor?: RopeAnchor }[] => rope.end ? [rope, rope.end] : [rope]
/** The straight distance between a tied rope's anchors; a tied rope is never shorter. */
export const tiedRopeSpan = (rope: Rope) => rope.end ? Math.hypot(rope.end.x - rope.x, rope.end.y - rope.y) : 0
/** Lengthen a tied rope to reach both anchors after one of them moves. */
export function fitTiedRope(rope: Rope) {
  if (rope.end) rope.length = Math.max(rope.length, Math.min(2000, Math.ceil(tiedRopeSpan(rope))))
}
export interface ClimbableWorld { ladders: readonly Ladder[]; ropes: readonly Rope[] }
export const NO_CLIMBABLES: ClimbableWorld = { ladders: [], ropes: [] }
export interface RopeNode { x: number; y: number; oldX: number; oldY: number }
export interface RopeState { definition: Rope; nodes: RopeNode[]; pumpInput: number; bends: (Point | null)[] }
export interface Climbing {
  kind: 'ladder' | 'rope'; index: number; distance: number; time: number; direction: number; swing: number; lean: number; hangBlend: number; swingVelocity: number
  ladder: Ladder | null; rope: RopeState | null
  wall?: { x: number; side: number }
  wallPose?: { x: number; side: number }
  wallBlend?: number
  wallCooldown?: number
  wallContact?: { x: number; side: number; time: number }
  rappelPull?: number
  rappelMotion?: number
  rappelStepHeight?: number
  surfaceSupport?: number
  screenAxis?: number
  screenDirection?: number
  turn?: { angle: number; target: number; grip: number }
  /** On a tied rope, whether Left/Right is carrying the robot along a near-level span. */
  shimmy?: boolean
  /**
   * The robot always hangs from a rope by its arms. This blends its hands from
   * one grip into hand-over-hand travel, seen side-on, while it moves.
   */
  shimmyBlend?: number
  /** World x of the body's place behind the rope while traveling; it glides across as the robot turns. */
  setback?: number
  /** How steep the rope is at the grip, from 0 (level) to 1 (vertical), smoothed; it sets how the body hangs while traveling. */
  ropeVertical?: number
  /** Each hand's hold on the rope while traveling hand over hand. */
  holds?: ArmHold[]
  /** How fast the grip last moved along the rope, in material units per second. */
  travelSpeed?: number
  /** Eases travel up to speed after setting off or turning back, from 0 to 1. */
  travelRamp?: number
  /**
   * Holding Left or Right along a rope, the robot builds from a careful hand over hand, 0, into a
   * swinging run, 1, like an orangutan's: longer reaches, a faster pace and the body swinging from each hand.
   */
  pace?: number
  /** Seconds Left or Right has been held fully while traveling along the rope. */
  runFor?: number
  /** Seconds since the robot last meant to travel along the rope. */
  still?: number
  /** Shimmying back the other way, the robot brakes and turns about before it sets off. */
  turningBack?: boolean
  /** How far the robot has climbed up or down steep rope since taking hold; it paces the body's slow turns on the rope. */
  climbed?: number
  /** Turning about while it climbs on, the body turns its back to the camera: 1 side-on, 0 back-on. */
  pivot?: number
  /** How much the robot is lowering itself down the rope, from 0 to 1, eased; the legs reach down instead of flexing. */
  lowering?: number
  /** Running, the body's pendulum angle from vertical along the arms that bear it, in world terms, and its rate. */
  swingAngle?: { angle: number; velocity: number; legs?: number; legVelocity?: number }
  /** The body's swing beneath the hand that bears its weight: a world offset from its hang below the grip, and its velocity. */
  sway?: { x: number; y: number; vx: number; vy: number }
  bodyMotion?: RopeBodyMotion
  caught: { x: number; y: number; vx: number; vy: number; anim: CaughtAnimation; grounded: boolean; hang?: Player['hang']; crouching?: boolean; crouch?: number; facing?: number; freeFall?: Player['freeFall']; releaseTurn?: Player['releaseTurn']; heldTool?: Player['heldTool'] }
}
const clamp = (v: number, low: number, high: number) => Math.max(low, Math.min(high, v))
export const ease = (v: number) => { const t = clamp(v, 0, 1); return t * t * (3 - 2 * t) }
/**
 * The robot travels every rope by its arms alone. The body hangs from its
 * grip, the climbing distance itself, so it moves steadily while the hands
 * take turns. Each hand holds its point of the rope while the body passes it,
 * until it trails a span behind the grip. Then it lets go and reaches ahead,
 * in the direction of travel, to a span beyond the grip, while the other hand
 * holds. So the trailing hand always moves on, whichever way the robot goes,
 * and on turning back the hand that led becomes the one that reaches past.
 * A hand never slides along the rope: it holds, or it lets go and reaches. At
 * rest the hands gather at the grip one at a time to hang side by side.
 * On a steep rope a hand holds from overhead at full reach down to the waist,
 * whichever way the rope runs; on a level rope from well ahead to well behind,
 * further still when running (see armReachRange).
 */
export interface ArmHold {
  at: number; from: number; reach: number; toward: number
  /** How far the grip travels while this reach completes: a reach from beside the grip is a short one. */
  span?: number
}
export const ARM_HOLD = .6
/** A hand's hold range on the rope, as offsets from the grip along the rope. */
export function armReachRange(c: Climbing): [number, number] {
  // Along a level rope each hand reaches 11 either way, and running, the body swings out under each hand
  // so the arms reach 15.5. Climbing a steep rope a hand reaches from full stretch overhead, 13.5 above
  // the grip, and pulls right down to the hip, 18 below it.
  const steep = c.ropeVertical ?? 1, level = 11 + 4.5 * ease(c.pace ?? 0)
  const above = level + (13.5 - level) * steep, below = level + (18 - level) * steep
  // Along the rope, "above" is the way the rope rises at the grip.
  const a = ropePoint(c.rope!, Math.max(0, c.distance - 6)), b = ropePoint(c.rope!, Math.min(c.rope!.definition.length, c.distance + 6))
  return b[1] >= a[1] ? [-above, below] : [-below, above]
}
/** The share of each hand's stride spent holding the rope: running, a hand soon reaches on. */
export const holdShare = (c: Climbing) => ARM_HOLD - .05 * ease(c.pace ?? 0) * (1 - (c.ropeVertical ?? 1))
/**
 * How fast the grip travels along the rope, in material units per second.
 * Shimmying and climbing alike, the hands keep a steady, unhurried rhythm,
 * changing hands 2.5 to 3 times a second, and the robot goes faster by
 * reaching further: the speed is the rhythm times the stride, each hand's
 * reach shared between the two hands. A slow shimmy goes about 48 a second,
 * and climbing about 74 up and 79 down. A swinging run goes about 70: its
 * rhythm slows a little as the swings grow long, so it stays easy rather than frantic.
 */
export function ropeTravelSpeed(c: Climbing, upward: boolean) {
  const [low, high] = armReachRange(c), steep = c.ropeVertical ?? 1, run = ease(c.pace ?? 0) * (1 - steep)
  const cadence = 2.6 - .1 * run + (upward ? .2 : .4) * steep
  return cadence * (high - low) / (2 * holdShare(c))
}
/** Steps the hands along with the grip's travel this frame, in material units. */
export function stepArmHolds(c: Climbing, travel: number, dt: number) {
  const d = c.distance, dir = Math.sign(travel), [low, high] = armReachRange(c)
  const holds: ArmHold[] = c.holds ??= [0, 1].map(() => ({ at: d, from: d, reach: 1, toward: 0 }))
  // A grip carried far along the rope at once, such as by a turn of gravity, takes hold afresh.
  if (holds.some(h => Math.abs(h.at - d) > 40)) for (const h of holds) Object.assign(h, { at: d, from: d, reach: 1, toward: 0 })
  // Stopping, the hands settle while the body still brakes; turning back, they hold where they are.
  const stopping = !c.direction && !c.turningBack
  c.still = stopping ? (c.still ?? 0) + dt : 0
  c.climbed = (c.climbed ?? 0) + Math.abs(travel) * clamp(((c.ropeVertical ?? 0) - .6) / .3, 0, 1)
  // A reach takes the travel of the rest of a stride, or finishes onto the rope when the robot stops.
  const hold = holdShare(c)
  const reachTravel = (high - low) * (1 - hold) / hold, target = (toward: number) => d + (toward > 0 ? high : toward < 0 ? low : 0)
  // A reach across the whole hold range takes exactly the rest of the stride, so the hands change over
  // with only a brief moment holding together; a shorter reach, such as from beside the grip, is quicker.
  const reachFrom = (h: ArmHold, toward: number) => Object.assign(h, { from: h.at, reach: 0, toward,
    span: clamp(Math.abs(target(toward) - h.at) * reachTravel / (high - low), 4, reachTravel) })
  for (const h of holds) if (h.reach < 1) {
    // Changing direction mid-reach, the hand reaches the new way from where it is.
    if (dir && !stopping && h.toward !== dir) reachFrom(h, dir)
    h.reach = Math.min(1, h.reach + (h.toward ? Math.abs(travel) / (h.span ?? reachTravel) : 0) + (stopping || !dir ? dt / (h.toward ? .5 : .13) : 0))
    h.at = h.from + (target(h.toward) - h.from) * ease(h.reach)
  }
  if (holds.some(h => h.reach < 1)) return
  if (stopping) {
    // Settled, the lower hand lets go and comes up to hang beside the other at the grip.
    const away = holds.filter(h => Math.abs(h.at - d) > .3)
    const lowest = away.reduce<ArmHold | null>((a, h) => !a || climbPoint(c, h.at)[1] > climbPoint(c, a.at)[1] ? h : a, null)
    if (lowest && c.still > .02) reachFrom(lowest, 0)
    return
  }
  if (!dir) return
  // One hand always holds: the trailing hand lets go once it reaches the end of its range, or at once when the hands are together.
  const [trailing] = [...holds].sort((a, b) => (a.at - b.at) * dir)
  const spent = dir > 0 ? trailing.at - d <= low : trailing.at - d >= high
  if (spent || Math.abs(holds[0].at - holds[1].at) < (high - low) * .25) reachFrom(trailing, dir)
}
/** How much of the body's weight a hand bears: all of it while it holds, almost none mid-reach, handing over smoothly. */
export const holdLoad = (h: ArmHold) => h.reach >= 1 ? 1 : 1 - .9 * ease(Math.min(h.reach, 1 - h.reach) / .45)
/** The hand the body hangs from while traveling: the one that took hold most recently, furthest along the way it goes. */
export function hangingHold(c: Climbing): ArmHold | null {
  const dir = Math.sign(c.travelSpeed ?? 0), holding = (c.holds ?? []).filter(h => h.reach >= 1)
  if (!holding.length) return null
  return holding.reduce((a, h) => (h.at - a.at) * dir > 0 ? h : a)
}
/**
 * Running along a rope, the body swings like a pendulum from the hand it hangs
 * by. The pace factor is highest as the grip passes beneath that hand and
 * lowest out at either end of the swing, where the next hand takes hold. It
 * averages 1 over a swing, so the run keeps its speed.
 */
export function ropePendulumPace(c: Climbing) {
  const run = ease(c.pace ?? 0) * (1 - (c.ropeVertical ?? 1)), dir = Math.sign(c.travelSpeed ?? 0)
  const hold = run && dir ? hangingHold(c) : null
  if (!hold) return 1
  // How far the grip has swung past the hand: -1 just after taking hold ahead, 1 as it lets go behind.
  const [low, high] = armReachRange(c), swung = clamp((c.distance - hold.at) * dir / ((high - low) / 2), -1, 1), a = .9 * run
  return (1 + a * (1 - swung * swung)) / (1 + 2 * a / 3)
}
/**
 * The body swings beneath whichever hand bears its weight. While one hand
 * reaches, the other takes the load and the body swings toward it: ahead
 * under the leading hand along a level rope, up toward the high hand
 * climbing, down toward the low hand lowering. Hanging from one hand it
 * dips a little. Once both hands hold, it swings back between them. A damped spring carries the swing, so it lags
 * the hands, overshoots a little and settles. It is presentation only.
 */
const SWAY_SHARE = 1, SWAY_FREQUENCY = 1.5, SWAY_DAMPING = .35, SWAY_LIMIT = 11
export function stepRopeSway(c: Climbing, dt: number) {
  if (!(dt > 0)) return
  const s = c.sway ??= { x: 0, y: 0, vx: 0, vy: 0 }
  if (c.rope) {
    // Moving down the screen at a climbing pace counts as lowering; the legs ease between the two over 0.15 s.
    const slope = climbPoint(c, c.distance + 1)[1] - climbPoint(c, c.distance - 1)[1]
    const lowering = clamp((c.travelSpeed ?? 0) * slope / 2 / 40, 0, 1)
    c.lowering = (c.lowering ?? lowering) + clamp(lowering - (c.lowering ?? lowering), -dt / .15, dt / .15)
  }
  let target: Point = [0, 0]
  if (c.rope && c.holds && !c.wall) {
    // A reaching hand bears almost nothing once it is clear of the rope.
    const load = c.holds.map(holdLoad)
    const support = (c.holds[0].at * load[0] + c.holds[1].at * load[1]) / (load[0] + load[1])
    const grip = climbPoint(c, c.distance), under = climbPoint(c, clamp(c.distance + (support - c.distance) * SWAY_SHARE, 0, c.rope.definition.length))
    // The holding arm pulls the body up toward its hand as the other reaches (see the climbing pose).
    target = [under[0] - grip[0], under[1] - grip[1]]
  }
  // At rest the body soon settles into a still hang.
  const omega = 2 * Math.PI * SWAY_FREQUENCY, damping = 2 * (SWAY_DAMPING + (.8 - SWAY_DAMPING) * (1 - ease(c.shimmyBlend ?? 0))) * omega
  const steps = Math.ceil(dt * 240), h = dt / steps
  for (let i = 0; i < steps; i++) {
    s.vx += (omega * omega * (target[0] - s.x) - damping * s.vx) * h; s.x += s.vx * h
    s.vy += (omega * omega * (target[1] - s.y) - damping * s.vy) * h; s.y += s.vy * h
  }
  const size = Math.hypot(s.x, s.y)
  if (size > SWAY_LIMIT) { s.x *= SWAY_LIMIT / size; s.y *= SWAY_LIMIT / size }
  // Running, the whole body swings like a pendulum along the arm it hangs by: behind a hand just taken
  // hold ahead, beneath it, then out in front of it before the next. It has its own inertia, so it swings
  // through each change of hands instead of snapping to the new arm.
  const swing = c.swingAngle ??= { angle: 0, velocity: 0, legs: 0, legVelocity: 0 }
  const run = ease(c.pace ?? 0) * (1 - (c.ropeVertical ?? 1)) * ease(c.shimmyBlend ?? 0)
  const holder = run && c.rope ? hangingHold(c) : null
  let aim = 0
  if (holder) {
    const grip = climbPoint(c, c.distance), hand = climbPoint(c, holder.at)
    aim = Math.atan2(grip[0] - hand[0], 18) * run
  }
  // The legs swing after the body through nearly the same arc, a beat behind it, so they follow through
  // each catch instead of whipping round as a hand takes hold.
  const spring = 2 * Math.PI * 3, legSpring = 2 * Math.PI * 3.6
  for (let i = 0; i < steps; i++) {
    swing.velocity += (spring * spring * (aim - swing.angle) - 2 * .55 * spring * swing.velocity) * h
    swing.angle = clamp(swing.angle + swing.velocity * h, -.7, .7)
    swing.legVelocity = (swing.legVelocity ?? 0) + (legSpring * legSpring * (swing.angle - (swing.legs ?? 0)) - 2 * .7 * legSpring * (swing.legVelocity ?? 0)) * h
    swing.legs = clamp((swing.legs ?? 0) + swing.legVelocity * h, -.7, .7)
  }
}
/** The highest a hanging grip can go: the traveling hands reach 6 above it, clear of the anchor. */
export const ROPE_TOP_GRIP = 18

export function createRope(definition: Rope): RopeState {
  // An edit can move a tied rope's anchors farther apart than its length; it is then taut.
  if (definition.end && definition.length < tiedRopeSpan(definition)) definition = { ...definition, length: Math.min(2000, Math.ceil(tiedRopeSpan(definition))) }
  const segments = ropeSegmentCount(definition.length), spacing = ropeSegmentLength(definition.length)
  if (definition.segments !== segments) {
    definition = { ...definition, segments }
    delete definition.rest
  }
  const end = definition.end
  const rope = { definition, pumpInput: 0, bends: definition.rest?.bends?.map(p => p ? [...p] as Point : null) ?? Array.from({ length: segments }, () => null), nodes: Array.from({ length: definition.segments + 1 }, (_, i) => {
    // A tied rope starts along the straight span between its anchors and sags from there.
    const [x, y] = definition.rest?.points[i] ?? (end ? [definition.x + (end.x - definition.x) * i / definition.segments, definition.y + (end.y - definition.y) * i / definition.segments]
      : [definition.x, definition.y + Math.min(definition.length, i * spacing)])
    return { x, y, oldX: x, oldY: y }
  }) }
  initRopeSleep(rope, !!definition.rest)
  return rope
}

/** Material distance along the rope, including its tangent beyond the free end. */
export function ropePoint(rope: RopeState, distance: number, previous = false): Point {
  const position = ropeCoordinate(rope, distance)
  const index = Math.min(rope.nodes.length - 2, Math.floor(position)), t = position - index
  const a = rope.nodes[index], b = rope.nodes[index + 1]
  const start: Point = previous ? [a.oldX, a.oldY] : [a.x, a.y], end: Point = previous ? [b.oldX, b.oldY] : [b.x, b.y]
  const bend = rope.bends[index]
  if (bend) {
    const first = Math.hypot(bend[0] - start[0], bend[1] - start[1]), second = Math.hypot(end[0] - bend[0], end[1] - bend[1]), travel = t * (first + second)
    if (travel < first) return [start[0] + (bend[0] - start[0]) * travel / first, start[1] + (bend[1] - start[1]) * travel / first]
    const u = (travel - first) / (second || 1)
    return [bend[0] + (end[0] - bend[0]) * u, bend[1] + (end[1] - bend[1]) * u]
  }
  return [start[0] + (end[0] - start[0]) * t, start[1] + (end[1] - start[1]) * t]
}

/** Terrain bends are extra drawing/contact points, not extra material segments. */
export function ropePath(definition: Rope, state?: RopeState): Point[] {
  const points = state?.nodes.map(n => [n.x, n.y] as Point) ?? definition.rest?.points
    ?? (definition.end ? [[definition.x, definition.y], [definition.end.x, definition.end.y]] : [[definition.x, definition.y], [definition.x, definition.y + definition.length]])
  const bends = state?.bends ?? definition.rest?.bends
  return points.flatMap((p, i) => i && bends?.[i - 1] ? [bends[i - 1]!, p] : [p])
}
export function climbPoint(climb: Climbing, distance: number): Point {
  return climb.rope ? ropePoint(climb.rope, distance) : [climb.ladder!.x, climb.ladder!.top + distance]
}
export function climbNormal(climb: Climbing, distance: number): Point {
  const a = climbPoint(climb, distance - 1), b = climbPoint(climb, distance + 1)
  const dx = b[0] - a[0], dy = b[1] - a[1], length = Math.hypot(dx, dy) || 1
  return [dy / length, -dx / length]
}
export function climbBody(climb: Climbing, distance: number, offset: number, facing: number): Point {
  const point = climbPoint(climb, distance), normal = climbNormal(climb, distance)
  return [point[0] - normal[0] * offset * facing, point[1] - normal[1] * offset * facing]
}
/** A support stays at one rung/material point while the opposite limb takes a step. */
export function climbContact(distance: number, offset: number, stride = 28) {
  const position = (distance + offset) / stride, step = Math.floor(position), phase = position - step
  const swing = clamp((phase - .55) / .45, 0, 1)
  return { distance: (step + ease(swing)) * stride, lift: Math.sin(swing * Math.PI), planted: phase <= .55 }
}
/** One powerful stroke skips a rung. The body follows the gripping hands and supporting foot. */
export function climbGait(distance: number, handLimit = Infinity, footLimit = Infinity) {
  const hands = [4, 18].map(offset => ({ ...climbContact(distance, offset), distance: Math.min(handLimit, climbContact(distance, offset).distance) }))
  const feet = [46, 60].map(offset => ({ ...climbContact(distance, offset), distance: Math.min(footLimit, climbContact(distance, offset).distance) }))
  const shoulder = (hands[0].distance + hands[1].distance) / 2 + 4.2
  const hip = Math.max(shoulder + 16.6, Math.max(...feet.map(f => f.distance)) - 32.6)
  // Leave enough rope above a resting grip to clear the anchor's platform edge.
  const grip = Math.min(handLimit, Math.max(18, Math.min(...hands.map(hand => hand.distance))))
  return { hands, feet, grip, shoulder, hip, waist: shoulder + (hip - shoulder) * .6, head: shoulder - 7.3, root: hip + 32 }
}

/** Keep the player/camera under the loaded grip, rather than following the rope's loose tail. */
export function climbRoot(climb: Climbing, facing: number): Point {
  if (climb.turn) {
    const grip = ropePoint(climb.rope!, climb.turn.grip), angle = climb.turn.angle
    const [x, y] = ropeHangOffset(climb, facing)
    return [grip[0] + x * Math.cos(angle) - y * Math.sin(angle), grip[1] + x * Math.sin(angle) + y * Math.cos(angle)]
  }
  const root = freeClimbRoot(climb, facing), weight = rappelWeight(climb)
  if (!weight) return root
  const pose = rappelFrame(climb)
  return [root[0] + (pose.hip[0] - root[0]) * weight, root[1] + (pose.hip[1] + 32 - root[1]) * weight]
}
/** The farthest a grip can travel: just short of a free end, or clear of a tied rope's second anchor. */
export const ropeGripLimit = (definition: Rope) => definition.length - (definition.end ? 12 : 8)

/**
 * Let go of one anchor of a tied rope, for the rest of the run. The rope then
 * hangs from its other anchor like any rope. Releasing the first anchor makes
 * the second the new top: the rope is resampled from that end, with each
 * particle keeping its material point and velocity, and riders keep their grips.
 */
export function releaseRopeAnchor(rope: RopeState, anchor: 'start' | 'end', riders: readonly Climbing[] = []) {
  const before = rope.definition, end = before.end
  if (!end) return
  const definition: Rope = { ...before }
  delete definition.end; delete definition.release; delete definition.rest
  if (anchor === 'start') {
    Object.assign(definition, { x: end.x, y: end.y })
    if (end.anchor) definition.anchor = { ...end.anchor }; else delete definition.anchor
    const length = before.length, spacing = ropeSegmentLength(length)
    const points = rope.nodes.map((_, i) => length - Math.min(length, i * spacing))
    const current = points.map(distance => ropePoint(rope, distance)), previous = points.map(distance => ropePoint(rope, distance, true))
    rope.nodes = current.map(([x, y], i) => ({ x, y, oldX: previous[i][0], oldY: previous[i][1] }))
    rope.bends = rope.bends.map(() => null)
    for (const climb of riders) {
      climb.distance = clamp(length - climb.distance, 12, ropeGripLimit(definition))
      if (climb.turn) climb.turn.grip = length - climb.turn.grip
      if (climb.screenAxis) climb.screenAxis = -climb.screenAxis
      // The hands keep hold of the same points of rope, now measured from the other end.
      for (const hold of climb.holds ?? []) Object.assign(hold, { at: length - hold.at, from: length - hold.from, toward: -hold.toward })
      if (climb.travelSpeed) climb.travelSpeed = -climb.travelSpeed
    }
  }
  for (const climb of riders) { climb.shimmy = false }
  rope.definition = definition
  initRopeSleep(rope)
}

function ropeDistance(rope: RopeState, index: number) {
  return Math.min(rope.definition.length, index * ropeSegmentLength(rope.definition.length))
}
function ropeCoordinate(rope: RopeState, distance: number) {
  const i = Math.min(rope.nodes.length - 2, Math.floor(Math.max(0, distance) / ropeSegmentLength(rope.definition.length)))
  return i + (Math.max(0, distance) - ropeDistance(rope, i)) / (ropeDistance(rope, i + 1) - ropeDistance(rope, i))
}
export function rappelWeight(climb: Climbing) {
  return ease(climb.wallBlend ?? Number(!!climb.wall))
}

/** Anticipate a draped rope's turn onto a slope before the feet leave the wall.
 * The body stays below the hands; following the rope sideways folds it into the rock. */
export function ropeSlopeSupport(climb: Climbing, terrain: readonly Platform[]) {
  if (!climb.rope) return 0
  const above = ropePoint(climb.rope, Math.max(0, climb.distance - 56)), grip = ropePoint(climb.rope, climb.distance)
  const tilt = ease((.9 - (grip[1] - above[1]) / (Math.hypot(grip[0] - above[0], grip[1] - above[1]) || 1)) / .4)
  if (!tilt) return 0
  // Flat ledges already have their own mantle transition. Free swings keep their normal pose and tension.
  return terrain.some(b => {
    const face = nearestBoundary(b, above[0], above[1])
    return face.ny < -.2 && Math.abs(face.nx) > .12 && face.distance < 80
  }) ? tilt : 0
}

function freeClimbRoot(climb: Climbing, facing: number): Point {
  const gait = climbGait(climb.distance, climb.rope?.definition.length, climb.ladder ? climb.ladder.bottom - climb.ladder.top : undefined)
  const root = climbBody(climb, gait.root, 0, facing), hanging = ease(climb.hangBlend)
  if (!climb.rope || !hanging) return root
  // The body hangs from its grip.
  const grip = climbPoint(climb, climb.distance), offset = ropeHangOffset(climb, facing)
  const x = grip[0] + offset[0]
  const y = grip[1] + offset[1]
  return [root[0] + (x - root[0]) * hanging, root[1] + (y - root[1]) * hanging]
}

/** Feed a little rope through the hands when a resting head would catch on the anchor's lip. */
export function settleRopeGrip(climb: Climbing, facing: number, terrain: readonly Platform[], dt: number) {
  if (!climb.rope || climb.direction || climb.wall || rappelWeight(climb) || climb.hangBlend < .99 || Math.abs(climb.lean) > .05) return
  const rope = climb.rope, anchor = rope.definition, root = freeClimbRoot(climb, facing)
  if (climb.distance > 64 || Math.abs(root[0] - anchor.x) > 24) return
  const side = Math.sign(anchor.x - root[0]) || facing, x = anchor.x + side * .25
  const solid = (y: number) => terrain.some(b => pointInside(b, x, y))
  if (!solid(anchor.y + .25)) return // Underside anchors already have headroom.
  let depth = .25
  while (depth < 64 && solid(anchor.y + depth)) depth++
  if (depth >= 64) return // A cliff calls for a supported rappel, not an automatic descent.
  const grip = ropePoint(rope, climb.distance)
  const headroom = root[1] - grip[1] - 62
  // Clear the corner along the rope's arc before gravity carries the body under it.
  const needed = Math.hypot(13, Math.max(0, depth - headroom + .5)) + 1
  if (climb.distance < needed) climb.distance = Math.min(ropeGripLimit(anchor), climb.distance + 60 * dt)
}

/** Feet carry the outward load while the hands feed rope during a controlled descent. */
export function rappelFrame(climb: Climbing) {
  const wall = (climb.wall ?? climb.wallPose)!, s = wall.side, grip = climbPoint(climb, climb.distance)
  const hands: Point[] = [[grip[0], grip[1]], [grip[0], grip[1] + 5]]
  // With the rope farther out, reach back for it rather than stretching the torso.
  const gap = (wall.x - grip[0]) * s, reach = clamp(28 - gap, -10, 10)
  const shoulder: Point = [grip[0] - s * reach, grip[1] + 16]
  const hip: Point = [wall.x - s * 23, grip[1] + 32]
  const pull = ease(climb.rappelPull ?? 0)
  if (pull) {
    // Short, overlapping pulls keep the wrists between the head and upper chest.
    // One hand holds its material point while the other reaches past it.
    const contacts = [8, 18].map(offset => climbContact(climb.distance, offset, 20))
    const reaching = contacts.map(contact => {
      const hand = climbPoint(climb, clamp(contact.distance, 0, climb.rope!.definition.length))
      hand[0] -= s * contact.lift * 1.25
      return hand
    })
    const handX = (reaching[0][0] + reaching[1][0]) / 2
    // The chest stays at least 4 out from the rope, so a wrist pulled down to it never passes through the
    // shoulder, where the elbow would flip over; with the rope far out, the body leans back to it.
    const chest: Point = [handX - s * clamp(26 - (wall.x - handX) * s, 4, 8), (reaching[0][1] + reaching[1][1]) / 2 + 6]
    const pelvis: Point = [wall.x - s * 23, chest[1] + 16]
    for (let axis = 0; axis < 2; axis++) {
      shoulder[axis] += (chest[axis] - shoulder[axis]) * pull
      hip[axis] += (pelvis[axis] - hip[axis]) * pull
      for (let i = 0; i < 2; i++) hands[i][axis] += (reaching[i][axis] - hands[i][axis]) * pull
    }
  }
  // Use world height, not rope travel, so the loaded sole stays on its foothold
  // even while the rope stretches. Alternate a full step with a clear knee tuck.
  const steps = [0, 20].map(offset => {
    const contact = climbContact(climb.rappelStepHeight ?? hip[1], 20 + offset, 40)
    const moving = ease(climb.rappelMotion ?? Math.abs(climb.direction))
    return { ...contact, distance: contact.distance - offset, lift: contact.lift * moving, planted: contact.planted || moving === 0 }
  })
  const feet: Point[] = steps.map(step => [wall.x - s * (3 + step.lift * 7), step.distance])
  const waist: Point = [shoulder[0] + (hip[0] - shoulder[0]) * .6, shoulder[1] + (hip[1] - shoulder[1]) * .6]
  return { shoulder, hip, waist, head: [shoulder[0] - s * 2, shoulder[1] - 7.3] as Point, hands, feet, steps }
}
export function updateRopeWall(climb: Climbing, terrain: readonly Platform[], move = 0, position: Point = [climb.caught.x, climb.caught.y]) {
  if (!climb.rope) return
  const grip = climbPoint(climb, climb.distance), old = climb.wall
  climb.wall = undefined
  if (climb.wallCooldown) return
  // The swinging feet can touch a cliff before either the rope or the torso does.
  const root = freeClimbRoot(climb, 1), pump = ropePump(climb, undefined, 1, false)
  const swingFeet = [pump.frontFoot, pump.backFoot].map(foot => [root[0] + foot[0], root[1] - 32 + foot[1]])
  for (const b of terrain) {
    const face = nearestBoundary(b, grip[0], grip[1] + 35)
    if (face.distance > 40 || Math.abs(face.ny) > .12) continue
    const side = -Math.sign(face.nx)
    if (move * side < -.1) continue
    const footContact = climb.hangBlend > .5 && climb.lean * side > .1 && swingFeet.some(foot =>
      (face.x - foot[0]) * side < 7 && pointInside(b, face.x + side * .1, foot[1]))
    const climbingBrace = climb.direction !== 0 && move * side > .1 && face.distance < 28
    if (face.distance > (old ? 36 : 16) && !footContact && !climbingBrace) continue
    // Feet can resist compression, but cannot pull the body toward a wall.
    // An unloaded rope touching the face can establish its first foothold.
    // Up the rope is toward its first anchor, or on a tied rope toward whichever end is higher, such as an
    // end tied partway up this wall.
    const length = climb.rope.definition.length, back = climbPoint(climb, Math.max(0, climb.distance - 120))
    const on = climb.rope.definition.end ? climbPoint(climb, Math.min(length, climb.distance + 120)) : back
    const above = on[1] < back[1] ? on : back
    // A supported body's weight acts at the hips, which can be outside the grip.
    const loadX = old || footContact || climbingBrace ? face.x - side * 23 : grip[0]
    const inward = (above[0] - loadX) * side
    const previous = ropePoint(climb.rope, climb.distance, true)
    const touching = face.distance <= 14 && (grip[0] - previous[0]) * side > .01
    const pressed = climb.wallContact && climb.wallContact.side === side && Math.abs(climb.wallContact.x - face.x) < .1
    // Keep a climbing foothold through small tension changes and a rope bowing out from the face, until
    // carried well away from it.
    const stepping = old && climb.direction !== 0 && face.distance < 22
    if (inward < (old ? -.5 : .15) && face.distance > 4 && !touching && !pressed && !stepping) continue
    // A platform's short side near the hands is not a wall beneath the feet.
    const feet = rappelFrame({ ...climb, wall: { x: face.x, side } }).feet
    if (!feet.every(foot => terrain.some(wall => pointInside(wall, face.x + side * .1, foot[1])))) continue
    // Never transfer through the wall, but a catch through an opening may have
    // started on its other side. Once the body clears it, allow the feet to brace.
    if (!old && (face.x - position[0]) * side < 0) continue
    climb.wall = { x: face.x, side }; break
  }
}

export { ropePump } from './ropeBodyMotion.ts'

/** The material point carrying the body, independent of the animated body root. */
export function ropeGripDistance(climb: Climbing) {
  return climb.turn ? climb.turn.grip : climb.distance
}

/** Coarse distance bounds carry tension through long spans without making slack
 * rope rigid. These bounds follow from the sum of the local segment lengths.
 */
function solveRopeTension(rope: RopeState, count: number, weights: number[], strength: number) {
  const { nodes } = rope
  // Share each correction with the local contact sweeps instead of snapping a
  // whole span taut before the feet and body have resolved their terrain contact.
  strength *= .5
  // Every possible grip has the same maximum reach from the fixed anchor, not
  // just the endpoints of the coarse groups. This also keeps regrips continuous.
  for (let i = 8; i <= count; i++) {
    const node = nodes[i], dx = node.x - nodes[0].x, dy = node.y - nodes[0].y
    const squared = dx * dx + dy * dy, length = ropeDistance(rope, i)
    if (squared <= length * length) continue
    const actual = Math.sqrt(squared)
    const correction = strength * (actual - length) / actual
    node.x -= dx * correction; node.y -= dy * correction
  }
  const tied = rope.definition.end
  if (tied) for (let i = 0; i <= count - 8; i++) {
    const node = nodes[i], dx = node.x - tied.x, dy = node.y - tied.y
    const squared = dx * dx + dy * dy, length = ropeDistance(rope, count) - ropeDistance(rope, i)
    if (squared <= length * length || !weights[i]) continue
    const actual = Math.sqrt(squared)
    const correction = strength * (actual - length) / actual
    node.x -= dx * correction; node.y -= dy * correction
  }
  // The local sweeps already resolve small groups; join those groups here.
  for (let stride = 2 ** Math.ceil(Math.log2(count)); stride >= 8; stride /= 2) {
    for (let start = 0; start < count; start += stride) {
      const end = Math.min(count, start + stride), a = nodes[start], b = nodes[end]
      if (end - start < 8) continue
      // A span between a tied rope's two anchors has nothing free to correct.
      if (!(weights[start] + weights[end])) continue
      const dx = b.x - a.x, dy = b.y - a.y, squared = dx * dx + dy * dy
      const length = ropeDistance(rope, end) - ropeDistance(rope, start)
      if (squared <= length * length) continue
      const actual = Math.sqrt(squared)
      const correction = strength * (actual - length) / actual / (weights[start] + weights[end])
      a.x += dx * correction * weights[start]; a.y += dy * correction * weights[start]
      b.x -= dx * correction * weights[end]; b.y -= dy * correction * weights[end]
    }
  }
}

function ropeIsClear(rope: RopeState, terrain: readonly Platform[]) {
  if (!terrain.length) return true
  return rope.nodes.slice(1).every((b, i) => {
    const a: Point = [rope.nodes[i].x, rope.nodes[i].y], end: Point = [b.x, b.y], bend = rope.bends[i]
    return bend ? !lineBlocked(a, bend, terrain) && !lineBlocked(bend, end, terrain) : !lineBlocked(a, end, terrain)
  })
}

/** A fixed pin cannot acquire more clearance than the surrounding solid gives it. */
function pinClearances(terrain: readonly Platform[], x: number, y: number) {
  const clearances = new Map<Platform, number>()
  for (const b of terrain) if (x >= b.x - ROPE_CLEARANCE && x <= b.x + b.w + ROPE_CLEARANCE
    && y >= b.y - ROPE_CLEARANCE && y <= b.y + b.h + ROPE_CLEARANCE) {
    clearances.set(b, pointInside(b, x, y) ? 0 : Math.min(ROPE_CLEARANCE, nearestBoundary(b, x, y).distance))
  }
  return clearances
}

/** Verlet particles, distance constraints, an anchored top (and a tied rope's anchored end) and a heavier loaded grip. */
const ropeGravityRevisions = new WeakMap<RopeState, number>()

export function stepRope(...args: Parameters<typeof solveRope>) {
  // Terrain stays fixed throughout the synchronous constraint sweeps. Share its
  // validated outlines and spatial queries across every particle and contact.
  withTerrainQueries(() => solveRope(...args))
}

function solveRope(rope: RopeState, dt: number, platforms: readonly Platform[], load: { distance: number; move: number; wall?: Climbing['wall']; bracing?: number;
  body?: { climb: Climbing; from: Point; facing: number; platforms?: readonly Platform[] }; gravity?: number } | null, gravityField?: GravityField, frameDirection = 1) {
  const { nodes, definition } = rope, end = definition.end, last = nodes.length - 1
  if (gravityField && (gravityField.strips.length || ropeGravityRevisions.has(rope)) && ropeGravityRevisions.get(rope) !== gravityField.revision) {
    ropeGravityRevisions.set(rope, gravityField.revision)
    initRopeSleep(rope)
  }
  const gravity = (x: number, y: number) => frameDirection * (gravityField ? gravityAtPoint(gravityField, x, y * frameDirection, 1400) : 1400)
  // Only geometry near the rope's current sweep can touch it this step. The
  // anchor's full reach pulled most of a tall level into every solver pass.
  let left = definition.x, right = definition.x, top = definition.y, bottom = definition.y
  for (const n of nodes) {
    const x = n.x + (n.x - n.oldX), y = n.y + (n.y - n.oldY) + gravity(n.x, n.y) * dt * dt
    left = Math.min(left, n.x, x); right = Math.max(right, n.x, x)
    top = Math.min(top, n.y, y); bottom = Math.max(bottom, n.y, y)
  }
  if (load?.body) {
    const [x, y] = load.body.from
    left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y - 62); bottom = Math.max(bottom, y)
  }
  // A wide concave outline can enclose several empty pits in its bounds. Test
  // the actual solid against the same padded sweep before retaining it for
  // every particle/contact pass. Free swings still simulate, even offscreen.
  const sweepBounds: Point[] = [[left - 96, top - 96], [right + 96, top - 96], [right + 96, bottom + 96], [left - 96, bottom + 96]]
  const nearby = platforms.filter(b => b.x < right + 96 && b.x + b.w > left - 96 && b.y < bottom + 96 && b.y + b.h > top - 96
    && (!(b.polygon || b.profile) || polygonIntersects(sweepBounds, b)))
  if (ropeCanSleep(rope, nearby, !!load)) return
  // Every pass tests every particle against these padded boxes and almost all
  // tests miss. Terrain shapes vary, so reading the boxes from flat numbers is
  // much faster than from the platforms; the bounds are the same expressions.
  const contactBounds = new Float64Array(nearby.length * 4)
  nearby.forEach((b, k) => contactBounds.set([b.x - ROPE_CLEARANCE, b.x + b.w + ROPE_CLEARANCE, b.y - ROPE_CLEARANCE, b.y + b.h + ROPE_CLEARANCE], 4 * k))
  const playerTerrain = load?.body?.platforms
  const bodyTerrain = playerTerrain ? nearby.filter(b => playerTerrain.includes(b)) : nearby
  const before = nodes.map(node => [node.x, node.y] as Point), previousBends = rope.bends.slice()
  const wasClear = ropeIsClear(rope, nearby)
  // Near a pin, enforcing the full clearance through an almost zero contact
  // weight can throw the first free particle thousands of units away.
  const startClearances = pinClearances(nearby, definition.x, definition.y)
  const endClearances = end ? pinClearances(nearby, end.x, end.y) : null
  // A tied rope's last particle is pinned like its first; nothing moves it.
  const free = end ? last : nodes.length
  const lengths = nodes.slice(1).map((_, i) => ropeDistance(rope, i + 1) - ropeDistance(rope, i))
  let loadDistance = load?.distance ?? 0
  if (load?.body) loadDistance = ropeGripDistance(load.body.climb)
  const loadedAt = load ? clamp(ropeCoordinate(rope, loadDistance), 1, free - 1) : -2
  const loaded = Math.round(loadedAt)
  // Rope mass scales with segment length; the player's mass does not. Sharing
  // that load between adjacent points also avoids a jerk when a grip crosses one.
  const bodyMass = 160 / ropeSegmentLength(definition.length)
  const supports = nodes.map((_, i) => load ? Math.max(0, 1 - Math.abs(i - loadedAt)) : 0)
  const weights = supports.map((support, i) => i === 0 || i >= free ? 0 : 1 / (1 + bodyMass * support))
  const climb = load?.body?.climb
  const freeSwing = !!load && !load.wall && (!climb || !climb.direction && climb.hangBlend > .9
    && (climb.surfaceSupport ?? 0) < .01 && (climb.wallBlend ?? 0) < .05)
  // Scrambling against rock dissipates motion; it must not store a spring impulse for the next regrip.
  // A rider coasts more freely; unoccupied ropes keep their resting/sleeping drag.
  const damping = Math.exp(-((freeSwing ? .06 : .12) + (climb?.surfaceSupport ?? 0) * 12) * dt)
  if (load?.body?.climb.wallContact) {
    const c = load.body.climb
    c.wallContact!.time -= dt
    if (c.wallContact!.time <= 0) c.wallContact = undefined
  }
  const move = clamp(load?.move ?? 0, -1, 1)
  let pumpX = 0, pumpY = 0
  if (loaded > 0) {
    const grip = nodes[loaded], rx = grip.x - definition.x, ry = grip.y - definition.y
    const radius = Math.hypot(rx, ry) || lengths[0], side = Math.sign(ry) || 1, tx = Math.abs(ry) / radius, ty = -rx * side / radius
    // A weight shift supplies a small, finite impulse. Holding the stick does not
    // act like a motor; building a swing requires another well-timed shift.
    const shift = Math.sign(move - rope.pumpInput) === Math.sign(move) ? move - rope.pumpInput : 0
    // Help a new or correctly timed swing without making a counter-shift
    // erase the momentum already carried by the rope.
    const travel = (grip.x - grip.oldX) * tx + (grip.y - grip.oldY) * ty
    const pump = shift * (freeSwing && move * travel >= 0 ? ROPE_SWING_PUSH_STRENGTH : ROPE_PUSH_STRENGTH)
    pumpX = tx * pump * dt; pumpY = ty * pump * dt
  }
  rope.pumpInput = move
  for (let i = 1; i < free; i++) {
    const n = nodes[i], dx = (n.x - n.oldX) * damping, dy = (n.y - n.oldY) * damping
    n.oldX = n.x; n.oldY = n.y
    const pumping = supports[i] * (bodyMass + 1) * weights[i]
    const mass = bodyMass * supports[i], acceleration = load?.gravity === undefined ? gravity(n.x, n.y)
      : (gravity(n.x, n.y) + mass * load.gravity) * weights[i]
    n.x += dx + pumpX * pumping; n.y += dy + acceleration * dt * dt + pumpY * pumping
  }
  // Keep these spans fixed while the hands move; changing a span's endpoint
  // during a regrip would turn accumulated stretch into an artificial impulse.
  const tensionEnd = nodes.length - 1
  const wallGap = load ? 1.5 + (8.5 + Math.sin(load.distance * Math.PI / 22) * 1.5) * (load.bracing ?? 1) : 0
  const wallSupported = load?.wall && (load.wall.x - load.wall.side * wallGap - nodes[loaded].x) * load.wall.side < 0
  const tensionStrength = load?.body ? 1 - Math.max(rappelWeight(load.body.climb), load.body.climb.surfaceSupport ?? 0) : Number(!wallSupported)
  const passes = Math.max(32, Math.ceil(nodes.length / 8) * 8)
  for (let pass = 0; pass < passes; pass++) {
    nodes[0].x = definition.x; nodes[0].y = definition.y
    if (end) { nodes[last].x = nodes[last].oldX = end.x; nodes[last].y = nodes[last].oldY = end.y }
    // A free hang loads the span to the anchor. A wall or slope also supports the
    // body, so let local contacts resolve that load instead of pulling it airborne.
    if (tensionStrength && pass < 32 && pass % 2 === 0) solveRopeTension(rope, tensionEnd, weights, tensionStrength)
    for (let j = 1; j < nodes.length; j++) {
      const i = pass % 2 ? nodes.length - j : j, a = nodes[i - 1], b = nodes[i]
      const bend = rope.bends[i - 1], wa = weights[i - 1], wb = weights[i]
      if (bend) {
        const ax = bend[0] - a.x, ay = bend[1] - a.y, bx = bend[0] - b.x, by = bend[1] - b.y
        const first = Math.sqrt(ax * ax + ay * ay), second = Math.sqrt(bx * bx + by * by), correction = Math.max(0, first + second - lengths[i - 1]) / (wa + wb)
        a.x += ax / (first || 1) * correction * wa; a.y += ay / (first || 1) * correction * wa
        b.x += bx / (second || 1) * correction * wb; b.y += by / (second || 1) * correction * wb
        continue
      }
      const dx = b.x - a.x, dy = b.y - a.y, squared = dx * dx + dy * dy, length = lengths[i - 1]
      if (squared <= length * length) continue
      const actual = Math.sqrt(squared), correction = (actual - length) / actual / (wa + wb)
      a.x += dx * correction * wa; a.y += dy * correction * wa
      b.x -= dx * correction * wb; b.y -= dy * correction * wb
    }
    if (nearby.length) for (let i = 1; i < free; i++) for (let k = 0; k < nearby.length; k++) {
      const n = nodes[i]
      if (n.x <= contactBounds[4 * k] || n.x >= contactBounds[4 * k + 1] || n.y <= contactBounds[4 * k + 2] || n.y >= contactBounds[4 * k + 3]) continue
      const b = nearby[k], inside = pointInside(b, n.x, n.y)
      const edge = inside ? nearestBoundary(b, n.x, n.y) : nearbyBoundary(b, n.x, n.y, ROPE_CLEARANCE)
      if (!edge) continue
      if (inside) {
        n.x = edge.x + edge.nx * ROPE_CLEARANCE; n.y = edge.y + edge.ny * ROPE_CLEARANCE
      } else if (edge.distance < ROPE_CLEARANCE) {
        const scale = ROPE_CLEARANCE / edge.distance
        n.x = edge.x + (n.x - edge.x) * scale; n.y = edge.y + (n.y - edge.y) * scale
      }
    }
    // Preserve the same bend-release pass when a swing has left all terrain.
    if (pass % 8 === 7 && !nearby.length) rope.bends.fill(null)
    if (pass % 8 === 7 && nearby.length) for (let i = 1; i < nodes.length; i++) {
      const a = nodes[i - 1], b = nodes[i]
      rope.bends[i - 1] = ropeBend([a.x, a.y], [b.x, b.y], nearby, ROPE_CLEARANCE)
      if (rope.bends[i - 1]) continue
      for (const terrain of nearby) {
        const clearance = i === 1 ? startClearances.get(terrain) ?? ROPE_CLEARANCE : i === last && endClearances ? endClearances.get(terrain) ?? ROPE_CLEARANCE : ROPE_CLEARANCE
        const hit = segmentPenetration([a.x, a.y], [b.x, b.y], terrain, clearance)
        if (!hit) continue
        const wa = weights[i - 1], wb = weights[i], denominator = (1 - hit.t) ** 2 * wa + hit.t ** 2 * wb
        if (denominator < 1e-8) continue
        for (const [node, weight] of [[a, (1 - hit.t) * wa / denominator], [b, hit.t * wb / denominator]] as const) {
          const dx = hit.dx * weight, dy = hit.dy * weight, length = Math.hypot(dx, dy)
          if (!length) continue
          // Collision correction is not an impulse. Preserve tangential motion and
          // remove inward velocity without launching a coiled tail off the floor.
          node.x += dx; node.y += dy; node.oldX += dx; node.oldY += dy
          const into = ((node.x - node.oldX) * dx + (node.y - node.oldY) * dy) / length
          if (into < 0) { node.oldX += dx / length * into; node.oldY += dy / length * into }
        }
      }
    }
    if (loaded > 0 && load?.wall) {
      // Wall-supported feet carry an outward load. Only the grip is displaced;
      // the constraint chain above it transmits the tension back to the anchor.
      const n = nodes[loaded], wall = load.wall
      const target = wall.x - wall.side * wallGap
      if ((target - n.x) * wall.side < 0) n.x += (target - n.x) * .45
    }
    if (load?.body && nearby.length) constrainRopeBody(load.body.climb, load.body.from, load.body.facing, bodyTerrain, nearby)
  }
  // Length and body constraints can reintroduce a crossing after contacts.
  // Keep the final movement within the last clear rope configuration.
  if (wasClear && !ropeIsClear(rope, nearby)) {
    const proposed = nodes.map(node => ({ ...node }))
    for (let attempt = 1; attempt <= 8; attempt++) {
      const fraction = attempt < 8 ? 2 ** -attempt : 0
      for (let i = 1; i < nodes.length; i++) {
        const n = nodes[i], a = before[i], b = proposed[i]
        n.x = a[0] + (b.x - a[0]) * fraction; n.y = a[1] + (b.y - a[1]) * fraction
        n.oldX = n.x - (b.x - b.oldX) * fraction; n.oldY = n.y - (b.y - b.oldY) * fraction
      }
      rope.bends = fraction ? nodes.slice(1).map((b, i) => ropeBend([nodes[i].x, nodes[i].y], [b.x, b.y], nearby, ROPE_CLEARANCE)) : previousBends
      if (ropeIsClear(rope, nearby)) break
    }
  }
  settleRopeSleep(rope, nearby, !!load, dt)
}

/** Resolve the rope points that determine the body position, leaving its tail free. */
export function constrainRopeBody(climb: Climbing, from: Point, facing: number, terrain: readonly Platform[], ropeTerrain: readonly Platform[] = terrain) {
  const rope = climb.rope!
  const root = climbRoot(climb, facing), blend = ease(climb.time / .16)
  const target: Point = [climb.caught.x + (root[0] - climb.caught.x) * blend, climb.caught.y + (root[1] - climb.caught.y) * blend]
  const safe = moveBody(from, target, terrain, 62, 1, climb.turn?.angle), dx = safe.x - target[0], dy = safe.y - target[1]
  if (Math.hypot(dx, dy) < 1e-6 || blend < .01) return safe
  for (const { normal, platform } of safe.contacts) if (Math.abs(normal[0]) > .9) {
    const side = -Math.sign(normal[0]), face = nearestBoundary(platform, safe.x + side * 12, safe.y - 35)
    if (Math.abs(face.ny) < .12) climb.wallContact = { x: face.x, side, time: .12 }
  }
  const gait = climbGait(climb.distance, rope.definition.length)
  const hanging = ease(climb.hangBlend), bracing = rappelWeight(climb), pull = ease(climb.rappelPull ?? 0)
  const weights = rope.nodes.map(() => [0, 0])
  const support = (distance: number, x: number, y = x) => {
    const position = ropeCoordinate(rope, distance), index = Math.min(rope.nodes.length - 2, Math.floor(position)), t = position - index
    for (const [i, weight] of [[index, 1 - t], [index + 1, t]]) {
      if (i === 0 || rope.definition.end && i === rope.nodes.length - 1) continue // Terrain anchors never move.
      weights[i][0] += x * weight; weights[i][1] += y * weight
    }
  }
  // Match climbRoot's interpolation: climbing follows the lower grip, hanging
  // follows the hands, and a wall brace fixes the hips horizontally.
  if (climb.turn) support(climb.turn.grip, 1)
  else {
    support(gait.root, (1 - bracing) * (1 - hanging))
    support(climb.distance, (1 - bracing) * hanging)
    support(climb.distance, 0, bracing * (1 - pull))
    for (const offset of [8, 18]) support(clamp(climbContact(climb.distance, offset, 20).distance, 0, rope.definition.length), 0, bracing * pull / 2)
  }
  const norm = [0, 1].map(axis => weights.reduce((sum, weight) => sum + weight[axis] ** 2, 0))
  const before = rope.nodes.map(node => ({ ...node }))
  const bends = rope.bends.slice()
  // The body can move two clear particles to opposite sides of a solid. A
  // correction must keep their connecting spans clear too, or retain the grip.
  for (let attempt = 0; attempt < 5; attempt++) {
    const fraction = attempt < 4 ? 2 ** -attempt : 0
    for (let i = 1; i < rope.nodes.length; i++) {
      const [wx, wy] = weights[i], weight = Math.min(1, Math.max(Math.abs(wx), Math.abs(wy)))
      if (!weight) continue
      const node = rope.nodes[i]
      Object.assign(node, before[i])
      let vx = node.x - node.oldX, vy = node.y - node.oldY
      for (const { normal } of safe.contacts) {
        const into = vx * normal[0] + vy * normal[1]
        if (into < 0) { vx -= into * normal[0] * weight; vy -= into * normal[1] * weight }
      }
      const corrected = movePoint([node.x, node.y], [node.x + dx * wx / Math.max(norm[0], 1e-8) / blend * fraction,
        node.y + dy * wy / Math.max(norm[1], 1e-8) / blend * fraction], ropeTerrain, ROPE_CLEARANCE)
      node.x = corrected.x; node.y = corrected.y
      node.oldX = node.x - vx; node.oldY = node.y - vy
    }
    let blocked = false
    for (let i = 0; i < rope.bends.length; i++) {
      if (!weights[i].some(Boolean) && !weights[i + 1].some(Boolean)) continue
      const a: Point = [rope.nodes[i].x, rope.nodes[i].y], b: Point = [rope.nodes[i + 1].x, rope.nodes[i + 1].y]
      const bend = rope.bends[i] = fraction ? ropeBend(a, b, ropeTerrain, ROPE_CLEARANCE) : bends[i]
      blocked ||= bend ? lineBlocked(a, bend, ropeTerrain) || lineBlocked(bend, b, ropeTerrain) : lineBlocked(a, b, ropeTerrain)
    }
    if (!blocked || !fraction) break
  }
  return safe
}

export function ropeImpulse(rope: RopeState, distance: number, vx: number, vy: number, dt: number) {
  const index = clamp(Math.round(ropeCoordinate(rope, distance)), 1, rope.nodes.length - 1)
  const radius = Math.ceil(28 / ropeSegmentLength(rope.definition.length))
  for (let i = Math.max(1, index - radius); i <= Math.min(rope.nodes.length - (rope.definition.end ? 2 : 1), index + radius); i++) {
    const weight = Math.max(.15, 1 - Math.abs(ropeDistance(rope, i) - ropeDistance(rope, index)) / 44), n = rope.nodes[i]
    n.oldX = n.x - clamp(vx, -600, 600) * dt * weight; n.oldY = n.y - clamp(vy, -400, 400) * dt * weight
  }
}

function caughtPose(p: Player): Climbing['caught'] {
  const { stride, gait, footwork, ragdoll, dryTurn } = p.anim
  return { x: p.x, y: p.y, vx: p.vx, vy: p.vy, anim: { stride, gait, footwork, ragdoll, dryTurn }, grounded: p.grounded, freeFall: p.freeFall,
    ...(p.releaseTurn ? { releaseTurn: structuredClone(p.releaseTurn) } : {}),
    ...(p.heldTool ? { heldTool: structuredClone(p.heldTool) } : {}) }
}

/** Invert the rung gait so catching a ladder preserves the feet's height. */
export function ladderDistance(ladder: Ladder, feetY: number) {
  let low = feetY - ladder.top - 100, high = feetY - ladder.top
  for (let i = 0; i < 28; i++) {
    const mid = (low + high) / 2
    if (climbGait(mid).root < feetY - ladder.top) low = mid; else high = mid
  }
  return (low + high) / 2
}

export function findClimbable(p: Player, world: ClimbableWorld, terrain: readonly Platform[] = []): Climbing | null {
  for (const [index, ladder] of world.ladders.entries()) {
    const center = ladder.x
    if (Math.abs(p.x - center) >= 25 || p.y < ladder.top || p.y > ladder.bottom + 5) continue
    // Joining a foreground passage does not permit a sideways catch through
    // a platform lip. Check the whole body, including head and feet.
    const safe = moveBody([p.x, p.y], [center, p.y], terrain, p.crouching ? TUNING.crouchHeight : TUNING.height)
    if (Math.hypot(safe.x - center, safe.y - p.y) < .01) {
      return { kind: 'ladder', index, distance: ladderDistance(ladder, clamp(p.y, ladder.top, ladder.bottom)),
        time: 0, direction: 0, swing: 0, lean: 0, hangBlend: 0, swingVelocity: 0, ladder, rope: null, caught: caughtPose(p) }
    }
  }
  return findRope(p, terrain)
}

/** Ropes can be caught in flight independently of ladder input. */
export function findRope(p: Player, terrain: readonly Platform[] = [], reach?: { hands: Point[]; shoulder: Point }): Climbing | null {
  let nearest: { rope: RopeState; index: number; distance: number; gap: number } | null = null
  const hands = reach?.hands ?? [[p.x + p.facing * 10, p.y - 56]]
  for (const [index, rope] of (p.ropes ?? []).entries()) for (let j = 0; j < rope.nodes.length - 1; j++) {
    const start = rope.nodes[j], end = rope.nodes[j + 1], bend = rope.bends[j]
    // A hand more than 26 units outside the segment's box is at least that far
    // from every point on it, so it cannot meet the 25-unit grab gap below.
    const left = Math.min(start.x, end.x, bend?.[0] ?? start.x), right = Math.max(start.x, end.x, bend?.[0] ?? start.x)
    const top = Math.min(start.y, end.y, bend?.[1] ?? start.y), bottom = Math.max(start.y, end.y, bend?.[1] ?? start.y)
    if (hands.every(([x, y]) => x < left - 26 || x > right + 26 || y < top - 26 || y > bottom + 26)) continue
    const path: Point[] = [[start.x, start.y], ...(bend ? [bend] : []), [end.x, end.y]]
    const lengths = path.slice(1).map((p, i) => Math.hypot(p[0] - path[i][0], p[1] - path[i][1]))
    const length = lengths.reduce((sum, part) => sum + part, 0) || 1
    for (const [handX, handY] of hands) {
      let travel = 0
      for (let k = 1; k < path.length; k++) {
        const a = path[k - 1], b = path[k], dx = b[0] - a[0], dy = b[1] - a[1]
        const t = clamp(((handX - a[0]) * dx + (handY - a[1]) * dy) / (dx * dx + dy * dy || 1), 0, 1)
        const gap = Math.hypot(handX - a[0] - dx * t, handY - a[1] - dy * t)
        const fraction = (travel + lengths[k - 1] * t) / length
        if (gap < 25 && (!nearest || gap < nearest.gap) && !lineBlocked(reach?.shoulder ?? [p.x, p.y - 44], [a[0] + dx * t, a[1] + dy * t], terrain)) nearest = { rope, index, distance: ropeDistance(rope, j) + fraction * (ropeDistance(rope, j + 1) - ropeDistance(rope, j)), gap }
        travel += lengths[k - 1]
      }
    }
  }
  // A catch goes straight into the arms-only hang.
  return nearest ? { kind: 'rope', index: nearest.index, distance: clamp(nearest.distance, ROPE_TOP_GRIP, ropeGripLimit(nearest.rope.definition)),
    time: 0, direction: 0, swing: 0, lean: 0, hangBlend: 1, swingVelocity: 0, ladder: null, rope: nearest.rope, caught: caughtPose(p) } : null
}
