import { RECORDS } from './campaign.ts'
import type { TetherBody, Vector2 } from './types'
import type { CavernMap } from './worldGeometry'
import { raycastCavern } from './worldGeometry.ts'

export const TERMINAL_OUTLINE = [[-17,-30],[17,-30],[24,-23],[24,23],[17,30],[-17,30],[-24,23],[-24,-23]] as const
// Stable, anchored tether targets. They are fixtures, never cargo or ore.
export const TERMINALS: TetherBody[] = RECORDS.filter(record => record.pos).map(record => ({
  pos: { ...record.pos! }, vel: { x:0, y:0 }, radius:40, anchored:true, terminalId:record.id,
}))
export const TERMINAL_HOUSINGS = TERMINALS.map(body => TERMINAL_OUTLINE.map(([x,y]) => ({ x:body.pos.x+x,y:body.pos.y+y })))

export function terminalVisible(from: Vector2, body: TetherBody, map: CavernMap) {
  const dx=body.pos.x-from.x,dy=body.pos.y-from.y,distance=Math.hypot(dx,dy)
  // A ray may reach the terminal's own solid housing, but not an intervening wall.
  return raycastCavern(from,{x:dx,y:dy},distance,map) >= distance-body.radius
}
