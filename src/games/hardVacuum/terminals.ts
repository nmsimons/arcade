import { RECORDS } from './campaign.ts'
import type { TetherBody, Vector2 } from './types'
import type { CavernMap } from './worldGeometry'
import { raycastCavern } from './worldGeometry.ts'

export const TERMINAL_OUTLINE = [[-17,-30],[17,-30],[24,-23],[24,23],[17,30],[-17,30],[-24,23],[-24,-23]] as const
// Flush floor ports: stable tether targets, but never physical obstacles or cargo.
export const TERMINALS: TetherBody[] = RECORDS.filter(record => record.pos).map(record => identifyBody({
  pos: { ...record.pos! }, vel: { x:0, y:0 }, radius:40, anchored:true, terminalId:record.id,
}, { type: 'terminal', id: record.id }))
export function terminalVisible(from: Vector2, body: TetherBody, map: CavernMap) {
  const dx=body.pos.x-from.x,dy=body.pos.y-from.y,distance=Math.hypot(dx,dy)
  // The flush socket has no housing to ignore; intervening walls still block it.
  return raycastCavern(from,{x:dx,y:dy},distance,map) >= distance
}
import { identifyBody } from './bodyDefinitions.ts'
