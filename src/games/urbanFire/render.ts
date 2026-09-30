import { JEEP_MAX_HEALTH, viewportScale } from './types.ts'
import { SCENERY_MARGIN } from './perimeter.ts'
import { drawWarAtmosphere } from './warDamage.ts'
import { drawCivilianVehicles } from './civilianModels.ts'
import type { CivilianVehicle } from './civilianVehicles'
import { drawArmorUpgrade, drawRepairKit } from './pickupModel.ts'
import { drawExplosion, drawImpactDebris, drawProjectile } from './combatEffects.ts'
import { drawTankArrival, drawSupplyArrivalGround, drawSupplyCargo, drawSupplyCanopy, drawTankArrivalGround, drawTankCanopy } from './reinforcementRender.ts'
import { drawSkidMarks } from './tireEffects.ts'
export { drawCity } from './cityRender.ts'
import { drawJeepModel, drawTankModel, drawHelicopterModel, drawVehicleDamage, drawVehicleShadow } from './vehicleModels.ts'
import { dropInView, inView } from './spatial.ts'
import { MISSION_WAVES } from './mission.ts'
import type { Mission } from './mission'
import type { VehicleVisuals } from './appearance'
import type { ArmorUpgrade, Bullet, Debris, Helicopter, Jeep, RepairKit, Tank } from './types'

export const INK = '#080d10'
const PLAYER = '#a6d7ce', ENEMY = '#d3917d', ARMOR = '#b7c8dc'
export function drawJeep(ctx: CanvasRenderingContext2D, jeep: Jeep, visuals: VehicleVisuals,shadow=true) {
  if (jeep.state !== 'active') { drawExplosion(ctx, jeep.pos, jeep.explodeTime,1500); return }
  drawJeepModel(ctx, jeep, visuals,shadow)
}
export function drawTank(ctx: CanvasRenderingContext2D, tank: Tank, visuals: VehicleVisuals,shadow=true) {
  if(tank.state==='incoming'){if(shadow)drawTankArrival(ctx,tank,visuals);else drawTankModel(ctx,tank,visuals,false);return}
  if (tank.state !== 'active') { drawExplosion(ctx, tank.pos, tank.explodeTime); return }
  drawTankModel(ctx, tank, visuals,shadow)
}
export function drawHelicopter(ctx: CanvasRenderingContext2D, heli: Helicopter, visuals: VehicleVisuals,shadow=true) {
  if (heli.state === 'exploding') { drawExplosion(ctx, heli.pos, heli.explodeTime); return }
  drawHelicopterModel(ctx, heli, visuals,shadow)
}

type Scene = { jeep: Jeep; tanks: Tank[]; helicopters: Helicopter[]; bullets: Bullet[]; debris: Debris[]; kits: RepairKit[]; armor: ArmorUpgrade[]; civilianVehicles: CivilianVehicle[] }
export function drawBattle(ctx: CanvasRenderingContext2D, city: HTMLCanvasElement, scene: Scene, width: number, height: number, score: number, wave: number, visuals: VehicleVisuals,mission?:Mission) {
  const { jeep, tanks, helicopters, bullets, debris, kits, armor } = scene
  const scale = viewportScale(width, height)
  const view={left:jeep.pos.x-width/scale/2,right:jeep.pos.x+width/scale/2,
    top:jeep.pos.y-height/scale/2,bottom:jeep.pos.y+height/scale/2}
  const visibleTanks=tanks.filter(t=>dropInView(view,t.pos,t.arrival?.height??0,120))
  const visibleHelis=helicopters.filter(h=>inView(view,h.pos,80))
  const supplies=[...kits.map(item=>({item,kind:'health' as const})),...armor.map(item=>({item,kind:'armor' as const}))]
    .filter(({item})=>dropInView(view,item.pos,item.arrival?.height??0,70))
  ctx.fillStyle = INK; ctx.fillRect(0, 0, width, height)
  ctx.save(); ctx.translate(width / 2, height / 2); ctx.scale(scale, scale); ctx.translate(-jeep.pos.x, -jeep.pos.y)
  ctx.drawImage(city, -SCENERY_MARGIN, -SCENERY_MARGIN)
  drawSkidMarks(ctx,visuals.tires)
  drawWarAtmosphere(ctx,visuals.time)
  for(const tank of visibleTanks){if(tank.state==='incoming')drawTankArrivalGround(ctx,tank);drawVehicleShadow(ctx,tank,'tank')}
  for(const heli of visibleHelis)drawVehicleShadow(ctx,heli,'helicopter')
  drawVehicleShadow(ctx,jeep,'jeep')
  for(const {item} of supplies)if(item.arrival)drawSupplyArrivalGround(ctx,item)
  drawCivilianVehicles(ctx,scene.civilianVehicles,view,scale)
  for(const {item,kind} of supplies){
    if(item.arrival){if(item.arrival.height===0)drawSupplyCargo(ctx,item,kind)}
    else if(kind==='health')drawRepairKit(ctx,item as RepairKit);else drawArmorUpgrade(ctx,item)
  }
  for(const tank of visibleTanks)if(!tank.arrival||tank.arrival.height===0)drawTank(ctx,tank,visuals,false)
  drawJeep(ctx,jeep,visuals,false)
  drawVehicleDamage(ctx, visuals)
  for(const tank of visibleTanks)if(tank.state==='incoming'&&(tank.arrival?.height??0)>0)drawTank(ctx,tank,visuals,false)
  for(const {item,kind} of supplies)if((item.arrival?.height??0)>0)drawSupplyCargo(ctx,item,kind)
  for(const heli of visibleHelis)drawHelicopter(ctx,heli,visuals,false)
  for(const bullet of bullets)if(inView(view,bullet.pos,20))drawProjectile(ctx,bullet)
  drawImpactDebris(ctx,debris.filter(d=>inView(view,d.pos,80)))
  // Canopies and lines remain overhead even while grounded cargo settles.
  for(const tank of visibleTanks)if(tank.state==='incoming')drawTankCanopy(ctx,tank)
  for(const {item} of supplies)if(item.arrival)drawSupplyCanopy(ctx,item)
  ctx.restore()
  // HUD is drawn in screen coordinates and never drifts with the camera.
  ctx.save(); ctx.font = '11px monospace'; ctx.textBaseline = 'top'; ctx.fillStyle = '#b8c9c0'
  ctx.fillText('URBAN FIRE / OPERATIONS', 20, 18)
  ctx.fillStyle = '#81948f'; ctx.fillText(`WAVE ${String(wave).padStart(2, '0')} / ${MISSION_WAVES}   ${String(score).padStart(6, '0')} PTS`, 20, 36)
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
  if(mission?.phase==='resupply'){
    ctx.textAlign='center';ctx.fillStyle='#d8ddbc';ctx.font='bold 16px monospace'
    ctx.fillText(`WAVE ${wave} SECURED`,width/2,76)
    ctx.font='11px monospace';ctx.fillStyle='#b8c9c0'
    ctx.fillText(`RESUPPLY · NEXT WAVE IN ${Math.ceil(mission.remaining)}s`,width/2,100)
  }else if(wave===MISSION_WAVES){
    ctx.textAlign='center';ctx.fillStyle='#d8ddbc';ctx.font='bold 11px monospace';ctx.fillText('FINAL ASSAULT',width/2,76)
  }
  ctx.restore()
}
