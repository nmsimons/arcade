import test from 'node:test'
import assert from 'node:assert/strict'
import { configureProfiling } from '../src/games/hardVacuum/profiling.ts'
import { SCENES, createScene } from '../benchmarks/scenes.mjs'

test('opt-in timing observes the real simulation without changing its result',()=>{
  const run=()=>{
    const f=createScene('late-field');for(let tick=0;tick<60;tick++){f.control();f.session.step();f.session.drainEvents()}
    return structuredClone({state:f.session.expedition,ship:f.session.refs.shipRef.current,rocks:f.session.refs.rocksRef.current.map(({pos,vel,kind,radius})=>({pos,vel,kind,radius}))})
  }
  const expected=run(),sections=new Set();let clock=0
  configureProfiling({now:()=>clock++,sample:section=>sections.add(section)})
  try {assert.deepEqual(run(),expected)} finally {configureProfiling()}
  for(const section of ['collisions','geometry','radiation-dose'])assert.ok(sections.has(section),section)
})

for(const name of SCENES)test(`benchmark fixture exercises ${name} at both densities`,()=>{
  let authoredBodies=0
  for(const density of [1,3]) {
    const f=createScene(name,density),peaks={}
    const bodies=f.observe().bodies
    if(density===1)authoredBodies=bodies;else assert.ok(bodies>authoredBodies*2.5)
    for(let tick=0;tick<180;tick++) {
      f.control();f.session.step();f.session.drainEvents()
      for(const [key,value] of Object.entries(f.observe()))peaks[key]=Math.max(peaks[key]??0,value)
    }
    assert.equal(f.session.mode,'playing',JSON.stringify(f.outcome()))
    if(name==='red-chain'){assert.ok(peaks.armedRed>1);assert.ok(peaks.particles>100)}
    if(name==='bot-towing')assert.ok(peaks.botTethers>0)
    if(name==='moving-haven'){assert.ok(f.outcome().havenDistance>350);assert.ok(peaks.havenImpact>.5)}
    if(name==='opening-doors')assert.ok(peaks.openingDoors>=20)
    if(name==='radiation-flight'){assert.ok(f.outcome().shipDistance>400);assert.ok(f.outcome().chargeUsed>10)}
  }
})
