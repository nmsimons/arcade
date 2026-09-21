import assert from 'node:assert/strict'
import test from 'node:test'
import { createCollisionFeedback, closingImpactSpeed, stepCollisionFeedback } from '../src/games/urbanFire/collisionFeedback.ts'
import { COLLISION_SOUND_SECONDS, fillCollisionSound } from '../src/games/urbanFire/collisionSound.ts'
import { createStaticCityWalls } from '../src/games/urbanFire/battlefield.ts'
import { CITY } from '../src/games/urbanFire/cityPlan.ts'
import { createCivilianVehicles, stepCivilianVehicles } from '../src/games/urbanFire/civilianVehicles.ts'

test('impact force measures only relative speed into the contact, including a ram into a stationary jeep',()=>{
  assert.equal(closingImpactSpeed({x:100,y:0},{x:-3,y:0}),100)
  assert.equal(closingImpactSpeed({x:0,y:100},{x:-3,y:0}),0,'tangential sliding is not a new crash')
  assert.equal(closingImpactSpeed({x:-100,y:0},{x:-3,y:0}),0,'separating bodies stay quiet')
  assert.equal(closingImpactSpeed({x:0,y:0},{x:-1,y:0},{x:-65,y:0}),65)
  assert.equal(closingImpactSpeed({x:75,y:0},{x:-1,y:0},{x:60,y:0}),15,'cars traveling together have little relative impact')
})

test('sustained contacts and solver jitter stay quiet; separating rearms a new collision at common frame rates',()=>{
  for(const fps of [30,60,120]){
    const feedback=createCollisionFeedback(),body={},hit={body,material:'masonry',speed:90},dt=1/fps
    let played=0
    for(let i=0;i<fps;i++)if(stepCollisionFeedback(feedback,[hit,hit],dt))played++
    assert.equal(played,1)
    stepCollisionFeedback(feedback,[],.05)
    assert.equal(stepCollisionFeedback(feedback,[hit],dt),null,'tiny contact gaps do not retrigger')
    const frozen=structuredClone(feedback)
    assert.equal(stepCollisionFeedback(feedback,[],0),null);assert.deepEqual(feedback,frozen)
    stepCollisionFeedback(feedback,[],.3)
    assert.ok(stepCollisionFeedback(feedback,[hit],dt))
    stepCollisionFeedback(feedback,[],2.1);assert.equal(feedback.contacts.size,0)
  }
})

test('gentle touches stay quiet, harder impacts grow louder, and simultaneous corners produce one strongest sound',()=>{
  const hit=(speed,material='metal',body={})=>({body,material,speed})
  assert.equal(stepCollisionFeedback(createCollisionFeedback(),[hit(8)],1/60),null)
  const light=stepCollisionFeedback(createCollisionFeedback(),[hit(25)],1/60)
  const heavy=stepCollisionFeedback(createCollisionFeedback(),[hit(110)],1/60)
  assert.ok(light.strength<heavy.strength/2)
  const feedback=createCollisionFeedback(),same={}
  const chosen=stepCollisionFeedback(feedback,[hit(35,'masonry',same),hit(85,'masonry',same),hit(130,'armor')],1/60)
  assert.equal(chosen.material,'armor');assert.equal(chosen.strength,1)
  assert.equal(stepCollisionFeedback(feedback,[hit(150)],1/60),null,'rapidly adjacent faces do not stack sounds')
})

test('static collision surfaces retain appropriate masonry, wood and soft materials',()=>{
  const walls=createStaticCityWalls()
  const material=prop=>walls.find(w=>w.x===prop.x&&w.y===prop.y&&w.width===prop.width&&w.height===prop.height)?.impactMaterial
  assert.equal(material(CITY.buildings[0]),'masonry')
  assert.equal(material(CITY.closures[0]),'masonry')
  assert.equal(material(CITY.props.find(p=>p.kind==='tree')),'wood')
  assert.equal(material(CITY.props.find(p=>p.kind==='tent')),'soft')
  assert.equal(material(CITY.props.find(p=>p.kind==='sandbags')),'soft')
})

test('civilian contact reports pre-impulse speed, without changing the physical outcome',()=>{
  const prop={x:764,y:542,width:32,height:16,kind:'car',condition:'abandoned',direction:'east',blockId:'test',tone:0}
  const run=(report,moving=false)=>{
    const car=createCivilianVehicles([prop])[0],actor={pos:{x:753,y:550},vel:{x:moving?0:100,y:0},radius:12,mass:1}
    if(moving)car.vel.x=-80
    const hits=[]
    if(report)actor.onContact=(body,speed)=>{assert.equal(body,car);hits.push(speed)}
    stepCivilianVehicles([car],[],1/60,[actor])
    delete actor.onContact
    return {car,actor,hits}
  }
  const silent=run(false),reported=run(true)
  assert.deepEqual(reported.car,silent.car);assert.deepEqual(reported.actor,silent.actor)
  assert.equal(reported.hits[0],100)
  assert.ok(run(true,true).hits[0]>70,'a moving car striking the parked jeep reports its speed')
})

test('material impact samples are distinct, bounded, tapered and independent of gameplay randomness',()=>{
  const random=Math.random
  Math.random=()=>{throw new Error('collision audio must not consume gameplay randomness')}
  try{
    const samples=['masonry','metal','armor','wood','soft'].map(material=>{
      const data=new Float32Array(Math.round(48000*COLLISION_SOUND_SECONDS))
      fillCollisionSound(data,48000,material)
      assert.ok(data.every(v=>Number.isFinite(v)&&Math.abs(v)<=.8))
      assert.equal(Math.abs(data[0]),0);assert.equal(Math.abs(data.at(-1)),0)
      assert.ok(data.reduce((sum,v)=>sum+v*v,0)/data.length>.005)
      return data
    })
    for(let i=1;i<samples.length;i++)assert.notDeepEqual(samples[i],samples[0])
  }finally{Math.random=random}
})
