import assert from 'node:assert/strict'
import test from 'node:test'
import { laserImpactMs, stepLaserContact } from '../src/games/hardVacuum/laser.ts'
import { RADIATION_CAPACITY, inRadiation, stepRadiation } from '../src/games/hardVacuum/radiation.ts'
import { bankAtCheckpoint, blastGate, expeditionMap, freshExpedition, freshRuntime, parseExpedition, purchaseUpgrade, releasePort, sectorAt, SOCKETS, stepExpedition } from '../src/games/hardVacuum/expedition.ts'
import { debrisField } from '../src/games/hardVacuum/debrisField.ts'
import { pulverizeAsteroid } from '../src/games/hardVacuum/blaster.ts'
import { isInsideCavern } from '../src/games/hardVacuum/worldGeometry.ts'
import { applyNoseThrust } from '../src/games/hardVacuum/expeditionPhysics.ts'

test('nose thrust brakes along the heading, preserves lateral momentum, and can reverse', () => {
  const ship = { angle: 0, vel: { x: 100, y: 70 } }
  applyNoseThrust(ship, 1)
  assert.equal(ship.vel.x, 25); assert.equal(ship.vel.y, 70)
  applyNoseThrust(ship, 0.5); assert.equal(ship.vel.x, -12.5)
  ship.angle = Math.PI / 2; ship.vel = { x: 50, y: 0 }
  applyNoseThrust(ship, 0.5)
  assert.ok(Math.abs(ship.vel.x - 50) < 1e-7); assert.equal(ship.vel.y, -37.5)
})

test('laser requires 400 ms on the same asteroid and resets on misses, release, or target changes', () => {
  const contact = { elapsedMs: 0 }, a = {}, b = {}
  assert.equal(stepLaserContact(contact, undefined, 2, 400), false)
  assert.equal(stepLaserContact(contact, a, 0.399, 400), false)
  assert.equal(stepLaserContact(contact, a, 0.001, 400), true)
  assert.equal(stepLaserContact(contact, a, 0.2, 400), false)
  assert.equal(stepLaserContact(contact, b, 0.2, 400), false)
  stepLaserContact(contact, undefined, 0, 400)
  assert.equal(stepLaserContact(contact, b, 0.399, 400), false)
  assert.equal(stepLaserContact(contact, b, 0.001, 400), true)
})

test('laser focus advances through five stages of faster impacts on one upgrade track', () => {
  const state = freshExpedition('ring'); state.banked = 21250
  assert.equal(laserImpactMs(state), 400)
  assert.equal(purchaseUpgrade(state, 'focus2'), false); assert.equal(state.banked, 21250)
  for (const ms of [300, 250, 200, 150, 100]) {
    assert.ok(purchaseUpgrade(state, 'focus')); assert.equal(laserImpactMs(state), ms)
  }
  assert.equal(state.banked, 0)
  assert.equal(purchaseUpgrade(state, 'focus'), false)
  for (const ms of [400, 300, 250, 200, 150, 100]) {
    const contact = { elapsedMs: 0 }, rock = {}
    assert.equal(stepLaserContact(contact, rock, (ms - 1) / 1000, ms), false)
    assert.equal(stepLaserContact(contact, rock, 0.001, ms), true)
  }
})

test('radiation drains only its own reserve, does not regenerate away from Haven, and threatens unprotected hulls', () => {
  const state = freshExpedition('ring'); state.upgrades.push('radiation'); state.radiationCharge = 100
  const hot = { x: 2500, y: 1480 }, safe = { x: 1500, y: 1300 }
  assert.ok(inRadiation(hot)); assert.equal(inRadiation(safe), false)
  for (let i = 0; i < 50; i++) assert.equal(stepRadiation(state, hot, 0.1).failed, false)
  assert.equal(state.radiationCharge, 37.5); assert.equal(state.shields, 2)
  stepRadiation(state, safe, 20); assert.equal(state.radiationCharge, 37.5)
  state.radiationCharge = 1.25
  stepRadiation(state, hot, 0.2); assert.ok(Math.abs(state.radiationExposure - 0.1) < 1e-7)
  assert.equal(stepRadiation(state, hot, 1.91).failed, true); assert.equal(state.shields, 2)
  bankAtCheckpoint(state, 'reactor'); assert.equal(state.radiationCharge, 0)
  bankAtCheckpoint(state, 'haven'); assert.equal(state.radiationCharge, RADIATION_CAPACITY); assert.equal(state.radiationExposure, 0)
  const unprotected = freshExpedition('ring')
  assert.equal(stepRadiation(unprotected, hot, 2).failed, true)
})

test('radiation reserve and exposure persist, and legacy upgrades migrate without resetting progress', () => {
  const state = freshExpedition('ring'); state.upgrades = ['radiation']; state.radiationCharge = 0; state.radiationExposure = 0.9
  assert.deepEqual(parseExpedition(JSON.stringify(state)), state)
  const old = { ...state, upgrades: ['cutter', 'thermal', 'drive'], banked: 90 }
  delete old.radiationCharge; delete old.radiationExposure
  const migrated = parseExpedition(JSON.stringify(old))
  assert.deepEqual(migrated.upgrades, ['radiation', 'focus']); assert.equal(migrated.radiationCharge, 100); assert.equal(migrated.banked, 90)
  for (const radiationCharge of [-1, 101, '100']) assert.equal(parseExpedition(JSON.stringify({ ...state, radiationCharge })), null)
})

test('power cells start in other rooms from receivers, and ordinary blue ore cannot power them', () => {
  const state = freshExpedition('ring'), rt = freshRuntime()
  for (const socket of SOCKETS) {
    assert.notEqual(sectorAt(socket.source).id, sectorAt(socket.pos).id)
    assert.ok(isInsideCavern(releasePort(socket.source), 20, expeditionMap(state)))
    const ore = { kind: 'blue', pos: { ...socket.pos }, vel: { x: 0, y: 0 }, radius: 20, rot: [0, 0, 0] }
    const args = { dt: 1, ship: { pos: { x: 1500, y: 1100 }, vel: { x: 0, y: 0 }, radius: 15, angle: 0 }, rocks: [ore], harpoon: { state: 'idle' }, beam: { active: false } }
    stepExpedition(state, rt, args)
    assert.equal(state.gates.includes(socket.id), false)
  }
})

test('the debris field contains many moving asteroids with valid, separated spawn positions', () => {
  const state = freshExpedition('ring'), field = debrisField(state), map = expeditionMap(state)
  assert.ok(field.length >= 35, `expected a dense field, got ${field.length}`)
  assert.ok(field.some(r => r.kind === 'blue'))
  for (const rock of field) {
    assert.ok(Math.hypot(rock.vel.x, rock.vel.y) >= 28)
    assert.ok(isInsideCavern(rock.pos, rock.radius, map))
    assert.ok(Math.hypot(rock.pos.x - state.position.x, rock.pos.y - state.position.y) > 175)
  }
})

test('blasters pulverize every asteroid kind without fragments, but preserve mission cells', () => {
  for (const kind of ['normal', 'red', 'blue']) for (const radius of [10, 40]) {
    const rock = { kind, radius }, rocks = [rock]
    assert.equal(pulverizeAsteroid(rocks, rock), true); assert.deepEqual(rocks, [])
    assert.equal(pulverizeAsteroid(rocks, rock), false)
  }
  const cell = { kind: 'blue', sourceId: 'foundry' }, rocks = [cell]
  assert.equal(pulverizeAsteroid(rocks, cell), false); assert.deepEqual(rocks, [cell])
})

test('removed formations leave navigable space without invisible collision or blast targets', () => {
  const state = freshExpedition('ring'), map = expeditionMap(state)
  for (const [x, y] of [[310,1110],[500,270],[1620,480],[2410,1020],[2255,1780],[1580,1740]]) {
    const pos = { x, y }
    assert.ok(isInsideCavern(pos, 15, map), `${x},${y}`)
    assert.equal(blastGate(state, pos, 20), false)
  }
  assert.deepEqual(state.gates, [])
})

test('retired formation flags migrate without losing saved progress', () => {
  const state = freshExpedition('ring')
  Object.assign(state, { gates: ['rubble', 'blast'], banked: 4321, credits: 87, blasterInstalled: true, blasterCharges: 1, visited: ['haven', 'vault'], surveyed: [921, 922], upgrades: ['focus'], upgradeLevels: { focus: 2 } })
  const legacy = { ...state, gates: [...state.gates, ...Array.from({ length: 6 }, (_, i) => `crag-${i}`)] }
  assert.deepEqual(parseExpedition(JSON.stringify(legacy)), state)
  assert.equal(parseExpedition(JSON.stringify({ ...state, gates: ['crag-6'] })), null)
})
