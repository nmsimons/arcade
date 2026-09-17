import assert from 'node:assert/strict'
import test from 'node:test'
import { asteroidFieldCredits, creditAsteroidDestruction, inOreProcessingZone } from '../src/games/hardVacuum/oreCredits.ts'
import { BASE_POSITION, crashExpedition, freshExpedition, parseExpedition } from '../src/games/hardVacuum/expedition.ts'

const ore = (kind = 'normal', radius = 20, pos = { x: 1300, y: 1300 }) => ({ kind, radius, pos })

test('regular rocks give modest credits, blue ore pays tenfold, and larger rocks retain a size bonus', () => {
  assert.equal(asteroidFieldCredits(ore()), 10)
  assert.equal(asteroidFieldCredits(ore('red')), 10)
  assert.equal(asteroidFieldCredits(ore('blue')), 100)
  assert.equal(asteroidFieldCredits(ore('normal', 35)), 33)
  for (const radius of [10, 17, 20, 25, 35, 50]) {
    assert.equal(asteroidFieldCredits(ore('blue', radius)), asteroidFieldCredits(ore('normal', radius)) * 10)
  }
})

test('Haven banks exactly ten times the field reward for every asteroid type and size', () => {
  for (const kind of ['normal', 'blue', 'red']) for (const radius of [10, 17, 20, 25, 35, 50]) {
    const field = freshExpedition(), base = freshExpedition()
    field.banked = base.banked = 60; field.credits = base.credits = 7
    const fieldReward = creditAsteroidDestruction(field, ore(kind, radius))
    const baseReward = creditAsteroidDestruction(base, ore(kind, radius, BASE_POSITION))
    assert.equal(baseReward, fieldReward * 10)
    assert.equal(field.credits, 7 + fieldReward); assert.equal(field.banked, 60)
    assert.equal(base.banked, 60 + baseReward); assert.equal(base.credits, 7)
  }
})

test('the asteroid location determines the bonus; the ship and gun location cannot grant it remotely', () => {
  const state = freshExpedition()
  state.position = { ...BASE_POSITION }
  const outside = ore('blue', 20, { x: BASE_POSITION.x + 110, y: BASE_POSITION.y })
  assert.equal(inOreProcessingZone(outside), false)
  assert.equal(creditAsteroidDestruction(state, outside), 100)
  assert.equal(state.banked, 0); assert.equal(state.credits, 100)
  const inside = ore('blue', 20, { x: BASE_POSITION.x + 80, y: BASE_POSITION.y })
  assert.equal(inOreProcessingZone(inside), true)
  state.position = { x: 2500, y: 1300 }
  assert.equal(creditAsteroidDestruction(state, inside), 1000)
  assert.equal(state.banked, 1000); assert.equal(state.credits, 100)
})

test('mission power cells never produce credits, either loose or connected', () => {
  for (const extra of [{ sourceId: 'foundry' }, { sourceId: 'heart', socketId: 'heart' }, { socketId: 'relay' }]) {
    const state = freshExpedition()
    for (const pos of [BASE_POSITION, { x: 2300, y: 1100 }]) {
      assert.equal(creditAsteroidDestruction(state, { ...ore('blue', 20, pos), ...extra }), 0)
    }
    assert.equal(state.credits, 0); assert.equal(state.banked, 0)
  }
})

test('earned credits persist, and only field earnings are lost on a crash', () => {
  const state = freshExpedition()
  creditAsteroidDestruction(state, ore('blue'))
  creditAsteroidDestruction(state, ore('blue', 20, BASE_POSITION))
  const restored = parseExpedition(JSON.stringify(state))
  assert.equal(restored.credits, 100); assert.equal(restored.banked, 1000)
  assert.equal(crashExpedition(restored), 100)
  assert.equal(restored.credits, 0); assert.equal(restored.banked, 1000)
})
