import { clamp } from './math.ts'
import type { Debris } from './types'

export function drawDebris(ctx: CanvasRenderingContext2D, debris: readonly Debris[]) {
  for (const d of debris) {
    const alpha = clamp(d.life / (d.spark ? 400 : 2000), 0, 1)
    ctx.save()
    ctx.strokeStyle = `rgba(${d.color}, ${alpha})`
    ctx.lineWidth = d.spark ? 1.3 : 2
    if (d.spark) { ctx.shadowColor = `rgba(${d.color}, ${alpha * .5})`; ctx.shadowBlur = 4 }
    ctx.translate(d.pos.x, d.pos.y)
    ctx.rotate(d.angle)
    ctx.beginPath()
    ctx.moveTo(-d.length / 2, 0)
    ctx.lineTo(d.length / 2, 0)
    ctx.stroke()
    ctx.restore()
  }
}
