import { drawCity } from '../../games/urbanFire/cityRender'
import { createStaticCityWalls } from '../../games/urbanFire/battlefield'
import { ROADS } from '../../games/urbanFire/cityPlan'
import { createVehicleVisuals } from '../../games/urbanFire/appearance'
import { drawJeepModel, drawTankModel } from '../../games/urbanFire/vehicleModels'
import { JEEP_MAX_HEALTH } from '../../games/urbanFire/types'
import type { Jeep, Tank } from '../../games/urbanFire/types'

export function drawPreview(ctx: CanvasRenderingContext2D, width: number, height: number, compact: boolean) {
  const center = { x: ROADS.avenues[1], y: ROADS.streets[1] }
  ctx.save(); ctx.translate(width / 2, height / 2)
  const scale = width / (compact ? 340 : 275)
  ctx.scale(scale, scale); ctx.translate(-center.x, -center.y)
  drawCity(ctx, createStaticCityWalls())
  const visuals = createVehicleVisuals()
  const jeep: Jeep = { pos: { x: center.x - 46, y: center.y + 18 }, vel: { x: 0, y: 0 }, angle: -.28,
    health: JEEP_MAX_HEALTH, state: 'active', explodeTime: 0, wheelAngle: 0, hitFlash: 0 }
  const tank: Tank = { pos: { x: center.x + 55, y: center.y - 12 }, vel: { x: 0, y: 0 }, angle: Math.PI,
    turretAngle: Math.atan2(30, -101), health: 2, state: 'active', explodeTime: 0, shootCooldown: 0,
    trackOffset: 0, losTimeMs: 0, role: 0, recoil: 0, brain: { goal: null, path: [], replan: 0 } }
  drawTankModel(ctx, tank, visuals)
  drawJeepModel(ctx, jeep, visuals)
  ctx.restore()
}
