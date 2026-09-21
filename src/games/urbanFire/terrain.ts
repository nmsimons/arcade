import { CITY } from './cityPlan.ts'
import { CITY_IMPACTS, isSolidProp } from './cityLifePlan.ts'
import type { Vector2, Wall } from './types'

export type TerrainPatch = Wall & { kind:'crater'|'wreck'|'debris'; strength:number; seed:number }
export const TERRAIN:readonly TerrainPatch[]=[
  ...CITY_IMPACTS.map(({x,y,r,seed}):TerrainPatch=>({x:x-r,y:y-r*.79,width:r*2,height:r*1.58,kind:'crater',strength:.85,seed})),
  ...CITY.props.filter(p=>!isSolidProp(p)).map((p):TerrainPatch=>({x:p.x-4,y:p.y-4,width:p.width+8,height:p.height+8,
    kind:p.kind==='bench'?'debris':'wreck',strength:p.kind==='bench'?.55:1,seed:p.x+p.y})),
  ...CITY.ruins.flatMap(r=>r.rubble).map((r):TerrainPatch=>({...r,x:r.x-3,y:r.y-3,width:r.width+6,height:r.height+6,
    kind:'debris',strength:.7,seed:r.x-r.y})),
]

const clamp=(x:number,a:number,b:number)=>Math.max(a,Math.min(b,x))
const smooth=(v:number)=>v*v*(3-2*v)

/** World-space height, independent of time: a stopped vehicle settles on the
 * surface instead of vibrating forever. Positive height is above the asphalt. */
export function terrainAt(pos:Vector2,patches:readonly TerrainPatch[]=TERRAIN){
  let roughness=0,height=0
  for(const patch of patches){
    const nx=(pos.x-patch.x-patch.width/2)/(patch.width/2),ny=(pos.y-patch.y-patch.height/2)/(patch.height/2)
    const radius=patch.kind==='crater'?Math.hypot(nx,ny):Math.max(Math.abs(nx),Math.abs(ny))
    if(radius>=1)continue
    const weight=smooth(clamp((1-radius)*3,0,1))
    const grain=(Math.sin(pos.x*.37+pos.y*.19+patch.seed)+Math.sin(pos.y*.49-pos.x*.23))* .32
    const profile=patch.kind==='crater'?-5.2*(1-radius*radius)+Math.exp(-(((radius-.83)/.13)**2))*2.8:
      patch.kind==='wreck'?4.6*(1-radius*.25):1.9*(1-radius*.3)
    const strength=weight*patch.strength
    if(strength>roughness){roughness=strength;height=(profile+grain)*weight}
  }
  return {roughness,height}
}

export type GroundVehicleKind='jeep'|'tank'
export const contactDimensions=(kind:GroundVehicleKind)=>kind==='jeep'?{axle:7,halfWidth:9}:{axle:12,halfWidth:13}

/** Sample the four wheel/track contacts and the chassis center. Both physics
 * and the suspension use this exact surface, including feathered transitions. */
export function vehicleTerrain(pos:Vector2,angle:number,kind:GroundVehicleKind,patches:readonly TerrainPatch[]=TERRAIN){
  const {axle,halfWidth}=contactDimensions(kind),c=Math.cos(angle),s=Math.sin(angle)
  const contacts=[-1,1].flatMap(side=>[-axle,axle].map(x=>terrainAt({
    x:pos.x+x*c-side*halfWidth*s,y:pos.y+x*s+side*halfWidth*c},patches)))
  const center=terrainAt(pos,patches)
  const roughness=Math.max(center.roughness*.7,contacts.reduce((sum,p)=>sum+p.roughness,0)/4)
  const heights=contacts.map(p=>p.height)
  const front=(heights[1]+heights[3])/2,rear=(heights[0]+heights[2])/2
  const left=(heights[0]+heights[1])/2,right=(heights[2]+heights[3])/2
  return {roughness,heights,height:center.height*.35+(front+rear)*.325,
    pitch:clamp(Math.atan2(front-rear,axle*2),-.3,.3),roll:clamp(-Math.atan2(right-left,halfWidth*2),-.27,.27)}
}

/** Extra rolling resistance is exponential, so coasting behaves consistently
 * at different frame rates. Throttle can still pull the jeep across a wreck. */
export function applyTerrainResistance(velocity:Vector2,roughness:number,dt:number){
  const damping=Math.exp(-4.4*clamp(roughness,0,1)*Math.max(0,dt))
  velocity.x*=damping;velocity.y*=damping
}

// Tracks retain more progress on loose ground than the lighter wheeled jeep.
export const tankTerrainSpeed=(roughness:number)=>1-clamp(roughness,0,1)*.43
