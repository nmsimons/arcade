import test from 'node:test'
import assert from 'node:assert/strict'
import { athletePose, handOutline } from '../src/games/jumping/athlete.ts'
import { createPlayer, stepPlayer, NEUTRAL_INPUT, STEP, TUNING } from '../src/games/jumping/model.ts'
import { mirrorPlatform } from '../src/games/jumping/gravityFrame.ts'
import { pointInside } from '../src/games/jumping/geometry.ts'
import { footBoosters } from '../src/games/jumping/airBoosters.ts'

const points = pose => [pose.hip, pose.waist, pose.shoulder, pose.head,
  ...[pose.frontArm, pose.backArm, pose.frontLeg, pose.backLeg].flatMap(limb => [limb.root, limb.joint, limb.end])]
const distance = (a,b) => Math.hypot(a[0]-b[0],a[1]-b[1])
function bones(pose) {
  for (const limb of [pose.frontArm,pose.backArm,pose.frontLeg,pose.backLeg]) {
    const leg = 'footAngle' in limb
    assert.ok(Math.abs(Math.hypot(...limb.joint.map((v,i)=>v-limb.root[i]),limb.jointDepth??0)-(leg?15:10))<1e-6)
    assert.ok(Math.abs(Math.hypot(...limb.end.map((v,i)=>v-limb.joint[i]),(limb.endDepth??0)-(limb.jointDepth??0))-(leg?14.5:9))<1e-6)
  }
}

test('landing anticipation comes from reachable support and respects gaps, walls, ceilings and gravity', () => {
  const ground={x:-500,y:600,w:1000,h:100}
  for (const facing of [-1,1]) for (const inverted of [false,true]) {
    const orient=inverted?-1:1
    const player=(terrain,y=580,vx=0)=>Object.assign(createPlayer({x:0,y:y*orient}),{
      grounded:false,vy:400*orient,vx:vx*facing,facing,inverted,gravity:TUNING.gravity*orient,
      terrain:terrain.map(b=>inverted?mirrorPlatform(b):b),
    })
    const approaching=player([ground]),descent=player([ground],300)
    const before=structuredClone(approaching),land=athletePose(approaching),air=athletePose(descent)
    assert.deepEqual(approaching,before,'posing must not acquire support or alter the collision world')
    assert.deepEqual(athletePose(approaching),land,'anticipation is independent of render-query count')
    assert.ok(land.frontArm.end[0]<land.shoulder[0]-2,'the leading arm sweeps back before contact')
    assert.ok(air.frontArm.end[0]>air.shoulder[0]+10,'an unapproached floor retains open descent')
    for(const shape of [
      {...ground,y:580,h:120,profile:[[0,40],[1000,0]]},
      {...ground,y:560,h:160,polygon:[[0,40],[600,40],[600,0],[1000,0],[1000,160],[0,160]]},
    ]) {
      const shaped=athletePose(player([shape]))
      assert.ok(shaped.frontArm.end[0]<shaped.shoulder[0]-2,'sloped and concave exposed support also supplies preparation')
      bones(shaped)
    }
    for(const terrain of [[],[{...ground,x:80,w:100}],[{...ground,y:450,h:20}],[{x:-500,y:0,w:1000,h:30}]]) {
      const unsupported=athletePose(player(terrain))
      assert.ok(unsupported.frontArm.end[0]>unsupported.shoulder[0]+10,'an absent, distant or overhead floor must not imply landing')
    }
    // Projected motion passes above the ledge without meeting its top.
    const passing=athletePose(player([{x:70*facing-(facing<0?100:0),y:585,w:100,h:15}],580,410))
    assert.ok(passing.frontArm.end[0]>passing.shoulder[0]+10,'a wall ahead does not become a fictitious landing')
    bones(land);bones(air)
    assert.equal(approaching.grounded,false)
  }
})

test('actual tap, hold, running jumps and short drops transfer smoothly into real planted contacts', () => {
  for (const facing of [-1,1]) for (const inverted of [false,true]) for (const mode of ['tap','hold','run','drop']) {
    const orient=inverted?-1:1,normal=[{x:-2500,y:600,w:5000,h:100}]
    const terrain=normal.map(b=>inverted?mirrorPlatform(b):b)
    const p=createPlayer({x:0,y:(mode==='drop'?300:600)*orient})
    Object.assign(p,{facing,inverted,gravity:TUNING.gravity*orient,grounded:mode!=='drop'})
    const step=input=>stepPlayer(p,input,STEP,terrain,undefined,undefined,undefined,undefined,TUNING.gravity*orient)
    if(mode==='run')for(let i=0;i<90;i++)step({...NEUTRAL_INPUT,move:facing})
    let previous=points(athletePose(p)),lifted=false,landed=false,prepared=false,peak=0
    for(let i=0;i<200;i++) {
      const jump=mode!=='drop'&&i<(mode==='tap'?1:24)
      const wasGrounded=p.grounded
      step({...NEUTRAL_INPUT,move:mode==='run'&&i<145?facing:0,jump})
      const pose=athletePose(p),current=points(pose)
      bones(pose)
      // Supported sprint swing feet legitimately travel more than five units
      // per tick. Their motor anchors are covered separately; flight and the
      // first support frame retain the tighter whole-rig continuity bound.
      for(let j=0;j<current.length;j++)if(!wasGrounded||!p.grounded||j<10&&(p.gait?.air??0)>.6)assert.ok(distance(previous[j],current[j])<5,`${mode}, ${facing}, inverted ${inverted}: joint ${j} snapped at ${i}`)
      for(const arm of [pose.frontArm,pose.backArm])for(const [x,y] of handOutline(arm)) {
        assert.ok(!terrain.some(b=>pointInside(b,p.x+x*p.facing,p.y+y*orient)),'the visible palm must stay outside support')
      }
      for(const jet of footBoosters(p))assert.ok([pose.frontLeg,pose.backLeg].some(leg=>distance([jet.x,jet.y],leg.end)<8),'real thrust stays attached to a real foot')
      peak=Math.max(peak,600-p.y*orient)
      if(!p.grounded)lifted=true
      if(!p.grounded&&p.vy*orient>0&&pose.frontArm.end[0]<pose.shoulder[0]-2)prepared=true
      if(lifted&&p.grounded)landed=true
      previous=current
    }
    assert.ok(lifted&&landed&&prepared,`${mode} needs actual flight, pre-contact preparation and support`)
    assert.ok(p.footwork.feet.every(foot=>foot.planted),'the final stance comes from the contact motor')
    assert.equal(p.hang,null);assert.equal(p.climbing,null)
    if(mode==='tap')assert.ok(peak>45&&peak<60)
    if(mode==='hold'||mode==='run')assert.ok(peak>150&&peak<220)
  }
})

test('applied lift and steering adjust balance while neutral drift stays still and queries stay read-only', () => {
  const p=Object.assign(createPlayer({x:0,y:0}),{grounded:false,vy:-450,vx:125})
  const drift=athletePose(p),before=structuredClone(p)
  assert.deepEqual(athletePose(p),drift);assert.deepEqual(p,before)
  p.airBoost.lift=1;p.airBoost.x=1
  const applied=athletePose(p)
  assert.notDeepEqual(applied.frontArm.end,drift.frontArm.end)
  assert.notDeepEqual(applied.shoulder,drift.shoulder)
  for(let i=0;i<points(applied).length;i++)assert.ok(distance(points(applied)[i],points(drift)[i])<2,'actual force changes cannot snap the rig')
  bones(applied)
  const heldOnly=structuredClone(before);heldOnly.jumpHeld=true
  assert.deepEqual(athletePose(heldOnly),drift,'cosmetic input intent alone does not invent lift')
})

test('the sustained fall opens one arm and folds the other without hiding either palm in the head', () => {
  for(const facing of [-1,1])for(const inverted of [false,true]) {
    const p=Object.assign(createPlayer(),{grounded:false,facing,inverted,vy:1000*(inverted?-1:1),
      freeFall:{time:1.5,amount:1,recovery:null}})
    const before=structuredClone(p),pose=athletePose(p)
    bones(pose);assert.deepEqual(p,before)
    assert.ok(distance(pose.frontArm.end,pose.backArm.end)>10,'the unsupported arms have distinct silhouettes')
    assert.ok(pose.backArm.end[1]>pose.shoulder[1]+7,'the rear arm folds below the chest')
    for(const arm of [pose.frontArm,pose.backArm])for(const point of handOutline(arm))assert.ok(distance(point,pose.head)>6.3,'palms must clear the round head')
  }
})
