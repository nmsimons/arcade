import type { NamedObject } from './objectNames.ts'
import { dryLength, pipeRust, wallWear, type WallWear } from './wallWear.ts'
import { ArtPath } from './webgl/artPath.ts'

/**
 * Pipework run along the back wall: a path of straight lengths with rounded elbows, flanged joints, wall straps
 * and rust weeping from the joints onto the wall below. It is placed, like the wiring, where a room would plumb
 * something: a pump, a tank, a basin. Flat 2D artwork: a body with one lit and one shaded band, no gradients.
 * Wall art only: no collision, grip, cover or light.
 */
export const PIPE_SIZES = [{ id: 'small', label: 'Small', diameter: 8 }, { id: 'medium', label: 'Medium', diameter: 14 }, { id: 'large', label: 'Large', diameter: 22 }] as const
export type PipeSize = typeof PIPE_SIZES[number]['id']
export const isPipeSize = (value: unknown): value is PipeSize => PIPE_SIZES.some(size => size.id === value)
export const pipeDiameter = (size: PipeSize = 'medium') => PIPE_SIZES.find(s => s.id === size)!.diameter

export interface WallPipe extends NamedObject {
  /** The run's points, in order: its two ends and every bend between them. */
  points: [number, number][]
  /** Medium unless set. */
  size?: PipeSize
}
export const MAX_WALL_PIPES = 40
export const MAX_PIPE_POINTS = 16

type Point = readonly [number, number]
const noise = (x: number, y: number) => { const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return n - Math.floor(n) }
const COLORS = { body: '#5b655f', lit: '#7f8b84', shade: '#424a45', flange: '#4b544e', flangeLit: '#8a958e', strap: '#373e3a', bolt: '#9aa49d', rust: 'rgba(104,66,36,.3)' }

/** A straight length between elbows: where it starts and ends, its direction and length. */
interface Run { from: Point; to: Point; ux: number; uy: number; length: number }
interface Plan { key: string; body: ArtPath; lit: ArtPath; shade: ArtPath; flanges: ArtPath; flangeLit: ArtPath; straps: ArtPath; bolts: ArtPath; rust: ArtPath; d: number }
const plans = new WeakMap<WallPipe, Plan>()

/** The centre line: straight runs joined by elbows that turn on a radius proportional to the pipe. */
function centreLine(points: readonly Point[], d: number) {
  const runs: Run[] = [], path = new ArtPath()
  const turns = points.map((p, i) => {
    if (i === 0 || i === points.length - 1) return 0
    const a = points[i - 1], b = points[i + 1]
    return Math.min(d * 1.2, Math.hypot(p[0] - a[0], p[1] - a[1]) / 2, Math.hypot(b[0] - p[0], b[1] - p[1]) / 2)
  })
  let start: Point = points[0]
  path.moveTo(...start)
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i], length = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1
    const ux = (b[0] - a[0]) / length, uy = (b[1] - a[1]) / length
    const end: Point = [b[0] - ux * turns[i], b[1] - uy * turns[i]]
    path.lineTo(...end)
    runs.push({ from: start, to: end, ux, uy, length: Math.hypot(end[0] - start[0], end[1] - start[1]) })
    if (i < points.length - 1) {
      const c = points[i + 1], next = Math.hypot(c[0] - b[0], c[1] - b[1]) || 1
      start = [b[0] + (c[0] - b[0]) / next * turns[i], b[1] + (c[1] - b[1]) / next * turns[i]]
      path.quadraticCurveTo(b[0], b[1], ...start)
    }
  }
  return { path, runs }
}

function plan(pipe: WallPipe, wear: WallWear): Plan {
  const d = pipeDiameter(pipe.size), key = `${pipe.size ?? ''}:${pipe.points.flat().join(',')}:${wear.stains}:${wear.salt}:${wear.wet.map(r => `${r.x},${r.y},${r.w},${r.h}`).join(';')}`
  const saved = plans.get(pipe)
  if (saved?.key === key) return saved
  const { path, runs } = centreLine(pipe.points, d)
  // The lit and shaded bands are the same line moved toward and away from the light (upper left): within the
  // body for runs in any direction, and through every elbow.
  const shifted = (offset: number) => { const line = new ArtPath(); line.addPath(path, { a: 1, b: 0, c: 0, d: 1, e: offset * d, f: offset * d }); return line }
  const flanges = new ArtPath(), flangeLit = new ArtPath(), straps = new ArtPath(), bolts = new ArtPath(), rust = new ArtPath()
  const across = (run: Run, at: number, along: number, wide: number, target: ArtPath) => {
    const cx = run.from[0] + run.ux * at, cy = run.from[1] + run.uy * at, nx = -run.uy, ny = run.ux
    const corner = (s: number, t: number): Point => [cx + run.ux * along * s + nx * wide * t, cy + run.uy * along * s + ny * wide * t]
    const quad = [corner(-.5, -.5), corner(.5, -.5), corner(.5, .5), corner(-.5, .5)]
    quad.forEach(([x, y], i) => i ? target.lineTo(x, y) : target.moveTo(x, y)); target.closePath()
    return { cx, cy, nx, ny }
  }
  const flange = (run: Run, at: number) => {
    const { cx, cy, nx, ny } = across(run, at, d * .36, d * 1.42, flanges)
    // A light edge on the flange's upper or left face.
    const side = nx + ny < 0 ? 1 : -1, x = cx + nx * d * .62 * side, y = cy + ny * d * .62 * side
    flangeLit.moveTo(x - run.ux * d * .18, y - run.uy * d * .18); flangeLit.lineTo(x + run.ux * d * .18, y + run.uy * d * .18)
    // Rust weeps from a joint on a level run down the wall below it, as much as the room is stained.
    const [sx, sy] = wear.salt, rust_ = pipeRust(wear, noise(cx + sx, cy + sy))
    if (Math.abs(run.uy) < .3 && rust_.weeps) {
      const width = d * (.22 + noise(cx * .3 + sx, cy + sy) * .2), top = cy + d * .45
      // Water washes the wall: rust stops where it would run into it.
      const length = dryLength(wear, cx - width / 2, cx + width / 2, top, d * (1.2 + noise(cy + sy, cx + sx) * 3.4) * rust_.length)
      rust.moveTo(cx - width / 2, top); rust.lineTo(cx + width / 2, top); rust.lineTo(cx + width * .2, top + length); rust.lineTo(cx - width * .3, top + length * .85); rust.closePath()
    }
  }
  for (const [i, run] of runs.entries()) {
    // Flanges at the run's ends (where it meets an elbow, or the end of the line) and along long lengths.
    if (run.length > d * .8) { flange(run, Math.min(run.length / 2, d * .3)); flange(run, Math.max(run.length / 2, run.length - d * .3)) }
    const between = Math.floor(run.length / 220)
    for (let k = 1; k <= between; k++) flange(run, run.length * k / (between + 1))
    // Wall straps hold every length, between the flanges, with a bolt either side.
    const straps_ = Math.max(run.length > d * 4 ? 1 : 0, Math.floor(run.length / 130))
    for (let k = 0; k < straps_; k++) {
      const at = run.length * (k + .5) / straps_ + (k === 0 && i % 2 ? d * .5 : 0)
      const { cx, cy, nx, ny } = across(run, at, d * .2, d * 1.12, straps)
      // Each bolt is its own closed circle: an ellipse continues the path from wherever it was.
      for (const side of [-1, 1]) {
        const bx = cx + nx * d * .74 * side, by = cy + ny * d * .74 * side
        bolts.moveTo(bx + d * .1, by); bolts.ellipse(bx, by, d * .1, d * .1, 0, 0, Math.PI * 2); bolts.closePath()
      }
    }
  }
  const made = { key, body: path, lit: shifted(-.2), shade: shifted(.21), flanges, flangeLit, straps, bolts, rust, d }
  plans.set(pipe, made)
  return made
}

/** Pipes on the back wall, behind terrain and everything in the room. */
export function drawWallPipes(ctx: CanvasRenderingContext2D, pipes: readonly WallPipe[], wear: WallWear = wallWear(), rust = true) {
  if (!pipes.length) return
  ctx.save()
  ctx.lineCap = 'butt'; ctx.lineJoin = 'round'
  for (const pipe of pipes) {
    if (pipe.points.length < 2) continue
    const p = plan(pipe, wear), d = p.d
    if (rust) { ctx.fillStyle = COLORS.rust; ctx.fill(p.rust) }
    ctx.strokeStyle = COLORS.body; ctx.lineWidth = d; ctx.stroke(p.body)
    ctx.strokeStyle = COLORS.shade; ctx.lineWidth = d * .22; ctx.stroke(p.shade)
    ctx.strokeStyle = COLORS.lit; ctx.lineWidth = d * .16; ctx.stroke(p.lit)
    ctx.fillStyle = COLORS.strap; ctx.fill(p.straps)
    ctx.fillStyle = COLORS.bolt; ctx.fill(p.bolts)
    ctx.fillStyle = COLORS.flange; ctx.fill(p.flanges)
    ctx.strokeStyle = COLORS.flangeLit; ctx.lineWidth = Math.max(.8, d * .08); ctx.stroke(p.flangeLit)
  }
  ctx.restore()
}

/**
 * The rust weeping from pipes' joints alone, for a wall that draws it earlier than the pipes: it is on the wall,
 * so a loose panel hanging in front of the wall covers it, while the pipes fixed over the panel do not.
 */
export function drawWallPipeRust(ctx: CanvasRenderingContext2D, pipes: readonly WallPipe[], wear: WallWear = wallWear()) {
  ctx.save(); ctx.fillStyle = COLORS.rust
  for (const pipe of pipes) if (pipe.points.length >= 2) ctx.fill(plan(pipe, wear).rust)
  ctx.restore()
}

/** Everything a pipe draws, its flanges included. */
export function wallPipeBounds(pipe: WallPipe) {
  const reach = pipeDiameter(pipe.size) * .75, xs = pipe.points.map(p => p[0]), ys = pipe.points.map(p => p[1])
  const x = Math.min(...xs) - reach, y = Math.min(...ys) - reach
  return { x, y, w: Math.max(...xs) + reach - x, h: Math.max(...ys) + reach - y }
}

/** Distance from (x, y) to the pipe's straight centre line. */
export function wallPipeDistance(pipe: WallPipe, x: number, y: number) {
  let best = Infinity
  for (let i = 1; i < pipe.points.length; i++) {
    const [ax, ay] = pipe.points[i - 1], [bx, by] = pipe.points[i], dx = bx - ax, dy = by - ay
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy || 1)))
    best = Math.min(best, Math.hypot(x - ax - dx * t, y - ay - dy * t))
  }
  return best
}
export const hitsWallPipe = (pipe: WallPipe, x: number, y: number, tolerance: number) => wallPipeDistance(pipe, x, y) <= pipeDiameter(pipe.size) / 2 + tolerance

/** Where a click on the pipe would add a bend: the nearest length within reach, and the point on it. */
export function wallPipeEdgeAt(pipe: WallPipe, x: number, y: number, tolerance: number): { edge: number; x: number; y: number } | null {
  let best: { edge: number; x: number; y: number; distance: number } | null = null
  for (let i = 1; i < pipe.points.length; i++) {
    const [ax, ay] = pipe.points[i - 1], [bx, by] = pipe.points[i], dx = bx - ax, dy = by - ay
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy || 1)))
    const px = ax + dx * t, py = ay + dy * t, distance = Math.hypot(x - px, y - py)
    if (distance <= pipeDiameter(pipe.size) / 2 + tolerance && (!best || distance < best.distance)) best = { edge: i - 1, x: px, y: py, distance }
  }
  return best && { edge: best.edge, x: best.x, y: best.y }
}
