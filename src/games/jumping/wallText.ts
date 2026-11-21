import type { NamedObject } from './objectNames.ts'
import { drawLabStamp } from '../../branding/lab.ts'
import { DIGITAL_GREEN, drawDigitalHousing } from './digitalDisplay.ts'
import { paintNormally } from './worldPaint.ts'
import { labStampWear } from './stampWear.ts'
import { wallWear, type WallWear } from './wallWear.ts'
import { clearGraffitiMarks, GRAFFITI_FADED, GRAFFITI_THINNEST, graffitiMarks, type GraffitiMarks } from './graffitiWear.ts'
import type { WorldPaint } from './worldPaint.ts'
/** A non-solid text area, positioned by its top-left corner in world coordinates. */
export interface WallText extends NamedObject {
  x: number; y: number; w: number; h: number
  text: string; fontSize: number; align: 'left' | 'center' | 'right'
  rotation?: number // Clockwise degrees around the center of the text area.
  style?: 'official' | 'graffiti' | 'lab-stamp' | 'terminal'
}
export const WALL_TEXT_COLOR = '#718074'
export const OFFICIAL_FONT = 'UJG Official'
export const WALL_TEXT_FONT = `"${OFFICIAL_FONT}", sans-serif`
export const MESSAGE_SCREEN_FONT = 'ui-monospace, monospace'
export const GRAFFITI_FONT = 'UJG Graffiti'
export const GRAFFITI_COLOR = '#94433f'
export const NIGHT_GRAFFITI_COLOR = '#f4d35e'
export const WALL_TEXT_LINE_HEIGHT = 1.3
export const MESSAGE_SCREEN_COLOR = DIGITAL_GREEN
export const MESSAGE_SCREEN_PADDING = 12

export function wallTextPoint(text: WallText, x: number, y: number) {
  const angle = (text.rotation ?? 0) * Math.PI / 180, c = Math.cos(angle), s = Math.sin(angle)
  return { x: text.x + text.w / 2 + (x - text.w / 2) * c - (y - text.h / 2) * s,
    y: text.y + text.h / 2 + (x - text.w / 2) * s + (y - text.h / 2) * c }
}
export function wallTextLocalPoint(text: WallText, x: number, y: number) {
  const angle = (text.rotation ?? 0) * Math.PI / 180, c = Math.cos(angle), s = Math.sin(angle)
  const dx = x - text.x - text.w / 2, dy = y - text.y - text.h / 2
  return { x: text.w / 2 + dx * c + dy * s, y: text.h / 2 - dx * s + dy * c }
}
export function wallTextBounds(text: WallText) {
  const angle = (text.rotation ?? 0) * Math.PI / 180, c = Math.abs(Math.cos(angle)), s = Math.abs(Math.sin(angle))
  const w = text.w * c + text.h * s, h = text.w * s + text.h * c
  return { x: text.x + (text.w - w) / 2, y: text.y + (text.h - h) / 2, w, h }
}
/** Keep the rotated area inside the room, including after resizing near a wall. */
export function fitWallText(text: WallText, width: number, height: number): WallText {
  const center = { x: text.x + text.w / 2, y: text.y + text.h / 2 }
  const angle = (text.rotation ?? 0) * Math.PI / 180, c = Math.abs(Math.cos(angle)), s = Math.abs(Math.sin(angle))
  const divide = (n: number, d: number) => d < 1e-10 ? Infinity : n / d
  const h = Math.max(24, Math.min(text.h, 1200, divide(width - 40 * c, s), divide(height - 40 * s, c)))
  const w = Math.max(40, Math.min(text.w, 2000, divide(width - h * s, c), divide(height - h * c, s)))
  const fitted = { ...text, x: center.x - w / 2, y: center.y - h / 2, w, h }
  const bounds = wallTextBounds(fitted)
  fitted.x += Math.max(0, Math.min(width - bounds.w, bounds.x)) - bounds.x
  fitted.y += Math.max(0, Math.min(height - bounds.h, bounds.y)) - bounds.y
  return fitted
}

/** Preserve explicit line breaks; wrap words and split words wider than the area. */
export function wallTextLines(text: string, width: number, measure: (text: string) => number): string[] {
  const lines: string[] = []
  for (const paragraph of text.replace(/\r\n?/g, '\n').split('\n')) {
    let line = ''
    for (const word of paragraph.trim().split(/[ \t]+/)) {
      const candidate = line ? `${line} ${word}` : word
      if (measure(candidate) <= width) { line = candidate; continue }
      if (line) { lines.push(line); line = '' }
      for (const character of word) {
        if (line && measure(line + character) > width) { lines.push(line); line = '' }
        line += character
      }
    }
    lines.push(line)
  }
  return lines
}

let layouts = new WeakMap<WallText, { text: string; width: number; font: string; scale: number; lines: string[]; baseline: number }>()
const capitalAscents = new Map<string, number>()
export function clearWallTextLayouts() { layouts = new WeakMap(); capitalAscents.clear(); clearGraffitiMarks() }
function capitalAscent(ctx: CanvasRenderingContext2D, font: string, size: number) {
  const saved = capitalAscents.get(font)
  if (saved !== undefined) return saved
  const metrics = ctx.measureText('M')
  let ascent = metrics.actualBoundingBoxAscent
  // Some font rasterizers report an outline ascent several pixels above the
  // visible capital. Calibrate once on a small scratch canvas, never by reading
  // the game canvas or scanning text on every frame. Bound both memory and cache.
  const width = Math.ceil(metrics.width + 8), height = Math.ceil(size * 2 + 8)
  if (typeof document !== 'undefined' && width * height <= 1_000_000) {
    const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height
    const sample = canvas.getContext('2d', { willReadFrequently: true })!
    const baseline = Math.ceil(size * 1.5) + 4
    sample.font = font; sample.textBaseline = 'alphabetic'; sample.fillText('M', 4, baseline)
    const pixels = sample.getImageData(0, 0, width, height).data
    ink: for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) if (pixels[(y * width + x) * 4 + 3] > 100) {
      ascent = baseline - y; break ink
    }
    canvas.width = canvas.height = 0
  }
  if (capitalAscents.size >= 64) capitalAscents.delete(capitalAscents.keys().next().value!)
  capitalAscents.set(font, ascent)
  return ascent
}
const screenContents = new WeakMap<WallText, WallText>()
/** Screen geometry uses the same authored area, rotation, clipping and text layout as signs. */
export function messageScreenContent(text: WallText): WallText {
  const pad = Math.min(MESSAGE_SCREEN_PADDING, text.w / 8, text.h / 5)
  let content = screenContents.get(text)
  if (!content || content.text !== text.text || content.w !== text.w - pad * 2 || content.h !== text.h - pad * 2
    || content.fontSize !== text.fontSize || content.align !== text.align) {
    content = { x: pad, y: pad, w: text.w - pad * 2, h: text.h - pad * 2,
      text: text.text, fontSize: text.fontSize, align: text.align, style: 'official' }
    screenContents.set(text, content)
  }
  return content
}
function drawMessageScreen(ctx: CanvasRenderingContext2D, text: WallText, paint: WorldPaint) {
  ctx.save(); ctx.translate(text.x + text.w / 2, text.y + text.h / 2); ctx.rotate((text.rotation ?? 0) * Math.PI / 180)
  ctx.translate(-text.w / 2, -text.h / 2)
  ctx.beginPath(); ctx.rect(0, 0, text.w, text.h); ctx.clip()
  paint(ctx, 0, () => drawDigitalHousing(ctx, text.w, text.h), true, { x: 0, y: 0, w: text.w, h: text.h })
  const content = messageScreenContent(text)
  paint(ctx, .65, () => {
    ctx.save(); ctx.shadowColor = MESSAGE_SCREEN_COLOR; ctx.shadowBlur = 2
    drawPrintedWallTexts(ctx, [content], false, MESSAGE_SCREEN_COLOR, true)
    ctx.restore()
  }, true, { x: content.x, y: content.y, w: content.w, h: content.h })
  ctx.restore()
}

/**
 * Readable phosphor is confined to the screen; ordinary lettering still follows room light. L.A.B. stamps wear
 * with the room's stains (`wear`, from `wallWear(level)`).
 */
export function drawWallTexts(ctx: CanvasRenderingContext2D, texts: readonly WallText[], nightMode = false, paint: WorldPaint = paintNormally, wear: WallWear = wallWear()) {
  for (const text of texts) {
    if (text.style === 'terminal') drawMessageScreen(ctx, text, paint)
    else paint(ctx, 0, () => drawPrintedWallTexts(ctx, [text], nightMode, undefined, false, wear))
  }
}
/** A stamp's or graffiti piece's raster, kept while it is drawn with the same transform, ink and artwork (a still camera). */
const rasters = new WeakMap<WallText, { key: string; art: object | null; cpu: boolean; canvas: HTMLCanvasElement }>()
/** Larger areas on screen (in device pixels) are drawn directly. */
const MOST_RASTER_PIXELS = 4_000_000

/**
 * Wall art with paths in it (an L.A.B. stamp, or graffiti's drips and worn ink), with the transform already at its
 * area's top-left corner. On an HTML canvas it is rasterized on its own canvas, holding the whole area, then
 * copied in at a whole-pixel offset. Chrome rasterizes small paths (lettering, a dashed border, a clip's cut-outs)
 * differently when a clip cuts them, by up to a fifth of their ink deep inside the clip, and the daylight cache
 * redraws a clipped patch around moving actors over a frame drawn whole (jumpingExposureCorrection.dev.spec). A
 * copied raster is the same under any clip. Plain text glyphs and `fillRect` do not need this; a WebGL recording
 * and the unit tests' contexts take the paths directly. `key` and `art` name everything else the drawing depends
 * on: when either changes, the raster is redrawn.
 */
function drawRastered(ctx: CanvasRenderingContext2D, text: WallText, key: string, art: object | null, paint: (target: CanvasRenderingContext2D) => void) {
  if (typeof HTMLCanvasElement === 'undefined' || !(ctx.canvas instanceof HTMLCanvasElement)) { paint(ctx); return }
  const m = ctx.getTransform()
  const xs = [m.e, m.a * text.w + m.e, m.c * text.h + m.e, m.a * text.w + m.c * text.h + m.e]
  const ys = [m.f, m.b * text.w + m.f, m.d * text.h + m.f, m.b * text.w + m.d * text.h + m.f]
  // A pixel of margin keeps every edge's antialiasing inside the raster.
  const left = Math.floor(Math.min(...xs)) - 1, top = Math.floor(Math.min(...ys)) - 1
  const w = Math.ceil(Math.max(...xs)) + 1 - left, h = Math.ceil(Math.max(...ys)) + 1 - top
  if (!(w > 0 && h > 0) || w * h > MOST_RASTER_PIXELS) { paint(ctx); return }
  // A context read back on the CPU gets a CPU raster, so the copy never crosses between CPU and GPU memory.
  const cpu = !!ctx.getContextAttributes?.().willReadFrequently
  const full = `${m.a}:${m.b}:${m.c}:${m.d}:${m.e - left}:${m.f - top}:${w}:${h}:${text.w}:${text.h}:${key}`
  let raster = rasters.get(text)
  if (raster?.key !== full || raster.art !== art || raster.cpu !== cpu) {
    // A context keeps the attributes it was first made with, so a mode change needs a new canvas. A moving
    // camera redraws the raster every frame: keep its size when it fits, rather than reallocating it.
    const canvas = raster?.cpu === cpu ? raster.canvas : ctx.canvas.ownerDocument.createElement('canvas')
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h }
    const target = canvas.getContext('2d', { willReadFrequently: cpu })!
    target.save(); target.resetTransform(); target.clearRect(0, 0, w, h)
    target.setTransform(m.a, m.b, m.c, m.d, m.e - left, m.f - top)
    paint(target)
    target.restore()
    raster = { key: full, art, cpu, canvas }
    rasters.set(text, raster)
  }
  ctx.save(); ctx.resetTransform(); ctx.drawImage(raster.canvas, 0, 0, w, h, left, top, w, h); ctx.restore()
}

/** An L.A.B. stamp, worn with the room (`labStampWear`). */
function drawStamp(ctx: CanvasRenderingContext2D, text: WallText, ink: string, wear?: WallWear) {
  const worn = labStampWear(text, wear)
  drawRastered(ctx, text, ink, worn, target => {
    target.beginPath(); target.rect(0, 0, text.w, text.h); target.clip()
    drawLabStamp(target, 0, 0, text.w, text.h, ink, worn)
  })
}

/**
 * Painted graffiti: its lettering and drips, with flaked marks cut out and faded patches thinned (`graffitiMarks`).
 * `letter` draws the lettering at the target's transform. The clips share only their edges, so no paint is laid
 * twice where they meet.
 */
function paintGraffiti(target: CanvasRenderingContext2D, text: WallText, ink: string, marks: GraffitiMarks, letter: (target: CanvasRenderingContext2D) => void) {
  target.beginPath(); target.rect(0, 0, text.w, text.h); target.clip()
  if (marks.gone) target.clip(marks.gone, 'evenodd')
  const paint = () => {
    letter(target)
    if (marks.drips) { target.fillStyle = ink; target.fill(marks.drips) }
  }
  if (marks.faded && marks.thinnest && marks.unfaded) {
    target.save(); target.clip(marks.unfaded, 'evenodd'); paint(); target.restore()
    target.save(); target.clip(marks.faded, 'evenodd'); target.globalAlpha *= GRAFFITI_FADED; paint(); target.restore()
    target.save(); target.clip(marks.thinnest); target.globalAlpha *= GRAFFITI_THINNEST; paint(); target.restore()
  } else paint()
}

function drawPrintedWallTexts(ctx: CanvasRenderingContext2D, texts: readonly WallText[], nightMode = false, ink?: string, screen = false, wear?: WallWear) {
  for (const text of texts) {
    ctx.save(); ctx.translate(text.x + text.w / 2, text.y + text.h / 2); ctx.rotate((text.rotation ?? 0) * Math.PI / 180)
    ctx.translate(-text.w / 2, -text.h / 2)
    if (text.style === 'lab-stamp') {
      drawStamp(ctx, text, nightMode ? NIGHT_GRAFFITI_COLOR : GRAFFITI_COLOR, wear)
      ctx.restore(); continue
    }
    ctx.beginPath(); ctx.rect(0, 0, text.w, text.h); ctx.clip()
    const graffiti = text.style === 'graffiti'
    const transform = ctx.getTransform(), scale = Math.hypot(transform.c, transform.d) || 1
    const font = graffiti ? `400 ${text.fontSize * scale}px "${GRAFFITI_FONT}", cursive`
      : `${screen ? 500 : 400} ${text.fontSize * scale}px ${screen ? MESSAGE_SCREEN_FONT : WALL_TEXT_FONT}`
    ctx.font = font
    ctx.fillStyle = ink ?? (graffiti ? nightMode ? NIGHT_GRAFFITI_COLOR : GRAFFITI_COLOR : WALL_TEXT_COLOR); ctx.textAlign = text.align; ctx.textBaseline = 'alphabetic'
    let layout = layouts.get(text)
    if (!layout || layout.text !== text.text || layout.width !== text.w || layout.font !== font || layout.scale !== scale) {
      // Safari's top baseline includes extra font ascent. Anchor to measured ink
      // instead, retaining the established capital-letter inset for each style.
      // Font hinting changes with size. Measure and draw the same pixel-sized
      // font, converting its layout back to world units for wrapping and zoom.
      const ascent = capitalAscent(ctx, font, text.fontSize * scale) / scale
      const baseline = ascent + text.fontSize * (graffiti ? 1 / 3 : .25)
      layout = { text: text.text, width: text.w, font, scale, lines: wallTextLines(text.text, text.w, value => ctx.measureText(value).width / scale), baseline }
      layouts.set(text, layout)
    }
    const x = text.align === 'center' ? text.w / 2 : text.align === 'right' ? text.w : 0
    const lineHeight = text.fontSize * WALL_TEXT_LINE_HEIGHT
    const lines = layout.lines, baseline = layout.baseline, fill = ctx.fillStyle
    // Avoid measuring a large hinted font then stretching a differently hinted
    // small font. Keep rotation and the existing world-space clip intact.
    const letter = (target: CanvasRenderingContext2D) => {
      target.save(); target.font = font; target.fillStyle = fill; target.textAlign = text.align; target.textBaseline = 'alphabetic'
      target.scale(1 / scale, 1 / scale)
      for (let i = 0; i < lines.length && i * lineHeight < text.h; i++) target.fillText(lines[i], x * scale, (i * lineHeight + baseline) * scale)
      target.restore()
    }
    if (graffiti && !ink) {
      const marks = graffitiMarks(text, { w: text.w, h: text.h, fontSize: text.fontSize, align: text.align, lines, baseline, font: `"${GRAFFITI_FONT}", cursive` },
        lineHeight, wear)
      ctx.restore(); ctx.save()
      ctx.translate(text.x + text.w / 2, text.y + text.h / 2); ctx.rotate((text.rotation ?? 0) * Math.PI / 180); ctx.translate(-text.w / 2, -text.h / 2)
      drawRastered(ctx, text, `${fill}:${font}:${baseline}`, marks, target => paintGraffiti(target, text, String(fill), marks, letter))
    } else letter(ctx)
    ctx.restore()
  }
}
