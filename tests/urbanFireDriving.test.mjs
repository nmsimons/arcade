import assert from 'node:assert/strict'
import test from 'node:test'
import { driveJeep, steerJeep } from '../src/games/urbanFire/driving.ts'

const jeep=()=>({pos:{x:800,y:902},vel:{x:0,y:0},angle:0,health:3,state:'active',explodeTime:0,wheelAngle:0,hitFlash:0})
const input={turn:1,forward:0,reverse:0}

test('steering alone cannot move or rotate a stopped jeep at any heading',()=>{
  for(const angle of [0,.72,-Math.PI/2,Math.PI])for(const turn of [-1,1]){
    const car=jeep();car.angle=angle
    const before=structuredClone(car)
    for(let i=0;i<120;i++)driveJeep(car,{...input,turn},1/60)
    assert.deepEqual(car,before)
  }
})

test('steering follows forward or reverse coasting, with gradual authority at low speed',()=>{
  const forward=jeep(),reverse=jeep(),creeping=jeep()
  forward.vel.x=90;reverse.vel.x=-90;creeping.vel.x=12
  for(const car of [forward,reverse,creeping])driveJeep(car,input,1/60)
  assert.ok(forward.angle>0&&reverse.angle<0)
  assert.ok(Math.abs(forward.angle+reverse.angle)<1e-10)
  assert.ok(creeping.angle>0&&creeping.angle<forward.angle*.3)
  const braking=jeep();braking.vel.x=70
  driveJeep(braking,{...input,reverse:1},1/60)
  assert.ok(braking.angle>0,'reverse input does not reverse steering until travel reverses')
})

test('launching in either direction starts steering only as the jeep starts rolling',()=>{
  for(const direction of [-1,1]){
    const car=jeep()
    for(let i=0;i<30;i++)driveJeep(car,{turn:.5,forward:direction>0?1:0,reverse:direction<0?1:0},1/120)
    assert.ok((car.pos.x-800)*direction>1)
    assert.ok(car.angle*direction>0)
    const before=structuredClone(car)
    driveJeep(car,{turn:1,forward:1,reverse:0},0)
    assert.deepEqual(car,before)
  }
})

test('resolved collisions and sideways displacement cannot create an in-place pivot',()=>{
  for(const dt of [1/30,1/60,1/120]){
    const car=jeep()
    for(let i=0;i<120;i++){
      const pos={...car.pos},angle=car.angle
      driveJeep(car,{...input,forward:1},dt)
      // A wall rejects forward travel even while the engine builds velocity.
      car.pos={...pos};car.vel.x*=.5
      steerJeep(car,input.turn,dt,pos,angle)
      assert.equal(car.angle,0)
    }
  }
  const sideways=jeep(),pos={...sideways.pos}
  sideways.pos.y+=3
  steerJeep(sideways,1,1/60,pos,0)
  assert.equal(sideways.angle,0)
})
