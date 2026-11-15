import { ArtPath } from './webgl/artPath.ts'
import type { AthleteOutline } from './athleteDraw.ts'
import type { AthletePose } from './athleteRig.ts'
import { reportHead } from './debugFrames.ts'

type Point = readonly [number, number]
type Limb = { root: Point; joint: Point; end: Point }
export interface AndroidMaterials {
  shell: string; rear: string; joint: string; grip: string; mark: string; cranial: string; face: string
  /** The player's signal colour (the cell on its back) and its eye lights. Other bodies and the diagnostic
   * masks carry neither. */
  accent?: string; eye?: string
}
export type AndroidAppearance = string | AndroidMaterials
const day: AndroidMaterials = {
  // Neutral greys: a shell about 2.7:1 against the course wall, where the robot mostly stands, with dark
  // joints and grips (3.6 to 3.8:1 against the shell) that keep its outline and articulation readable over
  // terrain (docs/jumping-lighting.md).
  shell: '#919191', rear: '#818181', joint: '#363636',
  grip: '#3a3a3a', mark: '#cdcdcd', cranial: '#818181', face: '#9f9f9f',
  // The system display's phosphor green: no other body or pickup uses it.
  accent: '#a9ef82', eye: '#a9ef82',
}
const night: AndroidMaterials = {
  // The day greys, lightened: one robot by day and night. Joints and grips (about 1.7:1 against the shell)
  // and the back of the head stay light, as they must survive both the night exposure floor and the
  // translucent water overlay at phone scale: a little darker (#a4a4a4) and in shadow underwater they fall
  // under the readable contrast (tests/browser/jumpingPlayerVisibility.dev.spec.mjs).
  shell: '#e5e5e5', rear: '#c3c3c3', joint: '#b0b0b0',
  grip: '#b4b4b4', mark: '#f0f0f0', cranial: '#bfbfbf', face: '#eaeaea',
  accent: '#a9ef82', eye: '#a9ef82',
}

/** The player's build, wherever a pose does not set its own: a slightly small head, flared calves and a
 * broad chest over the same waist. Cosmetic, like the shell: contacts and clearance never see it. */
export function withAndroidBuild(pose: AthletePose): AthletePose {
  return pose.headScale !== undefined && pose.calfScale !== undefined && pose.chestScale !== undefined ? pose
    : { ...pose, headScale: pose.headScale ?? .9, calfScale: pose.calfScale ?? 1.85, chestScale: pose.chestScale ?? 1.18 }
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
    const from = parseInt(night[key]!.slice(1), 16), to = parseInt(day[key]!.slice(1), 16)
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
  const rear = back ? pose.backView ?? 0 : 0, width = (3.8 + rear * 1.2) * (pose.chestScale ?? 1)
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
function headShell(path: AthleteOutline, head: Point, tilt: number, width = 1, scale = 1) {
  const point = headPoint(head, tilt, width), at = (x: number, y: number) => point(x * scale, y * scale)
  headFront(path, at)
  path.bezierCurveTo(...at(-3.6, 5.7), ...at(-5.5, 3.6), ...at(-5.5, .1))
  path.bezierCurveTo(...at(-5.5, -3.3), ...at(-3.9, -5.8), ...at(-.5, -5.8)); path.closePath()
}
function shape(trace: (path: AthleteOutline) => void) {
  const path = new ArtPath(); trace(path); return path
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
  const spine = (from: number, to: number, width: number) =>
    ctx.fill(shape(path => panel(path, along(pose.shoulder, pose.waist, from), along(pose.shoulder, pose.waist, to), width, width)))
  ctx.save(); ctx.clip(body)
  if (materials.accent && back && (pose.backView ?? 0) >= .5) {
    // Seen from behind, a cell in the signal colour sits in a dark housing on the spine.
    ctx.fillStyle = materials.joint; spine(.26, .66, 1.9)
    ctx.fillStyle = materials.accent; spine(.34, .58, 1.05)
  } else { ctx.fillStyle = materials.mark; spine(.36, .58, .7) }
  ctx.restore()
}
/** As the head turns away its face foreshortens toward the leading edge of the skull. Shared with the lit
 * parts drawn over the head, in the head's own units. */
export function turnAndroidFace(ctx: CanvasRenderingContext2D, back: number, width = 1) {
  ctx.translate(5.6 * width, 0); ctx.scale(1 - Math.max(0, Math.min(1, back)), 1); ctx.translate(-5.6 * width, 0)
}
type Cubic = readonly [Point, Point, Point, Point]
function splitCubic([a, b, c, d]: Cubic, t: number): [Cubic, Cubic] {
  const ab = along(a, b, t), bc = along(b, c, t), cd = along(c, d, t), abc = along(ab, bc, t), bcd = along(bc, cd, t), middle = along(abc, bcd, t)
  return [[a, ab, abc, middle], [middle, bcd, cd, d]]
}
const straight = (a: Point, b: Point): Cubic => [a, along(a, b, 1 / 3), along(a, b, 2 / 3), b]
/** The faceplate as six curves, down its leading edge and back up its inner edge. In profile they are the
 * outline headFront and the inner curve draw; facing the camera the plate sits inside a rim of skull. */
const [innerLow, innerRest] = splitCubic([[.7, 5.7], [-1.3, 3.5], [-1.8, -3.8], [-.5, -5.8]], .35)
const [innerMiddle, innerHigh] = splitCubic(innerRest, (.65 - .35) / (1 - .35))
const PROFILE_FACE: Cubic[] = [[[-.5, -5.8], [3.3, -5.8], [5.6, -4], [5.6, -1.4]], straight([5.6, -1.4], [5.6, 2]), [[5.6, 2], [5.6, 4.5], [3.4, 5.7], [.7, 5.7]],
  innerLow, innerMiddle, innerHigh]
const FRONT_FACE: Cubic[] = [[[0, -4.7], [2.9, -4.7], [4.5, -3.4], [4.5, -1.3]], straight([4.5, -1.3], [4.5, 2]), [[4.5, 2], [4.5, 3.9], [2.7, 4.8], [0, 4.8]],
  [[0, 4.8], [-2.7, 4.8], [-4.5, 3.9], [-4.5, 2]], straight([-4.5, 2], [-4.5, -1.3]), [[-4.5, -1.3], [-4.5, -3.4], [-2.9, -4.7], [0, -4.7]]]
function turnedFace(front: number, width: number) {
  const path = new ArtPath()
  const at = (curve: number, point: number): [number, number] => { const [x, y] = along(PROFILE_FACE[curve][point], FRONT_FACE[curve][point], front); return [x * width, y] }
  path.moveTo(...at(0, 0))
  for (let curve = 0; curve < 6; curve++) path.bezierCurveTo(...at(curve, 1), ...at(curve, 2), ...at(curve, 3))
  path.closePath(); return path
}
/** Two round lights on a round face, each `spread` to its side of straight ahead. Profile shows the near one
 * edge-on, as an oval 0.6 as wide as it is tall; the far one comes round the leading edge as the head turns to
 * the camera, and full face shows both round. */
const SPREAD = Math.atan(.6)
const EYES = { radius: 1.55, reach: 3.4 / Math.cos(SPREAD), spread: SPREAD, y: -.5 }
/** Each visible eye in the head's own units: its centre and its half width, for a face turned `front` to the camera. */
export function androidEyes(front = 0): { x: number; y: number; rx: number; ry: number }[] {
  const toward = Math.PI / 2 * (1 - Math.max(0, Math.min(1, front)))
  return [-1, 1].flatMap(side => {
    const angle = toward + side * EYES.spread, facing = Math.cos(angle)
    return facing > .02 ? [{ x: Math.sin(angle) * EYES.reach, y: EYES.y, rx: EYES.radius * Math.min(1, facing / Math.cos(EYES.spread)), ry: EYES.radius }] : []
  })
}
/** The head, or only the lights in it (`lights`), which a caller draws again over the body at full exposure. */
function paintHead(ctx: CanvasRenderingContext2D, head: Point, tilt: number, materials: AndroidMaterials, width: number, scale: number, back: number, front: number, lights: boolean) {
  if (lights && (!materials.eye || back >= 1)) return
  ctx.save(); ctx.translate(...head); ctx.rotate(tilt); ctx.scale(scale, scale)
  const outer = shape(path => headShell(path, [0, 0], 0, width))
  if (back >= 1) { ctx.fillStyle = materials.cranial; ctx.fill(outer); ctx.restore(); return }
  let face: Path2D
  if (front > 0) face = turnedFace(Math.min(1, front), width)
  else {
    const at = headPoint([0, 0], 0, width)
    face = new ArtPath(); headFront(face, at)
    face.bezierCurveTo(...at(-1.3, 3.5), ...at(-1.8, -3.8), ...at(-.5, -5.8)); face.closePath()
  }
  if (back > 0 || front > 0) {
    // A turned face lies inside the skull's outline: toward the camera within a rim, away from it foreshortened.
    if (!lights) { ctx.fillStyle = materials.cranial; ctx.fill(outer) }
    ctx.clip(outer)
    if (back > 0) turnAndroidFace(ctx, back, width)
  } else if (!lights) {
    // Adjacent color regions share one opacity rather than stacking during
    // the entrance/exit fade. The contact head remains the original round rig.
    const shell = new ArtPath(outer); shell.addPath(face)
    ctx.fillStyle = materials.cranial; ctx.fill(shell, 'evenodd')
  }
  if (!lights) { ctx.fillStyle = materials.face; ctx.fill(face) }
  if (materials.eye) {
    // The lights turn with the face, and never spill onto the skull.
    ctx.clip(face); ctx.fillStyle = materials.eye
    ctx.fill(shape(path => { for (const eye of androidEyes(front)) { path.ellipse(eye.x * width, eye.y, eye.rx, eye.ry, 0, 0, Math.PI * 2, true); path.closePath() } }))
  }
  ctx.restore()
}
/** `back` turns the head away from the camera, where 1 shows only the back of the skull; `front` turns it to
 * face the camera, where 1 shows the whole faceplate and both eyes. */
export function drawAndroidHead(ctx: CanvasRenderingContext2D, head: Point, tilt: number, materials: AndroidMaterials, width = 1, scale = 1, back = 0, front = 0) {
  reportHead(ctx.canvas, () => ctx.getTransform(), head, ctx.globalAlpha, materials.face)
  paintHead(ctx, head, tilt, materials, width, scale, back, front, false)
}
/** Only the eye lights of the same head, for a pass that light and shadow do not reach. */
export function drawAndroidEyes(ctx: CanvasRenderingContext2D, head: Point, tilt: number, materials: AndroidMaterials, width = 1, scale = 1, back = 0, front = 0) {
  paintHead(ctx, head, tilt, materials, width, scale, back, front, true)
}

/** Lighting uses the shell silhouette. Physical clearance retains the
 * separate, original traceAthlete skin and the existing locomotion hull. */
export function traceAndroidShell(path: AthleteOutline, pose: AthletePose, back: boolean) {
  for (const limb of [pose.backLeg, pose.frontLeg]) legShell(path, limb, pose.calfScale, pose.shellWidth)
  for (const limb of [pose.backArm, pose.frontArm]) armShell(path, limb, pose.forearmScale, pose.shellWidth)
  torso(path, pose, back); headShell(path, pose.head, pose.headTilt ?? 0, pose.shellWidth, pose.headScale)
}
