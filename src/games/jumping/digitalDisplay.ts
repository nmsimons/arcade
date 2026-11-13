import { paintNormally } from './worldPaint.ts'
import type { WorldPaint } from './worldPaint.ts'
import type { Grade } from './grading.ts'
import { drawCachedGlow, glowCacheable } from './glowCache.ts'
import { reportDisplay } from './debugFrames.ts'

/** Shared six-by-two-tile alarm-clock housing. Digits emit readability, not light. */
export const DIGITAL_DISPLAY_WIDTH = 120
export const DIGITAL_DISPLAY_HEIGHT = 40
export const DIGITAL_GREEN = '#a9ef82'
export const DIGITAL_AMBER = '#e6b96f'
export const DIGITAL_RED = '#e98678'
export const DIGITAL_INACTIVE = '#18271e'
export const DIGITAL_DIM = '#56645a'
export type DigitalIcon = 'pause' | 'fast' | 'finished' | 'coin'

/** How far the mounting ears reach past each side of a housing. */
export const DIGITAL_MOUNT_REACH = 3
/** Local artwork shared by numeric faces and slim progress meters. Two bolted
 * ears at mid-height hold the housing to the wall, just outside its sides. */
export function drawDigitalHousing(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const ear = Math.min(10, Math.max(4, h * .3)), top = h / 2 - ear / 2, reach = DIGITAL_MOUNT_REACH
  ctx.fillStyle = '#56645c'; ctx.beginPath()
  ctx.roundRect(-reach, top, reach + 2, ear, 1); ctx.roundRect(w - 2, top, reach + 2, ear, 1); ctx.fill()
  ctx.fillStyle = '#2f3833'; ctx.fillRect(-reach + .8, h / 2 - .7, 1.4, 1.4); ctx.fillRect(w + reach - 2.2, h / 2 - .7, 1.4, 1.4)
  ctx.fillStyle = '#45504b'; ctx.beginPath(); ctx.roundRect(0, 0, w, h, 4); ctx.fill()
  ctx.fillStyle = '#242c28'; ctx.beginPath(); ctx.roundRect(1, 2, w - 2, h - 3, 3); ctx.fill()
  ctx.fillStyle = '#090f0c'; ctx.beginPath(); ctx.roundRect(4, 4, w - 8, h - 8, 2); ctx.fill()
}

// Seven bevelled LED segments, ordered top, upper right, lower right, bottom,
// lower left, upper left, middle. Four digits always occupy the same positions.
const segments = [
  [[3, 0], [13, 0], [15, 1.5], [13, 3], [3, 3], [1, 1.5]],
  [[13, 4], [14.5, 2], [16, 4], [16, 10], [14.5, 12], [13, 10]],
  [[13, 16], [14.5, 14], [16, 16], [16, 22], [14.5, 24], [13, 22]],
  [[3, 23], [13, 23], [15, 24.5], [13, 26], [3, 26], [1, 24.5]],
  [[0, 16], [1.5, 14], [3, 16], [3, 22], [1.5, 24], [0, 22]],
  [[0, 4], [1.5, 2], [3, 4], [3, 10], [1.5, 12], [0, 10]],
  [[3, 11.5], [13, 11.5], [15, 13], [13, 14.5], [3, 14.5], [1, 13]],
]
const digitSegments = ['1111110', '0110000', '1101101', '1111001', '0110011', '1011011', '1011111', '1110000', '1111111', '1111011']
const digitXs = [27, 46, 74, 93]
const gradePixels: Record<Grade, string[]> = {
  A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
  B: ['11110', '10001', '10001', '11110', '10001', '10001', '11110'],
  C: ['01111', '10000', '10000', '10000', '10000', '10000', '01111'],
  D: ['11110', '10001', '10001', '10001', '10001', '10001', '11110'],
  F: ['11111', '10000', '10000', '11110', '10000', '10000', '10000'],
}

function drawSegments(ctx: CanvasRenderingContext2D, value: string, lit: boolean) {
  ctx.beginPath()
  for (let i = 0; i < 4; i++) {
    const mask = digitSegments[Number(value[i < 2 ? i : i + 1])]
    for (let j = 0; j < segments.length; j++) {
      if ((mask[j] === '1') !== lit) continue
      const points = segments[j], x = digitXs[i]
      ctx.moveTo(x + points[0][0], 7 + points[0][1])
      for (const [px, py] of points.slice(1)) ctx.lineTo(x + px, 7 + py)
      ctx.closePath()
    }
  }
  ctx.fill()
}

/** Values are exactly two digits, a separator, and two digits (00:00 or 00/00). */
export function drawDigitalDisplay(ctx: CanvasRenderingContext2D, x: number, y: number, value: string,
  color = DIGITAL_GREEN, icon?: DigitalIcon, paint: WorldPaint = paintNormally, options: { grade?: Grade; dimmed?: boolean } = {}) {
  ctx.save(); ctx.translate(x, y)
  reportDisplay(ctx.canvas, () => ctx.getTransform(), value, options.dimmed ? DIGITAL_DIM : color)
  paint(ctx, 0, () => {
    drawDigitalHousing(ctx, DIGITAL_DISPLAY_WIDTH, DIGITAL_DISPLAY_HEIGHT)
    ctx.fillStyle = DIGITAL_INACTIVE; drawSegments(ctx, value, false)
    // A separate, quiet LED bay to the left of the numbers.
    ctx.fillStyle = '#15221b'; ctx.fillRect(22, 9, 1, 22)
  })
  // Lit segments and icons glow in their own colour.
  const lit = (target: CanvasRenderingContext2D) => {
    drawSegments(target, value, true)
    if (value[2] === ':') {
      target.fillRect(66, 12, 3, 3); target.fillRect(66, 25, 3, 3)
    } else {
      target.beginPath(); target.moveTo(70, 8); target.lineTo(72, 9); target.lineTo(65, 32); target.lineTo(63, 31); target.closePath(); target.fill()
    }
    if (options.grade) {
      for (const [row, pixels] of gradePixels[options.grade].entries()) for (let column = 0; column < pixels.length; column++) {
        if (pixels[column] === '1') target.fillRect(7 + column * 2, 9 + row * 3, 2, 3)
      }
    } else if (icon === 'pause') {
      target.fillRect(9, 15, 3, 10); target.fillRect(15, 15, 3, 10)
    } else if (icon === 'fast') {
      target.beginPath()
      for (const ix of [7, 13]) { target.moveTo(ix, 15); target.lineTo(ix + 6, 20); target.lineTo(ix, 25); target.closePath() }
      target.fill()
    } else if (icon === 'finished') {
      target.beginPath(); target.moveTo(7, 20); target.lineTo(11, 24); target.lineTo(19, 15)
      target.strokeStyle = color; target.lineWidth = 2; target.stroke()
    } else if (icon === 'coin') {
      target.beginPath(); target.arc(13, 20, 5, 0, Math.PI * 2)
      target.strokeStyle = color; target.lineWidth = 1.5; target.stroke(); target.fillRect(12, 17, 2, 6)
    }
  }
  paint(ctx, options.dimmed ? 0 : .65, () => {
    ctx.fillStyle = options.dimmed ? DIGITAL_DIM : color
    // In ordinary light the glow comes from a cached image, drawn again only when the reading changes.
    if (!options.dimmed && paint === paintNormally && glowCacheable(ctx)) {
      drawCachedGlow(ctx, `display:${value}:${icon ?? ''}:${options.grade ?? ''}`, DIGITAL_DISPLAY_WIDTH, DIGITAL_DISPLAY_HEIGHT, color, 3, lit)
      lit(ctx)
    } else {
      ctx.shadowColor = color; ctx.shadowBlur = options.dimmed ? 0 : 3
      lit(ctx)
      ctx.shadowBlur = 0
    }
  })
  ctx.restore()
}
