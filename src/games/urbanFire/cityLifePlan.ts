import type { Wall } from './types'
import type { CityLot } from './cityPlan'

export type CityProp = Wall & {
  kind: 'car' | 'truck' | 'bus' | 'tent' | 'sandbags' | 'supplies' | 'tree' | 'bench'
  condition: 'abandoned' | 'burned' | 'aid'
  direction: 'north' | 'east' | 'south' | 'west'
  blockId: string
  tone: number
}

export const CITY_IMPACTS=[
  {x:1336,y:434,r:24,seed:1},{x:1460,y:557,r:31,seed:2},
  {x:1170,y:889,r:22,seed:3},{x:261,y:419,r:19,seed:4},
  {x:514,y:800,r:18,seed:5},{x:1450,y:190,r:25,seed:6},
]
export const isSolidProp=(prop:CityProp)=>prop.kind==='tree'||prop.condition!=='burned'
export const isMovableProp=(prop:CityProp)=>prop.condition!=='burned'&&['car','truck','bus'].includes(prop.kind)

/** Small, authored scenes anchored to actual land uses, not scattered clutter.
 * All upright objects share these bounds with driving, weapons and navigation. */
export function createCityLife(lots: readonly CityLot[]): CityProp[] {
  const props: CityProp[]=[]
  const place=(blockId:string,lotKind:CityLot['kind'],dx:number,dy:number,width:number,height:number,
    kind:CityProp['kind'],condition:CityProp['condition']='abandoned',direction:CityProp['direction']='north',lotIndex=0)=>{
    const lot=lots.filter(l=>l.blockId===blockId&&l.kind===lotKind)[lotIndex]
    if(!lot)throw new Error(`Missing scenery parcel ${blockId}/${lotKind}`)
    props.push({x:lot.x+dx,y:lot.y+dy,width,height,kind,condition,direction,blockId,tone:props.length%3})
  }
  // Freight ambush: a burned delivery lorry and an abandoned municipal bus.
  place('0:1','yard',22,99,19,34,'truck','burned')
  place('0:1','vacant',19,8,58,19,'bus','burned','west')
  place('0:1','yard',3,4,17,14,'supplies')

  // The civic exchange became an aid post. Approaches and the four courts stay open.
  place('2:1','plaza',6,6,32,23,'tent','aid')
  place('2:1','plaza',52,5,12,14,'supplies','aid')
  place('2:1','plaza',9,48,43,10,'sandbags','abandoned','east',1)
  place('2:1','plaza',39,9,18,35,'truck','aid','south',2)
  place('2:1','plaza',25,31,34,23,'tent','aid','east',3)
  place('2:1','plaza',5,7,10,33,'sandbags','abandoned','north',3)

  // Evacuation left ordinary cars in their bays and a small park rest point.
  place('1:2','parking',9,5,14,29,'car','abandoned','south')
  place('3:0','parking',11,6,14,29,'car')
  place('3:1','parking',9,6,15,30,'car','abandoned','south')
  place('1:2','grass',12,12,22,25,'tree')
  place('1:2','grass',145,10,23,26,'tree')
  place('1:2','grass',24,45,26,6,'bench','abandoned','east')
  place('1:2','grass',17,113,27,6,'bench','burned','west')

  // The eastern works took the heaviest hits. Cargo was spilled beside a burned truck.
  place('3:2','yard',37,11,21,43,'truck','burned','north')
  place('3:2','yard',9,7,17,13,'supplies')
  place('4:2','vacant',45,7,16,32,'car','burned')

  // Cars hug the curb, leaving a continuous 60-unit tank corridor in each avenue.
  for(const [x,y,burned,direction] of [
    [238,375,true,'north'],[558,744,false,'south'],[942,440,false,'north'],[1262,344,true,'south'],
  ] as const)props.push({x,y,width:16,height:33,kind:'car',condition:burned?'burned':'abandoned',
    direction,blockId:'curb',tone:props.length%3})
  return props
}
