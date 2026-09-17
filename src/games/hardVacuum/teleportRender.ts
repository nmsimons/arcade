import type { Expedition, ExpeditionRuntime } from './expedition'
import { havenPosition, havenReady } from './campaign'

export function drawTeleporter(ctx: CanvasRenderingContext2D, state: Expedition, rt: ExpeditionRuntime) {
  if (!state.teleporterInstalled || !havenReady(state)) return
  const base = havenPosition(state)
  ctx.save(); ctx.translate(base.x, base.y)
  ctx.strokeStyle = '#8ee5e8'; ctx.lineWidth = 1.4; ctx.shadowColor = '#8ee5e8'; ctx.shadowBlur = 4
  const turn = rt.elapsed * 0.18
  for (let i = 0; i < 3; i++) {
    const angle = turn + i * Math.PI * 2 / 3
    ctx.beginPath(); ctx.arc(0, 0, 43, angle, angle + 0.7); ctx.stroke()
  }
  ctx.restore()
  if (!rt.teleport) return
  const progress = 1 - rt.teleport.time / 0.6
  for (const [pos, incoming] of [[base, true], [rt.teleport.from, false]] as const) {
    ctx.save(); ctx.translate(pos.x, pos.y)
    ctx.strokeStyle = '#adfaff'; ctx.shadowColor = '#8ee5e8'; ctx.shadowBlur = 5
    ctx.globalAlpha = 1 - progress; ctx.lineWidth = 2
    const radius = 18 + (incoming ? 1 - progress : progress) * 62
    ctx.beginPath()
    for (let i = 0; i < 6; i++) {
      const angle = i * Math.PI / 3 + turn, x = Math.cos(angle) * radius, y = Math.sin(angle) * radius
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y)
    }
    ctx.closePath(); ctx.stroke(); ctx.restore()
  }
}
