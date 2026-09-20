import assert from 'node:assert/strict'
import test from 'node:test'
import { bankAtCheckpoint, crashExpedition, freshExpedition, parseExpedition, purchaseUpgrade } from '../src/games/hardVacuum/expedition.ts'
import { RADIATION_CAPACITY, radiationFraction, rechargeRadiation, stepRadiation, freshRadiationFeedback, stepRadiationFeedback } from '../src/games/hardVacuum/radiation.ts'
import { needsRecharge, restoreShipSystems } from '../src/games/hardVacuum/supplies.ts'
import { SHIP_UPGRADES } from '../src/games/hardVacuum/upgrades.ts'
import { SAVE_SCHEMA_VERSION } from '../src/games/hardVacuum/saveMigrations.ts'
import { createGameSession } from '../src/games/hardVacuum/gameSession.ts'

test('radiation shielding has no upgrade or purchase path, even after the module is installed',()=>{
  assert.ok(!SHIP_UPGRADES.includes('radiationReserve'))
  for(const upgrades of [[],['radiation']]) {
    const state=freshExpedition();state.banked=100000;state.upgrades=upgrades
    const before=structuredClone(state)
    assert.equal(purchaseUpgrade(state,'radiationReserve'),false);assert.deepEqual(state,before)
    const session=createGameSession(state);session.command({type:'start'});session.command({type:'interact'})
    for(let i=0;i<120;i++)session.step()
    assert.equal(session.mode,'docked')
    session.command({type:'upgrade',id:'radiationReserve'})
    assert.equal(session.expedition.banked,100000)
    assert.equal(session.expedition.upgradeLevels.radiationReserve,undefined)
  }
})

test('the original reserve lasts eight seconds at peak exposure and every Haven recovery path refills 100',()=>{
  const state=freshExpedition();state.upgrades=['radiation']
  rechargeRadiation(state);assert.equal(state.radiationCharge,RADIATION_CAPACITY)
  const pos={x:2670,y:1130},dose=stepRadiation(state,pos,7.9)
  assert.equal(dose.failed,false);assert.ok(state.radiationCharge>0&&state.radiationCharge<2)
  stepRadiation(state,pos,.2);assert.equal(state.radiationCharge,0)
  assert.ok(stepRadiation(state,pos,2).failed)
  assert.ok(needsRecharge(state));assert.ok(restoreShipSystems(state));assert.equal(state.radiationCharge,100)
  assert.equal(needsRecharge(state),false)
  state.radiationCharge=0;bankAtCheckpoint(state,'haven');assert.equal(state.radiationCharge,100)
  state.radiationCharge=0;crashExpedition(state);assert.equal(state.radiationCharge,100);assert.equal(state.radiationExposure,0)
})

test('all historical radiation stages refund their full cost exactly once and clamp without refilling',()=>{
  for(const version of [1,2,3]) for(const [level,capacity,refund] of [[0,100,0],[1,150,6000],[2,200,18000],[3,250,42000]]) {
    for(const charge of [0,45,capacity]) {
      const state={...freshExpedition(),version,banked:4321,credits:81,upgrades:['radiation','hull',...(level?['radiationReserve']:[])],upgradeLevels:{hull:2,radiationReserve:level},radiationCharge:charge}
      const migrated=parseExpedition(JSON.stringify(state))
      assert.ok(migrated);assert.equal(migrated.version,SAVE_SCHEMA_VERSION)
      assert.equal(migrated.banked,4321+refund);assert.equal(migrated.credits,81)
      assert.equal(migrated.radiationCharge,Math.min(charge,100))
      assert.deepEqual(migrated.upgradeLevels,{hull:2});assert.deepEqual(migrated.upgrades,['radiation','hull'])
      assert.deepEqual(parseExpedition(JSON.stringify(migrated)),migrated)
    }
  }
})

test('legacy radiation fields are validated before refund; current saves cannot reintroduce the upgrade',()=>{
  for(const version of [1,2,3]) {
    const old={...freshExpedition(),version,upgrades:['radiation','radiationReserve']}
    for(const level of [-1,4,1.5,null,'2']) assert.equal(parseExpedition(JSON.stringify({...old,upgradeLevels:{radiationReserve:level}})),null)
    for(const [level,charge] of [[0,101],[1,151],[2,201],[3,251]]) assert.equal(parseExpedition(JSON.stringify({...old,upgradeLevels:{radiationReserve:level},radiationCharge:charge})),null)
  }
  const current=freshExpedition()
  assert.equal(parseExpedition(JSON.stringify({...current,upgrades:['radiationReserve']})),null)
  assert.equal(parseExpedition(JSON.stringify({...current,upgradeLevels:{radiationReserve:0}})),null)
  assert.equal(parseExpedition(JSON.stringify({...current,radiationCharge:101})),null)
})

test('radiation percentages and warnings use only the fixed original reserve',()=>{
  const state=freshExpedition();state.upgrades=['radiation'];state.radiationCharge=50
  assert.equal(radiationFraction(state),.5)
  const dose={intensity:.5,exposed:true,drained:1}
  const normal=stepRadiationFeedback(freshRadiationFeedback(),dose,state,.01).urgency
  state.radiationCharge=20
  assert.ok(stepRadiationFeedback(freshRadiationFeedback(),dose,state,.01).urgency>normal)
})
