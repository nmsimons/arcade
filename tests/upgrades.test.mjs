import assert from 'node:assert/strict'
import test from 'node:test'
import { bankAtCheckpoint, crashExpedition, freshExpedition, maxShields, parseExpedition, purchaseUpgrade } from '../src/games/hardVacuum/expedition.ts'
import { SHOP, SHIP_UPGRADES, UPGRADE_COSTS, laserCapacityMs, tetherReachMultiplier, upgradeLevel, upgradeOffer } from '../src/games/hardVacuum/upgrades.ts'
import { laserImpactMs } from '../src/games/hardVacuum/laser.ts'

test('each shop track advances one stage at a time, charges its displayed price, and stops at maximum', () => {
  assert.deepEqual(SHOP.map(item => item.id), ['hull', 'capacitor', 'winch', 'focus'])
  for (const track of SHOP) {
    const state = freshExpedition(); state.banked = 100000;state.upgrades=['radiation'];state.impactShieldInstalled=true
    for (let stage = 1; stage < track.values.length; stage++) {
      const offer = upgradeOffer(state, track.id), balance = state.banked
      assert.equal(offer.stage, stage); assert.equal(offer.level, stage - 1)
      assert.equal(offer.cost, (track.costs ?? [750, 1500, 3000, 6000, 10000])[stage - 1])
      assert.ok(purchaseUpgrade(state, track.id))
      assert.equal(state.banked, balance - offer.cost)
      assert.equal(upgradeLevel(state, track.id), stage)
    }
    const finished = structuredClone(state)
    assert.equal(upgradeOffer(state, track.id).maxed, true)
    assert.equal(purchaseUpgrade(state, track.id), false)
    assert.deepEqual(state, finished)
    assert.equal(state.upgrades.filter(id => id === track.id).length, 1)
    assert.equal(upgradeOffer(state, track.id).id, track.id)
  }
})

test('unaffordable stages cannot spend carried credits or advance a track', () => {
  const state = freshExpedition(); state.credits = 100000
  for (let stage = 1; stage <= 5; stage++) {
    state.banked = UPGRADE_COSTS[stage - 1] - 1
    const before = structuredClone(state)
    assert.equal(purchaseUpgrade(state, 'capacitor'), false)
    assert.deepEqual(state, before)
    state.banked++
    assert.ok(purchaseUpgrade(state, 'capacitor'))
    assert.equal(state.banked, 0); assert.equal(state.credits, 100000)
  }
})

test('every stage changes actual shield, firing duration, cable reach, and laser contact values', () => {
  const state = freshExpedition(); state.banked = 200000;state.upgrades=['radiation'];state.impactShieldInstalled=true
  const values = () => [maxShields(state), laserCapacityMs(state), tetherReachMultiplier(state), laserImpactMs(state)]
  assert.deepEqual(values(), [2, 500, 1, 400])
  const expected = [[3, 750, 2, 300], [4, 1000, 2, 250], [5, 1250, 2, 200], [6, 1500, 2, 150], [8, 2000, 2, 100]]
  for (const stage of expected) {
    for (const track of SHOP) if (!upgradeOffer(state, track.id).maxed) assert.ok(purchaseUpgrade(state, track.id))
    assert.deepEqual(values(), stage)
    bankAtCheckpoint(state, 'haven'); assert.equal(state.shields, stage[0])
    const restored = parseExpedition(JSON.stringify(state))
    assert.deepEqual(restored, state)
    crashExpedition(restored); assert.equal(restored.shields, stage[0])
    assert.deepEqual(restored.upgradeLevels, state.upgradeLevels)
  }
})

test('legacy purchases keep their original benefits and offer the appropriate next stage', () => {
  const legacy = { ...freshExpedition(), upgrades: ['hull', 'capacitor', 'winch', 'focus'], shields: 4 };legacy.version=1;
  delete legacy.upgradeLevels
  const state = parseExpedition(JSON.stringify(legacy))
  assert.deepEqual([maxShields(state), laserCapacityMs(state), tetherReachMultiplier(state), laserImpactMs(state)], [4, 1000, 2, 250])
  assert.deepEqual(SHOP.map(item => upgradeOffer(state, item.id).stage), [3, 3, 1, 3])
  state.banked = 3000; assert.ok(purchaseUpgrade(state, 'focus'))
  assert.equal(laserImpactMs(state), 200); assert.equal(state.banked, 0)
  legacy.upgrades.push('focus2')
  const focused = parseExpedition(JSON.stringify(legacy))
  assert.equal(laserImpactMs(focused), 100); assert.equal(upgradeOffer(focused, 'focus').maxed, true)
  for (const upgradeLevels of [[], 1, { focus: -1 }, { focus: 6 }, { focus: 1.5 }, { focus: '2' }, { unknown: 1 }]) {
    assert.equal(parseExpedition(JSON.stringify({ ...freshExpedition(), upgradeLevels })), null)
  }
})

test('the single winch purchase doubles reach and replaces every previously purchased tether stage', () => {
  for (let level = 0; level <= 5; level++) {
    const old = freshExpedition();old.version=1;
    old.upgradeLevels.winch = level
    if (level) old.upgrades.push('winch')
    const state = parseExpedition(JSON.stringify(old))
    assert.equal(state.upgradeLevels.winch, level ? 1 : 0)
    assert.equal(tetherReachMultiplier(state), level ? 2 : 1)
    const offer = upgradeOffer(state, 'winch')
    assert.equal(offer.name, 'Longline winch')
    assert.equal(offer.maxLevel, 1); assert.equal(offer.maxed, level > 0)
    state.banked = 10000
    if (!level) assert.ok(purchaseUpgrade(state, 'winch'))
    assert.equal(tetherReachMultiplier(state), 2)
    const installed = structuredClone(state)
    assert.equal(purchaseUpgrade(state, 'winch'), false)
    assert.deepEqual(state, installed)
    assert.deepEqual(parseExpedition(JSON.stringify(state)), state)
  }
})

test('the shop only upgrades existing systems and never sells equipment', () => {
  assert.deepEqual(SHIP_UPGRADES, ['hull', 'capacitor', 'winch', 'focus'])
  const state = freshExpedition(); state.banked = 10000
  const before=structuredClone(state)
  for(const id of ['blaster','teleporter','radiation','recharge']) assert.equal(purchaseUpgrade(state,id),false)
  assert.deepEqual(state,before)
})
