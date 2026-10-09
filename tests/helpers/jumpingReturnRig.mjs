import assert from 'node:assert/strict'
import {handOutline} from '../../src/games/jumping/athlete.ts'
import {pointInside,nearestBoundary} from '../../src/games/jumping/geometry.ts'
import {ballShape} from '../../src/games/jumping/propGeometry.ts'
import {FOOT_CONTACT,footPoint} from '../../src/games/jumping/footwork.ts'

export const rigDistance=(a,b)=>Math.hypot(...a.map((value,i)=>value-b[i]))
export const rigWorld=(p,point)=>[p.x+point[0]*p.facing,p.y+point[1]*(p.inverted?-1:1)]

export function assertReturningShoes(p,pose,prop,context){
 for(const leg of [pose.frontLeg,pose.backLeg])for(const point of FOOT_CONTACT){
  const sole=footPoint(point,leg.footAngle*leg.footFacing,leg.toeAngle*leg.footFacing)
  const skin=rigWorld(p,[leg.end[0]+sole[0]*leg.footFacing*(1-(leg.rear??0)),leg.end[1]+sole[1]])
  for(const solid of p.terrain){
   if(prop.kind==='ball'&&ballShape(prop)===solid){
    assert.ok(Math.hypot(skin[0]-solid.x-solid.w/2,skin[1]-solid.y-solid.h/2)>=solid.w/2-.01,'visible round shoe '+context)
   }else assert.ok(!pointInside(solid,...skin)||nearestBoundary(solid,...skin).distance<.02,'shoe skin '+context)
  }
 }
}

/** The same visible contact contract applies on the floor and the ceiling. */
export function assertReturningRig(p,pose,prop,context){
 assertReturningShoes(p,pose,prop,context)
 const distance=rigDistance,world=point=>rigWorld(p,point),head=world(pose.head)
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
 for(const solid of p.terrain){
  assert.equal(pointInside(solid,...head),false,'head outside '+context)
  assert.ok(nearestBoundary(solid,...head).distance>=6.18,'head clearance '+context)
 }
 if(p.grounded&&p.footwork&&!p.mantle&&!p.sliding&&!p.slideEntry){
  if(p.footwork.feet.some(foot=>foot.planted))assert.ok([pose.frontLeg,pose.backLeg].some(leg=>leg.planted),'visible loaded support '+context)
  for(const [i,leg]of[pose.frontLeg,pose.backLeg].entries())if(leg.planted){
   const foot=p.footwork.feet[i]
   assert.ok(foot.planted,'real foot owner '+context)
   assert.ok(distance(world(leg.end),[foot.x,foot.y])<1e-5,'actual ankle '+context)
  }
 }
 if(p.contacts.push?.hands&&p.pushing?.palms)for(const [i,arm]of[pose.frontArm,pose.backArm].entries()){
  const palm=p.pushing.palms[i]
  assert.ok(distance(world(arm.hand),[palm.x+palm.nx*1.6,palm.y+palm.ny*1.6])<.001,'force palm '+context)
 }
 for(const arm of [pose.frontArm,pose.backArm])for(const point of handOutline(arm)){
  const skin=world(point)
  for(const solid of p.terrain){
   if(prop.kind==='ball'&&ballShape(prop)===solid){
    assert.ok(Math.hypot(skin[0]-solid.x-solid.w/2,skin[1]-solid.y-solid.h/2)>=solid.w/2-.01,'visible round palm '+context)
   }else assert.ok(!pointInside(solid,...skin)||nearestBoundary(solid,...skin).distance<.02,'hand skin '+context)
  }
 }
}
