import assert from 'node:assert/strict'
import test from 'node:test'
import { createVehicleVisuals, stepVehicleVisuals, vehiclePose } from '../src/games/urbanFire/appearance.ts'

const jeep = () => ({pos:{x:100,y:200},vel:{x:0,y:0},angle:0,health:3,state:'active',explodeTime:0,wheelAngle:0,hitFlash:0})

test('suspension reacts to acceleration and turning, then settles without changing the vehicle', () => {
  const vehicle=jeep(), visuals=createVehicleVisuals(), pose=vehiclePose(visuals,vehicle)
  pose.steeringInput=1
  const parked=structuredClone(vehicle)
  for(let i=0;i<30;i++)stepVehicleVisuals(visuals,[[vehicle,'jeep']],1/60)
  assert.ok(pose.steer>.58 && pose.steer<.61,'front wheels turn fully while the jeep is parked')
  assert.deepEqual(vehicle,parked)
  assert.equal(pose.leftTravel,0);assert.equal(pose.rightTravel,0)
  vehicle.vel.x=80;vehicle.angle=.08
  const before=structuredClone(vehicle)
  stepVehicleVisuals(visuals,[[vehicle,'jeep']],.02)
  assert.ok(pose.pitch>0);assert.ok(pose.roll<0);assert.ok(pose.steer>0)
  assert.deepEqual(vehicle,before)
  vehicle.vel={x:0,y:0}
  pose.steeringInput=0
  for(let i=0;i<120;i++)stepVehicleVisuals(visuals,[[vehicle,'jeep']],1/60)
  assert.ok(Math.abs(pose.pitch)<1e-6);assert.ok(Math.abs(pose.roll)<1e-6);assert.ok(Math.abs(pose.steer)<1e-6)
})

test('reverse wheels and pivoting tank tracks follow signed travel across angle wrap', () => {
  const vehicle=jeep(),visuals=createVehicleVisuals(),pose=vehiclePose(visuals,vehicle)
  vehicle.vel.x=-60
  stepVehicleVisuals(visuals,[[vehicle,'jeep']],.1)
  assert.equal(pose.leftTravel,-6);assert.equal(pose.rightTravel,-6)
  vehicle.vel.x=0;vehicle.angle=Math.PI-.02;pose.angle=vehicle.angle
  pose.leftTravel=0;pose.rightTravel=0
  vehicle.angle=-Math.PI+.02
  stepVehicleVisuals(visuals,[[vehicle,'tank']],.04)
  assert.ok(pose.leftTravel>0 && pose.leftTravel<1)
  assert.ok(pose.rightTravel<0 && pose.rightTravel> -1)
  const belts=[pose.leftTravel,pose.rightTravel]
  stepVehicleVisuals(visuals,[[vehicle,'tank']],.1)
  assert.deepEqual([pose.leftTravel,pose.rightTravel],belts)
})

test('damage particles inherit motion, drift independently, and leave gameplay randomness untouched', () => {
  const vehicle={...jeep(),health:2},visuals=createVehicleVisuals()
  vehiclePose(visuals,vehicle);vehicle.health=1;vehicle.vel.x=120
  const random=Math.random
  Math.random=()=>{throw new Error('presentation must not consume gameplay randomness')}
  try { stepVehicleVisuals(visuals,[[vehicle,'tank']],1/60) } finally { Math.random=random }
  assert.ok(visuals.sparks.length>0);assert.equal(vehiclePose(visuals,vehicle).hit,1)
  const spark=visuals.sparks[0],start={...spark.pos},velocity={...spark.vel}
  vehicle.pos.x+=1000
  stepVehicleVisuals(visuals,[[vehicle,'tank']],.02)
  assert.ok(Math.abs(spark.pos.x-start.x-velocity.x*.02)<1e-8)
  assert.ok(Math.abs(spark.pos.y-start.y-velocity.y*.02)<1e-8)
  vehicle.health=2
  for(let i=0;i<60;i++)stepVehicleVisuals(visuals,[[vehicle,'tank']],1/60)
  assert.equal(visuals.sparks.length,0)
})

test('jeep smokes only at two armor, smokes much worse at one, and smoke freezes on pause and disperses after repair',()=>{
  const run=health=>{
    const vehicle={...jeep(),health},visuals=createVehicleVisuals()
    for(let i=0;i<90;i++)stepVehicleVisuals(visuals,[[vehicle,'jeep']],1/60)
    return {vehicle,visuals}
  }
  const random=Math.random
  Math.random=()=>{throw new Error('damage smoke must not consume combat randomness')}
  let light,heavy
  try{
    for(const health of [3,4,5,6])assert.equal(run(health).visuals.smoke.length,0,'damaged upgraded armor above two does not smoke')
    light=run(2);heavy=run(1)
  }finally{Math.random=random}
  assert.equal(light.visuals.sparks.length,0);assert.equal(heavy.visuals.sparks.length,0)
  assert.ok(light.visuals.smoke.length>0 && heavy.visuals.smoke.length>=light.visuals.smoke.length*3)
  assert.ok(heavy.visuals.smoke[0].radius>light.visuals.smoke[0].radius*2)
  const {vehicle,visuals}=heavy,puff=visuals.smoke.at(-1),start={...puff.pos}
  const frozen=structuredClone({smoke:visuals.smoke,pose:vehiclePose(visuals,vehicle),time:visuals.time})
  stepVehicleVisuals(visuals,[[vehicle,'jeep']],0)
  assert.deepEqual({smoke:visuals.smoke,pose:vehiclePose(visuals,vehicle),time:visuals.time},frozen)
  vehicle.pos.x+=1000;vehicle.health=3
  stepVehicleVisuals(visuals,[[vehicle,'jeep']],.1)
  assert.ok(puff.pos.x>start.x && puff.pos.x<start.x+2,'emitted smoke drifts instead of following the repaired jeep')
  for(let i=0;i<150;i++)stepVehicleVisuals(visuals,[[vehicle,'jeep']],1/60)
  assert.equal(visuals.smoke.length,0);assert.equal(visuals.sparks.length,0)
})

test('zero elapsed time freezes poses, recoil and particles; helicopter bank follows lateral flight', () => {
  const vehicle={...jeep(),vel:{x:70,y:90}},visuals=createVehicleVisuals()
  const pose=vehiclePose(visuals,vehicle)
  stepVehicleVisuals(visuals,[[vehicle,'helicopter']],.1)
  assert.ok(pose.roll>0);assert.ok(pose.pitch<0)
  pose.recoil=1
  const before=structuredClone({time:visuals.time,pose,sparks:visuals.sparks})
  stepVehicleVisuals(visuals,[[vehicle,'helicopter']],0)
  assert.deepEqual({time:visuals.time,pose,sparks:visuals.sparks},before)
})
