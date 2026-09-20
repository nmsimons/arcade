import type { Expedition } from './expedition'
import { powerConduits, powerTraces } from './powerWiring'
import { drawPowerCircuit } from './powerRender'
import { drawWayfindingSign, REGION_ENTRY_SIGNS } from './stationWayfinding'

export function drawStationInfrastructure(ctx: CanvasRenderingContext2D, state: Expedition, time: number) {
  const circuits = powerConduits()
  for (const source of new Set(circuits.map(c=>c.source))) {
    const branches=circuits.filter(c=>c.source===source),powered=!!state.power[source]
    const contacts=new Map(branches.flatMap(c=>[c.start,c.end]).map(p=>[`${p.x},${p.y}`,p]))
    drawPowerCircuit(ctx,powerTraces().filter(c=>c.source===source),[...contacts.values()],powered,time)
  }
  for(const sign of REGION_ENTRY_SIGNS) drawWayfindingSign(ctx,sign)
  // Sparse industrial labels, not instructions for solving the station.
  ctx.save();ctx.font='10px monospace';ctx.textAlign='center';ctx.fillStyle='#829a824d'
  ctx.fillText('EVACUATION RESERVE / O₂',8840,670)
  ctx.fillText('POD MANIFEST 012 / DISPATCHED 004',8000,270)
  ctx.fillStyle=state.power.heart ? '#65ab9166' : '#b2a1c466'
  ctx.fillText(state.power.heart ? 'CONTAINMENT / HOLD' : 'CONTAINMENT / AUXILIARY FEED',2510,1910)
  ctx.restore()
}
