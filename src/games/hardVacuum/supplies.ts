import type { Expedition } from './expedition'
import { blasterCapacity, impactShieldCapacity } from './upgrades.ts'
import { RADIATION_CAPACITY, rechargeRadiation } from './radiation.ts'
export const needsRecharge = (s: Expedition) => s.shields < impactShieldCapacity(s) || s.blasterCharges < blasterCapacity(s) ||
  (s.upgrades.includes('radiation') && s.radiationCharge < RADIATION_CAPACITY)

/** Haven restores every system, including an installed radiation shield. */
export function restoreShipSystems(s: Expedition): boolean {
  const changed = needsRecharge(s)
  s.shields = impactShieldCapacity(s)
  s.blasterCharges = blasterCapacity(s)
  rechargeRadiation(s)
  return changed
}
