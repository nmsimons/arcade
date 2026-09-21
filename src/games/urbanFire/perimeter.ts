import { FIELD } from './types.ts'
import type { Vector2, Wall } from './types'
import type { CityBuilding, CityRuin, Frontage, RoadClosure } from './cityPlan'

export const SCENERY_MARGIN=1024

const touches=(p:Vector2,w:Wall)=>Math.hypot(p.x-Math.max(w.x,Math.min(p.x,w.x+w.width)),
  p.y-Math.max(w.y,Math.min(p.y,w.y+w.height)))<12

/** Extended existing parcels do most of the work. Only the remaining gaps get
 * a service annex or collapsed masonry; there is no second ring of buildings. */
export function createEdgeDevelopment(closures:RoadClosure[],existing:CityBuilding[],ruins:CityRuin[]){
  const buildings:CityBuilding[]=[],rubble:Wall[]=[]
  const solid:Wall[]=[...existing,...ruins.flatMap(r=>[...r.walls,...r.roofRemnants]),...closures]
  for(const edge of ['north','south','west','east'] as const){
    const horizontal=edge==='north'||edge==='south',limit=horizontal?FIELD.width:FIELD.height
    const point=(along:number):Vector2=>horizontal?{x:along,y:edge==='north'?20:FIELD.height-20}:
      {x:edge==='west'?20:FIELD.width-20,y:along}
    const gaps:{start:number;end:number}[]=[]
    let start:number|null=null
    for(let along=20;along<=limit-19;along++){
      const open=along<limit-19&&!solid.some(w=>touches(point(along),w))
      if(open&&start===null)start=along
      if(!open&&start!==null){gaps.push({start:start-3,end:along+3});start=null}
    }
    for(const [i,gap] of gaps.entries()){
      const length=gap.end-gap.start
      const damaged=ruins.some(({site})=>horizontal?gap.start<site.x+site.width&&gap.end>site.x&&
        (edge==='north'?site.y<20:site.y+site.height>FIELD.height-20):gap.start<site.y+site.height&&gap.end>site.y&&
        (edge==='west'?site.x<20:site.x+site.width>FIELD.width-20))
      if(length>80&&!damaged){
        const depth=90+(i%3)*17
        const rect=horizontal?{x:gap.start,y:edge==='north'?-depth:FIELD.height-26,width:length,height:depth+26}:
          {x:edge==='west'?-depth:FIELD.width-26,y:gap.start,width:depth+26,height:length}
        const frontage:Frontage={north:'south',south:'north',west:'east',east:'west'}[edge] as Frontage
        const access=point((gap.start+gap.end)/2)
        const annex:CityBuilding={...rect,frontage,access,blockId:`annex:${edge}:${i}`,kind:edge==='south'?'utility':'workshop',district:edge==='south'?3:0}
        buildings.push(annex);solid.push(annex)
      }else{
        // Several overlapping slabs form a jagged pile, including within open ruins.
        const count=Math.max(1,Math.ceil(length/28)),step=length/count
        for(let j=0;j<count;j++){
          const along=gap.start+j*step,inset=24+j%3*4,depth=30+j%2*8
          const piece=horizontal?{x:along,y:edge==='north'?inset-depth:FIELD.height-inset,width:step+2,height:depth}:
            {x:edge==='west'?inset-depth:FIELD.width-inset,y:along,width:depth,height:step+2}
          rubble.push(piece);solid.push(piece)
        }
      }
    }
  }
  return {buildings,rubble}
}
