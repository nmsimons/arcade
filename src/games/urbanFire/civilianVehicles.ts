import { CITY } from './cityPlan.ts'
import { isMovableProp } from './cityLifePlan.ts'
import type { CityProp } from './cityLifePlan'
import { clamp, segmentEntry } from './navigation.ts'
import { FIELD } from './types.ts'
import type { Vector2, Wall } from './types'
import { terrainAt } from './terrain.ts'

export type CivilianVehicle = {
  prop: CityProp; pos: Vector2; vel: Vector2; angle: number; spin: number
  length: number; width: number; mass: number; inertia: number
  leftTravel: number; rightTravel: number; steer: number
  roll: number; pitch: number; rollSpeed: number; pitchSpeed: number; hit: number
}
export type ContactVehicle = {pos:Vector2;vel:Vector2;radius:number;mass:number;
  onContact?:(car:CivilianVehicle,closingSpeed:number)=>void}
type Box = {pos:Vector2;angle:number;length:number;width:number}
const dot=(a:Vector2,b:Vector2)=>a.x*b.x+a.y*b.y
const cross=(a:Vector2,b:Vector2)=>a.x*b.y-a.y*b.x
const axes=(box:Box)=>[{x:Math.cos(box.angle),y:Math.sin(box.angle)},{x:-Math.sin(box.angle),y:Math.cos(box.angle)}]
const local=(box:Box,p:Vector2)=>{
  const [x,y]=axes(box),delta={x:p.x-box.pos.x,y:p.y-box.pos.y}
  return {x:dot(delta,x),y:dot(delta,y)}
}
const world=(box:Box,p:Vector2)=>{
  const [x,y]=axes(box)
  return {x:box.pos.x+p.x*x.x+p.y*y.x,y:box.pos.y+p.x*x.y+p.y*y.y}
}
const wallBox=(wall:Wall):Box=>({pos:{x:wall.x+wall.width/2,y:wall.y+wall.height/2},angle:wall.angle??0,length:wall.width,width:wall.height})
export const civilianCover=(car:CivilianVehicle):Wall=>({x:car.pos.x-car.length/2,y:car.pos.y-car.width/2,width:car.length,height:car.width,angle:car.angle})

export function createCivilianVehicles(props:readonly CityProp[]=CITY.props):CivilianVehicle[]{
  return props.filter(isMovableProp).map(prop=>{
    const vertical=prop.direction==='north'||prop.direction==='south'
    const length=vertical?prop.height:prop.width,width=vertical?prop.width:prop.height
    const mass=prop.kind==='car'?3.4:prop.kind==='truck'?6:8
    return {prop,pos:{x:prop.x+prop.width/2,y:prop.y+prop.height/2},vel:{x:0,y:0},
      angle:{north:-Math.PI/2,south:Math.PI/2,east:0,west:Math.PI}[prop.direction],spin:0,
      length,width,mass,inertia:mass*(length*length+width*width)/12,
      leftTravel:0,rightTravel:0,steer:0,roll:0,pitch:0,rollSpeed:0,pitchSpeed:0,hit:0}
  })
}

/** SAT keeps rotated cars out of real cover instead of colliding with an
 * oversized axis-aligned box. The normal points from b toward a. */
export function boxContact(a:Box,b:Box){
  // Each rotated rectangle fits inside this conservative square. Reject
  // distant pairs before allocating axes or doing the exact SAT contacts.
  const reach=(a.length+a.width+b.length+b.width)/2
  if(Math.abs(a.pos.x-b.pos.x)>reach || Math.abs(a.pos.y-b.pos.y)>reach)return null
  const aa=axes(a),bb=axes(b),delta={x:a.pos.x-b.pos.x,y:a.pos.y-b.pos.y}
  let depth=Infinity,normal={x:0,y:0}
  for(const axis of [...aa,...bb]){
    const ra=Math.abs(dot(aa[0],axis))*a.length/2+Math.abs(dot(aa[1],axis))*a.width/2
    const rb=Math.abs(dot(bb[0],axis))*b.length/2+Math.abs(dot(bb[1],axis))*b.width/2
    const separation=dot(delta,axis),overlap=ra+rb-Math.abs(separation)
    if(overlap<=0)return null
    if(overlap<depth){depth=overlap;const sign=separation<0?-1:1;normal={x:axis.x*sign,y:axis.y*sign}}
  }
  // Average the contacting face/corner, clipped to the other body. This avoids
  // huge moment arms when the other obstacle is a long building facade.
  const vertices=[-1,1].flatMap(x=>[-1,1].map(y=>world(a,{x:x*a.length/2,y:y*a.width/2})))
  const nearest=Math.min(...vertices.map(p=>dot(p,normal)))
  const face=vertices.filter(p=>dot(p,normal)<nearest+.05)
  const point={x:face.reduce((sum,p)=>sum+p.x,0)/face.length,y:face.reduce((sum,p)=>sum+p.y,0)/face.length}
  const q=local(b,point)
  return {depth,normal,point:world(b,{x:clamp(q.x,-b.length/2,b.length/2),y:clamp(q.y,-b.width/2,b.width/2)})}
}

export function civilianCircleContact(car:CivilianVehicle,actor:ContactVehicle){
  const reach=(car.length+car.width)/2+actor.radius
  if(Math.abs(car.pos.x-actor.pos.x)>reach || Math.abs(car.pos.y-actor.pos.y)>reach)return null
  const p=local(car,actor.pos),q={x:clamp(p.x,-car.length/2,car.length/2),y:clamp(p.y,-car.width/2,car.width/2)}
  let dx=p.x-q.x,dy=p.y-q.y,distance=Math.hypot(dx,dy),depth=actor.radius-distance
  if(depth<=0)return null
  if(distance<1e-8){
    const ex=car.length/2-Math.abs(p.x),ey=car.width/2-Math.abs(p.y)
    if(ex<ey){dx=p.x<0?-1:1;dy=0;q.x=dx*car.length/2;depth=actor.radius+ex}
    else{dx=0;dy=p.y<0?-1:1;q.y=dy*car.width/2;depth=actor.radius+ey}
    distance=1
  }
  const [x,y]=axes(car)
  return {depth,normal:{x:(dx*x.x+dy*y.x)/distance,y:(dx*x.y+dy*y.y)/distance},point:world(car,q)}
}

function velocityAt(car:CivilianVehicle,point:Vector2){
  return {x:car.vel.x-car.spin*(point.y-car.pos.y),y:car.vel.y+car.spin*(point.x-car.pos.x)}
}
function impulse(car:CivilianVehicle,push:Vector2,point:Vector2){
  car.vel.x+=push.x/car.mass;car.vel.y+=push.y/car.mass
  car.spin=clamp(car.spin+cross({x:point.x-car.pos.x,y:point.y-car.pos.y},push)/car.inertia,-2.2,2.2)
  const [forward,side]=axes(car)
  car.pitchSpeed=clamp(car.pitchSpeed+dot(push,forward)/car.mass*.018,-1,1)
  car.rollSpeed=clamp(car.rollSpeed-dot(push,side)/car.mass*.024,-1,1)
}
function rotationalMass(car:CivilianVehicle,point:Vector2,normal:Vector2){
  return cross({x:point.x-car.pos.x,y:point.y-car.pos.y},normal)**2/car.inertia
}
function resolveBoxes(a:CivilianVehicle,b:Box,other?:CivilianVehicle){
  const hit=boxContact(a,b)
  if(!hit)return
  const {normal:n,point}=hit,ia=1/a.mass,ib=other?1/other.mass:0
  const av=velocityAt(a,point),bv=other?velocityAt(other,point):{x:0,y:0}
  const closing=(av.x-bv.x)*n.x+(av.y-bv.y)*n.y
  if(closing<0){
    const amount=-closing/(ia+ib+rotationalMass(a,point,n)+(other?rotationalMass(other,point,n):0))
    impulse(a,{x:n.x*amount,y:n.y*amount},point)
    if(other)impulse(other,{x:-n.x*amount,y:-n.y*amount},point)
  }
  const correction=(hit.depth+.001)/(ia+ib)
  a.pos.x+=n.x*correction*ia;a.pos.y+=n.y*correction*ia
  if(other){other.pos.x-=n.x*correction*ib;other.pos.y-=n.y*correction*ib}
}
function resolveActor(car:CivilianVehicle,actor:ContactVehicle){
  const hit=civilianCircleContact(car,actor)
  if(!hit)return
  const {normal:n,point}=hit,ic=1/car.mass,ia=1/actor.mass,v=velocityAt(car,point)
  const closing=(actor.vel.x-v.x)*n.x+(actor.vel.y-v.y)*n.y
  actor.onContact?.(car,Math.max(0,-closing))
  if(closing<0){
    const amount=-closing*1.04/(ic+ia+rotationalMass(car,point,n))
    impulse(car,{x:-n.x*amount,y:-n.y*amount},point)
    actor.vel.x+=n.x*amount*ia;actor.vel.y+=n.y*amount*ia
  }
  const correction=(hit.depth+.001)/(ic+ia)
  car.pos.x-=n.x*correction*ic;car.pos.y-=n.y*correction*ic
  actor.pos.x+=n.x*correction*ia;actor.pos.y+=n.y*correction*ia
}

const bounds:Wall[]=[{x:-200,y:-200,width:200,height:FIELD.height+400},{x:FIELD.width,y:-200,width:200,height:FIELD.height+400},
  {x:0,y:-200,width:FIELD.width,height:200},{x:0,y:FIELD.height,width:FIELD.width,height:200}]

/** Heavy unpowered bodies: tires roll longitudinally, scrub sideways, and stop
 * rapidly. Fixed substeps prevent fast impacts skipping narrow obstructions. */
export function stepCivilianVehicles(cars:CivilianVehicle[],walls:Wall[],dt:number,actors:ContactVehicle[]=[]){
  if(dt<=0)return
  const solids=[...walls,...bounds].map(wallBox)
  for(let remaining=Math.min(dt,.1);remaining>1e-8;){
    const step=Math.min(remaining,1/120);remaining-=step
    for(const car of cars){
      const [forward,side]=axes(car),rough=terrainAt(car.pos).roughness
      const along=dot(car.vel,forward)*Math.exp(-(3.6+rough*3)*step)
      const across=dot(car.vel,side)*Math.exp(-(9+rough*3)*step)
      car.vel.x=forward.x*along+side.x*across;car.vel.y=forward.y*along+side.y*across
      car.spin*=Math.exp(-7*step)
      if(Math.hypot(car.vel.x,car.vel.y)<.06){car.vel.x=0;car.vel.y=0}
      if(Math.abs(car.spin)<.0005)car.spin=0
      const old={...car.pos},angle=car.angle
      car.pos.x+=car.vel.x*step;car.pos.y+=car.vel.y*step;car.angle+=car.spin*step
      // Actors push back; parked vehicles never become a traversable surface.
      for(const actor of actors)resolveActor(car,actor)
      for(let pass=0;pass<3;pass++)for(const solid of solids)resolveBoxes(car,solid)
      const travel=(car.pos.x-old.x)*forward.x+(car.pos.y-old.y)*forward.y,turn=car.angle-angle
      car.leftTravel+=travel+turn*car.width/2;car.rightTravel+=travel-turn*car.width/2
      car.steer+=(clamp(car.spin*.22,-.22,.22)-car.steer)*(1-Math.exp(-9*step))
      car.rollSpeed+=(-100*car.roll-14*car.rollSpeed)*step;car.roll+=car.rollSpeed*step
      car.pitchSpeed+=(-100*car.pitch-14*car.pitchSpeed)*step;car.pitch+=car.pitchSpeed*step
      car.hit=Math.max(0,car.hit-step*5)
    }
    for(let pass=0;pass<3;pass++){
      for(let i=0;i<cars.length;i++)for(let j=i+1;j<cars.length;j++)resolveBoxes(cars[i],cars[j],cars[j])
      for(const car of cars)for(const solid of solids)resolveBoxes(car,solid)
    }
  }
}

/** Swept, nearest-surface hit: a building in front shields a car, and a shot
 * cannot shove several cars or pass through its current rotated silhouette. */
export function hitCivilianBullet(cars:CivilianVehicle[],walls:Wall[],from:Vector2,to:Vector2,velocity:Vector2,enemy=false){
  let first=Infinity,car:CivilianVehicle|undefined
  for(const wall of walls){const t=segmentEntry(from,to,wall);if(t!==null)first=Math.min(first,t)}
  for(const candidate of cars){
    const t=segmentEntry(from,to,civilianCover(candidate))
    if(t!==null&&t<first){first=t;car=candidate}
  }
  if(!car)return null
  const point={x:from.x+(to.x-from.x)*first,y:from.y+(to.y-from.y)*first},speed=Math.hypot(velocity.x,velocity.y)
  if(speed>0){const force=(enemy?135:75)/speed;impulse(car,{x:velocity.x*force,y:velocity.y*force},point)}
  car.hit=.55
  return {car,point}
}
