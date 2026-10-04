import type { ForceField } from './forceField.ts'
import { paintNormally } from './worldPaint.ts'
import type { WorldPaint } from './worldPaint.ts'

const seeds = new WeakMap<ForceField, number>()
function fieldSeed(field: ForceField) {
  let seed = seeds.get(field)
  if (seed !== undefined) return seed
  seed = 0
  for (let i = 0; i < field.id.length; i++) seed = (Math.imul(seed, 31) + field.id.charCodeAt(i)) >>> 0
  seeds.set(field, seed)
  return seed
}
const fraction = (value: number) => value - Math.floor(value)

/** A bounded Canvas effect: no particle integration, blur, shadow buffers or light source. */
export function drawForceField(ctx: CanvasRenderingContext2D, field: ForceField, active: boolean, time = 0, editor = false, pending = false, paint: WorldPaint = paintNormally) {
  const horizontal = field.orientation === 'horizontal', length = horizontal ? field.w : field.h
  const transform = ctx.getTransform(), scale = Math.hypot(transform.a, transform.b) || 1
  const x = transform.a * field.x + transform.c * field.y + transform.e
  const y = transform.b * field.x + transform.d * field.y + transform.f
  const pad = Math.max(20 * scale, 3)
  if (x + Math.max(0, transform.a * field.w) + Math.max(0, transform.c * field.h) + pad < 0
    || x + Math.min(0, transform.a * field.w) + Math.min(0, transform.c * field.h) - pad > ctx.canvas.width
    || y + Math.max(0, transform.b * field.w) + Math.max(0, transform.d * field.h) + pad < 0
    || y + Math.min(0, transform.b * field.w) + Math.min(0, transform.d * field.h) - pad > ctx.canvas.height) return
  const moteSize = Math.max(1.4, 1.25 / scale)
  ctx.save(); ctx.translate(field.x, field.y)
  if (!horizontal) { ctx.translate(field.w, 0); ctx.rotate(Math.PI / 2) }
  if (active) paint(ctx, .65, () => {
    const alpha = ctx.globalAlpha, seed = fieldSeed(field)
    // Nested translucent bands give soft edges without a blur/filter pass.
    const shimmer = .9 + .1 * Math.sin(time * 2.1 + seed % 17)
    ctx.fillStyle = '#63c8ed'
    for (let edge = 6; edge > 0; edge--) {
      ctx.globalAlpha = alpha * shimmer * (edge === 6 ? .025 : .045)
      ctx.fillRect(6, -edge * 1.5, length - 12, 12 + edge * 3)
    }
    ctx.globalAlpha = alpha * .22
    ctx.fillRect(7, 0, length - 14, 12)
    ctx.globalAlpha = alpha
    ctx.fillStyle = '#267da7'; ctx.fillRect(7, 3, length - 14, 6)
    ctx.fillStyle = '#c1efff'; ctx.fillRect(7, 5, length - 14, 2)
    // Two slow ripples, with at most 24 segments each even for room-wide beams.
    const segments = Math.min(24, Math.max(4, Math.ceil(length / 24)))
    ctx.strokeStyle = '#a5e7ff'; ctx.lineWidth = 1
    ctx.globalAlpha = alpha * .6
    for (const side of [-1, 1]) {
      ctx.beginPath()
      for (let i = 0; i <= segments; i++) {
        const x = 8 + i / segments * (length - 16)
        const y = 6 + side * (3 + 1.3 * Math.sin(x / 22 - time * 2.8 + seed % 23))
        if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y)
      }
      ctx.stroke()
    }
    // Sparse sparks drift away and fade. Positions are evaluated, never simulated.
    const count = Math.min(8, Math.max(2, Math.floor(length / 65)))
    ctx.fillStyle = '#d3f4ff'
    for (let i = 0; i < count; i++) {
      const phase = fraction(Math.sin(seed + i * 17.31) * 43758.5453)
      const age = fraction(time / (1.7 + phase * .7) + i / count + phase)
      const x = 8 + phase * (length - 16) + Math.sin(time + i) * 2
      const y = 6 + (i % 2 ? 1 : -1) * (3 + 13 * age)
      ctx.globalAlpha = alpha * .55 * Math.sin(age * Math.PI)
      ctx.fillRect(x - moteSize / 2, y - moteSize / 2, moteSize, moteSize)
    }
    ctx.globalAlpha = alpha
  })
  else if (editor || pending) paint(ctx, .65, () => {
    ctx.strokeStyle = pending ? '#267da7' : '#859aa3'; ctx.lineWidth = 1
    ctx.setLineDash([3, 5]); ctx.beginPath(); ctx.moveTo(7, 6); ctx.lineTo(length - 7, 6); ctx.stroke(); ctx.setLineDash([])
  })
  paint(ctx, .65, () => {
    ctx.fillStyle = '#526571'
    ctx.fillRect(0, 0, 8, 12); ctx.fillRect(length - 8, 0, 8, 12)
    ctx.fillStyle = '#a5b2b7'
    ctx.fillRect(2, 2, 2, 8); ctx.fillRect(length - 4, 2, 2, 8)
    ctx.fillStyle = active ? '#c1efff' : pending ? '#67badc' : '#859aa3'
    ctx.fillRect(6, 2, 2, 8); ctx.fillRect(length - 8, 2, 2, 8)
  })
  ctx.restore()
}
