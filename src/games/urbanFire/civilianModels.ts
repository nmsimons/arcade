import { bevel, drawModel } from '../model3d.ts'
import type { Outline, Part, V3 } from '../model3d'
import type { CivilianVehicle } from './civilianVehicles'

const rectangle=(x:number,y:number,w:number,h:number):Outline=>[[x,y],[x+w,y],[x+w,y+h],[x,y+h]]
const rounded=(l:number,w:number,r:number):Outline=>[[-l/2,-w/2+r],[-l/2+r,-w/2],[l/2-r,-w/2],[l/2,-w/2+r],
  [l/2,w/2-r],[l/2-r,w/2],[-l/2+r,w/2],[-l/2,w/2-r]]
const plate=(outline:Outline,color:string,z:number)=>bevel(outline,outline,color,z+.3,z)
const cache=new WeakMap<CivilianVehicle,{body:Part[];wheel:Part;axle:number;track:number;wheelLength:number}>()

function model(car:CivilianVehicle){
  const cached=cache.get(car)
  if(cached)return cached
  const {length:l,width:w,prop}=car,truck=prop.kind!=='car',aid=prop.condition==='aid'
  const paint=aid?'#b9bba1':['#8da9a3','#b0ac89','#b29b8d'][prop.tone]
  const body=[bevel(rounded(l,w-3,3),rounded(l-3,w-5,2),paint,1.5,-3)]
  if(truck){
    const cab=bevel(rectangle(l*.16,-w*.34,l*.28,w*.68),rectangle(l*.19,-w*.26,l*.19,w*.52),paint,-3,-6.5)
    const glass=plate(rectangle(l*.36,-w*.24,2,w*.48),'#7ea5a5',-6.6)
    const cargo=bevel(rectangle(-l*.43,-w*.35,l*.52,w*.7),rectangle(-l*.4,-w*.3,l*.46,w*.6),'#b0b598',-3,-7)
    if(aid)cargo.markings=[{face:1,color:'#d4d7bb',verts:[[-l*.2-1,-4,-7.1],[-l*.2+1,-4,-7.1],[-l*.2+1,4,-7.1],[-l*.2-1,4,-7.1]]},
      {face:1,color:'#d4d7bb',verts:[[-l*.2-4,-1,-7.1],[-l*.2+4,-1,-7.1],[-l*.2+4,1,-7.1],[-l*.2-4,1,-7.1]]}]
    body.push(cab,glass,cargo)
  }else{
    body.push(bevel([[-l*.28,-w*.3],[l*.13,-w*.3],[l*.27,-w*.2],[l*.27,w*.2],[l*.13,w*.3],[-l*.28,w*.3]],
      [[-l*.2,-w*.23],[l*.07,-w*.23],[l*.12,-w*.17],[l*.12,w*.17],[l*.07,w*.23],[-l*.2,w*.23]],paint,-3,-6.7))
    body.push(bevel([[l*.13,-w*.28],[l*.27,-w*.18],[l*.27,w*.18],[l*.13,w*.28]],
      [[l*.08,-w*.22],[l*.13,-w*.16],[l*.13,w*.16],[l*.08,w*.22]],'#8eb5af',-3.2,-6.8))
    body.push(plate(rectangle(-l*.22,-w*.21,2.2,w*.42),'#668e87',-6.8))
  }
  for(const side of [-1,1]){
    body.push(plate(rectangle(l/2-2,side*(w/2-3)-.8,1.3,1.6),'#d9d1ac',-3.1))
    body.push(plate(rectangle(-l/2+1,side*(w/2-3)-.8,1.2,1.6),'#ab7561',-3.1))
  }
  const wheelLength=Math.min(8,l*.25)
  const wheel=bevel(rounded(wheelLength,3.4,1),rounded(wheelLength-1,2.6,.8),'#3b443a',2,-1.3)
  const result={body,wheel,axle:l*.3,track:w/2-1.7,wheelLength}
  cache.set(car,result);return result
}

/** Four rounded tires, separate cab/glass, grounded shadow and a sprung body.
 * Tire markings follow signed travel, including the two sides of a turn. */
export function drawCivilianVehicles(ctx:CanvasRenderingContext2D,cars:readonly CivilianVehicle[]){
  for(const car of cars){
    const {body,wheel,axle,track,wheelLength}=model(car)
    const wheels:Part[]=[-1,1].flatMap(side=>[-axle,axle].map(x=>{
      const travel=side<0?car.leftTravel:car.rightTravel,phase=((travel%3)+3)%3
      const markings:NonNullable<Part['markings']>=[]
      for(let tx=-wheelLength/2+1+phase;tx<wheelLength/2-1;tx+=3)markings.push({face:1,color:'#829781',
        verts:[[tx,-.9,-1.31],[tx+.35,-.9,-1.31],[tx+.35,.9,-1.31],[tx,.9,-1.31]]})
      return {...wheel,markings,at:[x,side*track,0] as V3,rotation:[0,0,x>0?car.steer:0] as V3}
    }))
    ctx.save();ctx.translate(car.pos.x+2,car.pos.y+3);ctx.rotate(car.angle)
    ctx.shadowBlur=3;ctx.shadowColor='#0a100c70';ctx.fillStyle='#0a100c70';ctx.beginPath();ctx.roundRect(-car.length/2,-car.width/2,car.length,car.width,3);ctx.fill();ctx.restore()
    ctx.save();ctx.translate(car.pos.x,car.pos.y);ctx.rotate(car.angle)
    // Wheels stay planted while impact energy rocks only the sprung chassis.
    drawModel(ctx,{x:0,y:0},wheels,[0,0,0],0,1,0,'solid',car.angle)
    drawModel(ctx,{x:0,y:0},body,[car.roll,car.pitch,0],0,1,car.hit*.3,'solid',car.angle)
    ctx.restore()
  }
}
