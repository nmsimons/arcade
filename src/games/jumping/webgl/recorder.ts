/**
 * A stand-in for `CanvasRenderingContext2D` that records what artwork draws, in
 * world units, so the WebGL renderer can draw the same thing on the GPU. It
 * implements the part of Canvas the world's artwork uses: paths and `ArtPath`s,
 * rounded rectangles, fills and strokes (dashed too), clips, transforms, global
 * alpha, repeating patterns, text, images and shadows. Anything else marks the
 * recording unsupported, and the frame or layer stays on Canvas, never drawn
 * wrongly.
 *
 * A recording is made at one camera zoom: curves are flattened, and hairlines
 * measured, in that zoom's device pixels. Without a view (a retained layer,
 * built once) the camera's position does not matter and `getTransform` reports
 * the zoom's scale alone. With a view (a frame) the recorder is the camera: it
 * reports the true device transform, accepts device-space `setTransform`, and
 * leaves out drawing that falls wholly outside the view.
 *
 * Each drawing operation also records its light: the exposure floor and
 * whether it receives light, from the `WorldPaint` call it was made in
 * (`light`), which the renderer turns into its exposure.
 */
import { ArtPath, IDENTITY, appendTransformed, multiply, pushArc, roundRectCommands, MOVE, LINE, QUAD, CUBIC, CLOSE, TARC, ARGUMENTS } from './artPath.ts'
import type { Matrix, Radii } from './artPath.ts'
import type { Exposure } from '../worldPaint.ts'

export type Rgba = readonly [number, number, number, number]
type Sized = CanvasImageSource & { width: number; height: number }

/** A repeating image, placed in world space by `matrix` (pattern pixels to world units). */
export interface PatternPaint { kind: 'pattern'; image: Sized; matrix: Matrix }
export type Paint = { kind: 'color'; rgba: Rgba } | PatternPaint
/** The exposure class of artwork: its readability floor, and whether light and shadow reach it. Null outside any `WorldPaint`. */
export interface Light { floor: Exposure; receives: boolean }
/** A Canvas shadow, in device pixels as Canvas defines it. */
export interface Shadow { blur: number; color: string; offsetX: number; offsetY: number }
export interface Box { x0: number; y0: number; x1: number; y1: number }
export interface StrokeStyle { width: number; cap: CanvasLineCap; join: CanvasLineJoin; miterLimit: number; dash: readonly number[]; dashOffset: number }

interface Drawn { alpha: number; depth: number; light: Light | null; shadow: Shadow | null }
export type DrawOp =
  | Drawn & { kind: 'fill'; commands: number[]; box: Box; rule: CanvasFillRule; paint: Paint }
  | Drawn & { kind: 'stroke'; commands: number[]; box: Box; style: StrokeStyle; paint: Paint }
  /** Text at `matrix` (text space to world), drawn by Canvas into a sprite. */
  | Drawn & { kind: 'text'; text: string; x: number; y: number; maxWidth?: number; font: string; align: CanvasTextAlign; baseline: CanvasTextBaseline;
    direction: CanvasDirection; matrix: Matrix; color: string; stroke: StrokeStyle | null }
  /** The source rectangle of `image`, drawn into the unit square that `matrix` places in the world. */
  | Drawn & { kind: 'image'; image: Sized; sx: number; sy: number; sw: number; sh: number; matrix: Matrix; smooth: boolean }
  /** Where a retained layer (`name`) is drawn in the frame's order. */
  | { kind: 'scene'; name: string; depth: number; light: Light | null }
  | { kind: 'clip'; commands: number[]; box: Box; rule: CanvasFillRule; depth: number }
  | { kind: 'unclip'; clip: number; depth: number }

export class RecordedPattern {
  matrix: Matrix = IDENTITY
  readonly image: Sized
  readonly repetition: string | null
  constructor(image: Sized, repetition: string | null) { this.image = image; this.repetition = repetition }
  setTransform(m?: DOMMatrix2DInit) {
    this.matrix = m ? { a: m.a ?? 1, b: m.b ?? 0, c: m.c ?? 0, d: m.d ?? 1, e: m.e ?? 0, f: m.f ?? 0 } : IDENTITY
  }
}

interface State {
  m: Matrix; fillStyle: string | RecordedPattern; strokeStyle: string | RecordedPattern; lineWidth: number
  lineCap: CanvasLineCap; lineJoin: CanvasLineJoin; miterLimit: number; globalAlpha: number; clips: number[]
  globalCompositeOperation: GlobalCompositeOperation; filter: string; shadowBlur: number; shadowColor: string
  shadowOffsetX: number; shadowOffsetY: number; lineDash: number[]; lineDashOffset: number
  font: string; textAlign: CanvasTextAlign; textBaseline: CanvasTextBaseline; direction: CanvasDirection; smoothing: boolean
}

/** CSS colours as straight (not premultiplied) RGBA in 0..1; null for anything this recorder does not parse. */
export function parseColor(value: string): Rgba | null {
  const known = colors.get(value)
  if (known !== undefined) return known
  const parsed = parse(value)
  if (colors.size > 512) colors.clear()
  colors.set(value, parsed)
  return parsed
}
const colors = new Map<string, Rgba | null>()
function parse(value: string): Rgba | null {
  const text = value.trim().toLowerCase()
  const hex = /^#([0-9a-f]{3,8})$/.exec(text)
  if (hex) {
    const h = hex[1]
    if (h.length === 3 || h.length === 4) {
      const [r, g, b, a = 'f'] = h.split('')
      return [parseInt(r + r, 16) / 255, parseInt(g + g, 16) / 255, parseInt(b + b, 16) / 255, parseInt(a + a, 16) / 255]
    }
    if (h.length === 6 || h.length === 8) {
      const n = (k: number) => parseInt(h.slice(k, k + 2), 16) / 255
      return [n(0), n(2), n(4), h.length === 8 ? n(6) : 1]
    }
    return null
  }
  const fn = /^rgba?\(([^)]*)\)$/.exec(text)
  if (fn) {
    const parts = fn[1].split(/[\s,/]+/).filter(Boolean)
    if (parts.length < 3 || parts.length > 4) return null
    const channel = (s: string) => s.endsWith('%') ? parseFloat(s) / 100 : parseFloat(s) / 255
    const alpha = parts[3] === undefined ? 1 : parts[3].endsWith('%') ? parseFloat(parts[3]) / 100 : parseFloat(parts[3])
    const rgba = [channel(parts[0]), channel(parts[1]), channel(parts[2]), alpha]
    return rgba.every(Number.isFinite) ? rgba.map(v => Math.max(0, Math.min(1, v))) as unknown as Rgba : null
  }
  if (text === 'transparent') return [0, 0, 0, 0]
  if (text === 'black') return [0, 0, 0, 1]
  if (text === 'white') return [1, 1, 1, 1]
  return null
}

const similarity = (m: Matrix) => Math.abs(m.a * m.a + m.b * m.b - (m.c * m.c + m.d * m.d)) < 1e-9 * (m.a * m.a + m.b * m.b + 1)
  && Math.abs(m.a * m.c + m.b * m.d) < 1e-9 * (m.a * m.a + m.b * m.b + 1)
export const invert = (m: Matrix): Matrix => {
  const det = m.a * m.d - m.b * m.c
  const a = m.d / det, b = -m.b / det, c = -m.c / det, d = m.a / det
  return { a, b, c, d, e: -(a * m.e + c * m.f), f: -(b * m.e + d * m.f) }
}
const toMatrix = (t: DOMMatrix2DInit): Matrix => ({ a: t.a ?? t.m11 ?? 1, b: t.b ?? t.m12 ?? 0, c: t.c ?? t.m21 ?? 0, d: t.d ?? t.m22 ?? 1, e: t.e ?? t.m41 ?? 0, f: t.f ?? t.m42 ?? 0 })

/** Text metrics come from a real context with the same font; recording measures as Canvas would. */
let measurer: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null | undefined
function measuringContext() {
  if (measurer === undefined) {
    try { measurer = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(1, 1).getContext('2d') : document.createElement('canvas').getContext('2d') }
    catch { measurer = null }
  }
  return measurer
}

/** The visible area a frame recording is for, in device pixels, and the canvas artwork may read for its size. */
export interface RecorderView { x: number; y: number; zoom: number; width: number; height: number; canvas?: { width: number; height: number } | null }

export class GlRecorder {
  readonly ops: DrawOp[] = []
  /** Why the recording cannot be drawn by WebGL, or null. */
  unsupported: string | null = null
  /** The canvas artwork reads for its size (to cull) and debug reports; a layer recording has none. */
  readonly canvas: { width: number; height: number } | null
  /** The current exposure class, set by the recording's `WorldPaint`. */
  light: Light | null = null
  private state: State = {
    m: IDENTITY, fillStyle: '#000000', strokeStyle: '#000000', lineWidth: 1, lineCap: 'butt', lineJoin: 'miter', miterLimit: 10,
    globalAlpha: 1, clips: [], globalCompositeOperation: 'source-over', filter: 'none', shadowBlur: 0, shadowColor: 'rgba(0, 0, 0, 0)',
    shadowOffsetX: 0, shadowOffsetY: 0, lineDash: [], lineDashOffset: 0,
    font: '10px sans-serif', textAlign: 'start', textBaseline: 'alphabetic', direction: 'inherit', smoothing: true,
  }
  private stack: State[] = []
  private path: number[] = []
  readonly zoom: number
  /** World units to device pixels: the camera, or the zoom alone for a layer. */
  private readonly device: Matrix
  private readonly fromDevice: Matrix | null
  /** The visible area in world units, widened for anti-aliasing; null keeps everything. */
  private readonly visible: Box | null

  constructor(zoom: number, view?: RecorderView) {
    this.zoom = zoom
    this.device = view ? { a: zoom, b: 0, c: 0, d: zoom, e: -view.x * zoom, f: -view.y * zoom } : { a: zoom, b: 0, c: 0, d: zoom, e: 0, f: 0 }
    this.fromDevice = view ? invert(this.device) : null
    const pad = 4 / zoom
    this.visible = view ? { x0: view.x - pad, y0: view.y - pad, x1: view.x + view.width / zoom + pad, y1: view.y + view.height / zoom + pad } : null
    this.canvas = view ? view.canvas ?? { width: view.width, height: view.height } : null
  }

  private fail(reason: string) { this.unsupported ??= reason }

  // State.
  // Clip and dash lists are replaced, never changed in place, so a saved state can share them.
  save() { this.stack.push({ ...this.state }) }
  restore() {
    const saved = this.stack.pop()
    if (!saved) return
    // Clips set since the save end here, innermost first.
    for (let k = this.state.clips.length - 1; k >= saved.clips.length; k--) this.ops.push({ kind: 'unclip', clip: this.state.clips[k], depth: k })
    this.state = saved
  }
  reset() { while (this.stack.length) this.restore(); this.fail('reset') }
  get fillStyle() { return this.state.fillStyle as string }
  set fillStyle(value: string | CanvasGradient | CanvasPattern) { this.state.fillStyle = this.style(value) }
  get strokeStyle() { return this.state.strokeStyle as string }
  set strokeStyle(value: string | CanvasGradient | CanvasPattern) { this.state.strokeStyle = this.style(value) }
  private style(value: unknown): string | RecordedPattern {
    if (value instanceof RecordedPattern) return value
    if (typeof value === 'string') return value
    this.fail('gradient or foreign pattern'); return '#000000'
  }
  get lineWidth() { return this.state.lineWidth }
  set lineWidth(value: number) { if (Number.isFinite(value) && value > 0) this.state.lineWidth = value }
  get lineCap() { return this.state.lineCap }
  set lineCap(value: CanvasLineCap) { this.state.lineCap = value }
  get lineJoin() { return this.state.lineJoin }
  set lineJoin(value: CanvasLineJoin) { this.state.lineJoin = value }
  get miterLimit() { return this.state.miterLimit }
  set miterLimit(value: number) { if (Number.isFinite(value) && value > 0) this.state.miterLimit = value }
  get globalAlpha() { return this.state.globalAlpha }
  set globalAlpha(value: number) { if (Number.isFinite(value) && value >= 0 && value <= 1) this.state.globalAlpha = value }
  get globalCompositeOperation() { return this.state.globalCompositeOperation }
  set globalCompositeOperation(value: GlobalCompositeOperation) { this.state.globalCompositeOperation = value }
  get filter() { return this.state.filter }
  set filter(value: string) { this.state.filter = value }
  get shadowBlur() { return this.state.shadowBlur }
  set shadowBlur(value: number) { if (Number.isFinite(value) && value >= 0) this.state.shadowBlur = value }
  get shadowColor() { return this.state.shadowColor }
  set shadowColor(value: string) { if (typeof value === 'string') this.state.shadowColor = value; else this.fail('shadow colour') }
  get shadowOffsetX() { return this.state.shadowOffsetX }
  set shadowOffsetX(value: number) { if (Number.isFinite(value)) this.state.shadowOffsetX = value }
  get shadowOffsetY() { return this.state.shadowOffsetY }
  set shadowOffsetY(value: number) { if (Number.isFinite(value)) this.state.shadowOffsetY = value }
  setLineDash(segments: number[]) {
    if (!segments.every(s => Number.isFinite(s) && s >= 0)) return
    this.state.lineDash = segments.length % 2 ? [...segments, ...segments] : [...segments]
  }
  getLineDash() { return [...this.state.lineDash] }
  get lineDashOffset() { return this.state.lineDashOffset }
  set lineDashOffset(value: number) { if (Number.isFinite(value)) this.state.lineDashOffset = value }
  get font() { return this.state.font }
  set font(value: string) { this.state.font = value }
  get textAlign() { return this.state.textAlign }
  set textAlign(value: CanvasTextAlign) { this.state.textAlign = value }
  get textBaseline() { return this.state.textBaseline }
  set textBaseline(value: CanvasTextBaseline) { this.state.textBaseline = value }
  get direction() { return this.state.direction }
  set direction(value: CanvasDirection) { this.state.direction = value }
  get imageSmoothingEnabled() { return this.state.smoothing }
  set imageSmoothingEnabled(value: boolean) { this.state.smoothing = value }

  // Transforms. Geometry is recorded in world units: the identity here is the world.
  private apply(n: Matrix) { this.state.m = multiply(this.state.m, n) }
  translate(x: number, y: number) { const m = this.state.m; this.state.m = { ...m, e: m.a * x + m.c * y + m.e, f: m.b * x + m.d * y + m.f } }
  scale(x: number, y: number) { const m = this.state.m; this.state.m = { a: m.a * x, b: m.b * x, c: m.c * y, d: m.d * y, e: m.e, f: m.f } }
  rotate(angle: number) { const c = Math.cos(angle), s = Math.sin(angle); this.apply({ a: c, b: s, c: -s, d: c, e: 0, f: 0 }) }
  transform(a: number, b: number, c: number, d: number, e: number, f: number) { this.apply({ a, b, c, d, e, f }) }
  /** A device transform. A frame turns it back into world units; a layer recording cannot place it. */
  setTransform(a?: number | DOMMatrix2DInit, b?: number, c?: number, d?: number, e?: number, f?: number) {
    if (!this.fromDevice) { this.fail('absolute transform'); return }
    const t = typeof a === 'number' ? { a, b: b!, c: c!, d: d!, e: e!, f: f! } : toMatrix(a ?? {})
    this.state.m = multiply(this.fromDevice, t)
  }
  resetTransform() { this.setTransform(1, 0, 0, 1, 0, 0) }
  /** The device transform the artwork would see (without a view, without the camera's position). */
  getTransform() {
    const m = multiply(this.device, this.state.m)
    return typeof DOMMatrix === 'undefined' ? { ...m, is2D: true } as unknown as DOMMatrix : new DOMMatrix([m.a, m.b, m.c, m.d, m.e, m.f])
  }

  // Paths, recorded in world units as they are made, as Canvas does.
  beginPath() { this.path = [] }
  moveTo(x: number, y: number) { const m = this.state.m; this.path.push(MOVE, m.a * x + m.c * y + m.e, m.b * x + m.d * y + m.f) }
  lineTo(x: number, y: number) { const m = this.state.m; this.path.push(LINE, m.a * x + m.c * y + m.e, m.b * x + m.d * y + m.f) }
  quadraticCurveTo(cx: number, cy: number, x: number, y: number) {
    const m = this.state.m
    this.path.push(QUAD, m.a * cx + m.c * cy + m.e, m.b * cx + m.d * cy + m.f, m.a * x + m.c * y + m.e, m.b * x + m.d * y + m.f)
  }
  bezierCurveTo(c1x: number, c1y: number, c2x: number, c2y: number, x: number, y: number) {
    const m = this.state.m
    this.path.push(CUBIC, m.a * c1x + m.c * c1y + m.e, m.b * c1x + m.d * c1y + m.f, m.a * c2x + m.c * c2y + m.e, m.b * c2x + m.d * c2y + m.f,
      m.a * x + m.c * y + m.e, m.b * x + m.d * y + m.f)
  }
  closePath() { this.path.push(CLOSE) }
  rect(x: number, y: number, w: number, h: number) {
    // Canvas: a closed rectangle, then a new subpath at its corner.
    const m = this.state.m, ax = m.a * x + m.c * y + m.e, ay = m.b * x + m.d * y + m.f
    const ux = m.a * w, uy = m.b * w, vx = m.c * h, vy = m.d * h
    this.path.push(MOVE, ax, ay, LINE, ax + ux, ay + uy, LINE, ax + ux + vx, ay + uy + vy, LINE, ax + vx, ay + vy, CLOSE, MOVE, ax, ay)
  }
  arc(x: number, y: number, r: number, start: number, end: number, ccw = false) {
    if (r < 0) throw new RangeError('The radius provided is negative.')
    pushArc(this.path, this.state.m, x, y, r, r, 0, start, end, ccw)
  }
  ellipse(x: number, y: number, rx: number, ry: number, rotation: number, start: number, end: number, ccw = false) {
    if (rx < 0 || ry < 0) throw new RangeError('The radius provided is negative.')
    pushArc(this.path, this.state.m, x, y, rx, ry, rotation, start, end, ccw)
  }
  roundRect(x: number, y: number, w: number, h: number, radii?: Radii) {
    const local: number[] = []; roundRectCommands(local, x, y, w, h, radii); appendTransformed(this.path, local, this.state.m)
  }
  arcTo() { this.fail('arcTo') }

  private commands(path?: Path2D) {
    if (!path) return this.path
    if (!(path instanceof ArtPath) || path.unsupported) { this.fail('native Path2D'); return [] }
    const out: number[] = []; appendTransformed(out, path.commands, this.state.m); return out
  }
  private drawable() {
    const s = this.state
    if (s.globalCompositeOperation !== 'source-over') this.fail(`composite ${s.globalCompositeOperation}`)
    if (s.filter !== 'none') this.fail('filter')
    return this.unsupported === null
  }
  /** The current shadow, when Canvas would draw one. */
  private shadow(): Shadow | null {
    const s = this.state
    if (!(s.shadowBlur > 0 || s.shadowOffsetX || s.shadowOffsetY)) return null
    const color = parseColor(s.shadowColor)
    if (!color) { this.fail(`shadow colour ${s.shadowColor}`); return null }
    if (color[3] === 0) return null
    if (!this.fromDevice) { this.fail('shadow in a layer'); return null }
    return { blur: s.shadowBlur, color: s.shadowColor, offsetX: s.shadowOffsetX, offsetY: s.shadowOffsetY }
  }
  private paint(style: string | RecordedPattern): Paint | null {
    if (style instanceof RecordedPattern) {
      if (style.repetition !== 'repeat' && style.repetition !== '' && style.repetition !== null) { this.fail('non-repeating pattern'); return null }
      // Pattern space is the user space at the moment of drawing.
      return { kind: 'pattern', image: style.image, matrix: multiply(this.state.m, style.matrix) }
    }
    const rgba = parseColor(style)
    if (!rgba) { this.fail(`colour ${style}`); return null }
    return { kind: 'color', rgba }
  }
  private ruleOf(a?: Path2D | CanvasFillRule, b?: CanvasFillRule): [Path2D | undefined, CanvasFillRule] {
    return typeof a === 'string' ? [undefined, a] : [a, b ?? 'nonzero']
  }
  /** Bounds of every point and control point (the curves lie within them), widened by `pad`. */
  private box(commands: readonly number[], pad = 0): Box | null {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, i = 0
    while (i < commands.length) {
      const op = commands[i], n = ARGUMENTS[op]
      if (op === TARC) {
        // Within its matrix's largest stretch of its larger radius from the centre.
        const reach = Math.max(commands[i + 7], commands[i + 8]) * Math.hypot(commands[i + 1], commands[i + 2], commands[i + 3], commands[i + 4])
        const cx = commands[i + 5], cy = commands[i + 6]
        if (cx - reach < x0) x0 = cx - reach; if (cx + reach > x1) x1 = cx + reach; if (cy - reach < y0) y0 = cy - reach; if (cy + reach > y1) y1 = cy + reach
        i += 1 + n; continue
      }
      // Otherwise only moves, lines, curves and closes.
      for (let k = i + 1; k < i + 1 + n; k += 2) {
        const x = commands[k], y = commands[k + 1]
        if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y
      }
      i += 1 + n
    }
    return x0 > x1 ? null : { x0: x0 - pad, y0: y0 - pad, x1: x1 + pad, y1: y1 + pad }
  }
  /** Whether a box reaches the view; a layer recording keeps everything. */
  private seen(box: Box, shadow: Shadow | null) {
    const v = this.visible
    if (!v) return true
    let x0 = box.x0, y0 = box.y0, x1 = box.x1, y1 = box.y1
    if (shadow) {
      // A shadow's offset and blur are in device pixels.
      const reach = shadow.blur * 1.5 / this.zoom, dx = shadow.offsetX / this.zoom, dy = shadow.offsetY / this.zoom
      x0 = Math.min(x0, x0 + dx) - reach; x1 = Math.max(x1, x1 + dx) + reach; y0 = Math.min(y0, y0 + dy) - reach; y1 = Math.max(y1, y1 + dy) + reach
    }
    return x1 >= v.x0 && y1 >= v.y0 && x0 <= v.x1 && y0 <= v.y1
  }

  fill(a?: Path2D | CanvasFillRule, b?: CanvasFillRule) {
    const [path, rule] = this.ruleOf(a, b)
    const paint = this.paint(this.state.fillStyle), commands = this.commands(path), shadow = this.shadow()
    if (!paint || !this.drawable()) return
    const box = this.box(commands)
    if (!box || !this.seen(box, shadow)) return
    const s = this.state
    this.ops.push({ kind: 'fill', commands: path ? commands : commands.slice(), box, rule, paint, alpha: s.globalAlpha, depth: s.clips.length, light: this.light, shadow })
  }
  fillRect(x: number, y: number, w: number, h: number) {
    const saved = this.path; this.path = []; this.rect(x, y, w, h); this.fill(); this.path = saved
  }
  private strokeStyle_(): StrokeStyle | null {
    const s = this.state
    if (!similarity(s.m)) { this.fail('stretched stroke'); return null }
    const scale = Math.hypot(s.m.a, s.m.b)
    const dash = s.lineDash.some(d => d > 0) ? s.lineDash.map(d => d * scale) : []
    return { width: s.lineWidth * scale, cap: s.lineCap, join: s.lineJoin, miterLimit: s.miterLimit, dash, dashOffset: s.lineDashOffset * scale }
  }
  stroke(path?: Path2D) {
    const style = this.strokeStyle_()
    if (!style) return
    const paint = this.paint(this.state.strokeStyle), commands = this.commands(path), shadow = this.shadow()
    if (!paint || !this.drawable()) return
    const box = this.box(commands, style.width / 2 * Math.max(1, style.join === 'miter' ? style.miterLimit : 1) + 1 / this.zoom)
    if (!box || !this.seen(box, shadow)) return
    const s = this.state
    this.ops.push({ kind: 'stroke', commands: path ? commands : commands.slice(), box, style, paint, alpha: s.globalAlpha, depth: s.clips.length, light: this.light, shadow })
  }
  strokeRect(x: number, y: number, w: number, h: number) {
    const saved = this.path; this.path = []; this.rect(x, y, w, h); this.stroke(); this.path = saved
  }
  clip(a?: Path2D | CanvasFillRule, b?: CanvasFillRule) {
    const [path, rule] = this.ruleOf(a, b)
    const commands = this.commands(path)
    // Clipping to nothing hides everything until restored; an empty clip path does exactly that.
    const box = this.box(commands) ?? { x0: 0, y0: 0, x1: 0, y1: 0 }
    this.ops.push({ kind: 'clip', commands: path ? commands : commands.slice(), box, rule, depth: this.state.clips.length })
    this.state.clips = [...this.state.clips, this.ops.length - 1]
  }
  createPattern(image: CanvasImageSource, repetition: string | null) {
    const sized = image as Sized
    if (!(sized.width > 0 && sized.height > 0)) { this.fail('empty pattern'); return null }
    return new RecordedPattern(sized, repetition) as unknown as CanvasPattern
  }
  createLinearGradient() { this.fail('gradient'); return { addColorStop() {} } as unknown as CanvasGradient }
  createRadialGradient() { this.fail('gradient'); return { addColorStop() {} } as unknown as CanvasGradient }
  createConicGradient() { this.fail('gradient'); return { addColorStop() {} } as unknown as CanvasGradient }
  clearRect() { this.fail('clearRect') }

  // Text: drawn by Canvas into sprites the renderer places, so its shapes and hinting are Canvas's own.
  private text(text: string, x: number, y: number, maxWidth: number | undefined, stroke: boolean) {
    const s = this.state
    if (!this.fromDevice) { this.fail('text in a layer'); return }
    const color = stroke ? s.strokeStyle : s.fillStyle
    if (typeof color !== 'string' || !parseColor(color)) { this.fail('text paint'); return }
    const strokeStyle = stroke ? this.strokeStyle_() : null
    if (stroke && !strokeStyle) return
    if (!this.drawable() || !text) return
    if (maxWidth !== undefined && !(maxWidth > 0)) return
    this.ops.push({ kind: 'text', text, x, y, maxWidth, font: s.font, align: s.textAlign, baseline: s.textBaseline, direction: s.direction,
      matrix: s.m, color, stroke: strokeStyle, alpha: s.globalAlpha, depth: s.clips.length, light: this.light, shadow: this.shadow() })
  }
  fillText(text: string, x: number, y: number, maxWidth?: number) { this.text(String(text), x, y, maxWidth, false) }
  strokeText(text: string, x: number, y: number, maxWidth?: number) { this.text(String(text), x, y, maxWidth, true) }
  measureText(text: string) {
    const ctx = measuringContext()
    if (!ctx) { this.fail('text'); return { width: 0 } as TextMetrics }
    const s = this.state
    ctx.font = s.font; ctx.textAlign = s.textAlign; ctx.textBaseline = s.textBaseline; ctx.direction = s.direction
    return ctx.measureText(text)
  }

  drawImage(image: CanvasImageSource, ...args: number[]) {
    const sized = image as Sized
    if (!this.fromDevice) { this.fail('image in a layer'); return }
    if (!(sized.width > 0 && sized.height > 0)) return
    let sx = 0, sy = 0, sw = sized.width, sh = sized.height, dx: number, dy: number, dw = sized.width, dh = sized.height
    if (args.length === 2) [dx, dy] = args
    else if (args.length === 4) [dx, dy, dw, dh] = args
    else if (args.length === 8) [sx, sy, sw, sh, dx, dy, dw, dh] = args
    else { this.fail('drawImage arguments'); return }
    if (!this.drawable() || !sw || !sh || !dw || !dh) return
    const s = this.state, matrix = multiply(s.m, { a: dw, b: 0, c: 0, d: dh, e: dx, f: dy }), shadow = this.shadow()
    if (shadow) { this.fail('image shadow'); return }
    const corners = [matrix.e, matrix.f, matrix.a + matrix.e, matrix.b + matrix.f, matrix.c + matrix.e, matrix.d + matrix.f, matrix.a + matrix.c + matrix.e, matrix.b + matrix.d + matrix.f]
    const box = { x0: Math.min(corners[0], corners[2], corners[4], corners[6]), y0: Math.min(corners[1], corners[3], corners[5], corners[7]),
      x1: Math.max(corners[0], corners[2], corners[4], corners[6]), y1: Math.max(corners[1], corners[3], corners[5], corners[7]) }
    if (!this.seen(box, null)) return
    this.ops.push({ kind: 'image', image: sized, sx, sy, sw, sh, matrix, smooth: s.smoothing, alpha: s.globalAlpha, depth: s.clips.length, light: this.light, shadow: null })
  }

  /** Mark where the retained layer `name` is drawn, in the current clip and light. */
  scene(name: string) {
    if (this.state.globalAlpha !== 1 || !isIdentity(this.state.m)) this.fail('transformed scene')
    this.ops.push({ kind: 'scene', name, depth: this.state.clips.length, light: this.light })
  }

  isPointInPath() { this.fail('hit test'); return false }
  isPointInStroke() { this.fail('hit test'); return false }
  getImageData() { this.fail('readback'); return null }
  putImageData() { this.fail('readback') }
  getContextAttributes() { return { alpha: true, colorSpace: 'srgb', desynchronized: false, willReadFrequently: false } }

  /** This recorder, typed as the context artwork expects. */
  asContext() { return this as unknown as CanvasRenderingContext2D }
}

/** The camera's own transform comes back through floating point; anything this close is the world itself. */
const isIdentity = (m: Matrix) => Math.abs(m.a - 1) < 1e-9 && Math.abs(m.b) < 1e-9 && Math.abs(m.c) < 1e-9 && Math.abs(m.d - 1) < 1e-9 && Math.abs(m.e) < 1e-6 && Math.abs(m.f) < 1e-6
