import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {createRun,stepRun} from '../src/games/jumping/challenge.ts'
import {parseLevel,levelProblems} from '../src/games/jumping/level.ts'
import {NEUTRAL_INPUT} from '../src/games/jumping/model.ts'
import {athletePose} from '../src/games/jumping/athlete.ts'
import {bodyIntersects,pointInside,nearestBoundary} from '../src/games/jumping/geometry.ts'
import {athleteOutlinePoints} from './helpers/jumpingAthleteOutline.mjs'
import {ledgeApproachLevel,ledgeApproachInput} from './helpers/jumpingLedgeApproachScenarios.mjs'
import {waterBindingLevel} from './helpers/jumpingWaterBindings.mjs'

const read=file=>parseLevel(JSON.parse(readFileSync(new URL('../public/levels/jumping/'+file,import.meta.url),'utf8')))
const cases=[
  ['spire2.jump-level.json','wall jump',84,1,true],
  ['spire2.jump-level.json','wall jump',88,1,false],
  ['spire2.jump-level.json','fall',14,1,true],
  ['spire2.jump-level.json','fall',16,1,false],
  ['spire2.jump-level.json','fall',14,-1,true],
  ['Tower.jump-level.json','fall',13,1,true],
  ['Tower II.jump-level.json','fall',13,1,true],
]
for(const [file,kind,turn,direction,expected] of cases) test(`${file}: ${kind}, turn ${turn}, direction ${direction}, catch=${expected}`,()=>{
  const level=ledgeApproachLevel(read(file),kind,direction)
  assert.deepEqual(levelProblems(level),[])
  const run=createRun(level),p=run.player
  let caught=false,wallJump=false,stable,previous
  for(let tick=0;tick<230;tick++) {
    stepRun(run,caught?NEUTRAL_INPUT:ledgeApproachInput(tick,kind,turn,direction))
    wallJump ||= !!p.wallJump
    caught ||= !!p.hang
    assert.ok(run.platforms.every(b=>!bodyIntersects(p.x,p.y,b)),'the physical body never enters a solid')
    const pose=athletePose(p)
    for(const limb of [pose.frontArm,pose.backArm,pose.frontLeg,pose.backLeg]) {
      const leg='footAngle' in limb
      assert.ok(Math.abs(Math.hypot(...limb.joint.map((v,i)=>v-limb.root[i]),limb.jointDepth??0)-(leg?15:10))<1e-5,'fixed upper bone')
      assert.ok(Math.abs(Math.hypot(...limb.end.map((v,i)=>v-limb.joint[i]),(limb.endDepth??0)-(limb.jointDepth??0))-(leg?14.5:9))<1e-5,'fixed lower bone')
    }
    if(p.hang) {
      const points=[pose.hip,pose.shoulder,pose.head,pose.frontArm.joint,pose.frontArm.end,pose.backArm.joint,pose.backArm.end].map(q=>[p.x+q[0]*p.facing,p.y+q[1]])
      if(previous)for(const [i,q]of points.entries())assert.ok(Math.hypot(q[0]-previous.points[i][0],q[1]-previous.points[i][1])<Math.hypot(p.x-previous.x,p.y-previous.y)+6,'catch joints stay continuous')
      if(p.hang.time>.2) {
        if(stable)for(const [i,q]of points.entries())assert.ok(Math.hypot(q[0]-stable[i][0],q[1]-stable[i][1])<1e-5,'quiet hanging pose stays at rest')
        stable=points
      }
      previous={x:p.x,y:p.y,points}
      for(const q of athleteOutlinePoints(p)) {
        const x=p.x+q[0]*p.facing,y=p.y+q[1]
        for(const b of p.terrain) assert.ok(!pointInside(b,x,y)||nearestBoundary(b,x,y).distance<=.02,'catch skin clears the actual ledge')
      }
    }
  }
  if(kind==='wall jump')assert.ok(wallJump,'normal fresh presses must actually launch from the wall')
  assert.equal(caught,expected,expected?'reachable hands establish a stable grip':'farther attempts remain genuine misses')
  if(!expected)return
  assert.equal(p.hang.edgeY,file==='spire2.jump-level.json'?1100:1760,'the recorded encounter catches its receiving ledge')
  assert.ok(stable,'the acquired grip settles at rest')
  for(let i=0;i<140;i++)stepRun(run,{...NEUTRAL_INPUT,climb:true})
  assert.ok(p.grounded&&!p.hang&&!p.mantle,'Up pulls onto the actual receiving ledge')
})

test('passive floating beside a bank retains the original water catch range in both directions',()=>{
  for(const direction of [-1,1]) {
    const level=parseLevel(waterBindingLevel('bank',direction))
    assert.deepEqual(levelProblems(level),[])
    const run=createRun(level),p=run.player
    if(direction<0)stepRun(run,{...NEUTRAL_INPUT,move:direction})
    for(let tick=0;tick<120;tick++)stepRun(run,{...NEUTRAL_INPUT,crouch:true,descend:true,drop:true})
    for(let tick=0;tick<1080;tick++) {
      stepRun(run,NEUTRAL_INPUT)
      assert.equal(p.hang,null,'the wider dry reach must not acquire a bank during passive floating')
    }
    assert.ok(p.waterMotion&&!p.grounded,'the swimmer remains afloat after releasing Down')
    assert.ok(p.y>440&&p.y<460,'ordinary buoyancy reaches the original surface rest')
  }
})
