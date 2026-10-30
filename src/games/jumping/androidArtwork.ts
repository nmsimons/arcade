import type { AthleteOutline, AthletePose } from './athlete.ts'

type Point = readonly [number, number]
type Limb = { root: Point; joint: Point; end: Point }
export interface AndroidMaterials {
  shell: string; rear: string; joint: string; grip: string; mark: string; cranial: string; face: string
}
export type AndroidAppearance = string | AndroidMaterials
const day: AndroidMaterials = {
  shell: '#b5bdb2', rear: '#a9b7ad', joint: '#657a70',
  grip: '#697d70', mark: '#8ba58e', cranial: '#a9b7ad', face: '#b8c0b5',
}
const night: AndroidMaterials = {
  // Joints, grips and the back of the head must survive both the night
  // exposure floor and the translucent water overlay at phone scale.
  shell: '#d8ded5', rear: '#adbfaa', joint: '#a5b7a8',
  grip: '#a8bda9', mark: '#bdcfb4', cranial: '#a8bda9', face: '#d4dccf',
}

/** Explicit diagnostic inks draw the same shell as a monochrome mask. */
export function androidMaterials(ink: AndroidAppearance): AndroidMaterials {
  if (typeof ink !== 'string') return ink
  // The back wall remains at ambient exposure inside a spotlight. Mid-tone
  // metal disappears against it when the robot receives full light.
  if (ink === '#b66d65') return { shell: ink, rear: '#925f59', joint: '#26322c', grip: '#344237', mark: '#ccad72', cranial: '#9b625b', face: '#d0c6af' }
  if (ink === '#e5e7e6') return night
  if (ink === '#686b6e' || ink === '#303c36') return day
  return { shell: ink, rear: ink, joint: ink, grip: ink, mark: ink, cranial: ink, face: ink }
}

const daylightMaterials: (AndroidMaterials | undefined)[] = []
/** Preserve each material while easing between the established night/day
 * palettes. Reuse the finite set of colors across every lighting replay. */
export function androidDaylightMaterials(daylight: number): AndroidMaterials {
  const t = Math.max(0, Math.min(1, daylight)), index = Math.round(t * t * (3 - 2 * t) * 255)
  if (index === 0) return night
  if (index === 255) return day
  const saved = daylightMaterials[index]
  if (saved) return saved
  const amount = index / 255, materials = {} as AndroidMaterials
  for (const key of Object.keys(day) as (keyof AndroidMaterials)[]) {
    const from = parseInt(night[key].slice(1), 16), to = parseInt(day[key].slice(1), 16)
    materials[key] = '#' + [16, 8, 0].map(shift => {
      const a = from >> shift & 255, b = to >> shift & 255
      return Math.round(a + (b - a) * amount).toString(16).padStart(2, '0')
    }).join('')
  }
  daylightMaterials[index] = materials
  return materials
}

const rearArmColors = new WeakMap<AndroidMaterials, string>()
/** Separate the far arm from the chest without changing hands or leg colors.
 * Diagnostic monochrome inks stay monochrome; lighting palettes are cached. */
export function androidRearArmColor(materials: AndroidMaterials): string {
  const saved = rearArmColors.get(materials)
  if (saved) return saved
  const { rear, joint } = materials
  if (rear === joint || !/^#[\da-f]{6}$/i.test(rear) || !/^#[\da-f]{6}$/i.test(joint)) return rear
  const from = parseInt(rear.slice(1), 16), to = parseInt(joint.slice(1), 16)
  const color = '#' + [16, 8, 0].map(shift => Math.round((from >> shift & 255) * .75 + (to >> shift & 255) * .25)
    .toString(16).padStart(2, '0')).join('')
  rearArmColors.set(materials, color)
  return color
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
function armShell(path: AthleteOutline, limb: Limb, forearmScale = 1, width = 1) {
  // Cap the lower shoulder socket while leaving its articulation and the
  // elbow visible. Bone lengths, plate widths and working hands stay fixed.
  panel(path, along(limb.root, limb.joint, .16), along(limb.root, limb.joint, .74), 2.5 * width, 1.95 * width)
  panel(path, along(limb.joint, limb.end, .22), along(limb.joint, limb.end, .86), 2.15 * width, 1.6 * forearmScale * width)
}
function legShell(path: AthleteOutline, limb: Limb, calfScale = 1, width = 1) {
  panel(path, along(limb.root, limb.joint, .04), along(limb.root, limb.joint, .8), 3 * width, 2.35 * width)
  panel(path, along(limb.joint, limb.end, .15), along(limb.joint, limb.end, .88), 2.25 * width, 1.6 * calfScale * width)
}
function torso(path: AthleteOutline, pose: AthletePose, back: boolean) {
  const { hip, waist, shoulder } = pose
  const at = (p: Point, width: number, offset = 0): Point => {
    width *= pose.shellWidth ?? 1
    const a = p === hip ? waist : shoulder, b = p === shoulder ? waist : hip
    const dx = b[0] - a[0], dy = b[1] - a[1], length = Math.hypot(dx, dy) || 1
    return [p[0] + (dy * width + dx * offset) / length, p[1] + (dy * offset - dx * width) / length]
  }
  const rear = back ? pose.backView ?? 0 : 0, width = 3.8 + rear * 1.2
  // Expose the neck above a soft chest edge in profile. The back view raises
  // that edge to meet the wider shoulders without leaving a broad dark band.
  const inset = .9 + rear * .9, collar = 1 - rear * 1.3, drop = 2 + rear * .1
  path.moveTo(...at(shoulder, -width + inset, collar))
  path.lineTo(...at(shoulder, -width, drop)); path.lineTo(...at(waist, -3.1, -.8))
  path.quadraticCurveTo(...at(waist, 0, .8), ...at(waist, 3.1, -.8))
  path.lineTo(...at(shoulder, width, drop)); path.lineTo(...at(shoulder, width - inset, collar))
  path.quadraticCurveTo(...at(shoulder, 0, collar - .6), ...at(shoulder, -width + inset, collar)); path.closePath()
  // Pelvis and chest articulate independently across the original waist.
  path.moveTo(...at(hip, -3.5, -1.6)); path.lineTo(...at(hip, -4.2, .1))
  path.lineTo(...at(hip, -2.7, 3.5)); path.quadraticCurveTo(...at(hip, 0, 4.2), ...at(hip, 2.7, 3.5))
  path.lineTo(...at(hip, 4.2, .1)); path.lineTo(...at(hip, 3.5, -1.6)); path.closePath()
}
function headPoint(head: Point, tilt: number, width = 1) {
  return (x: number, y: number): [number, number] => [head[0] + x * width * Math.cos(tilt) - y * Math.sin(tilt), head[1] + x * width * Math.sin(tilt) + y * Math.cos(tilt)]
}
function headFront(path: AthleteOutline, at: ReturnType<typeof headPoint>) {
  path.moveTo(...at(-.5, -5.8))
  path.bezierCurveTo(...at(3.3, -5.8), ...at(5.6, -4), ...at(5.6, -1.4))
  path.lineTo(...at(5.6, 2))
  path.bezierCurveTo(...at(5.6, 4.5), ...at(3.4, 5.7), ...at(.7, 5.7))
}
function headShell(path: AthleteOutline, head: Point, tilt: number, width = 1) {
  const at = headPoint(head, tilt, width)
  headFront(path, at)
  path.bezierCurveTo(...at(-3.6, 5.7), ...at(-5.5, 3.6), ...at(-5.5, .1))
  path.bezierCurveTo(...at(-5.5, -3.3), ...at(-3.9, -5.8), ...at(-.5, -5.8)); path.closePath()
}
function shape(trace: (path: AthleteOutline) => void) {
  const path = new Path2D(); trace(path); return path
}
export function drawAndroidArm(ctx: CanvasRenderingContext2D, limb: Limb, color: string, forearmScale = 1, width = 1) {
  ctx.fillStyle = color; ctx.fill(shape(path => armShell(path, limb, forearmScale, width)))
}
export function drawAndroidLeg(ctx: CanvasRenderingContext2D, limb: Limb, color: string, calfScale = 1, width = 1) {
  ctx.fillStyle = color; ctx.fill(shape(path => legShell(path, limb, calfScale, width)))
}
export function drawAndroidTorso(ctx: CanvasRenderingContext2D, pose: AthletePose, back: boolean, materials: AndroidMaterials) {
  const body = shape(path => torso(path, pose, back))
  ctx.fillStyle = materials.shell; ctx.fill(body)
  ctx.save(); ctx.clip(body); ctx.fillStyle = materials.mark
  ctx.fill(shape(path => panel(path, along(pose.shoulder, pose.waist, .36), along(pose.shoulder, pose.waist, .58), .7, .7)))
  ctx.restore()
}
export function drawAndroidHead(ctx: CanvasRenderingContext2D, head: Point, tilt: number, materials: AndroidMaterials, width = 1) {
  ctx.save(); ctx.translate(...head); ctx.rotate(tilt)
  const outer = shape(path => headShell(path, [0, 0], 0, width))
  const at = headPoint([0, 0], 0, width)
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
  for (const limb of [pose.backLeg, pose.frontLeg]) legShell(path, limb, pose.calfScale, pose.shellWidth)
  for (const limb of [pose.backArm, pose.frontArm]) armShell(path, limb, pose.forearmScale, pose.shellWidth)
  torso(path, pose, back); headShell(path, pose.head, pose.headTilt ?? 0, pose.shellWidth)
}
