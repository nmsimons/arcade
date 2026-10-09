import test from 'node:test'
import assert from 'node:assert/strict'
import {createRun,stepRun} from '../src/games/jumping/challenge.ts'
import {NEUTRAL_INPUT,TUNING} from '../src/games/jumping/model.ts'
import {pointInside,nearestBoundary} from '../src/games/jumping/geometry.ts'
import {ballShape} from '../src/games/jumping/propGeometry.ts'
import {movingStepPropFixture} from './helpers/jumpingStepProps.mjs'
import {athleteSkin} from './helpers/jumpingSkin.mjs'

test('complete returning-step skin clears the ledge and moving props, including loaded arms and soles',()=>{
 for(const inverted of [false,true])for(const side of [-1,1])for(const kind of ['box','ball'])for(const size of [30,80]){
  const {level}=movingStepPropFixture(side,kind,size)
  if(inverted){
   level.spawn.y=100;level.floor=750;level.goal={x:1100,y:750}
   level.platforms=[{x:0,y:0,w:1200,h:100},{...level.platforms[0],y:100}]
   level.props[0].y=100+size
   level.gravityPlates=[{id:'reverse',x:0,y:0,w:1200,h:750,gravity:-1,power:'always'}]
  }
  const run=createRun(level)
  if(inverted)Object.assign(run.player,{inverted:true,gravity:-TUNING.gravity,footwork:null})
  run.props[0].vx=side*480
  let loaded=0
  for(let tick=0;tick<180;tick++){
   stepRun(run,{...NEUTRAL_INPUT,move:tick<38?side:tick<150?-side:0})
   const p=run.player
   if(p.contacts.push?.hands&&p.pushing?.palms)loaded++
   const round=kind==='ball'?ballShape(run.props[0]):null
   for(const shape of athleteSkin(p))for(const [x,y]of shape.points){
    for(const solid of p.terrain){
     const depth=solid===round?solid.w/2-Math.hypot(x-solid.x-solid.w/2,y-solid.y-solid.h/2)
      :pointInside(solid,x,y)?nearestBoundary(solid,x,y).distance:0
     if(depth>=.02)assert.fail(JSON.stringify({inverted,side,kind,size,tick,part:shape.name,x,y,depth}))
    }
   }
  }
  if(size===80||kind==='box')assert.ok(loaded>0,'the actual loaded contact is exercised')
 }
})
