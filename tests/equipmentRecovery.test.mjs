import assert from 'node:assert/strict'
import test from 'node:test'
import { cargoBodies, crashExpedition, expeditionMap, freshExpedition, freshRuntime, looseObjects, objective, parseExpedition, PICKUPS, powerReceiver, snapshotCargo, stepCargoRecovery } from '../src/games/hardVacuum/expedition.ts'
import { moduleInstalled } from '../src/games/hardVacuum/equipment.ts'
import { RECOVERY_END, RECOVERY_SEAL } from '../src/games/hardVacuum/havenRecovery.ts'
import { havenPosition } from '../src/games/hardVacuum/campaign.ts'
import { radiationAt, stepRadiation } from '../src/games/hardVacuum/radiation.ts'
import { isInsideCavern } from '../src/games/hardVacuum/worldGeometry.ts'

function advance(state,runtime,seconds) {
  const events=[]
  for(let time=0;time<seconds-1e-9;time+=1/60) {
    const dt=Math.min(1/60,seconds-time);runtime.elapsed+=dt
    events.push(...stepCargoRecovery(state,runtime,dt))
  }
  return events
}
for(const item of PICKUPS) test(`${item.label} installs only after delivery seals, survives reload/death, and never respawns`,()=>{
  const state=freshExpedition(),runtime=freshRuntime(),base=havenPosition(state)
  const body=cargoBodies(state,runtime).find(body=>body.cargoId===item.id)
  assert.equal(moduleInstalled(state,item.id),false)
  body.tethered=true
  advance(state,runtime,4)
  assert.equal(moduleInstalled(state,item.id),false,'finding and tethering is not installation')
  body.pos={x:base.x-132,y:base.y};body.vel={x:0,y:0}
  advance(state,runtime,RECOVERY_SEAL-.05)
  assert.equal(moduleInstalled(state,item.id),false,'Haven must finish the handoff')
  const events=advance(state,runtime,.1)
  assert.deepEqual(events,[`${item.label} installed`])
  assert.ok(moduleInstalled(state,item.id));assert.equal(state.banked,0,'installation is free')
  if(item.id==='impact')assert.equal(state.shields,2)
  if(item.id==='blaster')assert.equal(state.blasterCharges,3)
  if(item.id==='radiation')assert.equal(state.radiationCharge,100)
  assert.deepEqual(advance(state,runtime,RECOVERY_END+1),[])
  snapshotCargo(state,runtime,[])
  const saved=parseExpedition(JSON.stringify(state))
  assert.ok(moduleInstalled(saved,item.id));assert.equal(saved.cargo[item.id],undefined)
  crashExpedition(saved)
  assert.ok(moduleInstalled(saved,item.id))
  assert.ok(!looseObjects(saved).some(p=>p.id===item.id))
  assert.ok(!cargoBodies(saved,freshRuntime()).some(p=>p.cargoId===item.id))
})

test('partially recovered devices remain physical cargo across saves and install once',()=>{
  for(const id of ['impact','blaster','teleporter']) {
    const state=freshExpedition(),runtime=freshRuntime(),base=havenPosition(state)
    const body=cargoBodies(state,runtime).find(body=>body.cargoId===id)
    body.pos={x:base.x-132,y:base.y};body.vel={x:0,y:0};body.tethered=true
    advance(state,runtime,1.3);snapshotCargo(state,runtime,[])
    const loaded=parseExpedition(JSON.stringify(state)),rt=freshRuntime()
    assert.equal(moduleInstalled(loaded,id),false)
    assert.deepEqual(loaded.cargo[id],state.cargo[id])
    assert.equal(advance(loaded,rt,RECOVERY_END+1).length,1)
    assert.ok(moduleInstalled(loaded,id))
  }
})

test('existing installations suppress new pickups without refilling saved ammunition',()=>{
  const state=freshExpedition();state.version=2
  state.blasterInstalled=true;state.blasterCharges=1;state.teleporterInstalled=true
  const loaded=parseExpedition(JSON.stringify(state))
  assert.equal(loaded.blasterCharges,1)
  assert.deepEqual(looseObjects(loaded).filter(p=>['blaster','teleporter'].includes(p.id)),[])
})

function clearRoute(state,points) {
  const map=expeditionMap(state)
  for(let i=1;i<points.length;i++) {
    const [ax,ay]=points[i-1],[bx,by]=points[i],steps=Math.ceil(Math.hypot(bx-ax,by-ay)/4)
    for(let n=0;n<=steps;n++) {
      const pos={x:ax+(bx-ax)*n/steps,y:ay+(by-ay)*n/steps}
      assert.ok(isInsideCavern(pos,23,map),`module path blocked: ${JSON.stringify(pos)}`)
      assert.equal(radiationAt(pos,map).intensity,0,'recovery route is outside radiation')
    }
  }
}
test('the Works blaster can be reached and towed back to Freight Haven before opening any blast door',()=>{
  const state=freshExpedition()
  for(const id of ['breach-power','freight-power','dispatch-power'])powerReceiver(state,id,id)
  state.doors={};state.upgrades=['radiation'];state.radiationCharge=100
  const item=PICKUPS.find(item=>item.id==='blaster')
  assert.equal(item.sector,'works')
  const map=expeditionMap(state)
  assert.ok(!isInsideCavern({x:5525,y:650},23,map),'the tool crib stays sealed')
  const approach=[[8010,1350],[7700,1250],[7300,1160],[7100,1190],[6800,1150],[6100,1150],[5870,1330],[5570,1310],[5300,1150],[item.pos.x,item.pos.y]]
  // Both directions have cargo clearance, with the shield naturally recharging
  // in the main bay before the tow home through the radioactive transfer tube.
  for(const points of [approach,[...approach].reverse()]) {
    for(let i=1;i<points.length;i++) {
      const [ax,ay]=points[i-1],[bx,by]=points[i],length=Math.hypot(bx-ax,by-ay),steps=Math.ceil(length/4)
      for(let n=1;n<=steps;n++) {
        const pos={x:ax+(bx-ax)*n/steps,y:ay+(by-ay)*n/steps}
        assert.ok(isInsideCavern(pos,23,map),`cargo path blocked at ${JSON.stringify(pos)}`)
        assert.equal(stepRadiation(state,pos,length/steps/150,map).failed,false,'a prompt shielded crossing is survivable')
      }
    }
    assert.ok(state.radiationCharge>0)
  }
  assert.equal(state.blasterInstalled,false)
  assert.equal(state.power['works-power'],undefined,'installation does not depend on powering the Works berth')
})

test('the Foundry teleporter and Archive survivor have a clear, radiation-free return after restoring the internal relay',()=>{
  const state=freshExpedition('ring'),item=PICKUPS.find(item=>item.id==='teleporter')
  assert.equal(item.sector,'foundry')
  powerReceiver(state,'relay','relay');state.doors={}
  // Keep the southern Foundry door shut to verify the new return independently.
  clearRoute(state,[[item.pos.x,item.pos.y],[740,370],[880,400],[1150,400],[1500,400],[1500,600],[1500,810],[1500,950]])
  clearRoute(state,[[1570,470],[1500,500],[1500,600],[1500,810],[1500,950]])
})

test('Ring guidance earns the Foundry return first, then leads recovery of its teleporter before the reactor',()=>{
  const state=freshExpedition('ring');state.impactShieldInstalled=true;state.blasterInstalled=true;state.upgrades=['radiation']
  for(const id of ['breach-power','freight-power','dispatch-power','works-power','ring-power','foundry'])powerReceiver(state,id,id)
  assert.equal(objective(state).title,'Open the Foundry return route')
  state.cargo={relay:{pos:{x:500,y:500},vel:{x:0,y:0},tethered:true}}
  assert.deepEqual(objective(state).target,{x:620,y:470})
  powerReceiver(state,'relay','relay')
  const item=PICKUPS.find(item=>item.id==='teleporter')
  assert.equal(objective(state).title,'Recover the Foundry teleporter');assert.deepEqual(objective(state).target,item.pos)
  state.cargo.teleporter={pos:{x:1500,y:800},vel:{x:0,y:0},tethered:true}
  assert.deepEqual(objective(state).target,havenPosition(state))
  state.teleporterInstalled=true;assert.equal(objective(state).title,'Restore reactor containment')
})

test('Works guidance directs missing equipment to its actual cargo position and then to Haven',()=>{
  const state=freshExpedition();state.impactShieldInstalled=true
  for(const id of ['breach-power','freight-power','dispatch-power'])powerReceiver(state,id,id)
  assert.equal(objective(state).title,'Recover radiation shielding','shielding is needed to reach the new module location')
  state.upgrades.push('radiation')
  const module=PICKUPS.find(item=>item.id==='blaster')
  assert.equal(objective(state).title,'Recover the blaster');assert.deepEqual(objective(state).target,module.pos)
  assert.match(objective(state).detail,/Works main bay/)
  state.cargo={blaster:{pos:{x:8000,y:700},vel:{x:0,y:0},tethered:false}}
  assert.deepEqual(objective(state).target,state.cargo.blaster.pos)
  state.cargo.blaster.tethered=true;assert.deepEqual(objective(state).target,havenPosition(state))
  state.blasterInstalled=true;assert.equal(objective(state).title,'Wake the Works')
})
