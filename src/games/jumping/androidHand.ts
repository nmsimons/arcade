import type { AthleteOutline } from './athlete.ts'
import type { Limb, Point } from './limbPose.ts'

/** Approved size relative to the first hand study. Contact depth stays 1.6. */
export const ANDROID_HAND_SIZE = 1.12
export const HAND_CLEARANCE_REACH = 2.1 * ANDROID_HAND_SIZE

/** The existing wrist/palm frame is shared by art and contact clearance. */
export function handGeometry(limb: Limb) {
  const forearmAngle = Math.atan2(limb.end[1] - limb.joint[1], limb.end[0] - limb.joint[0])
  const angle = limb.handAngle ?? forearmAngle
  const palm: Point = limb.hand ?? [limb.end[0] + Math.cos(angle) * 1.4, limb.end[1] + Math.sin(angle) * 1.4]
  return { palm, angle }
}

/** An open working palm points its fingers up the face. Its wrist joins the
 * heel of the hand while the existing palm contact keeps its 1.6-unit depth. */
export function pushPalmFrame(point: Point, normal: Point) {
  return { wrist: [point[0] + normal[0] * 2.8 + normal[1] * .7,
    point[1] + normal[1] * 2.8 - normal[0] * .7] as Point,
    palm: [point[0] + normal[0] * 1.6, point[1] + normal[1] * 1.6] as Point,
    angle: Math.atan2(normal[0], -normal[1]) }
}

/** A quiet palm plane, rounded fingers and a thumb notch use the approved
 * hand size. Its 1.568-unit palm depth fits the original contact plane.
 * The contour winds with the other joint artwork so overlaps remain solid. */
export function traceAndroidHand(path: Pick<AthleteOutline, 'moveTo' | 'lineTo' | 'quadraticCurveTo' | 'closePath'>, limb: Limb, scale = 1) {
  scale *= ANDROID_HAND_SIZE
  const open = Math.max(0, Math.min(1, limb.handOpen ?? 0))
  const blend = (a: number, b: number) => a + (b - a) * open
  const { palm, angle } = handGeometry(limb), cos = Math.cos(angle), sin = Math.sin(angle)
  const at = (x: number, y: number): Point => [palm[0] + (x * cos - y * sin) * scale, palm[1] + (x * sin + y * cos) * scale]
  path.moveTo(...at(blend(-1.65, -1.6), blend(.45, .75)))
  path.lineTo(...at(blend(-1.25, -1.15), blend(.95, 1.25)))
  path.quadraticCurveTo(...at(blend(-.85, -.75), blend(1.25, 1.4)), ...at(blend(-.45, -.4), blend(.8, .7)))
  path.quadraticCurveTo(...at(-.35, 1.4), ...at(0, 1.4))
  path.lineTo(...at(blend(.85, 1.45), 1.4))
  path.quadraticCurveTo(...at(blend(1.35, 1.7), blend(1.15, 1.2)), ...at(blend(1.75, 1.8), blend(.8, .9)))
  path.quadraticCurveTo(...at(2.05, .4), ...at(2.05, 0))
  path.quadraticCurveTo(...at(2.05, -.4), ...at(1.75, -.8))
  path.quadraticCurveTo(...at(blend(1.35, 1.7), -1.15), ...at(blend(.85, 1.1), -1.4))
  path.lineTo(...at(-.65, -1.4))
  path.quadraticCurveTo(...at(-1.1, -1.25), ...at(-1.65, -.6))
  path.closePath()
}

/** The existing shell material distinguishes the back of the palm from its
 * dark finger pad. Broad color blocks survive gameplay scale without fingers
 * or decorative lines. The plate stays inside the shared outer contour. */
export function drawAndroidPalmPlate(ctx: CanvasRenderingContext2D, limb: Limb, color: string, scale = 1) {
  scale *= ANDROID_HAND_SIZE
  const open = Math.max(0, Math.min(1, limb.handOpen ?? 0)), plate = .85 - open * .3, back = .85 + open * .25
  const { palm, angle } = handGeometry(limb), cos = Math.cos(angle), sin = Math.sin(angle)
  const at = (x: number, y: number): Point => [palm[0] + (x * cos - y * sin) * scale, palm[1] + (x * sin + y * cos) * scale]
  const path = new Path2D()
  // Meet the outer palm planes rather than enclosing a bright inset: a dark
  // ring around a tiny plate reads as a hole once the hand is only two pixels.
  path.moveTo(...at(-.65, -1.4)); path.lineTo(...at(back, -1.4))
  path.lineTo(...at(plate, 1.4)); path.lineTo(...at(0, 1.4))
  path.quadraticCurveTo(...at(-.35, 1.4), ...at(-.45, .8))
  path.lineTo(...at(-.55, .25)); path.lineTo(...at(-.8, .05)); path.lineTo(...at(-.8, -.7))
  path.quadraticCurveTo(...at(-1, -1.25), ...at(-.65, -1.4)); path.closePath()
  ctx.fillStyle = color; ctx.fill(path)
}
