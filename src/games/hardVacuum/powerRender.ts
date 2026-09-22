import type { Vector2 } from './types'
import { RECEIVER_HALF_GAP } from './receivers'
import { inRenderView, segmentInRenderView } from './renderView'
import type { RenderView } from './renderView'

/** Shared visual language for live power, in the station and practice room. */
export function drawPowerCircuit(ctx: CanvasRenderingContext2D, traces: readonly {a:Vector2;b:Vector2}[], contacts: readonly Vector2[], powered: boolean, time: number, view?:RenderView) {
  ctx.save();ctx.lineJoin='bevel';ctx.lineCap='butt';ctx.shadowBlur=0
  ctx.beginPath()
  for(const {a,b} of traces) if(segmentInRenderView(a,b,2,view)) {ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y)}
  ctx.strokeStyle=powered ? 'rgba(91,173,133,.30)' : 'rgba(97,135,133,.20)'
  ctx.lineWidth=1;ctx.stroke()
  if(powered) {
    ctx.setLineDash([7,85]);ctx.lineDashOffset=-time*38
    ctx.strokeStyle='rgba(128,231,184,.42)';ctx.lineWidth=1.2;ctx.stroke()
    ctx.setLineDash([])
  }
  ctx.fillStyle=powered ? 'rgba(101,239,178,.45)' : 'rgba(102,139,139,.30)'
  for(const p of contacts)if(inRenderView(p,2,view))ctx.fillRect(p.x-1.5,p.y-1.5,3,3)
  ctx.restore()
}

export function drawReceiverCurrent(ctx: CanvasRenderingContext2D, pos: Vector2, time: number) {
  ctx.save()
  ctx.translate(pos.x, pos.y)
  ctx.lineJoin = 'round'; ctx.lineCap = 'round'
  for (const side of [-1, 1]) {
    const phase = time + side * 1.7 + pos.x * 0.013 + pos.y * 0.009
    ctx.beginPath()
    for (let i = 0; i <= 16; i++) {
      const u = i / 16
      const x = side * (12 + (RECEIVER_HALF_GAP - 12) * u)
      const y = Math.sin(Math.PI * u) * (Math.sin(u * 39 - phase * 14) * 2.3 + Math.sin(u * 73 + phase * 21) * 1.2)
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y)
    }
    ctx.strokeStyle = '#65efb230'; ctx.lineWidth = 3; ctx.stroke()
    const pulse = (phase * 0.8) % 1
    const current = ctx.createLinearGradient(side * 12, 0, side * RECEIVER_HALF_GAP, 0)
    current.addColorStop(0, '#65efb2b0')
    current.addColorStop(Math.max(0, pulse - 0.18), '#65efb2b0')
    current.addColorStop(pulse, '#dcfff0')
    current.addColorStop(Math.min(1, pulse + 0.18), '#65efb2b0')
    current.addColorStop(1, '#65efb2b0')
    ctx.strokeStyle = current; ctx.lineWidth = 1.1; ctx.stroke()
  }
  ctx.restore()
}
