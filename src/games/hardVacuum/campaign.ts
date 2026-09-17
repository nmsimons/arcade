import type { Expedition } from './expedition'
import type { Vector2 } from './types'
import type { CavernMap } from './worldGeometry'
import { isInsideCavern, raycastCavern } from './worldGeometry.ts'
import { BERTHS, REGIONS, SERVICE_ROUTES } from './campaignWorld.ts'
import type { BerthId } from './campaignWorld'
import { HAVEN_FOLDED_CLEARANCE, HAVEN_FOLD_SECONDS } from './havenGeometry.ts'
import type { HavenPose } from './havenGeometry'

export interface HavenJourney {
  destination: BerthId
  points: Vector2[]
  index: number
  phase: 'folding' | 'transit' | 'deploying'
  progress: number
  riding: boolean
  speed: number
}
export interface Campaign {
  version: 1
  berth: BerthId
  haven: Vector2
  havenAngle: number
  grappleLearned: boolean
  berths: BerthId[]
  journey?: HavenJourney
  records: string[]
  playedSeconds: number
  deaths: number
}
export const freshCampaign = (berth: BerthId = 'breach'): Campaign => ({ version:1, berth, haven:{ ...BERTHS.find(b => b.id === berth)!.pos }, havenAngle:0, grappleLearned:false, berths:[berth], records:['contract'], playedSeconds:0, deaths:0 })
export const havenPosition = (s: Expedition): Vector2 => s.campaign.haven
export const havenReady = (s: Expedition) => !s.campaign.journey
export const havenDeployment = (s: Expedition) => {
  const j = s.campaign.journey
  return !j ? 1 : j.phase === 'folding' ? 1 - j.progress : j.phase === 'deploying' ? j.progress : 0
}
export const havenPose = (s: Expedition, angle=s.campaign.havenAngle): HavenPose => ({ pos:{...havenPosition(s)}, angle, deployment:havenDeployment(s) })
export const currentBerth = (s: Expedition) => BERTHS.find(b => b.id === s.campaign.berth)!
export const regionForRoom = (room?: string) => REGIONS.find(r => r.rooms.some(id => id === room))
export const coreReleased = (s: Expedition) => s.gates.includes('ignition-ready')

export function serviceRoute(s: Expedition, destination: string): Vector2[] | null {
  if (!s.campaign.berths.some(id => id === destination) || destination === s.campaign.berth) return null
  const queue: { id: string; points: Vector2[] }[] = [{ id:s.campaign.berth, points:[] }]
  const seen = new Set([s.campaign.berth as string])
  for (const node of queue) {
    for (const route of SERVICE_ROUTES) {
      const forward = route.from === node.id
      if (!forward && route.to !== node.id || route.gates.some(id => !s.gates.includes(id) || (s.doors[id] ?? 1) < 1)) continue
      const next = forward ? route.to : route.from
      if (seen.has(next)) continue
      const points = [...node.points, ...(forward ? route.points : [...route.points].reverse())].map(p => ({ ...p }))
      if (next === destination) return points
      seen.add(next); queue.push({ id:next, points })
    }
  }
  return null
}
export function routeClear(points: Vector2[], map: CavernMap) {
  for (let i = 1; i < points.length; i++) {
    const a = points[i-1], b = points[i], steps = Math.max(1,Math.ceil(Math.hypot(b.x-a.x,b.y-a.y) / 20))
    for (let n = 0; n <= steps; n++) if (!isInsideCavern({ x:a.x+(b.x-a.x)*n/steps,y:a.y+(b.y-a.y)*n/steps }, HAVEN_FOLDED_CLEARANCE, map)) return false
  }
  return true
}
export function moveHaven(s: Expedition, destination: BerthId, riding: boolean, map: CavernMap, angle=s.campaign.havenAngle): boolean {
  if (!havenReady(s)) return false
  const points = serviceRoute(s, destination)
  if (!points || !routeClear(points, map)) return false
  s.campaign.havenAngle = angle
  s.campaign.journey = { destination, points, index:0, phase:'folding', progress:0, riding, speed:0 }
  return true
}
export function stepHaven(s: Expedition, dt: number): boolean {
  // Substeps keep saves and long frames on the same articulated flight path.
  while (dt > .000001 && s.campaign.journey) {
    const step=Math.min(dt,.05); dt-=step
    const j=s.campaign.journey
    if (j.phase !== 'transit') {
      j.progress=Math.min(1,j.progress+step/HAVEN_FOLD_SECONDS)
      if (j.progress < 1) continue
      if (j.phase === 'folding') { j.phase='transit';j.progress=0 }
      else {
        s.campaign.berth=j.destination
        s.campaign.haven={...BERTHS.find(b=>b.id===j.destination)!.pos}
        delete s.campaign.journey
        return true
      }
      continue
    }
    const pos=s.campaign.haven
    while (j.index<j.points.length && Math.hypot(j.points[j.index].x-pos.x,j.points[j.index].y-pos.y)<.01) j.index++
    if (j.index===j.points.length) {j.phase='deploying';j.progress=0;j.speed=0;continue}
    const target=j.points[j.index],distance=Math.hypot(target.x-pos.x,target.y-pos.y)
    const heading=Math.atan2(target.y-pos.y,target.x-pos.x)
    const turn=Math.atan2(Math.sin(heading-s.campaign.havenAngle),Math.cos(heading-s.campaign.havenAngle))
    s.campaign.havenAngle+=Math.max(-1.6*step,Math.min(1.6*step,turn))
    const remaining=j.points.slice(j.index+1).reduce((sum,p,i)=>sum+Math.hypot(p.x-j.points[j.index+i].x,p.y-j.points[j.index+i].y),distance)
    const targetSpeed=Math.min(210,Math.sqrt(2*90*remaining)) * Math.max(.25,1-Math.abs(turn)/Math.PI)
    j.speed+=Math.max(-140*step,Math.min(85*step,targetSpeed-j.speed))
    const travel=Math.min(distance,j.speed*step)
    pos.x+=(target.x-pos.x)*travel/distance;pos.y+=(target.y-pos.y)*travel/distance
  }
  return false
}
// A recovery waits for the tender to finish its existing flight; no second base
// is created and cargo left in the world stays where the pilot released it.
export function settleHaven(s: Expedition) {
  const j = s.campaign.journey
  if (!j) return
  s.campaign.berth = j.destination
  s.campaign.haven = { ...BERTHS.find(b => b.id === j.destination)!.pos }
  delete s.campaign.journey
}

type RecordTrigger = { room?:string; power?:string; gate?:string; pos?:Vector2; core?:boolean }
export interface StationRecord extends RecordTrigger { id:string; title:string; speaker:string; text:string; optional?:boolean }
export const RECORDS: StationRecord[] = [
  { id:'contract',title:'Recovery contract',speaker:'SALVAGE AUTHORITY · PRESENT DAY',text:'Station Orison. Evacuated nine years ago. Establish a foothold, recover the ignition core, and return it for payment. The maintenance tender Haven is still transmitting from the breach. Its accounts and repair systems are yours to use.' },
  { id:'first-light',room:'breach',title:'A ship left running',speaker:'HAVEN · SERVICE MEMORY',text:'Emergency watch: year nine. Docking clamps available. Last operator instruction: keep the rescue route open. Freight transit has no power. A reserve cell remains in the rescue locker west of this anchorage. Point your ship’s nose at it and press F to grapple. Tow it back to the blue receiver here; F releases the cable.' },
  { id:'rescue-note',pos:{x:6930,y:3480},optional:true,title:'Small enough to fit',speaker:'IVO SEN · MAINTENANCE',text:'Haven folds down to a tug for the service tunnels. We cut these berths so she could bring tools right to the work. Clear a passage, restore its bus, and call her through. Keep the freight turns clear.' },
  { id:'breach-restored',power:'breach-power',title:'The first door',speaker:'MARA VALE · DISPATCH',text:'Freight transit is back. Send Haven through after the lift bus is restored. We are moving people now. Everything with a cargo number can wait.' },
  { id:'freight-arrival',room:'freight',title:'Departure ledger',speaker:'MARA VALE · DISPATCH',text:'Outbound departures: twelve. Confirmed arrivals: zero. They keep asking me to close the manifest. I cannot write “evacuated” next to a ship nobody has heard from.' },
  { id:'freight-lit',power:'freight-power',title:'A working berth',speaker:'HAVEN · SERVICE MEMORY',text:'Freight berth energized. The transit route is clear. Haven can relocate here on command. Dispatch is above the lift; its reserve supply was diverted to cargo hold six.' },
  { id:'manifest-note',pos:{x:8960,y:420},optional:true,title:'What we carried',speaker:'MARA VALE · DISPATCH',text:'Hold six: blankets, oxygen, the school kitchen. No ore. I have entered their mass under industrial consumables. If anyone comes looking for a profitable wreck, perhaps they will open this hold first.' },
  { id:'works-open',power:'dispatch-power',title:'The closed account',speaker:'MARA VALE · DISPATCH',text:'The company closed our rescue account at 04:10. I left Haven’s refinery on local credit. Whoever comes next can still repair a ship. Take the ore to her. The rock is worth more than the paperwork says.' },
  { id:'works-arrival',room:'works',title:'A deliberate break',speaker:'IVO SEN · MAINTENANCE',text:'Those bulkheads were welded shut from this side. I did it. The blast damage was already spreading through the service line. Tool crib supply is intact behind the eastern seal. Use a blaster on the welds.' },
  { id:'works-lit',power:'works-power',title:'Maintenance watch',speaker:'IVO SEN · MAINTENANCE',text:'Haven can dock at maintenance again. Feed the ring distributor from the capacitor store below. I pulled that cell to keep a surge out of the medical circuit. Do not assume a dark room is an abandoned one.' },
  { id:'tools-note',pos:{x:6030,y:580},optional:true,title:'The last repair',speaker:'IVO SEN · MAINTENANCE',text:'Six spare clamps, one usable torch, and a tender that still answers. Mara wants me on the next transport. I told her I would follow after the ring was stable. She knows that means I am staying.' },
  { id:'ring-open',power:'ring-power',title:'The Broken Ring',speaker:'IVO SEN · MAINTENANCE',text:'Ring distribution restored. The western Foundry holds the relay reserve. Restore that relay before approaching the reactor. There is a radiation shield module in the archive; Haven can fit it to your ship.' },
  { id:'ring-lit',power:'relay',title:'Nine years of silence',speaker:'DR. ADA REN · REFUGE',text:'I requested the shutdown. Not evacuation. Shutdown. We can sustain suspension on a fraction of station power, but not while the damaged ring is drawing against us. Ivo understands. The official channel must remain silent.' },
  { id:'archive-note',pos:{x:1720,y:440},optional:true,title:'Consent',speaker:'DR. ADA REN · REFUGE',text:'There are three hundred and twelve names on the refuge list. Each signed for a temporary suspension until rescue. I was the last awake. If you can hear this, please read their names as people waiting, not a loss report.' },
  { id:'refuge-route',power:'heart',title:'The line that stayed alive',speaker:'IVO SEN · MAINTENANCE',text:'The engine is feeding the refuge approach. Access runs south through the salvage vault; its sealed bulkhead will need cutting. Haven was meant to take this route. I never got her past the breach.' },
  { id:'refuge-arrival',room:'refuge-entry',title:'A different contract',speaker:'HAVEN · MEDICAL TELEMETRY',text:'Suspension reserve detected. Three hundred and twelve occupied units. Local circulation active. Awakening bus offline. Ignition core required. The refuge is still here.' },
  { id:'refuge-lit',power:'refuge-power',title:'Keep the lights low',speaker:'DR. ADA REN · REFUGE',text:'Restore transfer first. The ward feeder needs the triage reserve from the west. Bring the tender in. When they wake they will need a familiar light to follow, and Haven has brought most of them home before.' },
  { id:'triage-note',pos:{x:430,y:3370},optional:true,title:'A place for everyone',speaker:'DR. ADA REN · REFUGE',text:'We converted the freight cradles into suspension racks. Every spare line runs through this room. The small ones are not children’s units; they are the parts we could not afford to throw away.' },
  { id:'ward-lit',power:'ward-power',title:'An answer, almost',speaker:'HAVEN · MEDICAL TELEMETRY',text:'Ward bus stable. All units holding. A return signal has reached the awakening controller. It is waiting for ignition. Reserve cells are in the transfer room and the ward service recess.' },
  { id:'heart-open',power:'heart-route',title:'What the core was for',speaker:'IVO SEN · MAINTENANCE',text:'The ignition core does not belong in a buyer’s warehouse. It starts the station without taking power from the refuge. Seat it in Haven’s service cradle. She can bridge the buses long enough to wake them.' },
  { id:'heart-lit',power:'heart-power',title:'The last shift',speaker:'MARA VALE · DISPATCH',text:'Ivo has gone to isolate the core. Ada is closing the ward. I am leaving this channel open. If someone gets here after us: we did not lose the station. We left as much of it as we could for you.' },
  { id:'coil-lit',power:'coil-power',title:'Cold start',speaker:'HAVEN · SERVICE MEMORY',text:'Induction field grounded. Ignition well accessible. Release supply is in the gallery below this berth. Bring the core home slowly. I can carry it from here.' },
  { id:'core-free',gate:'ignition-ready',title:'Ready to come home',speaker:'IVO SEN · MAINTENANCE',text:'The cradle is unlocked. This is the last thing I can do from here. Haven, keep a light on.' },
  { id:'core-home',core:true,title:'All accounted for',speaker:'HAVEN · SERVICE MEMORY',text:'Ignition core secured. Refuge circuits stable. Dock to connect the awakening bus. Recovery contract suspended: persons aboard.' },
]
export function discoverCampaign(s: Expedition, room: string | undefined, pos: Vector2, map?: CavernMap): string[] {
  for (const berth of BERTHS) if (!s.campaign.berths.includes(berth.id) && (!berth.power || s.power[berth.power]) && s.visited.includes(berth.room)) s.campaign.berths.push(berth.id)
  const found = RECORDS.filter(r => !s.campaign.records.includes(r.id) && (
    r.room === room && room !== undefined || r.power && !!s.power[r.power] || r.gate && s.gates.includes(r.gate) || r.core && s.core || r.pos && Math.hypot(pos.x-r.pos.x,pos.y-r.pos.y) < 135 && (!map || raycastCavern(pos,{x:r.pos.x-pos.x,y:r.pos.y-pos.y},135,map) >= Math.hypot(pos.x-r.pos.x,pos.y-r.pos.y)-1)
  )).map(r => r.id)
  s.campaign.records.push(...found)
  return found
}
export function campaignObjective(s: Expedition): { title:string; detail:string; circuit?:string } {
  if (s.complete) return { title:'The route is clear',detail:'The refuge is awake. Haven remains available while you explore the station.' }
  if (s.core) return { title:'Bring the refuge online',detail:'The ignition core is secured in Haven. Dock to connect the awakening bus.' }
  if (coreReleased(s)) return { title:'Bring the ignition core home',detail:'Tow the released core from the ignition well into Haven’s recovery ring.' }
  const steps = [
    ['breach-power','Restore freight transit','Tow the rescue-locker cell to the receiver in the Breach.'],
    ['freight-power','Restore the freight lift','The reserve cell is in the western freight stores. Its receiver is in the main gallery.'],
    ['dispatch-power','Reconnect the Works','Supply Dispatch from cargo hold six, east of the upper gallery.'],
    ['works-power','Restore the maintenance bus','Buy a blaster at Haven. Open the eastern tool crib and return its cell to the Works receiver.'],
    ['ring-power','Reach the Broken Ring','Open the capacitor store below the Works. Tow its cell to Maintenance control in the west.'],
    ['foundry','Reach the Foundry','Clear the western barrier in the Ring. A cell in the service hub powers the Foundry entrance from Wreckwater.'],
    ['relay','Restore the ring relay','Tow the Foundry reserve back to the relay in the service hub.'],
    ['heart','Restore refuge access','Recover the archive’s radiation module at Haven. Take the reactor cell to the engine; the refuge route runs south through the vault.'],
    ['refuge-power','Restore medical transfer','Tow the vault reserve to the receiver in Refuge Approach.'],
    ['ward-power','Reconnect the ward','Bring the western triage reserve to Medical transfer.'],
    ['heart-route','Reach the ignition system','Bring a transfer-room cell to the ward’s eastern access receiver.'],
    ['heart-power','Restore the induction bus','Bring the ward service reserve to the Heart’s receiver. Haven can then move to the ignition berth.'],
    ['coil-power','Ground the ignition field','Open Field control to the east. Deliver its cell to the lower induction gallery.'],
    ['ignition-power','Release the ignition core','Bring the lower gallery’s reserve cell into the ignition well.'],
  ]
  const step = steps.find(([id]) => !s.power[id]) ?? steps[steps.length-1]
  return { title:step[1],detail:step[2],circuit:step[0] }
}
