import test from 'node:test'
import assert from 'node:assert/strict'
import {createPlayer,NEUTRAL_INPUT,STEP,TUNING} from '../src/games/jumping/model.ts'
import {anticipatePush,playerContacts,updatePushingPose} from '../src/games/jumping/playerContacts.ts'
import {boxShape} from '../src/games/jumping/propGeometry.ts'
import {createRun,stepRun} from '../src/games/jumping/challenge.ts'
import {blankTrial} from '../src/games/jumping/level.ts'
import {athletePose} from '../src/games/jumping/athlete.ts'

test('a close falling approach prepares unloaded hands without acquiring support or moving the prop',()=>{
 for(const side of [-1,1]){
  const p=createPlayer({x:500,y:620}),prop={kind:'box',x:500+side*60,y:650,size:80,angle:0}
  Object.assign(p,{grounded:false,facing:side,vy:30})
  const platform=boxShape(prop),world={platforms:[platform],colliders:[{id:'prop:0',platform,prop}]}
  const input={...NEUTRAL_INPUT,move:side},snapshot=structuredClone(p),object=structuredClone(prop)
  const contact=anticipatePush(p,input,world)
  assert.ok(contact,'the close exposed face is anticipated while falling')
  assert.ok((contact.wallX-p.x)*side<38,'this exercises the old close-reach gap')
  assert.equal(contact.effort,0)
  assert.equal(contact.anticipation,1)
  assert.deepEqual(p,snapshot,'the query stays read-only')
  assert.deepEqual(prop,object)
  const physical=playerContacts(p,input,world,STEP)
  assert.equal(physical.support,null)
  assert.equal(physical.push,null,'an anticipated reach is not a physical shove')
  updatePushingPose(p,contact,STEP)
  assert.equal(p.pushing.amount,0)
  assert.equal(p.pushing.load,0)
  assert.equal(p.pushing.effort,0)
  assert.equal(p.pushing.ready,1)
  assert.deepEqual({...p,pushing:snapshot.pushing},snapshot,'presentation changes no other player state')
  assert.deepEqual(prop,object,'no force or movement is supplied')
  updatePushingPose(p,null,STEP)
  assert.equal(p.pushing,null,'releasing the falling approach clears the free reach')
  for(const [changes,keys]of[
   [{vy:-1},{}],[{jumpLift:1},{}],[{}, {jump:true}],[{buffer:STEP},{}],
   [{waterMotion:{amount:1}},{}],[{hang:{}},{}],[{mantle:{}},{}],[{climbing:{}},{}],
   [{sliding:{amount:.2,active:false}},{}],[{wallBrace:{amount:.2,active:false}},{}],[{slideEntry:{}},{}],
   [{freeFall:{amount:1}},{}],[{}, {move:0}]
  ]){
   const state={...snapshot,...changes},before=structuredClone(state)
   assert.equal(anticipatePush(state,{...input,...keys},world),null,'active jump, grip, recovery or release owns its pose')
   assert.deepEqual(state,before)
  }
  const wall={x:500+side*15-(side<0?1:0),y:540,w:1,h:100}
  const blocked={platforms:[wall,platform],colliders:[{id:'wall',platform:wall},...world.colliders]}
  assert.equal(anticipatePush(snapshot,input,blocked),null,'an intervening face still rejects a close falling reach')
 }
})

test('an unloaded falling reach transfers its whole outgoing rig into a brief ball slide',()=>{
 const level={...blankTrial(),name:'Ball descent',width:1000,height:620,floor:620,
  spawn:{x:740,y:420},goal:{x:150,y:620},
  platforms:[{x:600,y:420,w:160,h:120,polygon:[[0,80],[120,80],[120,0],[160,0],[160,120],[0,120]]}],
  props:[{kind:'ball',x:666,y:500,size:100}]}
 for(const walking of [false,true]){
  const run=createRun(level)
  let previous,transitions=0,reachTransfers=0
  for(let tick=0;tick<210;tick++){
   const move=tick<8?0:tick<8+(walking?120:42)?-(walking?TUNING.walkSpeed/TUNING.runSpeed:1):0
   stepRun(run,{...NEUTRAL_INPUT,move})
   const p=run.player,a=athletePose(p)
   const points=[a.hip,a.waist,a.shoulder,a.head,...[a.frontArm,a.backArm,a.frontLeg,a.backLeg].flatMap(l=>[l.joint,l.end])]
   const active=!!p.sliding?.active
   if(previous&&!p.grounded&&!previous.grounded&&p.facing===previous.facing&&active!==previous.active){
    transitions++
    for(const [i,q]of points.entries())assert.ok(Math.hypot(...q.map((v,j)=>v-previous.points[i][j]))<4,
     `whole-rig slip transfer: walking=${walking} tick=${tick} point=${i}`)
    if(active&&previous.ready){
     reachTransfers++
     assert.ok(p.slideEntry,'the actual slide retains the outgoing unloaded reach')
     assert.equal(p.pushing,null,'the slip balance owns the incoming pose')
    }
   }
   previous={points,active,grounded:p.grounded,facing:p.facing,ready:!!p.pushing?.ready}
  }
  assert.ok(transitions>=2,'actual controls exercise slide entry and release')
  assert.ok(reachTransfers>0,'an anticipated falling reach precedes the actual slip')
  assert.equal(run.player.grounded,true)
  assert.ok(Math.abs(run.player.y-500)<.01,'the lower ledge is reached normally')
  assert.ok(run.props[0].x<646,'the real ball yields')
 }
})
