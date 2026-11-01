// Athlete artwork: skin outlines and Canvas drawing of a solved pose.
import { androidMaterials, androidRearArmColor, drawAndroidArm, drawAndroidHead, drawAndroidLeg, drawAndroidTorso, traceAndroidShell } from './androidArtwork.ts'
import type { AndroidAppearance, AndroidMaterials } from './androidArtwork.ts'
import { drawAndroidPalmPlate, handGeometry, traceAndroidHand } from './androidHand.ts'
import { footContours, handOutline } from './athleteClearance.ts'
import { athletePose, presentedAthletePose } from './athletePose.ts'
import { FOREARM, HEAD_RADIUS, TAU, add, lerp } from './athleteRig.ts'
import type { AthletePose, Leg } from './athleteRig.ts'
import { footPoint } from './footwork.ts'
import type { Limb, Point } from './limbPose.ts'
import { drawSleeve } from './sleeveArtwork.ts'
import type { Player } from './characterTypes.ts'

export type AthleteOutline = Pick<CanvasPath, 'moveTo' | 'lineTo' | 'quadraticCurveTo' | 'bezierCurveTo' | 'ellipse' | 'closePath'>
const SHOULDER_SOCKET_RADIUS = 1.2
const NECK_ART_RADIUS = 1.5
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
function footPath(ankle: Point, angle: number, facing = 1, toeAngle = 0, profile = 1, scale = 1): Path2D {
  const path = new Path2D(); traceFoot(path, ankle, angle, facing, toeAngle, profile, scale); return path
}
function traceFoot(path: AthleteOutline, ankle: Point, angle: number, facing = 1, toeAngle = 0, profile = 1, scale = 1) {
  const at = (p: Point, toe: boolean): Point => {
    const point = footPoint([p[0] * scale, p[1]], angle * facing, toeAngle * facing, toe)
    return [ankle[0] + point[0] * facing * profile, ankle[1] + point[1]]
  }
  for (const [toe, contours] of footContours) {
    path.moveTo(...at(contours[0][0], toe))
    for (const contour of contours) {
      if (contour.length === 2) path.lineTo(...at(contour[1], toe))
      else if (contour.length === 3) path.quadraticCurveTo(...at(contour[1], toe), ...at(contour[2], toe))
      else path.bezierCurveTo(...at(contour[1], toe), ...at(contour[2], toe), ...at(contour[3], toe))
    }
    path.closePath()
  }
}
function drawLeg(ctx: CanvasRenderingContext2D, limb: Leg, color: string, materials: AndroidMaterials, calfScale = 1, footScale = 1, shellWidth = 1) {
  const path = joined([segmentPath(limb.root, limb.joint, 2.2, 1.65, 2.2), roundPath(limb.joint, 1.7),
    segmentPath(limb.joint, limb.end, 1.7, 1.25, 1.8), roundPath(limb.end, 1.3)])
  fillShape(ctx, path, materials.joint)
  drawAndroidLeg(ctx, limb, color, calfScale, shellWidth)
  if (limb.rear) fillShape(ctx, roundPath(add(limb.end, [0, 1]), 2.1 * limb.rear * footScale, 1.8), materials.grip)
  if ((limb.rear ?? 0) < 1) fillShape(ctx, footPath(limb.end, limb.footAngle, limb.footFacing, limb.toeAngle, 1 - (limb.rear ?? 0), footScale), materials.grip)
}
function drawArm(ctx: CanvasRenderingContext2D, limb: Limb, color: string, materials: AndroidMaterials, forearmScale = 1, handScale = 1, shellWidth = 1, rear = false) {
  const { palm } = handGeometry(limb), hand = new Path2D()
  traceAndroidHand(hand, limb, handScale)
  const wrist = Math.hypot(palm[0] - limb.end[0], palm[1] - limb.end[1]) > .01 ? [segmentPath(limb.end, palm, .75, .65, .75)] : []
  const path = joined([roundPath(limb.root, SHOULDER_SOCKET_RADIUS), segmentPath(limb.root, limb.joint, SHOULDER_SOCKET_RADIUS, 1.35, SHOULDER_SOCKET_RADIUS), roundPath(limb.joint, 1.4),
    segmentPath(limb.joint, limb.end, 1.4, .75, 1.3), ...wrist, hand])
  fillShape(ctx, path, materials.joint)
  drawAndroidArm(ctx, limb, rear ? androidRearArmColor(materials) : color, forearmScale, shellWidth)
  fillShape(ctx, hand, materials.grip)
  drawAndroidPalmPlate(ctx, limb, color, handScale)
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
function neckPoints(shoulder: Point, head: Point, tilt = 0): [Point, Point] {
  const sin = Math.sin(tilt), cos = Math.cos(tilt)
  return [[shoulder[0] + sin, shoulder[1] - cos], [head[0] - sin * 4, head[1] + cos * 4]]
}
/** Keep the neck shaft fixed, then ease its base into the shoulder line. */
function traceNeckArtwork(path: AthleteOutline, pose: AthletePose) {
  const { shoulder, waist, head } = pose, [base, top] = neckPoints(shoulder, head, pose.headTilt)
  const length = Math.hypot(top[0] - base[0], top[1] - base[1]) || 1
  const axis: Point = [(top[0] - base[0]) / length, (top[1] - base[1]) / length], side: Point = [-axis[1], axis[0]]
  const chest = Math.hypot(waist[0] - shoulder[0], waist[1] - shoulder[1]) || 1
  const down: Point = [(waist[0] - shoulder[0]) / chest, (waist[1] - shoulder[1]) / chest]
  const across: Point = [down[1], -down[0]]
  if (across[0] * side[0] + across[1] * side[1] < 0) { across[0] *= -1; across[1] *= -1 }
  const seat = add(shoulder, down), at = (point: Point, normal: Point, radius: number) => add(point, [normal[0] * radius, normal[1] * radius])
  const right = at(base, side, NECK_ART_RADIUS), left = at(base, side, -NECK_ART_RADIUS)
  const seatRight = at(seat, across, 2.2), seatLeft = at(seat, across, -2.2)
  // Separate the shaft from its flared seat. Their union keeps the neckline
  // intact when a folded chest rotates past it, without a crossing contour.
  traceSegment(path, base, top, NECK_ART_RADIUS, NECK_ART_RADIUS, NECK_ART_RADIUS)
  const collar = [seatRight, right, left, seatLeft]
  const center: Point = [collar.reduce((n, point) => n + point[0], 0) / 4, collar.reduce((n, point) => n + point[1], 0) / 4]
  collar.sort((a, b) => Math.atan2(b[1] - center[1], b[0] - center[0]) - Math.atan2(a[1] - center[1], a[0] - center[0]))
  path.moveTo(...collar[0]); for (const point of collar.slice(1)) path.lineTo(...point); path.closePath()
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

/** Trace the original contact skin independently of the cosmetic shell. */
function traceAthleteSkin(path: AthleteOutline, p: Player, pose: AthletePose, includeHead: boolean, footScale = 1, handScale = 1, artwork = false) {
  const { hip, waist, shoulder, head, backView = 0 } = pose
  const round = (center: Point, rx: number, ry = rx, angle = 0) => {
    path.ellipse(...center, rx, ry, angle, 0, TAU, true); path.closePath()
  }
  for (const leg of [pose.backLeg, pose.frontLeg]) {
    traceSegment(path, leg.root, leg.joint, 2.2, 1.65, 2.2); round(leg.joint, 1.7)
    traceSegment(path, leg.joint, leg.end, 1.7, 1.25, 1.8); round(leg.end, 1.3)
    if (leg.rear) round(add(leg.end, [0, 1]), 2.1 * leg.rear * footScale, 1.8)
    if ((leg.rear ?? 0) < 1) traceFoot(path, leg.end, leg.footAngle, leg.footFacing, leg.toeAngle, 1 - (leg.rear ?? 0), footScale)
  }
  for (const arm of [pose.backArm, pose.frontArm]) {
    const { palm } = handGeometry(arm)
    // The slimmer visible socket must share its silhouette with shadows;
    // physical clearance retains the existing shoulder and upper-arm skin.
    const shoulderRadius = artwork ? SHOULDER_SOCKET_RADIUS : 1.65, upperRadius = artwork ? SHOULDER_SOCKET_RADIUS : 1.6
    round(arm.root, shoulderRadius); traceSegment(path, arm.root, arm.joint, upperRadius, 1.35, upperRadius); round(arm.joint, 1.4)
    if (artwork) {
      traceSegment(path, arm.joint, arm.end, 1.4, .75, 1.3)
      if (Math.hypot(palm[0] - arm.end[0], palm[1] - arm.end[1]) > .01) traceSegment(path, arm.end, palm, .75, .65, .75)
      traceAndroidHand(path, arm, handScale)
    } else {
      traceSegment(path, arm.joint, arm.end, 1.4, 1.05, 1.45)
      const points = handOutline(arm)
      path.moveTo(...points[0]); for (const point of points.slice(1)) path.lineTo(...point); path.closePath()
    }
  }
  if (p.climbing || backView > 0) traceBack(path, hip, waist, shoulder, backView, Math.sign(p.climbing?.lean ?? 0) * p.facing || 1)
  else traceTorso(path, hip, waist, shoulder)
  if (artwork) traceNeckArtwork(path, pose)
  else {
    const [neck, nape] = neckPoints(shoulder, head, pose.headTilt)
    traceSegment(path, neck, nape, 1.15, 1.15, 1.15)
  }
  if (includeHead) round(head, HEAD_RADIUS)
}

export function traceAthlete(path: AthleteOutline, p: Player, pose = athletePose(p)) {
  traceAthleteSkin(path, p, pose, true)
}

/** The shell casts light shadows without becoming part of the contact rig. */
export function traceAthleteArtwork(path: AthleteOutline, p: Player, pose = presentedAthletePose(p)) {
  traceAthleteSkin(path, p, pose, false, pose.footScale, pose.handScale, true)
  traceAndroidShell(path, pose, !!p.climbing || (pose.backView ?? 0) > 0)
}

export const NIGHT_PLAYER_COLOR = '#e5e7e6'
/** The android shell follows the original solved joints and contact rig. */
export function drawAthlete(ctx: CanvasRenderingContext2D, p: Player, body: AndroidAppearance = '#686b6e', pose = presentedAthletePose(p)) {
  const { hip, waist, shoulder, head, frontArm, backArm, frontLeg, backLeg, backView = 0, headTilt } = pose
  ctx.save(); ctx.translate(p.x, p.y); ctx.scale(p.facing, p.inverted ? -1 : 1)
  const materials = androidMaterials(body), shell = materials.shell
  const sleeve = (arm: Limb) => {
    const tool = p.heldTool
    if (!tool) return
    ctx.save(); ctx.translate((arm.joint[0] + arm.end[0]) / 2, (arm.joint[1] + arm.end[1]) / 2)
    ctx.rotate(Math.atan2(arm.end[1] - arm.joint[1], arm.end[0] - arm.joint[0]))
    // The arm folds through depth during grips and swings. Its cuff shares
    // that foreshortening rather than keeping a full side-on gun silhouette.
    ctx.scale(Math.min(1, Math.hypot(arm.end[0] - arm.joint[0], arm.end[1] - arm.joint[1]) / FOREARM), 1)
    // This local arm frame inherits the body's horizontal reflection. Turning
    // keeps the top panel on top, instead of rolling the sleeve upside down.
    drawSleeve(ctx, tool.kind, tool.size, tool.blocked); ctx.restore()
  }
  const backPose = !!p.climbing || backView > 0
  drawLeg(ctx, backLeg, materials.rear, materials, pose.calfScale, pose.footScale, pose.shellWidth)
  drawArm(ctx, backArm, materials.rear, materials, pose.forearmScale, pose.handScale, pose.shellWidth, true)
  if (p.facing < 0) sleeve(backArm)
  if (backPose) {
    drawArm(ctx, frontArm, shell, materials, pose.forearmScale, pose.handScale, pose.shellWidth)
    if (p.facing >= 0) sleeve(frontArm)
  }

  if (backPose) drawBack(ctx, hip, waist, shoulder, materials.joint, backView, Math.sign(p.climbing?.lean ?? 0) * p.facing || 1)
  else drawTorso(ctx, hip, waist, shoulder, materials.joint)
  const neck = new Path2D(); traceNeckArtwork(neck, pose); fillShape(ctx, neck, materials.joint)
  drawAndroidTorso(ctx, pose, backPose, materials)
  drawLeg(ctx, frontLeg, shell, materials, pose.calfScale, pose.footScale, pose.shellWidth)
  drawAndroidHead(ctx, head, headTilt ?? 0, materials, pose.shellWidth)
  if (!backPose) {
    drawArm(ctx, frontArm, shell, materials, pose.forearmScale, pose.handScale, pose.shellWidth)
    if (p.facing >= 0) sleeve(frontArm)
  }
  ctx.restore()
}
