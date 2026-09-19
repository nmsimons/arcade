import { SECTORS, GATES, SOCKETS, PICKUPS, CACHES, CORE_POSITION } from './stationDefinitions.ts'
import { ROOM_IDS, GATE_IDS, CIRCUIT_IDS, PROGRESSION_IDS, CACHE_IDS, BOT_IDS } from './stationIds.ts'
import { CIRCUIT_STEPS, CIRCUIT_LOADS, CIRCUIT_PREREQUISITES } from './stationProgression.ts'
import { BERTHS, REGIONS, SERVICE_ROUTES } from './campaignWorld.ts'
import { BOT_STATIONS } from './stationBots.ts'
import { RECORDS } from './campaign.ts'
import { CHAMBERS, PASSAGES, STATION_TERRAIN } from './stationLayout.ts'
import { expeditionMap, freshExpedition } from './expedition.ts'
import { isInsideCavern } from './worldGeometry.ts'
import type { Vector2 } from './types'

export const STATION_AUTHORING = {
  rooms: SECTORS, gates: GATES, circuits: SOCKETS, caches: CACHES, pickups: PICKUPS,
  bots: BOT_STATIONS, records: RECORDS, passages: PASSAGES, berths: BERTHS,
  regions: REGIONS, routes: SERVICE_ROUTES, steps: CIRCUIT_STEPS,
  loads: CIRCUIT_LOADS, prerequisites: CIRCUIT_PREREQUISITES,
}
/** Build/test-time diagnostics; no geometry or authored state is changed. */
export function validateStation(data = STATION_AUTHORING): string[] {
  const errors: string[] = []
  const require = (ok: unknown, message: string) => { if (!ok) errors.push(message) }
  const unique = (kind: string, ids: readonly string[]) => {
    const seen = new Set<string>()
    for (const id of ids) { require(!seen.has(id), `Duplicate ${kind}: ${id}`); seen.add(id) }
    return seen
  }
  const rooms=unique('room',data.rooms.map(r=>r.id)),gates=unique('gate',data.gates.map(g=>g.id)),circuits=unique('circuit',data.circuits.map(c=>c.id))
  const entities=unique('entity',[...data.caches.map(c=>c.id),...data.pickups.map(p=>p.id),...data.bots.map(b=>b.id),...data.circuits.map(c=>c.id),'core'])
  unique('record',data.records.map(r=>r.id)); unique('objective',data.steps.map(s=>s.id))
  const catalogs: readonly (readonly [readonly string[], ReadonlySet<string>, string])[] = [[ROOM_IDS,rooms,'room'],[GATE_IDS,gates,'gate'],[CIRCUIT_IDS,circuits,'circuit'],[CACHE_IDS,new Set(data.caches.map(c=>c.id)),'cache'],[BOT_IDS,new Set(data.bots.map(b=>b.id)),'bot']]
  for(const [catalog,actual,label] of catalogs) {
    for(const id of catalog)require(actual.has(id),`Missing ${label}: ${id}`)
    for(const id of actual)require(catalog.some(known=>known===id),`Unknown ${label}: ${id}`)
  }
  for(const room of rooms)require(CHAMBERS[room]?.length>=3,`Missing chamber: ${room}`)
  for(const passage of data.passages) {
    for(const room of passage.rooms)require(rooms.has(room),`Passage references room: ${room}`)
    if(passage.gate)require(gates.has(passage.gate),`Passage references gate: ${passage.gate}`)
  }
  for(const circuit of data.circuits) {
    for(const gate of circuit.gates)require(gates.has(gate),`Circuit ${circuit.id} targets gate: ${gate}`)
    for(const flag of circuit.flags??[])require(PROGRESSION_IDS.includes(flag),`Circuit ${circuit.id} targets flag: ${flag}`)
  }
  const regionIds=new Set(data.regions.map(r=>r.id)),berthIds=new Set(data.berths.map(b=>b.id))
  for(const region of data.regions)for(const room of region.rooms)require(rooms.has(room),`Region ${region.id} references room: ${room}`)
  for(const step of data.steps) {
    require(circuits.has(step.id),`Objective references circuit: ${step.id}`)
    require(regionIds.has(step.region),`Objective ${step.id} references region: ${step.region}`)
    for(const gate of step.barriers)require(gates.has(gate),`Objective ${step.id} references barrier: ${gate}`)
  }
  const seenPrerequisites=new Set<string>()
  for(const step of data.prerequisites) {
    require(circuits.has(step.circuit),`Prerequisite references circuit: ${step.circuit}`)
    require(!seenPrerequisites.has(step.circuit),`Duplicate prerequisite: ${step.circuit}`)
    for(const id of step.requires)require(circuits.has(id)&&seenPrerequisites.has(id),`Dangling or cyclic prerequisite: ${step.circuit} -> ${id}`)
    seenPrerequisites.add(step.circuit)
  }
  for(const record of data.records) {
    if(record.room)require(rooms.has(record.room),`Record ${record.id} references room: ${record.room}`)
    if(record.power)require(circuits.has(record.power),`Record ${record.id} references circuit: ${record.power}`)
    if(record.flag)require(PROGRESSION_IDS.includes(record.flag),`Record ${record.id} references flag: ${record.flag}`)
  }
  for(const route of data.routes) {
    require(berthIds.has(route.from)&&berthIds.has(route.to),`Route references berth: ${route.from}/${route.to}`)
    for(const gate of route.gates)require(gates.has(gate),`Route references gate: ${gate}`)
  }
  unique('power connection',data.loads.map(load=>`${load.circuit}/${load.target}`))
  for(const load of data.loads) {
    require(circuits.has(load.circuit),`Power connection references circuit: ${load.circuit}`)
    const valid=load.kind==='door' ? gates.has(load.gate)&&load.target===load.gate
      : load.kind==='core' ? load.target==='ignition-ready'
      : load.kind==='bot' ? entities.has(load.target.slice(4))
      : load.kind==='berth' ? data.berths.some(b=>load.target===`berth:${b.id}`&&b.power===load.circuit)
      : /^ward:[0-3]$/.test(load.target)&&load.circuit==='ward-power'
    require(valid,`Invalid power target: ${load.circuit}/${load.target}`)
  }
  const open=freshExpedition();open.gates=data.gates.map(g=>g.id)
  const map=expeditionMap(open)
  const clear=(id:string,pos:Vector2,radius:number)=>require(isInsideCavern(pos,radius,map),`Invalid spawn/receiver placement: ${id}`)
  for(const circuit of data.circuits) { clear(`${circuit.id} source`,circuit.source,20);clear(`${circuit.id} receiver`,circuit.pos,0) }
  for(const cache of data.caches) { require(rooms.has(cache.sector),`Cache ${cache.id} references room: ${cache.sector}`);clear(cache.id,cache.pos,22) }
  for(const pickup of data.pickups) { require(rooms.has(pickup.sector),`Pickup ${pickup.id} references room: ${pickup.sector}`);clear(pickup.id,pickup.pos,23) }
  for(const bot of data.bots) { require(circuits.has(bot.power),`Bot ${bot.id} references circuit: ${bot.power}`);clear(bot.id,bot.home,bot.kind==='tug'?21:19) }
  for(const berth of data.berths) { require(rooms.has(berth.room)&&(!berth.power||circuits.has(berth.power)),`Invalid berth: ${berth.id}`);clear(berth.id,berth.pos,15) }
  for(const record of data.records)if(record.pos)require(isInsideCavern(record.pos,40,{id:0,name:'Authored terrain',boundary:STATION_TERRAIN.boundary,obstacles:STATION_TERRAIN.islands}),`Invalid terminal placement: ${record.id}`)
  clear('core',CORE_POSITION,27)
  return errors
}
