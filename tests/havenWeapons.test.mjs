import assert from 'node:assert/strict'
import test from 'node:test'
import { freshExpedition } from '../src/games/hardVacuum/expedition.ts'
import { havenPose } from '../src/games/hardVacuum/campaign.ts'
import { havenColliders, havenPanels, withHavenColliders } from '../src/games/hardVacuum/havenGeometry.ts'
import { raycastCavern } from '../src/games/hardVacuum/worldGeometry.ts'
import { stepBlaster } from '../src/games/hardVacuum/blaster.ts'
import { replay } from './helpers/sessionReplay.mjs'

const panelAngle=Math.PI/9,gapAngle=Math.PI/3
function scene(shipDistance=220,angle=panelAngle) {
  const state=freshExpedition(),center={...state.campaign.haven}
  const point=(distance,side=0)=>({x:center.x+Math.cos(angle)*distance-Math.sin(angle)*side,y:center.y+Math.sin(angle)*distance+Math.cos(angle)*side})
  state.position=point(shipDistance);state.blasterInstalled=true;state.blasterCharges=3
  state.upgradeLevels.capacitor=5
  const r=replay(state),s=r.session
  s.refs.rocksRef.current=[];s.refs.botsRef.current.units=[]
  s.refs.shipRef.current.angle=angle+(shipDistance>100?Math.PI:0)
  const rock=(distance,side=0,kind='normal')=>{
    const pos=point(distance,side),body=s.createRock(pos.x,pos.y,6,{x:0,y:0},kind)
    s.refs.rocksRef.current.push(body);return body
  }
  return {r,s,point,rock}
}

test('the live laser stops on Haven armor from either side and cannot mine through it',()=>{
  for(const fromInside of [false,true]) {
    const {r,s,rock}=scene(fromInside?35:220),target=rock(fromInside?220:35)
    r.key(' ',true);r.run(30)
    assert.equal(s.mode,'playing')
    assert.ok(s.refs.phaserBeamRef.current.active)
    assert.ok(s.refs.phaserBeamRef.current.length<130)
    assert.ok(s.refs.rocksRef.current.includes(target),'armor shields the asteroid')
    assert.notEqual(s.refs.laserContactRef.current.target,target)
  }
})

test('the live laser and blaster can fire through a deployed docking gap',()=>{
  for(const weapon of ['laser','blaster']) {
    const {r,s,rock}=scene(0,gapAngle),target=rock(210)
    if(weapon==='laser')r.key(' ',true)
    else r.command({type:'blaster'})
    r.run(30)
    assert.ok(!s.refs.rocksRef.current.includes(target),weapon)
  }
})

test('blaster impact splash stays on the struck side of Haven armor',()=>{
  const {r,s,rock}=scene(),protectedRock=rock(35),exposedRock=rock(145,30)
  r.command({type:'blaster'});r.run(24)
  assert.equal(s.refs.blasterRef.current.shots.length,0)
  assert.ok(s.refs.rocksRef.current.includes(protectedRock),'nearby cargo bay is behind armor')
  assert.ok(!s.refs.rocksRef.current.includes(exposedRock),'splash still reaches exposed targets')
})

test('laser rays and fast bolts use every hull pose, including rotation, transit and folding',()=>{
  const empty={boundary:[{x:-1000,y:-1000},{x:2000,y:-1000},{x:2000,y:2000},{x:-1000,y:2000}],obstacles:[]}
  for(const deployment of [0,.15,.5,.85,1]) for(const angle of [0,.7,2]) {
    const pose={pos:{x:500,y:500},deployment,angle},map=withHavenColliders(empty,pose)
    assert.equal(empty.obstacles.length,0,'the stationary map is not mutated')
    assert.deepEqual(map.obstacles,havenColliders(pose))
    for(const panel of havenPanels(pose)) {
      const center=panel.vertices.reduce((p,v)=>({x:p.x+v.x/4,y:p.y+v.y/4}),{x:0,y:0})
      const dx=center.x-pose.pos.x,dy=center.y-pose.pos.y,length=Math.hypot(dx,dy)
      const direction={x:-dx/length,y:-dy/length},origin={x:center.x-direction.x*200,y:center.y-direction.y*200}
      const distance=raycastCavern(origin,direction,400,map)
      assert.ok(distance<200,'the beam stops before entering the leaf')
      const result=stepBlaster([{pos:origin,vel:{x:direction.x*680,y:direction.y*680},life:1.25}],.6,map,[])
      assert.equal(result.shots.length,0);assert.equal(result.impacts.length,1)
      assert.ok(Math.abs(Math.hypot(result.impacts[0].pos.x-origin.x,result.impacts[0].pos.y-origin.y)-distance)<1e-7)
    }
  }
})

test('enemy and processing shots stop at Haven while inward ore processing still works',()=>{
  for(const kind of ['security','processing']) {
    const {r,s,point}=scene(300),pos=point(150),vel={x:-Math.cos(panelAngle)*520,y:-Math.sin(panelAngle)*520}
    const ref=kind==='security'?s.refs.botsRef.current.shots:s.refs.baseShotsRef.current
    ref.push({pos,vel,life:.9,owner:'test-security'})
    r.run(20)
    const remaining=kind==='security'?s.refs.botsRef.current.shots:s.refs.baseShotsRef.current
    assert.equal(remaining.length,0,kind)
  }
  const {r,s,rock}=scene(300),ore=rock(0,0,'blue')
  r.run(110)
  assert.ok(!s.refs.rocksRef.current.includes(ore),'inward mining guns still process the cargo bay')
  assert.ok(s.expedition.banked>0)
})

test('the live laser tracks Haven as its hull folds and moves',()=>{
  const {r,s}=scene()
  s.expedition.campaign.journey={destination:'breach',points:[{x:8040,y:3560}],index:0,phase:'folding',progress:.35,riding:false,speed:0}
  r.key(' ',true)
  for(let i=0;i<100;i++) {
    r.step()
    const pose=havenPose(s.expedition),ship=s.refs.shipRef.current,beam=s.refs.phaserBeamRef.current
    if(!beam.active)continue
    const map={boundary:[{x:0,y:0},{x:9600,y:0},{x:9600,y:6000},{x:0,y:6000}],obstacles:havenColliders(pose)}
    const expected=raycastCavern(ship.pos,{x:Math.cos(ship.angle),y:Math.sin(ship.angle)},520,map)
    assert.ok(Math.abs(beam.length-expected)<1e-7,'beam follows the current articulated surfaces')
  }
})
