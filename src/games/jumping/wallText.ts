import type { NamedObject } from './objectNames.ts'
/** A non-solid text area, positioned by its top-left corner in world coordinates. */
export interface WallText extends NamedObject {
  x: number; y: number; w: number; h: number
  text: string; fontSize: number; align: 'left' | 'center' | 'right'
  rotation?: number // Clockwise degrees around the center of the text area.
  style?: 'official' | 'graffiti'
}
export const WALL_TEXT_COLOR = '#718074'
export const WALL_TEXT_FONT = 'ui-monospace, monospace'
export const GRAFFITI_FONT = 'UJG Graffiti'
export const GRAFFITI_COLOR = '#94433f'
export const WALL_TEXT_LINE_HEIGHT = 1.3

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

let layouts = new WeakMap<WallText, { text: string; width: number; font: string; lines: string[] }>()
export function clearWallTextLayouts() { layouts = new WeakMap() }
export function drawWallTexts(ctx: CanvasRenderingContext2D, texts: readonly WallText[]) {
  for (const text of texts) {
    ctx.save(); ctx.translate(text.x + text.w / 2, text.y + text.h / 2); ctx.rotate((text.rotation ?? 0) * Math.PI / 180)
    ctx.translate(-text.w / 2, -text.h / 2)
    ctx.beginPath(); ctx.rect(0, 0, text.w, text.h); ctx.clip()
    const graffiti = text.style === 'graffiti'
    const font = graffiti ? `400 ${text.fontSize}px "${GRAFFITI_FONT}", cursive` : `500 ${text.fontSize}px ${WALL_TEXT_FONT}`
    ctx.font = font
    ctx.fillStyle = graffiti ? GRAFFITI_COLOR : WALL_TEXT_COLOR; ctx.textAlign = text.align; ctx.textBaseline = 'top'
    let layout = layouts.get(text)
    if (!layout || layout.text !== text.text || layout.width !== text.w || layout.font !== font) {
      layout = { text: text.text, width: text.w, font, lines: wallTextLines(text.text, text.w, value => ctx.measureText(value).width) }
      layouts.set(text, layout)
    }
    const x = text.align === 'center' ? text.w / 2 : text.align === 'right' ? text.w : 0
    const lineHeight = text.fontSize * WALL_TEXT_LINE_HEIGHT
    for (let i = 0; i < layout.lines.length && i * lineHeight < text.h; i++) {
      ctx.fillText(layout.lines[i], x, i * lineHeight + text.fontSize * .15)
    }
    ctx.restore()
  }
}
