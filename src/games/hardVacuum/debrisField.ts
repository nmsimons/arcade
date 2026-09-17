import { expeditionMap, PICKUPS, SECTORS, SOCKETS } from './expedition.ts'
import { BERTHS } from './campaignWorld.ts'
import { havenPosition } from './campaign.ts'
import { PASSAGES } from './stationLayout.ts'
import type { Expedition } from './expedition'
import { isInsideCavern } from './worldGeometry.ts'
import type { RockKind, Vector2 } from './types'
import { RADIATION_SOURCES } from './radiation.ts'

export function debrisField(state: Expedition) {
  const field: { pos: Vector2; vel: Vector2; radius: number; kind: RockKind }[] = []
  const map = expeditionMap(state)
  let seed = 1741
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296 }
  const base = havenPosition(state)
  const protectedPoints = [state.position, base, ...BERTHS.map(b => b.pos), ...PICKUPS.map(p => p.pos), ...SOCKETS.flatMap(s => [s.pos, s.source]), ...RADIATION_SOURCES.map(s => s.pos)]
  for (const room of SECTORS) {
    const count = room.id === 'breach' ? 6 : room.id === 'haven' ? 4 : 9
    let added = 0
    for (let attempt = 0; attempt < 350 && added < count; attempt++) {
      const radius = 17 + random() * 18
      const pos = { x: room.x + 55 + random() * (room.w - 110), y: room.y + 55 + random() * (room.h - 110) }
      if (!isInsideCavern(pos, radius + 12, map) || protectedPoints.some(p => Math.hypot(p.x - pos.x, p.y - pos.y) < (p === state.position || p === base || BERTHS.some(b => b.pos === p) ? 175 : 80) + radius) || field.some(r => Math.hypot(r.pos.x - pos.x, r.pos.y - pos.y) < r.radius + radius + 24)) continue
      const angle = random() * Math.PI * 2, speed = 28 + random() * 36
      const kind: RockKind = added === 0 && !['haven','breach'].includes(room.id) ? 'blue' : added === 1 && ['archive', 'reactor','capacitors','heart-control','ignition'].includes(room.id) ? 'red' : 'normal'
      field.push({ pos, radius: kind === 'normal' ? radius : 19, kind, vel: { x: Math.cos(angle) * speed, y: Math.sin(angle) * speed } })
      added++
    }
  }
  // Slow drifting debris in the transfer tubes makes navigation matter between
  // rooms, without filling the opening cavern with extra threats.
  for (const [i,passage] of PASSAGES.entries()) {
    if (i % 3 !== 0 || passage.rooms.includes('breach')) continue
    const pos = passage.shape.reduce((p,q) => ({ x:p.x+q.x/passage.shape.length,y:p.y+q.y/passage.shape.length }),{x:0,y:0})
    const radius = 16 + random()*8, angle = random()*Math.PI*2
    if (!isInsideCavern(pos,radius+25,map) || protectedPoints.some(p => Math.hypot(p.x-pos.x,p.y-pos.y)<180) || field.some(r => Math.hypot(r.pos.x-pos.x,r.pos.y-pos.y)<r.radius+radius+30)) continue
    field.push({pos,radius,kind:i%5===0 ? 'blue' : 'normal',vel:{x:Math.cos(angle)*32,y:Math.sin(angle)*32}})
  }
  return field
}
