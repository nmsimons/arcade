import assert from 'node:assert/strict'
import test from 'node:test'
import { SimulationClock, SIMULATION_STEP, MAX_CATCH_UP_STEPS } from '../src/games/hardVacuum/simulationClock.ts'
import { stepShipMovement } from '../src/games/hardVacuum/expeditionPhysics.ts'

test('production movement and coasting match at 30, 60, 120, and 144 render Hz', () => {
  const runs = [30, 60, 120, 144].map(hz => {
    const clock = new SimulationClock(), ship = { pos: { x: 0, y: 0 }, vel: { x: 0, y: 0 }, angle: 0, radius: 15 }
    let tick = 0, thrustDistance = 0
    for (let frame = 0; frame <= hz * 15; frame++) clock.advance(frame * 1000 / hz, true, dt => {
      stepShipMovement(ship, new Set(tick < 600 ? ['w'] : []), dt)
      if (++tick === 600) thrustDistance = ship.pos.x
    })
    assert.equal(tick, 900)
    assert.ok(thrustDistance > 2780 && thrustDistance < 2782, 'preserve the original 60 Hz acceleration curve')
    return ship
  })
  for (const ship of runs) assert.deepEqual(ship, runs[0], 'fixed steps agree exactly, independent of rendering')
})

test('hitches are bounded, while pause and resume do not replay suspended time', () => {
  const clock = new SimulationClock(), steps = []
  clock.advance(0, true, dt => steps.push(dt))
  assert.equal(clock.advance(10000, true, dt => steps.push(dt)), MAX_CATCH_UP_STEPS)
  assert.ok(Math.abs(clock.discardedSeconds - 9.9) < 1e-9)
  assert.ok(steps.every(dt => dt === SIMULATION_STEP))
  clock.advance(20000, false, () => assert.fail('paused'))
  clock.reset()
  assert.equal(clock.advance(30000, true, () => assert.fail('resume catch-up')), 0)
  assert.equal(clock.advance(30000 + 1000 / 60, true, () => {}), 1)
})
