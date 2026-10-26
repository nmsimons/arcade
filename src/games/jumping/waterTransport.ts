import type { GravityField } from './gravity.ts'
import { clippedPolygonArea, playerSwimStrength, playerWaterHull } from './gravity.ts'
import { moveBody } from './geometry.ts'
import type { Player } from './model.ts'
import { playerCollisionOutline, playerContactBody, translatePlayer } from './playerContacts.ts'
import type { ContactWorld } from './playerContacts.ts'
import { playerTurnAngle } from './ropeGravity.ts'
import type { WaterLevels } from './waterLevel.ts'

/** Buoyancy settles motion relative to the pool. Carry its displaced body with
 * the rising waterline first, so damping cannot leave a surface swimmer behind. */
export function carryWithRisingWater(player: Player, water: WaterLevels, field: GravityField, world: ContactWorld) {
  if (!water.pools.some(pool => pool.rise > 0) || player.grounded || player.hang || player.mantle || player.climbing
    || player.jumpLift || player.waterJump || !playerSwimStrength(field, player)) return
  const hull = playerWaterHull(player)
  let area = 0, rise = 0
  for (const pool of water.pools) {
    const index = water.plates.indexOf(pool.region)
    if (!(field.mask & 1 << index)) continue
    const bottom = pool.definition.y + pool.definition.h
    const wet = clippedPolygonArea(hull, pool.region.x, pool.previousY, pool.region.x + pool.region.w, bottom)
    area += wet; rise += wet * pool.rise
  }
  if (!area || !rise) return
  const body = playerContactBody(player, true)
  const safe = moveBody([body.x, body.y], [body.x, body.y - rise / area], world.platforms,
    body.height, player.inverted ? -1 : 1, playerTurnAngle(player), playerCollisionOutline(player, world, body))
  const dx = safe.x - body.x, dy = safe.y - body.y
  translatePlayer(player, dx, dy)
  // Quiet floating may anchor the camera to the real bob; carry that anchor too.
  if (player.waterCamera) player.waterCamera.y += dy
}
