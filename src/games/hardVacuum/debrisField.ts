import { expeditionMap, PICKUPS, SECTORS, SOCKETS } from './expedition.ts'
import { BERTHS, CAMPAIGN_PASSAGES, IGNITION_CRADLE, REGIONS } from './campaignWorld.ts'
import { havenPosition } from './campaign.ts'
import { PASSAGES } from './stationLayout.ts'
import type { Expedition } from './expedition'
import { isInsideCavern, pointInPolygon } from './worldGeometry.ts'
import type { Rock, RockKind, Vector2 } from './types'
import { RADIATION_SOURCES } from './radiation.ts'
import { BOT_STATIONS } from './stationBots.ts'
import { ENCOUNTER_RULES, TRANSFER_RULES } from './stationExceptions.ts'

export const DEBRIS_PROFILES = {
  breach: { count: 6, blue: 0, speed: 28, spread: 12 },
  freight: { count: 9, blue: 2, speed: 32, spread: 22 },
  works: { count: 12, blue: 3, speed: 38, spread: 26 },
  ring: { count: 14, blue: 4, speed: 40, spread: 30 },
  refuge: { count: 7, blue: 2, speed: 28, spread: 14 },
  heart: { count: 18, blue: 6, speed: 48, spread: 32 },
} as const
export const debrisProfile = (room: string) => DEBRIS_PROFILES[REGIONS.find(r=>r.rooms.some(id=>id===room))?.id ?? 'breach']

// Mining white rock is a separate source of danger from the initial debris field.
// Rates are per exposed fragment; each mined white asteroid releases two.
export const FRAGMENT_PROFILES = {
  breach: {red:0,blue:0}, freight: {red:.10,blue:.06}, works: {red:.20,blue:.10},
  ring: {red:.28,blue:.15}, refuge: {red:.05,blue:.12}, heart: {red:.42,blue:.20},
} as const
export function fragmentProfileAt(pos: Vector2) {
  const room = SECTORS.find(r=>pos.x>=r.x && pos.x<=r.x+r.w && pos.y>=r.y && pos.y<=r.y+r.h)
  if (!room && CAMPAIGN_PASSAGES.some(p=>p.gate===TRANSFER_RULES.finalReturnGate&&pointInPolygon(pos,p.shape))) return FRAGMENT_PROFILES.heart
  const region=REGIONS.find(r=>r.rooms.some(id=>id===room?.id)) ?? [...REGIONS].sort((a,b)=>
    Math.hypot(pos.x-a.bounds[0]-a.bounds[2]/2,pos.y-a.bounds[1]-a.bounds[3]/2)-Math.hypot(pos.x-b.bounds[0]-b.bounds[2]/2,pos.y-b.bounds[1]-b.bounds[3]/2))[0]
  return FRAGMENT_PROFILES[region.id]
}
export const fragmentKindAt = (pos: Vector2,roll: number): RockKind => fragmentKindFor({pos},roll)
export function fragmentKindFor(rock: Pick<Rock,'pos'|'fragmentRates'>,roll: number): RockKind {
  const rates=rock.fragmentRates ?? fragmentProfileAt(rock.pos)
  return roll<rates.red ? 'red' : roll<rates.red+rates.blue ? 'blue' : 'normal'
}

export function debrisField(state: Expedition) {
  const field: { pos: Vector2; vel: Vector2; radius: number; kind: RockKind }[] = []
  const map = expeditionMap(state)
  let seed = 1741
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296 }
  const base = havenPosition(state)
  const protectedPoints = [state.position, base, IGNITION_CRADLE, ...BERTHS.map(b => b.pos), ...PICKUPS.map(p => p.pos), ...SOCKETS.flatMap(s => [s.pos, s.source]), ...RADIATION_SOURCES.map(s => s.pos),...BOT_STATIONS.map(b=>b.home)]
  for (const room of SECTORS) {
    const profile = debrisProfile(room.id)
    const count = ENCOUNTER_RULES.roomCounts[room.id] ?? profile.count
    let added = 0
    for (let attempt = 0; attempt < 350 && added < count; attempt++) {
      const radius = 17 + random() * 18
      const pos = { x: room.x + 55 + random() * (room.w - 110), y: room.y + 55 + random() * (room.h - 110) }
      if (!isInsideCavern(pos, radius + 12, map) || protectedPoints.some(p => Math.hypot(p.x - pos.x, p.y - pos.y) < (p === state.position || p === base || BERTHS.some(b => b.pos === p) ? 175 : 80) + radius) || field.some(r => Math.hypot(r.pos.x - pos.x, r.pos.y - pos.y) < r.radius + radius + 24)) continue
      const angle = random() * Math.PI * 2, speed = profile.speed + random() * profile.spread
      const kind: RockKind = added < profile.blue ? 'blue' : 'normal'
      field.push({ pos, radius: kind === 'normal' ? radius : 19, kind, vel: { x: Math.cos(angle) * speed, y: Math.sin(angle) * speed } })
      added++
    }
  }
  // Slow drifting debris in the transfer tubes makes navigation matter between
  // rooms, without filling the opening cavern with extra threats.
  for (const [i,passage] of PASSAGES.entries()) {
    if (i % 3 !== 0 || passage.rooms.includes(ENCOUNTER_RULES.safeTransitRoom)) continue
    const pos = passage.shape.reduce((p,q) => ({ x:p.x+q.x/passage.shape.length,y:p.y+q.y/passage.shape.length }),{x:0,y:0})
    const radius = 16 + random()*8, angle = random()*Math.PI*2
    if (!isInsideCavern(pos,radius+25,map) || protectedPoints.some(p => Math.hypot(p.x-pos.x,p.y-pos.y)<180) || field.some(r => Math.hypot(r.pos.x-pos.x,r.pos.y-pos.y)<r.radius+radius+30)) continue
    const profile = debrisProfile(passage.rooms[0]), kind: RockKind = profile.blue>=2 && i%5===0 ? 'blue' : 'normal'
    field.push({pos,radius,kind,vel:{x:Math.cos(angle)*profile.speed,y:Math.sin(angle)*profile.speed}})
  }
  // The commissioning tube is the last towing challenge. Small moving rocks
  // leave maneuvering room, with blue hazards and red pockets inside white rock.
  let finalRocks=0
  for (const passage of CAMPAIGN_PASSAGES.filter(p=>p.gate===TRANSFER_RULES.finalReturnGate)) {
    const [a,b]=passage.centerline,dx=b.x-a.x,dy=b.y-a.y,length=Math.hypot(dx,dy),count=Math.ceil(length/240)
    let added=0
    for(let attempt=0;attempt<count*18 && added<count;attempt++) {
      const t=.12+random()*.76,offset=(random()-.5)*48
      const pos={x:a.x+dx*t-dy/length*offset,y:a.y+dy*t+dx/length*offset}
      const kind:RockKind=finalRocks%3===1 ? 'blue' : 'normal',radius=kind==='normal' ? 24 : 19
      const clearance=ENCOUNTER_RULES.finalDoorClearance
      if (!isInsideCavern(pos,radius+12,map)||Math.hypot(pos.x-clearance.x,pos.y-clearance.y)<clearance.radius||RADIATION_SOURCES.some(s=>Math.hypot(s.pos.x-pos.x,s.pos.y-pos.y)<radius+s.bodyRadius+15)||field.some(r=>Math.hypot(r.pos.x-pos.x,r.pos.y-pos.y)<r.radius+radius+60)) continue
      const angle=random()*Math.PI*2,speed=35+random()*22
      field.push({pos,radius,kind,vel:{x:Math.cos(angle)*speed,y:Math.sin(angle)*speed}})
      added++;finalRocks++
    }
  }
  return field
}
