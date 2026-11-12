/**
 * Small pictures that Canvas 2D draws for the WebGL frame, where Canvas's own
 * rasterizer is the reference: text (its shapes, hinting and anti-aliasing)
 * and shadows (`shadowBlur` glows). Each is drawn once at the device scale and
 * kept while it is in use.
 *
 * Text is drawn at its position's fraction of a device pixel, to a quarter
 * pixel, and placed on whole device pixels, so it lands as crisply as Canvas
 * draws it. A glow is blurred anyway: it is drawn once and placed exactly,
 * between pixels, as Canvas places a cached glow. The shape casting it is
 * drawn by WebGL over it.
 */
import type { Matrix } from './artPath.ts'
import type { Box, Shadow, StrokeStyle } from './recorder.ts'

type Surface = HTMLCanvasElement | OffscreenCanvas
type Context = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D
export interface Sprite { canvas: Surface; width: number; height: number; used: number; bytes: number }
/** A sprite placed in device pixels: its top-left corner. */
export interface Placed { sprite: Sprite; x: number; y: number }

export interface TextSpec {
  text: string; x: number; y: number; maxWidth?: number; font: string; align: CanvasTextAlign; baseline: CanvasTextBaseline; direction: CanvasDirection
  /** A stroke's width and dashes in text space, as the artwork set them. */
  color: string; stroke: StrokeStyle | null; shadow: Shadow | null
}

const surface = (width: number, height: number): Surface => {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(width, height)
  const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height; return canvas
}
const reach = (shadow: Shadow | null) => shadow ? Math.ceil(shadow.blur * 1.5) + 2 + Math.ceil(Math.max(Math.abs(shadow.offsetX), Math.abs(shadow.offsetY))) : 0

export class SpriteCache {
  private sprites = new Map<string, Sprite>()
  private measure?: Context
  private bytes = 0
  frame = 0
  /** At most this much pixel memory; older sprites go first. */
  readonly budget: number
  constructor(budget = 8 * 1024 * 1024) { this.budget = budget }

  private context() {
    this.measure ??= surface(1, 1).getContext('2d') as Context
    return this.measure
  }

  /** Text drawn through `device` (text space to device pixels), or null when it draws nothing. */
  text(spec: TextSpec, device: Matrix): Placed | null {
    const tx = device.a * spec.x + device.c * spec.y + device.e, ty = device.b * spec.x + device.d * spec.y + device.f
    // Whole pixels place the sprite; the remaining fraction is drawn into it, as Canvas positions glyphs:
    // level text across to the nearest quarter pixel with its baseline on the nearest whole one, other text to quarters.
    const level = Math.abs(device.b) < 1e-9 && Math.abs(device.c) < 1e-9
    let ix = Math.floor(tx), iy = level ? Math.round(ty) : Math.floor(ty)
    let qx = Math.round((tx - ix) * 4) / 4, qy = level ? 0 : Math.round((ty - iy) * 4) / 4
    if (qx === 1) { qx = 0; ix++ }
    if (qy === 1) { qy = 0; iy++ }
    const linear = `${device.a.toFixed(6)},${device.b.toFixed(6)},${device.c.toFixed(6)},${device.d.toFixed(6)}`
    const s = spec.shadow, k = spec.stroke
    // Text drawn while fonts load may use a fallback; once they settle it is drawn again, as Canvas would.
    const fonts = typeof document === 'undefined' ? '' : document.fonts?.status ?? ''
    const key = `t\u0000${fonts}\u0000${spec.text}\u0000${spec.font}\u0000${spec.align}\u0000${spec.baseline}\u0000${spec.direction}\u0000${spec.color}\u0000${spec.maxWidth ?? ''}\u0000${linear}\u0000${qx},${qy}`
      + (s ? `\u0000${s.blur},${s.color},${s.offsetX},${s.offsetY}` : '') + (k ? `\u0000${k.width},${k.cap},${k.join},${k.miterLimit},${k.dash.join()},${k.dashOffset}` : '')
    let entry = this.sprites.get(key)
    if (!entry) {
      const ctx = this.context()
      ctx.font = spec.font; ctx.textAlign = spec.align; ctx.textBaseline = spec.baseline; ctx.direction = spec.direction
      const metrics = ctx.measureText(spec.text)
      if (!metrics.width && !metrics.actualBoundingBoxRight && !metrics.actualBoundingBoxLeft) return null
      const squeeze = spec.maxWidth !== undefined && metrics.width > spec.maxWidth ? spec.maxWidth / metrics.width : 1
      const strokePad = k ? k.width * Math.hypot(device.a, device.b) / 2 * Math.max(1, k.join === 'miter' ? k.miterLimit : 1) : 0
      const left = -metrics.actualBoundingBoxLeft * squeeze, right = metrics.actualBoundingBoxRight * squeeze
      const top = -metrics.actualBoundingBoxAscent, bottom = metrics.actualBoundingBoxDescent
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
      for (const [u, v] of [[left, top], [right, top], [left, bottom], [right, bottom]]) {
        const dx = device.a * u + device.c * v, dy = device.b * u + device.d * v
        x0 = Math.min(x0, dx); x1 = Math.max(x1, dx); y0 = Math.min(y0, dy); y1 = Math.max(y1, dy)
      }
      const pad = 2 + reach(s) + Math.ceil(strokePad)
      const fx = Math.floor(x0) - pad, fy = Math.floor(y0) - pad
      const width = Math.ceil(x1) - fx + pad + 1, height = Math.ceil(y1) - fy + pad + 1
      if (width > 4096 || height > 4096) return null
      const canvas = surface(width, height), g = canvas.getContext('2d') as Context
      g.setTransform(device.a, device.b, device.c, device.d, qx - fx, qy - fy)
      g.font = spec.font; g.textAlign = spec.align; g.textBaseline = spec.baseline; g.direction = spec.direction
      if (s) { g.shadowBlur = s.blur; g.shadowColor = s.color; g.shadowOffsetX = s.offsetX; g.shadowOffsetY = s.offsetY }
      if (k) {
        g.strokeStyle = spec.color; g.lineWidth = k.width; g.setLineDash([...k.dash]); g.lineDashOffset = k.dashOffset; g.lineCap = k.cap; g.lineJoin = k.join; g.miterLimit = k.miterLimit
        g.strokeText(spec.text, 0, 0, spec.maxWidth)
      } else { g.fillStyle = spec.color; g.fillText(spec.text, 0, 0, spec.maxWidth) }
      entry = { canvas, width, height, used: this.frame, bytes: width * height * 4, x: fx, y: fy } as Sprite & { x: number; y: number }
      this.add(key, entry)
    }
    entry.used = this.frame
    const offset = entry as Sprite & { x: number; y: number }
    return { sprite: entry, x: ix + offset.x, y: iy + offset.y }
  }

  /**
   * The glow a shape casts: its shadow alone. `path` traces the shape relative
   * to `origin` (device pixels, unrounded), already at the device scale.
   */
  glow(key: string, box: Box, origin: { x: number; y: number }, shadow: Shadow, draw: (ctx: Context) => void): Placed | null {
    const full = `g\u0000${key}\u0000${shadow.blur},${shadow.color},${shadow.offsetX},${shadow.offsetY}`
    let entry = this.sprites.get(full) as (Sprite & { x: number; y: number }) | undefined
    if (!entry) {
      const pad = reach(shadow)
      const fx = Math.floor(box.x0) - pad, fy = Math.floor(box.y0) - pad
      const width = Math.ceil(box.x1) - fx + pad + 1, height = Math.ceil(box.y1) - fy + pad + 1
      if (width > 4096 || height > 4096) return null
      const canvas = surface(width, height), g = canvas.getContext('2d') as Context
      // Shadows only: the shape lands far off the picture and its shadow is offset back into place.
      const away = width + height + 64
      g.setTransform(1, 0, 0, 1, -fx - away, -fy)
      g.shadowColor = shadow.color; g.shadowBlur = shadow.blur; g.shadowOffsetX = away + shadow.offsetX; g.shadowOffsetY = shadow.offsetY
      draw(g)
      entry = { canvas, width, height, used: this.frame, bytes: width * height * 4, x: fx, y: fy }
      this.add(full, entry)
    }
    entry.used = this.frame
    return { sprite: entry, x: origin.x + entry.x, y: origin.y + entry.y }
  }

  private add(key: string, sprite: Sprite) {
    this.sprites.set(key, sprite); this.bytes += sprite.bytes
    if (this.bytes <= this.budget) return
    // Over budget: let go of the sprites unused longest, never this frame's.
    const old = [...this.sprites].filter(([, s]) => s.used < this.frame).sort((a, b) => a[1].used - b[1].used)
    for (const [k, s] of old) {
      if (this.bytes <= this.budget * .75) break
      this.sprites.delete(k); this.bytes -= s.bytes
    }
  }

  /** Forget sprites unused for `frames` frames. */
  sweep(frames = 240) {
    for (const [k, s] of this.sprites) if (this.frame - s.used > frames) { this.sprites.delete(k); this.bytes -= s.bytes }
  }
  get size() { return this.sprites.size }
  get pixelBytes() { return this.bytes }
  clear() { this.sprites.clear(); this.bytes = 0 }
}
