import type { Expedition } from './expedition'
import type { Campaign } from './campaign'
import type { Vector2 } from './types'
import { SECTORS, GATES, SOCKETS, PICKUPS, CACHES, CORE_POSITION } from './stationDefinitions.ts'
import { BERTHS, CAMPAIGN_SOCKETS } from './campaignWorld.ts'
import { freshCampaign, RECORDS, havenPosition } from './campaign.ts'
import { expeditionMap } from './expedition.ts'
import { isInsideCavern } from './worldGeometry.ts'
import { migrateSurvey, SURVEY_LIMIT } from './survey.ts'
import { SHOP, UPGRADE_COSTS, blasterCapacity, upgradeValue } from './upgrades.ts'
import { RADIATION_CAPACITY } from './radiation.ts'
import { SHIELD_REPAIR_TIME } from './tuning.ts'
import { BOT_STATIONS } from './stationBots.ts'
import { PROGRESSION_IDS } from './stationIds.ts'
import { initialCargoVelocity } from './expeditionPhysics.ts'

export const SAVE_SCHEMA_VERSION = 7
// Historical prices/capacities belong to migration, not the live upgrade shop.
const RETIRED_RADIATION_COSTS = [6000, 12000, 24000]
const RETIRED_RADIATION_CAPACITIES = [100, 150, 200, 250]
const untouchedArchiveModule = (body: {pos:Vector2;tethered?:boolean}) => !body.tethered && body.pos.x>=1100 && body.pos.x<=1900 && body.pos.y>=150 && body.pos.y<=650

export function parseExpedition(raw: string | null): Expedition | null {
  try {
    const s = JSON.parse(raw ?? 'null')
    const hadAccess = Array.isArray(s?.upgrades) && s.upgrades.some((id: string) => id === 'access' || id === 'cutter')
    function migrateLegacyNames() {
    if (Array.isArray(s?.upgrades)) s.upgrades = [...new Set(s.upgrades.filter((id: string) => id !== 'access' && id !== 'cutter').map((id: string) => (({ thermal: 'radiation', drive: 'focus' } as Record<string, string>)[id] ?? id)))]
    // Retire the six removed formations without invalidating existing saves.
    if (Array.isArray(s?.gates)) s.gates = s.gates.filter((id: unknown) => typeof id !== 'string' || !/^crag-[0-5]$/.test(id))
    }

    function validateInventory() {
    if (!s || ![1, 2, 3, 4, 5, 6, SAVE_SCHEMA_VERSION].includes(s.version) || (s.finaleVersion!==undefined && s.finaleVersion!==2) || !Number.isFinite(s.credits) || s.credits < 0 || !Number.isFinite(s.banked) || s.banked < 0 ||
      !Array.isArray(s.upgrades) || !s.upgrades.every((id: unknown) => (id === 'focus2' || id === 'radiation' || (s.version < 4 && id === 'radiationReserve') || SHOP.some(p => p.id === id))) ||
      !Array.isArray(s.gates) || !s.gates.every((id: unknown) => id === 'heart' || id === 'ignition-ready' || id === 'thermal' || GATES.some(g => g.id === id)) ||
      !Array.isArray(s.caches) || !s.caches.every((id: unknown) => CACHES.some(c => c.id === id)) ||
      !Array.isArray(s.visited) || !s.visited.every((id: unknown) => SECTORS.some(r => r.id === id)) ||
      !['haven', 'foundry', 'reactor'].includes(s.checkpoint) || typeof s.core !== 'boolean' || typeof s.complete !== 'boolean' ||
      !s.position || !Number.isFinite(s.position.x) || !Number.isFinite(s.position.y) ||
      !Number.isInteger(s.shields) || s.shields < 0 || s.shields > 8 ||
      (s.version >= 5 && typeof s.impactShieldInstalled !== 'boolean') ||
      (s.blasterInstalled !== undefined && typeof s.blasterInstalled !== 'boolean') ||
      (s.blasterCharges !== undefined && (!Number.isInteger(s.blasterCharges) || s.blasterCharges < 0)) ||
      (s.radiationCharge !== undefined && (!Number.isFinite(s.radiationCharge) || s.radiationCharge < 0)) ||
      (s.radiationExposure !== undefined && (!Number.isFinite(s.radiationExposure) || s.radiationExposure < 0 || s.radiationExposure > 2))) return false
    s.upgradeLevels ??= {}
    if (s.surveyed === undefined) s.surveyed = []
    s.disabledBots ??= []
    if (!Array.isArray(s.disabledBots) || s.disabledBots.length > BOT_STATIONS.length || s.disabledBots.some((id: unknown) => !BOT_STATIONS.some(bot => bot.id === id))) return false
    if (!Array.isArray(s.surveyed) || s.surveyed.length > SURVEY_LIMIT || s.surveyed.some((id: unknown) => typeof id !== 'number' || !Number.isInteger(id) || id < 0 || id >= SURVEY_LIMIT)) return false
      return true
    }

    function migratePrototypeCampaign() {
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
    }

    function validateCampaign() {
    const c = s.campaign as Campaign
    const validPoint = (p: Vector2) => p && Number.isFinite(p.x) && Number.isFinite(p.y) && p.x >= 0 && p.x <= 9600 && p.y >= 0 && p.y <= 5100
    if (!c || c.version !== 1 || !BERTHS.some(b => b.id === c.berth) || !validPoint(c.haven) ||
      !Array.isArray(c.berths) || !c.berths.includes(c.berth) || c.berths.some(id => !BERTHS.some(b => b.id === id)) ||
      !Array.isArray(c.records) || c.records.some(id => !RECORDS.some(r => r.id === id)) ||
      !Number.isFinite(c.playedSeconds) || c.playedSeconds < 0 || !Number.isInteger(c.deaths) || c.deaths < 0) return false
    c.havenAngle ??= 0
    c.grappleLearned ??= Object.keys(s.power ?? {}).length > 0 || s.caches.length > 0
    c.terminalLinked ??= false
    if (!Number.isFinite(c.havenAngle) || typeof c.grappleLearned !== 'boolean' || typeof c.terminalLinked !== 'boolean') return false
    if (c.journey) {
      const j = c.journey
      j.speed ??= 0
      if (!Number.isFinite(j.speed) || j.speed < 0 || j.speed > 210) return false
      if (!c.berths.includes(j.destination) || !Array.isArray(j.points) || !j.points.length || j.points.length > 100 || !j.points.every(validPoint) || !Number.isInteger(j.index) || j.index < 0 || j.index > j.points.length || !['folding','transit','deploying'].includes(j.phase) || !Number.isFinite(j.progress) || j.progress < 0 || j.progress > 1 || typeof j.riding !== 'boolean') return false
    } else if (Math.hypot(c.haven.x-BERTHS.find(b => b.id === c.berth)!.pos.x,c.haven.y-BERTHS.find(b => b.id === c.berth)!.pos.y) > 1) return false
      return true
    }

    function validateEquipment() {
    if (s.teleporterInstalled === undefined) s.teleporterInstalled = false
    if (typeof s.teleporterInstalled !== 'boolean') return false
    if (s.version < 3) {
      if (s.rechargePacks === undefined) s.rechargePacks = 0
      if (s.remoteRechargeRemaining === undefined) s.remoteRechargeRemaining = 0
      if (!Number.isInteger(s.rechargePacks) || s.rechargePacks < 0 || s.rechargePacks > 3 ||
        !Number.isFinite(s.remoteRechargeRemaining) || s.remoteRechargeRemaining < 0 || s.remoteRechargeRemaining > SHIELD_REPAIR_TIME) return false
    } else if (s.rechargePacks !== undefined || s.remoteRechargeRemaining !== undefined) return false
    if (!s.upgradeLevels || typeof s.upgradeLevels !== 'object' || Array.isArray(s.upgradeLevels) ||
      Object.entries(s.upgradeLevels).some(([id, level]) => !(SHOP.some(item => item.id === id) || (s.version < 4 && id === 'radiationReserve')) || typeof level !== 'number' || !Number.isInteger(level) || level < 0 || level > UPGRADE_COSTS.length)) return false
    const reserveLevel = s.upgradeLevels.radiationReserve ?? 0
    if (s.version >= 5 && !s.impactShieldInstalled && (s.shields > 0 || s.upgrades.includes('hull') || (s.upgradeLevels.hull ?? 0) > 0)) return false
    if (!s.blasterInstalled && (s.upgrades.includes('magazine') || (s.upgradeLevels.magazine ?? 0) > 0)) return false
    if (s.blasterCharges !== undefined && s.blasterCharges > upgradeValue(s, 'magazine')) return false
    const capacity = s.version < 4 ? RETIRED_RADIATION_CAPACITIES[reserveLevel] : RADIATION_CAPACITY
    if (reserveLevel > 3 || (s.radiationCharge !== undefined && s.radiationCharge > capacity)) return false
      return true
    }

    function migratePurchases() {
    // Any previously purchased tether stage becomes the single double-length
    // upgrade. Retire charge inventory and refund an unused teleport charge.
    if (s.upgradeLevels.winch !== undefined) s.upgradeLevels.winch = s.upgradeLevels.winch > 0 ? 1 : 0
    if (s.teleportCharges !== undefined) {
      if (!Number.isInteger(s.teleportCharges) || s.teleportCharges < 0 || s.teleportCharges > 1 || (s.teleportCharges > 0 && !s.teleporterInstalled)) return false
      s.banked += s.teleportCharges * 750
      delete s.teleportCharges
    }
      return true
    }

    function validatePower() {
    s.power ??= Object.fromEntries(SOCKETS.filter(socket => s.gates.includes(socket.id)).map(socket => [socket.id, socket.id]))
    s.doors ??= {}
    if (!s.power || typeof s.power !== 'object' || Array.isArray(s.power) ||
      Object.entries(s.power).some(([socket, source]) => !SOCKETS.some(p => p.id === socket) || !SOCKETS.some(p => p.id === source)) ||
      new Set(Object.values(s.power)).size !== Object.values(s.power).length ||
      !s.doors || typeof s.doors !== 'object' || Array.isArray(s.doors) ||
      Object.entries(s.doors).some(([id, progress]) => !GATES.some(g => g.id === id && g.kind === 'socket') || !s.gates.includes(id) || typeof progress !== 'number' || !Number.isFinite(progress) || progress < 0 || progress > 1)) return false
      return true
    }

    function migrateMedicalAccess() {
    if (hadAccess || s.power.relay) {
      s.power.relay ??= 'relay'
      for (const id of ['archive', 'reactor', 'shortcut']) if (!s.gates.includes(id)) s.gates.push(id)
    }
    // Medical service access now opens with transfer power, before the ward
    // circuit. Preserve an already-open ward door in older expeditions.
    if (s.power['refuge-power'] && !s.gates.includes('medical-return')) s.gates.push('medical-return')
    if (s.gates.includes('ignition-ready') && !s.gates.includes('breach-return')) s.gates.push('breach-return')
    }

    function validateCargo() {
    s.botDoors ??= {}
    if (typeof s.botDoors !== 'object' || Array.isArray(s.botDoors) || Object.entries(s.botDoors).some(([id,progress])=>!BOT_STATIONS.some(bot=>bot.id===id && s.power[bot.power]) || typeof progress!=='number' || !Number.isFinite(progress) || progress<0 || progress>1)) return false
    if (s.cargo !== undefined) {
      if (!s.cargo || typeof s.cargo !== 'object' || Array.isArray(s.cargo)) return false
      const ids = [...PICKUPS.map(p => p.id), ...CACHES.map(c => c.id), ...SOCKETS.map(p => p.id), 'core', 'ore', 'access', 'cutter', 'thermal', 'drive']
      for (const [id, cargo] of Object.entries(s.cargo)) {
        const body = cargo as { pos?: Vector2; vel?: Vector2; tethered?: boolean }
        if (!ids.includes(id) || !body || !body.pos || !body.vel || ![body.pos.x, body.pos.y, body.vel.x, body.vel.y].every(Number.isFinite) || (body.tethered !== undefined && typeof body.tethered !== 'boolean')) return false
      }
    }
      return true
    }

    function migrateCargo() {
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
      // Dispenser-era cells gain drift once on migration, never on a v2 reload.
      for (const socket of SOCKETS) {
        const cargo = s.cargo[socket.id]
        if (cargo && !cargo.tethered && Math.hypot(cargo.vel.x,cargo.vel.y)<.0001 &&
          Math.hypot(cargo.pos.x-socket.source.x,cargo.pos.y-socket.source.y-48)<.01) cargo.vel=initialCargoVelocity(socket.source)
      }
    }
    }

    function migrateFinale() {
    if (s.finaleVersion===undefined) {
      // A core previously banked in Haven becomes towable beside that same
      // tender. Completed expeditions stay complete; moved cargo stays put.
      if (s.core && !s.complete) {
        s.core=false
        const base=havenPosition(s),map=expeditionMap(s)
        const pos=Array.from({length:16},(_,i)=>({x:base.x+Math.cos(i*Math.PI/8)*190,y:base.y+Math.sin(i*Math.PI/8)*190})).find(p=>isInsideCavern(p,32,map)) ?? CORE_POSITION
        ;(s.cargo ??= {}).core={pos:{...pos},vel:{x:0,y:0},tethered:true}
      }
      s.finaleVersion=2
    }
    }
    function migrateProgressionFlags() {
      s.flags = [...new Set(s.gates.filter((id: string) => PROGRESSION_IDS.some(flag => flag === id)))]
      s.gates = s.gates.filter((id: string) => GATES.some(g => g.id === id))
      s.version = 2
    }
    function retireRemoteRecharge() {
      // Unused packs are refunded once. A consumed/in-progress pack is canceled,
      // never completed on load. Previously installed equipment stays installed.
      s.banked += s.rechargePacks * 500
      delete s.rechargePacks
      delete s.remoteRechargeRemaining
      s.version = 3
    }
    function migrateFreightAndRadiation() {
      const level = s.upgradeLevels.radiationReserve ?? 0
      s.banked += RETIRED_RADIATION_COSTS.slice(0, level).reduce((sum, cost) => sum + cost, 0)
      delete s.upgradeLevels.radiationReserve
      s.upgrades = s.upgrades.filter((id: string) => id !== 'radiationReserve')
      if (s.radiationCharge !== undefined) s.radiationCharge = Math.min(s.radiationCharge, RADIATION_CAPACITY)
      // Keep previously opened doors and in-progress animations. A restored bus
      // gains its newly connected doors without stranding a player or their cargo.
      for (const id of ['freight-power', 'dispatch-power']) if (s.power[id]) {
        for (const gate of SOCKETS.find(socket => socket.id === id)!.gates) {
          if (!s.gates.includes(gate)) s.gates.push(gate)
        }
      }
      s.version = 4
    }
    function migrateImpactShield() {
      // All earlier ships had a built-in impact shield. Keep its ownership and
      // upgrades without refilling depleted charges or adding a duplicate pickup.
      s.impactShieldInstalled = true
      s.version = 5
    }
    function migrateWorksBlaster() {
      // Relocate unclaimed Freight-era modules once. Never take installed gear
      // or move a module that the player has already towed out of its old home.
      const body = s.cargo?.blaster
      if (!s.blasterInstalled && body && !body.tethered &&
        body.pos.x >= 6300 && body.pos.x <= 9400 && body.pos.y >= 70 && body.pos.y <= 1770) delete s.cargo.blaster
      s.version = 6
    }
    function migrateRescueShield() {
      // Only move the unclaimed opening module from its old Breach spawn area.
      // Installed shields and any previously towed module keep their progress.
      const body = s.cargo?.impact
      if (!s.impactShieldInstalled && body && !body.tethered &&
        body.pos.x >= 7440 && body.pos.x <= 8560 && body.pos.y >= 3140 && body.pos.y <= 3960) delete s.cargo.impact
      s.version = SAVE_SCHEMA_VERSION
    }
    function validateCurrent() {
      return s.finaleVersion === 2 && Array.isArray(s.flags) && s.flags.every((id: unknown) => PROGRESSION_IDS.some(flag => flag === id))
        && s.gates.every((id: unknown) => GATES.some(g => g.id === id))
        && (s.upgradeLevels.winch ?? 0) <= 1 && s.teleportCharges === undefined
        && (!s.cargo || Object.keys(s.cargo).every(id => id === 'core' || [...PICKUPS,...CACHES,...SOCKETS].some(item => item.id === id)))
    }
    // Version 1 accumulated historical subformats. The ordered stages below
    // migrate them exactly once, then advance through each newer schema in order.
    const legacy = s?.version === 1
    if (!legacy && s?.version !== 2 && s?.version !== 3 && s?.version !== 4 && s?.version !== 5 && s?.version !== 6 && s?.version !== SAVE_SCHEMA_VERSION) return null
    if (legacy) migrateLegacyNames()
    if (!validateInventory()) return null
    if (legacy) migratePrototypeCampaign()
    if (!validateCampaign() || !validateEquipment()) return null
    if (legacy && !migratePurchases()) return null
    if (!validatePower()) return null
    if (legacy) migrateMedicalAccess()
    if (!validateCargo()) return null
    if (legacy) { migrateCargo(); migrateFinale(); migrateProgressionFlags() }
    if (!validateCurrent()) return null
    if (s.version === 2) retireRemoteRecharge()
    if (s.version === 3) migrateFreightAndRadiation()
    if (s.version === 4) migrateImpactShield()
    if (s.version === 5) migrateWorksBlaster()
    if (s.version === 6) migrateRescueShield()
    // Migrate former outpost checkpoints without discarding earned progress.
    return { ...s, checkpoint: 'haven', blasterInstalled: s.blasterInstalled ?? false, blasterCharges: s.blasterInstalled ? s.blasterCharges ?? blasterCapacity(s) : 0, radiationCharge: s.radiationCharge ?? (s.upgrades.includes('radiation') ? RADIATION_CAPACITY : 0), radiationExposure: s.radiationExposure ?? 0 } as Expedition
  } catch { return null }
}
