/** A non-solid text area, positioned by its top-left corner in world coordinates. */
export interface WallText {
  x: number; y: number; w: number; h: number
  text: string; fontSize: number; align: 'left' | 'center' | 'right'
}
export const WALL_TEXT_COLOR = '#718074'
export const WALL_TEXT_FONT = 'ui-monospace, monospace'
export const WALL_TEXT_LINE_HEIGHT = 1.3

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

const layouts = new WeakMap<WallText, { text: string; width: number; size: number; lines: string[] }>()
export function drawWallTexts(ctx: CanvasRenderingContext2D, texts: readonly WallText[]) {
  for (const text of texts) {
    ctx.save(); ctx.beginPath(); ctx.rect(text.x, text.y, text.w, text.h); ctx.clip()
    ctx.font = `500 ${text.fontSize}px ${WALL_TEXT_FONT}`
    ctx.fillStyle = WALL_TEXT_COLOR; ctx.textAlign = text.align; ctx.textBaseline = 'top'
    let layout = layouts.get(text)
    if (!layout || layout.text !== text.text || layout.width !== text.w || layout.size !== text.fontSize) {
      layout = { text: text.text, width: text.w, size: text.fontSize, lines: wallTextLines(text.text, text.w, value => ctx.measureText(value).width) }
      layouts.set(text, layout)
    }
    const x = text.x + (text.align === 'center' ? text.w / 2 : text.align === 'right' ? text.w : 0)
    const lineHeight = text.fontSize * WALL_TEXT_LINE_HEIGHT
    for (let i = 0; i < layout.lines.length && i * lineHeight < text.h; i++) {
      ctx.fillText(layout.lines[i], x, text.y + i * lineHeight + text.fontSize * .15)
    }
    ctx.restore()
  }
}
