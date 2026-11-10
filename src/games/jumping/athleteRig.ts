// Shared athlete rig: the pose type, proportions and limb solvers used by every pose.
import { handGeometry } from './androidHand.ts'
import { FOOT_CONTACT, footPoint, soleContact, toeBend } from './footwork.ts'
import { limbOnBend, limbReach } from './limbPose.ts'
import type { Limb, Point } from './limbPose.ts'

export type Leg = Limb & { footAngle: number; toeAngle: number; footFacing: number; planted: boolean; rear?: number; slideContact?: boolean }
export type AthletePose = {
  hip: Point; waist: Point; shoulder: Point; head: Point; frontArm: Limb; backArm: Limb; frontLeg: Leg; backLeg: Leg
  sideView?: number; backView?: number; headTilt?: number; waterOffset?: Point
  forearmScale?: number; handScale?: number; calfScale?: number; footScale?: number
  /** Cosmetic width perpendicular to each shell's own axis. */
  shellWidth?: number
}
export const TAU = Math.PI * 2
export const HEAD_RADIUS = 6.2
export const UPPER_ARM = 10, FOREARM = 9
/** Thigh and shin, as the leg solvers build them. */
export const THIGH = 15, SHIN = 14.5
export const MIN_KNEE_OPENING = Math.PI / 4
export const clamp = (n: number) => Math.max(0, Math.min(1, n))
export const smooth = (n: number) => { const t = clamp(n); return t * t * (3 - 2 * t) }
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t
export const mixAngle = (a: number, b: number, t: number) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * t
export const mix = (a: Point, b: Point, t: number): Point => [lerp(a[0], b[0], t), lerp(a[1], b[1], t)]
export const add = (a: Point, b: Point): Point => [a[0] + b[0], a[1] + b[1]]

/** Reach targets stay within the limb's length; elbows never flip sides mid-pose. */
export function solve(root: Point, target: Point, upper: number, lower: number, bend: number, minOpening = 0): Limb {
  const dx = target[0] - root[0], dy = target[1] - root[1], actual = Math.hypot(dx, dy)
  const minReach = Math.sqrt(upper * upper + lower * lower - 2 * upper * lower * Math.cos(minOpening))
  const distance = Math.min(upper + lower - .02, Math.max(minReach + .02, actual))
  const ux = actual > .001 ? dx / actual : 0, uy = actual > .001 ? dy / actual : 1
  const along = (upper * upper - lower * lower + distance * distance) / (2 * distance)
  const offset = Math.sqrt(Math.max(0, upper * upper - along * along)) * bend
  return { root, joint: [root[0] + ux * along - uy * offset, root[1] + uy * along + ux * offset],
    end: [root[0] + ux * distance, root[1] + uy * distance] }
}
export function armPose(root: Point, angle: number, bend: number, jointDepth = 0, endDepth = 0): Limb {
  const upper = jointDepth ? Math.sqrt(Math.max(0, UPPER_ARM ** 2 - jointDepth ** 2)) : UPPER_ARM
  const lowerDepth = endDepth - jointDepth
  const lower = lowerDepth ? Math.sqrt(Math.max(0, FOREARM ** 2 - lowerDepth ** 2)) : FOREARM
  const elbow: Point = [root[0] + Math.sin(angle) * upper, root[1] + Math.cos(angle) * upper]
  return { root, joint: elbow, end: [elbow[0] + Math.sin(angle + bend) * lower, elbow[1] + Math.cos(angle + bend) * lower],
    ...(jointDepth || endDepth ? { jointDepth, endDepth } : {}) }
}
/** Retarget a foot without discarding the knee's current bend plane. */
export function solveNear(source: Limb, target: Point, upper: number, lower: number, minOpening = 0): Limb {
  const reach = limbReach(source.root, target, upper, lower, source.endDepth ?? 0, minOpening), { center } = reach
  const preferred = [source.joint[0] - source.root[0] - center[0], source.joint[1] - source.root[1] - center[1], (source.jointDepth ?? 0) - center[2]]
  return { ...source, ...limbOnBend(reach, preferred) }
}
/** Back-view knees bend into the ladder; only a small part of that bend projects sideways. */
export function solveRear(root: Point, target: Point, upper: number, lower: number, side: number, spread: number, reachDepth = 0, sideBend = 0): Limb {
  const dx0 = target[0] - root[0], dy0 = target[1] - root[1], planar = Math.hypot(dx0, dy0)
  if (reachDepth) {
    // The grip is in front of the shoulder in depth. Passing it must not flip the elbow across the body.
    const depth = Math.sqrt(1 - spread * spread)
    const z = Math.min(reachDepth * depth, Math.sqrt(Math.max(0, (upper + lower - .02) ** 2 - planar ** 2)))
    const reach = limbReach(root, target, upper, lower, z), u = reach.axis
    // A continuous basis over the forward hemisphere also handles a wrist directly in front of its shoulder.
    const a = 1 / (1 + u[2]), b = -u[0] * u[1] * a
    const across = [1 - u[0] ** 2 * a, b, -u[0]], down = [b, 1 - u[1] ** 2 * a, -u[1]]
    const perpendicular = across.map((value, i) => value * spread * side + down[i] * depth)
    if (sideBend) {
      // Wall ascents tuck the elbows below the grip in the side-view plane.
      // Rotate the bend plane without shortening either arm segment.
      const planar = [-u[1], u[0], 0]
      for (let i = 0; i < 3; i++) perpendicular[i] = lerp(perpendicular[i], planar[i], sideBend)
      const length = Math.hypot(...perpendicular) || 1
      for (let i = 0; i < 3; i++) perpendicular[i] /= length
    }
    return limbOnBend(reach, perpendicular)
  }
  const solved = solve(root, target, upper, lower, side)
  const dx = solved.end[0] - root[0], dy = solved.end[1] - root[1], distance = Math.hypot(dx, dy)
  const along = (upper * upper - lower * lower + distance * distance) / (2 * distance * distance)
  const center: Point = [root[0] + dx * along, root[1] + dy * along]
  const depth = Math.hypot(solved.joint[0] - center[0], solved.joint[1] - center[1]) * Math.sqrt(1 - spread * spread)
  return { ...solved, joint: mix(center, solved.joint, spread), jointDepth: depth }
}
/** Carry an elbow's bend around a reaching wrist's axis. Use one fixed
 * reference axis for the whole transfer so opposite bends cannot cancel or
 * choose a different half-turn as the wrist passes across the shoulder. */
export function reachingBend(a: Limb, b: Limb, t: number, axis: number[], clearance: number): number[] {
  const dot = (u: number[], v: number[]) => u.reduce((sum, n, i) => sum + n * v[i], 0)
  const cross = (u: number[], v: number[]) => [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]]
  const unit = (v: number[]) => { const length = Math.hypot(...v); return length > 1e-8 ? v.map(n => n / length) : [1, 0, 0] }
  const vector = (limb: Limb) => [limb.end[0] - limb.root[0], limb.end[1] - limb.root[1], limb.endDepth ?? 0]
  const from = vector(a), to = vector(b), fromAxis = unit(from), toAxis = unit(to)
  const reference = unit(from.map((n, i) => (n + to[i]) / 2 + (i === 2 ? clearance : 0)))
  const bend = (limb: Limb, along: number[]) => {
    const upper = [limb.joint[0] - limb.root[0], limb.joint[1] - limb.root[1], limb.jointDepth ?? 0]
    const parallel = dot(upper, along), perpendicular = upper.map((n, i) => n - along[i] * parallel)
    return unit(Math.hypot(...perpendicular) > 1e-8 ? perpendicular : cross(along, Math.abs(along[2]) < .9 ? [0, 0, 1] : [0, 1, 0]))
  }
  const transport = (v: number[], u: number[], w: number[]) => {
    const c = dot(u, w)
    if (c < -1 + 1e-8) return v // A half-turn around this perpendicular leaves it fixed.
    const normal = cross(u, w), once = cross(normal, v), twice = cross(normal, once)
    return unit(v.map((n, i) => n + once[i] + twice[i] / (1 + c)))
  }
  const first = transport(bend(a, fromAxis), fromAxis, reference)
  const last = transport(bend(b, toAxis), toAxis, reference)
  const sin = dot(reference, cross(first, last)), cos = dot(first, last)
  const angle = Math.abs(sin) < 1e-8 && cos < 0 ? Math.PI : Math.atan2(sin, cos)
  const normal = cross(reference, first)
  const around = first.map((n, i) => n * Math.cos(angle * t) + normal[i] * Math.sin(angle * t))
  return transport(around, reference, axis)
}

/** Turn between the ladder and ledge rigs without snapping elbows/knees into a different bend plane. */
export function transferPose(from: AthletePose, to: AthletePose, shift: Point, t: number, offset: Point = [0, 0], reachClearance = 0, turning = false, legClearance = 0,
  transition?: { depth: number; kneeOpening: number; armOpening?: number; legDepth?: number; footTurn?: boolean; stableReach?: boolean }): AthletePose {
  const point = (a: Point, b: Point) => add(mix(add(a, shift), b, t), offset)
  const limb = (a: Limb, b: Limb, upper: number, lower: number, clearance = 0, minOpening = 0, reachDepth?: number): Limb => {
    const root = point(a.root, b.root), target = point(a.end, b.end)
    // A regripping hand passes in front of the shoulder instead of through it.
    let depth = lerp(a.endDepth ?? 0, b.endDepth ?? 0, t) + Math.sin(Math.PI * t) * clearance
    if (reachDepth !== undefined) depth = Math.max(depth, reachDepth)
    const reach = limbReach(root, target, upper, lower, depth, minOpening), { axis, center } = reach
    const preferred = point(a.joint, b.joint)
    const bend = [preferred[0] - root[0] - center[0], preferred[1] - root[1] - center[1], lerp(a.jointDepth ?? 0, b.jointDepth ?? 0, t) - center[2] + (transition?.depth ?? (turning ? Math.sin(Math.PI * t) * 8 : 0))]
    const stableReach = transition?.stableReach && !('footAngle' in a)
    const solved = limbOnBend(reach, stableReach ? reachingBend(a, b, t, axis, clearance) : bend, [-axis[1], axis[0], 0])
    const { end } = solved
    // Every arm transition retains its actual palm at both endpoints,
    // including a contact hand blending into an implicit free-hand pose.
    const hands = !('footAngle' in a), palmA = hands ? handGeometry(a) : undefined, palmB = hands ? handGeometry(b) : undefined
    const hand = palmA && palmB ? add(end, mix([palmA.palm[0] - a.end[0], palmA.palm[1] - a.end[1]],
      [palmB.palm[0] - b.end[0], palmB.palm[1] - b.end[1]], t))
      : undefined
    return { ...solved,
      hand, handAngle: palmA && palmB ? mixAngle(palmA.angle, palmB.angle, t) : mixAngle(a.handAngle ?? 0, b.handAngle ?? 0, t),
      handOpen: hands ? lerp(a.handOpen ?? 0, b.handOpen ?? 0, t) : undefined }
  }
  const leg = (a: Leg, b: Leg): Leg => {
    const turningFoot = transition?.footTurn && a.footFacing !== b.footFacing
    const rear = lerp(a.rear ?? 0, turningFoot ? 1 : b.rear ?? 0, t)
    const facing = turningFoot && rear < .995 ? a.footFacing : b.footFacing
    // Show the shoe through its end view before changing sides. Its pitch is
    // continuous in the rig frame, even when the mechanical facing reverses.
    const angle = transition?.footTurn ? mixAngle(a.footAngle * a.footFacing, b.footAngle * b.footFacing, t) / facing
      : mixAngle(a.footAngle, b.footAngle, t)
    const toe = transition?.footTurn ? lerp(a.toeAngle * a.footFacing, b.toeAngle * b.footFacing, t) / facing
      : lerp(a.toeAngle, b.toeAngle, t)
    return { ...limb(a, b, 15, 14.5, legClearance, transition?.kneeOpening, transition?.legDepth), footAngle: angle,
      toeAngle: toe, footFacing: facing, planted: a.planted && b.planted, rear }
  }
  return { hip: point(from.hip, to.hip), waist: point(from.waist, to.waist), shoulder: point(from.shoulder, to.shoulder), head: point(from.head, to.head),
    frontArm: limb(from.frontArm, to.frontArm, UPPER_ARM, FOREARM, reachClearance, transition?.armOpening),
    backArm: limb(from.backArm, to.backArm, UPPER_ARM, FOREARM, reachClearance, transition?.armOpening),
    frontLeg: leg(from.frontLeg, to.frontLeg), backLeg: leg(from.backLeg, to.backLeg),
    backView: lerp(from.backView ?? 0, to.backView ?? 0, t), headTilt: lerp(from.headTilt ?? 0, to.headTilt ?? 0, t) }
}
function footAngle(limb: Limb, desired: number, ankleFlex = .35): number {
  const neutral = Math.atan2(limb.end[1] - limb.joint[1], limb.end[0] - limb.joint[0]) - Math.PI / 2
  const delta = Math.atan2(Math.sin(desired - neutral), Math.cos(desired - neutral))
  // Flex relative to the shin, keeping the toes clear of the calf during recovery.
  // Keep the result near the requested angle. A shin crossing -PI must not
  // give later contact blends an equivalent angle almost a full turn away.
  return desired + Math.max(-ankleFlex, Math.min(.7, delta)) - delta
}
export function solveLeg(root: Point, target: Point, desired: number, grounded: boolean, planted = false, footFacing = 1, load = Number(grounded), kneeDirection = -1,
  groundY = 0, surfaceAngle = 0, terrainHeight?: (x: number) => number | null, lowStep = 0, ankleFlex = .35, toeCurl = 0): Leg {
  const ankle: Point = [...target]
  // Deep, supported crouches need more knee flexion than an airborne leg.
  // Forcing a nearby foot away from the hip can drive it through the floor;
  // lifting that displaced foot then flips the solver to the other side.
  const kneeOpening = grounded ? Math.PI / 12 : MIN_KNEE_OPENING
  let limb = solve(root, ankle, 15, 14.5, kneeDirection, kneeOpening)
  // A crouch step skims the floor with a level sole. The airborne ankle curl
  // would otherwise rotate the foot upward against the deeply folded shin.
  const swingAngle = () => lerp(desired, footAngle(limb, desired, ankleFlex), grounded ? smooth((groundY - ankle[1] - 2.8) / 3) * (1 - lowStep) : 1)
  let angle = swingAngle()
  const flex = () => {
    const pressure = load * smooth((limb.end[1] - groundY + 10) / 6)
    return (toeBend((angle - surfaceAngle) * footFacing, pressure) + toeCurl) * footFacing
  }
  const clearKnee = () => {
    if (!grounded || !lowStep || !terrainHeight) return limb
    const surface = terrainHeight(limb.joint[0])
    if (surface === null || limb.joint[1] <= surface - 1.8) return limb
    // A low trailing knee can graze an incline. Fold slightly in depth while
    // preserving both bone lengths, the foot contact, and the body posture.
    const dx = limb.end[0] - root[0], dy = limb.end[1] - root[1], length2 = dx * dx + dy * dy
    const along = (15 ** 2 - 14.5 ** 2 + length2) / (2 * length2)
    const center: Point = [root[0] + dx * along, root[1] + dy * along]
    let low = 0, high = 1
    for (let i = 0; i < 10; i++) {
      const t = (low + high) / 2, point = mix(center, limb.joint, t), floor = terrainHeight(point[0])
      if (floor === null || point[1] <= floor - 1.8) low = t
      else high = t
    }
    return { ...limb, joint: mix(center, limb.joint, low),
      jointDepth: Math.hypot(limb.joint[0] - center[0], limb.joint[1] - center[1]) * Math.sqrt(1 - low ** 2) }
  }
  if (planted) return { ...clearKnee(), footAngle: desired, toeAngle: toeBend((desired - surfaceAngle) * footFacing) * footFacing, footFacing, planted }
  if (grounded) for (let i = 0; i < 4; i++) {
    const bottom = terrainHeight ? Math.max(...FOOT_CONTACT.map(point => {
      const sole = footPoint(point, angle * footFacing, flex() * footFacing)
      const surface = terrainHeight(limb.end[0] + sole[0] * footFacing)
      return surface === null ? 0 : limb.end[1] + sole[1] - surface
    })) : limb.end[1] + soleContact(angle * footFacing, flex() * footFacing)[1] - groundY
    if (bottom <= .01) break
    ankle[1] -= bottom
    limb = solve(root, ankle, 15, 14.5, kneeDirection, kneeOpening); angle = swingAngle()
  }
  return { ...clearKnee(), footAngle: angle, toeAngle: flex(), footFacing, planted }
}

export function rotatePose(pose: AthletePose, angle: number, facing: number, pivot: Point = [0, 0], shift: Point = [0, 0]): AthletePose {
  const cos = Math.cos(angle), sin = Math.sin(angle) * facing
  const point = ([x, y]: Point): Point => [pivot[0] + (x - pivot[0]) * cos - (y - pivot[1]) * sin + shift[0],
    pivot[1] + (x - pivot[0]) * sin + (y - pivot[1]) * cos + shift[1]]
  const limb = <T extends Limb>(value: T): T => ({ ...value, root: point(value.root), joint: point(value.joint), end: point(value.end),
    ...(value.hand ? { hand: point(value.hand) } : {}),
    ...(value.handAngle !== undefined ? { handAngle: value.handAngle + angle * facing } : {}) })
  const leg = (value: Leg): Leg => ({ ...limb(value), footAngle: value.footAngle + angle * facing / value.footFacing })
  return { ...pose, hip: point(pose.hip), waist: point(pose.waist), shoulder: point(pose.shoulder), head: point(pose.head),
    frontArm: limb(pose.frontArm), backArm: limb(pose.backArm), frontLeg: leg(pose.frontLeg), backLeg: leg(pose.backLeg),
    headTilt: (pose.headTilt ?? 0) + angle * facing }
}

/** Preserve world orientation when mechanical facing changes. */
export function reflectAthletePose(pose: AthletePose): AthletePose {
  const point = (p: Point): Point => [-p[0], p[1]]
  const limb = <T extends Limb>(part: T): T => ({ ...part, root: point(part.root), joint: point(part.joint), end: point(part.end), hand: part.hand && point(part.hand),
    handAngle: part.handAngle === undefined ? undefined : Math.PI - part.handAngle })
  const leg = (part: Leg): Leg => ({ ...limb(part), footFacing: -part.footFacing,
    footAngle: -part.footAngle, toeAngle: -part.toeAngle })
  return { ...pose, hip: point(pose.hip), waist: point(pose.waist), shoulder: point(pose.shoulder), head: point(pose.head), headTilt: -(pose.headTilt ?? 0),
    frontArm: limb(pose.frontArm), backArm: limb(pose.backArm), frontLeg: leg(pose.frontLeg), backLeg: leg(pose.backLeg) }
}
