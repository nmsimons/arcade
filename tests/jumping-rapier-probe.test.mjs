import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { rapierReady, RapierPropProbe } from './bench/labRapierProps.mjs'
import { stressLevel, stressRun } from './bench/labStressScene.mjs'
import { createRun } from './helpers/jumping-active-run.mjs'
import { lineBlocked } from '../src/games/jumping/geometry.ts'

await rapierReady
const fixture=JSON.parse(fs.readFileSync(new URL('./fixtures/jumping/lab-stress.json',import.meta.url)))
const contacts={support:null,push:null,body:[],motion:{x:0,y:0,speed:0}}
function probeRun(props,platforms=[],mechanisms=[]) {
  const level=stressLevel(fixture,{id:'native-quality',props:0})
  level.props=props;level.platforms=platforms;level.mechanisms=mechanisms
  return createRun(level)
}
test('native loose-prop stacks retain support and resolve penetration',()=>{
  const run=probeRun(Array.from({length:8},(_,i)=>({kind:'box',x:500,y:800-i*32,size:32})))
  const probe=new RapierPropProbe()
  try{
    for(let i=0;i<1200;i++) assert.equal(probe.step(run,contacts,1/240),true)
    const quality=probe.quality(run)
    assert.ok(quality.maxPenetration<.15,JSON.stringify(quality))
    assert.ok(run.props.every(p=>p.grounded),'load reaches every box in the stack')
    assert.ok(run.props.every(p=>Math.abs(p.vy)<.5),'settled stack has no ongoing sink')
    assert.equal(quality.awakeProps,8,'no sleeping shortcut')
  }finally{probe.dispose()}
})
test('native continuous collision stops a fast ball at a thin wall',()=>{
  const run=probeRun([{kind:'ball',x:400,y:700,size:32}], [{x:600,y:0,w:5,h:800}])
  run.props[0].vx=2400
  const probe=new RapierPropProbe()
  try{
    for(let i=0;i<120;i++)probe.step(run,contacts,1/240)
    assert.ok(run.props[0].x<=584.15,'ball cannot cross the wall')
    assert.ok(probe.quality(run).maxPenetration<.15,JSON.stringify({prop:run.props[0],quality:probe.quality(run)}))
  }finally{probe.dispose()}
})
test('native props follow the existing moving-platform cargo positions',()=>{
  const run=probeRun([{kind:'box',x:500,y:700,size:32}],[],[{id:'cargo',kind:'lift',x:400,y:700,w:200,h:20,travel:200,power:'always'}])
  const probe=new RapierPropProbe()
  try{
    for(let i=0;i<240;i++){
      run.mechanisms[0].y-=.25;run.props[0].y-=.25
      probe.step(run,contacts,1/240)
    }
    assert.ok(Math.abs(run.props[0].y-run.mechanisms[0].y)<.15,JSON.stringify({prop:run.props[0],lift:run.mechanisms[0].y,quality:probe.quality(run)}))
    assert.equal(run.props[0].grounded,true)
  }finally{probe.dispose()}
})
test('player contacts and water retain the established solver boundary',()=>{
  const run=probeRun([{kind:'ball',x:500,y:800,size:32}]),probe=new RapierPropProbe()
  try{
    assert.equal(probe.step(run,{...contacts,body:[{collider:{prop:run.props[0]}}]},1/240),false)
    run.water.pools.push({})
    assert.equal(probe.step(run,contacts,1/240),false)
    assert.equal(probe.metrics.nativeSteps,0)
    assert.equal(probe.metrics.fallbackSteps,2)
  }finally{probe.dispose()}
})
test('native rope spans stay clear of walls, with fixed anchors and limited stretch',()=>{
  const run=stressRun(fixture,{id:'native-rope-quality',ropes:8,ropeContacts:true})
  const probe=new RapierPropProbe(12,true)
  try{
    for(let tick=0;tick<600;tick++){
      probe.step(run,contacts,1/120)
      for(const rope of run.player.ropes){
        probe.publishRope(run,rope,1/120,null)
        for(let i=1;i<rope.nodes.length;i++){
          const a=rope.nodes[i-1],b=rope.nodes[i]
          assert.equal(lineBlocked([a.x,a.y],[b.x,b.y],run.terrain),false,`tick ${tick}, rope ${rope.definition.x}, span ${i}`)
        }
      }
    }
    const quality=probe.quality(run)
    assert.ok(quality.maxAnchorDrift<.001,JSON.stringify(quality))
    assert.ok(quality.totalRopeStretch<1.02,JSON.stringify(quality))
    assert.ok(quality.maxRopeStretch<1.1,JSON.stringify(quality))
  }finally{probe.dispose()}
})
