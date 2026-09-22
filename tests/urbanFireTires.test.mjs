import assert from 'node:assert/strict'
import test from 'node:test'
import { driveJeep } from '../src/games/urbanFire/driving.ts'
import { CITY } from '../src/games/urbanFire/cityPlan.ts'
import { createTireEffects, stepTireEffects, SKID_LIFETIME } from '../src/games/urbanFire/tireEffects.ts'

const jeep=()=>({pos:{x:608,y:550},vel:{x:100,y:0},angle:0,state:'active',wheelAngle:0})
const corner=(fps=60)=>{
  const vehicle=jeep(),effects=createTireEffects(),dt=1/fps
  stepTireEffects(effects,vehicle,dt)
  for(let i=0;i<fps*.5;i++){
    driveJeep(vehicle,{turn:1,forward:1,reverse:0},dt)
    stepTireEffects(effects,vehicle,dt)
  }
  return {vehicle,effects}
}

test('fast corners leave two grounded tire tracks at different frame rates without changing gameplay',()=>{
  const random=Math.random
  Math.random=()=>{throw new Error('tire effects must not consume gameplay randomness')}
  try{
    for(const fps of [30,60,120]){
      const {vehicle,effects}=corner(fps)
      assert.ok(effects.marks.length>10);assert.ok(effects.squeal>.8&&effects.squeal<=1)
      assert.ok(effects.contacts.every(Boolean),'both rear tires leave tracks')
      const [left,right]=effects.contacts
      assert.ok(Math.abs(Math.hypot(left.x-right.x,left.y-right.y)-18)<2)
      for(const mark of effects.marks){
        assert.ok(Math.hypot(mark.to.x-mark.from.x,mark.to.y-mark.from.y)<14)
        assert.ok(mark.strength>0&&mark.strength<=1)
      }
      const before=structuredClone(vehicle)
      stepTireEffects(effects,vehicle,1/fps)
      assert.deepEqual(vehicle,before)
    }
  }finally{Math.random=random}
})

test('parked, blocked, straight and slow driving stay quiet and leave no rubber',()=>{
  for(const mode of ['parked','blocked','straight','slow']){
    const vehicle=jeep(),effects=createTireEffects()
    if(mode==='slow')vehicle.vel={x:20,y:0}
    for(let i=0;i<60;i++){
      if(mode==='straight'||mode==='slow')driveJeep(vehicle,{turn:mode==='slow'?1:0,forward:mode==='slow'?0:1,reverse:0},1/60)
      // A blocked vehicle may still carry velocity/throttle, but cannot move.
      if(mode==='parked')vehicle.vel={x:0,y:0}
      stepTireEffects(effects,vehicle,1/60)
    }
    assert.equal(effects.marks.length,0,mode);assert.equal(effects.squeal,0,mode)
  }
})

test('tracks freeze on pause, fade away, and never join across a stop or teleport',()=>{
  const {vehicle,effects}=corner(),snapshot=structuredClone(effects)
  stepTireEffects(effects,vehicle,0);assert.deepEqual(effects,snapshot)
  for(let i=0;i<60;i++)stepTireEffects(effects,vehicle,1/60)
  assert.equal(effects.squeal,0);assert.deepEqual(effects.contacts,[null,null])
  assert.deepEqual(effects.marks.map(m=>[m.from,m.to]),snapshot.marks.map(m=>[m.from,m.to]))
  vehicle.pos={x:1312,y:902}
  stepTireEffects(effects,vehicle,1/60)
  assert.equal(effects.marks.length,snapshot.marks.length)
  for(let i=0;i<60*SKID_LIFETIME;i++)stepTireEffects(effects,vehicle,1/60)
  assert.equal(effects.marks.length,0)
})

test('grass and bare lots do not receive asphalt skids or squeal',()=>{
  for(const lot of CITY.lots.filter(lot=>lot.kind==='grass'||lot.kind==='vacant')){
    const vehicle=jeep(),effects=createTireEffects()
    vehicle.pos={x:lot.x+lot.width/2,y:lot.y+lot.height/2}
    vehicle.angle=Math.PI/2
    stepTireEffects(effects,vehicle,1/60)
    for(let i=0;i<5;i++){vehicle.pos.x+=1.5;stepTireEffects(effects,vehicle,1/60)}
    assert.equal(effects.marks.length,0);assert.equal(effects.squeal,0)
  }
})
