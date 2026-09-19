import assert from 'node:assert/strict'
import test from 'node:test'
import { expeditionMap, freshExpedition, freshRuntime, GATES, parseExpedition, powerReceiver, SOCKETS, stepExpedition } from '../src/games/hardVacuum/expedition.ts'
import { isInsideCavern } from '../src/games/hardVacuum/worldGeometry.ts'
import { radiationAt, stepRadiation } from '../src/games/hardVacuum/radiation.ts'

const ward=SOCKETS.find(s=>s.id==='ward-power')
const gate=GATES.find(g=>g.id==='ward-link')
const center={x:gate.x+gate.w/2,y:gate.y+gate.h/2}
function arrival() {
  const state=freshExpedition('refuge')
  powerReceiver(state,'refuge-power','refuge-power');state.doors={}
  state.upgrades=['radiation'];state.radiationCharge=100
  return state
}
function canReachWard(state) {
  const map=expeditionMap(state),size=25,queue=[{x:1500,y:3600}],seen=new Set(['1500,3600'])
  for(let i=0;i<queue.length;i++) {
    const p=queue[i]
    if(Math.hypot(p.x-ward.pos.x,p.y-ward.pos.y)<30)return true
    for(const [dx,dy] of [[size,0],[-size,0],[0,size],[0,-size]]) {
      const next={x:p.x+dx,y:p.y+dy},key=`${next.x},${next.y}`
      if(next.x<100||next.x>2950||next.y<3225||next.y>4250||seen.has(key))continue
      if(!isInsideCavern(next,23,map)||!isInsideCavern({x:p.x+dx/2,y:p.y+dy/2},23,map))continue
      seen.add(key);queue.push(next)
    }
  }
  return false
}

test('Medical Transfer requires the lower bypass before the ward receiver can open the direct return',()=>{
  const state=arrival()
  assert.ok(state.gates.includes('medical-return'));assert.ok(!state.gates.includes('ward-link'))
  assert.equal(isInsideCavern(center,15,expeditionMap(state)),false)
  assert.ok(canReachWard(state),'a ship and cell can go around through the service tube')
  state.gates=state.gates.filter(id=>id!=='medical-return')
  assert.equal(canReachWard(state),false,'there is no gap around the closed isolation door')
  state.gates.push('medical-return')
  const rt=freshRuntime(),ship={pos:{...state.position},vel:{x:0,y:0},radius:15,angle:0}
  const cell={kind:'blue',sourceId:'ward-power',pos:{x:1660,y:3420},vel:{x:0,y:0},radius:18,rot:[0,0,0],tethered:true}
  const tick=()=>stepExpedition(state,rt,{dt:.1,ship,rocks:[cell],harpoon:{state:'idle'},beam:{active:false}})
  for(let i=0;i<15;i++)tick()
  assert.equal(state.power['ward-power'],undefined,'the former near-side receiver cannot activate the door')
  cell.pos={...ward.pos};cell.vel={x:0,y:0};ship.pos={x:ward.pos.x,y:ward.pos.y+70}
  for(let i=0;i<15&&!state.power['ward-power'];i++)tick()
  assert.equal(state.power['ward-power'],'ward-power')
  assert.equal(state.doors['ward-link'],0,'opening starts with the full door still in place')
  assert.equal(isInsideCavern(center,15,expeditionMap(state)),false)
  for(let i=0;i<20;i++)tick()
  assert.ok(isInsideCavern(center,70,expeditionMap(state)),'the animated doorway becomes a broad safe shortcut')
  assert.equal(radiationAt(center,expeditionMap(state)).intensity,0)
})

const route=[[1490,3600],[1130,3540],[900,3510],[750,3510],[530,3510],[510,3430],[530,3510],[530,3700],[700,4090],[2300,4090],[2530,3770],[2530,3700],[2350,3700],[2350,3640]]
function traverse(speed,shield=true,pause=0) {
  const state=arrival(),map=expeditionMap(state)
  if(!shield){state.upgrades=[];state.radiationCharge=0}
  let failed=false
  for(let i=1;i<route.length;i++) {
    const [ax,ay]=route[i-1],[bx,by]=route[i],length=Math.hypot(bx-ax,by-ay),steps=Math.ceil(length/5)
    for(let j=1;j<=steps;j++) {
      const pos={x:ax+(bx-ax)*j/steps,y:ay+(by-ay)*j/steps}
      assert.ok(isInsideCavern(pos,23,map),`cell route blocked at ${JSON.stringify(pos)}`)
      failed=stepRadiation(state,pos,length/steps/speed,map).failed||failed
    }
    if(i===9&&pause)failed=stepRadiation(state,{x:1500,y:4090},pause,map).failed||failed
  }
  return {state,failed}
}
test('one charge covers the medical cell run at towing speed, but unshielded or stalled passage is lethal',()=>{
  const run=traverse(135)
  assert.equal(run.failed,false)
  assert.ok(run.state.radiationCharge>10&&run.state.radiationCharge<65,`reserve margin: ${run.state.radiationCharge}`)
  assert.equal(traverse(135,false).failed,true)
  assert.equal(traverse(135,true,30).failed,true)
})

test('existing saves gain access to the bypass without losing their ward progress or cargo',()=>{
  const state=arrival();state.version=1;state.gates=state.gates.filter(id=>id!=='medical-return')
  state.cargo={'ward-power':{pos:{x:1650,y:3470},vel:{x:2,y:1},tethered:true}}
  const restored=parseExpedition(JSON.stringify(state))
  assert.ok(restored.gates.includes('medical-return'));assert.ok(!restored.gates.includes('ward-link'))
  assert.deepEqual(restored.cargo,state.cargo)
  powerReceiver(state,'ward-power','ward-power');state.doors={}
  const completed=parseExpedition(JSON.stringify(state))
  assert.ok(completed.gates.includes('ward-link'));assert.equal(completed.power['ward-power'],'ward-power')
})
