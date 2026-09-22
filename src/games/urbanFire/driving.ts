import { JEEP_TUNING } from './types.ts'
import type { Jeep, Vector2 } from './types'
import { applyTerrainResistance, vehicleTerrain } from './terrain.ts'

/** Turn from actual longitudinal travel, not throttle or sideways sliding.
 * The game reapplies this after collision resolution, so a blocked jeep cannot
 * pivot against a wall even if its engine is still trying to accelerate. */
export function steerJeep(jeep:Jeep,turn:number,dt:number,previousPosition:Vector2,previousAngle:number){
  if(dt<=0)return
  const travel=(jeep.pos.x-previousPosition.x)*Math.cos(previousAngle)+(jeep.pos.y-previousPosition.y)*Math.sin(previousAngle)
  const speed=travel/dt
  const authority=Math.max(0,Math.min(1,(Math.abs(speed)-JEEP_TUNING.steeringStopSpeed)/
    (JEEP_TUNING.steeringFullSpeed-JEEP_TUNING.steeringStopSpeed)))
  jeep.angle=previousAngle+turn*JEEP_TUNING.turnSpeed*authority*Math.sign(speed)*dt
}

/** Free driving shared by the game and movement checks. Solid collisions and
 * arena bounds remain the caller's responsibility after this movement step. */
export function driveJeep(jeep:Jeep,input:{turn:number;forward:number;reverse:number},dt:number){
  if(dt<=0)return Math.hypot(jeep.vel.x,jeep.vel.y)
  const {turn,forward,reverse}=input
  const previousPosition={...jeep.pos},previousAngle=jeep.angle
  const thrust=JEEP_TUNING.accelForward*(forward-reverse*JEEP_TUNING.accelReverseFactor)*dt
  jeep.vel.x+=Math.cos(jeep.angle)*thrust;jeep.vel.y+=Math.sin(jeep.angle)*thrust
  const speed=Math.hypot(jeep.vel.x,jeep.vel.y)
  if(speed>JEEP_TUNING.driftSpeedThreshold){
    const velAngle=Math.atan2(jeep.vel.y,jeep.vel.x)
    const heading=Math.cos(velAngle-jeep.angle)<0?jeep.angle+Math.PI:jeep.angle
    let diff=heading-velAngle
    while(diff>Math.PI)diff-=Math.PI*2
    while(diff< -Math.PI)diff+=Math.PI*2
    const grip=Math.max(JEEP_TUNING.gripMin,JEEP_TUNING.gripBase-speed*JEEP_TUNING.gripSpeedFactor)
    const aligned=velAngle+diff*(1-Math.pow(1-grip,dt*60))
    jeep.vel.x=Math.cos(aligned)*speed;jeep.vel.y=Math.sin(aligned)*speed
  }
  const friction=Math.pow(JEEP_TUNING.friction,dt*60)
  jeep.vel.x*=friction;jeep.vel.y*=friction
  applyTerrainResistance(jeep.vel,vehicleTerrain(jeep.pos,jeep.angle,'jeep').roughness,dt)
  const actual=Math.hypot(jeep.vel.x,jeep.vel.y),limited=Math.min(actual,JEEP_TUNING.maxSpeed)
  if(actual>JEEP_TUNING.maxSpeed){
    jeep.vel.x*=limited/actual;jeep.vel.y*=limited/actual
  }
  jeep.wheelAngle+=limited*dt*JEEP_TUNING.wheelSpinFactor
  jeep.pos.x+=jeep.vel.x*dt;jeep.pos.y+=jeep.vel.y*dt
  steerJeep(jeep,turn,dt,previousPosition,previousAngle)
  return limited
}
