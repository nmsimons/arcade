import assert from 'node:assert/strict'
import test from 'node:test'
import { doorProgress, expeditionMap, freshExpedition, freshRuntime, parseExpedition, powerReceiver, snapshotCargo, stepExpedition } from '../src/games/hardVacuum/expedition.ts'
import { isInsideCavern, raycastCavern } from '../src/games/hardVacuum/worldGeometry.ts'

const tick = (state, dt) => stepExpedition(state, freshRuntime(), { dt, ship: { pos: { x: 1500, y: 1100 }, vel: { x: 0, y: 0 }, radius: 15, angle: 0 }, rocks: [], harpoon: { state: 'idle' }, beam: { active: false } })

test('any power cell fits any receiver, and an installed cell cannot power two circuits', () => {
  const state = freshExpedition('ring')
  assert.ok(powerReceiver(state, 'relay', 'heart'))
  assert.ok(powerReceiver(state, 'foundry', 'relay'))
  assert.equal(powerReceiver(state, 'heart', 'heart'), false)
  assert.equal(powerReceiver(state, 'relay', 'foundry'), false)
  assert.ok(powerReceiver(state, 'heart', 'foundry'))
  const restored = parseExpedition(JSON.stringify(state))
  assert.deepEqual(restored.power, { relay: 'heart', foundry: 'relay', heart: 'foundry' })
})

test('powered doors animate their physical aperture for ship, cargo and laser, and resume after saving', () => {
  const state = freshExpedition('ring'), center = { x: 500, y: 705 }
  const blockedRay = () => raycastCavern({ x: 500, y: 640 }, { x: 0, y: 1 }, 120, expeditionMap(state))
  assert.ok(blockedRay() < 120)
  powerReceiver(state, 'foundry', 'relay')
  assert.equal(doorProgress(state, 'foundry'), 0)
  assert.equal(isInsideCavern(center, 15, expeditionMap(state)), false)
  tick(state, 0.15)
  assert.ok(doorProgress(state, 'foundry') > 0)
  assert.equal(isInsideCavern(center, 15, expeditionMap(state)), false)
  const saved = parseExpedition(JSON.stringify(state))
  assert.equal(doorProgress(saved, 'foundry'), doorProgress(state, 'foundry'))
  tick(state, 0.45)
  assert.ok(isInsideCavern(center, 27, expeditionMap(state)), 'half-open leaves clear a cargo-sized aperture')
  assert.equal(blockedRay(), 120)
  assert.equal(isInsideCavern({ x: 425, y: 705 }, 15, expeditionMap(state)), false, 'retracting leaves still collide')
  tick(state, 0.6)
  assert.equal(doorProgress(state, 'foundry'), 1)
  assert.ok(isInsideCavern({ x: 425, y: 705 }, 15, expeditionMap(state)))
  tick(saved, 1.05)
  assert.equal(doorProgress(saved, 'foundry'), 1)
})

test('legacy keys become powered routes without resetting upgrades or moved cargo', () => {
  const old = { ...freshExpedition('ring'), upgrades: ['access', 'radiation'], gates: ['rubble', 'foundry'], banked: 175 }
  delete old.power; delete old.doors
  const state = parseExpedition(JSON.stringify(old))
  assert.deepEqual(state.upgrades, ['radiation'])
  assert.deepEqual(state.power, { foundry: 'foundry', relay: 'relay' })
  for (const id of ['archive', 'reactor', 'shortcut']) assert.ok(state.gates.includes(id))
  assert.equal(state.banked, 175)
  const current = freshExpedition('ring'), rt = freshRuntime()
  const cell = { sourceId: 'foundry', socketId: 'relay', pos: { x: 1660, y: 1260 }, vel: { x: 0, y: 0 }, tethered: true }
  snapshotCargo(current, rt, [cell])
  assert.deepEqual(parseExpedition(JSON.stringify(current)).cargo.foundry.pos, cell.pos, 'save during seating retains the cell')
  for (const doors of [{ foundry: -1 }, { foundry: 0.5 }, { rubble: 0.5 }]) assert.equal(parseExpedition(JSON.stringify({ ...freshExpedition('ring'), doors })), null)
  assert.equal(parseExpedition(JSON.stringify({ ...freshExpedition('ring'), power: { foundry: 'heart', relay: 'heart' } })), null)
})
