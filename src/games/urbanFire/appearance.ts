import { angleDelta, clamp } from './navigation.ts'
import type { Helicopter, Jeep, Tank, Vector2 } from './types'
import { JEEP_MAX_HEALTH, JEEP_TUNING } from './types.ts'
import { rotX, rotY, rotZ } from '../hardVacuum/math.ts'
import type { V3 } from '../model3d'
import { contactDimensions, vehicleTerrain } from './terrain.ts'
import { createTireEffects, stepTireEffects } from './tireEffects.ts'

export type Vehicle = Jeep | Tank | Helicopter
export type VehicleKind = 'jeep' | 'tank' | 'helicopter'
export type VehiclePose = {
  roll: number; pitch: number; steer: number; steeringInput: number; speed: number
  leftTravel: number; rightTravel: number; recoil: number; hit: number
  angle: number; velocity: Vector2; health: number; damageDelay: number; sequence: number
  groundRoll: number; groundPitch: number; lift: number; liftVelocity: number; suspension: number[]; roughness: number
}
export type Spark = { pos: Vector2; vel: Vector2; age: number; life: number; length: number }
export type DamageSmoke = { pos: Vector2; vel: Vector2; age: number; life: number; radius: number; severity: number }
export const createVehicleVisuals = () => ({ time: 0, poses: new WeakMap<Vehicle, VehiclePose>(), sparks: [] as Spark[],
  smoke: [] as DamageSmoke[], tires:createTireEffects() })
export type VehicleVisuals = ReturnType<typeof createVehicleVisuals>
export function vehiclePose(visuals: VehicleVisuals, vehicle: Vehicle): VehiclePose {
  let pose = visuals.poses.get(vehicle)
  if (!pose) {
    pose = { roll: 0, pitch: 0, steer: 0, steeringInput: 0, speed: 0, leftTravel: 0, rightTravel: 0, recoil: 0, hit: 0,
      angle: vehicle.angle, velocity: { ...vehicle.vel }, health: 'health' in vehicle ? vehicle.health : 1, damageDelay: 0, sequence: 0,
      groundRoll:0,groundPitch:0,lift:0,liftVelocity:0,suspension:[0,0,0,0],roughness:0 }
    visuals.poses.set(vehicle, pose)
  }
  return pose
}
export const vehicleAngles = (vehicle: Vehicle, pose: VehiclePose): V3 => [pose.roll, pose.pitch, vehicle.angle]
export function projectVehicle(point: V3, angles: V3): Vector2 {
  const p = rotZ(rotY(rotX(point, angles[0]), angles[1]), angles[2]), scale = 420 / (420 + p[2])
  return { x: p[0] * scale, y: p[1] * scale }
}
export const vehicleDamage = (vehicle: Vehicle, kind: VehicleKind) =>
  'health' in vehicle ? clamp(1 - vehicle.health / (kind === 'jeep' ? JEEP_MAX_HEALTH : 2), 0, 1) : 0

// Presentation owns its clock and particles. Drawing cannot advance combat or
// consume its random sequence, and pausing leaves every visual exactly still.
export function stepVehicleVisuals(visuals: VehicleVisuals, vehicles: readonly (readonly [Vehicle, VehicleKind])[], dt: number) {
  if (dt <= 0) return
  visuals.time += dt
  visuals.sparks = visuals.sparks.filter(spark => {
    spark.age += dt
    spark.pos.x += spark.vel.x * dt; spark.pos.y += spark.vel.y * dt
    return spark.age < spark.life
  })
  visuals.smoke=visuals.smoke.filter(smoke=>{
    smoke.age+=dt
    // Existing puffs drift independently after the jeep moves or is repaired.
    const drag=Math.exp(-2*dt),travel=(1-drag)/2
    smoke.pos.x+=5*dt+smoke.vel.x*travel;smoke.pos.y-=3*dt-smoke.vel.y*travel
    smoke.vel.x*=drag;smoke.vel.y*=drag
    return smoke.age<smoke.life
  })
  for (const [vehicle, kind] of vehicles) {
    if(kind==='jeep')stepTireEffects(visuals.tires,vehicle as Jeep,dt)
    const pose = vehiclePose(visuals, vehicle)
    if (vehicle.state !== 'active' && !(kind==='helicopter'&&vehicle.state==='incoming')) continue
    const c = Math.cos(vehicle.angle), s = Math.sin(vehicle.angle)
    const forward = vehicle.vel.x * c + vehicle.vel.y * s
    const sideways = -vehicle.vel.x * s + vehicle.vel.y * c
    const turn = angleDelta(vehicle.angle, pose.angle) / dt
    const acceleration = ((vehicle.vel.x - pose.velocity.x) * c + (vehicle.vel.y - pose.velocity.y) * s) / dt
    const ease = 1 - Math.exp(-8 * dt)
    const flying = kind === 'helicopter'
    if(!flying){
      const surface=vehicleTerrain(vehicle.pos,vehicle.angle,kind)
      pose.roughness=surface.roughness
      const groundEase=1-Math.exp(-20*dt)
      pose.groundRoll+=(surface.roll-pose.groundRoll)*groundEase
      pose.groundPitch+=(surface.pitch-pose.groundPitch)*groundEase
      // A damped vertical spring adds a short settling bounce at a crest or dip.
      // Substeps keep the same stable suspension at low and high frame rates.
      for(let remaining=dt;remaining>1e-8;){
        const step=Math.min(remaining,1/120)
        pose.liftVelocity+=((surface.height-pose.lift)*100-pose.liftVelocity*14)*step
        pose.lift+=pose.liftVelocity*step;remaining-=step
      }
      const {axle,halfWidth}=contactDimensions(kind)
      for(let i=0;i<4;i++){
        const x=i%2?axle:-axle,y=i<2?-halfWidth:halfWidth
        const plane=pose.lift+x*Math.sin(pose.groundPitch)-y*Math.sin(pose.groundRoll)
        const travel=clamp(plane-surface.heights[i],-3,3)
        pose.suspension[i]+=(travel-pose.suspension[i])*(1-Math.exp(-16*dt))
      }
    }
    const roll = flying ? clamp(sideways / 220 + turn * .09, -.26, .26)
      : clamp(-turn * forward / (kind === 'jeep' ? 2200 : 4200), -.13, .13)+pose.groundRoll
    const pitch = flying ? clamp(-forward / 650, -.2, .2) : clamp(acceleration / 3500, -.075, .075)+pose.groundPitch
    pose.roll += (roll - pose.roll) * ease; pose.pitch += (pitch - pose.pitch) * ease
    // The front axle follows the driver even while parked or blocked. Reverse
    // changes the body's yaw direction, not which way the tires are pointed.
    const steering=kind==='jeep'?clamp(pose.steeringInput,-1,1)*JEEP_TUNING.wheelSteerAngle:0
    pose.steer += (steering-pose.steer)*(1-Math.exp(-12*dt))
    pose.speed = forward
    // Opposing belts move during a pivot; reversing rolls the treads backward.
    const halfAxle = kind === 'tank' ? 13 : 9
    pose.leftTravel += (forward + turn * halfAxle) * dt
    pose.rightTravel += (forward - turn * halfAxle) * dt
    pose.hit = Math.max(0, pose.hit - dt * 4)
    pose.recoil = Math.max(0, pose.recoil - dt * 7)
    const health = 'health' in vehicle ? vehicle.health : 1
    if (health < pose.health) { pose.hit = 1; pose.damageDelay = 0 }
    pose.health = health; pose.angle = vehicle.angle; pose.velocity = { ...vehicle.vel }
    const damage = vehicleDamage(vehicle, kind)
    // Smoke warns about hits remaining, regardless of the upgraded capacity.
    const emission=kind==='jeep'?(health<=1?1:health<=2?.25:0):damage
    pose.damageDelay -= dt
    if (emission > 0 && pose.damageDelay <= 0) {
      pose.damageDelay = kind==='jeep' ? emission===1?.065:.24 : .8-damage*.65
      if(kind==='jeep'){
        const sequence=++pose.sequence
        const origin=projectVehicle([7,Math.sin(sequence*2.4)*1.5,-5],vehicleAngles(vehicle,pose))
        visuals.smoke.push({pos:{x:vehicle.pos.x+origin.x,y:vehicle.pos.y+origin.y-pose.lift*.65},
          vel:{x:vehicle.vel.x*.35+Math.sin(sequence*7.1)*3,y:vehicle.vel.y*.35+Math.cos(sequence*4.7)*2},
          age:0,life:emission===1?2.2:1.2,radius:emission===1?4.2:1.8,severity:emission})
      }else for (let i = 0; i < 2 + Math.floor(damage * 5); i++) {
        const sequence = ++pose.sequence, side = sequence % 2 ? -1 : 1
        const origin = projectVehicle([-7, side * 5, -4], vehicleAngles(vehicle, pose))
        const angle = vehicle.angle + side * Math.PI / 2 + Math.sin(sequence * 2.4)
        const speed = 25 + damage * 40 + (Math.sin(sequence * 7.1) + 1) * 12
        visuals.sparks.push({ pos: { x: vehicle.pos.x + origin.x, y: vehicle.pos.y + origin.y-pose.lift*.65 },
          vel: { x: vehicle.vel.x + Math.cos(angle) * speed, y: vehicle.vel.y + Math.sin(angle) * speed },
          age: 0, life: .22 + damage * .2, length: 2 + damage * 2 })
      }
    }
  }
  if (visuals.sparks.length > 96) visuals.sparks.splice(0, visuals.sparks.length - 96)
  if (visuals.smoke.length > 48) visuals.smoke.splice(0, visuals.smoke.length - 48)
}
