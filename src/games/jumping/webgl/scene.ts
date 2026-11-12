/**
 * Turns recorded drawing operations into vertices and a list of GPU passes, in
 * painter's order. A retained layer is built once per level and zoom; a frame
 * is built every frame from the same operations, reusing the triangles of any
 * shape it has seen before (`ShapeCache`), so artwork that does not change
 * shape costs a copy, not a tessellation.
 *
 * Fills: a convex outline is drawn directly; anything else (compound terrain,
 * concave or self-overlapping outlines, even-odd) counts its winding in the
 * stencil buffer first and then covers it, so overlapping parts of one fill
 * blend once and shared edges leave no seam. Multisampling anti-aliases both.
 *
 * Strokes: lines at least two device pixels wide become triangles; thinner
 * ones become quads whose coverage the shader computes exactly, so hairlines
 * keep their brightness as the camera moves. A translucent stroke covers each
 * sample (thick) or pixel (thin, by taking the greatest coverage) only once,
 * as Canvas strokes a path as one shape. Dashes are cut before either.
 *
 * Clips: the stencil's high four bits hold how many clips a sample is inside;
 * the low four bits count winding while a fill or clip is being drawn.
 *
 * Text and shadows are drawn by Canvas into sprites (sprites.ts) and placed as
 * textured quads; images are textured quads too.
 */
import { FLOATS_PER_VERTEX, dashContours, earClip, fanTriangles, flatten, isConvex, rectTriangles, strokeTriangles, thinStrokeQuads } from './geometry.ts'
import type { Contour } from './geometry.ts'
import { ARGUMENTS, CLOSE, CUBIC, LINE, MOVE, QUAD, TARC, expandArcs, multiply } from './artPath.ts'
import type { Matrix } from './artPath.ts'
import { invert } from './recorder.ts'
import type { Box, DrawOp, Light, Paint, Rgba, StrokeStyle } from './recorder.ts'
import type { Placed, SpriteCache } from './sprites.ts'

export interface Range { first: number; count: number }
export type { Box }
type Sized = CanvasImageSource & { width: number; height: number }
/** A texture and how world positions map to its coordinates. `mask` textures colour their coverage with the vertex colour. */
export interface TexturePaint { source: Sized; toTexture: Matrix; repeat: boolean; smooth: boolean }
interface Lit { light: Light | null }
export type Pass =
  /** Triangles drawn directly: convex fills, opaque strokes, textured quads. */
  | Lit & { kind: 'direct'; draw: Range; depth: number; texture: number; box: Box }
  /** A fill whose winding is counted in the stencil, then covered. */
  | Lit & { kind: 'stencil-fill'; wind: Range; cover: Range; evenOdd: boolean; depth: number; texture: number; box: Box }
  /** A translucent thick stroke: each sample is drawn once, then the marks are cleared. */
  | Lit & { kind: 'stroke-once'; draw: Range; depth: number; texture: number; box: Box }
  /** A translucent thin stroke: greatest coverage per pixel, then one coloured cover. */
  | Lit & { kind: 'thin-max'; draw: Range; cover: Range; color: Rgba; depth: number; box: Box }
  /** A retained layer, drawn here in the frame's order with this clip depth and light. */
  | Lit & { kind: 'scene'; name: string; depth: number }
  /** `end` is the index of the pass that removes this clip (or the pass count): nothing between draws outside `box`. */
  | { kind: 'clip'; wind: Range; cover: Range; evenOdd: boolean; depth: number; box: Box; end: number }
  | { kind: 'unclip'; cover: Range; depth: number; box: Box }

export interface Scene {
  /** Interleaved vertices: FLOATS_PER_VERTEX floats, then four colour bytes, straight (the shader premultiplies, as Canvas blends). */
  vertices: ArrayBuffer
  vertexCount: number
  passes: Pass[]
  textures: TexturePaint[]
  zoom: number
}
export const VERTEX_BYTES = FLOATS_PER_VERTEX * 4 + 4
const WORDS = VERTEX_BYTES / 4

/** Below this many device pixels wide, a stroke is drawn with computed coverage. */
const THIN = 2
/** Canvas keeps colour and alpha as separate bytes; premultiplying before rounding would shift faint tints. */
const pack = (r: number, g: number, b: number, a: number) => {
  const byte = (v: number) => Math.round(Math.max(0, Math.min(1, v)) * 255)
  return (byte(r) | byte(g) << 8 | byte(b) << 16 | byte(a) << 24) >>> 0
}
const premultiplied = (rgba: Rgba, alpha: number): Rgba => {
  const a = Math.round(rgba[3] * alpha * 255) / 255
  return [rgba[0] * a, rgba[1] * a, rgba[2] * a, a]
}
const sameLight = (a: Light | null, b: Light | null) => a === b || !!a && !!b && a.floor === b.floor && a.receives === b.receives
const union = (a: Box, b: Box): Box => ({ x0: Math.min(a.x0, b.x0), y0: Math.min(a.y0, b.y0), x1: Math.max(a.x1, b.x1), y1: Math.max(a.y1, b.y1) })
const sameMatrix = (a: Matrix, b: Matrix) => a.a === b.a && a.b === b.b && a.c === b.c && a.d === b.d && a.e === b.e && a.f === b.f

/** A path's first point: where a transformed arc is, its centre. */
const origin = (commands: readonly number[]) => commands[0] === TARC ? [commands[5], commands[6]] : [commands[1] ?? 0, commands[2] ?? 0]
/** How finely each of a transformed arc's arguments is keyed: its matrix and angles to 1/65536, its centre (relative) and radii to 1/256. */
const ARC_STEPS = [65536, 65536, 65536, 65536, 256, 256, 256, 256, 65536, 65536, 65536, 1]

/** Fill triangles for flattened contours: true when they can be drawn directly, false when they need the stencil (fan). */
function fillTriangles(contours: readonly Contour[], evenOdd: boolean, solid: boolean, out: number[]): boolean {
  if (!evenOdd && isConvex(contours)) { fanTriangles(contours, out); return true }
  // One simple outline covers each sample once; an opaque fill may cover one twice with no difference.
  if (contours.length === 1 || solid && !evenOdd) {
    const triangles: number[] = []
    if (contours.every(c => earClip(c.points, triangles))) { for (const v of triangles) out.push(v); return true }
  }
  fanTriangles(contours, out); return false
}
function strokeContours(contours: Contour[], style: StrokeStyle) {
  return style.dash.length ? dashContours(contours, style.dash, style.dashOffset) : contours
}

/** Triangles of shapes seen before, relative to their first point, kept while they are in use. */
/**
 * Shapes are found by a 64-bit digest of their key (two independent 32-bit
 * hashes and its length); two different shapes sharing one is about as likely
 * as a stray bit flip, and checking every value on each hit cost more than the
 * rest of the lookup.
 */
export class ShapeCache {
  private entries = new Map<number, { check: number; length: number; vertices: Float32Array; direct: boolean; used: number }[]>()
  /** Shapes missed last frame and this one, by digest: a shape is kept once it is seen in two frames running. */
  private missedBefore = new Map<number, number>()
  private missed = new Map<number, number>()
  private vertices = 0
  frame = 0
  zoom = NaN
  /** At most this many cached vertices. */
  readonly budget: number
  constructor(budget = 200_000) { this.budget = budget }
  /** A new frame: this frame's misses become the last frame's. */
  advance() { this.frame++; const before = this.missedBefore; this.missedBefore = this.missed; this.missed = before; this.missed.clear() }
  /** Note a miss; true when the same shape was missed last frame too, so it is worth keeping. */
  repeated(hash: number, check: number) {
    this.missed.set(hash, check)
    return this.missedBefore.get(hash) === check
  }
  get(hash: number, check: number, length: number) {
    const list = this.entries.get(hash)
    if (!list) return null
    for (const entry of list) if (entry.check === check && entry.length === length) { entry.used = this.frame; return entry }
    return null
  }
  set(hash: number, check: number, length: number, vertices: Float32Array, direct: boolean) {
    const entry = { check, length, vertices, direct, used: this.frame }
    const list = this.entries.get(hash)
    if (list) list.push(entry); else this.entries.set(hash, [entry])
    this.vertices += vertices.length / FLOATS_PER_VERTEX
    if (this.vertices > this.budget) this.sweep(0)
    return entry
  }
  /** Forget shapes unused for `frames` frames. */
  sweep(frames = 120) {
    for (const [hash, list] of this.entries) {
      const kept = list.filter(entry => this.frame - entry.used <= frames)
      for (const entry of list) if (!kept.includes(entry)) this.vertices -= entry.vertices.length / FLOATS_PER_VERTEX
      if (kept.length) this.entries.set(hash, kept); else this.entries.delete(hash)
    }
  }
  clear() { this.entries.clear(); this.vertices = 0; this.missed.clear(); this.missedBefore.clear() }
  get size() { return this.vertices }
}

/** The camera a frame is built for: what the sprites and culling need. */
export interface BuildView { x: number; y: number; zoom: number; width: number; height: number }

export class SceneBuilder {
  private f32 = new Float32Array(WORDS * 4096)
  private u32 = new Uint32Array(this.f32.buffer)
  count = 0
  passes: Pass[] = []
  textures: TexturePaint[] = []
  private clipPasses = new Map<number, number>()
  private zoom = 1
  private view: BuildView | null = null
  private device: Matrix = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }
  private fromDevice: Matrix = this.device
  private keyBuffer = new Float64Array(1024)
  private scratch: number[] = []
  /** Why the frame cannot be drawn, or null. */
  unsupported: string | null = null
  readonly cache: ShapeCache | null
  readonly sprites: SpriteCache | null
  stats = { ops: 0, hits: 0, misses: 0, sprites: 0 }

  constructor(cache: ShapeCache | null = null, sprites: SpriteCache | null = null) { this.cache = cache; this.sprites = sprites }

  /**
   * Start a build. `zoom` decides tessellation (curve flattening, hairlines); a
   * frame's cache passes a nearby step so its shapes outlive small zoom changes.
   * A frame also gives its view, whose own zoom places sprites on screen.
   */
  reset(zoom: number, view: BuildView | null = null) {
    this.count = 0; this.passes = []; this.textures = []; this.clipPasses.clear(); this.unsupported = null
    this.zoom = zoom; this.view = view
    const z = view?.zoom ?? zoom
    this.device = view ? { a: z, b: 0, c: 0, d: z, e: -view.x * z, f: -view.y * z } : { a: z, b: 0, c: 0, d: z, e: 0, f: 0 }
    this.fromDevice = invert(this.device)
    this.stats = { ops: 0, hits: 0, misses: 0, sprites: 0 }
    if (this.cache) {
      if (this.cache.zoom !== zoom) { this.cache.clear(); this.cache.zoom = zoom }
      this.cache.advance()
      if (this.cache.frame % 60 === 0) this.cache.sweep()
    }
    if (this.sprites) { this.sprites.frame++; if (this.sprites.frame % 60 === 0) this.sprites.sweep() }
  }

  private reserve(vertices: number) {
    const needed = (this.count + vertices) * WORDS
    if (needed <= this.f32.length) return
    let size = this.f32.length * 2
    while (size < needed) size *= 2
    const next = new Float32Array(size); next.set(this.f32.subarray(0, this.count * WORDS))
    this.f32 = next; this.u32 = new Uint32Array(next.buffer)
  }
  /** Append vertices given as FLOATS_PER_VERTEX floats each, moved by (dx, dy), all one colour. */
  private emit(source: ArrayLike<number>, color: number, dx = 0, dy = 0): Range {
    const n = source.length / FLOATS_PER_VERTEX, first = this.count
    this.reserve(n)
    const f = this.f32, u = this.u32
    let w = first * WORDS
    for (let s = 0; s < source.length; s += FLOATS_PER_VERTEX, w += WORDS) {
      f[w] = source[s] + dx; f[w + 1] = source[s + 1] + dy; f[w + 2] = source[s + 2]; f[w + 3] = source[s + 3]; f[w + 4] = source[s + 4]
      u[w + 5] = color
    }
    this.count += n
    return { first, count: n }
  }

  private texture(paint: TexturePaint) {
    const found = this.textures.findIndex(t => t.source === paint.source && t.repeat === paint.repeat && t.smooth === paint.smooth && sameMatrix(t.toTexture, paint.toTexture))
    if (found >= 0) return found
    this.textures.push(paint); return this.textures.length - 1
  }
  private patternTexture(paint: Paint) {
    if (paint.kind !== 'pattern') return -1
    const { image, matrix } = paint
    return this.texture({ source: image, toTexture: multiply({ a: 1 / image.width, b: 0, c: 0, d: 1 / image.height, e: 0, f: 0 }, invert(matrix)), repeat: true, smooth: true })
  }
  private direct(draw: Range, depth: number, texture: number, light: Light | null, box: Box) {
    if (!draw.count) return
    const last = this.passes.at(-1)
    // Consecutive direct draws with the same clip, paint and light share one draw call.
    if (last?.kind === 'direct' && last.depth === depth && last.texture === texture && sameLight(last.light, light) && last.draw.first + last.draw.count === draw.first) {
      last.draw.count += draw.count; last.box = union(last.box, box)
    } else this.passes.push({ kind: 'direct', draw, depth, texture, light, box })
  }

  /**
   * A shape's triangles, from the cache when it has this shape: `kind` 0 fill,
   * 1 stroke, 2 clip. Returns the vertices relative to the commands' first point.
   */
  private shape(kind: 0 | 1 | 2, commands: readonly number[], evenOdd: boolean, solid: boolean, style: StrokeStyle | null) {
    const [ox, oy] = origin(commands), cache = this.cache
    const tolerance = .2 / this.zoom
    if (!cache) {
      // Retained layers: exact positions, no cache.
      const out: number[] = []
      const direct = this.tessellate(kind, flatten(commands, tolerance), evenOdd, solid, style, out)
      return { vertices: out, direct, dx: 0, dy: 0 }
    }
    // The key: what decides the triangles, with positions relative to the first point to 1/256 unit.
    let key = this.keyBuffer
    const length = 8 + commands.length + (style?.dash.length ?? 0)
    if (key.length < length) key = this.keyBuffer = new Float64Array(length * 2)
    let n = 0
    // Everything in the key is a whole number: style lengths to 1/4096 unit.
    key[n++] = kind; key[n++] = evenOdd ? 1 : 0; key[n++] = solid ? 1 : 0
    if (style) {
      key[n++] = Math.round(style.width * 4096); key[n++] = style.cap === 'butt' ? 0 : style.cap === 'round' ? 1 : 2
      key[n++] = style.join === 'miter' ? Math.round(style.miterLimit * 4096) : style.join === 'round' ? -1 : -2; key[n++] = Math.round(style.dashOffset * 4096)
      for (const d of style.dash) key[n++] = Math.round(d * 4096)
    }
    key[n++] = -9
    const start = n
    for (let i = 0; i < commands.length;) {
      const op = commands[i++], count = ARGUMENTS[op]
      key[n++] = op - 16
      if (op === TARC) {
        for (let k = 0; k < count; k++) key[n++] = Math.round((commands[i + k] - (k === 4 ? ox : k === 5 ? oy : 0)) * ARC_STEPS[k])
      } else for (let k = 0; k < count; k += 2) {
        key[n++] = Math.round((commands[i + k] - ox) * 256)
        key[n++] = Math.round((commands[i + k + 1] - oy) * 256)
      }
      i += count
    }
    let hash = 0x811c9dc5, check = 0x9747b28c
    // Key values stay well inside 32 bits (positions to 1/256 unit within the level, angles to 1/65536).
    for (let i = 0; i < n; i++) { const v = key[i] | 0; hash = Math.imul(hash ^ v, 16777619); check = Math.imul(check ^ v, 2246822519) }
    const found = cache.get(hash, check, n)
    if (found) { this.stats.hits++; return { vertices: found.vertices, direct: found.direct, dx: ox, dy: oy } }
    this.stats.misses++
    // Tessellate the quantised shape, so a later hit draws exactly what this one did.
    const relative: number[] = []
    let at = start
    while (at < n) {
      const op = key[at++] + 16, count = ARGUMENTS[op]
      relative.push(op)
      for (let k = 0; k < count; k++) relative.push(key[at++] / (op === TARC ? ARC_STEPS[k] : 256))
    }
    const out = this.scratch; out.length = 0
    const direct = this.tessellate(kind, flatten(relative, tolerance), evenOdd, solid, style, out)
    // A shape that changes every frame (a limb, a spinning coin) is drawn from the scratch list and not kept.
    if (!cache.repeated(hash, check)) return { vertices: out, direct, dx: ox, dy: oy }
    const entry = cache.set(hash, check, n, new Float32Array(out), direct)
    return { vertices: entry.vertices, direct, dx: ox, dy: oy }
  }
  private tessellate(kind: 0 | 1 | 2, contours: Contour[], evenOdd: boolean, solid: boolean, style: StrokeStyle | null, out: number[]) {
    if (kind === 1) {
      const pieces = strokeContours(contours, style!)
      if (style!.width * this.zoom < THIN) thinStrokeQuads(pieces, style!, 1 / this.zoom, out)
      else strokeTriangles(pieces, style!, .5 / this.zoom, out)
      return true
    }
    if (kind === 2) { fanTriangles(contours, out); return false }
    return fillTriangles(contours, evenOdd, solid, out)
  }

  /** Add recorded operations, in order. */
  add(ops: readonly DrawOp[]) {
    for (let index = 0; index < ops.length; index++) {
      const op = ops[index]
      this.stats.ops++
      switch (op.kind) {
        case 'fill': {
          if (op.shadow) this.glow(op)
          const color = op.paint.kind === 'color' ? pack(op.paint.rgba[0], op.paint.rgba[1], op.paint.rgba[2], op.paint.rgba[3] * op.alpha) : pack(1, 1, 1, op.alpha)
          const texture = this.patternTexture(op.paint), solid = this.opaque(op.paint, op.alpha)
          const shape = this.shape(0, op.commands, op.rule === 'evenodd', solid, null)
          if (!shape.vertices.length) break
          const draw = this.emit(shape.vertices, color, shape.dx, shape.dy)
          if (shape.direct) this.direct(draw, op.depth, texture, op.light, op.box)
          else this.passes.push({ kind: 'stencil-fill', wind: draw, cover: draw, evenOdd: op.rule === 'evenodd', depth: op.depth, texture, light: op.light, box: op.box })
          break
        }
        case 'stroke': {
          if (op.shadow) this.glow(op)
          const color = op.paint.kind === 'color' ? pack(op.paint.rgba[0], op.paint.rgba[1], op.paint.rgba[2], op.paint.rgba[3] * op.alpha) : pack(1, 1, 1, op.alpha)
          const texture = this.patternTexture(op.paint)
          const shape = this.shape(1, op.commands, false, false, op.style)
          if (!shape.vertices.length) break
          const draw = this.emit(shape.vertices, color, shape.dx, shape.dy)
          const thin = op.style.width * this.zoom < THIN
          if (this.opaque(op.paint, op.alpha) || thin && op.paint.kind === 'pattern') this.direct(draw, op.depth, texture, op.light, op.box)
          else if (thin && op.paint.kind === 'color') {
            const cover = this.emit(rectVertices(op.box), color)
            this.passes.push({ kind: 'thin-max', draw, cover, color: premultiplied(op.paint.rgba, op.alpha), depth: op.depth, light: op.light, box: op.box })
          } else this.passes.push({ kind: 'stroke-once', draw, depth: op.depth, texture, light: op.light, box: op.box })
          break
        }
        case 'clip': {
          const shape = this.shape(2, op.commands, op.rule === 'evenodd', false, null)
          const wind = this.emit(shape.vertices, 0, shape.dx, shape.dy), box = op.box
          this.passes.push({ kind: 'clip', wind, cover: wind, evenOdd: op.rule === 'evenodd', depth: op.depth, box, end: Infinity })
          this.clipPasses.set(index, this.passes.length - 1)
          break
        }
        case 'unclip': {
          const at = this.clipPasses.get(op.clip)
          if (at === undefined) break
          const opened = this.passes[at]
          if (opened.kind !== 'clip') break
          opened.end = this.passes.length
          this.passes.push({ kind: 'unclip', cover: opened.cover, depth: op.depth, box: opened.box })
          break
        }
        case 'scene':
          this.passes.push({ kind: 'scene', name: op.name, depth: op.depth, light: op.light })
          break
        case 'image': {
          const { image, matrix } = op
          // World positions to the unit square, then to the source rectangle's texture coordinates.
          const toTexture = multiply({ a: op.sw / image.width, b: 0, c: 0, d: op.sh / image.height, e: op.sx / image.width, f: op.sy / image.height }, invert(matrix))
          const texture = this.texture({ source: image, toTexture, repeat: false, smooth: op.smooth })
          const corners = [[0, 0], [1, 0], [1, 1], [0, 0], [1, 1], [0, 1]].flatMap(([u, v]) =>
            [matrix.a * u + matrix.c * v + matrix.e, matrix.b * u + matrix.d * v + matrix.f, 0, 0, 0])
          this.direct(this.emit(corners, pack(1, 1, 1, op.alpha)), op.depth, texture, op.light, boxOf(corners))
          break
        }
        case 'text': {
          if (!this.sprites || !this.view) { this.unsupported ??= 'text'; break }
          const device = multiply(this.device, op.matrix)
          const stroke = op.stroke && { ...op.stroke, width: op.stroke.width / Math.hypot(op.matrix.a, op.matrix.b),
            dash: op.stroke.dash.map(d => d / Math.hypot(op.matrix.a, op.matrix.b)), dashOffset: op.stroke.dashOffset / Math.hypot(op.matrix.a, op.matrix.b) }
          const placed = this.sprites.text({ text: op.text, x: op.x, y: op.y, maxWidth: op.maxWidth, font: op.font, align: op.align, baseline: op.baseline,
            direction: op.direction, color: op.color, stroke, shadow: op.shadow }, device)
          if (placed) this.sprite(placed, op.alpha, op.depth, op.light)
          break
        }
      }
    }
  }

  /** A sprite placed in device pixels, as a textured quad. */
  private sprite(placed: Placed, alpha: number, depth: number, light: Light | null) {
    const { sprite, x, y } = placed, v = this.view!
    // Sprites wholly outside the view are left out.
    if (x > v.width || y > v.height || x + sprite.width < 0 || y + sprite.height < 0) return
    this.stats.sprites++
    const toTexture = multiply({ a: 1 / sprite.width, b: 0, c: 0, d: 1 / sprite.height, e: -x / sprite.width, f: -y / sprite.height }, this.device)
    const texture = this.texture({ source: sprite.canvas as Sized, toTexture, repeat: false, smooth: true })
    const d = this.fromDevice, corners: number[] = []
    for (const [u, w] of [[0, 0], [1, 0], [1, 1], [0, 0], [1, 1], [0, 1]]) {
      const px = x + u * sprite.width, py = y + w * sprite.height
      corners.push(d.a * px + d.c * py + d.e, d.b * px + d.d * py + d.f, 0, 0, 0)
    }
    this.direct(this.emit(corners, pack(1, 1, 1, alpha)), depth, texture, light, boxOf(corners))
  }

  /** The glow a shape with a Canvas shadow casts, drawn before the shape. */
  private glow(op: Extract<DrawOp, { kind: 'fill' | 'stroke' }>) {
    if (!this.sprites || !this.view) { this.unsupported ??= 'shadow'; return }
    if (op.paint.kind !== 'color') { this.unsupported ??= 'patterned shadow'; return }
    // The glow is drawn at the device scale itself, not the tessellation step.
    const shadow = op.shadow!, z = this.device.a, commands = expandArcs(op.commands), ox = commands[1] ?? 0, oy = commands[2] ?? 0
    // The shape in device pixels relative to its first point, to 1/64 pixel; that is also its key.
    const local: number[] = []
    for (let i = 0; i < commands.length;) {
      const code = commands[i++], count = ARGUMENTS[code]
      local.push(code)
      for (let k = 0; k < count; k += 2) local.push(Math.round((commands[i + k] - ox) * z * 64) / 64, Math.round((commands[i + k + 1] - oy) * z * 64) / 64)
      i += count
    }
    const color = op.paint.rgba, fill = `rgba(${color[0] * 255},${color[1] * 255},${color[2] * 255},${color[3]})`
    const style = op.kind === 'stroke' ? op.style : null
    // A numeric digest of the shape, two hashes wide, rather than its points as text.
    let h1 = 0x811c9dc5, h2 = 0x9747b28c
    for (const v of local) { const q = Math.round(v * 64) | 0; h1 = Math.imul(h1 ^ q, 16777619); h2 = Math.imul(h2 ^ q, 2246822519) }
    const key = `${op.kind}:${op.kind === 'fill' ? op.rule : `${style!.width * z},${style!.cap},${style!.join},${style!.miterLimit},${style!.dash.map(d => d * z).join()},${style!.dashOffset * z}`}:${fill}:${local.length}:${h1}:${h2}`
    const pad = style ? style.width * z / 2 * Math.max(1, style.join === 'miter' ? style.miterLimit : 1) + 1 : 1
    const box = { x0: (op.box.x0 - ox) * z - pad, y0: (op.box.y0 - oy) * z - pad, x1: (op.box.x1 - ox) * z + pad, y1: (op.box.y1 - oy) * z + pad }
    const d = this.device, origin = { x: d.a * ox + d.e, y: d.d * oy + d.f }
    const placed = this.sprites.glow(key, box, origin, shadow, g => {
      const path = new Path2D()
      for (let i = 0; i < local.length;) {
        const code = local[i++]
        if (code === MOVE) path.moveTo(local[i], local[i + 1])
        else if (code === LINE) path.lineTo(local[i], local[i + 1])
        else if (code === QUAD) path.quadraticCurveTo(local[i], local[i + 1], local[i + 2], local[i + 3])
        else if (code === CUBIC) path.bezierCurveTo(local[i], local[i + 1], local[i + 2], local[i + 3], local[i + 4], local[i + 5])
        else if (code === CLOSE) path.closePath()
        i += ARGUMENTS[code]
      }
      if (style) {
        g.strokeStyle = fill; g.lineWidth = style.width * z; g.lineCap = style.cap; g.lineJoin = style.join; g.miterLimit = style.miterLimit
        g.setLineDash(style.dash.map(v => v * z)); g.lineDashOffset = style.dashOffset * z; g.stroke(path)
      } else { g.fillStyle = fill; g.fill(path, (op as { rule: CanvasFillRule }).rule) }
    })
    if (placed) {
      // A glow sits between device pixels, as Canvas's own does: the quad keeps the fractional position.
      this.sprite(placed, op.alpha, op.depth, op.light)
    }
  }

  private opaque(paint: Paint, alpha: number) {
    return alpha === 1 && (paint.kind === 'color' ? paint.rgba[3] === 1 : opaqueImage(paint.image))
  }

  /** Close any clips left open and hand the passes over. */
  finish() {
    for (const pass of this.passes) if (pass.kind === 'clip' && pass.end === Infinity) pass.end = this.passes.length
    return this
  }
  /** The vertices built so far, as a view onto the builder's buffer (valid until the next build). */
  get vertexView() { return new Uint8Array(this.f32.buffer, 0, this.count * VERTEX_BYTES) }

  /** A retained scene: its own copy of the vertices. */
  scene(): Scene {
    this.finish()
    return { vertices: this.f32.buffer.slice(0, this.count * VERTEX_BYTES), vertexCount: this.count, passes: this.passes, textures: this.textures, zoom: this.zoom }
  }
}

const rectVertices = (r: Box) => { const out: number[] = []; rectTriangles(r, out); return out }
function boxOf(vertices: readonly number[]): Box {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  for (let k = 0; k < vertices.length; k += FLOATS_PER_VERTEX) {
    x0 = Math.min(x0, vertices[k]); x1 = Math.max(x1, vertices[k]); y0 = Math.min(y0, vertices[k + 1]); y1 = Math.max(y1, vertices[k + 1])
  }
  return { x0, y0, x1, y1 }
}

/** A retained layer from its recorded operations. */
export function buildScene(ops: readonly DrawOp[], zoom: number): Scene {
  const builder = new SceneBuilder()
  builder.reset(zoom)
  builder.add(ops)
  return builder.scene()
}

/** Whether every pixel of a pattern image is opaque; checked once per image. */
const opacity = new WeakMap<object, boolean>()
function opaqueImage(image: Sized) {
  const known = opacity.get(image)
  if (known !== undefined) return known
  let solid = false
  try {
    const canvas = new OffscreenCanvas(image.width, image.height), ctx = canvas.getContext('2d')!
    ctx.drawImage(image, 0, 0)
    const data = ctx.getImageData(0, 0, image.width, image.height).data
    solid = true
    for (let i = 3; i < data.length; i += 4) if (data[i] !== 255) { solid = false; break }
  } catch { solid = false }
  opacity.set(image, solid)
  return solid
}
