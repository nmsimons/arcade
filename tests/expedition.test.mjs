import assert from 'node:assert/strict'
import test from 'node:test'
import { IGNITION_CRADLE } from '../src/games/hardVacuum/campaignWorld.ts'
import {
  bankAtCheckpoint, blastGate, CACHES, checkpointPosition, CORE_POSITION, crashExpedition,
  expeditionMap, freshExpedition, freshRuntime, GATES, interaction, maxShields, objective,
  objectBody, openGate, powerReceiver, parseExpedition, PICKUPS, purchaseUpgrade, SECTORS, SOCKETS, stepExpedition,
} from '../src/games/hardVacuum/expedition.ts'
import { isInsideCavern, raycastCavern, resolveCircleInCavern } from '../src/games/hardVacuum/worldGeometry.ts'

const shipAt = (pos) => ({ pos: { ...pos }, vel: { x: 0, y: 0 }, angle: 0, radius: 15 })
const idleBeam = { active: false, start: { x: 0, y: 0 }, direction: { x: 1, y: 0 }, length: 0, energy01: 1 }
const step = (s, rt, options = {}) => stepExpedition(s, rt, { dt: 0.1, ship: shipAt({ x: 1500, y: 1100 }), rocks: [], harpoon: { state: 'idle' }, beam: idleBeam, ...options })

// Flood the actual circle-collision geometry, not an independent room graph.
const reachable = (s, origin = { x: 1500, y: 1100 }) => {
  const map = expeditionMap(s)
  const size = 25
  const queue = [[Math.round(origin.x / size), Math.round(origin.y / size)]]
  const seen = new Set([queue[0].join(',')])
  for (let i = 0; i < queue.length; i++) {
    const [x, y] = queue[i]
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const key = `${x + dx},${y + dy}`
      if (seen.has(key)) continue
      const p = { x: (x + dx) * size, y: (y + dy) * size }
      if (!isInsideCavern(p, 18, map)) continue
      const start = { x: x * size, y: y * size }
      if (raycastCavern(start, { x: dx, y: dy }, size, map) < size) continue
      seen.add(key); queue.push([x + dx, y + dy])
    }
  }
  // A narrow berth can sit between grid samples. Connect the target to a
  // reached sample only when the entire final circle sweep is clear.
  return point => {
    for (const x of [Math.floor(point.x / size), Math.ceil(point.x / size)]) {
      for (const y of [Math.floor(point.y / size), Math.ceil(point.y / size)]) {
        if (!seen.has(`${x},${y}`)) continue
        if (Array.from({ length: 11 }, (_, i) => i / 10).every(t => isInsideCavern({ x: x * size + (point.x - x * size) * t, y: y * size + (point.y - y * size) * t }, 18, map))) return true
      }
    }
    return false
  }
}

test('the expedition physically gates its critical path and reconnects through shortcuts', () => {
  const s = freshExpedition('ring')
  let canReach = reachable(s)
  assert.equal(canReach(SOCKETS[0].pos), false)
  assert.equal(canReach(SOCKETS[2].source), false)
  openGate(s, 'rubble')
  canReach = reachable(s)
  assert.equal(canReach(SOCKETS[0].pos), true)
  assert.equal(canReach(SOCKETS[2].source), false)
  openGate(s, 'foundry')
  canReach = reachable(s)
  assert.equal(canReach(SOCKETS[2].source), true)
  assert.equal(canReach({x:1650,y:350}), false)
  openGate(s, 'archive')
  canReach = reachable(s)
  assert.equal(canReach({x:1650,y:350}), true)
  assert.equal(canReach({ x: 2670, y: 1740 }), false)
  openGate(s, 'shortcut'); openGate(s, 'reactor')
  canReach = reachable(s)
  assert.equal(canReach({ x: 2670, y: 1740 }), true)
  assert.equal(canReach(CACHES[2].pos), false)
  openGate(s, 'blast'); openGate(s, 'drive')
  canReach = reachable(s)
  for (const target of CACHES.filter(c => ['salvage','archive','vault','engine'].includes(c.sector))) assert.equal(canReach(target.pos), true, target.id)
  for (const room of SECTORS.filter(r => r.dock)) assert.equal(canReach(room.dock), true, room.id)
})

test('every closed gate blocks the ship and the gun', () => {
  const s = freshExpedition('ring')
  const map = expeditionMap(s)
  for (const g of GATES) {
    const vertical = g.h > g.w
    const p = { x: g.x + (vertical ? -5 : g.w / 2), y: g.y + (vertical ? g.h / 2 : -5) }
    const v = { x: vertical ? 100 : 0, y: vertical ? 0 : 100 }
    const result = resolveCircleInCavern(p, v, 15, 0.5, map)
    assert.equal(result.collided, true, g.id)
    assert.equal(isInsideCavern(p, 14.99, map), true, g.id)
    assert.ok(raycastCavern(p, v, 500, map) >= 0)
  }
})

test('lasers cannot open doors; a blaster clears rubble and cells power the relay', () => {
  const s = freshExpedition('ring'), rt = freshRuntime()
  const fireAt = (x, y, direction, ticks = 12) => {
    for (let i = 0; i < ticks; i++) {
      const start = { x, y }
      const beam = { ...idleBeam, active: true, start, direction, length: raycastCavern(start, direction, 520, expeditionMap(s)) }
      step(s, rt, { ship: shipAt(start), beam })
    }
  }
  fireAt(1120, 1100, { x: -1, y: 0 })
  assert.equal(s.gates.includes('rubble'), false)
  assert.ok(blastGate(s, { x: 1020, y: 1100 }, 95)); assert.ok(s.gates.includes('rubble'))
  fireAt(850, 400, { x: 1, y: 0 })
  assert.equal(s.gates.includes('archive'), false)
  assert.equal(interaction(s, shipAt({ x: 900, y: 400 })), null)
  fireAt(850, 400, { x: 1, y: 0 })
  assert.equal(s.gates.includes('archive'), false)
  assert.ok(powerReceiver(s, 'relay', 'relay'))
  assert.ok(s.gates.includes('archive')); assert.ok(s.gates.includes('reactor'))
})

test('receivers accept blue cells delivered without a tether, connect once, and release the core', () => {
  const s = freshExpedition('ring'), rt = freshRuntime()
  for (const socket of SOCKETS) {
    const rock = { kind: 'blue', sourceId: socket.id, pos: { ...socket.pos }, vel: { x: 0, y: 0 }, rot: [0.4, 1, 0.2], radius: 20 }
    const rocks = [rock]
    step(s, rt, { rocks })
    assert.equal(s.gates.includes(socket.id), false, 'contacts need to seat before power is restored')
    for (let tick = 0; tick < 10; tick++) step(s, rt, { rocks })
    assert.ok(s.power[socket.id]); assert.equal(rocks.length, 0)
  }
  assert.equal(s.credits, 0)
  const coreShip = shipAt(CORE_POSITION)
  for (let tick = 0; tick < 10; tick++) step(s, rt, { ship: coreShip })
  assert.equal(s.core, false, 'touching the core must not collect it')
  const core = objectBody(rt, 'core', CORE_POSITION)
  core.pos = { x: 1368, y: 1100 }; core.vel = { x: 0, y: 0 }
  for (let tick = 0; tick < 30; tick++) step(s, rt, { harpoon: { state: 'attached', rock: core } })
  assert.equal(s.core, false, 'Haven cannot install the ignition core')
  core.pos = { ...IGNITION_CRADLE }; core.vel = { x: 0, y: 0 }
  for (let tick = 0; tick < 35; tick++) step(s, rt, { ship: shipAt({ x: IGNITION_CRADLE.x, y: IGNITION_CRADLE.y + 100 }) })
  assert.equal(s.core, true)
  assert.equal(s.complete, true)
  assert.equal(objective(s).title, 'The route is clear')
  assert.equal(interaction(s, shipAt({ x: 1500, y: 1100 })).kind, 'dock')
})

test('radiation passages are physically open, while blast doors need a blaster impact', () => {
  const s = freshExpedition('ring'), rt = freshRuntime()
  const ship = shipAt({ x: 2500, y: 1430 })
  step(s, rt, { ship }); assert.equal(s.gates.includes('thermal'), false)
  assert.ok(isInsideCavern({ x: 2500, y: 1505 }, 15, expeditionMap(s)))
  ship.pos = { x: 2090, y: 1800 }
  step(s, rt, { ship }); assert.equal(s.gates.includes('drive'), false)
  assert.equal(blastGate(s, { x: 2090, y: 1800 }), false)
  assert.equal(s.gates.includes('drive'),false,'the engine return needs containment power')
  assert.equal(blastGate(s, { x: 1660, y: 1290 }), false)
  assert.equal(blastGate(s, { x: 1510, y: 1430 }), true)
  assert.equal(blastGate(s, { x: 1510, y: 1430 }), false)
})

test('only Haven banks credits, purchases spend the bank, and crashes return to Haven', () => {
  const s = freshExpedition('ring')
  s.credits = 900
  assert.equal(purchaseUpgrade(s, 'hull'), false, 'carried credits must first be banked')
  assert.equal(bankAtCheckpoint(s, 'salvage'), 0, 'a room without a checkpoint cannot bank')
  assert.equal(bankAtCheckpoint(s, 'foundry'), 0)
  assert.equal(bankAtCheckpoint(s, 'reactor'), 0)
  assert.equal(bankAtCheckpoint(s, 'haven'), 900)
  assert.equal(s.credits, 0); assert.equal(s.banked, 900)
  assert.ok(purchaseUpgrade(s, 'hull')); assert.equal(s.banked, 150)
  assert.equal(purchaseUpgrade(s, 'hull'), false)
  assert.equal(maxShields(s), 3)
  s.credits = 80; s.gates.push('foundry'); s.upgrades.push('radiation')
  s.checkpoint = 'foundry'
  assert.equal(crashExpedition(s), 80)
  assert.equal(s.credits, 0); assert.equal(s.banked, 150)
  assert.ok(s.upgrades.includes('radiation')); assert.ok(s.gates.includes('foundry'))
  assert.equal(s.checkpoint, 'haven')
  assert.deepEqual(s.position, checkpointPosition()); assert.equal(s.shields, 3)
})

test('saves round-trip exploration and position without granting a free return trip', () => {
  const s = freshExpedition('ring')
  s.position = { x: 700, y: 1100 }; s.shields = 0; s.credits = 89; s.gates.push('rubble')
  assert.deepEqual(parseExpedition(JSON.stringify(s)), s)
  for (const checkpoint of ['foundry', 'reactor']) {
    const migrated = parseExpedition(JSON.stringify({ ...s, checkpoint }))
    assert.equal(migrated.checkpoint, 'haven'); assert.equal(migrated.credits, s.credits)
    assert.deepEqual(migrated.position, s.position); assert.deepEqual(migrated.gates, s.gates)
  }
  for (const bad of [null, 'broken json', '{}', JSON.stringify({ ...s, upgrades: ['cheat'] }), JSON.stringify({ ...s, checkpoint: 'missing' }), JSON.stringify({ ...s, banked: -1 })]) assert.equal(parseExpedition(bad), null)
})

test('discoveries reward once, salvage must return to Haven, and doors have no key controls', () => {
  const s = freshExpedition('ring'), rt = freshRuntime()
  const ship = shipAt(CACHES[0].pos)
  const cache = objectBody(rt, CACHES[0].id, CACHES[0].pos)
  for (let tick = 0; tick < 12; tick++) step(s, rt, { ship, harpoon: { state: 'attached', rock: cache } })
  assert.equal(s.credits, 0); assert.equal(s.caches.length, 0)
  cache.pos = { x: 1368, y: 1100 }; cache.vel = { x: 0, y: 0 }
  for (let tick = 0; tick < 30; tick++) step(s, rt, { harpoon: { state: 'attached', rock: cache } })
  assert.equal(s.credits, 0); assert.equal(s.banked, 100); assert.equal(s.caches.length, 1)
  assert.equal(s.visited.filter(id => id === 'salvage').length, 1)
  assert.equal(interaction(s, shipAt({ x: 1500, y: 750 })), null)
  assert.equal(interaction(s, shipAt({ x: 1500, y: 640 })), null)
})
