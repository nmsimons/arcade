import assert from 'node:assert/strict'
import test from 'node:test'
import { createImpactDebris, stepImpactDebris } from '../src/games/urbanFire/combatEffects.ts'

test('combat fragments rise, bounce, settle and expire without going below ground',()=>{
  let particles=createImpactDebris(800,550,12,73)
  const chips=particles.filter(p=>p.kind==='chip')
  let rose=false,bounced=false,settled=false
  for(let i=0;i<240;i++){
    const previous=new Map(chips.map(p=>[p,p.rise]))
    particles=stepImpactDebris(particles,1/120)
    for(const p of particles){
      assert.ok(p.height>=0&&Number.isFinite(p.pos.x)&&Number.isFinite(p.pos.y))
      if(p.kind!=='chip')continue
      rose ||= p.height>3
      bounced ||= previous.get(p)<0&&p.rise>0
      settled ||= p.age>.65&&p.height===0&&p.rise===0
    }
  }
  assert.ok(rose&&bounced&&settled)
  assert.equal(particles.length,0)
})

test('effects use local variation, freeze at zero time, and keep the same motion across frame rates',()=>{
  const random=Math.random
  Math.random=()=>{throw new Error('effects must not consume combat randomness')}
  try{
    const a=createImpactDebris(500,550,8,14),b=createImpactDebris(500,550,8,14)
    assert.deepEqual(a,b)
    const before=structuredClone(a)
    assert.equal(stepImpactDebris(a,0),a);assert.deepEqual(a,before)
    for(let i=0;i<12;i++)stepImpactDebris(a,1/30)
    for(let i=0;i<48;i++)stepImpactDebris(b,1/120)
    for(let i=0;i<a.length;i++){
      assert.ok(Math.hypot(a[i].pos.x-b[i].pos.x,a[i].pos.y-b[i].pos.y)<.001)
      assert.ok(Math.abs(a[i].height-b[i].height)<.001)
    }
  }finally{Math.random=random}
})

test('wall hits throw dust and concrete back from the surface; metal impacts can shed hot fragments',()=>{
  const wall=createImpactDebris(500,550,6,81,'masonry',Math.PI)
  assert.ok(wall.some(p=>p.kind==='dust'))
  assert.ok(wall.some(p=>p.kind==='chip'))
  assert.ok(wall.every(p=>p.kind!=='ember'&&p.vel.x<0))
  assert.ok(createImpactDebris(500,550,6,81,'metal').some(p=>p.kind==='ember'))
})
