import { upgradeValue } from './upgrades.ts'
import type { UpgradeState } from './upgrades'
import type { TetherBody } from './types'

export interface LaserContact { target?: TetherBody; elapsedMs: number }
export const laserImpactMs = (state: UpgradeState) => upgradeValue(state, 'focus')

/** Contact must remain on this body; empty space and other targets cannot pre-charge a hit. */
export function stepLaserContact(contact: LaserContact, target: TetherBody | undefined, dt: number, impactMs: number): boolean {
  if (contact.target !== target) { contact.target = target; contact.elapsedMs = 0 }
  if (!target) { contact.elapsedMs = 0; return false }
  contact.elapsedMs += dt * 1000
  target.laserGlow = Math.max(target.laserGlow ?? 0, Math.min(1, contact.elapsedMs / impactMs))
  if (contact.elapsedMs + 1e-7 < impactMs) return false
  contact.elapsedMs = 0
  return true
}
