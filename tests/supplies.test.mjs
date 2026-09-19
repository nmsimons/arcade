import assert from 'node:assert/strict'
import test from 'node:test'
import { bankAtCheckpoint, BASE_POSITION, crashExpedition, freshExpedition, parseExpedition, teleportToHaven } from '../src/games/hardVacuum/expedition.ts'
import { activateRemoteRecharge, freshSupplies, purchaseSupply, RECHARGE_PACK_COST, stepRemoteRecharge, supplyOffers, TELEPORTER_COST } from '../src/games/hardVacuum/supplies.ts'
import { SHIELD_REPAIR_TIME } from '../src/games/hardVacuum/tuning.ts'

const loaded = () => ({ ...freshExpedition('ring'), banked: 10000 })
const shipAt = (pos) => ({ pos: { ...pos }, vel: { x: 80, y: 30 }, angle: 1, radius: 15 })

test('recharge packs cost banked credits, cap at three, and refill a freed inventory slot', () => {
  const state = loaded()
  for (let i = 0; i < 3; i++) assert.ok(purchaseSupply(state, 'recharge'))
  assert.equal(state.rechargePacks, 3); assert.equal(state.banked, 10000 - 3 * RECHARGE_PACK_COST)
  const full = structuredClone(state)
  assert.equal(purchaseSupply(state, 'recharge'), false); assert.deepEqual(state, full)
  state.shields = 0; assert.ok(activateRemoteRecharge(state))
  assert.equal(state.rechargePacks, 2)
  assert.ok(purchaseSupply(state, 'recharge')); assert.equal(state.rechargePacks, 3)
  const poor = freshExpedition('ring'); poor.banked = RECHARGE_PACK_COST - 1; poor.credits = 10000
  const before = structuredClone(poor)
  assert.equal(purchaseSupply(poor, 'recharge'), false); assert.deepEqual(poor, before)
})

test('buying the teleporter permanently unlocks it without a charge purchase', () => {
  const state = loaded()
  assert.equal(teleportToHaven(state, shipAt({ x: 2500, y: 1150 })), false)
  assert.deepEqual(supplyOffers(state).map(item => item.id), ['recharge', 'teleporter'])
  assert.equal(purchaseSupply(state, 'teleport'), false)
  assert.equal(purchaseSupply(state, 'blaster'), false)
  assert.ok(purchaseSupply(state, 'teleporter')); assert.equal(state.banked, 10000 - TELEPORTER_COST)
  assert.equal(state.teleporterInstalled, true)
  assert.ok(supplyOffers(state).find(item => item.id === 'teleporter').full)
  const before = structuredClone(state)
  assert.equal(purchaseSupply(state, 'teleporter'), false); assert.deepEqual(state, before)
  assert.equal(purchaseSupply(state, 'teleport'), false); assert.deepEqual(state, before)
  const poor = loaded(); poor.banked = TELEPORTER_COST - 1; poor.credits = 10000
  assert.equal(purchaseSupply(poor, 'teleporter'), false)
  assert.equal(poor.teleporterInstalled, false); assert.equal(poor.banked, TELEPORTER_COST - 1)
})

test('remote recharge restores shields and blaster on the Haven timer, leaving radiation reserve unchanged', () => {
  const state = loaded()
  Object.assign(state, { rechargePacks: 3, upgrades: ['hull', 'radiation'], upgradeLevels: { hull: 5 }, shields: 1, blasterInstalled: true, blasterCharges: 0, radiationCharge: 12, radiationExposure: 0.8, credits: 421 })
  const atBase = structuredClone(state)
  bankAtCheckpoint(atBase, 'haven')
  assert.ok(activateRemoteRecharge(state)); assert.equal(state.rechargePacks, 2)
  assert.equal(activateRemoteRecharge(state), false, 'repeat activation cannot spend a second pack')
  assert.equal(state.remoteRechargeRemaining, SHIELD_REPAIR_TIME)
  assert.equal(stepRemoteRecharge(state, SHIELD_REPAIR_TIME - 0.01), false)
  assert.deepEqual([state.shields, state.blasterCharges, state.radiationCharge], [1, 0, 12])
  assert.ok(stepRemoteRecharge(state, 0.01))
  for (const key of ['shields', 'blasterCharges']) assert.equal(state[key], atBase[key])
  assert.equal(state.radiationCharge,12);assert.equal(state.radiationExposure,.8)
  assert.equal(atBase.radiationCharge,100);assert.equal(atBase.radiationExposure,0)
  assert.equal(state.credits, 421); assert.equal(state.banked, 10000, 'remote recharge does not bank credits')
  assert.equal(stepRemoteRecharge(state, 10), false)
  assert.equal(activateRemoteRecharge(state), false, 'full systems do not waste a pack')
  state.blasterCharges = 1; assert.ok(activateRemoteRecharge(state), 'ammo alone is enough to use a pack')
  stepRemoteRecharge(state, 2); assert.equal(state.blasterCharges, 3)
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

test('older saves gain empty supplies, purchases survive reloads, and active recharge resumes without re-consuming', () => {
  const old = loaded();old.version=1;
  for (const key of Object.keys(freshSupplies())) delete old[key]
  const migrated = parseExpedition(JSON.stringify(old))
  for (const [key, value] of Object.entries(freshSupplies())) assert.equal(migrated[key], value)
  const state = loaded()
  for (const id of ['recharge', 'teleporter']) assert.ok(purchaseSupply(state, id))
  state.shields = 0; activateRemoteRecharge(state); stepRemoteRecharge(state, 0.4)
  const restored = parseExpedition(JSON.stringify(state))
  assert.deepEqual(restored, state)
  assert.equal(restored.rechargePacks, 0); assert.ok(stepRemoteRecharge(restored, 0.6))
  assert.equal(restored.shields, 2); assert.equal(restored.teleporterInstalled, true)
  const invalid = [{ rechargePacks: 4 }, { rechargePacks: -1 }, { rechargePacks: 1.5 }, { rechargePacks: null }, { teleportCharges: 2 }, { teleportCharges: '1' }, { teleportCharges: 1, teleporterInstalled: false }, { teleporterInstalled: 1 }, { remoteRechargeRemaining: -1 }, { remoteRechargeRemaining: 1.1 }, { remoteRechargeRemaining: null }]
  for (const data of invalid) assert.equal(parseExpedition(JSON.stringify({ ...state, ...data })), null)
})

test('old teleporter installations become unlimited and unused charge purchases are refunded once', () => {
  for (const charges of [0, 1]) {
    const old = loaded();;old.version=1; old.teleporterInstalled = true; old.teleportCharges = charges
    const restored = parseExpedition(JSON.stringify(old))
    assert.equal(restored.banked, old.banked + charges * 750)
    assert.equal('teleportCharges' in restored, false)
    assert.equal(restored.teleporterInstalled, true)
    const reloaded = parseExpedition(JSON.stringify(restored))
    assert.deepEqual(reloaded, restored, 'a save can only refund its old charge once')
    assert.ok(teleportToHaven(reloaded, shipAt({ x: 2500, y: 1150 })))
  }
})

test('crashing keeps unused supplies and the teleporter installation but cancels a consumed recharge', () => {
  const state = loaded()
  Object.assign(state, { rechargePacks: 3, teleporterInstalled: true, shields: 0 })
  activateRemoteRecharge(state)
  crashExpedition(state)
  assert.equal(state.rechargePacks, 2); assert.equal(state.teleporterInstalled, true)
  assert.equal(state.remoteRechargeRemaining, 0)
})
