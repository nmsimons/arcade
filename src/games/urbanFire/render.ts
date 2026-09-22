import { JEEP_MAX_HEALTH, viewportScale } from './types.ts'
import { SCENERY_MARGIN } from './perimeter.ts'
import { drawWarAtmosphere } from './warDamage.ts'
import { drawCivilianVehicles } from './civilianModels.ts'
import type { CivilianVehicle } from './civilianVehicles'
import { drawArmorUpgrade, drawRepairKit } from './pickupModel.ts'
import { drawExplosion, drawImpactDebris, drawProjectile } from './combatEffects.ts'
import { drawSupplyArrival, drawTankArrival } from './reinforcementRender.ts'
import { drawSkidMarks } from './tireEffects.ts'
export { drawCity } from './cityRender.ts'
import { drawJeepModel, drawTankModel, drawHelicopterModel, drawVehicleDamage } from './vehicleModels.ts'
import type { VehicleVisuals } from './appearance'
import type { ArmorUpgrade, Bullet, Debris, Helicopter, Jeep, RepairKit, Tank } from './types'

export const INK = '#080d10'
const PLAYER = '#a6d7ce', ENEMY = '#d3917d', ARMOR = '#b7c8dc'
export function drawJeep(ctx: CanvasRenderingContext2D, jeep: Jeep, visuals: VehicleVisuals) {
  if (jeep.state !== 'active') { drawExplosion(ctx, jeep.pos, jeep.explodeTime,1500); return }
  drawJeepModel(ctx, jeep, visuals)
}
export function drawTank(ctx: CanvasRenderingContext2D, tank: Tank, visuals: VehicleVisuals) {
  if(tank.state==='incoming'){drawTankArrival(ctx,tank,visuals);return}
  if (tank.state !== 'active') { drawExplosion(ctx, tank.pos, tank.explodeTime); return }
  drawTankModel(ctx, tank, visuals)
}
export function drawHelicopter(ctx: CanvasRenderingContext2D, heli: Helicopter, visuals: VehicleVisuals) {
  if (heli.state === 'exploding') { drawExplosion(ctx, heli.pos, heli.explodeTime); return }
  drawHelicopterModel(ctx, heli, visuals)
}

type Scene = { jeep: Jeep; tanks: Tank[]; helicopters: Helicopter[]; bullets: Bullet[]; debris: Debris[]; kits: RepairKit[]; armor: ArmorUpgrade[]; civilianVehicles: CivilianVehicle[] }
export function drawBattle(ctx: CanvasRenderingContext2D, city: HTMLCanvasElement, scene: Scene, width: number, height: number, score: number, wave: number, visuals: VehicleVisuals, fps?: number) {
  const { jeep, tanks, helicopters, bullets, debris, kits, armor } = scene
  const scale = viewportScale(width, height)
  ctx.fillStyle = INK; ctx.fillRect(0, 0, width, height)
  ctx.save(); ctx.translate(width / 2, height / 2); ctx.scale(scale, scale); ctx.translate(-jeep.pos.x, -jeep.pos.y)
  ctx.drawImage(city, -SCENERY_MARGIN, -SCENERY_MARGIN)
  drawSkidMarks(ctx,visuals.tires)
  drawWarAtmosphere(ctx,visuals.time)
  drawCivilianVehicles(ctx,scene.civilianVehicles)
  for (const kit of kits) {if(kit.arrival)drawSupplyArrival(ctx,kit,'health');else drawRepairKit(ctx,kit)}
  for (const upgrade of armor) {if(upgrade.arrival)drawSupplyArrival(ctx,upgrade,'armor');else drawArmorUpgrade(ctx,upgrade)}
  tanks.forEach(t => drawTank(ctx, t, visuals)); drawJeep(ctx, jeep, visuals); helicopters.forEach(h => drawHelicopter(ctx, h, visuals))
  drawVehicleDamage(ctx, visuals)
  for (const bullet of bullets) drawProjectile(ctx,bullet)
  drawImpactDebris(ctx,debris)
  ctx.restore()
  // HUD is drawn in screen coordinates and never drifts with the camera.
  ctx.save(); ctx.font = '11px monospace'; ctx.textBaseline = 'top'; ctx.fillStyle = '#b8c9c0'
  ctx.fillText('URBAN FIRE / OPERATIONS', 20, 18)
  ctx.fillStyle = '#81948f'; ctx.fillText(`WAVE ${String(wave).padStart(2, '0')}   ${String(score).padStart(6, '0')} PTS`, 20, 36)
  ctx.textAlign = 'right'; ctx.fillStyle = '#a8b9ac'; ctx.fillText(`ARMOR ${jeep.health}`, width - 20, 18)
  const slots=Math.min(12,Math.max(JEEP_MAX_HEALTH,jeep.health))
  for (let i = 0; i < slots; i++) {
    ctx.fillStyle = i < jeep.health ? jeep.health === 1 ? ENEMY : i>=JEEP_MAX_HEALTH ? ARMOR : PLAYER : '#25332f'
    ctx.fillRect(width - 20 - slots * 22 + i * 22, 37, 17, 5)
  }
  ctx.textAlign = 'left'
  ctx.fillStyle = '#81948f'; ctx.font = '10px monospace'
  const inbound=[...tanks,...helicopters].filter(e=>e.state==='incoming').length
  ctx.fillText(`${tanks.filter(t => t.state === 'active').length + helicopters.filter(h => h.state === 'active').length} HOSTILES${inbound?` · ${inbound} INBOUND`:''}`, 20, height - 40)
  ctx.fillText('P / MENU · PAUSE', 20, height - 24)
  ctx.textAlign = 'right'; ctx.fillText(`${fps ?? '—'} FPS`, width - 20, height - 24)
  ctx.restore()
}
