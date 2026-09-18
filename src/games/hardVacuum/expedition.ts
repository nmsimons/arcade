import { DOOR_OPEN_SECONDS, doorPanels } from './doors.ts'
import type { CavernMap } from './worldGeometry'
import { isInsideCavern, pointInPolygon, raycastCavern } from './worldGeometry.ts'
import { CHAMBERS, STATION_TERRAIN } from './stationLayout.ts'
import { migrateSurvey, recordSurvey, SURVEY_LIMIT } from './survey.ts'
import { BERTHS, CAMPAIGN_CACHES, CAMPAIGN_GATES, CAMPAIGN_SECTORS, CAMPAIGN_SOCKETS, IGNITION_POSITION, WARD_BANKS } from './campaignWorld.ts'
import type { BerthId } from './campaignWorld'
import { campaignObjective, coreReleased, discoverCampaign, freshCampaign, havenPose, havenPosition, havenReady, RECORDS, settleHaven } from './campaign.ts'
import { RECOVERY_END, RECOVERY_GRIP, RECOVERY_SEAL, recoveryPath, recoveryPosition } from './havenRecovery.ts'
import type { HavenRecovery, RecoveryCue } from './havenRecovery'
import type { Campaign } from './campaign'
import { stepGrappleGuide } from './grappleGuide.ts'
import { dockingReadiness, driftCargo, initialCargoVelocity } from './expeditionPhysics.ts'
import type { FloatingBody } from './expeditionPhysics'
import { resolveWorldContacts } from './bodyCollisions.ts'
import type { HavenMotion, WorldContact } from './bodyCollisions'
import { betweenReceiverPlates, receiverPlates } from './receivers.ts'
import { TERMINALS, TERMINAL_HOUSINGS, terminalVisible } from './terminals.ts'
import type { Harpoon, PhaserBeam, Rock, Ship, Vector2 } from './types'
import { BLASTER_BLAST_RADIUS, BLASTER_CAPACITY } from './blaster.ts'
import { RADIATION_CAPACITY, RADIATION_HOUSINGS, freshRadiationFeedback, rechargeRadiation } from './radiation.ts'
import type { RadiationFeedback } from './radiation'
import { freshSupplies, RECHARGE_PACK_LIMIT, restoreShipSystems } from './supplies.ts'
import { SHIELD_REPAIR_TIME } from './tuning.ts'

import { SHOP, UPGRADE_COSTS, upgradeOffer, upgradeValue } from './upgrades.ts'
import type { ShopUpgrade, UpgradeLevels } from './upgrades'
import { BOT_STATIONS, botGarageObstacles, stepBotGarages } from './stationBots.ts'

export type Upgrade = 'radiation' | 'focus2' | ShopUpgrade
export interface Expedition {
  version: 1
  campaign: Campaign
  upgrades: Upgrade[]
  upgradeLevels: UpgradeLevels
  gates: string[]
  power: Record<string, string>
  doors: Record<string, number>
  caches: string[]
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
  blasterInstalled: boolean
  blasterCharges: number
  radiationCharge: number
  radiationExposure: number
  rechargePacks: number
  teleporterInstalled: boolean
  remoteRechargeRemaining: number
  cargo?: Record<string, { pos: Vector2; vel: Vector2; tethered?: boolean }>
}
export interface Sector {
  id: string
  name: string
  subtitle: string
  color: string
  x: number
  y: number
  w: number
  h: number
  dock?: Vector2
}
export const SECTORS: readonly Sector[] = [
  { id: 'haven', name: 'Ring service hub', subtitle: 'DISTRIBUTION / BERTH', color: '#00ff88', x: 1200, y: 800, w: 600, h: 600 },
  { id: 'salvage', name: 'Wreckwater', subtitle: '02 / SALVAGE GALLERY', color: '#65baff', x: 200, y: 800, w: 600, h: 600 },
  { id: 'foundry', name: 'The Foundry', subtitle: '03 / ABANDONED WORKSHOP', color: '#ffbd69', x: 200, y: 200, w: 600, h: 400 },
  { id: 'archive', name: 'Cold Archive', subtitle: '04 / RESEARCH VAULT', color: '#b8a0ff', x: 1200, y: 200, w: 600, h: 400 },
  { id: 'reactor', name: 'Ember Lung', subtitle: '05 / REACTOR APPROACH', color: '#ff7962', x: 2200, y: 800, w: 600, h: 600 },
  { id: 'engine', name: 'Reserve engine', subtitle: 'REFUGE FEED', color: '#ffc977', x: 2200, y: 1600, w: 600, h: 400 },
  { id: 'vault', name: 'Smuggler’s Rest', subtitle: '07 / HIDDEN SALVAGE', color: '#79e2d0', x: 1200, y: 1600, w: 600, h: 400 },
  ...CAMPAIGN_SECTORS,
]
const rectangle = (x: number, y: number, w: number, h: number): Vector2[] => [
  { x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h },
]
export const EXPEDITION_WALLS = STATION_TERRAIN.walls

export const GATES = [
  { id: 'rubble', kind: 'rubble', label: 'ROCK BARRIER', x: 990, y: 1000, w: 30, h: 200, color: '#ff665e' },
  { id: 'foundry', kind: 'socket', label: 'POWER CELL REQUIRED', x: 400, y: 690, w: 200, h: 30, color: '#65baff' },
  { id: 'archive', kind: 'socket', label: 'POWER OFF · HAVEN RELAY', x: 990, y: 300, w: 30, h: 200, color: '#ffbd69' },
  { id: 'shortcut', kind: 'socket', label: 'POWER OFF · HAVEN RELAY', x: 1400, y: 690, w: 200, h: 30, color: '#b8a0ff' },
  { id: 'reactor', kind: 'socket', label: 'POWER OFF · HAVEN RELAY', x: 1990, y: 1000, w: 30, h: 200, color: '#ffbd69' },
  { id: 'blast', kind: 'blast', label: 'BLAST DOOR', x: 1400, y: 1490, w: 200, h: 30, color: '#ff665e' },
  { id: 'drive', kind: 'socket', label: 'ENGINE RETURN / NO POWER', x: 1990, y: 1700, w: 30, h: 200, color: '#65baff' },
  ...CAMPAIGN_GATES,
] as const
export const gateCenter = (g: typeof GATES[number]): Vector2 => ({ x: g.x + g.w / 2, y: g.y + g.h / 2 })
export const SOCKETS = [
  { id: 'foundry', pos: { x: 460, y: 920 }, source: { x: 1660, y: 920 }, label: 'FOUNDRY DOOR', gates: ['foundry'] },
  { id: 'heart', pos: { x: 2480, y: 1780 }, source: { x: 2735, y: 1110 }, label: 'CONTAINMENT / ENGINE RETURN', gates: ['heart', 'refuge-link', 'drive'] },
  { id: 'relay', pos: { x: 1660, y: 1280 }, source: { x: 340, y: 340 }, label: 'ARCHIVE / REACTOR / SHORTCUT', gates: ['archive', 'reactor', 'shortcut'] },
  ...CAMPAIGN_SOCKETS,
] as const
export const PICKUPS: { id: Upgrade; pos: Vector2; label: string; detail: string; sector: string }[] = [
  { id: 'radiation', pos: { x: 7130, y: 1290 }, label: 'Radiation shield', detail: 'Adds a separate radiation reserve. Eight seconds at peak exposure; distance and rock cover reduce the dose. Recharge at Haven.', sector: 'stores' },
]
export const CACHES = [
  { id: 'wreck-cache', pos: { x: 290, y: 1260 }, value: 100, sector: 'salvage' },
  { id: 'archive-cache', pos: { x: 1310, y: 300 }, value: 100, sector: 'archive' },
  { id: 'vault-cache', pos: { x: 1400, y: 1830 }, value: 220, sector: 'vault' },
  { id: 'engine-cache', pos: { x: 2710, y: 1910 }, value: 100, sector: 'engine' },
  ...CAMPAIGN_CACHES,
]
export const CORE_POSITION = IGNITION_POSITION
export const BASE_POSITION = { x: 1500, y: 1100 }
export const SAVE_KEY = 'hard-vacuum-expedition-v1'
const untouchedArchiveModule = (body: {pos:Vector2;tethered?:boolean}) => !body.tethered && body.pos.x>=1100 && body.pos.x<=1900 && body.pos.y>=150 && body.pos.y<=650
export const freshExpedition = (berth: BerthId = 'breach'): Expedition => ({ version: 1, campaign:freshCampaign(berth), upgrades: [], upgradeLevels: {}, gates: [], power: {}, doors: {}, caches: [], visited: [BERTHS.find(b => b.id === berth)!.room], surveyed: [], disabledBots: [], botDoors: {}, checkpoint: 'haven', credits: 0, banked: 0, core: false, complete: false, position: { ...BERTHS.find(b => b.id === berth)!.pos }, shields: 2, blasterInstalled: false, blasterCharges: 0, radiationCharge: 0, radiationExposure: 0, ...freshSupplies() })
export function parseExpedition(raw: string | null): Expedition | null {
  try {
    const s = JSON.parse(raw ?? 'null')
    const hadAccess = Array.isArray(s?.upgrades) && s.upgrades.some((id: string) => id === 'access' || id === 'cutter')
    if (Array.isArray(s?.upgrades)) s.upgrades = [...new Set(s.upgrades.filter((id: string) => id !== 'access' && id !== 'cutter').map((id: string) => (({ thermal: 'radiation', drive: 'focus' } as Record<string, string>)[id] ?? id)))]
    // Retire the six removed formations without invalidating existing saves.
    if (Array.isArray(s?.gates)) s.gates = s.gates.filter((id: unknown) => typeof id !== 'string' || !/^crag-[0-5]$/.test(id))
    if (!s || s.version !== 1 || !Number.isFinite(s.credits) || s.credits < 0 || !Number.isFinite(s.banked) || s.banked < 0 ||
      !Array.isArray(s.upgrades) || !s.upgrades.every((id: unknown) => (id === 'focus2' || [...PICKUPS, ...SHOP].some(p => p.id === id))) ||
      !Array.isArray(s.gates) || !s.gates.every((id: unknown) => id === 'heart' || id === 'ignition-ready' || id === 'thermal' || GATES.some(g => g.id === id)) ||
      !Array.isArray(s.caches) || !s.caches.every((id: unknown) => CACHES.some(c => c.id === id)) ||
      !Array.isArray(s.visited) || !s.visited.every((id: unknown) => SECTORS.some(r => r.id === id)) ||
      !['haven', 'foundry', 'reactor'].includes(s.checkpoint) || typeof s.core !== 'boolean' || typeof s.complete !== 'boolean' ||
      !s.position || !Number.isFinite(s.position.x) || !Number.isFinite(s.position.y) ||
      !Number.isInteger(s.shields) || s.shields < 0 || s.shields > 8 ||
      (s.blasterInstalled !== undefined && typeof s.blasterInstalled !== 'boolean') ||
      (s.blasterCharges !== undefined && (!Number.isInteger(s.blasterCharges) || s.blasterCharges < 0 || s.blasterCharges > BLASTER_CAPACITY)) ||
      (s.radiationCharge !== undefined && (!Number.isFinite(s.radiationCharge) || s.radiationCharge < 0 || s.radiationCharge > RADIATION_CAPACITY)) ||
      (s.radiationExposure !== undefined && (!Number.isFinite(s.radiationExposure) || s.radiationExposure < 0 || s.radiationExposure > 2))) return null
    s.upgradeLevels ??= {}
    if (s.surveyed === undefined) s.surveyed = []
    s.disabledBots ??= []
    if (!Array.isArray(s.disabledBots) || s.disabledBots.length > BOT_STATIONS.length || s.disabledBots.some((id: unknown) => !BOT_STATIONS.some(bot => bot.id === id))) return null
    if (!Array.isArray(s.surveyed) || s.surveyed.length > SURVEY_LIMIT || s.surveyed.some((id: unknown) => typeof id !== 'number' || !Number.isInteger(id) || id < 0 || id >= SURVEY_LIMIT)) return null
    if (s.campaign === undefined) {
      s.surveyed = migrateSurvey(s.surveyed)
      s.campaign = freshCampaign('ring')
      s.campaign.berths = ['breach','freight','works','ring']
      s.power ??= Object.fromEntries(SOCKETS.filter(socket => s.gates.includes(socket.id)).map(socket => [socket.id,socket.id]))
      for (const socket of CAMPAIGN_SOCKETS.slice(0,5)) {
        s.power[socket.id] = socket.id
        for (const id of socket.gates) if (!s.gates.includes(id)) s.gates.push(id)
      }
      for (const id of ['tool-door','store-door']) if (!s.gates.includes(id)) s.gates.push(id)
      if (s.gates.includes('heart') && !s.gates.includes('refuge-link')) s.gates.push('refuge-link')
      // A completed prototype remains complete; an unfinished save joins the
      // campaign at the Ring with its money, equipment and cargo intact.
      if (!s.complete) { s.core = false; if (s.cargo) delete s.cargo.core }
    }
    const c = s.campaign as Campaign
    const validPoint = (p: Vector2) => p && Number.isFinite(p.x) && Number.isFinite(p.y) && p.x >= 0 && p.x <= 9600 && p.y >= 0 && p.y <= 5100
    if (!c || c.version !== 1 || !BERTHS.some(b => b.id === c.berth) || !validPoint(c.haven) ||
      !Array.isArray(c.berths) || !c.berths.includes(c.berth) || c.berths.some(id => !BERTHS.some(b => b.id === id)) ||
      !Array.isArray(c.records) || c.records.some(id => !RECORDS.some(r => r.id === id)) ||
      !Number.isFinite(c.playedSeconds) || c.playedSeconds < 0 || !Number.isInteger(c.deaths) || c.deaths < 0) return null
    c.havenAngle ??= 0
    c.grappleLearned ??= Object.keys(s.power ?? {}).length > 0 || s.caches.length > 0
    c.terminalLinked ??= false
    if (!Number.isFinite(c.havenAngle) || typeof c.grappleLearned !== 'boolean' || typeof c.terminalLinked !== 'boolean') return null
    if (c.journey) {
      const j = c.journey
      j.speed ??= 0
      if (!Number.isFinite(j.speed) || j.speed < 0 || j.speed > 210) return null
      if (!c.berths.includes(j.destination) || !Array.isArray(j.points) || !j.points.length || j.points.length > 100 || !j.points.every(validPoint) || !Number.isInteger(j.index) || j.index < 0 || j.index > j.points.length || !['folding','transit','deploying'].includes(j.phase) || !Number.isFinite(j.progress) || j.progress < 0 || j.progress > 1 || typeof j.riding !== 'boolean') return null
    } else if (Math.hypot(c.haven.x-BERTHS.find(b => b.id === c.berth)!.pos.x,c.haven.y-BERTHS.find(b => b.id === c.berth)!.pos.y) > 1) return null
    for (const [key, value] of Object.entries(freshSupplies())) if (s[key] === undefined) s[key] = value
    if (!Number.isInteger(s.rechargePacks) || s.rechargePacks < 0 || s.rechargePacks > RECHARGE_PACK_LIMIT ||
      typeof s.teleporterInstalled !== 'boolean' ||
      !Number.isFinite(s.remoteRechargeRemaining) || s.remoteRechargeRemaining < 0 || s.remoteRechargeRemaining > SHIELD_REPAIR_TIME) return null
    if (!s.upgradeLevels || typeof s.upgradeLevels !== 'object' || Array.isArray(s.upgradeLevels) ||
      Object.entries(s.upgradeLevels).some(([id, level]) => !SHOP.some(item => item.id === id) || typeof level !== 'number' || !Number.isInteger(level) || level < 0 || level > UPGRADE_COSTS.length)) return null
    // Any previously purchased tether stage becomes the single double-length
    // upgrade. Retire charge inventory and refund an unused teleport charge.
    if (s.upgradeLevels.winch !== undefined) s.upgradeLevels.winch = s.upgradeLevels.winch > 0 ? 1 : 0
    if (s.teleportCharges !== undefined) {
      if (!Number.isInteger(s.teleportCharges) || s.teleportCharges < 0 || s.teleportCharges > 1 || (s.teleportCharges > 0 && !s.teleporterInstalled)) return null
      s.banked += s.teleportCharges * 750
      delete s.teleportCharges
    }
    s.power ??= Object.fromEntries(SOCKETS.filter(socket => s.gates.includes(socket.id)).map(socket => [socket.id, socket.id]))
    s.doors ??= {}
    if (!s.power || typeof s.power !== 'object' || Array.isArray(s.power) ||
      Object.entries(s.power).some(([socket, source]) => !SOCKETS.some(p => p.id === socket) || !SOCKETS.some(p => p.id === source)) ||
      new Set(Object.values(s.power)).size !== Object.values(s.power).length ||
      !s.doors || typeof s.doors !== 'object' || Array.isArray(s.doors) ||
      Object.entries(s.doors).some(([id, progress]) => !GATES.some(g => g.id === id && g.kind === 'socket') || !s.gates.includes(id) || typeof progress !== 'number' || !Number.isFinite(progress) || progress < 0 || progress > 1)) return null
    if (hadAccess || s.power.relay) {
      s.power.relay ??= 'relay'
      for (const id of ['archive', 'reactor', 'shortcut']) if (!s.gates.includes(id)) s.gates.push(id)
    }
    s.botDoors ??= {}
    if (typeof s.botDoors !== 'object' || Array.isArray(s.botDoors) || Object.entries(s.botDoors).some(([id,progress])=>!BOT_STATIONS.some(bot=>bot.id===id && s.power[bot.power]) || typeof progress!=='number' || !Number.isFinite(progress) || progress<0 || progress>1)) return null
    if (s.cargo !== undefined) {
      if (!s.cargo || typeof s.cargo !== 'object' || Array.isArray(s.cargo)) return null
      const ids = [...PICKUPS.map(p => p.id), ...CACHES.map(c => c.id), ...SOCKETS.map(p => p.id), 'core', 'ore', 'access', 'cutter', 'thermal', 'drive']
      for (const [id, cargo] of Object.entries(s.cargo)) {
        const body = cargo as { pos?: Vector2; vel?: Vector2; tethered?: boolean }
        if (!ids.includes(id) || !body || !body.pos || !body.vel || ![body.pos.x, body.pos.y, body.vel.x, body.vel.y].every(Number.isFinite) || (body.tethered !== undefined && typeof body.tethered !== 'boolean')) return null
      }
    }
    if (s.cargo) {
      if (s.cargo.cutter || s.cargo.access) s.cargo.relay = s.cargo.access ?? s.cargo.cutter
      if (s.cargo.thermal) s.cargo.radiation = s.cargo.thermal
      for (const id of ['ore', 'access', 'cutter', 'thermal', 'drive']) delete s.cargo[id]
      // Move an unrecovered archive module ahead of the newly irradiated transfer tubes.
      const module = s.cargo.radiation
      if (module && untouchedArchiveModule(module)) delete s.cargo.radiation
      // Move untouched legacy cells to their new rooms, keeping player-moved cargo.
      for (const [id, x, y] of [['foundry', 660, 1258], ['heart', 2340, 1938]] as const) {
        const cargo = s.cargo[id]
        if (cargo && !cargo.tethered && Math.hypot(cargo.pos.x - x, cargo.pos.y - y) < 5) delete s.cargo[id]
      }
    }
    // Migrate former outpost checkpoints without discarding earned progress.
    return { ...s, checkpoint: 'haven', blasterInstalled: s.blasterInstalled ?? false, blasterCharges: s.blasterInstalled ? s.blasterCharges ?? BLASTER_CAPACITY : 0, radiationCharge: s.radiationCharge ?? (s.upgrades.includes('radiation') ? RADIATION_CAPACITY : 0), radiationExposure: s.radiationExposure ?? 0 } as Expedition
  } catch { return null }
}
export const readExpedition = (): Expedition | null => {
  try { return parseExpedition(localStorage.getItem(SAVE_KEY)) } catch { return null }
}
export const saveExpedition = (s: Expedition): boolean => {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(s)); return true } catch { return false }
}
export const sectorAt = (p: Vector2) => SECTORS.find(s => pointInPolygon(p, CHAMBERS[s.id]))
export const checkpointPosition = (s?: Expedition) => ({ ...(s ? havenPosition(s) : BASE_POSITION) })
export const maxShields = (s: Expedition) => upgradeValue(s, 'hull')
export const near = (a: Vector2, b: Vector2, radius: number) => Math.hypot(a.x - b.x, a.y - b.y) < radius
const mapCache = new Map<string, CavernMap>()
const machineObstacles = [
  ...WARD_BANKS.map(b => rectangle(b.x-b.w/2,b.y-b.h/2,b.w,b.h)),
  ...TERMINAL_HOUSINGS,
  ...RADIATION_HOUSINGS,
  ...SOCKETS.flatMap(socket=>receiverPlates(socket.pos)),
]
export function expeditionMap(s: Expedition): CavernMap {
  const key = [...s.gates].sort().join(',') + '|' + Object.keys(s.power).sort().join(',')
  const existing = mapCache.get(key)
  const animating = Object.keys(s.doors).length > 0 || Object.keys(s.botDoors ?? {}).length > 0
  if (existing && !animating) return existing
  const installedCells = SOCKETS.filter(socket=>s.power[socket.id]).map(socket=>rectangle(socket.pos.x-10,socket.pos.y-15,20,30))
  const map = { id: 0, name: 'Station survey', boundary: STATION_TERRAIN.boundary, obstacles: [...STATION_TERRAIN.islands, ...machineObstacles, ...installedCells, ...botGarageObstacles(s), ...GATES.flatMap(g => doorPanels(g, doorProgress(s, g.id)))], containedRadiation: s.power.heart ? ['reactor-breach','fuel-unit'] : [] }
  if (!animating) { if (mapCache.size > 40) mapCache.clear(); mapCache.set(key, map) }
  return map
}
export function objective(s: Expedition, towing: string | boolean = false): { title: string; detail: string; target: Vector2 } {
  if (towing) return { title: towing === 'core' || towing === true ? 'Tow the core home' : 'Tow cargo home', detail: 'Bring the object inside Haven for recovery.', target: havenPosition(s) }
  const goal = campaignObjective(s)
  const socket = SOCKETS.find(p => p.id === goal.circuit)
  const source = SOCKETS.find(p => !Object.values(s.power).includes(p.id) && p.id === socket?.id) ?? SOCKETS.find(p => !Object.values(s.power).includes(p.id))
  const target = s.core || s.complete ? havenPosition(s) : coreReleased(s) ? s.cargo?.core?.pos ?? CORE_POSITION : source && socket ? s.cargo?.[source.id]?.tethered ? socket.pos : s.cargo?.[source.id]?.pos ?? source.source : havenPosition(s)
  return { title:goal.title,detail:goal.detail,target }
}
export function purchaseUpgrade(s: Expedition, id: Upgrade | 'blaster'): boolean {
  if (id === 'blaster') {
    const offer = upgradeOffer(s, id)
    if (offer.maxed || s.banked < offer.cost) return false
    s.banked -= offer.cost; s.blasterInstalled = true; s.blasterCharges = BLASTER_CAPACITY
    return true
  }
  const track = SHOP.find(p => p.id === id)
  if (!track) return false
  const item = upgradeOffer(s, track.id)
  if (item.maxed || s.banked < item.cost) return false
  s.banked -= item.cost
  s.upgradeLevels ??= {}
  s.upgradeLevels[track.id] = item.stage
  if (!s.upgrades.includes(track.id)) s.upgrades.push(track.id)
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
  s.remoteRechargeRemaining = 0
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
  s.credits = 0
  s.checkpoint = 'haven'
  settleHaven(s)
  s.campaign.deaths++
  s.position = checkpointPosition(s)
  s.shields = maxShields(s)
  s.blasterCharges = s.blasterInstalled ? BLASTER_CAPACITY : 0
  rechargeRadiation(s)
  s.remoteRechargeRemaining = 0
  return lost
}
export interface ExpeditionRuntime {
  elapsed: number
  radio?: { id: string; time: number }
  radioQueue?: string[]
  havenImpact?: number
  havenImpactCooldown?: number
  recovery?: HavenRecovery
  recoveryCues?: RecoveryCue[]
  grappleHint?: string
  connectedTerminal?: string
  grappleLesson?: { remaining: number; cell: boolean }
  surveyIn?: number
  radiation: RadiationFeedback
  recharging: boolean
  rechargeProgress: number
  teleport?: { from: Vector2; time: number }
  gateCharge: Record<string, number>
  socketCharge: Record<string, number>
  objects: Record<string, FloatingBody>
  impactSpeed: number
  towing?: string
  docking?: { id: string; phase: 'in' | 'out'; time: number; from: Vector2; to: Vector2; angle: number; targetAngle: number; finish: boolean }
  message: string; messageTime: number; blasterCooldown: number
}
export const freshRuntime = (): ExpeditionRuntime => ({ elapsed: 0, radiation: freshRadiationFeedback(), recharging: false, rechargeProgress: 0, gateCharge: {}, socketCharge: {}, objects: {}, impactSpeed: 0, message: '', messageTime: 0, blasterCooldown: 0 })
export function powerCellSpawns(s: Expedition) {
  const used = new Set(Object.values(s.power)), map = expeditionMap(s)
  return SOCKETS.filter(socket => !used.has(socket.id)).map(socket => {
    const saved = s.cargo?.[socket.id]
    const restored = saved && isInsideCavern(saved.pos, 20, map) ? saved : undefined
    // Older untouched cells stood still below a dispenser. Preserve their
    // saved location, but let them start drifting like other loose cargo.
    const stationaryLegacyCell = restored && !restored.tethered && Math.hypot(restored.vel.x, restored.vel.y) < 0.0001 &&
      Math.hypot(restored.pos.x - socket.source.x, restored.pos.y - socket.source.y - 48) < 0.01
    return {
      sourceId: socket.id,
      pos: { ...(restored?.pos ?? socket.source) },
      vel: restored && !stationaryLegacyCell ? { ...restored.vel } : initialCargoVelocity(socket.source),
      tethered: !!restored?.tethered,
    }
  })
}
export const looseObjects = (s: Expedition) => [
  ...PICKUPS.filter(item => !s.upgrades.includes(item.id)).map(item => ({ ...item, radius: 23, mass: 0.8, kind: item.id, available: true })),
  ...CACHES.filter(item => !s.caches.includes(item.id)).map(item => ({ ...item, radius: 22, mass: 1.4, kind: 'cache', available: true })),
  ...(!s.core ? [{ id: 'core', pos: CORE_POSITION, radius: 27, mass: 2, kind: 'core', available: coreReleased(s) }] : []),
]
export const objectBody = (rt: ExpeditionRuntime, id: string, position: Vector2): FloatingBody => {
  const radius = id === 'core' ? 27 : CACHES.some(c => c.id === id) ? 22 : 23
  const body = rt.objects[id] ??= { pos: { ...position }, vel: initialCargoVelocity(position), radius, cargoId: id, capture: 0 }
  // Live development updates may retain bodies created by the older collector.
  body.radius = radius; body.mass = id === 'core' ? 1.8 : 0.65; body.cargoId = id
  // A development hot reload can retain the old archive body without parsing a save.
  if (id==='radiation' && !body.retrieving && untouchedArchiveModule(body)) {
    body.pos={...position}; body.vel=initialCargoVelocity(position)
  }
  if (![body.pos.x, body.pos.y, body.vel.x, body.vel.y].every(Number.isFinite)) {
    body.pos = { ...position }; body.vel = { x: 0, y: 0 }; body.capture = 0
  }
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
  const events:string[]=[],pose=havenPose(s),items=looseObjects(s)
  cargoBodies(s,rt)
  const cancel=()=>{
    if(rt.recovery) {
      const body=rt.objects[rt.recovery.id]
      if(body) { delete body.retrieving; body.capture=0; body.vel={x:0,y:0} }
    }
    delete rt.recovery
  }
  if(!havenReady(s)) { cancel(); return events }
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
    if(upgrade) { s.upgrades.push(upgrade.id); if(upgrade.id==='radiation') rechargeRadiation(s); events.push(`${upgrade.label} installed`) }
    else if(cache) { s.caches.push(cache.id); s.banked+=cache.value; events.push(`Salvage +${cache.value} banked`) }
    else { s.core=true; events.push('Station core secured') }
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
  return true
}
export function openGate(s: Expedition, id: string): boolean {
  if (s.gates.includes(id)) return false
  s.gates.push(id)
  return true
}
export function blastGate(s: Expedition, pos: Vector2, radius = BLASTER_BLAST_RADIUS): boolean {
  let opened = false
  const map = expeditionMap(s)
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
  const terminal = !args.aboard && harpoon.state === 'attached' && harpoon.rock.terminalId &&
    TERMINALS.includes(harpoon.rock) && terminalVisible(ship.pos,harpoon.rock,expeditionMap(s)) ? harpoon.rock : undefined
  rt.radioQueue.push(...discoverCampaign(s, room?.id, terminal?.terminalId).filter(id=>id!==terminal?.terminalId))
  if (terminal && rt.connectedTerminal !== terminal.terminalId) {
    s.campaign.terminalLinked = true
    delete rt.grappleLesson
    rt.radio = { id:terminal.terminalId!,time:16 }
    rt.radioQueue = rt.radioQueue.filter(id=>id!==terminal.terminalId)
  }
  rt.connectedTerminal = terminal?.terminalId
  stepGrappleGuide(s,rt,ship,harpoon,[...rocks,...cargoBodies(s,rt).filter(b=>b.cargoId!=='core'||coreReleased(s))],expeditionMap(s),dt,args.aboard)
  if (rt.radio && rt.radio.id !== rt.connectedTerminal && !rt.grappleHint && !args.aboard) { rt.radio.time -= dt; if (rt.radio.time <= 0) delete rt.radio }
  if (!rt.radio && rt.radioQueue.length) rt.radio = { id:rt.radioQueue.shift()!,time:16 }
  if (harpoon.state === 'attached' && !harpoon.rock.anchored) harpoon.rock.tethered = true
  const map = expeditionMap(s)
  const active = (body: {pos:Vector2}) => near(body.pos,ship.pos,1500) || near(body.pos,havenPosition(s),450)
  const cargo = cargoBodies(s,rt).filter(active)
  for (const body of cargo) driftCargo(body,dt)
  events.push(...stepCargoRecovery(s,rt,dt))
  resolveWorldContacts([...rocks.filter(active),...cargo.filter(b=>!(rt.recovery?.id===b.cargoId&&rt.recovery.secured)),...(args.extraBodies ?? []).filter(active),...(args.aboard ? [] : [ship])],map,contact=>{
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
  return events
}
export function interaction(s: Expedition, body: Ship): { kind: 'dock' | 'finish' | 'recall'; id: string; label: string; ready?: boolean } | null {
  const ship = body.pos
  if (havenReady(s) && near(ship, havenPosition(s), 90)) {
      const status = dockingReadiness(body, havenPosition(s))
      const hint = status === 'ready' ? 'Dock · E' : 'Haven'
      if (s.core && !s.complete) return { kind: 'finish', id: 'haven', label: status === 'ready' ? 'Connect awakening bus · E' : hint, ready: status === 'ready' }
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
