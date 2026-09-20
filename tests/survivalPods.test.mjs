import test from 'node:test'
import assert from 'node:assert/strict'
import { SURVIVAL_PODS, WARD_POD_BERTHS, rescuePod, completeEvacuation, allSurvivorsAboard, podReleased } from '../src/games/hardVacuum/survivalPods.ts'
import { cargoBodies, crashExpedition, expeditionMap, freshExpedition, freshRuntime, GATES, objective, parseExpedition, powerReceiver, snapshotCargo, stepCargoRecovery, stepExpedition } from '../src/games/hardVacuum/expedition.ts'
import { havenPosition, launchHaven, moveHaven, stepHaven } from '../src/games/hardVacuum/campaign.ts'
import { havenPanels, havenRescueMarkers } from '../src/games/hardVacuum/havenGeometry.ts'
import { isInsideCavern, pointInPolygon } from '../src/games/hardVacuum/worldGeometry.ts'
import { driftCargo, repelBody } from '../src/games/hardVacuum/expeditionPhysics.ts'
import { RECOVERY_SEAL } from '../src/games/hardVacuum/havenRecovery.ts'
import { IGNITION_CRADLE } from '../src/games/hardVacuum/campaignWorld.ts'
import { replay } from './helpers/sessionReplay.mjs'

const freePods = SURVIVAL_PODS.filter(pod=>!pod.locked)
const wardPods = SURVIVAL_PODS.filter(pod=>pod.locked)
const payload = (pos,tethered=true)=>({pos:{...pos},vel:{x:0,y:0},tethered})
const tick = (state,rt,dt=.1)=>stepExpedition(state,rt,{dt,ship:{pos:{x:8000,y:3560},vel:{x:0,y:0},angle:0,radius:15},rocks:[],harpoon:{state:'idle'},beam:{active:false}})
function loadAtHaven(state,rt,id) {
  const body=cargoBodies(state,rt).find(body=>body.cargoId===id),base=havenPosition(state)
  Object.assign(body,payload({x:base.x-132,y:base.y}));body.anchored=false
  return body
}

test('twelve unique pods occupy eight of twelve medical cradles; the four missing pods are in earlier regions',()=>{
  assert.equal(new Set(SURVIVAL_PODS.map(pod=>pod.id)).size,12)
  assert.equal(WARD_POD_BERTHS.length,12);assert.equal(wardPods.length,8);assert.equal(freePods.length,4)
  assert.deepEqual(freePods.map(pod=>pod.sector),['refuge-entry','manifest','works','archive'])
  assert.equal(SURVIVAL_PODS.some(pod=>['breach','rescue','baggage','arrival'].includes(pod.sector)),false)
  const state=freshExpedition(),map=expeditionMap(state)
  for(const pod of SURVIVAL_PODS) {
    assert.equal(pod.value,1000);assert.ok(isInsideCavern(pod.pos,24,map),pod.id)
    const berth=WARD_POD_BERTHS.find(b=>b.id===pod.id)
    assert.equal(pod.pos.x===berth.x && pod.pos.y===berth.y,pod.locked)
  }
})

test('locked pods resist towing and impulses; only ward power releases all eight without collecting them',()=>{
  const state=freshExpedition(),rt=freshRuntime()
  state.cargo={[wardPods[0].id]:payload({x:7800,y:3560})}
  for(const body of cargoBodies(state,rt).filter(body=>wardPods.some(pod=>pod.id===body.cargoId))) {
    const before={...body.pos}
    assert.equal(body.anchored,true);assert.equal(body.tethered,false)
    assert.equal(repelBody(body,{x:1,y:0}),false);driftCargo(body,10);assert.deepEqual(body.pos,before)
    assert.equal(rescuePod(state,body.cargoId),false)
  }
  powerReceiver(state,'refuge-power','refuge-power')
  assert.ok(wardPods.every(pod=>!podReleased(state,pod.id)))
  powerReceiver(state,'ward-power','ward-power')
  for(const body of cargoBodies(state,rt).filter(body=>wardPods.some(pod=>pod.id===body.cargoId))) {
    assert.equal(body.anchored,false);assert.ok(Math.hypot(body.vel.x,body.vel.y)>0)
    assert.ok(repelBody(body,{x:0,y:1}))
  }
  assert.deepEqual(state.rescuedPods,[]);assert.equal(state.banked,0)
})

test('all medical cradles have physical extraction clearance and the safe return fits a pod',()=>{
  const state=freshExpedition('refuge');powerReceiver(state,'ward-power','ward-power');state.doors={}
  const map=expeditionMap(state)
  for(const berth of WARD_POD_BERTHS) {
    const route=[{x:berth.x,y:berth.y},{x:berth.x,y:berth.y+berth.facing*60},
      {x:2535,y:berth.y+berth.facing*60},{x:2535,y:3520},{x:2270,y:3520},{x:1870,y:3500},{x:1490,y:3600}]
    for(let i=1;i<route.length;i++) for(let j=0;j<=100;j++) {
      const a=route[i-1],b=route[i],p={x:a.x+(b.x-a.x)*j/100,y:a.y+(b.y-a.y)*j/100}
      assert.ok(isInsideCavern(p,24,map),`${berth.id}: ${JSON.stringify(p)}`)
    }
  }
})

test('rescue commits at shutter seal, banks 1000 once, and survives death, reload and Haven relocation',()=>{
  const state=freshExpedition(),rt=freshRuntime(),id=freePods[0].id
  loadAtHaven(state,rt,id)
  stepCargoRecovery(state,rt,RECOVERY_SEAL-.01)
  assert.equal(state.banked,0);assert.deepEqual(state.rescuedPods,[])
  stepCargoRecovery(state,rt,.02)
  assert.equal(state.banked,1000);assert.deepEqual(state.rescuedPods,[id])
  assert.equal(rescuePod(state,id),false)
  for(let i=0;i<40;i++)stepCargoRecovery(state,rt,.1)
  snapshotCargo(state,rt,[])
  assert.equal(state.cargo[id],undefined)
  const loaded=parseExpedition(JSON.stringify(state));assert.ok(loaded)
  assert.equal(cargoBodies(loaded,freshRuntime()).some(body=>body.cargoId===id),false)
  loaded.credits=200;crashExpedition(loaded)
  assert.equal(loaded.banked,1000);assert.deepEqual(loaded.rescuedPods,[id])
  powerReceiver(loaded,'breach-power','breach-power');loaded.doors={};loaded.campaign.berths.push('freight')
  assert.ok(moveHaven(loaded,'freight',true,expeditionMap(loaded)))
  while(loaded.campaign.journey)stepHaven(loaded,.5)
  assert.deepEqual(loaded.rescuedPods,[id]);assert.equal(loaded.banked,1000)
})

test('interrupted pod recovery reloads as cargo before custody and cannot duplicate a sealed rescue',()=>{
  for(const elapsed of [.5,1.5,2.15]) {
    const state=freshExpedition(),rt=freshRuntime(),id=freePods[0].id
    loadAtHaven(state,rt,id);stepCargoRecovery(state,rt,elapsed);snapshotCargo(state,rt,[])
    const loaded=parseExpedition(JSON.stringify(state)),runtime=freshRuntime()
    assert.ok(loaded)
    if(elapsed<RECOVERY_SEAL)loadAtHaven(loaded,runtime,id)
    for(let i=0;i<40;i++)stepCargoRecovery(loaded,runtime,.1)
    assert.deepEqual(loaded.rescuedPods,[id]);assert.equal(loaded.banked,1000)
  }
})

test('every pod is recovered through Haven, totals 12000 credits, and cannot win without escape power',()=>{
  const state=freshExpedition(),rt=freshRuntime();powerReceiver(state,'ward-power','ward-power')
  for(const pod of SURVIVAL_PODS) {
    loadAtHaven(state,rt,pod.id)
    for(let i=0;i<30;i++)stepCargoRecovery(state,rt,.1)
  }
  assert.ok(allSurvivorsAboard(state));assert.equal(state.banked,12000)
  assert.equal(completeEvacuation(state),false);assert.equal(state.complete,false)
  state.flags=['ignition-ready'];state.gates=GATES.map(g=>g.id)
  const core=cargoBodies(state,rt).find(body=>body.cargoId==='core')
  Object.assign(core,payload(IGNITION_CRADLE))
  for(let i=0;i<35;i++)tick(state,rt)
  assert.equal(state.core,true);assert.equal(state.complete,false)
  assert.ok(launchHaven(state,expeditionMap(state)))
  for(let i=0;i<600&&!state.complete;i++)stepHaven(state,.1)
  assert.equal(state.complete,true)
  assert.equal(completeEvacuation(state),false);assert.equal(state.banked,12000)
})

test('restoring power first and rescuing the last pod still waits for an explicit departure',()=>{
  const state=freshExpedition(),rt=freshRuntime(),last=freePods[0].id
  state.core=true;state.rescuedPods=SURVIVAL_PODS.filter(pod=>pod.id!==last).map(pod=>pod.id)
  assert.equal(completeEvacuation(state),false)
  assert.equal(objective(state).target.x,freePods[0].pos.x)
  loadAtHaven(state,rt,last)
  for(let i=0;i<23;i++)tick(state,rt)
  assert.equal(state.rescuedPods.length,12);assert.equal(state.complete,false,'let the shutters finish')
  for(let i=0;i<5;i++)tick(state,rt)
  assert.equal(state.complete,false)
  snapshotCargo(state,rt,[]);assert.deepEqual(parseExpedition(JSON.stringify(state)),state)
})

test('two lit markers per section stay inside their moving panel at every fold and rotation',()=>{
  for(const deployment of [0,.25,.5,.75,1])for(const angle of [0,.7,2.1])for(const rescued of [0,1,7,12]) {
    const pose={pos:{x:130,y:240},angle,deployment},panels=havenPanels(pose),markers=havenRescueMarkers(pose,rescued)
    assert.equal(markers.length,12);assert.equal(markers.filter(marker=>marker.lit).length,rescued)
    for(let i=0;i<6;i++)assert.equal(markers.filter(marker=>marker.panel===i).length,2)
    for(const marker of markers)assert.ok(pointInPolygon(marker.pos,panels[marker.panel].vertices))
  }
})

test('pod saves reject unknown or duplicate survivors, duplicate cargo and premature victory',()=>{
  const state=freshExpedition()
  for(const patch of [{rescuedPods:undefined},{rescuedPods:['bogus']},{rescuedPods:[freePods[0].id,freePods[0].id]},{core:true,complete:true},
    {rescuedPods:[freePods[0].id],cargo:{[freePods[0].id]:payload(freePods[0].pos)}}]) {
    assert.equal(parseExpedition(JSON.stringify({...state,...patch})),null)
  }
  assert.equal(rescuePod(state,'bogus'),false)
})

test('schema-seven migration reopens rescue without removing installed power or paying unearned rescue credits',()=>{
  const state=freshExpedition();state.version=7;delete state.rescuedPods
  state.core=true;state.complete=true;state.banked=54321;state.credits=50
  const loaded=parseExpedition(JSON.stringify(state))
  assert.ok(loaded);assert.equal(loaded.core,true);assert.equal(loaded.complete,false)
  assert.deepEqual(loaded.rescuedPods,[]);assert.equal(loaded.banked,54321);assert.equal(loaded.credits,50)
  assert.deepEqual(parseExpedition(JSON.stringify(loaded)),loaded)
})

test('the old Breach pod relocates once, without moving handled pods or undoing rescues and departure',()=>{
  const pod=SURVIVAL_PODS.find(p=>p.id==='survival-01')
  for(const version of [8,9])for(const pos of [{x:8250,y:3650},{x:8070,y:3770}])for(const tethered of [false,true]) {
    const state=freshExpedition();state.version=version;state.banked=6789
    state.cargo={[pod.id]:payload(pos,tethered)}
    const loaded=parseExpedition(JSON.stringify(state));assert.ok(loaded)
    const body=cargoBodies(loaded,freshRuntime()).find(b=>b.cargoId===pod.id)
    assert.deepEqual(body.pos,tethered ? pos : pod.pos);assert.equal(loaded.banked,6789)
    assert.deepEqual(parseExpedition(JSON.stringify(loaded)),loaded)
  }
  const rescued=freshExpedition();rescued.version=9;rescued.core=true;rescued.complete=true
  rescued.rescuedPods=SURVIVAL_PODS.map(p=>p.id);rescued.banked=72000
  const kept=parseExpedition(JSON.stringify(rescued));assert.ok(kept.complete)
  assert.equal(kept.banked,72000);assert.deepEqual(kept.rescuedPods,rescued.rescuedPods)
  assert.equal(cargoBodies(kept,freshRuntime()).some(b=>b.cargoId===pod.id),false)
  const moved=freshExpedition();moved.version=9;moved.cargo={[pod.id]:payload({x:7900,y:1350},false)}
  assert.deepEqual(parseExpedition(JSON.stringify(moved)).cargo,moved.cargo)
  const current=freshExpedition();current.cargo={[pod.id]:payload({x:8250,y:3650},false)}
  assert.deepEqual(parseExpedition(JSON.stringify(current)).cargo,current.cargo)
})

test('the final pod can finish while docked, but launch waits for the shutters and an explicit command',()=>{
  const state=freshExpedition(),last=freePods[0].id
  state.core=true;state.rescuedPods=SURVIVAL_PODS.filter(pod=>pod.id!==last).map(pod=>pod.id)
  state.cargo={[last]:payload({x:7868,y:3560})}
  const r=replay(state);r.session.refs.rocksRef.current=[]
  r.command({type:'interact'});r.run(135)
  r.command({type:'launch'});assert.equal(r.session.mode,'docked','cargo shutters are still closing')
  r.run(225)
  assert.equal(r.session.mode,'docked');assert.equal(r.session.expedition.rescuedPods.length,12)
  assert.equal(r.session.expedition.banked,1000)
  r.command({type:'launch'});assert.equal(r.session.mode,'playing');assert.equal(r.session.expedition.complete,false)
  for(let i=0;i<2400&&r.session.mode==='playing';i++)r.step()
  assert.equal(r.session.mode,'complete')
})

test('real flight and grapple commands tow a survivor home without position writes during flight',()=>{
  const state=freshExpedition();state.position={x:7780,y:3560};state.impactShieldInstalled=true;state.shields=2
  state.cargo={'survival-01':payload({x:7680,y:3560},false)}
  const r=replay(state),s=r.session;s.refs.rocksRef.current=[]
  r.command({type:'tether'});r.run(30)
  assert.equal(s.refs.harpoonRef.current.state,'attached')
  assert.equal(s.refs.harpoonRef.current.rock.cargoId,'survival-01')
  for(let i=0;i<1200&&!s.expedition.rescuedPods.length&&s.mode==='playing';i++)r.step(()=>r.fly({x:8010,y:3560},65))
  assert.equal(s.mode,'playing');assert.deepEqual(s.expedition.rescuedPods,['survival-01'])
  assert.equal(s.expedition.banked,1000);assert.equal(s.expedition.complete,false)
})
