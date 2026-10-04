import type { NamedObject } from './objectNames.ts'
import type { PowerMode, SwitchSettings } from './switchPower.ts'
import type { Player, Platform } from './model.ts'
import { bodyIntersects } from './geometry.ts'
import { playerContactBody } from './playerContacts.ts'
import { playerTurnAngle } from './ropeGravity.ts'
import { disablePlatformLedges } from './terrainLedges.ts'

export const MAX_FORCE_FIELDS = 40
export const FORCE_FIELD_THICKNESS = 12
export const FORCE_FIELD_MIN_LENGTH = 40
/** The entire thin rectangle blocks the player, including the two emitters. */
export interface ForceField extends NamedObject, SwitchSettings {
  id: string; x: number; y: number; w: number; h: number
  orientation: 'horizontal' | 'vertical'
  power?: PowerMode
}
export interface ForceFieldState { definition: ForceField; platform: Platform; active: boolean; pending: boolean }
export function createForceField(definition: ForceField): ForceFieldState {
  const platform = { x: definition.x, y: definition.y, w: definition.w, h: definition.h }
  // A beam has no physical lip to grab. Standing, jumping and wall contact
  // still use the ordinary swept player controller.
  disablePlatformLedges(platform)
  return { definition, platform, active: false, pending: false }
}
export function updateForceFields(fields: readonly ForceFieldState[], player: Player, states: ReadonlyMap<string, boolean>, powered: boolean) {
  for (const field of fields) {
    const enabled = powered && (field.definition.power !== 'switched' || !!states.get(field.definition.id))
    if (!enabled) { field.active = false; field.pending = false; continue }
    if (field.active) continue
    const body = playerContactBody(player)
    field.pending = bodyIntersects(body.x, body.y, field.platform, body.height, player.inverted ? -1 : 1, playerTurnAngle(player))
    field.active = !field.pending
  }
}
export const forceFieldPlatforms = (fields: readonly ForceFieldState[]) => fields.filter(field => field.active).map(field => field.platform)
