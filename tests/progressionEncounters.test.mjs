import assert from 'node:assert/strict'
import test from 'node:test'
import { debrisField, fragmentKindAt, fragmentKindFor, fragmentProfileAt } from '../src/games/hardVacuum/debrisField.ts'
import { expeditionMap, freshExpedition, powerReceiver, sectorAt, GATES, PICKUPS, SOCKETS, parseExpedition } from '../src/games/hardVacuum/expedition.ts'
import { CAMPAIGN_PASSAGES, REGIONS } from '../src/games/hardVacuum/campaignWorld.ts'
import { isInsideCavern } from '../src/games/hardVacuum/worldGeometry.ts'
import { radiationAt, stepRadiation } from '../src/games/hardVacuum/radiation.ts'
import { surveyView } from '../src/games/hardVacuum/surveyView.ts'
import { IRRADIATED_TUNNELS, TRANSFER_RADIATION_SOURCES } from '../src/games/hardVacuum/transferRadiation.ts'

test('blue debris and speed escalate, while every initial red hazard stays enclosed in white rock',()=>{
  const field=debrisField(freshExpedition())
  const counts=Object.fromEntries(REGIONS.map(region=>{
    const rocks=field.filter(r=>region.rooms.some(id=>id===sectorAt(r.pos)?.id))
    return [region.id,{blue:rocks.filter(r=>r.kind==='blue').length/region.rooms.length,red:rocks.filter(r=>r.kind==='red').length/region.rooms.length,speed:rocks.reduce((n,r)=>n+Math.hypot(r.vel.x,r.vel.y),0)/rocks.length}]
  }))
  assert.equal(counts.breach.red,0);assert.equal(counts.breach.blue,0)
  assert.ok(field.every(rock=>rock.kind!=='red'),'red asteroids only appear as fragments of white asteroids')
  for(const [earlier,later] of [['freight','works'],['works','ring'],['ring','heart']]) {
    assert.ok(counts[later].blue>counts[earlier].blue,JSON.stringify(counts))
  }
  assert.equal(counts.refuge.red,0)
  assert.ok(counts.heart.speed>counts.freight.speed)
  for(const roll of [0,.03,.1,.8])assert.equal(fragmentKindAt({x:8000,y:3550},roll),'normal')
})

test('white asteroids expose progressively more red fragments, retaining their contents when towed to another region',()=>{
  const positions={breach:{x:8000,y:3550},freight:{x:8000,y:1250},works:{x:4900,y:1180},ring:{x:1500,y:1100},refuge:{x:1500,y:3590},heart:{x:4100,y:3540}}
  const counts={}
  for(const [region,pos] of Object.entries(positions)) {
    counts[region]={red:0,blue:0,normal:0}
    for(let i=0;i<10000;i++)counts[region][fragmentKindAt(pos,(i+.5)/10000)]++
  }
  assert.equal(counts.breach.red,0);assert.equal(counts.breach.blue,0)
  for(const [a,b] of [['freight','works'],['works','ring'],['ring','heart']])assert.ok(counts[b].red>counts[a].red)
  assert.ok(counts.heart.red>=4000);assert.ok(counts.heart.red>counts.heart.blue)
  assert.ok(counts.refuge.red<counts.freight.red)
  const towed={pos:positions.breach,fragmentRates:fragmentProfileAt(positions.heart)}
  assert.equal(fragmentKindFor(towed,.3),'red');assert.equal(fragmentKindFor(towed,.5),'blue')
  assert.equal(fragmentKindFor({pos:positions.heart,fragmentRates:fragmentProfileAt(positions.breach)},.3),'normal')
})

const reactorRoute=[{x:2320,y:1060},{x:2390,y:960},{x:2580,y:950},{x:2740,y:1040},{x:2740,y:1150},{x:2610,y:1310},{x:2480,y:1410},{x:2470,y:1570},{x:2480,y:1690},{x:2480,y:1730}]
function traverse(speed,shield=true,pause=0) {
  const state=freshExpedition('ring');if(shield)state.upgrades.push('radiation')
  state.radiationCharge=shield ? 100 : 0
  const map=expeditionMap(state)
  let failed=false
  for(let i=1;i<reactorRoute.length;i++) {
    const a=reactorRoute[i-1],b=reactorRoute[i],length=Math.hypot(b.x-a.x,b.y-a.y),steps=Math.ceil(length/2)
    for(let n=1;n<=steps;n++) {
      const pos={x:a.x+(b.x-a.x)*n/steps,y:a.y+(b.y-a.y)*n/steps}
      assert.ok(isInsideCavern(pos,15,map),`route blocked at ${JSON.stringify(pos)}`)
      failed=stepRadiation(state,pos,length/steps/speed,map).failed||failed
    }
    if(i===4 && pause)failed=stepRadiation(state,b,pause,map).failed||failed
  }
  return {state,failed}
}
test('the reactor run rewards a prompt shielded traversal and kills an unshielded or stalled attempt',()=>{
  const fast=traverse(155)
  assert.equal(fast.failed,false);assert.ok(fast.state.radiationCharge<75 && fast.state.radiationCharge>5,fast.state.radiationCharge)
  assert.equal(traverse(155,false).failed,true)
  assert.equal(traverse(155,true,9).failed,true)
  assert.equal(traverse(45).failed,true)
})
test('delivering the reactor cell contains both sources and opens a lasting safe return',()=>{
  const state=freshExpedition('ring'),sample={x:2710,y:1140}
  assert.ok(radiationAt(sample,expeditionMap(state)).intensity>0)
  assert.ok(powerReceiver(state,'heart','heart'))
  assert.ok(state.gates.includes('drive'));assert.ok(state.gates.includes('refuge-link'))
  assert.equal(radiationAt(sample,expeditionMap(state)).intensity,0)
  assert.equal(radiationAt({x:2480,y:1490},expeditionMap(state)).intensity,0)
  assert.ok(radiationAt({x:5510,y:3370},expeditionMap(state)).intensity>0,'the Heart remains hazardous')
})
test('survey zoom doubles scale, follows the ship initially and clamps panning to the station',()=>{
  for(const [width,height] of [[1440,960],[390,844]]) {
    const ship={x:8000,y:3550},fit=surveyView(ship,width,height,true),zoom=surveyView(ship,width,height,true,2)
    assert.equal(zoom.scale,fit.scale*2)
    const moved=surveyView(ship,width,height,true,2,{x:zoom.center.x-1000,y:zoom.center.y})
    assert.ok(moved.center.x<zoom.center.x)
    for(const focus of [{x:-1e8,y:-1e8},{x:1e8,y:1e8}]) {
      const view=surveyView(ship,width,height,true,2,focus)
      assert.ok(view.center.x>=0 && view.center.x<=9600 && view.center.y>=0 && view.center.y<=5100)
    }
  }
})

test('every later long transfer tube is irradiated, while the first departure and Freight shield recovery stay safe',()=>{
  const state=freshExpedition();state.gates=GATES.map(g=>g.id);state.power=Object.fromEntries(SOCKETS.map(s=>[s.id,s.id]))
  const map=expeditionMap(state),module=PICKUPS.find(p=>p.id==='radiation')
  assert.equal(module.sector,'stores');assert.equal(radiationAt(module.pos,map).intensity,0)
  for(const passage of CAMPAIGN_PASSAGES.filter(p=>p.gate==='breach-link')) {
    const [a,b]=passage.centerline
    for(let i=0;i<=20;i++)assert.equal(radiationAt({x:a.x+(b.x-a.x)*i/20,y:a.y+(b.y-a.y)*i/20},map).intensity,0)
  }
  for(const tunnel of IRRADIATED_TUNNELS) {
    assert.ok(TRANSFER_RADIATION_SOURCES.some(s=>s.id.startsWith(`tube:${tunnel.id}:`)),tunnel.id)
    const reserve={upgrades:['radiation'],radiationCharge:100,radiationExposure:0}
    let exposed=0,failed=false
    for(const passage of tunnel.parts) {
      const [a,b]=passage.centerline,length=Math.hypot(b.x-a.x,b.y-a.y),steps=Math.ceil(length/8)
      for(let i=1;i<=steps;i++) {
        const pos={x:a.x+(b.x-a.x)*i/steps,y:a.y+(b.y-a.y)*i/steps}
        const dose=stepRadiation(reserve,pos,length/steps/150,map)
        if(dose.exposed)exposed++;failed ||= dose.failed
      }
    }
    assert.ok(exposed>10,tunnel.id)
    assert.equal(failed,false,`${tunnel.id}: a prompt shielded crossing must be possible`)
    assert.ok(reserve.radiationCharge<95,tunnel.id)
  }
  const legacy=freshExpedition();legacy.cargo={radiation:{pos:{x:1650,y:350},vel:{x:1,y:1},tethered:false}}
  assert.equal(parseExpedition(JSON.stringify(legacy)).cargo.radiation,undefined)
})

test('one full radiation reserve covers leaving Freight, retrieving the Works cell and energizing its Haven berth',()=>{
  const state=freshExpedition();state.gates=GATES.map(g=>g.id);state.upgrades=['radiation'];state.radiationCharge=100
  const map=expeditionMap(state)
  const points=[[8010,1350],[7700,1250],[7300,1160],[7100,1190],[6800,1150],[6100,1150],[5870,1330],[5570,1310],[5300,1150],[5200,1000],[5400,650],[5700,650],[5900,600],[5700,650],[5400,650],[5200,1000],[4930,1090],[4730,1050]]
  for(let i=1;i<points.length;i++) {
    const [ax,ay]=points[i-1],[bx,by]=points[i],length=Math.hypot(bx-ax,by-ay),steps=Math.ceil(length/8)
    for(let n=1;n<=steps;n++) {
      const dose=stepRadiation(state,{x:ax+(bx-ax)*n/steps,y:ay+(by-ay)*n/steps},length/steps/155,map)
      assert.equal(dose.failed,false,'Works power must be reachable before Haven can move there')
    }
  }
  assert.ok(state.radiationCharge>10,`leave some margin for grappling and opening the barrier: ${state.radiationCharge}`)
})
