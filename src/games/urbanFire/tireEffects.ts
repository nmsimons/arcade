import { CITY, roadFootprints, ROADS } from './cityPlan.ts'
import { clamp, distance } from './navigation.ts'
import { terrainAt } from './terrain.ts'
import type { Jeep, Vector2 } from './types'

export type SkidMark={from:Vector2;to:Vector2;age:number;strength:number}
export const SKID_LIFETIME=3.5
// Require a pronounced slide before either effect starts; hard skids still reach full strength.
const SKID_SLIP_START=48,SKID_SLIP_FULL=80
const pavement=[...roadFootprints().map(r=>({x:r.x-ROADS.sidewalk,y:r.y-ROADS.sidewalk,
  width:r.width+ROADS.sidewalk*2,height:r.height+ROADS.sidewalk*2})),
  ...CITY.alleys,...CITY.driveways,...CITY.lots.filter(lot=>lot.kind==='parking'||lot.kind==='plaza')]
const paved=(p:Vector2)=>pavement.some(r=>p.x>=r.x&&p.x<=r.x+r.width&&p.y>=r.y&&p.y<=r.y+r.height)&&terrainAt(p).roughness<.35
export const createTireEffects=()=>({marks:[] as SkidMark[],previous:null as Vector2|null,
  contacts:[null,null] as (Vector2|null)[],squeal:0})
export type TireEffects=ReturnType<typeof createTireEffects>

/** Actual resolved travel drives the tire slip, so a parked or blocked jeep
 * cannot squeal or lay rubber just because its wheels are steered. */
export function stepTireEffects(effects:TireEffects,jeep:Jeep,dt:number){
  if(dt<=0)return
  effects.marks=effects.marks.filter(mark=>{mark.age+=dt;return mark.age<SKID_LIFETIME})
  const previous=effects.previous
  effects.previous={...jeep.pos}
  const dx=previous?(jeep.pos.x-previous.x)/dt:0,dy=previous?(jeep.pos.y-previous.y)/dt:0
  const speed=Math.hypot(dx,dy),c=Math.cos(jeep.angle),s=Math.sin(jeep.angle)
  const slip=Math.abs(-dx*s+dy*c)
  const intensity=jeep.state==='active'&&speed<600?clamp((speed-60)/50,0,1)*clamp((slip-SKID_SLIP_START)/(SKID_SLIP_FULL-SKID_SLIP_START),0,1):0
  let contactStrength=0
  for(let i=0;i<2;i++){
    const side=i?1:-1,point={x:jeep.pos.x-7*c-side*9*s,y:jeep.pos.y-7*s+side*9*c}
    if(intensity<.1||!paved(point)){effects.contacts[i]=null;continue}
    contactStrength+=intensity/2
    const from=effects.contacts[i]
    if(!from){effects.contacts[i]=point;continue}
    const length=distance(from,point)
    if(length<1.8)continue
    if(length<14&&paved({x:(from.x+point.x)/2,y:(from.y+point.y)/2})){
      effects.marks.push({from,to:point,age:0,strength:intensity})
    }
    effects.contacts[i]=point
  }
  effects.squeal+=(contactStrength-effects.squeal)*(1-Math.exp(-dt*(contactStrength>effects.squeal?18:12)))
  if(effects.squeal<.002)effects.squeal=0
  if(effects.marks.length>900)effects.marks.splice(0,effects.marks.length-900)
}

export function drawSkidMarks(ctx:CanvasRenderingContext2D,effects:TireEffects){
  ctx.save();ctx.strokeStyle='#101714';ctx.lineWidth=2.1;ctx.lineCap='round'
  for(const mark of effects.marks){
    ctx.globalAlpha=(.06+mark.strength*.2)*Math.min(1,(SKID_LIFETIME-mark.age)/2.5)
    ctx.beginPath();ctx.moveTo(mark.from.x,mark.from.y);ctx.lineTo(mark.to.x,mark.to.y);ctx.stroke()
  }
  ctx.restore()
}
