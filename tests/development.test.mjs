import assert from 'node:assert/strict'
import test from 'node:test'
import { addDevelopmentCredits, advanceDevelopmentLevel, DEV_CREDITS, DEV_LEVELS } from '../src/games/hardVacuum/development.ts'
import { campaignObjective, havenPosition, havenReady } from '../src/games/hardVacuum/campaign.ts'
import { BERTHS } from '../src/games/hardVacuum/campaignWorld.ts'
import { expeditionMap, freshExpedition, maxShields, parseExpedition, powerCellSpawns, powerReceiver, SOCKETS } from '../src/games/hardVacuum/expedition.ts'
import { isInsideCavern } from '../src/games/hardVacuum/worldGeometry.ts'

test('all six dev jumps reach a playable region with its first circuit still unsolved', () => {
  const first = ['breach-power', 'freight-power', 'works-power', 'foundry', 'refuge-power', 'heart-power']
  for (const [index, level] of DEV_LEVELS.entries()) {
    const state = freshExpedition()
    assert.ok(advanceDevelopmentLevel(state, level.id))
    assert.deepEqual(state.position, level.entry)
    assert.equal(campaignObjective(state).circuit, first[index])
    assert.equal(state.power[first[index]], undefined)
    assert.equal(state.core, false); assert.equal(state.complete, false)
    assert.ok(isInsideCavern(state.position, 15, expeditionMap(state)))
    assert.ok(isInsideCavern(havenPosition(state), 118, expeditionMap(state)))
    assert.ok(havenReady(state)); assert.equal(state.checkpoint, 'haven')
    const berth = BERTHS.find(b => b.id === state.campaign.berth)
    assert.ok(!berth.power || state.power[berth.power], 'Haven is at a powered berth')
    assert.ok(state.campaign.berths.includes(berth.id))
    assert.equal(state.blasterInstalled, index >= 2)
    assert.equal(state.upgrades.includes('radiation'), index >= 2)
    assert.equal(state.shields, maxShields(state))
    assert.equal(powerCellSpawns(state).length + Object.keys(state.power).length, SOCKETS.length)
    assert.deepEqual(parseExpedition(JSON.stringify(state)), state)
  }
})

test('dev jumps preserve progress, mixed cell assignments, upgrades, credits and released cargo', () => {
  const state = freshExpedition()
  powerReceiver(state, 'heart-power', 'breach-power')
  state.banked = 1250; state.credits = 81
  state.upgrades = ['hull', 'focus']; state.upgradeLevels = { hull: 2, focus: 1 }
  state.caches.push('rescue-cache')
  state.cargo = { 'archive-cache': { pos: { x: 1300, y: 350 }, vel: { x: 2, y: 3 }, tethered: true } }
  state.campaign.journey = { destination: 'freight', points: [], index: 0, phase: 'folding', progress: .5, riding: true, speed: 0 }
  const cargo = structuredClone(state.cargo)
  assert.ok(advanceDevelopmentLevel(state, 'heart'))
  assert.equal(state.power['heart-power'], 'breach-power')
  assert.equal(new Set(Object.values(state.power)).size, Object.keys(state.power).length)
  assert.equal(state.banked, 1250); assert.equal(state.credits, 81)
  assert.deepEqual(state.upgradeLevels, { hull: 2, focus: 1 })
  assert.deepEqual(state.cargo, cargo); assert.deepEqual(state.caches, ['rescue-cache'])
  assert.equal(state.campaign.journey, undefined)
  const power = { ...state.power }, gates = [...state.gates]
  assert.ok(advanceDevelopmentLevel(state, 'breach'))
  assert.deepEqual(state.power, power); assert.deepEqual(state.gates, gates)
  assert.equal(state.banked, 1250); assert.equal(state.credits, 81)
  assert.deepEqual(parseExpedition(JSON.stringify(state)), state)
  const before = structuredClone(state)
  assert.equal(advanceDevelopmentLevel(state, 'missing'), false)
  assert.deepEqual(state, before)
})

test('dev credits add to the bank repeatedly and survive saving without altering carried credits', () => {
  const state = freshExpedition(); state.banked = 130; state.credits = 29
  addDevelopmentCredits(state); addDevelopmentCredits(state)
  assert.equal(state.banked, 130 + DEV_CREDITS * 2); assert.equal(state.credits, 29)
  assert.deepEqual(parseExpedition(JSON.stringify(state)), state)
})
