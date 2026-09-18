import assert from 'node:assert/strict'
import test from 'node:test'
import { BLASTER_BLAST_RADIUS, BLASTER_CAPACITY, BLASTER_COST, fireBlaster, stepBlaster } from '../src/games/hardVacuum/blaster.ts'
import { bankAtCheckpoint, blastGate, crashExpedition, expeditionMap, freshExpedition, freshRuntime, GATES, objective, parseExpedition, purchaseUpgrade, sectorAt, stepExpedition } from '../src/games/hardVacuum/expedition.ts'
import { isInsideCavern } from '../src/games/hardVacuum/worldGeometry.ts'
import { activateRemoteRecharge, needsRecharge, restoreShipSystems, stepRemoteRecharge } from '../src/games/hardVacuum/supplies.ts'
import { debrisField } from '../src/games/hardVacuum/debrisField.ts'
import { creditAsteroidDestruction } from '../src/games/hardVacuum/oreCredits.ts'

const shipAt = (x = 1500, y = 1300, angle = Math.PI / 2) => ({ pos: { x, y }, vel: { x: 0, y: 0 }, angle, radius: 15 })
const rectangle = (x, y, w, h) => [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }]
const map = { boundary: rectangle(-100, -100, 1000, 1000), obstacles: [] }
const equipped = () => {
  const state = freshExpedition('ring'); state.banked = BLASTER_COST
  assert.ok(purchaseUpgrade(state, 'blaster'))
  return state
}

test('the blaster is a permanent ship upgrade using banked credits, supplied with three shots', () => {
  const state = freshExpedition('ring')
  assert.equal(state.blasterInstalled, false); assert.equal(state.blasterCharges, 0)
  assert.equal(fireBlaster(state, freshRuntime(), shipAt()), null)
  state.banked = BLASTER_COST - 1; state.credits = 10000
  const before = structuredClone(state)
  assert.equal(purchaseUpgrade(state, 'blaster'), false); assert.deepEqual(state, before)
  state.banked++
  assert.ok(purchaseUpgrade(state, 'blaster'))
  assert.equal(state.banked, 0); assert.equal(state.credits, 10000)
  assert.equal(state.blasterInstalled, true); assert.equal(state.blasterCharges, BLASTER_CAPACITY)
  state.banked = BLASTER_COST; state.blasterCharges = 1
  const installed = structuredClone(state)
  assert.equal(purchaseUpgrade(state, 'blaster'), false); assert.deepEqual(state, installed)
  assert.deepEqual(parseExpedition(JSON.stringify(state)), state)
})

test('Haven, remote recharge and respawn cannot grant an unpurchased blaster', () => {
  const state = freshExpedition('ring'), runtime = freshRuntime(), ship = shipAt()
  assert.equal(needsRecharge(state), false, 'an empty weapon slot does not need recharging')
  state.rechargePacks = 1
  assert.equal(activateRemoteRecharge(state), false); assert.equal(state.rechargePacks, 1)
  state.blasterCharges = 3
  assert.equal(fireBlaster(state, runtime, ship), null, 'ammo cannot bypass ownership')
  assert.equal(runtime.blasterCooldown, 0); assert.deepEqual(ship.vel, { x: 0, y: 0 })
  restoreShipSystems(state)
  assert.equal(state.blasterCharges, 0)
  state.shields = 0; assert.ok(activateRemoteRecharge(state)); stepRemoteRecharge(state, 1)
  assert.equal(state.shields, 2); assert.equal(state.blasterCharges, 0)
  bankAtCheckpoint(state, 'haven'); assert.equal(state.blasterCharges, 0)
  crashExpedition(state); assert.equal(state.blasterCharges, 0); assert.equal(state.blasterInstalled, false)
})

test('processing Haven starter asteroids can fund the first blaster without leaving the room', () => {
  const state = freshExpedition('ring')
  const rocks = debrisField(state).filter(rock => sectorAt(rock.pos)?.id === 'haven')
  for (const rock of rocks) creditAsteroidDestruction(state, { ...rock, pos: { x: 1500, y: 1100 } })
  assert.ok(state.banked >= BLASTER_COST)
  assert.ok(purchaseUpgrade(state, 'blaster'))
})

test('the red blaster fires three discrete shots, with recoil and no charge spent during cooldown', () => {
  const state = equipped(), runtime = freshRuntime(), ship = shipAt()
  for (let i = 0; i < BLASTER_CAPACITY; i++) {
    runtime.blasterCooldown = 0
    const shot = fireBlaster(state, runtime, ship)
    assert.ok(shot); assert.ok(shot.vel.y > 500); assert.ok(ship.vel.y < 0)
    assert.equal(state.blasterCharges, 2 - i)
    assert.equal(fireBlaster(state, runtime, ship), null)
    assert.equal(state.blasterCharges, 2 - i)
  }
  runtime.blasterCooldown = 0
  assert.equal(fireBlaster(state, runtime, ship), null)
  for (let i = 0; i < 200; i++) stepExpedition(state, runtime, { dt: 0.1, ship, rocks: [], harpoon: { state: 'idle' }, beam: { active: false, start: ship.pos, direction: { x: 0, y: 1 }, length: 0 } })
  assert.equal(state.blasterCharges, 0, 'charges do not regenerate away from Haven')
})

test('Haven restores the magazine; other locations and shop purchases cannot reload it', () => {
  const state = equipped(); state.blasterCharges = 0; state.banked = 2000
  bankAtCheckpoint(state, 'foundry'); assert.equal(state.blasterCharges, 0)
  bankAtCheckpoint(state, 'reactor'); assert.equal(state.blasterCharges, 0)
  assert.ok(purchaseUpgrade(state, 'hull')); assert.equal(state.blasterCharges, 0)
  bankAtCheckpoint(state, 'haven'); assert.equal(state.blasterCharges, 3)
  state.blasterCharges = 0; crashExpedition(state)
  assert.equal(state.blasterCharges, 3); assert.equal(state.blasterInstalled, true); assert.deepEqual(state.position, { x: 1500, y: 1100 })
})

test('spent charges survive saving; older saves require purchase without losing other progress', () => {
  const state = equipped(); state.blasterCharges = 0; state.gates = ['blast', 'drive']; state.banked = 180
  assert.equal(parseExpedition(JSON.stringify(state)).blasterCharges, 0)
  const legacy = { ...state, blasterCharges: 3 }; delete legacy.blasterInstalled
  legacy.cargo = { ore: { pos: { x: 1660, y: 1300 }, vel: { x: 0, y: 0 } } }
  const migrated = parseExpedition(JSON.stringify(legacy))
  assert.equal(migrated.blasterCharges, 0); assert.equal(migrated.blasterInstalled, false); assert.equal(migrated.banked, 180)
  assert.deepEqual(migrated.gates, ['blast', 'drive']); assert.equal(migrated.cargo.ore, undefined)
  for (const blasterCharges of [-1, 4, 1.5, '3']) assert.equal(parseExpedition(JSON.stringify({ ...state, blasterCharges })), null)
  for (const blasterInstalled of [null, 1, 'true']) assert.equal(parseExpedition(JSON.stringify({ ...state, blasterInstalled })), null)
  delete legacy.blasterCharges
  assert.equal(parseExpedition(JSON.stringify(legacy)).blasterCharges, 0)
})

test('a purchased blaster breaches either blast door with a single swept hit', () => {
  const blastDoors = GATES.filter(gate => gate.kind === 'blast')
  assert.deepEqual(blastDoors.map(gate => gate.id), ['blast', 'drive', 'baggage-door', 'tool-door', 'store-door', 'field-door'])
  for (const gate of blastDoors) {
    const state = equipped(), runtime = freshRuntime()
    const ship = gate.h > gate.w ? shipAt(gate.x + gate.w + 160, gate.y + gate.h / 2, Math.PI) : shipAt(gate.x + gate.w / 2, gate.y - 160)
    const shot = fireBlaster(state, runtime, ship)
    const result = stepBlaster([shot], 0.5, expeditionMap(state), [])
    assert.equal(result.shots.length, 0); assert.equal(result.impacts.length, 1)
    assert.equal(blastGate(state, result.impacts[0].pos, BLASTER_BLAST_RADIUS), true, gate.id)
    assert.deepEqual(state.gates, [gate.id]); assert.equal(state.blasterCharges, 2)
  }
})

test('blaster splash opens physical barriers and leaves unpowered doors closed', () => {
  for (const gate of GATES.filter(gate => gate.kind === 'blast')) {
    const state = freshExpedition('ring')
    const point = gate.h > gate.w ? { x: gate.x + gate.w + 70, y: gate.y + gate.h / 2 } : { x: gate.x + gate.w / 2, y: gate.y - 70 }
    assert.equal(blastGate(state, point), true)
    assert.deepEqual(state.gates, [gate.id]); assert.equal(state.blasterCharges, 0)
    assert.equal(blastGate(state, point), false)
  }
  for (const gate of GATES.filter(gate => gate.kind !== 'blast' && gate.kind !== 'rubble')) {
    const state = freshExpedition('ring')
    blastGate(state, { x: gate.x + gate.w / 2, y: gate.y + gate.h / 2 })
    assert.equal(state.gates.includes(gate.id), false, gate.id)
  }
})

test('bolts report the first body or wall and impact direction without tunneling or moving bodies', () => {
  const wallMap = { ...map, obstacles: [rectangle(100, -90, 2, 180)] }
  const shot = () => ({ pos: { x: 0, y: 0 }, vel: { x: 680, y: 0 }, life: 1.25 })
  const hidden = { pos: { x: 180, y: 0 }, vel: { x: 0, y: 0 }, radius: 20 }
  let result = stepBlaster([shot()], 0.5, wallMap, [hidden])
  assert.equal(result.impacts[0].pos.x, 100); assert.equal(result.impacts[0].target, undefined)
  const cargo = { pos: { x: 70, y: 0 }, vel: { x: 0, y: 0 }, radius: 20, kind: 'blue', sourceId: 'foundry' }
  const before = structuredClone(cargo)
  result = stepBlaster([shot()], 0.5, wallMap, [hidden, cargo])
  assert.equal(result.impacts[0].target, cargo); assert.equal(result.impacts[0].pos.x, 45)
  assert.deepEqual(result.impacts[0].direction, { x: 1, y: 0 })
  assert.deepEqual(cargo, before)
})

test('bolts travel through open space and expire rather than exploding at maximum range', () => {
  const shot = { pos: { x: 0, y: 0 }, vel: { x: 680, y: 0 }, life: 0.1 }
  const result = stepBlaster([shot], 0.5, map, [])
  assert.equal(shot.pos.x, 68); assert.deepEqual(result, { shots: [], impacts: [] })
})

test('the former hopper location is open space with no invisible machinery', () => {
  assert.ok(isInsideCavern({ x: 1660, y: 1290 }, 28, expeditionMap(freshExpedition('ring'))))
})

test('objectives follow restored circuits through the refuge to the final core', () => {
  const state = freshExpedition('ring')
  for (const id of ['breach-power','freight-power','dispatch-power','works-power','ring-power','foundry','relay']) state.power[id] = id
  assert.equal(objective(state).title, 'Restore refuge access')
  state.power.heart = 'heart'; state.gates.push('heart','refuge-link')
  assert.equal(objective(state).title, 'Restore medical transfer')
  state.gates.push('ignition-ready')
  assert.equal(objective(state).title, 'Bring the ignition core home')
  assert.equal(objective(state, true).title, 'Tow the core home')
})
