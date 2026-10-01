import { paintNormally } from './worldPaint.ts'
import type { WorldPaint } from './worldPaint.ts'
import { DIGITAL_DISPLAY_WIDTH, DIGITAL_DISPLAY_HEIGHT, DIGITAL_GREEN, DIGITAL_INACTIVE, drawDigitalDisplay, drawDigitalHousing } from './digitalDisplay.ts'

/** Plain gold discs with a substantial edge turn slowly about their vertical axis. */
export const COIN_RADIUS = 18
export const COIN_COLOR = '#dfb44f'
export const COIN_EDGE_COLOR = '#ac7b35'
export const COIN_SPIN_SPEED = 1.35
export const COIN_THICKNESS = 8
export const COIN_SWITCH_THICKNESS = 20 // One editor tile.
export const COIN_SWITCH_LENGTH = 200
export const COIN_SWITCH_MIN_LENGTH = 120
export type CoinSwitchOrientation = { display?: 'digital'; orientation?: never; h?: never }
  | { display?: never; orientation: 'vertical'; h: number }
export const coinSwitchBounds = (switch_: { x: number; y: number; w: number } & CoinSwitchOrientation) =>
  ({ x: switch_.x, y: switch_.y, w: switch_.display === 'digital' ? DIGITAL_DISPLAY_WIDTH : switch_.orientation === 'vertical' ? COIN_SWITCH_THICKNESS : switch_.w,
    h: switch_.display === 'digital' ? DIGITAL_DISPLAY_HEIGHT : switch_.orientation === 'vertical' ? switch_.h : COIN_SWITCH_THICKNESS })

export function formatCoinCount(collected: number, threshold: number) {
  const twoDigits = (n: number) => String(Math.min(99, Math.max(0, Math.floor(n)))).padStart(2, '0')
  return `${twoDigits(collected)}/${twoDigits(threshold)}`
}

export function drawCoin(ctx: CanvasRenderingContext2D, time = 0, phase = 0) {
  const angle = time * COIN_SPIN_SPEED + phase, width = COIN_RADIUS * Math.max(.04, Math.abs(Math.cos(angle)))
  const depth = COIN_THICKNESS * Math.abs(Math.sin(angle))
  ctx.save(); ctx.rotate(Math.sin(angle) * .1)
  ctx.fillStyle = COIN_EDGE_COLOR
  ctx.beginPath(); ctx.ellipse(depth / 2, 0, width, COIN_RADIUS, 0, 0, Math.PI * 2)
  ctx.rect(-depth / 2, -COIN_RADIUS, depth, COIN_RADIUS * 2); ctx.fill()
  ctx.fillStyle = COIN_COLOR
  ctx.beginPath(); ctx.ellipse(-depth / 2, 0, width, COIN_RADIUS, 0, 0, Math.PI * 2); ctx.fill()
  ctx.restore()
}

export function drawCoinSwitch(ctx: CanvasRenderingContext2D, switch_: { x: number; y: number; w: number; threshold: number } & CoinSwitchOrientation, collected: number, active = collected >= switch_.threshold, paint: WorldPaint = paintNormally) {
  if (switch_.display === 'digital') {
    drawDigitalDisplay(ctx, switch_.x, switch_.y, formatCoinCount(collected, switch_.threshold), active ? DIGITAL_GREEN : COIN_COLOR, 'coin', paint)
    return
  }
  const { x, y, w, h } = coinSwitchBounds(switch_), vertical = switch_.orientation === 'vertical'
  const inset = 6, length = (vertical ? h : w) - inset * 2, thickness = (vertical ? w : h) - inset * 2
  const pitch = length / switch_.threshold, gap = Math.min(3, pitch * .25), segmentLength = pitch - gap
  const filled = Math.min(switch_.threshold, Math.max(0, Math.floor(collected)))
  const drawSegments = (from: number, to: number) => {
    ctx.beginPath()
    for (let i = from; i < to; i++) {
      const along = inset + (vertical ? switch_.threshold - i - 1 : i) * pitch + gap / 2
      const radius = Math.min(1.5, segmentLength / 2)
      if (vertical) ctx.roundRect(inset, along, thickness, segmentLength, radius)
      else ctx.roundRect(along, inset, segmentLength, thickness, radius)
    }
    ctx.fill()
  }
  ctx.save(); ctx.translate(x, y)
  paint(ctx, 0, () => {
    drawDigitalHousing(ctx, w, h)
    ctx.fillStyle = DIGITAL_INACTIVE; drawSegments(filled, switch_.threshold)
  })
  // Separate LED cells share the numeric face's glow and activation green.
  // Empty cells, dark gaps, and the housing still receive ordinary room light.
  paint(ctx, .65, () => {
    ctx.fillStyle = active ? DIGITAL_GREEN : COIN_COLOR
    ctx.shadowColor = ctx.fillStyle; ctx.shadowBlur = 3
    drawSegments(0, filled)
    ctx.shadowBlur = 0
  })
  ctx.restore()
}
