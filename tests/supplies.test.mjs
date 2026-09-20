import assert from 'node:assert/strict'
import test from 'node:test'
import { BASE_POSITION, freshExpedition, crashExpedition, parseExpedition, teleportToHaven } from '../src/games/hardVacuum/expedition.ts'
import { installModule } from '../src/games/hardVacuum/equipment.ts'
import { SAVE_SCHEMA_VERSION } from '../src/games/hardVacuum/saveMigrations.ts'
import { createGameSession } from '../src/games/hardVacuum/gameSession.ts'

const loaded = () => { const state=freshExpedition('ring');state.banked=10000;return state }
const shipAt = pos => ({ pos:{...pos},vel:{x:10,y:5},angle:0,radius:15 })

test('teleporter must be recovered before use, and survives reload and death',()=>{
  const state=loaded(),ship=shipAt({x:2500,y:1150})
  assert.equal(teleportToHaven(state,ship),false)
  assert.ok(installModule(state,'teleporter'));assert.equal(state.banked,10000)
  const restored=parseExpedition(JSON.stringify(state))
  assert.equal(restored.teleporterInstalled,true)
  crashExpedition(restored);assert.equal(restored.teleporterInstalled,true)
  assert.ok(teleportToHaven(restored,ship))
})

test('teleporting is reusable for free, banks every carried credit, and leaves cargo at its saved position', () => {
  const state = loaded(), origin = { x: 2500, y: 1150 }, ship = shipAt(origin)
  ship.angularVelocity = 3
  Object.assign(state, { teleporterInstalled: true, credits: 789, shields: 0, blasterCharges: 0, cargo: { radiation: { pos: { x: 2480, y: 1200 }, vel: { x: 2, y: 1 }, tethered: true } } })
  const cargo = structuredClone(state.cargo)
  assert.ok(teleportToHaven(state, ship))
  assert.deepEqual(ship.pos, BASE_POSITION); assert.deepEqual(ship.vel, { x: 0, y: 0 }); assert.deepEqual(state.position, BASE_POSITION)
  assert.equal(ship.angularVelocity, 0, 'arrival stops rotational momentum as well as linear momentum')
  assert.equal(state.credits, 0); assert.equal(state.banked, 10789); assert.equal(state.teleporterInstalled, true)
  assert.equal(state.shields, 0); assert.equal(state.blasterCharges, 0, 'normal base recharge runs after arrival')
  assert.deepEqual(state.cargo, cargo)
  assert.equal(teleportToHaven(state, ship), false)
  ship.pos = { ...origin }; state.credits = 100
  assert.ok(teleportToHaven(state, ship), 'a second trip needs no additional purchase')
  assert.equal(state.credits, 0); assert.equal(state.banked, 10889)
  assert.deepEqual(ship.pos, BASE_POSITION); assert.deepEqual(state.cargo, cargo)
  ship.pos = { ...origin }; state.banked = 0
  assert.ok(teleportToHaven(state, ship), 'teleport remains available without any credits')
  assert.equal(state.banked, 0)
})


test('schema 1 and 2 retire remote recharge, refund only unused packs once and preserve equipment',()=>{
  for(const version of [1,2]) for(const packs of [0,1,3]) {
    const old={...loaded(),version,rechargePacks:packs,remoteRechargeRemaining:.5,
      teleporterInstalled:true,blasterInstalled:true,blasterCharges:1,shields:0}
    const restored=parseExpedition(JSON.stringify(old))
    assert.ok(restored);assert.equal(restored.version,SAVE_SCHEMA_VERSION)
    assert.equal(restored.banked,old.banked+packs*500)
    assert.equal(restored.rechargePacks,undefined);assert.equal(restored.remoteRechargeRemaining,undefined)
    assert.equal(restored.blasterInstalled,true);assert.equal(restored.teleporterInstalled,true)
    assert.equal(restored.blasterCharges,1);assert.equal(restored.shields,0)
    assert.deepEqual(parseExpedition(JSON.stringify(restored)),restored)
  }
})

test('malformed legacy supplies and retired fields in current saves are rejected',()=>{
  const old={...loaded(),version:2,rechargePacks:0,remoteRechargeRemaining:0}
  for(const data of [{rechargePacks:4},{rechargePacks:-1},{rechargePacks:1.5},{rechargePacks:null},{remoteRechargeRemaining:-1},{remoteRechargeRemaining:1.1},{remoteRechargeRemaining:null},{teleporterInstalled:1}]) {
    assert.equal(parseExpedition(JSON.stringify({...old,...data})),null)
  }
  for(const data of [{rechargePacks:1},{remoteRechargeRemaining:.5}]) assert.equal(parseExpedition(JSON.stringify({...loaded(),...data})),null)
  const early={...loaded(),version:1};delete early.teleporterInstalled
  assert.equal(parseExpedition(JSON.stringify(early)).teleporterInstalled,false)
})

test('legacy teleporter charges refund once alongside unused recharge packs',()=>{
  const old={...loaded(),version:1,teleporterInstalled:true,teleportCharges:1,rechargePacks:2,remoteRechargeRemaining:0}
  const restored=parseExpedition(JSON.stringify(old))
  assert.equal(restored.banked,11750);assert.equal(restored.teleportCharges,undefined)
  assert.deepEqual(parseExpedition(JSON.stringify(restored)),restored)
  for(const teleportCharges of [-1,2,'1']) assert.equal(parseExpedition(JSON.stringify({...old,teleportCharges})),null)
  assert.equal(parseExpedition(JSON.stringify({...old,teleporterInstalled:false})),null)
})

test('R and retired commands cannot repair the ship or buy equipment in a live session',()=>{
  const state=freshExpedition();state.position={x:7600,y:3490};state.impactShieldInstalled=true;state.shields=1
  state.blasterInstalled=true;state.blasterCharges=1
  const session=createGameSession(state,{seed:90210});session.command({type:'start'})
  session.refs.rocksRef.current=[]
  session.command({type:'key',key:'r',pressed:true})
  session.command({type:'recharge'});session.command({type:'supply',id:'teleporter'})
  for(let tick=0;tick<120;tick++)session.step()
  assert.equal(session.expedition.shields,1);assert.equal(session.expedition.blasterCharges,1)
  assert.equal(session.expedition.teleporterInstalled,false)
})
