import assert from 'node:assert/strict'
import test from 'node:test'
import { bankAtCheckpoint, crashExpedition, freshExpedition, parseExpedition, purchaseUpgrade } from '../src/games/hardVacuum/expedition.ts'
import { radiationCapacity, radiationFraction, rechargeRadiation, stepRadiation, freshRadiationFeedback, stepRadiationFeedback } from '../src/games/hardVacuum/radiation.ts'
import { needsRecharge, restoreShipSystems } from '../src/games/hardVacuum/supplies.ts'
import { upgradeOffer } from '../src/games/hardVacuum/upgrades.ts'

test('radiation upgrades require the recovered module and banked funds, with one advancing shop entry',()=>{
  const s=freshExpedition();s.banked=100000;s.credits=100000
  assert.equal(upgradeOffer(s,'radiationReserve').locked,true)
  assert.equal(purchaseUpgrade(s,'radiationReserve'),false);assert.equal(s.banked,100000)
  s.upgrades.push('radiation')
  for(const [stage,cost,capacity] of [[1,6000,150],[2,12000,200],[3,24000,250]]) {
    s.banked=cost-1;assert.equal(purchaseUpgrade(s,'radiationReserve'),false)
    const offer=upgradeOffer(s,'radiationReserve');assert.equal(offer.cost,cost);assert.equal(offer.stage,stage)
    s.banked++;assert.ok(purchaseUpgrade(s,'radiationReserve'));assert.equal(s.banked,0);assert.equal(s.credits,100000)
    assert.equal(radiationCapacity(s),capacity);assert.equal(s.radiationCharge,capacity)
    assert.equal(s.upgrades.filter(id=>id==='radiationReserve').length,1)
    assert.deepEqual(parseExpedition(JSON.stringify(s)),s)
  }
  assert.ok(upgradeOffer(s,'radiationReserve').maxed);assert.equal(purchaseUpgrade(s,'radiationReserve'),false)
})

test('capacity upgrades extend actual exposure time and all Haven recovery paths refill the larger reserve',()=>{
  const pos={x:2670,y:1130}
  for(const [stage,capacity,seconds] of [[0,100,8],[1,150,12],[2,200,16],[3,250,20]]) {
    const s=freshExpedition();s.upgrades=['radiation'];s.upgradeLevels.radiationReserve=stage
    rechargeRadiation(s);assert.equal(s.radiationCharge,capacity)
    const dose=stepRadiation(s,pos,seconds-.1)
    assert.equal(dose.failed,false);assert.ok(s.radiationCharge>0&&s.radiationCharge<2)
    stepRadiation(s,pos,.2);assert.equal(s.radiationCharge,0)
    assert.ok(stepRadiation(s,pos,2).failed,'upgrades extend the timer, not immunity')
    assert.ok(needsRecharge(s));assert.ok(restoreShipSystems(s));assert.equal(s.radiationCharge,capacity)
    assert.equal(needsRecharge(s),false)
    s.radiationCharge=100;assert.equal(needsRecharge(s),capacity>100,'a formerly full bar still needs its extra capacity filled')
    bankAtCheckpoint(s,'haven');assert.equal(s.radiationCharge,capacity)
    s.radiationCharge=0;crashExpedition(s);assert.equal(s.radiationCharge,capacity)
    assert.equal(s.radiationExposure,0)
  }
})

test('save validation, percentages and low-reserve warnings use the purchased capacity',()=>{
  const s=freshExpedition();s.upgrades=['radiation'];s.upgradeLevels.radiationReserve=3;s.radiationCharge=125
  assert.equal(radiationFraction(s),.5);assert.deepEqual(parseExpedition(JSON.stringify(s)),s)
  for(const [level,charge] of [[0,101],[1,151],[2,201],[3,251],[4,100]]) {
    s.upgradeLevels.radiationReserve=level;s.radiationCharge=charge
    assert.equal(parseExpedition(JSON.stringify(s)),null)
  }
  const urgency=level=>{
    const state=freshExpedition();state.upgrades=['radiation'];state.upgradeLevels.radiationReserve=level;state.radiationCharge=radiationCapacity(state)*.2
    return stepRadiationFeedback(freshRadiationFeedback(),{intensity:.5,exposed:true,drained:1},state,.01).urgency
  }
  assert.equal(urgency(0),urgency(3))
})
