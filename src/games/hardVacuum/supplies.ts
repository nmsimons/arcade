import type { Expedition } from './expedition'
import { impactShieldCapacity } from './upgrades.ts'
import { BLASTER_CAPACITY } from './blaster.ts'
import { RADIATION_CAPACITY, rechargeRadiation } from './radiation.ts'
export const needsRecharge = (s: Expedition) => s.shields < impactShieldCapacity(s) || (s.blasterInstalled && s.blasterCharges < BLASTER_CAPACITY) ||
  (s.upgrades.includes('radiation') && s.radiationCharge < RADIATION_CAPACITY)

/** Haven restores every system, including an installed radiation shield. */
export function restoreShipSystems(s: Expedition): boolean {
  const changed = needsRecharge(s)
  s.shields = impactShieldCapacity(s)
  s.blasterCharges = s.blasterInstalled ? BLASTER_CAPACITY : 0
  rechargeRadiation(s)
  return changed
}
