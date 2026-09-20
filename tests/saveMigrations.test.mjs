import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { parseExpedition, SAVE_SCHEMA_VERSION } from '../src/games/hardVacuum/saveMigrations.ts'
import { parseSave } from '../src/games/hardVacuum/expeditionSave.ts'
import { GATES } from '../src/games/hardVacuum/stationDefinitions.ts'
import { cargoBodies, freshExpedition, freshRuntime, PICKUPS } from '../src/games/hardVacuum/expedition.ts'

const fixture=name=>JSON.parse(fs.readFileSync(new URL(`./fixtures/saves/${name}.json`,import.meta.url),'utf8'))
for(const name of ['prototype','pre-supplies-medical','teleporter-refund','banked-core','journey','completed']) {
  test(`historical ${name} fixture migrates once and round trips through schema ${SAVE_SCHEMA_VERSION}`,()=>{
    const before=fixture(name),raw=JSON.stringify(before),state=parseExpedition(raw)
    assert.ok(state,`${name}: rejected historical fixture`)
    assert.equal(state.version,SAVE_SCHEMA_VERSION)
    assert.ok(state.gates.every(id=>GATES.some(g=>g.id===id)))
    const again=parseExpedition(JSON.stringify(state))
    assert.deepEqual(again,state,`${name}: migration is not idempotent`)
    assert.deepEqual(parseExpedition(raw),state,`${name}: migration depends on external state`)
    assert.equal(state.credits,before.credits)
    assert.equal(state.banked,before.banked+(name==='teleporter-refund'?750:0))
    if(name==='prototype') {
      assert.equal(state.campaign.berth,'ring');assert.equal(state.checkpoint,'haven')
      assert.ok(state.upgrades.includes('radiation')&&state.upgrades.includes('focus'))
      assert.deepEqual(state.cargo.relay,before.cargo.cutter)
      assert.equal(state.cargo.radiation,undefined);assert.equal(state.cargo.foundry,undefined)
    }
    if(name==='pre-supplies-medical')assert.ok(state.gates.includes('medical-return'))
    if(name==='teleporter-refund') { assert.equal(state.upgradeLevels.winch,1);assert.equal(state.teleportCharges,undefined) }
    if(name==='banked-core') { assert.equal(state.core,false);assert.ok(state.cargo.core.tethered);assert.ok(state.flags.includes('ignition-ready'));assert.ok(state.gates.includes('breach-return')) }
    if(name==='journey') { assert.deepEqual(state.campaign.journey,before.campaign.journey);assert.deepEqual(state.cargo,before.cargo);assert.equal(state.blasterCharges,1);assert.equal(state.remoteRechargeRemaining,undefined) }
    if(name==='completed')assert.ok(state.complete&&state.core)
  })
}
test('current saves never repeat legacy rewards or cargo relocations, and newer schemas are preserved',()=>{
  const state=parseExpedition(JSON.stringify(fixture('journey')))
  state.cargo.radiation={pos:{x:1650,y:350},vel:{x:0,y:0},tethered:false}
  assert.deepEqual(parseExpedition(JSON.stringify(state)).cargo,state.cargo)
  assert.equal(parseExpedition(JSON.stringify({...state,teleportCharges:1})),null)
  assert.equal(parseExpedition(JSON.stringify({...state,flags:['unknown']})),null)
  assert.equal(parseExpedition(JSON.stringify({...state,gates:['ignition-ready']})),null)
  const raw=JSON.stringify({...state,version:SAVE_SCHEMA_VERSION+1})
  assert.deepEqual(parseSave(raw),{status:'unsupported',raw})
})

test('older Freight circuits gain new outputs without closing earned doors or moving saved cargo',()=>{
  for(const version of [1,2,3]) for(const stage of [0,1,2]) {
    const old={...freshExpedition(),version}
    if(stage>=1) {old.power['freight-power']='freight-power';old.gates=['freight-lift'];old.doors={'freight-lift':.5}}
    if(stage>=2) {old.power['dispatch-power']='dispatch-power';old.gates.push('freight-return','freight-link')}
    old.position={x:8000,y:810};old.cargo={blaster:{pos:{x:8750,y:620},vel:{x:1,y:2},tethered:true}}
    const migrated=parseExpedition(JSON.stringify(old))
    assert.ok(migrated);assert.deepEqual(migrated.position,old.position);assert.deepEqual(migrated.cargo,old.cargo)
    assert.deepEqual(migrated.power,old.power);assert.deepEqual(migrated.doors,old.doors)
    for(const gate of old.gates)assert.ok(migrated.gates.includes(gate))
    assert.equal(migrated.gates.includes('freight-return'),stage>=1)
    assert.equal(migrated.gates.includes('freight-link'),stage>=2)
    assert.deepEqual(parseExpedition(JSON.stringify(migrated)),migrated)
  }
})

test('unclaimed Freight blasters migrate to the Works once, without changing equipment or player progress',()=>{
  const module=PICKUPS.find(item=>item.id==='blaster')
  for(const version of [1,2,3,4,5]) for(const pos of [{x:8750,y:630},{x:8600,y:550}]) {
    const old={...freshExpedition(),version,banked:1234,credits:17,cargo:{blaster:{pos,vel:{x:1,y:2},tethered:false}}}
    const loaded=parseExpedition(JSON.stringify(old))
    assert.equal(loaded.version,SAVE_SCHEMA_VERSION)
    assert.equal(loaded.cargo.blaster,undefined)
    assert.deepEqual(cargoBodies(loaded,freshRuntime()).find(body=>body.cargoId==='blaster').pos,module.pos)
    assert.equal(loaded.blasterInstalled,false);assert.equal(loaded.blasterCharges,0)
    assert.equal(loaded.impactShieldInstalled,version<5,'schema-five ships do not gain an impact shield')
    assert.equal(loaded.banked,1234);assert.equal(loaded.credits,17)
    assert.deepEqual(loaded.position,old.position);assert.deepEqual(loaded.power,old.power)
    assert.deepEqual(parseExpedition(JSON.stringify(loaded)),loaded)
  }
})

test('the Works relocation preserves installed, towed, relocated and current-save blasters',()=>{
  for(const patch of [
    {version:5,blasterInstalled:true,blasterCharges:1},
    {version:5,tethered:true},
    {version:5,pos:{x:7800,y:3500}},
    {version:6},
    {version:SAVE_SCHEMA_VERSION},
  ]) {
    const {pos={x:8750,y:630},tethered=false,...equipment}=patch
    const old={...freshExpedition(),...equipment,cargo:{blaster:{pos,vel:{x:1,y:2},tethered}}}
    const loaded=parseExpedition(JSON.stringify(old))
    assert.deepEqual(loaded.cargo,old.cargo)
    assert.equal(loaded.blasterInstalled,old.blasterInstalled);assert.equal(loaded.blasterCharges,old.blasterCharges)
    assert.deepEqual(parseExpedition(JSON.stringify(loaded)),loaded)
  }
})

test('unclaimed opening shields relocate to the rescue locker once while all other cargo and progress remain intact',()=>{
  const module=PICKUPS.find(item=>item.id==='impact')
  for(const version of [5,6]) for(const pos of [{x:7830,y:3560},{x:7700,y:3500}]) {
    const old={...freshExpedition(),version,banked:1234,credits:17,
      cargo:{impact:{pos,vel:{x:1,y:2},tethered:false},'rescue-cache':{pos:{x:7100,y:3620},vel:{x:3,y:4},tethered:true}}}
    const loaded=parseExpedition(JSON.stringify(old))
    assert.equal(loaded.version,SAVE_SCHEMA_VERSION)
    assert.equal(loaded.impactShieldInstalled,false);assert.equal(loaded.shields,0)
    assert.equal(loaded.cargo.impact,undefined)
    assert.deepEqual(loaded.cargo['rescue-cache'],old.cargo['rescue-cache'])
    assert.deepEqual(cargoBodies(loaded,freshRuntime()).find(body=>body.cargoId==='impact').pos,module.pos)
    assert.equal(loaded.banked,old.banked);assert.equal(loaded.credits,old.credits)
    assert.deepEqual(loaded.campaign,old.campaign);assert.deepEqual(loaded.position,old.position)
    assert.deepEqual(parseExpedition(JSON.stringify(loaded)),loaded)
  }
})

test('rescue relocation preserves installed shields, towed modules, relocated modules and current-save positions',()=>{
  for(const patch of [
    {version:5,impactShieldInstalled:true,shields:1},
    {version:6,impactShieldInstalled:true,shields:0},
    {version:5,tethered:true},
    {version:6,tethered:true},
    {version:6,pos:{x:7120,y:3570}},
    {version:SAVE_SCHEMA_VERSION},
  ]) {
    const {pos={x:7830,y:3560},tethered=false,...equipment}=patch
    const old={...freshExpedition(),...equipment,cargo:{impact:{pos,vel:{x:1,y:2},tethered}}}
    const loaded=parseExpedition(JSON.stringify(old))
    assert.deepEqual(loaded.cargo,old.cargo)
    assert.equal(loaded.impactShieldInstalled,old.impactShieldInstalled);assert.equal(loaded.shields,old.shields)
    assert.deepEqual(parseExpedition(JSON.stringify(loaded)),loaded)
  }
})
