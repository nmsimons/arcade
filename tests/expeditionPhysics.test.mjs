import assert from 'node:assert/strict'
import test from 'node:test'
import { IGNITION_CRADLE } from '../src/games/hardVacuum/campaignWorld.ts'
import { collideBodies } from '../src/games/hardVacuum/bodyCollisions.ts'
import { betweenReceiverPlates } from '../src/games/hardVacuum/receivers.ts'
import { dockingReadiness, driftCargo } from '../src/games/hardVacuum/expeditionPhysics.ts'
import { BASE_POSITION, CACHES, cargoBodies, expeditionMap, freshExpedition, freshRuntime, interaction, objectBody, parseExpedition, powerCellSpawns, SECTORS, snapshotCargo, SOCKETS, stepExpedition } from '../src/games/hardVacuum/expedition.ts'
import { updateHarpoon } from '../src/games/hardVacuum/harpoon.ts'
import { isInsideCavern, raycastCavern, resolveCircleInCavern } from '../src/games/hardVacuum/worldGeometry.ts'

const shipAt = pos => ({ pos: { ...pos }, vel: { x: 0, y: 0 }, angle: -Math.PI / 2, radius: 15 })
const step = (state, rt, ship, rocks = [], harpoon = { state: 'idle' }) => stepExpedition(state, rt, { dt: 1 / 60, ship, rocks, harpoon, beam: { active: false, start: ship.pos, direction: { x: 1, y: 0 }, length: 0 } })

test('ship and cargo exchange momentum without collecting the cargo', () => {
  const ship = shipAt({ x: 0, y: 0 }); ship.vel.x = 100
  const body = { pos: { x: 30, y: 0 }, vel: { x: 0, y: 0 }, radius: 22 }
  assert.equal(collideBodies(ship, body).speed, 100)
  assert.ok(body.vel.x > 0)
  assert.ok(ship.vel.x < 100)
  assert.ok(Math.hypot(body.pos.x - ship.pos.x, body.pos.y - ship.pos.y) >= 37 - 1e-8)
})

test('neither contact nor grappling collects salvage away from Haven', () => {
  const state = freshExpedition('ring'), rt = freshRuntime(), cache = CACHES[0]
  const body = objectBody(rt, cache.id, cache.pos)
  body.vel = { x: 0, y: 0 }
  const ship = shipAt({ x: cache.pos.x - 34, y: cache.pos.y }); ship.vel.x = 180
  step(state, rt, ship)
  assert.equal(state.credits, 0); assert.equal(body.capture, 0)
  assert.ok(body.vel.x > 0); assert.ok(rt.impactSpeed > 100)
  ship.vel = { x: 0, y: 0 }; body.vel = { x: 0, y: 0 }
  ship.pos = { x: body.pos.x - 38, y: body.pos.y }
  step(state, rt, ship)
  assert.equal(body.capture, 0); assert.equal(state.credits, 0)
  for (let i = 0; i < 90; i++) step(state, rt, ship)
  assert.equal(state.credits, 0)
  const hook = { state: 'attached', rock: body }
  for (let i = 0; i < 90; i++) step(state, rt, ship, [], hook)
  assert.equal(state.credits, 0); assert.deepEqual(state.caches, [])
  body.pos = { x: BASE_POSITION.x - 132, y: BASE_POSITION.y }; body.vel = { x: 0, y: 0 }
  // Releasing a delivered object does not prevent the base from recovering it.
  for (let i = 0; i < 180; i++) step(state, rt, shipAt(BASE_POSITION))
  assert.equal(state.banked, cache.value); assert.equal(state.credits, 0); assert.deepEqual(state.caches, [cache.id])
})

test('loose objects drift in simulation and remain inside the physical cavern', () => {
  const state = freshExpedition('ring'), rt = freshRuntime(), cache = CACHES[0]
  const body = objectBody(rt, cache.id, cache.pos), before = { ...body.pos }
  for (let i = 0; i < 180; i++) step(state, rt, shipAt({ x: 1500, y: 1100 }))
  assert.ok(Math.hypot(body.pos.x - before.x, body.pos.y - before.y) > 0.2)
  body.pos = { x: 219, y: 1260 }; body.vel.x = -150
  for (let i = 0; i < 20; i++) step(state, rt, shipAt({ x: 1500, y: 1100 }))
  assert.ok(isInsideCavern(body.pos, 21.99, expeditionMap(state)))
})

test('Haven is the only docking, banking and recharge location', () => {
  const dock = BASE_POSITION
  const ship = shipAt({ x: dock.x, y: dock.y + 20 })
  assert.equal(dockingReadiness(ship, dock), 'ready')
  ship.vel.y = -100; assert.equal(dockingReadiness(ship, dock), 'speed')
  ship.vel.y = 0; ship.angle = 0; assert.equal(dockingReadiness(ship, dock), 'ready')
  ship.pos.x += 70; assert.equal(dockingReadiness(ship, dock), 'position')
  ship.pos = { x: 1500, y: 1100 }; ship.angle = 0
  assert.equal(dockingReadiness(ship, ship.pos), 'ready')
  ship.vel.x = 100; assert.equal(dockingReadiness(ship, ship.pos), 'speed')
  assert.deepEqual(SECTORS.filter(room => room.dock).map(room => room.id), [])
  for (const pos of [{ x: 660, y: 460 }, { x: 2680, y: 950 }]) assert.equal(interaction(freshExpedition('ring'), shipAt(pos)), null)
  for (const socket of SOCKETS) assert.equal(interaction(freshExpedition('ring'), shipAt(socket.source)), null, 'E must not recall cargo')
})

test('power-cell origins are empty space while receivers retain their physical contacts', () => {
  const state = freshExpedition('ring'); state.gates.push('rubble', 'foundry', 'archive', 'reactor', 'thermal')
  const map = expeditionMap(state)
  for (const socket of SOCKETS) {
    assert.ok(isInsideCavern(socket.source, 20, map))
    const pos = { x: socket.source.x - 29, y: socket.source.y }, vel = { x: 100, y: 0 }
    assert.equal(resolveCircleInCavern(pos, vel, 15, 0.4, map).collided, false, 'no invisible dispenser remains')
    assert.equal(vel.x, 100)
    assert.equal(raycastCavern({ x: socket.source.x - 80, y: socket.source.y }, { x: 1, y: 0 }, 140, map), 140)
    assert.ok(isInsideCavern(socket.pos, 20, map), 'the blue cell fits between socket arms')
    const contact = { x: socket.pos.x - 84, y: socket.pos.y }, approach = { x: 100, y: 0 }
    assert.ok(resolveCircleInCavern(contact, approach, 15, 0.4, map).collided)
    assert.ok(approach.x < 0)
  }
  for (const pos of [{ x: 703, y: 460 }, { x: 2723, y: 950 }]) assert.ok(isInsideCavern(pos, 15, map), 'former checkpoint arms are removed')
})

test('every fresh power cell, module, salvage crate and core starts drifting in clear space', () => {
  const state = freshExpedition(), map = expeditionMap(state)
  const bodies = [...powerCellSpawns(state).map(cell => ({ ...cell, radius:20 })), ...cargoBodies(state, freshRuntime())]
  assert.equal(powerCellSpawns(state).length, SOCKETS.length)
  for (const body of bodies) {
    const before = { ...body.pos }
    assert.ok(isInsideCavern(body.pos, body.radius, map), body.sourceId ?? body.cargoId)
    assert.ok(Math.hypot(body.vel.x, body.vel.y) > 0.1)
    for (let i=0;i<120;i++) {
      driftCargo(body, 1/60)
      resolveCircleInCavern(body.pos, body.vel, body.radius, .5, map)
    }
    assert.ok(Math.hypot(body.pos.x-before.x, body.pos.y-before.y) > .2, 'drifts before the grapple touches it')
    assert.ok(isInsideCavern(body.pos, body.radius-.01, map))
  }
})

test('cell saves preserve moved cargo and used cells, while untouched legacy cells gain initial drift', () => {
  const state = freshExpedition(), socket = SOCKETS.find(s=>s.id==='breach-power')
  const position = { x:socket.source.x, y:socket.source.y+48 }
  state.cargo = { [socket.id]:{pos:position,vel:{x:0,y:0},tethered:false} }
  const restored = powerCellSpawns(parseExpedition(JSON.stringify(state))).find(cell=>cell.sourceId===socket.id)
  assert.deepEqual(restored.pos, position)
  assert.ok(Math.hypot(restored.vel.x, restored.vel.y) > .1)
  state.cargo[socket.id].tethered = true
  const moved = powerCellSpawns(state).find(cell=>cell.sourceId===socket.id)
  assert.deepEqual(moved.pos, position);assert.deepEqual(moved.vel, {x:0,y:0})
  state.cargo[socket.id].vel = {x:-32,y:7}
  assert.deepEqual(powerCellSpawns(state).find(cell=>cell.sourceId===socket.id).vel, {x:-32,y:7})
  state.power['freight-power'] = socket.id
  assert.ok(!powerCellSpawns(state).some(cell=>cell.sourceId===socket.id), 'installed cells never respawn')
})

test('the actual grapple holds a fixed cable and never reels modules into the ship', () => {
  const state = freshExpedition('ring'), rt = freshRuntime()
  const body = cargoBodies(state, rt).find(body => body.cargoId === 'radiation')
  body.vel = { x: 0, y: 0 }
  const ship = shipAt({ x: body.pos.x - 85, y: body.pos.y })
  const rope = (ax, ay, bx, by, len) => ({ rope: [{ x: (ax + bx) / 2, y: (ay + by) / 2 }], ropePrev: [{ x: (ax + bx) / 2, y: (ay + by) / 2 }], segLen: len / 2 })
  const hook = { current: { state: 'flying', pos: { ...ship.pos }, vel: { x: 720, y: 0 }, life: 1200, traveled: 0, maxLength: 130, ropeLength: 130, ...rope(ship.pos.x, ship.pos.y, body.pos.x, body.pos.y, 130) } }
  const initialX = body.pos.x
  for (let frame = 0; frame < 150 && !state.upgrades.includes('radiation'); frame++) {
    updateHarpoon({ dt: 1 / 60, w: 3000, h: 2200, ship, shipRef: { current: ship }, rocks: [body], harpoonRef: hook, wrapX: x => x, wrapY: y => y, toroidalDelta: (ax, ay, bx, by) => ({ dx: bx - ax, dy: by - ay }), buildRopeBetween: rope, HARPOON_HOOK_MASS: 0.2, HARPOON_VISUAL_SLACK: 1.18, HARPOON_REEL_MIN_LEN: 22 })
    step(state, rt, ship, [], hook.current)
  }
  assert.ok(Math.abs(body.pos.x - initialX) < 1, 'a slack tether must not winch the module toward the ship')
  assert.equal(hook.current.ropeLength, 130)
  assert.equal(state.upgrades.includes('radiation'), false)
  body.pos = { x: BASE_POSITION.x - 132, y: BASE_POSITION.y }; body.vel = { x: 0, y: 0 }; ship.pos = { ...BASE_POSITION }
  for (let i = 0; i < 180; i++) step(state, rt, ship, [], hook.current)
  assert.ok(state.upgrades.includes('radiation')); assert.equal(state.radiationCharge, 100)
})

test('the core stays on the cable until delivered to the Ignition Cradle, and Haven cannot collect it', () => {
  const state = freshExpedition('ring'), rt = freshRuntime(); state.gates.push('ignition-ready')
  const core = cargoBodies(state, rt).find(body => body.cargoId === 'core')
  const ship = shipAt({ x: core.pos.x - 80, y: core.pos.y })
  const hook = { state: 'attached', rock: core }
  for (let i = 0; i < 60; i++) step(state, rt, ship, [], hook)
  assert.equal(state.core, false); assert.equal(rt.towing, 'core')
  core.pos = { x: BASE_POSITION.x - 125, y: BASE_POSITION.y }; core.vel = { x: 0, y: 0 }; ship.pos = { ...BASE_POSITION }
  for (let i = 0; i < 30; i++) step(state, rt, ship)
  assert.equal(state.core, false)
  for (let i = 0; i < 150; i++) step(state, rt, ship, [], hook)
  assert.equal(state.core, false)
  core.pos = { ...IGNITION_CRADLE }; core.vel = { x: 0, y: 0 }; ship.pos = { x: IGNITION_CRADLE.x, y: IGNITION_CRADLE.y + 100 }
  for (let i = 0; i < 190; i++) step(state, rt, ship)
  assert.equal(state.core, true)
  assert.equal(state.complete, true)
})

test('cargo positions and delivery history survive saves without remote recall', () => {
  const state = freshExpedition('ring'), rt = freshRuntime(); state.gates.push('rubble')
  const core = cargoBodies(state, rt).find(body => body.cargoId === 'core')
  core.pos = { x: 1420, y: 1300 }; core.vel = { x: -12, y: 4 }
  const cell = { sourceId: 'foundry', pos: { x: 530, y: 1100 }, vel: { x: 1, y: 2 }, tethered: true }
  snapshotCargo(state, rt, [cell])
  const saved = parseExpedition(JSON.stringify(state))
  assert.deepEqual(saved.cargo.foundry, { pos: cell.pos, vel: cell.vel, tethered: true })
  const restored = cargoBodies(saved, freshRuntime()).find(body => body.cargoId === 'core')
  assert.deepEqual(restored.pos, core.pos); assert.deepEqual(restored.vel, core.vel)
  assert.equal(parseExpedition(JSON.stringify({ ...state, cargo: { core: { pos: null, vel: { x: 0, y: 0 } } } })), null)
})

test('receivers seat moving cells once they are inside the plates', () => {
  const state = freshExpedition('ring'), rt = freshRuntime(), socket = SOCKETS[0]
  const rock = { kind: 'blue', sourceId: socket.id, radius: 20, pos: { x: socket.pos.x + 38, y: socket.pos.y - 18 }, vel: { x: 150, y: -260 }, rot: [1, 1, 1], tethered: true }
  const ship = shipAt({ x: socket.pos.x, y: socket.pos.y + 90 }), rocks = [rock]
  step(state, rt, ship, rocks)
  assert.equal(rock.socketId, socket.id); assert.equal(state.gates.includes(socket.id), false)
  assert.ok(rock.pos.y > socket.pos.y - 18); assert.ok(rock.rot[0] < 1)
  for (let i = 0; i < 90; i++) step(state, rt, ship, rocks)
  assert.ok(state.gates.includes(socket.id)); assert.equal(rocks.length, 0); assert.equal(state.credits, 0)
})

test('receiver activation requires a cell inside the plate aperture, not merely nearby', () => {
  for (const socket of SOCKETS) {
    for (const [x,y] of [[0,-80],[0,80],[-99,0],[99,0],[0,-25],[0,25],[45,35]]) {
      const state=freshExpedition(),rt=freshRuntime(),rock={kind:'blue',sourceId:socket.id,radius:20,pos:{x:socket.pos.x+x,y:socket.pos.y+y},vel:{x:0,y:0},rot:[0,0,0]}
      const rocks=[rock],ship=shipAt({x:socket.pos.x,y:socket.pos.y+140})
      for(let i=0;i<60;i++)step(state,rt,ship,rocks)
      assert.equal(rock.socketId,undefined,`${socket.id} must not catch a cell at ${x},${y}`)
      assert.equal(state.power[socket.id],undefined)
      assert.equal(rt.socketCharge[socket.id] ?? 0,0)
    }
    assert.ok(betweenReceiverPlates({pos:{x:socket.pos.x+46,y:socket.pos.y+24},radius:20},socket.pos))
    assert.equal(betweenReceiverPlates({pos:{x:socket.pos.x+47,y:socket.pos.y},radius:20},socket.pos),false)
  }
})

test('receivers do not pull side deliveries through or around their plates', () => {
  const state = freshExpedition('ring'), rt = freshRuntime(), socket = SOCKETS[0]
  state.gates.push('rubble')
  const rock = { kind: 'blue', sourceId: socket.id, radius: 20, pos: { x: socket.pos.x + 99, y: socket.pos.y }, vel: { x: -180, y: 0 }, rot: [1, 0, 0], tethered: true }
  const ship = shipAt({ x: 600, y: 1000 }), rocks = [rock]
  for (let i = 0; i < 180; i++) {
    step(state, rt, ship, rocks)
    assert.ok(isInsideCavern(rock.pos, 19.9, expeditionMap(state)), 'auto-seating must not pull cargo through the frame')
  }
  assert.equal(state.gates.includes(socket.id),false); assert.equal(rocks.length,1)
  assert.equal(rock.socketId,undefined)
})
