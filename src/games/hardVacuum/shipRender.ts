import { clamp, rotX, rotY, rotZ } from './math'
import { drawModel } from './objectModels'
import type { Part } from './objectModels'
import type { Debris, Ship, V3, Vector2 } from './types'
import { SHIP_ROTATION_SPEED } from './tuning'
import { flightInput } from './flightInput'

export interface ShipAppearance { bank: number; turn: number; thrust: number; nose: number; sparkDelay: number }
export const freshShipAppearance = (): ShipAppearance => ({ bank:0,turn:0,thrust:0,nose:0,sparkDelay:0 })

/** Presentation only: attitude settles smoothly without changing flight physics. */
export function stepShipAppearance(appearance: ShipAppearance, keys: Set<string>, dt: number, angularVelocity?: number) {
  const ease=1-Math.exp(-10*dt)
  const {left,right,forward,reverse}=flightInput(keys)
  // Jets follow input; banking follows the ship's actual rotation as it coasts.
  appearance.turn=Number(right)-Number(left)
  const bank=angularVelocity===undefined ? appearance.turn : clamp(angularVelocity/SHIP_ROTATION_SPEED,-1,1)
  appearance.bank+=(bank-appearance.bank)*ease
  appearance.thrust+=(Number(forward)-appearance.thrust)*ease
  appearance.nose+=(Number(reverse)-appearance.nose)*ease
}

/** Short electrical bursts leave the hull with its velocity, then drift freely. */
export function stepHullSparks(appearance: ShipAppearance, ship: Ship, shields: number, dt: number): Debris[] {
  if (shields>0) { appearance.sparkDelay=0; return [] }
  appearance.sparkDelay-=dt
  if (appearance.sparkDelay>0) return []
  appearance.sparkDelay=.16+Math.random()*.3
  const side=Math.random()<.5 ? -1 : 1
  const p=rotZ(rotY(rotX([-9+Math.random()*12,side*8,-2],appearance.bank*.2),appearance.nose*.12-appearance.thrust*.16),ship.angle)
  const scale=ship.radius/15*420/(420+p[2])
  const origin={x:ship.pos.x+p[0]*scale,y:ship.pos.y+p[1]*scale}
  return Array.from({length:3+Math.floor(Math.random()*2)},(_,i)=>{
    const angle=ship.angle+side*Math.PI/2+(Math.random()-.5)*1.3
    const speed=35+Math.random()*55
    return {pos:{...origin},vel:{x:ship.vel.x+Math.cos(angle)*speed,y:ship.vel.y+Math.sin(angle)*speed},
      angle,rotSpeed:(Math.random()-.5)*5,life:220+Math.random()*180,length:2+Math.random()*3,
      color:i===0 ? '255, 239, 193' : '255, 170, 75',spark:true}
  })
}

type Outline = readonly (readonly [number,number])[]
function bevel(lower: Outline, upper: Outline, color: string, bottom=3, top=-3, glow=false): Part {
  const n=lower.length
  return {
    verts:[...lower.map(([x,y]):V3=>[x,y,bottom]),...upper.map(([x,y]):V3=>[x,y,top])],
    faces:[Array.from({length:n},(_,i)=>i),Array.from({length:n},(_,i)=>2*n-i-1),
      ...lower.map((_,i)=>[i,n+i,n+(i+1)%n,(i+1)%n])],
    color,at:[0,0,0],glow,
    // Keep a crisp silhouette, quiet the inset rim, and let shading describe
    // the bevels instead of outlining every small corner and glass facet.
    edges:lower.flatMap((_,i):[number,number,number][]=>[
      [i,(i+1)%n,1],[n+i,n+(i+1)%n,glow ? 0 : .25],
    ]),
  }
}

const HULL=bevel(
  [[18,0],[5,8],[-10,7],[-14,3],[-14,-3],[-10,-7],[5,-8]],
  [[16,0],[4,5],[-8,5],[-11,2],[-11,-2],[-8,-5],[4,-5]],'#e0ebe6',3.5,-3.5)
const COCKPIT=bevel(
  [[10,0],[3,3],[-3,2.5],[-4,0],[-3,-2.5],[3,-3]],
  [[8,0],[2,2],[-2,1.5],[-3,0],[-2,-1.5],[2,-2]],'#86becb',-3.5,-7,true)
const ENGINES=[-1,1].map(side=>{
  const lower:Outline=[[-18,-2.5],[-4,-3],[-1,0],[-4,3],[-18,2.5],[-19,0]]
  const upper:Outline=[[-17,-1.5],[-5,-2],[-3,0],[-5,2],[-17,1.5],[-18,0]]
  return {...bevel(lower,upper,'#b1c7bc',3,-2),at:[0,side*8.5,0] as V3}
})
const SHIP_PARTS=[HULL,...ENGINES,COCKPIT]
const SHIELD_OUTLINE:Outline=[[20,0],[6,9],[-5,12],[-18,11],[-20,5],[-14,0],[-20,-5],[-18,-11],[-5,-12],[6,-9]]

export function drawPlayerShip(ctx: CanvasRenderingContext2D, ship: Ship, appearance: ShipAppearance, options: {
  time: number; shields: number; maxShields: number; hitAge: number; rechargeAge: number
  recharging: boolean; rechargeProgress: number; laser: boolean
}) {
  const scale=ship.radius/15
  // Rest square to the map. Only pilot input tilts the hull away from top-down.
  const angles:V3=[appearance.bank*.2,appearance.nose*.12-appearance.thrust*.16,ship.angle]
  const project=(point:V3):Vector2=>{
    const p=rotZ(rotY(rotX(point,angles[0]),angles[1]),angles[2]),perspective=420/(420+p[2])
    return {x:p[0]*perspective*scale,y:p[1]*perspective*scale}
  }
  const trace=(points:Vector2[],closed=true)=>{
    ctx.beginPath();points.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));if(closed)ctx.closePath()
  }
  const shield=(gap:number)=>SHIELD_OUTLINE.map(([x,y])=>{
    const distance=Math.hypot(x,y),factor=scale+gap/distance
    return {x:(x*Math.cos(ship.angle)-y*Math.sin(ship.angle))*factor,y:(x*Math.sin(ship.angle)+y*Math.cos(ship.angle))*factor}
  })
  ctx.save();ctx.translate(ship.pos.x,ship.pos.y);ctx.lineJoin='round';ctx.lineCap='round';ctx.shadowBlur=0

  if (options.recharging) {
    const intensity=.4+.35*clamp(options.rechargeProgress,0,1)
    ctx.save();ctx.strokeStyle='#00ff88';ctx.shadowColor='#00ff8860'
    for(let i=0;i<2;i++) {
      const t=(options.time/.85+i/2)%1
      trace(shield(24+58*(1-t)))
      ctx.shadowBlur=6+12*t;ctx.globalAlpha=(.035+.18*t)*intensity;ctx.lineWidth=.9+2.2*t;ctx.stroke()
    }
    ctx.restore()
  }
  // The field is invisible at rest. Even the hit that drains its last charge
  // gets a brief contact flash before the envelope fades away.
  const impact=options.hitAge>=0&&options.hitAge<650 ? Math.pow(1-options.hitAge/650,2) : 0
  const charged=options.shields>0&&options.rechargeAge>=0&&options.rechargeAge<400
    ? .35*Math.pow(1-options.rechargeAge/400,2) : 0
  const shieldActivity=Math.max(impact,charged)
  if (shieldActivity>0) {
    const strength=clamp(options.shields/options.maxShields,0,1)
    ctx.save();ctx.globalAlpha=(.65+.25*strength)*shieldActivity
    ctx.strokeStyle='#00ff88';ctx.shadowColor='#00ff8880';ctx.shadowBlur=6+10*shieldActivity
    ctx.lineWidth=1+1.5*shieldActivity;trace(shield(5));ctx.stroke();ctx.restore()
  }

  const jet=(origin:V3,direction:Vector2,strength:number,phase:number,maxLength:number,maxSpread:number)=>{
    if (strength<.025) return
    const flicker=1+Math.sin(options.time*43+phase)*.12+Math.sin(options.time*67+phase)*.07
    const length=maxLength*strength*flicker,spread=maxSpread*strength
    const point=(along:number,across:number):V3=>[
      origin[0]+direction.x*along-direction.y*across,
      origin[1]+direction.y*along+direction.x*across,origin[2],
    ]
    ctx.save();ctx.globalAlpha=Math.min(1,strength*2)
    trace([point(0,-spread),point(length,0),point(0,spread)].map(project))
    ctx.fillStyle='#ffb45c18';ctx.fill();ctx.strokeStyle='#ffb86b';ctx.lineWidth=1.2;ctx.shadowColor='#ffad6540';ctx.shadowBlur=4;ctx.stroke()
    trace([project(origin),project(point(length*.58,0))],false)
    ctx.strokeStyle='#fff0cd';ctx.lineWidth=1.1;ctx.shadowBlur=0;ctx.stroke();ctx.restore()
  }
  for(const side of [-1,1])jet([-18,side*8.5,0],{x:-1,y:0},appearance.thrust,side*1.7,21,2.1)
  jet([18,0,0],{x:1,y:0},appearance.nose,0,8,1.4)

  // Opposite exhaust directions make a turning couple: starboard bow and port
  // stern turn left; the mirrored pair turns right. Ports sit on the hull edge.
  const bowSide=-appearance.turn
  const turnPorts: { origin:V3; side:number; strength:number }[]=appearance.turn===0 ? [] : [
    {origin:[10,bowSide*5.1,0],side:bowSide,strength:1},
    {origin:[-14,-bowSide*11.3,0],side:-bowSide,strength:.72},
  ]
  for(const port of turnPorts)jet(port.origin,{x:0,y:port.side},port.strength,port.origin[0]*.3,7,.85)

  drawModel(ctx,{x:0,y:0},SHIP_PARTS,angles,options.time,scale)
  // A small lit nozzle connects each plume to the banked, projected hull.
  for(const port of turnPorts) {
    const [x,y,z]=port.origin
    trace([project([x-.65,y,z]),project([x+.65,y,z])],false)
    ctx.strokeStyle=port.strength===1 ? '#ffe1ad' : '#c8b597';ctx.lineWidth=1;ctx.stroke()
  }
  // Light the engine mouths and bow port only when their tools are active.
  for(const side of appearance.thrust>.05 ? [-1,1] : []) {
    trace([project([-18,side*8.5-1.5,-1]),project([-18,side*8.5+1.5,-1])],false)
    ctx.strokeStyle='#ffe1ad';ctx.lineWidth=1.5;ctx.stroke()
  }
  if(options.laser) {
    trace([project([16,-1,-1]),project([18,0,-1]),project([16,1,-1])],false)
    ctx.strokeStyle='#a9e7ff';ctx.lineWidth=1.2;ctx.stroke()
  }
  ctx.restore()
}
