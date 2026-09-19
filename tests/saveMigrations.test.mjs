import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { parseExpedition, SAVE_SCHEMA_VERSION } from '../src/games/hardVacuum/saveMigrations.ts'
import { parseSave } from '../src/games/hardVacuum/expeditionSave.ts'
import { GATES } from '../src/games/hardVacuum/stationDefinitions.ts'

const fixture=name=>JSON.parse(fs.readFileSync(new URL(`./fixtures/saves/${name}.json`,import.meta.url),'utf8'))
for(const name of ['prototype','pre-supplies-medical','teleporter-refund','banked-core','journey','completed']) {
  test(`historical ${name} fixture migrates once and round trips through schema ${SAVE_SCHEMA_VERSION}`,()=>{
    const before=fixture(name),raw=JSON.stringify(before),state=parseExpedition(raw)
    assert.ok(state,`${name}: rejected historical fixture`)
    assert.equal(state.version,2)
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
    if(name==='journey') { assert.deepEqual(state.campaign.journey,before.campaign.journey);assert.deepEqual(state.cargo,before.cargo);assert.equal(state.blasterCharges,1);assert.equal(state.remoteRechargeRemaining,.5) }
    if(name==='completed')assert.ok(state.complete&&state.core)
  })
}
test('schema 2 never repeats legacy rewards or cargo relocations, and newer schemas are preserved',()=>{
  const state=parseExpedition(JSON.stringify(fixture('journey')))
  state.cargo.radiation={pos:{x:1650,y:350},vel:{x:0,y:0},tethered:false}
  assert.deepEqual(parseExpedition(JSON.stringify(state)).cargo,state.cargo)
  assert.equal(parseExpedition(JSON.stringify({...state,teleportCharges:1})),null)
  assert.equal(parseExpedition(JSON.stringify({...state,flags:['unknown']})),null)
  assert.equal(parseExpedition(JSON.stringify({...state,gates:['ignition-ready']})),null)
  const raw=JSON.stringify({...state,version:3})
  assert.deepEqual(parseSave(raw),{status:'unsupported',raw})
})
