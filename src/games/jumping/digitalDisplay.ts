import { paintNormally } from './worldPaint.ts'
import type { WorldPaint } from './worldPaint.ts'

/** Shared six-by-two-tile alarm-clock housing. Digits emit readability, not light. */
export const DIGITAL_DISPLAY_WIDTH = 120
export const DIGITAL_DISPLAY_HEIGHT = 40
export const DIGITAL_GREEN = '#a9ef82'
export const DIGITAL_AMBER = '#e6b96f'
export const DIGITAL_RED = '#e98678'
export const DIGITAL_INACTIVE = '#18271e'
export type DigitalIcon = 'pause' | 'fast' | 'finished' | 'coin'

/** Local artwork shared by numeric faces and slim progress meters. */
export function drawDigitalHousing(ctx: CanvasRenderingContext2D, w: number, h: number) {
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
  color = DIGITAL_GREEN, icon?: DigitalIcon, paint: WorldPaint = paintNormally) {
  ctx.save(); ctx.translate(x, y)
  paint(ctx, 0, () => {
    drawDigitalHousing(ctx, DIGITAL_DISPLAY_WIDTH, DIGITAL_DISPLAY_HEIGHT)
    ctx.fillStyle = DIGITAL_INACTIVE; drawSegments(ctx, value, false)
    // A separate, quiet LED bay to the left of the numbers.
    ctx.fillStyle = '#15221b'; ctx.fillRect(22, 9, 1, 22)
  })
  paint(ctx, .65, () => {
    ctx.fillStyle = color; ctx.shadowColor = color; ctx.shadowBlur = 3
    drawSegments(ctx, value, true)
    if (value[2] === ':') {
      ctx.fillRect(66, 12, 3, 3); ctx.fillRect(66, 25, 3, 3)
    } else {
      ctx.beginPath(); ctx.moveTo(70, 8); ctx.lineTo(72, 9); ctx.lineTo(65, 32); ctx.lineTo(63, 31); ctx.closePath(); ctx.fill()
    }
    if (icon === 'pause') {
      ctx.fillRect(9, 15, 3, 10); ctx.fillRect(15, 15, 3, 10)
    } else if (icon === 'fast') {
      ctx.beginPath()
      for (const ix of [7, 13]) { ctx.moveTo(ix, 15); ctx.lineTo(ix + 6, 20); ctx.lineTo(ix, 25); ctx.closePath() }
      ctx.fill()
    } else if (icon === 'finished') {
      ctx.beginPath(); ctx.moveTo(7, 20); ctx.lineTo(11, 24); ctx.lineTo(19, 15)
      ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.stroke()
    } else if (icon === 'coin') {
      ctx.beginPath(); ctx.arc(13, 20, 5, 0, Math.PI * 2)
      ctx.strokeStyle = color; ctx.lineWidth = 1.5; ctx.stroke(); ctx.fillRect(12, 17, 2, 6)
    }
    ctx.shadowBlur = 0
  })
  ctx.restore()
}
