import type { Expedition } from './expedition'
import type { ModuleId } from './stationIds'
import { BLASTER_CAPACITY } from './blaster.ts'
import { rechargeRadiation } from './radiation.ts'
import { impactShieldCapacity } from './upgrades.ts'

export function moduleInstalled(state: Expedition, id: ModuleId): boolean {
  if (id === 'impact') return state.impactShieldInstalled
  if (id === 'blaster') return state.blasterInstalled
  if (id === 'teleporter') return state.teleporterInstalled
  return state.upgrades.includes('radiation')
}

/** Called when Haven seals a recovered module, never by the upgrade shop. */
export function installModule(state: Expedition, id: ModuleId): boolean {
  if (moduleInstalled(state, id)) return false
  if (id === 'impact') {
    state.impactShieldInstalled = true
    state.shields = impactShieldCapacity(state)
  } else if (id === 'blaster') {
    state.blasterInstalled = true
    state.blasterCharges = BLASTER_CAPACITY
  } else if (id === 'teleporter') state.teleporterInstalled = true
  else {
    state.upgrades.push('radiation')
    rechargeRadiation(state)
  }
  return true
}
