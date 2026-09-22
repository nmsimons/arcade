import { CIRCUIT_STEPS } from './stationProgression.ts'
import type { Expedition } from './expedition'
import type { Vector2 } from './types'
import type { CavernMap } from './worldGeometry'
import { isInsideCavern } from './worldGeometry.ts'
import { BERTHS, DEPARTURE_ROUTE, OUTER_LOCK_PANELS, REGIONS, SERVICE_ROUTES } from './campaignWorld.ts'
import { havenLinkPosition } from './havenActivation.ts'
import type { BerthId } from './campaignWorld'
import { HAVEN_FOLDED_CLEARANCE, HAVEN_FOLD_SECONDS } from './havenGeometry.ts'
import type { HavenPose } from './havenGeometry'
import { POD_RESCUE_CREDITS_LABEL, SURVIVAL_PODS, allSurvivorsAboard, completeEvacuation, podReleased } from './survivalPods.ts'

export interface HavenJourney {
  departure?: boolean
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
  havenActivated: boolean
  // An activated commissioning link remains available until its first disconnect.
  havenLinkPending?: boolean
  grappleLearned: boolean
  terminalLinked: boolean
  berths: BerthId[]
  journey?: HavenJourney
  records: string[]
  playedSeconds: number
  deaths: number
}
export const freshCampaign = (berth: BerthId = 'breach'): Campaign => ({ version:1, berth, haven:{ ...BERTHS.find(b => b.id === berth)!.pos }, havenAngle:0, havenActivated:true, grappleLearned:false, terminalLinked:false, berths:[berth], records:[], playedSeconds:0, deaths:0 })
export const havenPosition = (s: Expedition): Vector2 => s.campaign.haven
export const havenReady = (s: Expedition) => s.campaign.havenActivated && !s.campaign.journey
export const outerLockOpen = (s: Expedition) => !!s.campaign.journey?.departure || s.complete
export const havenDeployment = (s: Expedition) => {
  const j = s.campaign.journey
  return !j ? 1 : j.phase === 'folding' ? 1 - j.progress : j.phase === 'deploying' ? j.progress : 0
}
export const havenPose = (s: Expedition, angle=s.campaign.havenAngle): HavenPose => ({ pos:{...havenPosition(s)}, angle, deployment:havenDeployment(s) })
export const currentBerth = (s: Expedition) => BERTHS.find(b => b.id === s.campaign.berth)!
export const regionForRoom = (room?: string) => REGIONS.find(r => r.rooms.some(id => id === room))
export const coreReleased = (s: Expedition) => s.flags.includes('ignition-ready')

export function serviceRoute(s: Expedition, destination: string): Vector2[] | null {
  if (!s.campaign.havenActivated) return null
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
export function departureBlocker(s: Expedition): string | undefined {
  if (s.complete) return 'Evacuation complete.'
  if (!s.campaign.havenActivated) return 'Haven offline.'
  if (!havenReady(s)) return 'Haven is in transit.'
  if (!allSurvivorsAboard(s)) return 'Passengers missing.'
  if (!s.core) return 'Escape power offline.'
  if (s.campaign.berth !== 'breach') return 'Launch berth: The Breach.'
}
export function launchHaven(s: Expedition, map: CavernMap, angle=s.campaign.havenAngle): boolean {
  // Preflight the authorized route with only the outer lock retracted. All
  // other obstructions still count; the live map opens after launch commits.
  const departureMap={...map,obstacles:map.obstacles.filter(p=>!OUTER_LOCK_PANELS.some(panel=>panel===p))}
  if (departureBlocker(s) || !routeClear(DEPARTURE_ROUTE,departureMap)) return false
  s.campaign.havenAngle=angle
  s.campaign.journey={destination:'breach',points:DEPARTURE_ROUTE.map(p=>({...p})),index:0,phase:'folding',progress:0,riding:true,speed:0,departure:true}
  return true
}
export function stepHaven(s: Expedition, dt: number): boolean {
  if (s.complete && s.campaign.journey?.departure) return false
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
    if (j.index===j.points.length) {
      if (j.departure) { j.speed=0; return completeEvacuation(s) }
      j.phase='deploying';j.progress=0;j.speed=0;continue
    }
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

type RecordTrigger = { room?:import('./stationIds').RoomId; power?:import('./stationIds').CircuitId; flag?:import('./stationIds').ProgressionId; pos?:Vector2; core?:boolean; activated?:boolean }
export interface StationRecord extends RecordTrigger { id:string; title:string; speaker:string; text:string; optional?:boolean }
// Retired walkthrough recordings remain valid save IDs, but have no reader or
// journal entry. Do not delete old downloads or invalidate an existing expedition.
export const RETIRED_RECORD_IDS: readonly string[] = [
  'breach-restored','freight-arrival','freight-lit','works-open','works-arrival',
  'works-lit','ring-open','ring-lit','refuge-route','refuge-arrival','refuge-lit',
  'ward-lit','heart-open','coil-lit','core-free','core-home',
]
export const RECORDS: StationRecord[] = [
  { id:'contract',pos:{x:8280,y:3690},title:'Recovery contract',speaker:'SALVAGE AUTHORITY · PRESENT DAY',text:'Station Orison. Declared evacuated nine years ago. Recovery authorized for one ignition core; the registry lists no surviving crew. The tender Haven is dormant in the Breach. Her last keeper specified a tether connection to the blue socket at her center to wake her and register recovery. Until she answers, no replacement ship can be provided. Losses before registration remain the pilot’s responsibility.' },
  { id:'first-light',activated:true,title:'A link to come back to',speaker:'HAVEN · RECOVERY SYSTEM',text:'I’m Haven. It has been a long time since anyone answered. Recovery link established. Ivo left an impact-shield module in the rescue locker, through the passage west of me. Tow it back gently; I’ll fit it when my shutters close around it. If your ship is lost, I can reconstruct you here. It takes time. The station repairs its machines while I rebuild yours.' },
  { id:'rescue-note',pos:{x:6930,y:3480},optional:true,title:'Small enough to fit',speaker:'IVO SEN · MAINTENANCE',text:'Twelve life-support connections under six hull sections. The registry calls Haven a maintenance tender; I built a lifeboat. The freight-transit cell is here in the locker. It belongs between the receiver plates in the Breach; let the contacts settle. I sent the radiation shield ahead to Freight Stores. Whoever comes after us will need it for the contaminated tunnels. I hope they come before her lights go out.' },
  { id:'manifest-note',pos:{x:8960,y:420},optional:true,title:'What we carried',speaker:'MARA VALE · DISPATCH',text:'Freight release, 04:10. Hold six: blankets, oxygen, one occupied survival pod. No ore. Our account is closed, but I marked the pod for Haven; her lights count people, not freight. The blaster was left in the southeast of the Works’ main bay when the tool crib was welded shut. Someone will need it to get our last supplies out.' },
  { id:'tools-note',pos:{x:6030,y:580},optional:true,title:'The last repair',speaker:'IVO SEN · MAINTENANCE',text:'Six spare clamps, one usable torch. Mara wants me in my pod. Haven’s teleporter is still in the Foundry’s far workshop; I never finished bringing it home. The entrance circuit also wakes the maintenance tug. The relay inside opens an Archive return for the haul. Tell Mara the teleporter carries a pilot, but leaves the towline’s cargo behind. I promised her I would follow after the last repair.' },
  { id:'archive-note',pos:{x:1720,y:440},optional:true,title:'Consent',speaker:'DR. ADA REN · REFUGE',text:'Twelve signatures. Temporary suspension, pending rescue. I requested a shutdown, not an evacuation. The occupied pod here in the Archive is proof of the difference. The containment cell is still on the reactor’s eastern side. My radiation shield recovered whenever I retreated into clean air; I should have let it fill before the last attempt. I was the last awake. I cannot keep watch any longer.' },
  { id:'triage-note',pos:{x:430,y:3370},optional:true,title:'A place for everyone',speaker:'DR. ADA REN · REFUGE',text:'Four pods left before the power failed. Their empty cradles are not casualties. I locked the remaining eight against decompression. The ward reserve is here in Triage, but its receiver is inside the ward. The lower service tunnel is still passable. Restoring that circuit releases the clamps and opens the short return to Haven. I closed those beds to keep people alive. Please do not read their silence as consent to leave them.' },
  { id:'heart-lit',pos:{x:4360,y:3440},power:'heart-power',title:'The last shift',speaker:'MARA VALE · DISPATCH',text:'Ivo has isolated the ignition core in the lower well. Ada is closing the ward. I am leaving this channel open before I seal my own pod. The core belongs in the old cradle east of the Breach; it will give Haven the power to leave. One core, twelve people. That was our plan. If anyone tells you Orison was evacuated, count the pods before you believe them.' },
]
export function recordAvailable(s: Expedition, id: string) {
  const r=RECORDS.find(r=>r.id===id)
  return !!r && (!r.power || !!s.power[r.power]) && (!r.flag || s.flags.includes(r.flag)) && (!r.core || s.core) && (!r.activated || s.campaign.havenActivated)
}
export function discoverCampaign(s: Expedition, _room: string | undefined, connectedTerminal?: string): string[] {
  for (const berth of BERTHS) if (!s.campaign.berths.includes(berth.id) && (!berth.power || s.power[berth.power]) && s.visited.includes(berth.room)) s.campaign.berths.push(berth.id)
  const found = RECORDS.filter(r => !s.campaign.records.includes(r.id) && r.id===connectedTerminal && recordAvailable(s,r.id)).map(r => r.id)
  s.campaign.records.push(...found)
  return found
}
export function campaignObjective(s: Expedition): { title:string; detail:string; circuit?:string; module?:'impact' | 'blaster' | 'radiation' | 'teleporter'; pod?:string; target?:Vector2 } {
  if (s.complete) return { title:'Everyone is coming home',detail:'Haven has carried everyone out through the Access Tunnel. Free exploration resumes before departure.' }
  if (!s.campaign.havenActivated) return { title:s.visited.includes('breach') ? 'Activate Haven' : 'Find Haven',detail:'Follow the Access Tunnel to the Breach. Point your nose at the blue socket in Haven’s center and press F to connect your tether. This wakes Haven and establishes your recovery link. Until then, death restarts the expedition.',target:havenLinkPosition(s) }
  if (s.campaign.journey?.departure) return { title:'Haven departing',detail:'Everyone is safe aboard. The outer lock is open; follow the Access Tunnel home.',target:DEPARTURE_ROUTE.at(-1)! }
  if (s.core && allSurvivorsAboard(s)) return { title:s.campaign.berth==='breach' ? 'Take Haven home' : 'Return Haven to the Breach',detail:'Everyone is safely aboard and escape power is online. Bring Haven to the Breach anchorage, dock, then choose Launch Haven. She will leave by the tunnel you arrived through.',target:havenPosition(s) }
  const waiting = SURVIVAL_PODS.filter(pod => !s.rescuedPods.includes(pod.id) && podReleased(s,pod.id) && (s.core || pod.locked))
    .sort((a,b) => {
      const pa=s.cargo?.[a.id]?.pos ?? a.pos,pb=s.cargo?.[b.id]?.pos ?? b.pos
      return Math.hypot(pa.x-s.position.x,pa.y-s.position.y)-Math.hypot(pb.x-s.position.x,pb.y-s.position.y)
    })
  if (waiting.length) return { title:'Rescue the survivors',detail:s.core
    ? 'Escape power is ready, but Haven will not leave anyone behind. Recover the remaining pods. Four were dispatched to Freight hold six, the Works, the Ring archive and Refuge Approach; eight began in Medical.'
    : `Ward clamps released. Call Haven to Medical transfer and tow each pod through the open ward door. Rescue pays ${POD_RESCUE_CREDITS_LABEL} credits per pod; the berth lights show who is safely aboard.`,pod:waiting[0].id }
  if (s.core && !allSurvivorsAboard(s)) return { title:'Release the remaining survivors',detail:'Escape power is online. Restore the ward bus to unlock the remaining pods.',circuit:'ward-power' }
  if (coreReleased(s)) return { title:'Return to the first cradle',detail:'Tow the core through the irradiated lower return tube from the Ignition Well. Continue east through the Breach to the Ignition Cradle.' }
  if (!s.impactShieldInstalled) return { title:'Install your impact shield',detail:'Fly through the passage west of Haven to the rescue locker. Find the green shield module, point the ship’s nose at it and press F to grapple, then tow it back for installation. New equipment must be recovered before the dock can upgrade it.',module:'impact' }
  const step = CIRCUIT_STEPS.find(step => !s.power[step.id]) ?? CIRCUIT_STEPS[CIRCUIT_STEPS.length-1]
  if (step.id === 'dispatch-power' && !s.upgrades.includes('radiation')) return { title:'Prepare for the Dispatch tunnel',detail:'Tow the radiation module from Freight Stores to Haven for installation. The direct lift stays locked until you power Dispatch from inside; enter by the radioactive Stores tunnel.',module:'radiation' }
  if (step.id === 'works-power' && !s.upgrades.includes('radiation')) return { title:'Recover radiation shielding',detail:'Tow the radiation module from Freight Stores to Haven before crossing the contaminated Works transfer tube.',module:'radiation' }
  if (step.id === 'works-power' && !s.blasterInstalled) return { title:'Recover the blaster',detail:'Find the blaster module in the southeast of the Works main bay, outside the sealed tool crib. Tow it back to Haven for installation before breaching the crib.',module:'blaster' }
  if (step.id === 'heart' && !s.teleporterInstalled) return { title:'Recover the Foundry teleporter',detail:'Call Haven to the powered Ring service hub. Tow the teleporter from the Foundry’s far workshop through the open Archive shortcut for installation, and recover the Archive survivor. Teleporting then makes distant exploration easier; cargo still needs towing.',module:'teleporter' }
  return { title:step.title,detail:step.detail,circuit:step.id }
}
