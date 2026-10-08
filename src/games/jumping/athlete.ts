import { mirrorPlayerState } from './gravityFrame.ts'
import { gaitPose } from './model.ts'
import type { Player } from './model.ts'
import { FOOT_CONTACT, footPoint, sampleStride, soleContact, toeBend } from './footwork.ts'
import { groundAt } from './terrain.ts'
import { nearestBoundary, pointInside, polygonPoints } from './geometry.ts'
import { BACK_GRIP, BACK_WRIST, climbFrame, FRONT_GRIP, FRONT_WRIST, LEDGE_CATCH_TIME, LEDGE_CLIMB_TIME, ROPE_LEDGE_CATCH_TIME } from './ledge.ts'
import { climbBody, climbGait, climbNormal, climbPoint, climbRoot, ropePoint, ropePump, rappelFrame, rappelWeight } from './climbables.ts'
import { keepRopeGrip } from './ropeGravity.ts'
import { stepFootOffsets } from './stepUp.ts'
import { TUNING } from './movementTuning.ts'

type Point = [number, number]
type Limb = { root: Point; joint: Point; end: Point; hand?: Point; handAngle?: number; jointDepth?: number; endDepth?: number }
type Leg = Limb & { footAngle: number; toeAngle: number; footFacing: number; planted: boolean; rear?: number }
export type AthletePose = { hip: Point; waist: Point; shoulder: Point; head: Point; frontArm: Limb; backArm: Limb; frontLeg: Leg; backLeg: Leg; sideView?: number; backView?: number; headTilt?: number; waterOffset?: Point }
const TAU = Math.PI * 2
const HEAD_RADIUS = 6.2
export type AthleteOutline = Pick<CanvasPath, 'moveTo' | 'lineTo' | 'quadraticCurveTo' | 'bezierCurveTo' | 'ellipse' | 'closePath'>
const UPPER_ARM = 10, FOREARM = 9
const MIN_KNEE_OPENING = Math.PI / 4
const clamp = (n: number) => Math.max(0, Math.min(1, n))
const smooth = (n: number) => { const t = clamp(n); return t * t * (3 - 2 * t) }
const lerp = (a: number, b: number, t: number) => a + (b - a) * t
const mix = (a: Point, b: Point, t: number): Point => [lerp(a[0], b[0], t), lerp(a[1], b[1], t)]
const add = (a: Point, b: Point): Point => [a[0] + b[0], a[1] + b[1]]

/** Reach targets stay within the limb's length; elbows never flip sides mid-pose. */
function solve(root: Point, target: Point, upper: number, lower: number, bend: number, minOpening = 0): Limb {
  const dx = target[0] - root[0], dy = target[1] - root[1], actual = Math.hypot(dx, dy)
  const minReach = Math.sqrt(upper * upper + lower * lower - 2 * upper * lower * Math.cos(minOpening))
  const distance = Math.min(upper + lower - .02, Math.max(minReach + .02, actual))
  const ux = actual > .001 ? dx / actual : 0, uy = actual > .001 ? dy / actual : 1
  const along = (upper * upper - lower * lower + distance * distance) / (2 * distance)
  const offset = Math.sqrt(Math.max(0, upper * upper - along * along)) * bend
  return { root, joint: [root[0] + ux * along - uy * offset, root[1] + uy * along + ux * offset],
    end: [root[0] + ux * distance, root[1] + uy * distance] }
}
function armPose(root: Point, angle: number, bend: number): Limb {
  const elbow: Point = [root[0] + Math.sin(angle) * UPPER_ARM, root[1] + Math.cos(angle) * UPPER_ARM]
  return { root, joint: elbow, end: [elbow[0] + Math.sin(angle + bend) * FOREARM, elbow[1] + Math.cos(angle + bend) * FOREARM] }
}
/** Back-view knees bend into the ladder; only a small part of that bend projects sideways. */
function solveRear(root: Point, target: Point, upper: number, lower: number, side: number, spread: number, reachDepth = 0, sideBend = 0): Limb {
  const dx0 = target[0] - root[0], dy0 = target[1] - root[1], planar = Math.hypot(dx0, dy0)
  if (reachDepth) {
    // The grip is in front of the shoulder in depth. Passing it must not flip the elbow across the body.
    const depth = Math.sqrt(1 - spread * spread)
    const z = Math.min(reachDepth * depth, Math.sqrt(Math.max(0, (upper + lower - .02) ** 2 - planar ** 2)))
    const actual = Math.hypot(planar, z), length = Math.max(Math.abs(upper - lower) + .02, Math.min(upper + lower - .02, actual))
    const u = [dx0 / actual, dy0 / actual, z / actual]
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
    const along = (upper * upper - lower * lower + length * length) / (2 * length)
    const height = Math.sqrt(Math.max(0, upper * upper - along * along))
    const joint = u.map((value, i) => value * along + perpendicular[i] * height)
    return { root, end: [root[0] + u[0] * length, root[1] + u[1] * length], joint: [root[0] + joint[0], root[1] + joint[1]], jointDepth: joint[2], endDepth: u[2] * length }
  }
  const solved = solve(root, target, upper, lower, side)
  const dx = solved.end[0] - root[0], dy = solved.end[1] - root[1], distance = Math.hypot(dx, dy)
  const along = (upper * upper - lower * lower + distance * distance) / (2 * distance * distance)
  const center: Point = [root[0] + dx * along, root[1] + dy * along]
  const depth = Math.hypot(solved.joint[0] - center[0], solved.joint[1] - center[1]) * Math.sqrt(1 - spread * spread)
  return { ...solved, joint: mix(center, solved.joint, spread), jointDepth: depth }
}
/** Turn between the ladder and ledge rigs without snapping elbows/knees into a different bend plane. */
function transferPose(from: AthletePose, to: AthletePose, shift: Point, t: number, offset: Point = [0, 0], reachClearance = 0, turning = false, legClearance = 0): AthletePose {
  const point = (a: Point, b: Point) => add(mix(add(a, shift), b, t), offset)
  const limb = (a: Limb, b: Limb, upper: number, lower: number, clearance = 0): Limb => {
    const root = point(a.root, b.root), target = point(a.end, b.end)
    // A regripping hand passes in front of the shoulder instead of through it.
    const vector = [target[0] - root[0], target[1] - root[1], lerp(a.endDepth ?? 0, b.endDepth ?? 0, t) + Math.sin(Math.PI * t) * clearance]
    const actual = Math.hypot(...vector), length = Math.max(Math.abs(upper - lower) + .02, Math.min(upper + lower - .02, actual))
    const axis = actual > .001 ? vector.map(v => v / actual) : [0, 1, 0]
    const along = (upper * upper - lower * lower + length * length) / (2 * length)
    const center = axis.map(v => v * along), preferred = point(a.joint, b.joint)
    const bend = [preferred[0] - root[0] - center[0], preferred[1] - root[1] - center[1], lerp(a.jointDepth ?? 0, b.jointDepth ?? 0, t) - center[2] + (turning ? Math.sin(Math.PI * t) * 8 : 0)]
    const parallel = bend.reduce((sum, v, i) => sum + v * axis[i], 0)
    let perpendicular = bend.map((v, i) => v - axis[i] * parallel)
    if (Math.hypot(...perpendicular) < .001) perpendicular = [-axis[1], axis[0], 0]
    const scale = Math.sqrt(Math.max(0, upper * upper - along * along)) / (Math.hypot(...perpendicular) || 1)
    const joint = center.map((v, i) => v + perpendicular[i] * scale)
    const end: Point = [root[0] + axis[0] * length, root[1] + axis[1] * length]
    const hand = a.hand && b.hand ? add(end, mix([a.hand[0] - a.end[0], a.hand[1] - a.end[1]], [b.hand[0] - b.end[0], b.hand[1] - b.end[1]], t)) : undefined
    return { root, joint: [root[0] + joint[0], root[1] + joint[1]], end, jointDepth: joint[2], endDepth: axis[2] * length,
      hand, handAngle: lerp(a.handAngle ?? 0, b.handAngle ?? 0, t) }
  }
  const leg = (a: Leg, b: Leg): Leg => ({ ...limb(a, b, 15, 14.5, legClearance), footAngle: lerp(a.footAngle, b.footAngle, t),
    toeAngle: lerp(a.toeAngle, b.toeAngle, t), footFacing: b.footFacing, planted: a.planted && b.planted,
    rear: lerp(a.rear ?? 0, b.rear ?? 0, t) })
  return { hip: point(from.hip, to.hip), waist: point(from.waist, to.waist), shoulder: point(from.shoulder, to.shoulder), head: point(from.head, to.head),
    frontArm: limb(from.frontArm, to.frontArm, UPPER_ARM, FOREARM, reachClearance), backArm: limb(from.backArm, to.backArm, UPPER_ARM, FOREARM, reachClearance),
    frontLeg: leg(from.frontLeg, to.frontLeg), backLeg: leg(from.backLeg, to.backLeg),
    backView: lerp(from.backView ?? 0, to.backView ?? 0, t), headTilt: lerp(from.headTilt ?? 0, to.headTilt ?? 0, t) }
}
function fillShape(ctx: CanvasRenderingContext2D, path: Path2D, color: string) {
  ctx.fillStyle = color; ctx.fill(path)
}
function roundPath(center: Point, rx: number, ry = rx, angle = 0): Path2D {
  const path = new Path2D(); path.ellipse(...center, rx, ry, angle, 0, TAU, true); return path
}
function joined(parts: Path2D[]): Path2D {
  // Every contour winds the same way, so intersecting shapes stay solid.
  const path = new Path2D(); for (const part of parts) path.addPath(part); return path
}
/** Simple connected shapes, with just enough taper to keep bent limbs readable. */
function segmentPath(a: Point, b: Point, r0: number, r1: number, belly: number): Path2D {
  const path = new Path2D(); traceSegment(path, a, b, r0, r1, belly); return path
}
function traceSegment(path: AthleteOutline, a: Point, b: Point, r0: number, r1: number, belly: number) {
  const length = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1
  const ux = (b[0] - a[0]) / length, uy = (b[1] - a[1]) / length, nx = -uy, ny = ux
  const side = (t: number, radius: number): Point => [lerp(a[0], b[0], t) + nx * radius, lerp(a[1], b[1], t) + ny * radius]
  const p0 = side(0, r0), p1 = side(1, r1), p2 = side(1, -r1), p3 = side(0, -r0)
  const mid0 = side(.38, belly), mid1 = side(.38, -belly)
  path.moveTo(...p0); path.quadraticCurveTo(...mid0, ...p1)
  path.quadraticCurveTo(b[0] + ux * r1, b[1] + uy * r1, ...p2)
  path.quadraticCurveTo(...mid1, ...p3); path.quadraticCurveTo(a[0] - ux * r0, a[1] - uy * r0, ...p0)
  path.closePath()
}
function footAngle(limb: Limb, desired: number): number {
  const neutral = Math.atan2(limb.end[1] - limb.joint[1], limb.end[0] - limb.joint[0]) - Math.PI / 2
  const delta = Math.atan2(Math.sin(desired - neutral), Math.cos(desired - neutral))
  // Flex relative to the shin, keeping the toes clear of the calf during recovery.
  return neutral + Math.max(-.35, Math.min(.7, delta))
}
function solveLeg(root: Point, target: Point, desired: number, grounded: boolean, planted = false, footFacing = 1, load = Number(grounded), kneeDirection = -1,
  groundY = 0, surfaceAngle = 0, terrainHeight?: (x: number) => number | null, lowStep = 0): Leg {
  const ankle: Point = [...target]
  // Deep, supported crouches need more knee flexion than an airborne leg.
  // Forcing a nearby foot away from the hip can drive it through the floor;
  // lifting that displaced foot then flips the solver to the other side.
  const kneeOpening = grounded ? Math.PI / 12 : MIN_KNEE_OPENING
  let limb = solve(root, ankle, 15, 14.5, kneeDirection, kneeOpening)
  // A crouch step skims the floor with a level sole. The airborne ankle curl
  // would otherwise rotate the foot upward against the deeply folded shin.
  const swingAngle = () => lerp(desired, footAngle(limb, desired), grounded ? smooth((groundY - ankle[1] - 2.8) / 3) * (1 - lowStep) : 1)
  let angle = swingAngle()
  const flex = () => toeBend((angle - surfaceAngle) * footFacing, load * smooth((limb.end[1] - groundY + 10) / 6)) * footFacing
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
function footPath(ankle: Point, angle: number, facing = 1, toeAngle = 0, profile = 1): Path2D {
  const path = new Path2D(); traceFoot(path, ankle, angle, facing, toeAngle, profile); return path
}
function traceFoot(path: AthleteOutline, ankle: Point, angle: number, facing = 1, toeAngle = 0, profile = 1) {
  const at = (x: number, y: number, toe = false): Point => {
    const point = footPoint([x, y], angle * facing, toeAngle * facing, toe)
    return [ankle[0] + point[0] * facing * profile, ankle[1] + point[1]]
  }
  path.moveTo(...at(-1.6, -1.6)); path.lineTo(...at(-2.4, .4))
  path.quadraticCurveTo(...at(-3, 2.5), ...at(-1.8, 2.8)); path.lineTo(...at(2.2, 2.8)); path.lineTo(...at(2.2, -.6))
  path.quadraticCurveTo(...at(1.3, -2), ...at(-1.6, -1.6)); path.closePath()
  path.moveTo(...at(2.2, 2.8, true)); path.lineTo(...at(4.5, 2.8, true))
  path.quadraticCurveTo(...at(6.2, 2.6, true), ...at(6, 1.5, true))
  path.bezierCurveTo(...at(5.6, .2, true), ...at(3.1, .2, true), ...at(2.2, -.6, true)); path.closePath()
}
function drawLeg(ctx: CanvasRenderingContext2D, limb: Leg, color: string) {
  const path = joined([segmentPath(limb.root, limb.joint, 2.2, 1.65, 2.2), roundPath(limb.joint, 1.7),
    segmentPath(limb.joint, limb.end, 1.7, 1.25, 1.8), roundPath(limb.end, 1.3)])
  fillShape(ctx, path, color)
  if (limb.rear) fillShape(ctx, roundPath(add(limb.end, [0, 1]), 2.1 * limb.rear, 1.8), color)
  if ((limb.rear ?? 0) < 1) fillShape(ctx, footPath(limb.end, limb.footAngle, limb.footFacing, limb.toeAngle, 1 - (limb.rear ?? 0)), color)
}
function handGeometry(limb: Limb) {
  const forearmAngle = Math.atan2(limb.end[1] - limb.joint[1], limb.end[0] - limb.joint[0])
  const angle = limb.handAngle ?? forearmAngle
  const palm: Point = limb.hand ?? [limb.end[0] + Math.cos(angle) * 1.4, limb.end[1] + Math.sin(angle) * 1.4]
  return { palm, angle }
}
const handBoundary: Point[] = Array.from({ length: 32 }, (_, i) => [Math.cos(i * TAU / 32) * 2.1, Math.sin(i * TAU / 32) * 1.6])
/** Share the drawn palm's full silhouette with water clearance and checks. */
export function handOutline(limb: Limb): Point[] {
  const { palm, angle } = handGeometry(limb), cos = Math.cos(angle), sin = Math.sin(angle)
  return handBoundary.map(([x, y]) => [palm[0] + x * cos - y * sin, palm[1] + x * sin + y * cos])
}
function drawArm(ctx: CanvasRenderingContext2D, limb: Limb, color: string) {
  const { palm, angle } = handGeometry(limb)
  const path = joined([roundPath(limb.root, 1.65), segmentPath(limb.root, limb.joint, 1.6, 1.35, 1.6), roundPath(limb.joint, 1.4),
    segmentPath(limb.joint, limb.end, 1.4, 1.05, 1.45), roundPath(palm, 2.1, 1.6, angle)])
  fillShape(ctx, path, color)
}
function drawTorso(ctx: CanvasRenderingContext2D, hip: Point, waist: Point, shoulder: Point, color: string) {
  ctx.beginPath(); traceTorso(ctx, hip, waist, shoulder); ctx.fillStyle = color; ctx.fill()
}
function traceTorso(ctx: AthleteOutline, hip: Point, waist: Point, shoulder: Point) {
  // A single bean-shaped body, like a clean animation construction drawing.
  const at = (p: Point, x: number, y = 0): Point => {
    const a = p === hip ? waist : shoulder, b = p === shoulder ? waist : hip
    const dx = b[0] - a[0], dy = b[1] - a[1], length = Math.hypot(dx, dy) || 1
    return [p[0] + (dy * x + dx * y) / length, p[1] + (dy * y - dx * x) / length]
  }
  ctx.moveTo(...at(shoulder, -1.2, -.7))
  ctx.bezierCurveTo(...at(shoulder, -2.2, 2), ...at(waist, -2.3, -3), ...at(waist, -2.6))
  ctx.bezierCurveTo(...at(hip, -3.3, -3), ...at(hip, -3.6, -1), ...at(hip, -3, 1.5))
  ctx.quadraticCurveTo(...at(hip, -.5, 4), ...at(hip, 2.4, 1.8))
  ctx.bezierCurveTo(...at(hip, 4.8, -1.5), ...at(waist, 4.6, 2), ...at(waist, 3.2, -1))
  ctx.quadraticCurveTo(...at(shoulder, 2.5, 4), ...at(shoulder, 1.4, -.7))
  ctx.closePath()
}
function drawHead(ctx: CanvasRenderingContext2D, head: Point, color: string) {
  ctx.beginPath(); ctx.ellipse(head[0], head[1], HEAD_RADIUS, HEAD_RADIUS, 0, 0, TAU)
  ctx.fillStyle = color; ctx.fill()
}
function neckPoints(shoulder: Point, head: Point, tilt = 0): [Point, Point] {
  const sin = Math.sin(tilt), cos = Math.cos(tilt)
  return [[shoulder[0] + sin, shoulder[1] - cos], [head[0] - sin * 4, head[1] + cos * 4]]
}
function drawBack(ctx: CanvasRenderingContext2D, hip: Point, waist: Point, shoulder: Point, color: string, turn: number, facing = 1) {
  ctx.beginPath(); traceBack(ctx, hip, waist, shoulder, turn, facing); ctx.fillStyle = color; ctx.fill()
}
function traceBack(ctx: AthleteOutline, hip: Point, waist: Point, shoulder: Point, turn: number, facing = 1) {
  const width = lerp(1.6, 4.5, turn), hips = lerp(3.2, 4.9, turn), waistWidth = lerp(3.2, 5, turn)
  // Width follows the spine's normal. Screen-horizontal offsets collapse a bent torso into a strip.
  const at = (p: Point, x: number, y = 0): Point => {
    const a = p === hip ? waist : shoulder, b = p === shoulder ? waist : hip
    const dx = b[0] - a[0], dy = b[1] - a[1], length = Math.hypot(dx, dy) || 1
    return [p[0] + (dy * x + dx * y) / length, p[1] + (dy * y - dx * x) / length]
  }
  // Keep the same rounded lower abdomen as the standing figure as the body turns into profile.
  // The back joins the outer thighs in one continuous contour, without separate hip bumps.
  const belly = 1.8 * (1 - turn), left = facing < 0 ? belly : 0, right = facing > 0 ? belly : 0
  ctx.moveTo(...at(shoulder, -width))
  ctx.quadraticCurveTo(...at(shoulder, -waistWidth, 6), ...at(waist, -waistWidth - left * .35))
  ctx.bezierCurveTo(...at(waist, -waistWidth - left, 2), ...at(hip, -hips - left, -1), ...at(hip, -hips, 1))
  ctx.quadraticCurveTo(...at(hip, 0, 4), ...at(hip, hips, 1))
  ctx.bezierCurveTo(...at(hip, hips + right, -1), ...at(waist, waistWidth + right, 2), ...at(waist, waistWidth + right * .35))
  ctx.quadraticCurveTo(...at(shoulder, waistWidth, 6), ...at(shoulder, width))
  ctx.quadraticCurveTo(...at(shoulder, 0, -2), ...at(shoulder, -width)); ctx.closePath()
}

/** Trace the same skin and current pose for lighting, without altering the rig or artwork. */
export function traceAthlete(path: AthleteOutline, p: Player) {
  const pose = athletePose(p), { hip, waist, shoulder, head, backView = 0 } = pose
  const round = (center: Point, rx: number, ry = rx, angle = 0) => {
    path.ellipse(...center, rx, ry, angle, 0, TAU, true); path.closePath()
  }
  for (const leg of [pose.backLeg, pose.frontLeg]) {
    traceSegment(path, leg.root, leg.joint, 2.2, 1.65, 2.2); round(leg.joint, 1.7)
    traceSegment(path, leg.joint, leg.end, 1.7, 1.25, 1.8); round(leg.end, 1.3)
    if (leg.rear) round(add(leg.end, [0, 1]), 2.1 * leg.rear, 1.8)
    if ((leg.rear ?? 0) < 1) traceFoot(path, leg.end, leg.footAngle, leg.footFacing, leg.toeAngle, 1 - (leg.rear ?? 0))
  }
  for (const arm of [pose.backArm, pose.frontArm]) {
    const angle = arm.handAngle ?? Math.atan2(arm.end[1] - arm.joint[1], arm.end[0] - arm.joint[0])
    const palm: Point = arm.hand ?? [arm.end[0] + Math.cos(angle) * 1.4, arm.end[1] + Math.sin(angle) * 1.4]
    round(arm.root, 1.65); traceSegment(path, arm.root, arm.joint, 1.6, 1.35, 1.6); round(arm.joint, 1.4)
    traceSegment(path, arm.joint, arm.end, 1.4, 1.05, 1.45); round(palm, 2.1, 1.6, angle)
  }
  if (p.climbing || backView > 0) traceBack(path, hip, waist, shoulder, backView, Math.sign(p.climbing?.lean ?? 0) * p.facing || 1)
  else traceTorso(path, hip, waist, shoulder)
  const [neck, nape] = neckPoints(shoulder, head, pose.headTilt)
  traceSegment(path, neck, nape, 1.15, 1.15, 1.15)
  round(head, HEAD_RADIUS)
}

/** The wrist reaches the corner; the palm rests on top instead of pointing through it. */
function grippingArm(root: Point, wrist: Point, grip: Point, free: Limb, contact: number, lift = 0): Limb {
  const target = solve(root, wrist, UPPER_ARM, FOREARM, 1)
  const angles = (limb: Limb) => {
    const upper = Math.atan2(limb.joint[0] - limb.root[0], limb.joint[1] - limb.root[1])
    const lower = Math.atan2(limb.end[0] - limb.joint[0], limb.end[1] - limb.joint[1])
    return [upper, Math.atan2(Math.sin(lower - upper), Math.cos(lower - upper))]
  }
  const from = angles(free), to = angles(target)
  // Rotate through the reach; folding the elbow lifts a released hand clear of the top.
  const arm = armPose(root, lerp(from[0], to[0], contact), lerp(from[1], to[1], contact) + Math.sin(contact * Math.PI) * lift)
  const angle = Math.atan2(arm.end[1] - arm.joint[1], arm.end[0] - arm.joint[0])
  const freePalm: Point = [Math.cos(angle) * 1.4, Math.sin(angle) * 1.4]
  const contactPalm: Point = [grip[0] - wrist[0], grip[1] - wrist[1]]
  return { ...arm, hand: add(arm.end, mix(freePalm, contactPalm, contact)), handAngle: angle * (1 - contact) }
}

/** A low step starts in the walking pose: lead with a knee, transfer weight,
 * then bring the trailing foot up. It never passes through the hanging rig. */
function stepUpPose(p: Player): AthletePose {
  const m = p.mantle!, s = m.step!, t = clamp(m.time / s.duration), side = m.side
  const source = athletePose({ ...p, ...s.caught, climbing: s.climbing ?? null, mantle: null, pushing: s.caught.pushing ?? null, landing: 0, groundAngle: 0 })
  if (s.rise > 40.01 && !s.climbing) {
    // A head-height obstacle needs hands and a knee on the lip. Reuse the
    // established pull-up rig, starting above its hanging phase, at step timing.
    const start = (74 - s.rise) / 100
    const target = ledgePose({ ...p, mantle: { ...m, time: lerp(start, 1, t) * LEDGE_CLIMB_TIME } })
    return t < .18 ? transferPose(source, target, [(s.caught.x - p.x) * side, s.caught.y - p.y], smooth(t / .18)) : target
  }
  const weight = Math.sin(Math.PI * t), high = smooth((s.rise - 20) / 20)
  const hip = mix(source.hip, [0, -32.7], smooth(t))
  hip[0] += weight * 2; hip[1] += weight * (2 + high * 5)
  const waist = add(hip, [weight * 2, -6.5])
  const shoulder = add(waist, [weight * (3 + high * 4), -10.1 + weight * high * 2])
  const head = add(shoulder, [.45 + weight, -7.3])
  const foot = (leg: Leg, start: number, end: number, offset: number) => {
    const u = smooth((t - start) / (end - start))
    const fromX = (s.caught.x - m.edgeX) * side + leg.end[0], toX = (m.toX - m.edgeX) * side + offset
    const fromY = s.caught.y + leg.end[1] - m.edgeY
    // The toes clear the riser before moving across its vertical face.
    const crossing = clamp((-7 - fromX) / (toX - fromX))
    const toY = m.toY - m.edgeY + offset * side * Math.tan(s.landingAngle ?? 0) - 2.8
    const y = lerp(fromY, toY, smooth(u / Math.max(.15, crossing))) - Math.sin(Math.PI * u) * 7
    return { ankle: [(m.edgeX - p.x) * side + lerp(fromX, toX, u), m.edgeY - p.y + y] as Point, planted: t >= end || t <= start && leg.planted }
  }
  const offsets = stepFootOffsets(s)
  const [front, back] = [source.frontLeg, source.backLeg].map((leg, i) =>
    foot(leg, i === s.lead ? high * .12 : .12 + high * .1, i === s.lead ? .42 + high * .1 : 1, offsets[i]))
  for (const f of [front, back]) if (f.planted) {
    const dip = Math.max(0, f.ankle[1] - Math.sqrt(Math.max(0, 29 ** 2 - (f.ankle[0] - hip[0]) ** 2)) - hip[1] - 1)
    for (const point of [hip, waist, shoulder, head]) point[1] += dip
  }
  const root = add(hip, [0, 1]), armRoot = add(shoulder, [0, .7])
  const pose: AthletePose = { hip, waist, shoulder, head,
    frontArm: armPose(armRoot, -.03 - weight * .3, .1 + weight * .85),
    backArm: armPose(armRoot, -.03 + weight * .45, .1 + weight * .45),
    frontLeg: solveLeg(root, front.ankle, 0, false, front.planted),
    backLeg: solveLeg(root, back.ankle, 0, false, back.planted) }
  const brace = high * smooth(t / .18) * (1 - smooth((t - .32) / .16))
  const edge: Point = [(m.edgeX - p.x) * side, m.edgeY - p.y]
  pose.frontArm = grippingArm(armRoot, add(edge, FRONT_WRIST), add(edge, FRONT_GRIP), pose.frontArm, brace)
  pose.backArm = grippingArm(armRoot, add(edge, BACK_WRIST), add(edge, BACK_GRIP), pose.backArm, brace)
  // Preserve the exact entry silhouette while the first foot starts lifting.
  const result = t < .18 && !s.climbing ? transferPose(source, pose, [0, 0], smooth(t / .18)) : pose
  if (p.terrain) {
    result.frontLeg = clearRiserLeg(p, clearAirborneFoot(p, result.frontLeg, 16))
    result.backLeg = clearRiserLeg(p, clearAirborneFoot(p, result.backLeg, 16))
  }
  return s.climbing && t < .18 ? transferPose(source, result, [0, 0], smooth(t / .18)) : result
}

/** All supports are authored relative to the corner, independent of the camera and player root. */
function ledgePose(p: Player): AthletePose {
  const descent = p.mantle?.crouched && p.mantle.descending
  if (descent && p.mantle!.time < LEDGE_CATCH_TIME) {
    const caught = descent.caught, turn = (caught.facing ?? p.facing) * p.facing
    const source = athletePose({ ...p, ...caught, mantle: null, hang: null, climbing: null, pushing: null, landing: 0 })
    const mirror = (point: Point): Point => [point[0] * turn, point[1]]
    const limb = <T extends Limb>(part: T): T => ({ ...part, root: mirror(part.root), joint: mirror(part.joint), end: mirror(part.end), hand: part.hand && mirror(part.hand) })
    const from = { ...source, hip: mirror(source.hip), waist: mirror(source.waist), shoulder: mirror(source.shoulder), head: mirror(source.head),
      frontArm: limb(source.frontArm), backArm: limb(source.backArm), frontLeg: limb(source.frontLeg), backLeg: limb(source.backLeg) }
    const target = ledgePose({ ...p, mantle: { ...p.mantle!, time: LEDGE_CATCH_TIME } })
    return transferPose(from, target, [(caught.x - p.x) * p.facing, caught.y - p.y], smooth(p.mantle!.time / LEDGE_CATCH_TIME), [0, 0], 0, turn < 0)
  }
  const catchTime = p.hang?.caught.climbing?.rope ? ROPE_LEDGE_CATCH_TIME : LEDGE_CATCH_TIME
  if (p.hang?.caught.climbing && p.hang.time < catchTime) {
    const h = p.hang, source = athletePose({ ...p, ...h.caught, hang: null, mantle: null, landing: 0 })
    const target = ledgePose({ ...p, hang: { ...h, time: catchTime } })
    const blend = smooth(h.time / catchTime)
    // The body follows the collision-safe outward arc when the rope is directly under the lip.
    const offset: Point = [(p.x - lerp(h.caught.x, h.edgeX - h.side * 14, blend)) * p.facing,
      p.y - lerp(h.caught.y, h.edgeY + 74, blend)]
    return transferPose(source, target, [(h.caught.x - p.x) * p.facing, h.caught.y - p.y], blend, offset, h.caught.climbing?.rope ? 6 : 0)
  }
  const edge = p.mantle ?? p.hang!
  const t = p.mantle ? p.mantle.descending ? 1 - clamp((p.mantle.time - LEDGE_CATCH_TIME) / LEDGE_CLIMB_TIME) : clamp(p.mantle.time / LEDGE_CLIMB_TIME) : 0
  const crouched = !!p.mantle?.crouched, frame = climbFrame(t, edge.braced, edge.slope, crouched, p.mantle?.inset)
  const origin: Point = [(edge.edgeX - p.x) * p.facing, edge.edgeY - p.y]
  const at = (point: Point) => add(origin, point)
  let hip = at(frame.hip), waist = at(frame.waist), shoulder = at(frame.shoulder), head = at(frame.head)
  let frontFoot = at(frame.frontFoot), backFoot = at(frame.backFoot)
  const balance = smooth((t - .48) / .09) * (1 - smooth((t - .8) / .2))
  const relaxed = smooth((t - .8) / .2) * (crouched ? 0 : .24)
  let frontFree = armPose(add(shoulder, [0, .7]), -.03 + balance * 1.1 + relaxed, .1 + balance * 1.1)
  let backFree = armPose(add(shoulder, [0, .7]), -.03 - balance * .8 - relaxed, .1 + balance * 1.7)
  if (crouched) {
    const fold = smooth((t - .73) / .23)
    frontFree = armPose(add(shoulder, [0, .7]), lerp(-.03 + balance * 1.1, -.65, fold), lerp(.1 + balance * 1.1, 2.1, fold))
    backFree = armPose(add(shoulder, [0, .7]), lerp(-.03 - balance * .8, -.75, fold), lerp(.1 + balance * 1.7, 2.2, fold))
  }
  let catchWeight = 1, catchFeet: [Leg, Leg] | null = null
  const catching = p.hang && p.hang.time < LEDGE_CATCH_TIME ? { caught: p.hang.caught, time: p.hang.time }
    : p.mantle?.descending && p.mantle.time < LEDGE_CATCH_TIME ? { caught: p.mantle.descending.caught, time: p.mantle.time } : null
  if (catching) {
    const h = catching, source = athletePose({ ...p, climbing: null, ...h.caught, hang: null, mantle: null, landing: 0 })
    const shift: Point = [(h.caught.x - p.x) * p.facing, h.caught.y - p.y]
    const from = (point: Point) => add(shift, point)
    catchWeight = smooth(h.time / LEDGE_CATCH_TIME)
    catchFeet = [source.frontLeg, source.backLeg]
    hip = mix(from(source.hip), hip, catchWeight); waist = mix(from(source.waist), waist, catchWeight)
    shoulder = mix(from(source.shoulder), shoulder, catchWeight); head = mix(from(source.head), head, catchWeight)
    frontFoot = mix(from(source.frontLeg.end), frontFoot, catchWeight); backFoot = mix(from(source.backLeg.end), backFoot, catchWeight)
    frontFree = { root: add(shoulder, [0, .7]), joint: from(source.frontArm.joint), end: from(source.frontArm.end) }
    backFree = { root: add(shoulder, [0, .7]), joint: from(source.backArm.joint), end: from(source.backArm.end) }
  }
  const root = add(shoulder, [0, .7])
  const grip = (point: Point) => at([point[0], point[1] + Math.max(0, point[0]) * (edge.slope ?? 0)])
  const frontArm = grippingArm(root, grip(FRONT_WRIST), grip(FRONT_GRIP), frontFree, catchWeight * (1 - frame.frontRelease), .9)
  const backArm = grippingArm(root, grip(BACK_WRIST), grip(BACK_GRIP), backFree, catchWeight * (1 - frame.backRelease), .9)
  const legRoot = add(hip, [0, 1])
  const folded = crouched && t > .73 || (p.mantle?.inset ?? 20) < 20 && t > .54
  const frontLeg = solveLeg(legRoot, frontFoot, .15 * (1 - smooth(t / .45)), folded, frame.frontPlanted)
  const backLeg = solveLeg(legRoot, backFoot, .25 * (1 - smooth(t / .65)), folded, frame.backPlanted)
  // Soften ankle flex before contact; the support foot then remains exactly flat.
  const flatten = (leg: Leg, weight: number) => { leg.footAngle = lerp(leg.footAngle, Math.atan(edge.slope ?? 0), weight); leg.toeAngle *= 1 - weight }
  flatten(frontLeg, smooth((t - .86) / .1)); flatten(backLeg, smooth((t - .56) / .07))
  for (const [i, leg] of [frontLeg, backLeg].entries()) {
    if (edge.braced) {
      const release = smooth((t - .04) / .2)
      leg.footAngle = lerp(-Math.PI / 2, leg.footAngle, release); leg.toeAngle *= release
    }
    if (catchFeet) { leg.footAngle = lerp(catchFeet[i].footAngle, leg.footAngle, catchWeight); leg.toeAngle = lerp(catchFeet[i].toeAngle, leg.toeAngle, catchWeight) }
  }
  return { hip, waist, shoulder, head, frontArm, backArm, frontLeg, backLeg }
}
function climbingPose(p: Player): AthletePose {
  const c = p.climbing!, d = c.distance, blend = smooth(c.time / .16)
  if (c.turn) {
    const base = { ...c, turn: undefined, time: .16, hangBlend: 1, wall: undefined, wallBlend: 0, lean: 0, swing: 0 }
    keepRopeGrip(base, c.turn.grip)
    const root = climbRoot(base, p.facing), pivot = ropePoint(c.rope!, c.turn.grip)
    const pose = climbingPose({ ...p, x: root[0], y: root[1], climbing: base })
    return rotatePose(pose, c.turn.angle, p.facing, [(pivot[0] - root[0]) * p.facing, pivot[1] - root[1]],
      [(root[0] - p.x) * p.facing, root[1] - p.y])
  }
  if (c.caught.hang && blend < 1) {
    const source = athletePose({ ...p, ...c.caught, climbing: null, hang: c.caught.hang, mantle: null, ledgeReach: null })
    const target = climbingPose({ ...p, climbing: { ...c, time: .16 } })
    return transferPose(source, target, [(c.caught.x - p.x) * p.facing, c.caught.y - p.y], blend)
  }
  const gait = climbGait(d, c.rope?.definition.length, c.ladder ? c.ladder.bottom - c.ladder.top : undefined)
  const local = (point: Point): Point => [(point[0] - p.x) * p.facing, point[1] - p.y]
  const body = (distance: number, away: number) => local(climbBody(c, distance, away, p.facing))
  const phase = d / 28 * Math.PI * 2, sway = Math.sin(phase) * 1.4
  const bracing = rappelWeight(c)
  const wallFrame = bracing ? rappelFrame(c) : null
  const sideView = lerp(smooth(Math.abs(c.lean) / .65), 1, bracing), facing = lerp(Math.sign(c.lean) * p.facing || 1, 1, bracing)
  const hanging = smooth(c.hangBlend), lean = c.lean * p.facing
  let hip = body(gait.hip, -sway + c.swing * 2 * p.facing)
  let waist = body(gait.waist, -sway * .65 + c.swing * p.facing)
  let shoulder = body(gait.shoulder, sway * .3 + c.swing * .4 * p.facing)
  let head = body(gait.head + Math.sin(phase - .7) * .35, -c.swing * .3 * p.facing)
  const contact = (step: ReturnType<typeof climbGait>['hands'][number], foot: boolean, side: number) => {
    const limit = c.rope?.definition.length ?? Infinity
    const supported = !foot || step.distance <= limit
    const distance = Math.min(step.distance, limit)
    const point = supported ? climbPoint(c, distance) : climbBody(c, gait.hip + (side < 0 ? 29.4 : 27.5), -side * 2, p.facing)
    const normal = climbNormal(c, distance)
    if (supported) {
      const spread = ((c.rope ? foot ? 3 : 1 : 5.5) + step.lift * (foot ? .5 : 1)) * (foot ? 1 : 1 - sideView)
      point[0] += normal[0] * p.facing * side * spread
      point[1] += normal[1] * p.facing * side * spread
      if (foot && !c.rope) point[1] -= 2.8
    }
    return { point: local(point), supported, planted: supported && step.planted,
      angle: c.rope && supported ? -Math.PI / 2 - Math.atan2(normal[1], normal[0]) * p.facing : 0 }
  }
  // Bring the lower hand up beside the supporting hand before hanging from the grip.
  const grip = gait.grip
  const hands = gait.hands.map((hand, i) => contact({ ...hand, distance: lerp(hand.distance, grip, hanging), lift: hand.lift * (1 - hanging) }, false, i ? 1 : -1))
  const feet = [contact(gait.feet[0], true, -1), contact(gait.feet[1], true, 1)]
  if (hanging) {
    const mid = mix(hands[0].point, hands[1].point, .5)
    const out = -lean * 12, spread = 3.9 * blend * (1 - sideView)
    const chest = add(mid, [out, Math.sqrt(18.8 ** 2 - (Math.abs(out) + spread) ** 2) - .7])
    // Reach up and forward to the fixed grip, with the head behind the hands.
    // The pelvis and legs still lead the pump; this offset only changes the silhouette.
    for (let pass = 0; pass < 12; pass++) for (const [i, hand] of hands.entries()) {
      const offset = (i ? 1 : -1) * spread
      const dx = chest[0] + offset - hand.point[0], dy = chest[1] + .7 - hand.point[1], length = Math.hypot(dx, dy)
      if (length > 18.8) { chest[0] = hand.point[0] + dx * 18.8 / length - offset; chest[1] = hand.point[1] + dy * 18.8 / length - .7 }
    }
    const pump = ropePump(c), offset = (point: Point): Point => [point[0] * p.facing, point[1]]
    const pelvis = add(chest, offset(pump.hip))
    hip = mix(hip, pelvis, hanging); waist = mix(waist, add(chest, offset(pump.waist)), hanging)
    shoulder = mix(shoulder, chest, hanging); head = mix(head, add(chest, [lean, -7.3]), hanging)
    feet[0].point = mix(feet[0].point, add(pelvis, offset(pump.frontFoot)), hanging)
    feet[1].point = mix(feet[1].point, add(pelvis, offset(pump.backFoot)), hanging)
  }
  if (wallFrame) {
    const frame = wallFrame
    hip = mix(hip, local(frame.hip), bracing); waist = mix(waist, local(frame.waist), bracing)
    shoulder = mix(shoulder, local(frame.shoulder), bracing); head = mix(head, local(frame.head), bracing)
    for (let i = 0; i < 2; i++) {
      hands[i].point = mix(hands[i].point, local(frame.hands[i]), bracing)
      feet[i].point = mix(feet[i].point, local(frame.feet[i]), bracing)
      feet[i].planted = !!c.wall && frame.steps[i].planted; feet[i].supported = !!c.wall
    }
  }
  let source: AthletePose | null = null
  if (blend < 1) {
    source = athletePose({ ...p, ...c.caught, climbing: null, hang: c.caught.hang ?? null, mantle: null, ledgeReach: null })
    const at = (point: Point): Point => [point[0] + (c.caught.x - p.x) * p.facing, point[1] + c.caught.y - p.y]
    hip = mix(at(source.hip), hip, blend); waist = mix(at(source.waist), waist, blend)
    shoulder = mix(at(source.shoulder), shoulder, blend); head = mix(at(source.head), head, blend)
    hands[0].point = mix(at(source.frontArm.end), hands[0].point, blend); hands[1].point = mix(at(source.backArm.end), hands[1].point, blend)
    feet[0].point = mix(at(source.frontLeg.end), feet[0].point, blend); feet[1].point = mix(at(source.backLeg.end), feet[1].point, blend)
  }
  const arms = hands.map((hand, i) => {
    const side = i ? 1 : -1, root = add(shoulder, [side * 3.9 * blend * (1 - sideView), .7])
    return { ...solveRear(root, hand.point, UPPER_ARM, FOREARM, 1, lerp(side * .6, facing, sideView), 3,
      bracing * smooth(c.rappelPull ?? 0)), hand: hand.point }
  })
  const legs = feet.map((foot, i) => {
    const side = i ? 1 : -1
    const spread = lerp(-side * (foot.supported ? .2 : .1), -facing, sideView)
    const solved = solveRear(add(hip, [side * 2.7 * blend * (1 - sideView), 1]), foot.point, 15, 14.5, 1,
      spread)
    const wallAngle = -Math.PI / 2 + (wallFrame?.steps[i].lift ?? 0) * .4
    const leg: Leg = { ...solved, rear: 1 - sideView, footAngle: lerp(lerp(foot.angle, facing * .12, sideView), wallAngle, bracing), toeAngle: 0,
      footFacing: facing, planted: foot.planted && hanging === 0 }
    if (source) leg.footAngle = lerp(i ? source.backLeg.footAngle : source.frontLeg.footAngle, leg.footAngle, blend)
    return c.rope && p.terrain ? clearClimbingLeg(p, leg, spread) : leg
  })
  return { hip, waist, shoulder, head, frontArm: arms[0], backArm: arms[1], frontLeg: legs[0], backLeg: legs[1], sideView, backView: blend * (1 - sideView) }
}

function rotatePose(pose: AthletePose, angle: number, facing: number, pivot: Point = [0, 0], shift: Point = [0, 0]): AthletePose {
  const cos = Math.cos(angle), sin = Math.sin(angle) * facing
  const point = ([x, y]: Point): Point => [pivot[0] + (x - pivot[0]) * cos - (y - pivot[1]) * sin + shift[0],
    pivot[1] + (x - pivot[0]) * sin + (y - pivot[1]) * cos + shift[1]]
  const limb = <T extends Limb>(value: T): T => ({ ...value, root: point(value.root), joint: point(value.joint), end: point(value.end),
    ...(value.hand ? { hand: point(value.hand) } : {}) })
  const leg = (value: Leg): Leg => ({ ...limb(value), footAngle: value.footAngle + angle * facing / value.footFacing })
  return { ...pose, hip: point(pose.hip), waist: point(pose.waist), shoulder: point(pose.shoulder), head: point(pose.head),
    frontArm: limb(pose.frontArm), backArm: limb(pose.backArm), frontLeg: leg(pose.frontLeg), backLeg: leg(pose.backLeg),
    ...(pose.headTilt !== undefined ? { headTilt: pose.headTilt + angle * facing } : {}) }
}

/** A reaching foot meets the wall immediately while the torso eases into its brace. */
function clearClimbingLeg(p: Player, leg: Leg, spread: number): Leg {
  let current = leg
  for (const terrain of p.terrain!) {
    const rootX = p.x + leg.root[0] * p.facing, ankleY = p.y + current.end[1]
    const wall = nearestBoundary(terrain, rootX, ankleY)
    if (Math.abs(wall.ny) > .12 || wall.distance > 40 || pointInside(terrain, rootX, ankleY)) continue
    const side = -Math.sign(wall.nx), localSide = side * p.facing
    const gap = (wall.x - p.x - current.end[0] * p.facing) * side
    // Roll the sole onto the wall before loading it; never glue a distant foot to it.
    const turn = smooth((12 - gap) / 8)
    const angle = lerp(current.footAngle, -Math.PI / 2 * localSide, turn)
    const extent = Math.max(2.1 * (current.rear ?? 0), ...FOOT_CONTACT.map(point =>
      footPoint(point, angle * current.footFacing, current.toeAngle * current.footFacing)[0]
        * current.footFacing * (1 - (current.rear ?? 0)) * localSide))
    const target: Point = [...current.end]
    const intrusion = extent + .2 - gap
    if (intrusion > 0) target[0] -= intrusion * localSide
    const solved = solveRear(leg.root, target, 15, 14.5, 1, spread)
    // If the knee reaches the face first, fold in depth without changing bone lengths.
    const dx = solved.end[0] - leg.root[0], dy = solved.end[1] - leg.root[1], length2 = dx * dx + dy * dy
    const along = (15 ** 2 - 14.5 ** 2 + length2) / (2 * length2)
    const center: Point = [leg.root[0] + dx * along, leg.root[1] + dy * along]
    const kneeOut = (solved.joint[0] - center[0]) * localSide
    const room = (wall.x - p.x - center[0] * p.facing) * side - 1.8
    if (kneeOut > Math.max(0, room)) {
      const amount = Math.max(0, room) / kneeOut
      const offset = Math.hypot(solved.joint[0] - center[0], solved.joint[1] - center[1])
      solved.joint = mix(center, solved.joint, amount)
      solved.jointDepth = Math.sqrt((solved.jointDepth ?? 0) ** 2 + offset ** 2 * (1 - amount ** 2))
    }
    current = { ...current, ...solved, footAngle: angle }
  }
  return current
}
/** A belly-first fall opens the legs behind the torso. Recovery plants the hands,
 * gathers the knees, then brings the feet underneath before standing. */
function fallFrame(p: Player, stage = 0): AthletePose {
  const hip: Point = stage === 0 ? [-7, -9] : stage === 1 ? [-5, -16] : [-4, -20]
  const pitch = stage === 0 ? Math.PI / 2 + .06 : stage === 1 ? 1.18 : .8
  const waist = add(hip, [Math.sin(pitch) * 6.5, -Math.cos(pitch) * 6.5])
  const shoulder = add(waist, [Math.sin(pitch) * 10.1, -Math.cos(pitch) * 10.1])
  const head = add(shoulder, stage === 0 ? [8, .2] : [4, -6.8])
  const armRoot = add(shoulder, [0, stage === 0 ? -.8 : .7]), legRoot = add(hip, [0, 1])
  const arm = (back: boolean) => solve(armRoot, stage === 0 ? [back ? 27 : 28, back ? -4.5 : -2.8]
    : stage === 1 ? [back ? 10 : 14, -2.8] : [back ? 7 : 11, -15], 10, 9, stage === 0 ? 1 : -1)
  const leg = (back: boolean): Leg => ({ ...solve(legRoot,
    stage === 0 ? [back ? -34 : -35, back ? -10 : -8.5] : stage === 1 ? [back ? -20 : -23, -2.8] : [back ? -5 : 3, -2.8],
    15, 14.5, -1, MIN_KNEE_OPENING),
    footAngle: stage === 0 ? Math.PI / 2 : 0, toeAngle: 0, footFacing: 1, planted: false })
  // Knees and elbows face the ground; pointed trailing feet and a turned neck
  // distinguish belly-down flight from a figure lying on its back.
  const frame = { hip, waist, shoulder, head, frontArm: arm(false), backArm: arm(true), frontLeg: leg(false), backLeg: leg(true), headTilt: stage === 0 ? pitch : 0 }
  return rotatePose(frame, p.groundAngle, p.facing)
}
function fallRecoveryPose(p: Player): AthletePose {
  const fall = p.freeFall!, recovery = fall.recovery
  if (fall.moving) return fall.moving.pose
  const source = athletePose({ ...p, ...fall.impact, freeFall: null, grounded: false,
    groundAngle: 0, footwork: null, landing: 0, pushing: null, ledgeReach: null, wallBrace: null, sliding: null })
  const prone = fallFrame(p)
  // Bend through depth as the limbs fold across the torso; interpolating only
  // their projected joints would flip an elbow or knee through a straight limb.
  const blend = (from: AthletePose, to: AthletePose, t: number) => transferPose(from, to, [0, 0], t, [0, 0], 0, true)
  if (recovery === null) {
    // The prone rig extends beyond the standing hull. Fold and balance the
    // visible body against real terrain without changing the physical root.
    return blend(source, prone, fall.amount)
  }
  if (recovery < .18) return blend(source, prone, lerp(fall.amount, 1, smooth(recovery / .16)))
  const kneeling = fallFrame(p, 1), crouched = fallFrame(p, 2)
  if (recovery < .48) return blend(prone, kneeling, smooth((recovery - .18) / .3))
  if (recovery < .7) return blend(kneeling, crouched, smooth((recovery - .48) / .22))
  const standing = athletePose({ ...p, freeFall: null, landing: 0 })
  return blend(crouched, standing, smooth((recovery - .7) / (TUNING.fallRecoveryTime - .7)))
}

function fallPose(p: Player): AthletePose {
  const pose = clearBody(p, fallRecoveryPose(p)).pose
  pose.frontArm = clearLimb(p, pose.frontArm, UPPER_ARM, FOREARM, 1, true)
  pose.backArm = clearLimb(p, pose.backArm, UPPER_ARM, FOREARM, 1, true)
  for (const name of ['frontLeg', 'backLeg'] as const) {
    let leg = pose[name]
    for (let i = 0; i < 4; i++) {
      leg = { ...leg, ...clearLimb(p, leg, 15, 14.5, -1) }
      leg = clearAirborneFoot(p, leg)
    }
    pose[name] = leg
  }
  return pose
}

/** Advance a spring to the feet from the actual preceding rig. Limit joint
 * travel in three dimensions so gathering cannot flip a knee across its IK
 * axis. The gait retains all real anchors; they become visible support only
 * when this handoff is complete. */
export function advanceMovingRecovery(p: Player, dt: number, traveling: boolean) {
  const fall = p.freeFall
  if (!fall || fall.recovery === null || !p.grounded) return
  if (!fall.moving && !traveling) return
  fall.moving ??= { pose: fallPose(p), time: 0, facing: p.facing }
  const motion = fall.moving
  if (motion.facing !== p.facing) {
    motion.pose = reflectAthletePose(motion.pose)
    motion.facing = p.facing
  }
  motion.time += dt
  const target = athletePose({ ...p, freeFall: null, landing: 0 })
  const fraction = Math.min(1, dt / Math.max(dt, .1 - motion.time + dt))
  const from = motion.pose
  const points = (pose: AthletePose) => [pose.hip, pose.waist, pose.shoulder, pose.head,
    ...[pose.frontArm, pose.backArm, pose.frontLeg, pose.backLeg].flatMap(limb =>
      [[...limb.joint, limb.jointDepth ?? 0], [...limb.end, limb.endDepth ?? 0]])]
  const before = points(from), limit = 600 * dt
  const gathering = Math.max(0, 1 - motion.time / .1)
  const sample = (t: number) => t === 1 ? target : transferPose(from, target, [0, 0], t, [0, 0], 0, gathering > .5, gathering * 4)
  const safe = (pose: AthletePose) => points(pose).every((point, i) =>
    Math.hypot(...point.map((v, j) => v - before[i][j])) <= limit)
  let t = fraction, next = sample(t)
  if (!safe(next)) {
    let low = 0, high = t
    for (let i = 0; i < 14; i++) {
      const mid = (low + high) / 2
      if (safe(sample(mid))) low = mid; else high = mid
    }
    t = low; next = sample(t)
  }
  motion.pose = next
  if (t === 1) { p.freeFall = null; p.landing = 0 }
}

/** Preserve world orientation when mechanical facing changes. */
export function reflectAthletePose(pose: AthletePose): AthletePose {
  const point = (p: Point): Point => [-p[0], p[1]]
  const limb = <T extends Limb>(part: T): T => ({ ...part, root: point(part.root), joint: point(part.joint), end: point(part.end), hand: part.hand && point(part.hand),
    handAngle: part.handAngle === undefined ? undefined : Math.PI - part.handAngle })
  const leg = (part: Leg): Leg => ({ ...limb(part), footFacing: -part.footFacing })
  return { ...pose, hip: point(pose.hip), waist: point(pose.waist), shoulder: point(pose.shoulder), head: point(pose.head), headTilt: -(pose.headTilt ?? 0),
    frontArm: limb(pose.frontArm), backArm: limb(pose.backArm), frontLeg: leg(pose.frontLeg), backLeg: leg(pose.backLeg) }
}

/** Breaststroke coordinates the outsweep, insweep, forward recovery, frog kick
 * and glide. Resting or rising keeps a vertical body with gentle hand sculling. */
function waterPose(p: Player): AthletePose {
  const motion = p.waterMotion!
  const pushing = !p.grounded ? smooth(p.pushing?.amount ?? 0) : 0
  const floatHip: Point = [0, -31.4], floatWaist: Point = [.2, -38], floatShoulder: Point = [.5, -48], floatHead: Point = [2.8, -55.3]
  const baseScull = motion.scull ?? motion.phase, bob = p.waterBob?.amount ?? 0
  const scull = (Math.sin(baseScull) * (1 - bob) + Math.sin(baseScull + (p.waterBob?.phase ?? 0)) * bob) * .8
  const floatingLeg = (back: boolean): Leg => ({ ...solve(add(floatHip, [back ? -1 : 0, 0]), [back ? -2 : 2, back ? -2.5 : -2], 15, 14.5, -1),
    footAngle: Math.PI / 2 + (back ? .05 : -.15), toeAngle: 0, footFacing: 1, planted: false })
  const floatingArm = (back: boolean): Limb => ({ ...solve(add(floatShoulder, [back ? -1.2 : 0, .5]),
    [back ? 3 - scull : 10 + scull, back ? -42.5 : -40], UPPER_ARM, FOREARM, 1), handAngle: (back ? -scull : scull) * .12 })
  const upright = rotatePose({ hip: floatHip, waist: floatWaist, shoulder: floatShoulder, head: floatHead,
    frontArm: floatingArm(false), backArm: floatingArm(true),
    frontLeg: floatingLeg(false), backLeg: floatingLeg(true) }, 0, p.facing)
  const cycle = (motion.phase / TAU % 1 + 1) % 1
  const strokeWeight = smooth((motion.amount - .65) / .35) * Math.max(smooth(Math.hypot(p.vx, p.vy) / 70), pushing * (p.pushing?.effort ?? 0))
  const breath = smooth((cycle - .22) / .2) * (1 - smooth((cycle - .55) / .17)) * strokeWeight
  const hip: Point = [-7, -9], waist: Point = [-.5, -8.6], shoulder: Point = [9.6, -8 - breath * 2], head: Point = [17.6, -7.8 - breath * 5]
  const out = smooth((cycle - .18) / .2) * strokeWeight, inward = smooth((cycle - .38) / .17) * strokeWeight, forward = smooth((cycle - .55) / .17) * strokeWeight
  const dx = 18.7 - out * 11.7 - inward * 5 + forward * 16.7, dy = out * 6 + inward * 2 - forward * 8
  const arm = (back: boolean): Limb => {
    const sweep = Math.sin(Math.PI * smooth((cycle - .18) / .37))
    const root = add(shoulder, [back ? -.5 : 0, back ? -.6 : .6])
    return solveRear(root, add(root, [dx, dy]), UPPER_ARM, FOREARM, 1, 1 - sweep * .5)
  }
  const tuck = smooth((cycle - .28) / .24), kick = smooth((cycle - .55) / .23), folded = tuck * (1 - kick) * strokeWeight
  const leg = (back: boolean): Leg => ({ ...solveRear(add(hip, [back ? -.4 : 0, back ? .4 : 1]),
    [-36.3 + folded * 16, (back ? -8.6 : -8) + folded * 5], 15, 14.5, -1, 1 - folded * .65),
    footAngle: Math.PI - folded * .65, toeAngle: 0, footFacing: 1, planted: false })
  let stroke: AthletePose = { hip, waist, shoulder, head, frontArm: arm(false), backArm: arm(true),
    frontLeg: leg(false), backLeg: leg(true), headTilt: Math.PI / 2 }
  const angle = motion.dive * Math.PI / 2, cos = Math.cos(angle), sin = Math.sin(angle)
  const point = ([x, y]: Point): Point => [x * cos - (y + 8) * sin, -8 - Math.abs(motion.dive) * 21 + x * sin + (y + 8) * cos]
  const limb = (value: Limb): Limb => ({ ...value, root: point(value.root), joint: point(value.joint), end: point(value.end) })
  stroke = { hip: point(hip), waist: point(waist), shoulder: point(shoulder), head: point(head),
    frontArm: limb(stroke.frontArm), backArm: limb(stroke.backArm),
    frontLeg: { ...stroke.frontLeg, ...limb(stroke.frontLeg), footAngle: stroke.frontLeg.footAngle + angle },
    backLeg: { ...stroke.backLeg, ...limb(stroke.backLeg), footAngle: stroke.backLeg.footAngle + angle }, headTilt: Math.PI / 2 + angle }
  // Rotate the spine into the heading; the deliberate tuck below gathers the
  // limbs without collapsing the torso or changing their segment lengths.
  const transitionHip = mix(floatHip, stroke.hip, motion.amount)
  const extended = rotatePose(upright, (Math.PI / 2 + angle) * motion.amount, 1, floatHip,
    [transitionHip[0] - floatHip[0], transitionHip[1] - floatHip[1]])
  const alignedStroke = rotatePose(stroke, -(Math.PI / 2 + angle) * (1 - motion.amount), 1, stroke.hip,
    [transitionHip[0] - stroke.hip[0], transitionHip[1] - stroke.hip[1]])
  let pose = motion.amount ? transferPose(extended, alignedStroke, [0, 0], motion.amount, [0, 0], 0, true) : upright
  const gather = (motion.gather ?? 0) * (1 - (motion.bottom ?? 0)) * (1 - pushing)
  if (gather) {
    const dx = pose.shoulder[0] - pose.hip[0], dy = pose.shoulder[1] - pose.hip[1], length = Math.hypot(dx, dy)
    const u: Point = [dx / length, dy / length], normal: Point = [-u[1], u[0]]
    const at = (root: Point, forward: number, below: number): Point => add(root, [u[0] * forward + normal[0] * below, u[1] * forward + normal[1] * below])
    const waist = at(pose.hip, Math.cos(.35) * 6.5, Math.sin(.35) * 6.5)
    const shoulder = at(waist, Math.cos(.9) * 10.1, Math.sin(.9) * 10.1)
    const leg = (back: boolean): Leg => {
      const source = back ? pose.backLeg : pose.frontLeg
      return { ...source, ...solveRear(source.root, at(pose.hip, -4, back ? 9 : 11), 15, 14.5, -1, back ? .75 : .95),
        footAngle: Math.atan2(u[1], u[0]) + 1.5, planted: false }
    }
    const arm = (back: boolean): Limb => {
      const source = back ? pose.backArm : pose.frontArm
      const root = add(shoulder, [source.root[0] - pose.shoulder[0], source.root[1] - pose.shoulder[1]])
      return solveRear(root, at(pose.hip, back ? 8 : 10, back ? 8 : 10), UPPER_ARM, FOREARM, 1, back ? .75 : .95)
    }
    const curled = { ...pose, waist, shoulder, head: at(shoulder, 5, 4),
      frontArm: arm(false), backArm: arm(true), frontLeg: leg(false), backLeg: leg(true) }
    pose = transferPose(pose, curled, [0, 0], gather, [0, 0], 0, true)
  }
  if (motion.bottom) {
    // The floor owns the legs and crouch. Upward palm sweeps oppose buoyancy;
    // the recovery folds through depth rather than flapping in a frontal view.
    const planted = athletePose({ ...p, waterMotion: undefined, freeFall: null, landing: 0 })
    const cycle = ((motion.hold ?? 0) / TAU) % 1
    const pull = smooth(cycle / .55), recover = smooth((cycle - .55) / .45)
    const lift = pull * (1 - recover), reach = 12 + Math.sin(cycle * TAU) * 2
    const arm = (back: boolean): Limb => {
      const root = add(planted.shoulder, [back ? -.8 : 0, .7])
      return { ...solveRear(root, add(root, [reach - lift * 5, 12 - lift * 19]), UPPER_ARM, FOREARM, 1, 1 - recover * (1 - recover) * 2),
        handAngle: -.2 - lift * .7 }
    }
    if (!p.pushing?.amount) { planted.frontArm = arm(false); planted.backArm = arm(true) }
    pose = motion.bottom >= 1 ? planted : transferPose(pose, planted, [0, 0], motion.bottom, [0, 0], 0, true)
  }
  if (pushing && p.pushing?.palms) {
    // Lift the face a little while the torso and kicking legs trail behind the
    // palms. Shift the whole rig to clear the prop, keeping the spine intact.
    pose = rotatePose(pose, -.22 * pushing, 1, pose.hip)
  }
  if (!p.grounded) {
    // Turn through depth while gathered instead of mirroring the extended body
    // in one frame. Every projected limb retains its actual bone lengths.
    const cos = (motion.heading ?? p.facing) * p.facing, sin = Math.sqrt(Math.max(0, 1 - cos ** 2))
    const point = ([x, y]: Point): Point => [x * cos, y]
    const limb = (value: Limb): Limb => {
      const root = point(value.root)
      const at = (position: Point, depth: number): Point => [root[0] + (position[0] - value.root[0]) * cos - depth * sin, position[1]]
      return { ...value, root, joint: at(value.joint, value.jointDepth ?? 0), end: at(value.end, value.endDepth ?? 0),
        jointDepth: (value.joint[0] - value.root[0]) * sin + (value.jointDepth ?? 0) * cos,
        endDepth: (value.end[0] - value.root[0]) * sin + (value.endDepth ?? 0) * cos }
    }
    const leg = (value: Leg): Leg => ({ ...value, ...limb(value), footAngle: Math.atan2(Math.sin(value.footAngle), Math.cos(value.footAngle) * cos) })
    pose = { ...pose, hip: point(pose.hip), waist: point(pose.waist), shoulder: point(pose.shoulder), head: point(pose.head),
      frontArm: limb(pose.frontArm), backArm: limb(pose.backArm), frontLeg: leg(pose.frontLeg), backLeg: leg(pose.backLeg) }
  }
  if (p.terrain && !p.grounded) {
    const cleared = clearBody(p, pose, motion.bodyOffset)
    pose = { ...cleared.pose, waterOffset: cleared.offset }
  }
  if (pushing && p.pushing?.palms) {
    const press = (arm: Limb, index: number) => {
      const palm = p.pushing!.palms![index]
      const point: Point = [(palm.x - p.x) * p.facing, palm.y - p.y], normal: Point = [palm.nx * p.facing, palm.ny]
      const result = grippingArm(arm.root, add(point, [normal[0] * 2.8, normal[1] * 2.8]), add(point, [normal[0] * 1.6, normal[1] * 1.6]), arm, pushing)
      result.handAngle = (result.handAngle ?? 0) + Math.atan2(-normal[0], normal[1]) * pushing
      return result
    }
    pose.frontArm = press(pose.frontArm, 0); pose.backArm = press(pose.backArm, 1)
  }
  if (motion.wall && !p.ledgeReach?.amount && !pushing) {
    const gap = (motion.wall.x - p.x) * p.facing
    const brace = (arm: Limb, back: boolean) => {
      const palm: Point = [gap - 1.5, arm.root[1] + (back ? 3 : 6)]
      return grippingArm(arm.root, [gap - 2.8, palm[1]], palm, arm, motion.wall!.amount)
    }
    pose.frontArm = brace(pose.frontArm, false); pose.backArm = brace(pose.backArm, true)
  }
  if (p.ledgeReach) {
    const origin: Point = [(p.ledgeReach.x - p.x) * p.facing, p.ledgeReach.y - p.y]
    pose.frontArm = grippingArm(pose.frontArm.root, add(origin, FRONT_WRIST), add(origin, FRONT_GRIP), pose.frontArm, p.ledgeReach.amount)
    pose.backArm = grippingArm(pose.backArm.root, add(origin, BACK_WRIST), add(origin, BACK_GRIP), pose.backArm, p.ledgeReach.amount)
  }
  if (p.terrain && !p.grounded) {
    const leg = (source: Leg) => {
      let current = source
      for (let i = 0; i < 4; i++) {
        const foot = clearAirborneFoot(p, current, 16)
        const limb = clearLimb(p, foot, 15, 14.5, -1)
        if (foot === current && limb === foot) break
        current = { ...current, ...limb }
      }
      return current
    }
    pose.frontLeg = leg(pose.frontLeg); pose.backLeg = leg(pose.backLeg)
    pose.frontArm = clearLimb(p, pose.frontArm, UPPER_ARM, FOREARM, 1, true)
    pose.backArm = clearLimb(p, pose.backArm, UPPER_ARM, FOREARM, 1, true)
  }
  return pose
}

/** Extended silhouettes reach beyond the standing controller hull. Keep
 * the head and spine outside nearby solids before solving the reaching limbs. */
function bodyIntrusion(p: Player, point: Point, radius: number) {
  const x = p.x + point[0] * p.facing, y = p.y + point[1]
  for (const b of p.terrain ?? []) {
    if (x < b.x - radius || x > b.x + b.w + radius || y < b.y - radius || y > b.y + b.h + radius) continue
    const edge = nearestBoundary(b, x, y), inside = pointInside(b, x, y)
    const depth = radius + (inside ? edge.distance : -edge.distance)
    if (depth > .01) {
      // Outside a corner, a circle separates radially from the closest point.
      // Choosing either adjacent edge's normal can jump between X and Y.
      const nx = !inside && edge.distance > .001 ? (x - edge.x) / edge.distance : edge.nx
      const ny = !inside && edge.distance > .001 ? (y - edge.y) / edge.distance : edge.ny
      return { x: nx * (depth + .05) * p.facing, y: ny * (depth + .05) }
    }
  }
  return null
}
function clearBody(p: Player, source: AthletePose, initial: Point = [0, 0]) {
  const offset: Point = [...initial]
  let pose = rotatePose(source, 0, 1, [0, 0], offset)
  for (let pass = 0; pass < 8; pass++) {
    let shift = bodyIntrusion(p, pose.head, HEAD_RADIUS)
    for (const [a, b] of [[pose.hip, pose.waist], [pose.waist, pose.shoulder]]) for (let i = 0; !shift && i <= 4; i++) shift = bodyIntrusion(p, mix(a, b, i / 4), 2.8)
    if (!shift) break
    offset[0] += shift.x; offset[1] += shift.y
    pose = rotatePose(pose, 0, 1, [0, 0], [shift.x, shift.y])
  }
  return { pose, offset }
}
/** Retain the side of a corner that already cleared the body, then relax that
 * balance adjustment gradually. Drawing the pose itself remains read-only. */
export function settleWaterClearance(p: Player, dt: number) {
  const motion = p.waterMotion
  if (!motion) return
  if (p.grounded) { delete motion.bodyOffset; return }
  const relax = (v: number) => v - Math.sign(v) * Math.min(Math.abs(v), dt * 40)
  motion.bodyOffset = (motion.bodyOffset ?? [0, 0]).map(relax) as Point
  motion.bodyOffset = waterPose(p).waterOffset ?? [0, 0]
}
/** Fold through depth around a blocked corner. The projected bend can change
 * without stretching bones or sending a shin/elbow through the solid. */
function clearLimb(p: Player, source: Limb, upper: number, lower: number, bend: number, hands = false): Limb {
  const handIntrusion = (limb: Limb) => {
    let deepest: ReturnType<typeof bodyIntrusion> = null
    for (const point of handOutline(limb)) {
      const hit = bodyIntrusion(p, point, .03)
      if (hit && (!deepest || Math.hypot(hit.x, hit.y) > Math.hypot(deepest.x, deepest.y))) deepest = hit
    }
    return deepest
  }
  // A contact palm is relative to its wrist. Retargeting the wrist must carry
  // that palm too; otherwise the hand stays embedded after the arm clears.
  const retarget = (limb: Limb): Limb => source.hand ? { ...limb,
    hand: add(source.hand, [limb.end[0] - source.end[0], limb.end[1] - source.end[1]]) } : limb
  const clear = (limb: Limb) => {
    const samples = hands ? 10 : 4
    for (const [a, b] of [[limb.root, limb.joint], [limb.joint, limb.end]]) for (let i = 0; i <= samples; i++) if (bodyIntrusion(p, mix(a, b, i / samples), hands ? 1.65 : 1.6)) return false
    return !hands || !handIntrusion(limb)
  }
  if (clear(source)) return source
  let current = source, target: Point = [...source.end]
  for (let pass = 0; pass < 12; pass++) {
    const intrusion = bodyIntrusion(p, target, 1.8) ?? (hands ? handIntrusion(retarget({ ...current, end: target })) : null)
    if (intrusion) target = add(target, [intrusion.x, intrusion.y])
    const solved = solveRear(source.root, target, upper, lower, bend, .6)
    const dx = solved.end[0] - source.root[0], dy = solved.end[1] - source.root[1], length = Math.hypot(dx, dy)
    const along = (upper ** 2 - lower ** 2 + length ** 2) / (2 * length)
    const center: Point = [source.root[0] + dx / length * along, source.root[1] + dy / length * along]
    const radius = Math.sqrt(Math.max(0, upper ** 2 - along ** 2)), normal: Point = [-dy / length, dx / length]
    const before = Math.max(-1, Math.min(1, ((current.joint[0] - center[0]) * normal[0] + (current.joint[1] - center[1]) * normal[1]) / Math.max(radius, .001)))
    const candidates = Array.from({ length: 33 }, (_, i) => i / 16 - 1).sort((a, b) => Math.abs(a - before) - Math.abs(b - before))
    for (const amount of candidates) {
      const candidate = retarget({ ...source, root: source.root, end: solved.end,
        joint: add(center, [normal[0] * radius * amount, normal[1] * radius * amount]), jointDepth: radius * Math.sqrt(1 - amount ** 2), endDepth: 0 })
      if (clear(candidate)) return candidate
    }
    // If the straight chord crosses a corner, recover the hand/foot toward the
    // body until there is room, then extend again as normal travel clears it.
    const blocked = bodyIntrusion(p, solved.joint, 1.8)
      ?? bodyIntrusion(p, mix(solved.root, solved.joint, .5), 1.8)
      ?? bodyIntrusion(p, mix(solved.joint, solved.end, .5), 1.8)
    target = blocked ? add(target, [blocked.x, blocked.y]) : mix(target, source.root, .12)
    current = retarget({ ...source, ...solved })
  }
  return retarget({ ...source, ...current, jointDepth: current.jointDepth ?? 0, endDepth: 0 })
}

/** Local-space poses share one rig, from planted contact through flight and landing. */
export function athletePose(p: Player): AthletePose {
  if (p.inverted) {
    mirrorPlayerState(p); p.inverted = false
    try { return athletePose(p) }
    finally { mirrorPlayerState(p); p.inverted = true }
  }
  if (p.releaseTurn) return rotatePose(athletePose({ ...p, releaseTurn: undefined }), p.releaseTurn.angle, p.facing)
  if (p.mantle?.step) return stepUpPose(p)
  if (p.hang || p.mantle) return ledgePose(p)
  if (p.climbing) return climbingPose(p)
  if (p.waterMotion && !p.jumpLift && !p.waterJump) return waterPose(p)
  if ((p.freeFall?.amount ?? 0) > 0) return fallPose(p)
  // Sliding blends from the same locomotion pose on contact and release. A
  // momentary slip must not replace the airborne gait before its blend begins.
  const pose = p.gait ?? gaitPose(p.vx, !p.grounded)
  const { speed, moving, run } = pose, air = p.hang || p.mantle ? 0 : pose.air
  const cycle = p.stride * p.facing
  const pushing = smooth(Math.max(p.pushing?.amount ?? 0, p.pushing?.ready ?? 0))
  const gait = moving * (1 - p.crouch) * (1 - air) * (1 - pushing)
  const squat = p.crouch
  // Contact compresses the hips first, followed by the chest and then the head.
  // The upper body unfolds on push-off; it curls forward into the next contact.
  const bodyWave = (lag: number) => lerp(Math.cos(cycle * 2 - lag) * 1.7, Math.cos(cycle * 2 - .9 - lag) * 3.4, run) * gait
  const hipBob = bodyWave(0), chestBob = bodyWave(.32) * .92, headBob = bodyWave(.55) * .72
  const rising = smooth(-p.vy / 180), extension = smooth((-p.vy - 260) / 400), tuck = rising * (1 - extension)
  const landingTime = 1 - p.landing
  // A quick, eased compression absorbs the impact, followed by a longer recovery.
  const landing = (landingTime < .28 ? smooth(landingTime / .28) : 1 - smooth((landingTime - .28) / .72)) * (1 - air * .7)
  const landingDepth = landing * lerp(2.5, 16, p.landingImpact) * (1 - squat)
  // The idle crouch must fit the same 40-unit opening as its walking pose.
  const dip = squat * (13.4 + 1.8 * (1 - moving)) + landingDepth
  const slopeLean = -p.groundAngle * p.facing * (1 - air) * .3
  const hipHeight = lerp(lerp(-33.2, lerp(-31.4, -28.3, run), moving), -31.5 + tuck * 2.5, air)
  const pelvicPitch = (.025 + run * .2 + Math.sin(cycle * 2 + .4) * lerp(.035, .1, run)) * gait + squat * .65 + air * (.08 + tuck * .28) + landingDepth * .014
  const chestPitch = (.035 + run * .4 + Math.sin(cycle * 2 - .55) * lerp(.035, .1, run)
    + Math.sin(cycle - .3) * run * .035) * gait + squat * 1.25 + air * (.12 + speed * .18 + tuck * .18) + landingDepth * .035 + slopeLean
  const hip: Point = [-squat * 3 - landingDepth * .24 + gait * (run * .8 + Math.sin(cycle * 2) * .4), hipHeight + dip + hipBob]
  const waist: Point = [hip[0] + Math.sin(pelvicPitch) * 6.5, hip[1] - Math.cos(pelvicPitch) * 6.5]
  const shoulder: Point = [waist[0] + Math.sin(chestPitch) * 10.1, waist[1] - Math.cos(chestPitch) * 10.1 + chestBob - hipBob]
  // The head leads the run while its vertical motion lags behind the shoulders.
  const head: Point = [shoulder[0] + .45 + Math.sin(chestPitch) * 2.2, shoulder[1] - 7.3 + headBob - chestBob]
  // The round head reads as looking by leaning at the neck, without moving the body.
  head[0] -= p.look * 2
  head[1] -= p.look * (p.look > 0 ? .45 : .8)
  const frontStep = sampleStride(cycle, run, moving), backStep = sampleStride(cycle + Math.PI, run, moving)
  if (pushing) {
    // Crouching already lowers the body; do not add a second squat when pushing.
    const pushDip = pushing * (1 - squat)
    const load = p.pushing!.palms ? p.pushing!.load ?? p.pushing!.effort : .5
    hip[0] -= pushing * 3; hip[1] += pushDip * 4
    waist[0] += pushing; waist[1] += pushDip * 3
    shoulder[0] += pushing * 4; shoulder[1] += pushDip * 3
    head[0] += pushing * 5; head[1] += pushDip * 3
    const compression = pushDip * (load - .5) * 4
    hip[1] += compression; waist[1] += compression; shoulder[1] += compression; head[1] += compression
    const lean = pushing * (load - .5) * 2.8
    waist[0] += lean * .35; shoulder[0] += lean; head[0] += lean
    // Weight rises over the planted leg while the other foot clears the floor.
    // This follows the actual short step; blocked feet produce no body cycle.
    const balance = p.footwork?.pushBalance
    if (balance) {
      for (let axis = 0; axis < 2; axis++) {
        hip[axis] += balance[0][axis] * pushing
        waist[axis] += lerp(balance[0][axis], balance[1][axis], .4) * pushing
        shoulder[axis] += balance[1][axis] * pushing; head[axis] += balance[2][axis] * pushing
      }
    }
    // Lower the hips and hinge at the waist to reach short objects. Keep the
    // planted feet and limb lengths, and retain the tall-box stance at height 43.
    const low = smooth((43 - (p.pushing!.height ?? 43)) / 28)
    if (low) {
      hip[1] += pushDip * low * 3
      const pelvis = .25 + low * .4, chest = .35 + low * .9
      const lowWaist = add(hip, [Math.sin(pelvis) * 6.5, -Math.cos(pelvis) * 6.5])
      const lowShoulder = add(lowWaist, [Math.sin(chest) * 10.1, -Math.cos(chest) * 10.1])
      const lowHead = add(lowShoulder, [.45 + Math.sin(chest) * 2.2, -7.3])
      const blend = pushing * low
      for (const [point, target] of [[waist, lowWaist], [shoulder, lowShoulder], [head, lowHead]]) {
        point[0] = lerp(point[0], target[0], blend); point[1] = lerp(point[1], target[1], blend)
      }
    }
  }
  let frontAnkle = moving ? frontStep.ankle : [2, -2.8] as Point
  let backAnkle = moving ? backStep.ankle : [-2, -2.8] as Point
  frontAnkle = mix(frontAnkle, [4 + Math.sin(cycle) * speed * 3, -2.8], squat)
  backAnkle = mix(backAnkle, [-5 - Math.sin(cycle) * speed * 3, -2.8], squat)

  const swing = Math.cos(cycle - run * .12) * moving * lerp(.38, 1.05, run)
  const relaxed = (1 - moving) * (1 - air) * (1 - squat)
  let frontAngle = lerp(-swing - .03 - run * .13 + relaxed * .24, -.65, squat), backAngle = lerp(swing - .03 - run * .13 - relaxed * .24, -.75, squat)
  // The backward arm opens; the forward arm folds up toward the chest.
  let frontFlex = lerp(.1 + moving * lerp(.12, 1.2 - Math.cos(cycle - .12) * .5, run), 2.1, squat)
  let backFlex = lerp(.1 + moving * lerp(.12, 1.2 + Math.cos(cycle - .12) * .5, run), 2.2, squat)
  if (air > 0) {
    // Stretch off the ground, tuck during ascent, then gather before descending.
    const airborneFront = mix([2, -3], mix([9, -15], [11, -8], extension), rising)
    const airborneBack = mix([-2, -3.5], mix([-6, -12], [-10, -1], extension), rising)
    frontAnkle = mix(frontAnkle, airborneFront, air)
    backAnkle = mix(backAnkle, airborneBack, air)
    frontAngle = lerp(frontAngle, .5 + rising * (.2 + extension * .4), air)
    backAngle = lerp(backAngle, .38 + rising * (.2 + extension * .3), air)
    frontFlex = lerp(frontFlex, 1.2 + rising * .5, air)
    backFlex = lerp(backFlex, .9 + rising * (.5 - extension * .2), air)
  }
  frontAngle = lerp(frontAngle, Math.PI - .08, p.reach)
  backAngle = lerp(backAngle, Math.PI + .06, p.reach)
  frontFlex = lerp(frontFlex, .03, p.reach); backFlex = lerp(backFlex, .03, p.reach)
  const contacts = p.grounded && !p.hang && !p.mantle ? p.footwork?.feet : undefined
  const frontPlanted = contacts ? contacts[0].planted : p.grounded && !p.mantle && (frontStep.planted || !moving)
  const backPlanted = contacts ? contacts[1].planted : p.grounded && !p.mantle && (backStep.planted || !moving)
  if (contacts) {
    frontAnkle = [(contacts[0].x - p.x) * p.facing, contacts[0].y - p.y]
    backAnkle = [(contacts[1].x - p.x) * p.facing, contacts[1].y - p.y]
  }
  if (pushing && p.pushing!.palms) {
    // Meet the farther palm before applying a load. A long approach reach
    // advances the pelvis with the chest, rather than stretching the spine.
    let reach = 0
    for (const palm of p.pushing!.palms) {
      const x = (palm.x + palm.nx * 2.8 - p.x) * p.facing, y = palm.y + palm.ny * 2.8 - p.y
      const dy = y - shoulder[1] - .7
      reach = Math.max(reach, x - shoulder[0] - Math.sqrt(Math.max(0, 18.7 ** 2 - dy * dy)))
    }
    const lean = reach * pushing, shift = Math.max(0, lean - 5)
    hip[0] += shift; waist[0] += shift + Math.min(5, lean) * .35
    shoulder[0] += lean; head[0] += lean
  }
  // Lower the pelvis when necessary; a planted foot must never be pulled off its anchor by IK.
  let supportDip = 0
  for (const [index, [ankle, planted]] of ([[frontAnkle, frontPlanted], [backAnkle, backPlanted]] as const).entries()) if (p.grounded && !p.mantle) {
    const rise = Math.sqrt(Math.max(0, 29 ** 2 - (ankle[0] - hip[0]) ** 2))
    const groundY = contacts ? contacts[index].groundY - p.y : 0
    const weight = planted ? 1 : smooth((ankle[1] - groundY + 8) / 5.2)
    supportDip = Math.max(supportDip, (ankle[1] - rise - (hip[1] + 1)) * weight)
  }
  if (supportDip) { hip[1] += supportDip; waist[1] += supportDip; shoulder[1] += supportDip; head[1] += supportDip }
  if (pushing) {
    // Clear the final pose after reach and balance adjustments. An earlier
    // head clamp was undone by the subsequent lean toward the palms.
    head[0] = Math.min(head[0], (p.pushing!.wallX - p.x) * p.facing - HEAD_RADIUS - .1)
    for (let pass = 0; pass < 8; pass++) {
      const intrusion = bodyIntrusion(p, head, HEAD_RADIUS)
      if (!intrusion) break
      head[0] += intrusion.x; head[1] += intrusion.y
    }
  }
  // Near and far joints coincide in profile; depth comes only from overlap.
  const frontRoot = () => add(shoulder, [0, .7]), backRoot = frontRoot
  let frontArm = armPose(frontRoot(), frontAngle, frontFlex), backArm = armPose(backRoot(), backAngle, backFlex)
  if (pushing) {
    const wall = (p.pushing!.wallX - p.x) * p.facing
    const press = (arm: Limb, y: number, index: number) => {
      const palm = p.pushing!.palms?.[index]
      if (palm) {
        const point: Point = [(palm.x - p.x) * p.facing, palm.y - p.y], normal: Point = [palm.nx * p.facing, palm.ny]
        const result = grippingArm(arm.root, add(point, [normal[0] * 2.8, normal[1] * 2.8]), add(point, [normal[0] * 1.6, normal[1] * 1.6]), arm, pushing)
        result.handAngle = (result.handAngle ?? 0) + Math.atan2(-normal[0], normal[1]) * pushing
        return result
      }
      const contactX = wall + (y + 43) * (p.pushing!.slope ?? 0) * p.facing
      const result = grippingArm(arm.root, [contactX - 2.8, y], [contactX - 1.6, y], arm, pushing)
      result.handAngle = (result.handAngle ?? 0) + (Math.PI / 2 - Math.atan((p.pushing!.slope ?? 0) * p.facing)) * pushing
      return result
    }
    frontArm = press(frontArm, -43, 0); backArm = press(backArm, -46, 1)
  }
  if (p.ledgeReach && !p.grounded) {
    const origin: Point = [(p.ledgeReach.x - p.x) * p.facing, p.ledgeReach.y - p.y]
    frontArm = grippingArm(frontRoot(), add(origin, FRONT_WRIST), add(origin, FRONT_GRIP), frontArm, p.ledgeReach.amount)
    backArm = grippingArm(backRoot(), add(origin, BACK_WRIST), add(origin, BACK_GRIP), backArm, p.ledgeReach.amount)
  }
  const frontFacing = (contacts?.[0].facing ?? p.facing) * p.facing, backFacing = (contacts?.[1].facing ?? p.facing) * p.facing
  const terrainHeight = p.footwork ? (x: number) => {
    const ground = groundAt(p.footwork!.terrain, p.x + x * p.facing, p.y)
    return ground ? ground.y - p.y : null
  } : undefined
  const frontLeg = solveLeg(add(hip, [0, 1]), frontAnkle, contacts ? contacts[0].angle * frontFacing : lerp(frontStep.angle * (1 - squat) * moving, -.15, air), p.grounded, frontPlanted, frontFacing, 1 - air, -1,
    contacts ? contacts[0].groundY - p.y : 0, (contacts?.[0].groundAngle ?? 0) * p.facing, terrainHeight, squat)
  const backLeg = solveLeg(add(hip, [0, 1]), backAnkle, contacts ? contacts[1].angle * backFacing : lerp(backStep.angle * (1 - squat) * moving, .12, air), p.grounded, backPlanted, backFacing, 1 - air, -1,
    contacts ? contacts[1].groundY - p.y : 0, (contacts?.[1].groundAngle ?? 0) * p.facing, terrainHeight, squat)
  const result = { hip, waist, shoulder, head, frontArm, backArm, frontLeg, backLeg }
  // Wall and slope contacts can coexist in a narrow gap. Blend each contact
  // instead of switching the entire rig when a brief slide starts or ends.
  const braced = p.wallBrace ? wallBracePose(p, result) : result
  const resolved = p.sliding ? slidingPose(p, braced) : braced
  if ((!p.grounded || p.sliding) && p.terrain) {
    resolved.frontLeg = clearAirborneFoot(p, resolved.frontLeg); resolved.backLeg = clearAirborneFoot(p, resolved.backLeg)
  } else if (p.terrain) {
    resolved.frontLeg = clearRiserLeg(p, resolved.frontLeg); resolved.backLeg = clearRiserLeg(p, resolved.backLeg)
  }
  return resolved
}

/** Toes can meet a slope just before the body hull. Keep them on the air side. */
function clearAirborneFoot(p: Player, leg: Leg, passes = 6): Leg {
  let current = leg
  const target: Point = [...leg.end]
  for (let pass = 0; pass < passes; pass++) {
    let moved = false
    for (const point of FOOT_CONTACT) {
      const sole = footPoint(point, current.footAngle * current.footFacing, current.toeAngle * current.footFacing)
      const x = p.x + (current.end[0] + sole[0] * current.footFacing) * p.facing, y = p.y + current.end[1] + sole[1]
      for (const b of p.terrain!) if (pointInside(b, x, y)) {
        const edge = nearestBoundary(b, x, y)
        if (edge.distance < .01) continue
        target[0] += (edge.x - x + edge.nx * .05) * p.facing; target[1] += edge.y - y + edge.ny * .05
        moved = true; break
      }
      if (moved) break
    }
    if (!moved) break
    current = { ...current, ...solve(current.root, target, 15, 14.5, -1, MIN_KNEE_OPENING), jointDepth: 0, endDepth: 0 }
  }
  return current
}

/** A stair riser blocks the visible toe and knee before the body starts climbing.
 * Fold the knee in depth, keeping bone lengths and the rest of the pose intact. */
function clearRiserLeg(p: Player, leg: Leg): Leg {
  let current = leg
  const rootX = p.x + leg.root[0] * p.facing
  for (const b of p.terrain!) {
    if (rootX + 36 < b.x || rootX - 36 > b.x + b.w || p.y < b.y || p.y - 62 > b.y + b.h) continue
    const points = polygonPoints(b)
    for (let i = 0; i < points.length; i++) {
      const a = points[i], end = points[(i + 1) % points.length]
      if (Math.abs(a[0] - end[0]) > 1e-7) continue
      const normal = Math.sign(end[1] - a[1]), gap = (rootX - a[0]) * normal
      if (gap < 0 || gap > 36) continue
      const side = -normal * p.facing, wall = (a[0] - p.x) * p.facing
      const top = Math.min(a[1], end[1]), bottom = Math.max(a[1], end[1])
      let intrusion = 0
      for (const point of FOOT_CONTACT) {
        const sole = footPoint(point, current.footAngle * current.footFacing, current.toeAngle * current.footFacing)
        const y = p.y + current.end[1] + sole[1]
        if (y > top + .01 && y < bottom - .01) intrusion = Math.max(intrusion,
          (current.end[0] + sole[0] * current.footFacing - wall) * side + .05)
      }
      if (intrusion > 0) current = clearAirborneFoot(p, { ...current, ...solve(current.root,
        [current.end[0] - intrusion * side, current.end[1]], 15, 14.5, -1, p.grounded ? Math.PI / 12 : MIN_KNEE_OPENING), jointDepth: 0, endDepth: 0 }, 16)
      const kneeY = p.y + current.joint[1]
      // A shin can cross a bank corner even with its knee above the bank and
      // its sole outside the wall. Check the joining segment as well.
      const crosses = (a: Point, b: Point) => {
        const t = (wall - side * 1.8 - a[0]) / (b[0] - a[0])
        const y = p.y + a[1] + (b[1] - a[1]) * t
        return t >= 0 && t <= 1 && y > top - 1.8 && y < bottom + 1.8
      }
      if ((kneeY < top || kneeY > bottom) && !crosses(current.root, current.joint) && !crosses(current.joint, current.end)
        || (current.joint[0] - wall) * side < -1.8) continue
      const dx = current.end[0] - current.root[0], dy = current.end[1] - current.root[1], length2 = dx * dx + dy * dy
      const along = (15 ** 2 - 14.5 ** 2 + length2) / (2 * length2)
      const center: Point = [current.root[0] + dx * along, current.root[1] + dy * along]
      const out = (current.joint[0] - center[0]) * side
      if (out <= 0) continue
      const amount = clamp(((wall - center[0]) * side - 1.8) / out)
      current = { ...current, joint: mix(center, current.joint, amount),
        jointDepth: Math.sqrt((current.jointDepth ?? 0) ** 2
          + Math.hypot(current.joint[0] - center[0], current.joint[1] - center[1]) ** 2 * (1 - amount ** 2)) }
    }
  }
  return current
}

/** Keep weight over staggered feet, with soft knees and small balance corrections. */
function slidingPose(p: Player, free: AthletePose): AthletePose {
  const s = p.sliding!, weight = smooth(s.amount)
  if (!weight) return free
  const tx = Math.cos(s.angle), ty = Math.sin(s.angle), nx = ty, ny = -tx
  const velocity = p.vx * tx + p.vy * ty, speed = smooth(Math.abs(velocity) / 450)
  const balance = Math.tanh(velocity / 150) * p.facing, correction = Math.sin(s.time * 5.5) * speed
  const at = (along: number, above: number): Point => [(s.x + tx * along + nx * above - p.x) * p.facing, s.y + ty * along + ny * above - p.y]
  const spread = 2.5 + speed * 4, center = at(0, 2.8)
  const front = at((spread + correction * .6) * p.facing, 2.8), back = at(-(spread - correction * .6) * p.facing, 2.8)
  const hipTarget: Point = [center[0] - balance * 2, center[1] - 29 + speed * 2]
  // Fit both legs before placing the torso, instead of pulling a foot off the
  // slope or rotating the entire person to match its angle.
  for (const foot of [front, back]) {
    const reach = 28.5 - speed, rise = Math.sqrt(Math.max(0, reach ** 2 - (foot[0] - hipTarget[0]) ** 2))
    hipTarget[1] = Math.max(hipTarget[1], foot[1] - rise - 1)
  }
  const lean = -balance * (1.5 + speed) + correction * .4
  const hip = mix(free.hip, hipTarget, weight), waist = mix(free.waist, add(hipTarget, [lean * .3, -6.5]), weight)
  const shoulder = mix(free.shoulder, add(hipTarget, [lean, -16.4]), weight)
  const head = mix(free.head, add(hipTarget, [lean + .45, -23.7]), weight)
  const leg = (original: Leg, foot: Point): Leg => {
    const target = mix(original.end, foot, weight), origin = at(0, 0)
    const above = (target[0] - origin[0]) * nx * p.facing + (target[1] - origin[1]) * ny
    // The sliding contact plane belongs to this blend, too. Actual terrain
    // clearance is applied to the finished feet below; a faint slip must not
    // project them fully onto a plane extending beyond a round obstacle.
    if (above < 2.8) { target[0] += nx * p.facing * (2.8 - above) * weight; target[1] += ny * (2.8 - above) * weight }
    const limb = solve(add(hip, [0, 1]), target, 15, 14.5, -1, MIN_KNEE_OPENING)
    return { ...limb, footAngle: lerp(original.footAngle, s.angle * p.facing, weight), toeAngle: original.toeAngle * (1 - weight), footFacing: 1, planted: false }
  }
  const armRoot = add(shoulder, [0, .7])
  const frontArm = armPose(armRoot, .08 + speed * .16 + correction * .015, .2 + speed * .55)
  const backArm = armPose(armRoot, -.12 - speed * .18 + correction * .02, .14 + speed * .1)
  const arm = (original: Limb, relaxed: Limb) => solve(armRoot, mix(original.end, relaxed.end, weight), UPPER_ARM, FOREARM, 1)
  return { hip, waist, shoulder, head, frontLeg: leg(free.frontLeg, front), backLeg: leg(free.backLeg, back),
    frontArm: arm(free.frontArm, frontArm), backArm: arm(free.backArm, backArm) }
}

/** Keep the ordinary pushing silhouette, with the legs reaching diagonally to the wall. */
function wallBracePose(p: Player, free: AthletePose): AthletePose {
  if (p.grounded) return free
  const brace = p.wallBrace!, slope = brace.normal ? -brace.normal[1] / brace.normal[0] * p.facing : 0
  const wallAt = (y: number) => (brace.wallX - p.x) * p.facing + slope * (p.y + y - (brace.wallY ?? p.y))
  const wall = Math.min(wallAt(-43), wallAt(-TUNING.height)), wallAngle = -Math.PI / 2 - Math.atan(slope)
  const amount = smooth(brace.amount ?? Math.max(...brace.hands, ...brace.feet))
  // Use the same body and arm rig as a settled ground push, including its distance
  // from the wall. The physical capsule stays at the collision boundary.
  const pushDistance = 25.5
  const pushing = athletePose({ ...p, x: p.x + p.facing * (wall - pushDistance),
    grounded: true, vx: 0, vy: 0, wallBrace: null, sliding: null, footwork: null, gait: gaitPose(0),
    crouch: 0, crouching: false, reach: 0, landing: 0, groundAngle: 0,
    pushing: { wallX: p.x + p.facing * wall, direction: p.facing, amount: 1, effort: 1 } })
  const offset: Point = [wall - pushDistance, 0]
  const lean = .2
  const towardWall = (point: Point): Point => {
    const x = point[0] - pushing.hip[0], y = point[1] - pushing.hip[1]
    return add(pushing.hip, [x * Math.cos(lean) - y * Math.sin(lean) + offset[0], x * Math.sin(lean) + y * Math.cos(lean)])
  }
  const hip = mix(free.hip, add(pushing.hip, offset), amount), waist = mix(free.waist, towardWall(pushing.waist), amount)
  const shoulder = mix(free.shoulder, towardWall(pushing.shoulder), amount), head = mix(free.head, towardWall(pushing.head), amount)
  const arm = (limb: Limb, weight: number, y: number) => {
    const contact = smooth(weight)
    const braced = grippingArm(add(shoulder, [0, .7]), [wallAt(y) - 2.8, y], [wallAt(y) - 1.6, y], limb, contact)
    braced.handAngle = lerp(braced.handAngle ?? 0, -wallAngle, contact)
    return braced
  }
  const leg = (limb: Leg, weight: number, y: number): Leg => {
    const contact = smooth(weight)
    const target = mix(limb.end, [wallAt(y) - 2.8, y], contact)
    const root = add(hip, [0, 1])
    const desired = lerp(limb.footAngle, wallAngle, contact)
    let result = solveLeg(root, target, desired, false)
    // Use the normal forward knee bend throughout the reach. Let the ankle flex
    // within its usual limits, then place the contacting part of the foot at the wall.
    for (let i = 0; i < 12; i++) {
      const reach = Math.max(...FOOT_CONTACT.map(point => {
        const [x, y] = footPoint(point, result.footAngle, result.toeAngle); return x - slope * y
      }))
      const limit = wallAt(result.end[1]) - reach
      target[0] = Math.min(limit, lerp(limb.end[0], limit, contact))
      result = solveLeg(root, target, desired, false)
    }
    return result
  }
  return { hip, waist, shoulder, head,
    frontArm: arm(free.frontArm, brace.hands[0], -43), backArm: arm(free.backArm, brace.hands[1], -46),
    frontLeg: leg(free.frontLeg, brace.feet[0], -13), backLeg: leg(free.backLeg, brace.feet[1], -17) }
}

export const NIGHT_PLAYER_COLOR = '#e5e7e6'
/** Original daytime silhouette; night rendering supplies its own lit material. */
export function drawAthlete(ctx: CanvasRenderingContext2D, p: Player, body = '#686b6e') {
  const { hip, waist, shoulder, head, frontArm, backArm, frontLeg, backLeg, backView = 0, headTilt } = athletePose(p)
  ctx.save(); ctx.translate(p.x, p.y); ctx.scale(p.facing, p.inverted ? -1 : 1)
  const backPose = !!p.climbing || backView > 0
  drawLeg(ctx, backLeg, body)
  drawArm(ctx, backArm, body)
  if (backPose) drawArm(ctx, frontArm, body)

  if (backPose) drawBack(ctx, hip, waist, shoulder, body, backView, Math.sign(p.climbing?.lean ?? 0) * p.facing || 1)
  else drawTorso(ctx, hip, waist, shoulder, body)
  drawLeg(ctx, frontLeg, body)
  const [neck, nape] = neckPoints(shoulder, head, headTilt)
  fillShape(ctx, segmentPath(neck, nape, 1.15, 1.15, 1.15), body)
  drawHead(ctx, head, body)
  if (!backPose) drawArm(ctx, frontArm, body)
  ctx.restore()
}
