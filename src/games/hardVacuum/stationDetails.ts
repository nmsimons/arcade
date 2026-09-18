import type { Expedition } from './expedition'
import { powerConduits, powerTraces } from './powerWiring'

export function drawStationInfrastructure(ctx: CanvasRenderingContext2D, state: Expedition, time: number) {
  const circuits = powerConduits()
  ctx.save(); ctx.lineJoin='bevel'; ctx.lineCap='butt'; ctx.shadowBlur=0
  for (const source of new Set(circuits.map(c=>c.source))) {
    const branches=circuits.filter(c=>c.source===source),powered=!!state.power[source]
    ctx.beginPath()
    for (const trace of powerTraces().filter(c=>c.source===source)) { ctx.moveTo(trace.a.x,trace.a.y); ctx.lineTo(trace.b.x,trace.b.y) }
    ctx.strokeStyle=powered ? 'rgba(91,173,133,.30)' : 'rgba(97,135,133,.20)'
    ctx.lineWidth=1; ctx.stroke()
    if (powered) {
      // Dim traveling current distinguishes a live cable without competing
      // with the ship, receiver arcs or the doorway itself.
      ctx.setLineDash([7,85]); ctx.lineDashOffset=-time*38
      ctx.strokeStyle='rgba(128,231,184,.42)'; ctx.lineWidth=1.2; ctx.stroke()
      ctx.setLineDash([])
    }
    ctx.fillStyle=powered ? 'rgba(101,239,178,.45)' : 'rgba(102,139,139,.30)'
    const contacts=new Map(branches.flatMap(c=>[c.start,c.end]).map(p=>[`${p.x},${p.y}`,p]))
    for (const p of contacts.values()) ctx.fillRect(p.x-1.5,p.y-1.5,3,3)
  }
  ctx.restore()
  // Stencils mark the real cargo hold and the two shared electrical buses.
  ctx.save();ctx.font='10px monospace';ctx.textAlign='center';ctx.fillStyle='#829a824d'
  ctx.fillText('EVACUATION RESERVE / O₂',8840,670)
  ctx.fillText('DEPARTURES 012 / ARRIVALS 000',8000,270)
  ctx.fillText('BERTH + SECURITY / SHARED BUS',4900,950)
  ctx.fillStyle=state.power.heart ? '#65ab9166' : '#b2a1c466'
  ctx.fillText(state.power.heart ? 'CONTAINMENT / HOLD' : 'CONTAINMENT / AUXILIARY FEED',2510,1910)
  ctx.restore()
}
