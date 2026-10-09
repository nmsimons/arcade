import test from 'node:test'
import assert from 'node:assert/strict'
import {createRun,stepRun} from '../src/games/jumping/challenge.ts'
import {NEUTRAL_INPUT,TUNING} from '../src/games/jumping/model.ts'
import {athletePose} from '../src/games/jumping/athlete.ts'
import {movingStepPropFixture} from './helpers/jumpingStepProps.mjs'
import {mirrorPlayerState} from '../src/games/jumping/gravityFrame.ts'

test('return preparation reflects and restores its live palms during reversed-gravity moving encounters',()=>{
 for(const side of [-1,1])for(const kind of ['box','ball'])for(const size of [30,80]){
  const {level}=movingStepPropFixture(side,kind,size)
  level.spawn.y=100;level.floor=750;level.goal={x:1100,y:750}
  level.platforms=[{x:0,y:0,w:1200,h:100},{...level.platforms[0],y:100}]
  level.props[0].y=100+size
  level.gravityPlates=[{id:'reverse',x:0,y:0,w:1200,h:750,gravity:-1,power:'always'}]
  const run=createRun(level)
  Object.assign(run.player,{inverted:true,gravity:-TUNING.gravity,footwork:null})
  run.props[0].vx=side*480
  let previous,maximum=0,prepared=0,interrupted=0,step=0
  for(let tick=0;tick<180;tick++){
   const returning=run.player.mantle?.returning
   stepRun(run,{...NEUTRAL_INPUT,move:tick<38?side:tick<150?-side:0})
   const p=run.player,snapshot=structuredClone(p),pose=athletePose(p)
   assert.deepEqual(p,snapshot,'pose query restores inverted preparation')
   mirrorPlayerState(p);mirrorPlayerState(p)
   assert.deepEqual(p,snapshot,'preparation palms are an involution')
   const head=[p.x+pose.head[0]*p.facing,p.y+pose.head[1]*(p.inverted?-1:1)]
   if(previous)maximum=Math.max(maximum,Math.hypot(head[0]-previous[0],head[1]-previous[1]))
   prepared+=Number(!!p.mantle?.step?.returnPreparation)
   interrupted+=Number(!!returning&&!p.mantle)
   step+=Number(!!p.mantle?.step)
   previous=head
  }
  console.log(JSON.stringify({side,kind,size,maximum,prepared,interrupted,step,grounded:run.player.grounded,y:run.player.y}))
  assert.ok(prepared>0&&interrupted>0,'real reversed return and obstruction')
  assert.ok(maximum<8,'reversed head continuity')
  stepRun(run,{...NEUTRAL_INPUT,jump:true});assert.ok(run.player.vy>0,'fresh reverse jump')
 }
})
