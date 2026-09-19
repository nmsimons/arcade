import { CAMPAIGN_CHAMBERS, CAMPAIGN_GATES, CAMPAIGN_PASSAGES, SERVICE_ROUTES } from './campaignWorld.ts'
import { pointInPolygon } from './worldGeometry.ts'
import type { Vector2 } from './types'
import { TRANSFER_RULES } from './stationExceptions.ts'

const length = (a: Vector2,b: Vector2) => Math.hypot(b.x-a.x,b.y-a.y)
const segmentGap = (p: Vector2,a: Vector2,b: Vector2) => {
  const dx=b.x-a.x,dy=b.y-a.y,t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/(dx*dx+dy*dy)))
  return Math.hypot(p.x-a.x-dx*t,p.y-a.y-dy*t)
}
const groups = new Map<string, typeof CAMPAIGN_PASSAGES>()
for (const passage of CAMPAIGN_PASSAGES) {
  const key=passage.rooms.join('/')
  groups.set(key,[...groups.get(key) ?? [],passage])
}
/** Long transfer tubes carry damaged isotope-powered service conduits.
 * The first expedition out of the Breach deliberately remains safe. */
export const IRRADIATED_TUNNELS = [...groups.entries()].filter(([,parts])=>
  parts[0].gate!==TRANSFER_RULES.safeIntroGate && parts.reduce((n,p)=>n+length(p.centerline[0],p.centerline[1]),0)>=TRANSFER_RULES.minimumTubeLength,
).map(([id,parts])=>({id,parts}))

export const TRANSFER_RADIATION_SOURCES = IRRADIATED_TUNNELS.flatMap(tunnel=>tunnel.parts.flatMap((part,index)=>{
  const [a,b]=part.centerline,d=length(a,b),count=Math.max(1,Math.ceil(d/400))
  return Array.from({length:count},(_,i)=>{
    const t=(i+.5)/count,center={x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t}
    for (const side of [1,-1]) {
      const pos={x:center.x-(b.y-a.y)/d*87*side,y:center.y+(b.x-a.x)/d*87*side}
      // Keep leaking equipment on the Heart side of the sealed return door.
      if (part.gate===TRANSFER_RULES.finalReturnGate && center.x>TRANSFER_RULES.finalReturnQuietArea.minX && center.y<TRANSFER_RULES.finalReturnQuietArea.maxY) continue
      if (Object.values(CAMPAIGN_CHAMBERS).some(shape=>pointInPolygon(pos,shape))) continue
      if (CAMPAIGN_GATES.some(g=>Math.hypot(pos.x-Math.max(g.x,Math.min(g.x+g.w,pos.x)),pos.y-Math.max(g.y,Math.min(g.y+g.h,pos.y)))<42)) continue
      if (SERVICE_ROUTES.some(route=>route.points.slice(1).some((q,j)=>segmentGap(pos,route.points[j],q)<82))) continue
      const early=tunnel.parts[0].rooms.some(room=>TRANSFER_RULES.earlyRooms.includes(room))
      const finalReturn=part.gate===TRANSFER_RULES.finalReturnGate
      // The final tow follows an already irradiated trip from the Heart berth.
      return {id:`tube:${tunnel.id}:${index}:${i}`,name:'FRACTURED ISOTOPE CONDUIT',pos,bodyRadius:10,coreRange:95,range:370,strength:finalReturn ? TRANSFER_RULES.strength.finalReturn : early ? TRANSFER_RULES.strength.early : TRANSFER_RULES.strength.late}
    }
    return undefined
  }).filter(source=>source!==undefined)
}))
