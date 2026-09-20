import type { Vector2 } from './types'

/** Draw every rock contour together, outside the gameplay clip, so inner and
 * outer walls have the same complete edge. Doors and machinery are not terrain. */
export function drawTerrainWalls(ctx: CanvasRenderingContext2D, boundary: readonly Vector2[], islands: readonly (readonly Vector2[])[]) {
  ctx.save()
  ctx.beginPath()
  for (const contour of [boundary, ...islands]) {
    contour.forEach((point, index) => {
      if (index === 0) ctx.moveTo(point.x, point.y)
      else ctx.lineTo(point.x, point.y)
    })
    ctx.closePath()
  }
  ctx.lineJoin = 'round'
  ctx.strokeStyle = 'rgba(70, 100, 86, 0.4)'
  ctx.lineWidth = 5
  ctx.shadowBlur = 7
  ctx.shadowColor = 'rgba(0, 255, 136, 0.12)'
  ctx.stroke()
  ctx.shadowBlur = 0
  ctx.strokeStyle = 'rgba(174, 197, 181, 0.52)'
  ctx.lineWidth = 1.4
  ctx.stroke()
  ctx.restore()
}
