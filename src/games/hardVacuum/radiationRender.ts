import { RADIATION_SOURCES, radiationFootprint } from './radiation'
import type { RadiationFeedback } from './radiation'
import type { CavernMap } from './worldGeometry'
import type { Ship, Vector2 } from './types'
import { drawExpeditionObject } from './objectModels'

const trace = (ctx: CanvasRenderingContext2D, points: Vector2[]) => {
  ctx.beginPath()
  points.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y))
  ctx.closePath()
}

export function drawRadiationFields(ctx: CanvasRenderingContext2D, map: CavernMap, time: number) {
  for (const source of RADIATION_SOURCES) {
    ctx.save()
    trace(ctx, radiationFootprint(source, map)); ctx.clip()
    const field = ctx.createRadialGradient(source.pos.x, source.pos.y, source.bodyRadius, source.pos.x, source.pos.y, source.range)
    field.addColorStop(0, 'rgba(168, 117, 255, 0.22)')
    field.addColorStop(0.5, 'rgba(151, 113, 255, 0.10)')
    field.addColorStop(1, 'rgba(151, 113, 255, 0)')
    ctx.fillStyle = field; ctx.fill()
    ctx.strokeStyle = '#b8a0ff55'; ctx.lineWidth = 1; ctx.setLineDash([4, 10])
    ctx.beginPath(); ctx.arc(source.pos.x, source.pos.y, source.range - 1, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([])
    // Sparse expanding detector contours make the source of the field legible.
    const phase = time * 0.28 % 1
    const radius = source.bodyRadius + phase * (source.range - source.bodyRadius)
    ctx.strokeStyle = `rgba(193, 173, 255, ${0.16 * (1 - phase)})`
    ctx.beginPath(); ctx.arc(source.pos.x, source.pos.y, radius, 0, Math.PI * 2); ctx.stroke()
    ctx.restore()
  }
}

export function drawRadiationSources(ctx: CanvasRenderingContext2D, ship: Ship, time: number) {
  for (const source of RADIATION_SOURCES) {
    drawExpeditionObject(ctx, 'emitter', source.pos, { time, scale: source.bodyRadius / 30 })
    if (Math.hypot(ship.pos.x - source.pos.x, ship.pos.y - source.pos.y) > source.range + 40) continue
    ctx.save(); ctx.textAlign = 'center'; ctx.font = '9px monospace'; ctx.fillStyle = '#c1adff'
    ctx.fillText(source.name, source.pos.x, source.pos.y - 47)
    ctx.fillStyle = '#a091c7'; ctx.fillText('RADIATION SOURCE', source.pos.x, source.pos.y + 47)
    ctx.restore()
  }
}

export function drawRadiationShield(ctx: CanvasRenderingContext2D, ship: Ship, feedback: RadiationFeedback, time: number) {
  if (!feedback.intensity || (!feedback.draining && !feedback.unprotected)) return
  ctx.save(); ctx.translate(ship.pos.x, ship.pos.y)
  ctx.strokeStyle = feedback.unprotected ? '#ff7962' : '#c1adff'
  ctx.shadowColor = ctx.strokeStyle; ctx.shadowBlur = 5
  ctx.globalAlpha = 0.45 + feedback.pulse * 0.4; ctx.lineWidth = 1.5
  const radius = ship.radius + 17
  for (let i = 0; i < 3; i++) {
    const angle = time * 0.35 + i * Math.PI * 2 / 3
    ctx.beginPath(); ctx.arc(0, 0, radius, angle, angle + 1.2); ctx.stroke()
  }
  if (feedback.source) {
    const angle = Math.atan2(feedback.source.pos.y - ship.pos.y, feedback.source.pos.x - ship.pos.x)
    ctx.lineWidth = 2.5; ctx.globalAlpha = 0.4 + feedback.pulse * 0.6
    ctx.beginPath(); ctx.arc(0, 0, radius + feedback.pulse * 4, angle - 0.4, angle + 0.4); ctx.stroke()
  }
  ctx.restore()
}
