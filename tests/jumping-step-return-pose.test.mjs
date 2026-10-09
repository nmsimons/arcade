import test from 'node:test'
import assert from 'node:assert/strict'
import {createRun,stepRun} from '../src/games/jumping/challenge.ts'
import {NEUTRAL_INPUT} from '../src/games/jumping/model.ts'
import {athletePose,handOutline,advanceReturningStepPreparation} from '../src/games/jumping/athlete.ts'
import {pointInside,nearestBoundary} from '../src/games/jumping/geometry.ts'
import {ballShape,boxShape} from '../src/games/jumping/propGeometry.ts'
import {movingStepPropFixture} from './helpers/jumpingStepProps.mjs'
const distance=(a,b)=>Math.hypot(...a.map((v,i)=>v-b[i]))
const world=(p,a)=>[p.x+a[0]*p.facing,p.y+a[1]]
test('return preparation retains a proportionate, contact-safe rig throughout all real prop interruptions',()=>{
 for(const side of [-1,1])for(const kind of ['box','ball'])for(const size of [30,80]){
  const {level}=movingStepPropFixture(side,kind,size),run=createRun(level)
  run.props[0].vx=side*480
  let previous=world(run.player,athletePose(run.player).head),prepared=0,interrupted=0,force=0,curvedSupport=0
  for(let tick=0;tick<180;tick++){
   const returning=run.player.mantle?.returning
   stepRun(run,{...NEUTRAL_INPUT,move:tick<38?side:tick<150?-side:0})
   const p=run.player,pose=athletePose(p),head=world(p,pose.head),context=JSON.stringify({side,kind,size,tick})
   prepared+=Number(!!p.mantle?.step?.returnPreparation)
   interrupted+=Number(!!returning&&!p.mantle)
   curvedSupport+=Number(p.contacts.support?.collider.prop===run.props[0])
   assert.ok(distance(head,previous)<8,'head continuity '+context)
   assert.ok(distance(pose.hip,pose.waist)>6.2,'pelvis proportions '+context)
   assert.ok(distance(pose.waist,pose.shoulder)>8.5,'chest proportions '+context)
   assert.ok(distance(pose.head,pose.shoulder)<10,'neck proportions '+context)
   if(p.dryTurn?.pushing&&p.contacts.push?.hands&&p.dryTurn.time<.1){
    assert.ok(Math.abs(distance(pose.hip,pose.waist)-6.5)<1e-5,'handoff pelvis length '+context)
    assert.ok(Math.abs(distance(pose.waist,pose.shoulder)-10.1)<1e-5,'handoff chest length '+context)
   }
   for(const limb of [pose.frontArm,pose.backArm,pose.frontLeg,pose.backLeg]){
    const leg='footAngle'in limb
    assert.ok(Math.abs(Math.hypot(...limb.joint.map((v,i)=>v-limb.root[i]),limb.jointDepth??0)-(leg?15:10))<1e-5,'upper bone '+context)
    assert.ok(Math.abs(Math.hypot(...limb.end.map((v,i)=>v-limb.joint[i]),(limb.endDepth??0)-(limb.jointDepth??0))-(leg?14.5:9))<1e-5,'lower bone '+context)
   }
   for(const solid of p.terrain){assert.equal(pointInside(solid,...head),false,'head outside '+context);assert.ok(nearestBoundary(solid,...head).distance>=6.18,'head clearance '+context)}
   // Curved slipping contacts retain their slide/landing owner; ordinary
   // walking support must visibly use the actual foot motor.
   if(p.grounded&&p.footwork&&!p.mantle&&!p.sliding&&!p.slideEntry){
    if(p.footwork.feet.some(foot=>foot.planted))assert.ok([pose.frontLeg,pose.backLeg].some(leg=>leg.planted),'visible loaded support '+context)
    for(const [i,leg]of[pose.frontLeg,pose.backLeg].entries())if(leg.planted){const foot=p.footwork.feet[i];assert.ok(foot.planted,'real foot owner '+context);assert.ok(distance(world(p,leg.end),[foot.x,foot.y])<1e-5,'actual ankle '+context)}
   }
   if(p.contacts.push?.hands&&p.pushing?.palms){
    force++
    for(const [i,arm]of[pose.frontArm,pose.backArm].entries()){
     const palm=p.pushing.palms[i];assert.ok(distance(world(p,arm.hand),[palm.x+palm.nx*1.6,palm.y+palm.ny*1.6])<.001,'force palm '+context)
    }
   }
   for(const arm of [pose.frontArm,pose.backArm])for(const point of handOutline(arm)){
    const skin=world(p,point)
    for(const solid of p.terrain){
     // Native ball skin is circular; its collision hull is circumscribed.
     if(kind==='ball'&&ballShape(run.props[0])===solid){
      assert.ok(Math.hypot(skin[0]-solid.x-solid.w/2,skin[1]-solid.y-solid.h/2)>=solid.w/2-.01,'visible round palm '+context)
     }else assert.ok(!pointInside(solid,...skin)||nearestBoundary(solid,...skin).distance<.02,'hand skin '+context)
    }
   }
   previous=head
  }
  assert.ok(interrupted>0,'actual interruption occurs '+JSON.stringify({side,kind,size}))
  assert.ok(prepared>0,'preparation is exercised '+JSON.stringify({side,kind,size}))
  if(kind==='ball'&&size===30)assert.ok(curvedSupport>0,'real small-ball support is exercised')
  else assert.ok(force>0,'real pushing follows')
  stepRun(run,{...NEUTRAL_INPUT,jump:true});assert.ok(run.player.vy<0,'fresh jump')
 }
})

test('return preparation rejects an intervening solid and never supplies force or physical support',()=>{
 for(const side of [-1,1]){
  const {level}=movingStepPropFixture(side,'box',30),run=createRun(level)
  run.props[0].vx=side*480
  for(let tick=0;tick<=38;tick++)stepRun(run,{...NEUTRAL_INPUT,move:tick<38?side:-side})
  const p=run.player,preparation=p.mantle?.step?.returnPreparation
  assert.ok(preparation,'the unobstructed incoming prop is actually anticipated')
  const direction=preparation.direction,gap=(preparation.hands.wallX-p.x)*direction
  const wall={x:p.x+direction*(gap-.5)-(direction<0?.25:0),y:p.y-80,w:.25,h:100}
  const platform=boxShape(run.props[0])
  const terrain=[...run.terrain,wall]
  const world={platforms:[...terrain,platform],colliders:[...terrain.map((platform,i)=>({id:`terrain:${i}`,platform})),{id:'prop:0',platform,prop:run.props[0]}]}
  delete p.mantle.step.returnPreparation
  const snapshot=structuredClone(p),props=structuredClone(run.props)
  advanceReturningStepPreparation(p,{...NEUTRAL_INPUT,move:direction},1/120,world)
  assert.equal(p.mantle.step.returnPreparation,undefined,'hands cannot prepare through an intervening face')
  assert.deepEqual(p,snapshot,'rejected preparation cannot alter the physical player or create a contact')
  assert.deepEqual(run.props,props,'anticipation cannot move the incoming object')
 }
})
