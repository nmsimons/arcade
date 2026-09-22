import { CITY } from './cityPlan.ts'
import { createTankBrain } from './ai.ts'
import { clear, distance, openPoint } from './navigation.ts'
import { FIELD, viewportScale } from './types.ts'
import type { Helicopter, Tank, Vector2, Wall } from './types'

export const TANK_DROP = { height:180, descent:2.6, settle:.8, warning:1.25, stagger:.85 } as const
export const tankGrounded=(tank:Tank)=>tank.state==='active'||(tank.state==='incoming'&&!!tank.arrival?.landed)
export const tanksRemaining=(tanks:Tank[])=>tanks.some(tank=>tank.state!=='exploding')

/** Start beyond both the camera and the district, including ultrawide screens
 * and a camera parked at the perimeter. Rotor tips are also fully off screen. */
export function createHelicopterReinforcements(wave:number,player:Vector2,viewport:{width:number;height:number},random:()=>number=Math.random):Helicopter[]{
  const count=wave>=2?Math.min(1+Math.floor((wave-1)/2),3):0
  const scale=viewportScale(viewport.width,viewport.height),halfWidth=viewport.width/scale/2,halfHeight=viewport.height/scale/2
  const sides=[0,1,2,3]
  for(let i=sides.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[sides[i],sides[j]]=[sides[j],sides[i]]}
  return sides.slice(0,count).map((side,i)=>{
    const along=.2+random()*.6
    const entry=side<2?{x:FIELD.width*along,y:side===0?60:FIELD.height-60}:
      {x:side===2?60:FIELD.width-60,y:FIELD.height*along}
    const pos=side<2?{x:entry.x,y:side===0?Math.min(0,player.y-halfHeight)-180:Math.max(FIELD.height,player.y+halfHeight)+180}:
      {x:side===2?Math.min(0,player.x-halfWidth)-180:Math.max(FIELD.width,player.x+halfWidth)+180,y:entry.y}
    const angle=Math.atan2(entry.y-pos.y,entry.x-pos.x)
    return {pos,entry,vel:{x:Math.cos(angle)*130,y:Math.sin(angle)*130},angle,state:'incoming',explodeTime:0,
      shootCooldown:1800+random()*1200,rotorAngle:0,soundTimer:0,losTimeMs:0,orbit:i%2?-1:1,recoil:0}
  })
}

export function stepHelicopterArrival(heli:Helicopter,dt:number){
  if(heli.state!=='incoming'||!heli.entry||dt<=0)return
  const remaining=distance(heli.pos,heli.entry),travel=Math.min(remaining,130*dt)
  if(remaining>0){
    heli.vel={x:(heli.entry.x-heli.pos.x)/remaining*130,y:(heli.entry.y-heli.pos.y)/remaining*130}
    heli.pos.x+=heli.vel.x*travel/130;heli.pos.y+=heli.vel.y*travel/130
  }
  heli.rotorAngle+=dt*24
  if(remaining<=travel){heli.state='active';heli.entry=undefined}
}

export function createTankReinforcements(wave:number,player:Vector2,walls:Wall[],random:()=>number=Math.random):Tank[]{
  const count=Math.min(2+Math.floor(wave/2),4)
  const entries=CITY.entries.filter(({pos})=>distance(pos,player)>450&&openPoint(pos,walls,32))
  // Fisher-Yates gives every clear street entrance a fair chance, without ever
  // reusing a landing site within the same wave.
  for(let i=entries.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[entries[i],entries[j]]=[entries[j],entries[i]]}
  return entries.slice(0,count).map(({pos,angle},role)=>({
    pos:{...pos},vel:{x:0,y:0},angle,turretAngle:angle,health:2,state:'incoming',explodeTime:0,
    shootCooldown:1800+random()*1200,trackOffset:0,losTimeMs:0,role,brain:createTankBrain(),recoil:0,
    arrival:{elapsed:-TANK_DROP.warning-role*TANK_DROP.stagger,height:TANK_DROP.height,landed:false},
  }))
}

type GroundActor={pos:Vector2;radius:number}
/** Airborne reinforcements have no ground collisions or weapons. If something
 * enters the marked site, the chute glides along the clear street before landing. */
export function stepTankArrival(tank:Tank,dt:number,walls:Wall[],actors:GroundActor[]){
  const arrival=tank.arrival
  if(tank.state!=='incoming'||!arrival||dt<=0)return false
  const previousElapsed=arrival.elapsed
  arrival.elapsed+=dt
  if(arrival.elapsed<0)return false
  if(!arrival.landed){
    const safe=(pos:Vector2)=>openPoint(pos,walls,30)&&actors.every(actor=>distance(pos,actor.pos)>actor.radius+36)
    if(!safe(tank.pos)){
      // Only glide over a continuous clear lane; never snap to another site.
      for(const offset of [64,-64,128,-128,192,-192]){
        const target={x:tank.pos.x+Math.cos(tank.angle)*offset,y:tank.pos.y+Math.sin(tank.angle)*offset}
        if(!safe(target)||!clear(tank.pos,target,walls,30))continue
        const travel=Math.min(Math.abs(offset),65*dt)*Math.sign(offset)
        tank.pos.x+=Math.cos(tank.angle)*travel;tank.pos.y+=Math.sin(tank.angle)*travel
        break
      }
      // Keep the suspended hull clear of traffic until there is room below it.
      if(!safe(tank.pos))arrival.elapsed=Math.min(arrival.elapsed,Math.max(previousElapsed,TANK_DROP.descent-.5))
    }
    arrival.height=TANK_DROP.height*Math.max(0,1-arrival.elapsed/TANK_DROP.descent)
    if(arrival.elapsed>=TANK_DROP.descent){arrival.landed=true;return true}
  }
  if(arrival.landed&&arrival.elapsed>=TANK_DROP.descent+TANK_DROP.settle){
    tank.state='active';tank.arrival=undefined
  }
  return false
}
