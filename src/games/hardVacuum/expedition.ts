import { profileStart, profileEnd } from './profiling.ts'
import { SECTORS, GATES, SOCKETS, PICKUPS, CACHES, CORE_POSITION, BASE_POSITION } from './stationDefinitions.ts'
export { SECTORS, GATES, SOCKETS, PICKUPS, CACHES, CORE_POSITION, BASE_POSITION, SAVE_KEY, gateCenter } from './stationDefinitions.ts'
export type { Sector } from './stationDefinitions'
import { DOOR_OPEN_SECONDS, doorPanels } from './doors.ts'
import type { CavernMap } from './worldGeometry'
import { isInsideCavern, pointInPolygon, raycastCavern } from './worldGeometry.ts'
import { CHAMBERS, STATION_TERRAIN } from './stationLayout.ts'
import { recordSurvey } from './survey.ts'
import { ARRIVAL_POSITION, BERTHS, IGNITION_CRADLE, OUTER_LOCK_PANELS } from './campaignWorld.ts'
import { POD_RESCUE_CREDITS_LABEL, SURVIVAL_PODS, WARD_POD_HOUSINGS, podReleased, rescuePod, survivalPod } from './survivalPods.ts'
import type { BerthId } from './campaignWorld'
import { campaignObjective, coreReleased, discoverCampaign, freshCampaign, havenPose, havenPosition, havenReady, outerLockOpen, recordAvailable, settleHaven } from './campaign.ts'
import { havenLinkTargets } from './havenActivation.ts'
import { RECOVERY_END, RECOVERY_GRIP, RECOVERY_SEAL, recoveryPath, recoveryPosition } from './havenRecovery.ts'
import type { HavenRecovery, RecoveryCue } from './havenRecovery'
import type { Campaign } from './campaign'
import { dockingReadiness, driftCargo, initialCargoVelocity } from './expeditionPhysics.ts'
import type { FloatingBody } from './expeditionPhysics'
import { resolveWorldContacts } from './bodyCollisions.ts'
import type { HavenMotion, WorldContact } from './bodyCollisions'
import { withHavenColliders } from './havenGeometry.ts'
import { betweenReceiverPlates, receiverPlates } from './receivers.ts'
import { TERMINALS, terminalVisible } from './terminals.ts'
import type { Harpoon, PhaserBeam, Rock, Ship, Vector2 } from './types'
import { BLASTER_BLAST_RADIUS } from './blaster.ts'
import { RADIATION_HOUSINGS, freshRadiationFeedback, rechargeRadiation } from './radiation.ts'
import type { RadiationFeedback } from './radiation'
import { restoreShipSystems } from './supplies.ts'
import { installModule, moduleInstalled } from './equipment.ts'

import { SHOP, upgradeOffer, impactShieldCapacity, blasterCapacity } from './upgrades.ts'
import type { ShopUpgrade, UpgradeLevels } from './upgrades'
import { BOT_STATIONS, botGarageObstacles, stepBotGarages } from './stationBots.ts'
import { IGNITION_HOUSINGS, INSTALLED_CORE_HOUSING, stepIgnitionCradle } from './ignitionCradle.ts'
import type { CoreLatch } from './ignitionCradle'

export type Upgrade = 'radiation' | 'focus2' | ShopUpgrade
export interface Expedition {
  version: 14
  flags: import('./stationIds').ProgressionId[]
  finaleVersion?: 2
  campaign: Campaign
  upgrades: Upgrade[]
  upgradeLevels: UpgradeLevels
  gates: string[]
  power: Record<string, string>
  doors: Record<string, number>
  caches: string[]
  rescuedPods: string[]
  visited: string[]
  surveyed: number[]
  disabledBots: string[]
  botDoors?: Record<string, number>
  checkpoint: string
  credits: number
  banked: number
  core: boolean
  complete: boolean
  position: Vector2
  shields: number
  impactShieldInstalled: boolean
  blasterInstalled: boolean
  blasterCharges: number
  radiationCharge: number
  radiationExposure: number
  teleporterInstalled: boolean
  cargo?: Record<string, { pos: Vector2; vel: Vector2; tethered?: boolean }>
}
const rectangle = (x: number, y: number, w: number, h: number): Vector2[] => [
  { x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h },
]
export const EXPEDITION_WALLS = STATION_TERRAIN.walls

export const freshExpedition = (berth: BerthId = 'breach'): Expedition => ({ version: 14, flags: [], finaleVersion:2, campaign:freshCampaign(berth), upgrades: [], upgradeLevels: {}, gates: [], power: {}, doors: {}, caches: [], rescuedPods: [], visited: [BERTHS.find(b => b.id === berth)!.room], surveyed: [], disabledBots: [], botDoors: {}, checkpoint: 'haven', credits: 0, banked: 0, core: false, complete: false, position: { ...BERTHS.find(b => b.id === berth)!.pos }, shields: 0, impactShieldInstalled: false, blasterInstalled: false, blasterCharges: 0, radiationCharge: 0, radiationExposure: 0, teleporterInstalled: false })
/** A new campaign arrives from outside; berth starts remain useful for development and staging. */
export const newExpedition = (): Expedition => ({ ...freshExpedition(), campaign:{...freshCampaign(),havenActivated:false}, position:{...ARRIVAL_POSITION}, visited:['arrival'] })
export { parseExpedition } from './saveMigrations.ts'
export const sectorAt = (p: Vector2) => SECTORS.find(s => pointInPolygon(p, CHAMBERS[s.id]))
export const checkpointPosition = (s?: Expedition) => ({ ...(s ? s.campaign.havenActivated ? havenPosition(s) : ARRIVAL_POSITION : BASE_POSITION) })
export const maxShields = impactShieldCapacity
export const near = (a: Vector2, b: Vector2, radius: number) => Math.hypot(a.x - b.x, a.y - b.y) < radius
const mapCache = new Map<string, CavernMap>()
const machineObstacles = [
  ...IGNITION_HOUSINGS,
  ...WARD_POD_HOUSINGS,
  ...RADIATION_HOUSINGS,
  ...SOCKETS.flatMap(socket=>receiverPlates(socket.pos)),
]
export function expeditionMap(s: Expedition): CavernMap {
  const profileTime = profileStart()
  try {
    const key = [...s.gates].sort().join(',') + '|' + Object.keys(s.power).sort().join(',') + '|' + Number(s.core) + '|' + Number(outerLockOpen(s))
    const existing = mapCache.get(key)
    const animating = Object.keys(s.doors).length > 0 || Object.keys(s.botDoors ?? {}).length > 0
    if (existing && !animating) return existing
    const installedCells = SOCKETS.filter(socket=>s.power[socket.id]).map(socket=>rectangle(socket.pos.x-10,socket.pos.y-15,20,30))
    const map = { id: 0, name: 'Station survey', boundary: STATION_TERRAIN.boundary, obstacles: [...STATION_TERRAIN.islands, ...machineObstacles, ...(outerLockOpen(s) ? [] : OUTER_LOCK_PANELS), ...(s.core ? [INSTALLED_CORE_HOUSING] : []), ...installedCells, ...botGarageObstacles(s), ...GATES.flatMap(g => doorPanels(g, doorProgress(s, g.id)))], containedRadiation: s.power.heart ? ['reactor-breach','fuel-unit'] : [] }
    if (!animating) { if (mapCache.size > 40) mapCache.clear(); mapCache.set(key, map) }
    return map
  } finally { profileEnd('geometry', profileTime) }
}
export function objective(s: Expedition, towing: string | boolean = false): { title: string; detail: string; target: Vector2 } {
  const goal = campaignObjective(s)
  if (!s.campaign.havenActivated) return {title:goal.title,detail:goal.detail,target:goal.target!}
  if (towing==='core' || towing===true) return { title:'Return to the first cradle',detail:'Tow the core through the lower return tunnel, then east to the Ignition Cradle.',target:IGNITION_CRADLE }
  if (typeof towing === 'string' && survivalPod(towing)) return { title:'Bring this survivor to Haven', detail:`Tow the pod close and slow; rescue and ${POD_RESCUE_CREDITS_LABEL} credits are secured when Haven’s shutters seal.`, target:havenPosition(s) }
  if (towing) return { title:'Tow cargo home', detail:'Bring the object inside Haven for recovery.', target:havenPosition(s) }
  if (goal.target) return { title:goal.title,detail:goal.detail,target:goal.target }
  if (goal.pod) {
    const pod = survivalPod(goal.pod)!
    return { title:goal.title, detail:goal.detail, target:s.cargo?.[pod.id]?.pos ?? pod.pos }
  }
  if (goal.module) {
    const item = PICKUPS.find(item => item.id === goal.module)!
    return { title: goal.title, detail: goal.detail, target: s.cargo?.[item.id]?.tethered ? havenPosition(s) : s.cargo?.[item.id]?.pos ?? item.pos }
  }
  const socket = SOCKETS.find(p => p.id === goal.circuit)
  const source = SOCKETS.find(p => !Object.values(s.power).includes(p.id) && p.id === socket?.id) ?? SOCKETS.find(p => !Object.values(s.power).includes(p.id))
  const target = s.core || s.complete ? IGNITION_CRADLE : coreReleased(s) ? s.cargo?.core?.tethered ? IGNITION_CRADLE : s.cargo?.core?.pos ?? CORE_POSITION : source && socket ? s.cargo?.[source.id]?.tethered ? socket.pos : s.cargo?.[source.id]?.pos ?? source.source : havenPosition(s)
  return { title:goal.title,detail:goal.detail,target }
}
export function purchaseUpgrade(s: Expedition, id: Upgrade): boolean {
  const track = SHOP.find(p => p.id === id)
  if (!track) return false
  const item = upgradeOffer(s, track.id)
  if (item.maxed || item.locked || s.banked < item.cost) return false
  s.banked -= item.cost
  s.upgradeLevels ??= {}
  s.upgradeLevels[track.id] = item.stage
  if (!s.upgrades.includes(track.id)) s.upgrades.push(track.id)
  if (track.id === 'magazine') s.blasterCharges = blasterCapacity(s)
  return true
}
export function bankCarriedCredits(s: Expedition): number {
  const deposited = s.credits
  s.banked += deposited
  s.credits = 0
  return deposited
}
export function bankAtCheckpoint(s: Expedition, id: string): number {
  if (id !== 'haven' || !havenReady(s)) return 0
  const deposited = bankCarriedCredits(s)
  s.checkpoint = id
  restoreShipSystems(s)
  return deposited
}
export function teleportToHaven(s: Expedition, ship: Ship): boolean {
  if (!havenReady(s) || !s.teleporterInstalled || near(ship.pos, havenPosition(s), 130)) return false
  bankCarriedCredits(s)
  ship.pos = checkpointPosition(s)
  ship.vel = { x: 0, y: 0 }
  ship.angularVelocity = 0
  s.position = { ...ship.pos }
  return true
}
export function crashExpedition(s: Expedition): number {
  const lost = s.credits
  if (!s.campaign.havenActivated) {
    // No registered pilot means no reconstruction. Reset even handled cargo,
    // exploration and station changes, rather than granting a free checkpoint.
    delete s.cargo
    Object.assign(s,newExpedition())
    return lost
  }
  s.credits = 0
  s.checkpoint = 'haven'
  settleHaven(s)
  s.campaign.deaths++
  s.disabledBots = []
  s.position = checkpointPosition(s)
  s.shields = maxShields(s)
  s.blasterCharges = blasterCapacity(s)
  rechargeRadiation(s)
  return lost
}
export interface ExpeditionRuntime {
  elapsed: number
  radio?: { id: string; time: number }
  radioQueue?: string[]
  havenImpact?: number
  havenImpactCooldown?: number
  havenLink?: import('./types').TetherBody
  havenActivation?: number
  havenLinkRetraction?: number
  recovery?: HavenRecovery
  coreLatch?: CoreLatch
  recoveryCues?: RecoveryCue[]
  grappleHint?: string
  connectedTerminal?: string
  grappleLesson?: { remaining: number; cell: boolean }
  surveyIn?: number
  radiation: RadiationFeedback
  recharging: boolean
  rechargeProgress: number
  // Presentation-only startup cycle; never saved or used to grant shield charges.
  shieldInstallRecharge?: number
  teleport?: { from: Vector2; time: number }
  gateCharge: Record<string, number>
  socketCharge: Record<string, number>
  objects: Record<string, FloatingBody>
  impactSpeed: number
  towing?: string
  docking?: { id: string; phase: 'in' | 'out'; time: number; from: Vector2; to: Vector2; angle: number; targetAngle: number }
  message: string; messageTime: number; blasterCooldown: number
}
export const freshRuntime = (): ExpeditionRuntime => ({ elapsed: 0, radiation: freshRadiationFeedback(), recharging: false, rechargeProgress: 0, gateCharge: {}, socketCharge: {}, objects: {}, impactSpeed: 0, message: '', messageTime: 0, blasterCooldown: 0 })
export function powerCellSpawns(s: Expedition) {
  const used = new Set(Object.values(s.power)), map = expeditionMap(s)
  return SOCKETS.filter(socket => !used.has(socket.id)).map(socket => {
    const saved = s.cargo?.[socket.id]
    const restored = saved && isInsideCavern(saved.pos, 20, map) ? saved : undefined
    return {
      sourceId: socket.id,
      pos: { ...(restored?.pos ?? socket.source) },
      vel: restored ? { ...restored.vel } : initialCargoVelocity(socket.source),
      tethered: !!restored?.tethered,
    }
  })
}
export const looseObjects = (s: Expedition) => [
  ...PICKUPS.filter(item => !moduleInstalled(s, item.id)).map(item => ({ ...item, ...CARGO_PHYSICS.module, kind: item.id, available: true })),
  ...CACHES.filter(item => !s.caches.includes(item.id)).map(item => ({ ...item, ...CARGO_PHYSICS.salvage, kind: 'cache', available: true })),
  ...SURVIVAL_PODS.filter(item => !s.rescuedPods.includes(item.id)).map(item => ({ ...item, ...CARGO_PHYSICS.pod, kind: 'pod', available: podReleased(s,item.id) })),
  ...(!s.core ? [{ id: 'core', pos: CORE_POSITION, ...CARGO_PHYSICS.core, kind: 'core', available: coreReleased(s) }] : []),
]
export const objectBody = (rt: ExpeditionRuntime, id: string, position: Vector2): FloatingBody => {
  const kind = id === 'core' ? 'core' : survivalPod(id) ? 'pod' : CACHES.some(c => c.id === id) ? 'salvage' : 'module'
  const { radius } = CARGO_PHYSICS[kind]
  const body = rt.objects[id] ??= { pos: { ...position }, vel: initialCargoVelocity(position), radius, cargoId: id, capture: 0 }
  if (![body.pos.x, body.pos.y, body.vel.x, body.vel.y].every(Number.isFinite)) {
    body.pos = { ...position }; body.vel = { x: 0, y: 0 }; body.capture = 0
  }
  identifyBody(body, { type: 'cargo', id, kind })
  return body
}
export function cargoBodies(s: Expedition, rt: ExpeditionRuntime): FloatingBody[] {
  return looseObjects(s).map(item => {
    const existing = rt.objects[item.id]
    const body = objectBody(rt, item.id, item.pos)
    if (!existing) {
      const saved = s.cargo?.[item.id]
      if (saved && isInsideCavern(saved.pos, body.radius, expeditionMap(s))) { body.pos = { ...saved.pos }; body.vel = { ...saved.vel }; body.tethered = saved.tethered }
    }
    if (survivalPod(item.id)) {
      const wasLocked = body.anchored
      body.anchored = !item.available
      if (body.anchored) { body.pos = { ...item.pos }; body.vel = { x:0,y:0 }; body.tethered = false }
      else if (wasLocked) body.vel = { x:0,y:item.pos.y < 3500 ? 7 : -7 }
    }
    return rt.objects[item.id]
  })
}
export function snapshotCargo(s: Expedition, rt: ExpeditionRuntime, rocks: Rock[]) {
  s.cargo = Object.fromEntries([
    ...cargoBodies(s, rt).map(body => [body.cargoId, { pos: { ...body.pos }, vel: body.retrieving ? {x:0,y:0} : { ...body.vel }, tethered: !!body.tethered }]),
    ...rocks.filter(rock => rock.sourceId).map(rock => [rock.sourceId!, { pos: { ...rock.pos }, vel: { ...rock.vel }, tethered: !!rock.tethered }]),
  ])
}
export const doorProgress = (s: Expedition, id: string) => s.doors[id] ?? (s.gates.includes(id) ? 1 : 0)

/** Haven takes custody only after its jaws close; cargo stays full size and
 * solid until the receiving shutters seal. Rewards are committed once. */
export function stepCargoRecovery(s: Expedition,rt: ExpeditionRuntime,dt: number): string[] {
  const events:string[]=[],pose=havenPose(s),items=looseObjects(s).filter(item=>item.id!=='core')
  cargoBodies(s,rt)
  const cancel=()=>{
    if(rt.recovery) {
      const body=rt.objects[rt.recovery.id]
      if(body) { delete body.retrieving; body.capture=0; body.vel={x:0,y:0} }
    }
    delete rt.recovery
  }
  if(!havenReady(s) || rt.recovery?.id==='core') { cancel(); return events }
  if(!rt.recovery) {
    for(const item of items) {
      const body=rt.objects[item.id]
      if(!item.available||!body.tethered||!near(body.pos,pose.pos,152)||Math.hypot(body.vel.x,body.vel.y)>150) continue
      const route=recoveryPath(pose,body,expeditionMap(s))
      if(!route) continue
      rt.recovery={id:item.id,bay:route.bay,path:route.path,time:0,cargoTime:rt.elapsed,secured:false}
      ;(rt.recoveryCues ??= []).push('reach')
      break
    }
  }
  const recovery=rt.recovery
  if(!recovery) return events
  const body=rt.objects[recovery.id],before=recovery.time
  recovery.time+=dt
  body.capture=recovery.time
  if(before<RECOVERY_GRIP) {
    // Follow a drifting load with the wrists, then validate the actual route
    // again before the grip becomes physical. A fast fly-by is never caught.
    if(!near(body.pos,pose.pos,170)||!items.some(item=>item.id===recovery.id)) { cancel(); return events }
    recovery.cargoTime=rt.elapsed
    if(recovery.time>=RECOVERY_GRIP) {
      const route=recoveryPath(pose,body,expeditionMap(s),recovery.bay)
      if(!route) { cancel(); return events }
      recovery.path=route.path; body.retrieving=true
      ;(rt.recoveryCues ??= []).push('grip')
    }
  }
  if(body.retrieving) {
    const pos=recoveryPosition(recovery)
    body.vel={x:(pos.x-body.pos.x)/Math.max(dt,.0001),y:(pos.y-body.pos.y)/Math.max(dt,.0001)}
    body.pos=pos
  }
  if(recovery.time>=RECOVERY_SEAL&&!recovery.secured) {
    recovery.secured=true
    const upgrade=PICKUPS.find(p=>p.id===recovery.id),cache=CACHES.find(p=>p.id===recovery.id)
    if(upgrade && installModule(s,upgrade.id)) events.push(`${upgrade.label} installed`)
    else if(cache) { s.caches.push(cache.id); s.banked+=cache.value; events.push(`Salvage +${cache.value} banked`) }
    else if(rescuePod(s,recovery.id)) events.push(`Survivor rescued · +${POD_RESCUE_CREDITS_LABEL} banked`)
    ;(rt.recoveryCues ??= []).push('seal')
  }
  if(recovery.time>=RECOVERY_END) { delete rt.objects[recovery.id]; delete rt.recovery }
  return events
}
export function powerReceiver(s: Expedition, id: string, source: string): boolean {
  const socket = SOCKETS.find(p => p.id === id)
  if (!socket || s.power[id] || !SOCKETS.some(p => p.id === source) || Object.values(s.power).includes(source)) return false
  s.power[id] = source
  for (const bot of BOT_STATIONS) if (bot.power===id) (s.botDoors ??= {})[bot.id]=0
  for (const gate of socket.gates) {
    if (openGate(s, gate) && GATES.some(g => g.id === gate)) s.doors[gate] = 0
  }
  for (const flag of socket.flags ?? []) if (!s.flags.includes(flag)) s.flags.push(flag)
  return true
}
export function openGate(s: Expedition, id: string): boolean {
  if (s.gates.includes(id)) return false
  s.gates.push(id)
  return true
}
export function blastGate(s: Expedition, pos: Vector2, radius = BLASTER_BLAST_RADIUS): boolean {
  let opened = false
  const map = withHavenColliders(expeditionMap(s), havenPose(s))
  for (const gate of GATES) {
    if ((gate.kind !== 'blast' && gate.kind !== 'rubble') || s.gates.includes(gate.id)) continue
    const edge = { x: Math.max(gate.x, Math.min(gate.x + gate.w, pos.x)), y: Math.max(gate.y, Math.min(gate.y + gate.h, pos.y)) }
    if (near(pos, edge, radius) && visibleBetween(pos, edge, map)) opened = openGate(s, gate.id) || opened
  }
  return opened
}
export function stepExpedition(s: Expedition, rt: ExpeditionRuntime, args: {
  dt: number; ship: Ship; rocks: Rock[]; harpoon: Harpoon; beam: PhaserBeam; aboard?: boolean; havenMotion?: HavenMotion; onContact?: (contact: WorldContact) => void; extraBodies?: import('./types').TetherBody[]
}): string[] {
  const { dt, ship, rocks, harpoon } = args
  const events: string[] = []
  s.checkpoint = 'haven'
  rt.elapsed += dt
  s.campaign.playedSeconds += dt
  s.surveyed ??= []
  rt.surveyIn = (rt.surveyIn ?? 0) - dt
  if (rt.surveyIn <= 0) { recordSurvey(s.surveyed, ship.pos, expeditionMap(s)); rt.surveyIn = 0.3 }
  if (rt.teleport && (rt.teleport.time -= dt) <= 0) delete rt.teleport
  stepBotGarages(s,dt)
  for (const id of Object.keys(s.doors)) {
    s.doors[id] = Math.min(1, s.doors[id] + dt / DOOR_OPEN_SECONDS)
    if (s.doors[id] >= 1) delete s.doors[id]
  }
  rt.impactSpeed = 0
  rt.towing = harpoon.state === 'attached' ? harpoon.rock.cargoId : undefined
  rt.messageTime = Math.max(0, rt.messageTime - dt)
  rt.blasterCooldown = Math.max(0, (rt.blasterCooldown ?? 0) - dt)
  const room = sectorAt(ship.pos)
  if (room && !s.visited.includes(room.id)) { s.visited.push(room.id); events.push(`Discovered ${room.name}`) }
  rt.radioQueue ??= []
  if (rt.havenActivation !== undefined) rt.havenActivation=Math.max(0,rt.havenActivation-dt)
  const link=havenLinkTargets(s,rt)[0]
  const linkConnected=!args.aboard && link && harpoon.state==='attached' && harpoon.rock===link &&
    near(ship.pos,link.pos,700) && visibleBetween(ship.pos,link.pos,expeditionMap(s))
  if (linkConnected && !s.campaign.havenActivated) {
    s.campaign.havenActivated=true
    s.campaign.havenLinkPending=true
    s.campaign.grappleLearned=true
    rt.havenActivation=10
    events.push('Haven online · recovery link established')
  }
  const terminal = !args.aboard && harpoon.state === 'attached' && harpoon.rock.terminalId &&
    TERMINALS.includes(harpoon.rock) && terminalVisible(ship.pos,harpoon.rock,expeditionMap(s)) ? harpoon.rock : undefined
  const connectedRecord=linkConnected ? 'first-light' : terminal?.terminalId && recordAvailable(s,terminal.terminalId) ? terminal.terminalId : undefined
  discoverCampaign(s, room?.id, connectedRecord)
  if (connectedRecord && rt.connectedTerminal !== connectedRecord) {
    if (terminal) s.campaign.terminalLinked = true
    delete rt.grappleLesson
    rt.radio = { id:connectedRecord,time:16 }
    rt.radioQueue = rt.radioQueue.filter(id=>id!==connectedRecord)
  }
  rt.connectedTerminal = connectedRecord
  // Exposition is requested with a cable, never broadcast over the flight HUD.
  rt.grappleHint=''
  rt.radioQueue=[]
  if (!connectedRecord) delete rt.radio
  if (harpoon.state === 'attached' && !harpoon.rock.anchored) { harpoon.rock.tethered = true; s.campaign.grappleLearned = true }
  const map = expeditionMap(s)
  const active = (body: {pos:Vector2}) => near(body.pos,ship.pos,1500) || near(body.pos,havenPosition(s),450)
  const cargo = cargoBodies(s,rt).filter(active)
  for (const body of cargo) {
    body.laserGlow = (body.laserGlow ?? 0) * Math.exp(-5 * dt)
    driftCargo(body,dt)
  }
  events.push(...stepCargoRecovery(s,rt,dt))
  resolveWorldContacts([...rocks.filter(active),...cargo.filter(b=>!(rt.recovery?.id===b.cargoId&&rt.recovery.secured)),...havenLinkTargets(s,rt),...(args.extraBodies ?? []).filter(active),...(args.aboard ? [] : [ship])],map,contact=>{
    if (contact.body === ship || contact.other === ship) rt.impactSpeed=Math.max(rt.impactSpeed,contact.speed)
    args.onContact?.(contact)
  },args.havenMotion)
  for (const socket of SOCKETS) {
    if (s.power[socket.id]) continue
    const rock = rocks.find(r => r.socketId === socket.id) ?? rocks.find(r =>
      r.kind === 'blue' && r.sourceId && !Object.values(s.power).includes(r.sourceId) && !r.socketId && betweenReceiverPlates(r, socket.pos))
    if (!rock) continue
    if (!betweenReceiverPlates(rock,socket.pos)) {
      delete rock.socketId; rt.socketCharge[socket.id]=0
      continue
    }
    rock.socketId = socket.id
    // Contact starts only inside the plates. Seat within that clear gap,
    // release the cable and energize after the cell settles at the contacts.
    const target = socket.pos
    const settle = 1 - Math.exp(-7 * dt)
    rock.pos.x += (target.x - rock.pos.x) * settle
    rock.pos.y += (target.y - rock.pos.y) * settle
    rock.vel.x *= Math.exp(-12 * dt); rock.vel.y *= Math.exp(-12 * dt)
    rock.rot = rock.rot.map(angle => angle * Math.exp(-8 * dt)) as [number, number, number]
    const seated = near(rock.pos, socket.pos, 7) && Math.hypot(rock.vel.x, rock.vel.y) < 15
    rt.socketCharge[socket.id] = seated ? (rt.socketCharge[socket.id] ?? 0) + dt : 0
    if (rt.socketCharge[socket.id] < 0.2) continue
    rocks.splice(rocks.indexOf(rock), 1)
    powerReceiver(s, socket.id, rock.sourceId!)
    events.push(`${socket.label} online`)
  }
  if (stepIgnitionCradle(s,rt,dt)) {
    events.push('Station escape bus online')
    discoverCampaign(s,room?.id)
  }
  return events
}
export function interaction(s: Expedition, body: Ship): { kind: 'dock' | 'recall'; id: string; label: string; ready?: boolean } | null {
  const ship = body.pos
  if (havenReady(s) && near(ship, havenPosition(s), 90)) {
      const status = dockingReadiness(body, havenPosition(s))
      const hint = status === 'ready' ? 'Dock · E' : 'Haven'
      return { kind: 'dock', id: 'haven', label: hint, ready: status === 'ready' }
  }
  const berth = BERTHS.find(b => s.campaign.berths.includes(b.id) && b.id !== s.campaign.berth && near(ship,b.pos,145))
  if (berth) return { kind:'recall',id:berth.id,label:havenReady(s) ? 'Call Haven · E' : 'Haven in transit',ready:havenReady(s) }
  return null
}
export function visibleBetween(a: Vector2, b: Vector2, map: CavernMap): boolean {
  const distance = Math.hypot(b.x - a.x, b.y - a.y)
  return raycastCavern(a, { x: b.x - a.x, y: b.y - a.y }, distance, map) >= distance - 1
}
import { CARGO_PHYSICS, identifyBody } from './bodyDefinitions.ts'
