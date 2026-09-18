import type { Expedition } from './expedition'
import { upgradeValue } from './upgrades.ts'
import { BLASTER_CAPACITY } from './blaster.ts'
import { RADIATION_CAPACITY, rechargeRadiation } from './radiation.ts'
import { SHIELD_REPAIR_TIME } from './tuning.ts'

export const RECHARGE_PACK_COST = 500
export const RECHARGE_PACK_LIMIT = 3
export const TELEPORTER_COST = 3000
export type SupplyPurchase = 'recharge' | 'teleporter'
export const freshSupplies = () => ({ rechargePacks: 0, teleporterInstalled: false, remoteRechargeRemaining: 0 })

export function supplyOffers(s: Expedition) {
  return [
    { slot: 'recharge', id: 'recharge' as SupplyPurchase, name: 'Remote recharge', cost: RECHARGE_PACK_COST, full: s.rechargePacks >= RECHARGE_PACK_LIMIT,
      detail: `R · Shields + blaster · Single use · ${s.rechargePacks}/${RECHARGE_PACK_LIMIT} carried` },
    { slot: 'teleporter', id: 'teleporter' as SupplyPurchase, name: 'Haven teleporter', cost: TELEPORTER_COST, full: s.teleporterInstalled,
      detail: 'T · Return to Haven and bank credits · Permanent unlock · Unlimited use' },
  ]
}
export function purchaseSupply(s: Expedition, id: SupplyPurchase): boolean {
  const offer = supplyOffers(s).find(item => item.id === id)
  if (!offer || offer.full || s.banked < offer.cost) return false
  s.banked -= offer.cost
  if (id === 'recharge') s.rechargePacks++
  else if (id === 'teleporter') s.teleporterInstalled = true
  return true
}
export const needsRecharge = (s: Expedition) => s.shields < upgradeValue(s, 'hull') || (s.blasterInstalled && s.blasterCharges < BLASTER_CAPACITY) ||
  (s.upgrades.includes('radiation') && s.radiationCharge < RADIATION_CAPACITY)
export const needsRemoteRecharge = (s: Expedition) => s.shields < upgradeValue(s, 'hull') || (s.blasterInstalled && s.blasterCharges < BLASTER_CAPACITY)

/** Haven restores every system, including an installed radiation shield. */
export function restoreShipSystems(s: Expedition): boolean {
  const changed = needsRecharge(s)
  s.shields = upgradeValue(s, 'hull')
  s.blasterCharges = s.blasterInstalled ? BLASTER_CAPACITY : 0
  rechargeRadiation(s)
  return changed
}
export function activateRemoteRecharge(s: Expedition): boolean {
  if (s.rechargePacks <= 0 || s.remoteRechargeRemaining > 0 || !needsRemoteRecharge(s)) return false
  s.rechargePacks--
  s.remoteRechargeRemaining = SHIELD_REPAIR_TIME
  return true
}
export function stepRemoteRecharge(s: Expedition, dt: number): boolean {
  if (s.remoteRechargeRemaining <= 0) return false
  s.remoteRechargeRemaining = Math.max(0, s.remoteRechargeRemaining - dt)
  if (s.remoteRechargeRemaining > 1e-9) return false
  s.remoteRechargeRemaining = 0
  s.shields = upgradeValue(s, 'hull')
  s.blasterCharges = s.blasterInstalled ? BLASTER_CAPACITY : 0
  return true
}
