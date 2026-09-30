import { bevel, drawModel } from '../model3d.ts'
import type { Outline, Part, V3 } from '../model3d'
import { rotZ } from '../hardVacuum/math.ts'
import { projectVehicle, vehicleDamage, vehiclePose } from './appearance.ts'
import type { Vehicle, VehicleKind, VehiclePose, VehicleVisuals } from './appearance'
import type { Helicopter, Jeep, Tank } from './types'
import { drawDamageParticles, drawDamageSmoke, drawMuzzleBurst } from './combatEffects.ts'
import { TANK_DROP } from './reinforcements.ts'

const SILVER = '#c9cfb6', COPPER = '#c7b3a8', BRASS = '#cec3a3', GLASS = '#6fadb0'
const shell = (lower: Outline, upper: Outline, color: string, bottom = 3, top = -3) => bevel(lower, upper, color, bottom, top)
const plate = (x: number, y: number, w: number, h: number, z: number, color: string, glow = false): Part => ({
  ...bevel([[x,y],[x+w,y],[x+w,y+h],[x,y+h]], [[x+.3,y+.3],[x+w-.3,y+.3],[x+w-.3,y+h-.3],[x+.3,y+h-.3]], color, z+.5, z, glow),
})
const JEEP_HULL = shell(
  [[-14,-6],[-12,-8],[11,-8],[14,-6],[14,6],[11,8],[-12,8],[-14,6]],
  [[-12.5,-5],[-11,-6.5],[10.5,-6.5],[12.5,-5],[12.5,5],[10.5,6.5],[-11,6.5],[-12.5,5]], SILVER, 2.5, -3.5)
const JEEP_HOOD = shell([[3,-6],[12,-6],[13,-4],[13,4],[12,6],[3,6]],
  [[3.5,-5.4],[11.5,-5.4],[12.3,-4],[12.3,4],[11.5,5.4],[3.5,5.4]], '#d5d8bd', -3.5, -4.5)
const JEEP_CAB = shell([[-9,-6.1],[.5,-6.1],[3,-4.8],[3,4.8],[.5,6.1],[-9,6.1]],
  [[-7.8,-5.3],[-.4,-5.3],[1,-4.3],[1,4.3],[-.4,5.3],[-7.8,5.3]], '#7e8d75', -3.5, -8)
const WINDSCREEN = shell([[.6,-5.9],[3.1,-4.7],[3.1,4.7],[.6,5.9]],
  [[-.1,-5.1],[1.2,-4.2],[1.2,4.2],[-.1,5.1]], GLASS, -4.3, -8.1)
const SPARE = shell([[-4,-1.5],[-2.7,-3.4],[2.7,-3.4],[4,-1.5],[4,1.5],[2.7,3.4],[-2.7,3.4],[-4,1.5]],
  [[-3.2,-1.2],[-2.1,-2.7],[2.1,-2.7],[3.2,-1.2],[3.2,1.2],[2.1,2.7],[-2.1,2.7],[-3.2,1.2]], '#3b443a', -2.5, -6.3)
const WHEEL = shell([[-5,-2],[-4,-3],[4,-3],[5,-2],[5,2],[4,3],[-4,3],[-5,2]],
  [[-4,-1.4],[-3.5,-2],[3.5,-2],[4,-1.4],[4,1.4],[3.5,2],[-3.5,2],[-4,1.4]], '#39413c', 3, -1)
const TANK_HULL = shell([[-18,-9],[10,-9],[17,-4],[17,4],[10,9],[-18,9]],
  [[-15,-6.5],[9,-6.5],[14,-3],[14,3],[9,6.5],[-15,6.5]], COPPER, 3, -4)
const TRACK = shell([[-20,-3.5],[-17,-5],[17,-5],[20,-3.5],[20,3.5],[17,5],[-17,5],[-20,3.5]],
  [[-18,-2.7],[-16,-4],[16,-4],[18,-2.7],[18,2.7],[16,4],[-16,4],[-18,2.7]], '#696d60', 3, -2)
const TURRET = shell([[-13,-4],[-9,-7],[5,-7],[10,-3],[10,3],[5,7],[-9,7],[-13,4]],
  [[-10,-2.5],[-8,-5],[4,-5],[7,-2],[7,2],[4,5],[-8,5],[-10,2.5]], COPPER, -4, -8)
const BARREL = shell([[6,-1.5],[24,-1.5],[27,-2.5],[29,-2],[29,2],[27,2.5],[24,1.5],[6,1.5]],
  [[7,-.8],[24,-.8],[27,-1.5],[28,-1.2],[28,1.2],[27,1.5],[24,.8],[7,.8]], '#acbdb1', -5, -7.5)
const HELI_HULL = shell([[-12,-4],[-6,-7],[5,-7],[13,-3],[15,0],[13,3],[5,7],[-6,7],[-12,4]],
  [[-10,-2.5],[-5,-5],[4,-5],[11,-2],[13,0],[11,2],[4,5],[-5,5],[-10,2.5]], BRASS, 3, -5)
const HELI_GLASS = { ...shell([[4,-5],[11,-2.5],[13,0],[11,2.5],[4,5]],
  [[5,-3.6],[10,-1.8],[11.5,0],[10,1.8],[5,3.6]], '#a8c5bb', -5, -7), glow: true }
const TAIL = shell([[-29,-1.5],[-10,-3],[-10,3],[-29,1.5]],
  [[-28,-.6],[-11,-1.8],[-11,1.8],[-28,.6]], BRASS, 2, -2)
const FIN = shell([[-29,-6],[-26,-6],[-23,0],[-26,6],[-29,6],[-27,0]],
  [[-28,-5],[-26.5,-5],[-24,0],[-26.5,5],[-28,5],[-26,0]], BRASS, -1, -3)
const ROTOR = shell([[1,-.8],[22,-1.5],[25,-.6],[25,.8],[4,1.2]],
  [[2,-.4],[22,-.9],[24,-.3],[24,.4],[4,.6]], '#c9d3bc', -10, -10.4)

function worn(color: string, damage: number) {
  return '#' + [1,3,5].map((offset, i) => Math.round(parseInt(color.slice(offset, offset+2),16) * (1-damage*.6) + [73,57,45][i]*damage*.6).toString(16).padStart(2,'0')).join('')
}
function armor(parts: Part[], damage: number): Part[] {
  return damage > 0 ? parts.map(part => part.glow ? part : { ...part, color: worn(part.color, damage) }) : parts
}
function tread(part: Part, travel: number, length: number, width: number): Part {
  const markings = []
  const phase = ((-travel % 4) + 4) % 4
  for (let x = -length/2 + phase; x < length/2 - .6; x += 4) {
    markings.push({ face: 1, color: part===WHEEL?'#5c6855':'#9caa92', verts: [[x,-width/2,-2.1],[x+.55,-width/2,-2.1],[x+.55,width/2,-2.1],[x,width/2,-2.1]] as V3[] })
  }
  // Markings belong to the top face so rolling hulls still occlude each tread.
  const z = part === WHEEL ? -1.01 : -2.01
  return { ...part, markings: markings.map(mark => ({ ...mark, verts: mark.verts.map(([x,y]): V3 => [x,y,z]) })) }
}
function scars(damage: number, z: number): Part[] {
  return [-1,1].slice(0, Math.ceil(damage*3)).map(side => ({
    ...shell([[-8,-.6],[-5,.1],[-6,1],[-3,2],[-6,1.7],[-7,.5]],
      [[-7.8,-.4],[-5.2,.1],[-6.2,1],[-3.2,1.9],[-5.9,1.5],[-6.8,.5]], '#a27250', z, z-.1),
    at: [0, side*4, 0], rotation: [0,0,side*.2],
  }))
}
function sensor(color: string, damage: number, time: number) {
  return damage > .3 && Math.sin(time*23)*Math.sin(time*7) > .9-damage*.8 ? '#655342' : color
}
function jeepParts(jeep: Jeep, pose: VehiclePose) {
  const damage = vehicleDamage(jeep, 'jeep')
  const wheels: Part[] = [-1,1].flatMap(side => [-7,7].map(x => ({
    ...tread(WHEEL, side < 0 ? pose.leftTravel : pose.rightTravel, 7, 3.4),
    at: [x,side*9,pose.suspension[(side<0?0:2)+(x>0?1:0)]] as V3, rotation: [0,0,x>0 ? pose.steer : 0] as V3,
  })))
  return [...armor([...wheels,JEEP_HULL,JEEP_HOOD,JEEP_CAB,
    {...SPARE,at:[-11.5,0,0]},plate(-12.7,-1.2,2.4,2.4,-6.4,'#a3ad92'),
    plate(1,-1.2,16-pose.recoil*1.5,2.4,-8.2,'#606e5d')],damage),
    WINDSCREEN,
    ...[-1,1].map(side => plate(11.7,side*4.5-.9,1.5,1.8,-4.6,'#e5dcc0')), ...scars(damage,-4.6)]
}
function tankParts(tank: Tank, pose: VehiclePose, time: number) {
  const damage = vehicleDamage(tank,'tank'), charging = tank.losTimeMs > 0 && tank.shootCooldown < 800
  const turret = tank.turretAngle-tank.angle
  const parts = armor([TANK_HULL,...[-1,1].map(side => ({
    ...tread(TRACK,side<0 ? pose.leftTravel : pose.rightTravel,32,7),
    at: [0,side*13,(pose.suspension[side<0?0:2]+pose.suspension[side<0?1:3])/2] as V3,
  })), ...scars(damage,-4.1)],damage)
  const recoil = tank.recoil*3
  const top: Part[] = [...armor([TURRET,{...BARREL,at:[-recoil,0,0]},plate(-7,-3,5,6,-8.1,'#9ba99a')],damage),
    plate(0,-4,3,1.5,-8.1,sensor(charging ? '#ff795f' : '#eaa183',damage,time),true),
    plate(27-recoil,-1,1,2,-7.6,charging ? '#ff9679' : '#85988a',charging)]
  return [...parts,...top.map(part => ({ ...part, at: rotZ(part.at,turret), rotation:[0,0,turret] as V3 }))]
}
function helicopterParts(heli: Helicopter) {
  const charging = heli.losTimeMs > 0 && heli.shootCooldown < 700
  return [TAIL,FIN,HELI_HULL,HELI_GLASS,
    ...[-1,1].flatMap(side => [plate(-10,side*10-1,19,2,4,'#aeb5a0'),plate(-5,side*7-2,1,5,2,'#aeb5a0')]),
    plate(10,-1,6-heli.recoil*2,2,-3,charging ? '#ff9679' : '#b3b19c',charging),
    plate(-2,-2,4,4,-10.7,'#d5dbc6'),
    ...[0,1,2,3].map(i => ({...ROTOR,rotation:[0,0,heli.rotorAngle+i*Math.PI/2] as V3})),
  ]
}
function trace(ctx: CanvasRenderingContext2D, points: V3[], angles: V3, closed = false) {
  ctx.beginPath()
  points.forEach((point,i) => { const p=projectVehicle(point,angles); if(i)ctx.lineTo(p.x,p.y);else ctx.moveTo(p.x,p.y) })
  if(closed)ctx.closePath()
}
function muzzleFlash(ctx: CanvasRenderingContext2D, point: V3, angle: number, strength: number, angles: V3) {
  const origin=projectVehicle(point,angles),forward=rotZ([1,0,0],angle)
  const end=projectVehicle([point[0]+forward[0],point[1]+forward[1],point[2]],angles)
  drawMuzzleBurst(ctx,origin,Math.atan2(end.y-origin.y,end.x-origin.x),strength)
}
export function drawVehicleShadow(ctx:CanvasRenderingContext2D,vehicle:Vehicle,kind:VehicleKind){
  const arrival=kind==='tank'?(vehicle as Tank).arrival:undefined
  if(vehicle.state!=='active'&&!(vehicle.state==='incoming'&&(kind==='helicopter'||(arrival&&arrival.elapsed>=0))))return
  const altitude=arrival?.height??0
  ctx.save();ctx.translate(vehicle.pos.x,vehicle.pos.y)
  if(arrival)ctx.globalAlpha*=Math.min(1,Math.max(0,arrival.elapsed/.22))
  ctx.translate(kind==='helicopter'?10:0,kind==='helicopter'?14:0)
  if(altitude>0){ctx.translate(altitude*.2,altitude*.15);ctx.scale(1+altitude*.0015,1+altitude*.0015);ctx.globalAlpha*=1-altitude/250}
  ctx.rotate(vehicle.angle)
  ctx.fillStyle=kind==='helicopter'?'#07100d48':'#07100d70';ctx.shadowColor='#07100d70';ctx.shadowBlur=kind==='helicopter'?9:4
  ctx.beginPath();ctx.ellipse(-2,0,kind==='tank'?22:kind==='helicopter'?21:16,kind==='tank'?19:9,0,0,Math.PI*2);ctx.fill();ctx.restore()
}

function drawVehicle(ctx: CanvasRenderingContext2D, vehicle: Vehicle, kind: VehicleKind, visuals: VehicleVisuals,shadow=true) {
  const arrival=kind==='tank'?(vehicle as Tank).arrival:undefined
  if(vehicle.state!=='active'&&!(vehicle.state==='incoming'&&(kind==='helicopter'||(arrival&&arrival.elapsed>=0))))return
  const altitude=arrival?.height??0
  const pose=vehiclePose(visuals,vehicle), angles: V3=[pose.roll,pose.pitch,0]
  const parts = kind==='jeep' ? jeepParts(vehicle as Jeep,pose) : kind==='tank' ? tankParts(vehicle as Tank,pose,visuals.time) : helicopterParts(vehicle as Helicopter)
  if(shadow)drawVehicleShadow(ctx,vehicle,kind)
  ctx.save();ctx.translate(vehicle.pos.x,vehicle.pos.y)
  if(arrival)ctx.globalAlpha*=Math.min(1,Math.max(0,arrival.elapsed/.22))
  if(altitude>0){ctx.translate(0,-altitude*.8);ctx.scale(1+altitude*.001,1+altitude*.001)}
  if(arrival?.landed){const t=arrival.elapsed-TANK_DROP.descent;ctx.translate(0,-(Math.sin(t*15)**2)*Math.exp(-t*5)*3)}
  // The shadow stays grounded while the body rises over wreckage or dips into a crater.
  if(kind!=='helicopter'){
    ctx.translate(0,-pose.lift*.65)
    const heightScale=1+pose.lift*.008;ctx.scale(heightScale,heightScale)
  }
  ctx.rotate(vehicle.angle)
  const hit=kind==='jeep' ? Math.max(pose.hit,Math.max(0,(vehicle as Jeep).hitFlash)/300) : pose.hit
  drawModel(ctx,{x:0,y:0},parts,angles,visuals.time,1,hit,'solid',vehicle.angle)
  if(kind==='helicopter') {
    ctx.save();ctx.globalAlpha=.08;ctx.fillStyle='#c9d3bc'
    const points:V3[]=Array.from({length:49},(_,i)=>[Math.cos(i*Math.PI/24)*25,Math.sin(i*Math.PI/24)*25,-10.4])
    trace(ctx,points,angles,true);ctx.fill();ctx.restore()
  }
  let origin:V3=[17-pose.recoil*1.5,0,-8],heading=0,recoil=pose.recoil
  if(kind==='tank') {
    const tank=vehicle as Tank;heading=tank.turretAngle-tank.angle;recoil=tank.recoil;origin=rotZ([29-recoil*3,0,-7.5],heading)
  } else if(kind==='helicopter') { recoil=(vehicle as Helicopter).recoil;origin=[16-recoil*2,0,-3] }
  muzzleFlash(ctx,origin,heading,recoil,angles)
  ctx.restore()
}
export const drawJeepModel = (ctx:CanvasRenderingContext2D,jeep:Jeep,visuals:VehicleVisuals,shadow=true) => drawVehicle(ctx,jeep,'jeep',visuals,shadow)
export const drawTankModel = (ctx:CanvasRenderingContext2D,tank:Tank,visuals:VehicleVisuals,shadow=true) => drawVehicle(ctx,tank,'tank',visuals,shadow)
export const drawHelicopterModel = (ctx:CanvasRenderingContext2D,heli:Helicopter,visuals:VehicleVisuals,shadow=true) => drawVehicle(ctx,heli,'helicopter',visuals,shadow)

export function drawVehicleDamage(ctx:CanvasRenderingContext2D,visuals:VehicleVisuals) {
  drawDamageParticles(ctx,visuals.sparks)
  drawDamageSmoke(ctx,visuals.smoke)
}
