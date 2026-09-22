import assert from 'node:assert/strict'
import test from 'node:test'
import { SITUATIONS, createTrial, runTrial, scrimmages, summarize } from '../benchmarks/bumperBall.mjs'
import { createAiMemory, driveComputer } from '../src/games/bumperBall/ai.ts'

test('computer challenges possession, finishes chances and recovers balls at walls with fair controls', () => {
  const results = SITUATIONS.map(fixture => runTrial(fixture, { inspectDrive(before, world, dt) {
    const car = world.vehicle1
    assert.ok(Math.abs(car.angle - before.angle) <= 4 * dt + 1e-9, 'turning is capped at the player limit')
    assert.ok(Math.hypot(car.vel.x - before.vel.x, car.vel.y - before.vel.y) <= 350 * dt + 1e-9, 'acceleration is capped at the player limit')
  } }))
  const result = name => results.find(x => x.name === name)
  const contested = result('opponent-near-stationary-ball')
  assert.ok(contested.firstTouch !== null && contested.firstTouch < 5, 'challenge the opponent instead of yielding indefinitely')
  assert.equal(contested.outcome, 'scored')
  assert.equal(result('open-finish').outcome, 'scored')
  assert.ok(result('open-finish').boosts > 0, 'spend boost on a clear, lined-up finish')
  assert.ok(result('open-finish').seconds < 2.5)
  for (const name of ['top-wall', 'bottom-wall', 'corner']) {
    assert.equal(result(name).outcome, 'scored', name)
    assert.ok(result(name).seconds < 20, name)
  }
  assert.equal(result('defend-slow').outcome, 'scored')
  assert.ok(result('defend-fast').seconds > 6, 'stop the initial incoming shot')
  assert.notEqual(result('own-wall').outcome, 'conceded', 'do not drive a wall clearance toward the own goal')
  const totals = summarize(results)
  assert.ok(totals.scored >= 7)
  assert.ok(totals.conceded <= 1)
})

test('computer earns more goals than it concedes against a separately seeded ball-chasing opponent', () => {
  const results = scrimmages().map(fixture => runTrial(fixture, { opponent: true }))
  const totals = summarize(results)
  assert.ok(totals.scored >= 12)
  assert.ok(totals.conceded <= 8)
})

test('planning does not move the ball, opponent or bumpers, and each kickoff gets fresh independent memory', () => {
  const memory = createAiMemory(), fresh = createAiMemory(), world = createTrial(SITUATIONS[9])
  const snapshot = structuredClone({ ball: world.ball, opponent: world.vehicle2, bumpers: world.bumpers, goals: world.goals })
  for (let i = 0; i < 60; i++) driveComputer(world, memory, 1 / 60)
  assert.deepEqual({ ball: world.ball, opponent: world.vehicle2, bumpers: world.bumpers, goals: world.goals }, snapshot)
  assert.deepEqual(fresh, createAiMemory())
  assert.notStrictEqual(fresh.heldDir, memory.heldDir)
  assert.notStrictEqual(fresh.boost, memory.boost)
})

test('computer boosts improve an open finish but preserve gentle touches near the goal mouth', () => {
  const fixture = SITUATIONS.find(x => x.name === 'open-finish')
  const without = runTrial(fixture, { boosts: false }), withBoost = runTrial(fixture)
  assert.equal(without.outcome, 'scored')
  assert.equal(withBoost.outcome, 'scored')
  assert.ok(withBoost.seconds < without.seconds * 0.7)
  const gentle = runTrial({ name: 'near-goal-mouth', car: [1300, 500, 0], ball: [1400, 500, 0, 0], opponent: [800, 800] })
  assert.equal(gentle.outcome, 'scored')
  assert.equal(gentle.boosts, 0)
})
