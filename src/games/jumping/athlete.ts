import { gaitPose } from './model.ts'
import type { Player } from './model.ts'
import { FOOT_CONTACT, footPoint, sampleStride, soleContact, toeBend } from './footwork.ts'
import { groundAt } from './terrain.ts'
import { nearestBoundary, pointInside } from './geometry.ts'
import { BACK_GRIP, BACK_WRIST, climbFrame, FRONT_GRIP, FRONT_WRIST, LEDGE_CATCH_TIME, LEDGE_CLIMB_TIME, ROPE_LEDGE_CATCH_TIME } from './ledge.ts'
import { climbBody, climbGait, climbNormal, climbPoint, ropePump, rappelFrame, rappelWeight } from './climbables.ts'

type Point = [number, number]
type Limb = { root: Point; joint: Point; end: Point; hand?: Point; handAngle?: number; jointDepth?: number; endDepth?: number }
type Leg = Limb & { footAngle: number; toeAngle: number; footFacing: number; planted: boolean; rear?: number }
type AthletePose = { hip: Point; waist: Point; shoulder: Point; head: Point; frontArm: Limb; backArm: Limb; frontLeg: Leg; backLeg: Leg; sideView?: number; backView?: number }
const TAU = Math.PI * 2
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
function transferPose(from: AthletePose, to: AthletePose, shift: Point, t: number, offset: Point = [0, 0], reachClearance = 0): AthletePose {
  const point = (a: Point, b: Point) => add(mix(add(a, shift), b, t), offset)
  const limb = (a: Limb, b: Limb, upper: number, lower: number, clearance = 0): Limb => {
    const root = point(a.root, b.root), target = point(a.end, b.end)
    // A regripping hand passes in front of the shoulder instead of through it.
    const vector = [target[0] - root[0], target[1] - root[1], lerp(a.endDepth ?? 0, b.endDepth ?? 0, t) + Math.sin(Math.PI * t) * clearance]
    const actual = Math.hypot(...vector), length = Math.max(Math.abs(upper - lower) + .02, Math.min(upper + lower - .02, actual))
    const axis = actual > .001 ? vector.map(v => v / actual) : [0, 1, 0]
    const along = (upper * upper - lower * lower + length * length) / (2 * length)
    const center = axis.map(v => v * along), preferred = point(a.joint, b.joint)
    const bend = [preferred[0] - root[0] - center[0], preferred[1] - root[1] - center[1], lerp(a.jointDepth ?? 0, b.jointDepth ?? 0, t) - center[2]]
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
  const leg = (a: Leg, b: Leg): Leg => ({ ...limb(a, b, 15, 14.5), footAngle: lerp(a.footAngle, b.footAngle, t),
    toeAngle: lerp(a.toeAngle, b.toeAngle, t), footFacing: b.footFacing, planted: a.planted && b.planted,
    rear: lerp(a.rear ?? 0, b.rear ?? 0, t) })
  return { hip: point(from.hip, to.hip), waist: point(from.waist, to.waist), shoulder: point(from.shoulder, to.shoulder), head: point(from.head, to.head),
    frontArm: limb(from.frontArm, to.frontArm, UPPER_ARM, FOREARM, reachClearance), backArm: limb(from.backArm, to.backArm, UPPER_ARM, FOREARM, reachClearance),
    frontLeg: leg(from.frontLeg, to.frontLeg), backLeg: leg(from.backLeg, to.backLeg),
    backView: lerp(from.backView ?? 0, to.backView ?? 0, t) }
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
  const length = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1
  const ux = (b[0] - a[0]) / length, uy = (b[1] - a[1]) / length, nx = -uy, ny = ux
  const side = (t: number, radius: number): Point => [lerp(a[0], b[0], t) + nx * radius, lerp(a[1], b[1], t) + ny * radius]
  const p0 = side(0, r0), p1 = side(1, r1), p2 = side(1, -r1), p3 = side(0, -r0)
  const mid0 = side(.38, belly), mid1 = side(.38, -belly)
  const path = new Path2D(); path.moveTo(...p0); path.quadraticCurveTo(...mid0, ...p1)
  path.quadraticCurveTo(b[0] + ux * r1, b[1] + uy * r1, ...p2)
  path.quadraticCurveTo(...mid1, ...p3); path.quadraticCurveTo(a[0] - ux * r0, a[1] - uy * r0, ...p0)
  path.closePath(); return path
}
function footAngle(limb: Limb, desired: number): number {
  const neutral = Math.atan2(limb.end[1] - limb.joint[1], limb.end[0] - limb.joint[0]) - Math.PI / 2
  const delta = Math.atan2(Math.sin(desired - neutral), Math.cos(desired - neutral))
  // Flex relative to the shin, keeping the toes clear of the calf during recovery.
  return neutral + Math.max(-.35, Math.min(.7, delta))
}
function solveLeg(root: Point, target: Point, desired: number, grounded: boolean, planted = false, footFacing = 1, load = Number(grounded), kneeDirection = -1,
  groundY = 0, surfaceAngle = 0, terrainHeight?: (x: number) => number | null): Leg {
  const ankle: Point = [...target]
  let limb = solve(root, ankle, 15, 14.5, kneeDirection, MIN_KNEE_OPENING)
  const swingAngle = () => lerp(desired, footAngle(limb, desired), grounded ? smooth((groundY - ankle[1] - 2.8) / 3) : 1)
  let angle = swingAngle()
  const flex = () => toeBend((angle - surfaceAngle) * footFacing, load * smooth((limb.end[1] - groundY + 10) / 6)) * footFacing
  if (planted) return { ...limb, footAngle: desired, toeAngle: toeBend((desired - surfaceAngle) * footFacing) * footFacing, footFacing, planted }
  if (grounded) for (let i = 0; i < 4; i++) {
    const bottom = terrainHeight ? Math.max(...FOOT_CONTACT.map(point => {
      const sole = footPoint(point, angle * footFacing, flex() * footFacing)
      const surface = terrainHeight(limb.end[0] + sole[0] * footFacing)
      return surface === null ? 0 : limb.end[1] + sole[1] - surface
    })) : limb.end[1] + soleContact(angle * footFacing, flex() * footFacing)[1] - groundY
    if (bottom <= .01) break
    ankle[1] -= bottom
    limb = solve(root, ankle, 15, 14.5, kneeDirection, MIN_KNEE_OPENING); angle = swingAngle()
  }
  return { ...limb, footAngle: angle, toeAngle: flex(), footFacing, planted }
}
function footPath(ankle: Point, angle: number, facing = 1, toeAngle = 0, profile = 1): Path2D {
  const at = (x: number, y: number, toe = false): Point => {
    const point = footPoint([x, y], angle * facing, toeAngle * facing, toe)
    return [ankle[0] + point[0] * facing * profile, ankle[1] + point[1]]
  }
  const path = new Path2D(); path.moveTo(...at(-1.6, -1.6)); path.lineTo(...at(-2.4, .4))
  path.quadraticCurveTo(...at(-3, 2.5), ...at(-1.8, 2.8)); path.lineTo(...at(2.2, 2.8)); path.lineTo(...at(2.2, -.6))
  path.quadraticCurveTo(...at(1.3, -2), ...at(-1.6, -1.6)); path.closePath()
  path.moveTo(...at(2.2, 2.8, true)); path.lineTo(...at(4.5, 2.8, true))
  path.quadraticCurveTo(...at(6.2, 2.6, true), ...at(6, 1.5, true))
  path.bezierCurveTo(...at(5.6, .2, true), ...at(3.1, .2, true), ...at(2.2, -.6, true)); path.closePath()
  return path
}
function drawLeg(ctx: CanvasRenderingContext2D, limb: Leg, color: string) {
  const path = joined([segmentPath(limb.root, limb.joint, 2.2, 1.65, 2.2), roundPath(limb.joint, 1.7),
    segmentPath(limb.joint, limb.end, 1.7, 1.25, 1.8), roundPath(limb.end, 1.3)])
  fillShape(ctx, path, color)
  if (limb.rear) fillShape(ctx, roundPath(add(limb.end, [0, 1]), 2.1 * limb.rear, 1.8), color)
  if ((limb.rear ?? 0) < 1) fillShape(ctx, footPath(limb.end, limb.footAngle, limb.footFacing, limb.toeAngle, 1 - (limb.rear ?? 0)), color)
}
function drawArm(ctx: CanvasRenderingContext2D, limb: Limb, color: string) {
  const forearmAngle = Math.atan2(limb.end[1] - limb.joint[1], limb.end[0] - limb.joint[0])
  const angle = limb.handAngle ?? forearmAngle
  const palm: Point = limb.hand ?? [limb.end[0] + Math.cos(angle) * 1.4, limb.end[1] + Math.sin(angle) * 1.4]
  const path = joined([roundPath(limb.root, 1.65), segmentPath(limb.root, limb.joint, 1.6, 1.35, 1.6), roundPath(limb.joint, 1.4),
    segmentPath(limb.joint, limb.end, 1.4, 1.05, 1.45), roundPath(palm, 2.1, 1.6, angle)])
  fillShape(ctx, path, color)
}
function drawTorso(ctx: CanvasRenderingContext2D, hip: Point, waist: Point, shoulder: Point, color: string) {
  // A single bean-shaped body, like a clean animation construction drawing.
  const at = (p: Point, x: number, y = 0): Point => {
    const a = p === hip ? waist : shoulder, b = p === shoulder ? waist : hip
    const dx = b[0] - a[0], dy = b[1] - a[1], length = Math.hypot(dx, dy) || 1
    return [p[0] + (dy * x + dx * y) / length, p[1] + (dy * y - dx * x) / length]
  }
  ctx.beginPath(); ctx.moveTo(...at(shoulder, -1.2, -.7))
  ctx.bezierCurveTo(...at(shoulder, -2.2, 2), ...at(waist, -2.3, -3), ...at(waist, -2.6))
  ctx.bezierCurveTo(...at(hip, -3.3, -3), ...at(hip, -3.6, -1), ...at(hip, -3, 1.5))
  ctx.quadraticCurveTo(...at(hip, -.5, 4), ...at(hip, 2.4, 1.8))
  ctx.bezierCurveTo(...at(hip, 4.8, -1.5), ...at(waist, 4.6, 2), ...at(waist, 3.2, -1))
  ctx.quadraticCurveTo(...at(shoulder, 2.5, 4), ...at(shoulder, 1.4, -.7))
  ctx.closePath(); ctx.fillStyle = color; ctx.fill()
}
function drawHead(ctx: CanvasRenderingContext2D, head: Point, color: string) {
  ctx.beginPath(); ctx.ellipse(head[0], head[1], 6.2, 6.2, 0, 0, TAU)
  ctx.fillStyle = color; ctx.fill()
}
function drawBack(ctx: CanvasRenderingContext2D, hip: Point, waist: Point, shoulder: Point, color: string, turn: number, facing = 1) {
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
  ctx.beginPath(); ctx.moveTo(...at(shoulder, -width))
  ctx.quadraticCurveTo(...at(shoulder, -waistWidth, 6), ...at(waist, -waistWidth - left * .35))
  ctx.bezierCurveTo(...at(waist, -waistWidth - left, 2), ...at(hip, -hips - left, -1), ...at(hip, -hips, 1))
  ctx.quadraticCurveTo(...at(hip, 0, 4), ...at(hip, hips, 1))
  ctx.bezierCurveTo(...at(hip, hips + right, -1), ...at(waist, waistWidth + right, 2), ...at(waist, waistWidth + right * .35))
  ctx.quadraticCurveTo(...at(shoulder, waistWidth, 6), ...at(shoulder, width))
  ctx.quadraticCurveTo(...at(shoulder, 0, -2), ...at(shoulder, -width)); ctx.closePath()
  ctx.fillStyle = color; ctx.fill()
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

/** All supports are authored relative to the corner, independent of the camera and player root. */
function ledgePose(p: Player): AthletePose {
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
  const frame = climbFrame(t, edge.braced)
  const origin: Point = [(edge.edgeX - p.x) * p.facing, edge.edgeY - p.y]
  const at = (point: Point) => add(origin, point)
  let hip = at(frame.hip), waist = at(frame.waist), shoulder = at(frame.shoulder), head = at(frame.head)
  let frontFoot = at(frame.frontFoot), backFoot = at(frame.backFoot)
  const balance = smooth((t - .48) / .09) * (1 - smooth((t - .8) / .2))
  let frontFree = armPose(add(shoulder, [0, .7]), -.03 + balance * 1.1, .1 + balance * 1.1)
  let backFree = armPose(add(shoulder, [0, .7]), -.03 - balance * .8, .1 + balance * 1.7)
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
  const frontArm = grippingArm(root, at(FRONT_WRIST), at(FRONT_GRIP), frontFree, catchWeight * (1 - frame.frontRelease), .9)
  const backArm = grippingArm(root, at(BACK_WRIST), at(BACK_GRIP), backFree, catchWeight * (1 - frame.backRelease), .9)
  const legRoot = add(hip, [0, 1])
  const frontLeg = solveLeg(legRoot, frontFoot, .15 * (1 - smooth(t / .45)), false, frame.frontPlanted)
  const backLeg = solveLeg(legRoot, backFoot, .25 * (1 - smooth(t / .65)), false, frame.backPlanted)
  // Soften ankle flex before contact; the support foot then remains exactly flat.
  const flatten = (leg: Leg, weight: number) => { leg.footAngle *= 1 - weight; leg.toeAngle *= 1 - weight }
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
/** Local-space poses share one rig, from planted contact through flight and landing. */
export function athletePose(p: Player): AthletePose {
  if (p.hang || p.mantle) return ledgePose(p)
  if (p.climbing) return climbingPose(p)
  // A slipping foot is still in contact: do not layer a falling/running cycle
  // underneath the balance pose while the surface is supporting the body.
  const pose = p.sliding?.active ? gaitPose(0) : p.gait ?? gaitPose(p.vx, !p.grounded)
  const { speed, moving, run } = pose, air = p.hang || p.mantle ? 0 : pose.air
  const cycle = p.stride * p.facing
  const gait = moving * (1 - p.crouch) * (1 - air)
  const squat = p.crouch, charge = p.charging ? p.charge * (2 - speed) * (1 - squat) : 0
  // Contact compresses the hips first, followed by the chest and then the head.
  // The upper body unfolds on push-off; it curls forward into the next contact.
  const bodyWave = (lag: number) => lerp(Math.cos(cycle * 2 - lag) * 1.7, Math.cos(cycle * 2 - .9 - lag) * 3.4, run) * gait
  const hipBob = bodyWave(0), chestBob = bodyWave(.32) * .92, headBob = bodyWave(.55) * .72
  const rising = smooth(-p.vy / 180), extension = smooth((-p.vy - 260) / 400), tuck = rising * (1 - extension)
  const landingTime = 1 - p.landing
  // A quick, eased compression absorbs the impact, followed by a longer recovery.
  const landing = (landingTime < .28 ? smooth(landingTime / .28) : 1 - smooth((landingTime - .28) / .72)) * (1 - air * .7)
  const landingDepth = landing * lerp(2.5, 16, p.landingImpact) * (1 - squat)
  const dip = squat * 22 + landingDepth + charge
  const slopeLean = -p.groundAngle * p.facing * (1 - air) * .3
  const hipHeight = lerp(lerp(-33.2, lerp(-31.4, -28.3, run), moving), -31.5 + tuck * 2.5, air)
  const pelvicPitch = (.025 + run * .2 + Math.sin(cycle * 2 + .4) * lerp(.035, .1, run)) * gait + squat * .35 + air * (.08 + tuck * .28) + landingDepth * .014
  const chestPitch = (.035 + run * .4 + Math.sin(cycle * 2 - .55) * lerp(.035, .1, run)
    + Math.sin(cycle - .3) * run * .035) * gait + squat * .55 + air * (.12 + speed * .18 + tuck * .18) + landingDepth * .035 + slopeLean
  const hip: Point = [-squat * 7 - landingDepth * .24 + gait * (run * .8 + Math.sin(cycle * 2) * .4), hipHeight + dip + hipBob]
  const waist: Point = [hip[0] + Math.sin(pelvicPitch) * 6.5, hip[1] - Math.cos(pelvicPitch) * 6.5]
  const shoulder: Point = [waist[0] + Math.sin(chestPitch) * 10.1, waist[1] - Math.cos(chestPitch) * 10.1 + chestBob - hipBob]
  // The head leads the run while its vertical motion lags behind the shoulders.
  const head: Point = [shoulder[0] + .45 + Math.sin(chestPitch) * 2.2, shoulder[1] - 7.3 + headBob - chestBob]
  const frontStep = sampleStride(cycle, run, moving), backStep = sampleStride(cycle + Math.PI, run, moving)
  const pushing = smooth(p.pushing?.amount ?? 0)
  if (pushing) {
    hip[0] -= pushing * 3; hip[1] += pushing * 4
    waist[0] += pushing; waist[1] += pushing * 3
    shoulder[0] += pushing * 4; shoulder[1] += pushing * 3
    head[0] += pushing * 5; head[1] += pushing * 3
    head[0] = Math.min(head[0], (p.pushing!.wallX - p.x) * p.facing - 6.3)
  }
  let frontAnkle = moving ? frontStep.ankle : [0, -2.8] as Point
  let backAnkle = moving ? backStep.ankle : [0, -2.8] as Point
  frontAnkle = mix(frontAnkle, [4 + Math.sin(cycle) * speed * 3, -2.8], squat)
  backAnkle = mix(backAnkle, [-5 - Math.sin(cycle) * speed * 3, -2.8], squat)

  const swing = Math.cos(cycle - run * .12) * moving * lerp(.38, 1.05, run)
  let frontAngle = lerp(-swing - .03 - run * .13, .55, squat), backAngle = lerp(swing - .03 - run * .13, .45, squat)
  // The backward arm opens; the forward arm folds up toward the chest.
  let frontFlex = lerp(.1 + moving * lerp(.12, 1.2 - Math.cos(cycle - .12) * .5, run), 1.6, squat)
  let backFlex = lerp(.1 + moving * lerp(.12, 1.2 + Math.cos(cycle - .12) * .5, run), 1.6, squat)
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
  // Lower the pelvis when necessary; a planted foot must never be pulled off its anchor by IK.
  let supportDip = 0
  for (const [index, [ankle, planted]] of ([[frontAnkle, frontPlanted], [backAnkle, backPlanted]] as const).entries()) if (p.grounded && !p.mantle) {
    const rise = Math.sqrt(Math.max(0, 29 ** 2 - (ankle[0] - hip[0]) ** 2))
    const groundY = contacts ? contacts[index].groundY - p.y : 0
    const weight = planted ? 1 : smooth((ankle[1] - groundY + 8) / 5.2)
    supportDip = Math.max(supportDip, (ankle[1] - rise - (hip[1] + 1)) * weight)
  }
  if (supportDip) { hip[1] += supportDip; waist[1] += supportDip; shoulder[1] += supportDip; head[1] += supportDip }
  // Near and far joints coincide in profile; depth comes only from overlap.
  const frontRoot = () => add(shoulder, [0, .7]), backRoot = frontRoot
  let frontArm = armPose(frontRoot(), frontAngle, frontFlex), backArm = armPose(backRoot(), backAngle, backFlex)
  if (pushing) {
    const wall = (p.pushing!.wallX - p.x) * p.facing
    const press = (arm: Limb, y: number) => {
      const contactX = wall + (y + 43) * (p.pushing!.slope ?? 0) * p.facing
      const result = grippingArm(arm.root, [contactX - 2.8, y], [contactX - 1.6, y], arm, pushing)
      result.handAngle = (result.handAngle ?? 0) + (Math.PI / 2 - Math.atan((p.pushing!.slope ?? 0) * p.facing)) * pushing
      return result
    }
    frontArm = press(frontArm, -43); backArm = press(backArm, -46)
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
    contacts ? contacts[0].groundY - p.y : 0, (contacts?.[0].groundAngle ?? 0) * p.facing, terrainHeight)
  const backLeg = solveLeg(add(hip, [0, 1]), backAnkle, contacts ? contacts[1].angle * backFacing : lerp(backStep.angle * (1 - squat) * moving, .12, air), p.grounded, backPlanted, backFacing, 1 - air, -1,
    contacts ? contacts[1].groundY - p.y : 0, (contacts?.[1].groundAngle ?? 0) * p.facing, terrainHeight)
  const result = { hip, waist, shoulder, head, frontArm, backArm, frontLeg, backLeg }
  const resolved = p.sliding ? slidingPose(p, result) : p.wallBrace ? wallBracePose(p, result) : result
  if ((!p.grounded || p.sliding) && p.terrain) {
    resolved.frontLeg = clearAirborneFoot(p, resolved.frontLeg); resolved.backLeg = clearAirborneFoot(p, resolved.backLeg)
  }
  return resolved
}

/** Toes can meet a slope just before the body hull. Keep them on the air side. */
function clearAirborneFoot(p: Player, leg: Leg): Leg {
  let current = leg
  const target: Point = [...leg.end]
  for (let pass = 0; pass < 6; pass++) {
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
    current = { ...current, ...solve(current.root, target, 15, 14.5, -1, MIN_KNEE_OPENING) }
  }
  return current
}

/** Keep weight over staggered feet, with soft knees and small balance corrections. */
function slidingPose(p: Player, free: AthletePose): AthletePose {
  const s = p.sliding!, weight = smooth(s.amount)
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
    if (above < 2.8) { target[0] += nx * p.facing * (2.8 - above); target[1] += ny * (2.8 - above) }
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
  const brace = p.wallBrace!, wall = (brace.wallX - p.x) * p.facing
  const amount = smooth(Math.max(...brace.hands, ...brace.feet))
  // Use the same body and arm rig as a settled ground push, including its distance
  // from the wall. The physical capsule stays at the collision boundary.
  const pushDistance = 25.5
  const pushing = athletePose({ ...p, x: brace.wallX - p.facing * pushDistance,
    grounded: true, vx: 0, vy: 0, wallBrace: null, footwork: null, gait: gaitPose(0),
    crouch: 0, crouching: false, charging: false, reach: 0, landing: 0, groundAngle: 0,
    pushing: { wallX: brace.wallX, direction: p.facing, amount: 1, effort: 1 } })
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
    const braced = grippingArm(add(shoulder, [0, .7]), [wall - 2.8, y], [wall - 1.6, y], limb, contact)
    braced.handAngle = lerp(braced.handAngle ?? 0, Math.PI / 2, contact)
    return braced
  }
  const leg = (limb: Leg, weight: number, y: number): Leg => {
    const contact = smooth(weight)
    const target = mix(limb.end, [wall - 2.8, y], contact)
    const root = add(hip, [0, 1])
    const desired = lerp(limb.footAngle, -Math.PI / 2, contact)
    let result = solveLeg(root, target, desired, false)
    // Use the normal forward knee bend throughout the reach. Let the ankle flex
    // within its usual limits, then place the contacting part of the foot at the wall.
    for (let i = 0; i < 12; i++) {
      const reach = Math.max(...FOOT_CONTACT.map(point => footPoint(point, result.footAngle, result.toeAngle)[0]))
      target[0] = Math.min(wall - reach, lerp(limb.end[0], wall - reach, contact))
      result = solveLeg(root, target, desired, false)
    }
    return result
  }
  return { hip, waist, shoulder, head,
    frontArm: arm(free.frontArm, brace.hands[0], -43), backArm: arm(free.backArm, brace.hands[1], -46),
    frontLeg: leg(free.frontLeg, brace.feet[0], -13), backLeg: leg(free.backLeg, brace.feet[1], -17) }
}

/** A single dark-grey silhouette, shared by every pose and viewing direction. */
export function drawAthlete(ctx: CanvasRenderingContext2D, p: Player) {
  const { hip, waist, shoulder, head, frontArm, backArm, frontLeg, backLeg, backView = 0 } = athletePose(p)
  ctx.save(); ctx.translate(p.x, p.y); ctx.scale(p.facing, 1)
  const body = '#686b6e', backPose = !!p.climbing || backView > 0
  drawLeg(ctx, backLeg, body)
  drawArm(ctx, backArm, body)
  if (backPose) drawArm(ctx, frontArm, body)

  if (backPose) drawBack(ctx, hip, waist, shoulder, body, backView, Math.sign(p.climbing?.lean ?? 0) * p.facing || 1)
  else drawTorso(ctx, hip, waist, shoulder, body)
  drawLeg(ctx, frontLeg, body)
  fillShape(ctx, segmentPath([shoulder[0], shoulder[1] - 1], [head[0], head[1] + 4], 1.15, 1.15, 1.15), body)
  drawHead(ctx, head, body)
  if (!backPose) drawArm(ctx, frontArm, body)
  ctx.restore()
}
