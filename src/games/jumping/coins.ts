import { paintNormally } from './worldPaint.ts'
import type { WorldPaint } from './worldPaint.ts'

/** Plain gold discs with a substantial edge turn slowly about their vertical axis. */
export const COIN_RADIUS = 18
export const COIN_COLOR = '#dfb44f'
export const COIN_EDGE_COLOR = '#ac7b35'
export const COIN_SPIN_SPEED = 1.35
export const COIN_THICKNESS = 8
export const COIN_SWITCH_THICKNESS = 20 // One editor tile.
export const COIN_SWITCH_LENGTH = 200
export const COIN_SWITCH_MIN_LENGTH = 120
export type CoinSwitchOrientation = { orientation?: never; h?: never } | { orientation: 'vertical'; h: number }
export const coinSwitchBounds = (switch_: { x: number; y: number; w: number } & CoinSwitchOrientation) =>
  ({ x: switch_.x, y: switch_.y, w: switch_.orientation === 'vertical' ? COIN_SWITCH_THICKNESS : switch_.w, h: switch_.orientation === 'vertical' ? switch_.h : COIN_SWITCH_THICKNESS })

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
  const { x, y, w, h } = coinSwitchBounds(switch_), progress = Math.min(1, collected / switch_.threshold)
  const inset = 4, width = w - inset * 2, height = h - inset * 2
  ctx.save(); ctx.translate(x, y)
  paint(ctx, 0, () => {
    ctx.fillStyle = '#e2e7da'; ctx.fillRect(0, 0, w, h)
    ctx.fillStyle = '#c5ccbd'; ctx.fillRect(inset, inset, width, height)
  })
  // Only filled segments glow. Empty slots, dividers and housing take room light.
  paint(ctx, .65, () => {
    ctx.fillStyle = active ? '#91ad69' : COIN_COLOR
    if (switch_.orientation === 'vertical') ctx.fillRect(inset, inset + height * (1 - progress), width, height * progress)
    else ctx.fillRect(inset, inset, width * progress, height)
  })
  paint(ctx, 0, () => {
    ctx.fillStyle = '#e2e7da'
    for (let i = 1; i < switch_.threshold; i++) {
      if (switch_.orientation === 'vertical') ctx.fillRect(inset, inset + height * i / switch_.threshold - .5, width, 1)
      else ctx.fillRect(inset + width * i / switch_.threshold - .5, inset, 1, height)
    }
  })
  ctx.restore()
}
