import { FIELD } from './types.ts'
import type { Vector2, Wall } from './types'
import { createEdgeDevelopment } from './perimeter.ts'
import { createCityLife } from './cityLifePlan.ts'

export type BuildingKind = 'warehouse' | 'office' | 'apartments' | 'workshop' | 'utility' | 'comms'
export type Frontage = 'north' | 'south' | 'east' | 'west'
export type CityBlock = Wall & { id: string; column: number; row: number }
export type CityBuilding = Wall & {
  blockId: string; kind: BuildingKind; district: number; frontage: Frontage
  access: Vector2; civicWing?: 'horizontal' | 'vertical'
  streetFootprint?: Wall
}
export type CityLot = Wall & { kind: 'parking' | 'yard' | 'vacant' | 'plaza' | 'grass'; blockId: string }
export type CityRuin = { site: CityBuilding; walls: Wall[]; roofRemnants: Wall[]; rubble: Wall[]; entrance: Vector2; interior: Vector2 }
export type RoadClosure = Wall & { kind: 'barrier' | 'bridge'; edge: Frontage }
export type CityAlley = Wall & { start: Vector2; end: Vector2 }

// One physical plan owns the streets, parcels, cover, scenery and spawn points.
export const ROADS = {
  avenues: [.18,.38,.62,.82].map(x=>FIELD.width*x),
  streets: [.18,.5,.82].map(y=>FIELD.height*y),
  avenueWidth: 104, streetWidth: 88, sidewalk: 12,
}
export const roadFootprints = (): Wall[] => [
  ...ROADS.avenues.map(x=>({x:x-ROADS.avenueWidth/2,y:0,width:ROADS.avenueWidth,height:FIELD.height})),
  ...ROADS.streets.map(y=>({x:0,y:y-ROADS.streetWidth/2,width:FIELD.width,height:ROADS.streetWidth})),
]
function spans(centers: number[], width: number, limit: number) {
  const starts=[18,...centers.map(n=>n+width/2)],ends=[...centers.map(n=>n-width/2),limit-18]
  return starts.map((start,i)=>({start,length:ends[i]-start}))
}
export function buildingEntrance(building: CityBuilding): Vector2 {
  const {x,y,width:w,height:h}=building.streetFootprint??building,{frontage}=building
  return {x:frontage==='west'?x:frontage==='east'?x+w:x+w/2,
    y:frontage==='north'?y:frontage==='south'?y+h:y+h/2}
}

function createCityPlan() {
  const columns=spans(ROADS.avenues,ROADS.avenueWidth,FIELD.width)
  const rows=spans(ROADS.streets,ROADS.streetWidth,FIELD.height)
  const blocks:CityBlock[]=[],buildings:CityBuilding[]=[],lots:CityLot[]=[],driveways:Wall[]=[],alleys:CityAlley[]=[],ruins:CityRuin[]=[]
  const setback=ROADS.sidewalk+4
  for(const [row,ys] of rows.entries())for(const [column,xs] of columns.entries()){
    const block:CityBlock={id:`${column}:${row}`,column,row,x:xs.start,y:ys.start,width:xs.length,height:ys.length}
    blocks.push(block)
    const district=Number(column>=2)+Number(row>=2)*2
    const left=block.x+setback,right=block.x+block.width-setback
    const top=block.y+setback,bottom=block.y+block.height-setback
    const w=right-left,h=bottom-top,cx=(left+right)/2,cy=(top+bottom)/2
    const add=(x:number,y:number,width:number,height:number,kind:BuildingKind,frontage:Frontage,access?:Vector2,civicWing?:CityBuilding['civicWing'])=>{
      const building:CityBuilding={x,y,width,height,frontage,kind,blockId:block.id,district,access:access??{x:0,y:0},civicWing}
      if(!access){
        const door=buildingEntrance(building)
        building.access={x:frontage==='west'?block.x:frontage==='east'?block.x+block.width:door.x,
          y:frontage==='north'?block.y:frontage==='south'?block.y+block.height:door.y}
      }
      // Keep the street facade and its entrance in place, while selected outer
      // parcels continue into the surrounding city as the same actual building.
      const extendsWest=column===0&&x===left,extendsEast=column===columns.length-1&&x+width===right
      if(row===0||row===rows.length-1||extendsWest||extendsEast){
        building.streetFootprint={x,y,width,height}
        const depth=64+(column*19+row*17+buildings.length*11)%40
        if(row===0){building.y=-depth;building.height=y+height+depth}
        if(row===rows.length-1)building.height=FIELD.height+depth-y
        if(extendsWest){building.x=-depth;building.width=x+width+depth}
        if(extendsEast)building.width=FIELD.width+depth-x
      }
      buildings.push(building)
      return building
    }
    const lot=(x:number,y:number,width:number,height:number,kind:CityLot['kind'])=>lots.push({x,y,width,height,kind,blockId:block.id})
    const ruin=(site:CityBuilding)=>{
      buildings.splice(buildings.indexOf(site),1)
      const {x,y,width:rw,height:rh}=site
      const court=site.streetFootprint??site
      // Surviving walls and large slabs are cover; the broken floor is drivable.
      // The south opening is deliberately wider than the jeep's 24-unit hull.
      const damaged:CityRuin={site,walls:[{x,y,width:rw*.62,height:8},{x,y:y+8,width:8,height:rh-8},
        {x:x+rw-8,y:y+rh*.4,width:8,height:rh*.6},{x:x+rw-Math.min(24,rw*.22),y:y+rh-8,width:Math.min(24,rw*.22),height:8}],
        roofRemnants:[{x:x+8,y:y+8,width:Math.min(58,rw*.3),height:Math.min(36,rh*.3)}],
        rubble:[{x:x+rw-20,y:y+rh-20,width:12,height:12}],
        entrance:{x:court.x+court.width/2,y:court.y+court.height+setback},
        interior:{x:court.x+court.width/2,y:court.y+court.height*.58}}
      if(row===3){
        // Waterfront ruins open toward their street, away from the quay wall.
        for(const piece of [...damaged.walls,...damaged.roofRemnants,...damaged.rubble])piece.y=2*y+rh-piece.y-piece.height
        damaged.entrance.y=court.y-setback;damaged.interior.y=court.y+court.height*.42
      }
      ruins.push(damaged)
    }
    const alley=()=>{
      alleys.push({x:cx-19,y:block.y,width:38,height:block.height,
        start:{x:cx,y:block.y-ROADS.streetWidth/2},end:{x:cx,y:block.y+block.height+ROADS.streetWidth/2}})
    }
    if(row===0||row===3){
      const frontage=row===0?'south':'north',y=row===0?bottom-86:top
      const kind:BuildingKind=column===0?'warehouse':column===1?'apartments':column===2?'comms':column===3?'office':'workshop'
      if((row===0&&column===3)||(row===3&&column===1)){
        add(left,y,80,86,kind,frontage)
        lot(left+108,y,w-108,86,row===0?'parking':'grass')
      }else if(row===3&&column===2){
        add(left,y,80,88,'workshop','east',{x:cx,y:y+44})
        add(right-80,y,80,88,'utility','west',{x:cx,y:y+44})
        driveways.push({x:cx-38,y:block.y,width:76,height:block.height-setback-10})
        lot(cx-35,y+5,70,78,'yard')
      }else{
        const bw=(w-46)/2
        add(left,y,bw,86,kind,frontage)
        const second=add(right-bw,y,bw,86,column===2?'office':kind,frontage)
        if((row===0&&column===4)||(row===3&&column===0))ruin(second)
      }
      continue
    }
    switch(block.id){
      case '0:1': // Freight: a deep depot, loading apron, and a separate repair shop.
        add(left,top,116,144,'warehouse','north')
        add(right-60,bottom-72,60,72,'workshop','south')
        lot(left+130,top,w-130,138,'yard')
        driveways.push({x:right-56,y:top+42,width:72,height:54})
        lot(left,bottom-65,110,65,'vacant')
        break
      case '1:1':
      case '0:2': { // Fine-grained parcels and a through alley between rear walls.
        const bw=(w-38)/2,kind=column===0?'apartments':'workshop'
        add(left,top,bw,86,kind,'north')
        const damaged=add(right-bw,top,bw,86,kind,'north')
        if(row===1)ruin(damaged)
        add(left,bottom-86,bw,86,'apartments','south')
        add(right-bw,bottom-86,bw,86,kind,'south')
        lot(left,top+102,bw,28,'grass')
        lot(right-bw,top+102,bw,28,'yard')
        alley()
        break
      }
      case '2:1': // The civic building has four paved forecourts, not parking everywhere.
        add(left,cy-38,w,76,'comms','west',undefined,'horizontal')
        add(cx-42,top,84,h,'office','south',undefined,'vertical')
        for(const x of [left,right-72])for(const y of [top,bottom-64])lot(x,y,72,64,'plaza')
        break
      case '3:1': // Offices of different footprints, with a public parking court.
        add(left,top,82,132,'office','north')
        add(right-64,top,64,78,'comms','north')
        add(left,bottom-64,72,64,'office','south')
        lot(right-84,bottom-112,84,112,'parking')
        driveways.push({x:right,y:bottom-80,width:setback,height:52})
        break
      case '4:1':
        ruin(add(left,top,w,102,'office','north'))
        add(left,bottom-78,82,78,'utility','south')
        lot(right-72,bottom-92,72,92,'vacant')
        break
      case '1:2': // A neighborhood green creates a broad maneuvering pocket.
        add(left,top,86,68,'apartments','north')
        lot(right-62,top,62,68,'parking')
        lot(left,top+96,w,h-96,'grass')
        driveways.push({x:block.x,y:bottom-75,width:setback,height:56})
        break
      case '2:2': // The jeep can cut north through the workshops; tanks use the avenues.
        add(left,top+34,(w-38)/2,h-68,'workshop','east',{x:cx,y:cy})
        add(cx+19,top+34,(w-38)/2,h-68,'warehouse','west',{x:cx,y:cy})
        alley()
        lot(left,top,w,24,'yard')
        lot(left,bottom-24,w,24,'yard')
        break
      case '3:2':
        add(left,top,w,88,'warehouse','north')
        add(right-68,bottom-64,68,64,'utility','south')
        lot(left,top+112,w-94,h-112,'yard')
        driveways.push({x:block.x,y:top+146,width:setback,height:54})
        break
      case '4:2':
        add(left,top,78,62,'workshop','north')
        lot(right-76,top,76,64,'vacant')
        ruin(add(left,bottom-130,w,130,'warehouse','south'))
        break
    }
  }
  // Streets terminate at the neighboring railway, canal, and industrial works.
  const closures:RoadClosure[]=[]
  for(const [i,x] of ROADS.avenues.entries())for(const edge of ['north','south'] as const){
    const inset=i%2?24:16
    closures.push({x:x-ROADS.avenueWidth/2-ROADS.sidewalk,y:edge==='north'?inset:FIELD.height-inset-24,
      width:ROADS.avenueWidth+ROADS.sidewalk*2,height:24,edge,
      kind:edge==='south'&&i%2?'bridge':'barrier'})
  }
  for(const [i,y] of ROADS.streets.entries())for(const edge of ['west','east'] as const){
    const inset=i%2?24:16
    closures.push({x:edge==='west'?inset:FIELD.width-inset-24,y:y-ROADS.streetWidth/2-ROADS.sidewalk,
      width:24,height:ROADS.streetWidth+ROADS.sidewalk*2,edge,
      kind:'barrier'})
  }
  // Reinforcements stage on the city side of the cordon, facing along the road.
  const entries=[
    ...ROADS.avenues.flatMap(x=>[{pos:{x,y:104},angle:Math.PI/2},{pos:{x,y:FIELD.height-104},angle:-Math.PI/2}]),
    ...ROADS.streets.flatMap(y=>[{pos:{x:104,y},angle:0},{pos:{x:FIELD.width-104,y},angle:Math.PI}]),
  ]
  const patrol=[{x:FIELD.width/2,y:ROADS.streets[2]},{x:ROADS.avenues[0],y:ROADS.streets[1]},
    {x:FIELD.width/2,y:ROADS.streets[0]},{x:ROADS.avenues[3],y:ROADS.streets[1]}]
  const edgeDevelopment=createEdgeDevelopment(closures,buildings,ruins)
  const props=createCityLife(lots)
  return {blocks,buildings,lots,driveways,alleys,ruins,closures,props,edgeBuildings:edgeDevelopment.buildings,
    edgeRubble:edgeDevelopment.rubble,entries,patrol,playerSpawn:{x:FIELD.width/2,y:ROADS.streets[2]}}
}
export const CITY = createCityPlan()
