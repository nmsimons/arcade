import type { AthleteOutline, AthletePose } from './athlete.ts'

type Point = readonly [number, number]
type Limb = { root: Point; joint: Point; end: Point }
export interface AndroidMaterials {
  shell: string; rear: string; joint: string; grip: string; mark: string; cranial: string; face: string
}
const day: AndroidMaterials = {
  shell: '#b5bdb2', rear: '#a9b7ad', joint: '#657a70',
  grip: '#697d70', mark: '#8ba58e', cranial: '#a9b7ad', face: '#b8c0b5',
}
const night: AndroidMaterials = {
  shell: '#d8ded5', rear: '#adbfaa', joint: '#8ca291',
  grip: '#9cb29e', mark: '#bdcfb4', cranial: '#9cb19d', face: '#d4dccf',
}

/** Explicit diagnostic inks draw the same shell as a monochrome mask. */
export function androidMaterials(ink: string): AndroidMaterials {
  if (ink === '#e5e7e6') return night
  if (ink === '#686b6e' || ink === '#303c36') return day
  return { shell: ink, rear: ink, joint: ink, grip: ink, mark: ink, cranial: ink, face: ink }
}
const along = (a: Point, b: Point, t: number): Point => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]

/** Shell plates follow the bones but have their own width. These paths are artwork
 * only; the controller and contact rig never query them. */
function panel(path: AthleteOutline, a: Point, b: Point, from: number, to: number) {
  const dx = b[0] - a[0], dy = b[1] - a[1], length = Math.hypot(dx, dy) || 1
  const at = (p: Point, width: number): Point => [p[0] - dy / length * width, p[1] + dx / length * width]
  path.moveTo(...at(a, from)); path.lineTo(...at(b, to))
  path.quadraticCurveTo(b[0] + dx / length * to, b[1] + dy / length * to, ...at(b, -to))
  path.lineTo(...at(a, -from))
  path.quadraticCurveTo(a[0] - dx / length * from, a[1] - dy / length * from, ...at(a, from)); path.closePath()
}
function armShell(path: AthleteOutline, limb: Limb) {
  panel(path, along(limb.root, limb.joint, .06), along(limb.root, limb.joint, .78), 2.5, 1.95)
  panel(path, along(limb.joint, limb.end, .18), along(limb.joint, limb.end, .86), 2.15, 1.6)
}
function legShell(path: AthleteOutline, limb: Limb) {
  panel(path, along(limb.root, limb.joint, .04), along(limb.root, limb.joint, .8), 3, 2.35)
  panel(path, along(limb.joint, limb.end, .15), along(limb.joint, limb.end, .88), 2.25, 1.6)
}
function torso(path: AthleteOutline, pose: AthletePose, back: boolean) {
  const { hip, waist, shoulder } = pose
  const at = (p: Point, width: number, offset = 0): Point => {
    const a = p === hip ? waist : shoulder, b = p === shoulder ? waist : hip
    const dx = b[0] - a[0], dy = b[1] - a[1], length = Math.hypot(dx, dy) || 1
    return [p[0] + (dy * width + dx * offset) / length, p[1] + (dy * offset - dx * width) / length]
  }
  const width = 3.8 + (back ? (pose.backView ?? 0) * 1.2 : 0)
  path.moveTo(...at(shoulder, -width + .9, -1))
  path.lineTo(...at(shoulder, -width, .6)); path.lineTo(...at(waist, -3.1, -.8))
  path.quadraticCurveTo(...at(waist, 0, .8), ...at(waist, 3.1, -.8))
  path.lineTo(...at(shoulder, width, .6)); path.lineTo(...at(shoulder, width - .9, -1)); path.closePath()
  // Pelvis and chest articulate independently across the original waist.
  path.moveTo(...at(hip, -3.5, -1.6)); path.lineTo(...at(hip, -4.2, .1))
  path.lineTo(...at(hip, -2.7, 3.5)); path.quadraticCurveTo(...at(hip, 0, 4.2), ...at(hip, 2.7, 3.5))
  path.lineTo(...at(hip, 4.2, .1)); path.lineTo(...at(hip, 3.5, -1.6)); path.closePath()
}
function headPoint(head: Point, tilt: number) {
  return (x: number, y: number): [number, number] => [head[0] + x * Math.cos(tilt) - y * Math.sin(tilt), head[1] + x * Math.sin(tilt) + y * Math.cos(tilt)]
}
function headFront(path: AthleteOutline, at: ReturnType<typeof headPoint>) {
  path.moveTo(...at(-.5, -5.8))
  path.bezierCurveTo(...at(3.3, -5.8), ...at(5.6, -4), ...at(5.6, -1.4))
  path.lineTo(...at(5.6, 2))
  path.bezierCurveTo(...at(5.6, 4.5), ...at(3.4, 5.7), ...at(.7, 5.7))
}
function headShell(path: AthleteOutline, head: Point, tilt: number) {
  const at = headPoint(head, tilt)
  headFront(path, at)
  path.bezierCurveTo(...at(-3.6, 5.7), ...at(-5.5, 3.6), ...at(-5.5, .1))
  path.bezierCurveTo(...at(-5.5, -3.3), ...at(-3.9, -5.8), ...at(-.5, -5.8)); path.closePath()
}
function shape(trace: (path: AthleteOutline) => void) {
  const path = new Path2D(); trace(path); return path
}
export function drawAndroidArm(ctx: CanvasRenderingContext2D, limb: Limb, color: string) {
  ctx.fillStyle = color; ctx.fill(shape(path => armShell(path, limb)))
}
export function drawAndroidLeg(ctx: CanvasRenderingContext2D, limb: Limb, color: string) {
  ctx.fillStyle = color; ctx.fill(shape(path => legShell(path, limb)))
}
export function drawAndroidTorso(ctx: CanvasRenderingContext2D, pose: AthletePose, back: boolean, materials: AndroidMaterials) {
  const body = shape(path => torso(path, pose, back))
  ctx.fillStyle = materials.shell; ctx.fill(body)
  ctx.save(); ctx.clip(body); ctx.fillStyle = materials.mark
  ctx.fill(shape(path => panel(path, along(pose.shoulder, pose.waist, .36), along(pose.shoulder, pose.waist, .58), .7, .7)))
  ctx.restore()
}
export function drawAndroidHead(ctx: CanvasRenderingContext2D, head: Point, tilt: number, materials: AndroidMaterials) {
  ctx.save(); ctx.translate(...head); ctx.rotate(tilt)
  const outer = shape(path => headShell(path, [0, 0], 0))
  const at = headPoint([0, 0], 0)
  const face = new Path2D(); headFront(face, at)
  face.bezierCurveTo(...at(-1.3, 3.5), ...at(-1.8, -3.8), ...at(-.5, -5.8)); face.closePath()
  // Adjacent color regions share one opacity rather than stacking during
  // the entrance/exit fade. The contact head remains the original round rig.
  const shell = new Path2D(outer); shell.addPath(face)
  ctx.fillStyle = materials.cranial; ctx.fill(shell, 'evenodd')
  ctx.fillStyle = materials.face; ctx.fill(face)
  ctx.restore()
}

/** Lighting uses the shell silhouette. Physical clearance retains the
 * separate, original traceAthlete skin and the existing locomotion hull. */
export function traceAndroidShell(path: AthleteOutline, pose: AthletePose, back: boolean) {
  for (const limb of [pose.backLeg, pose.frontLeg]) legShell(path, limb)
  for (const limb of [pose.backArm, pose.frontArm]) armShell(path, limb)
  torso(path, pose, back); headShell(path, pose.head, pose.headTilt ?? 0)
}
