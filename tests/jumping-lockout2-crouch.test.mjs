import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRun, stepRun } from './helpers/jumping-active-run.mjs'
import { parseLevel, levelProblems } from '../src/games/jumping/level.ts'
import { NEUTRAL_INPUT, STEP } from '../src/games/jumping/model.ts'
import { propLoadsPlate } from '../src/games/jumping/propGeometry.ts'

const fixture = JSON.parse(readFileSync(new URL('./fixtures/jumping-lockout2-crouch.json', import.meta.url), 'utf8'))
for (const route of fixture.routes) test(`Lock Out II: ${route.name} from the plate completes`, () => {
  const level = parseLevel(fixture.level)
  assert.deepEqual(levelProblems(level), [])
  const run = createRun(level), plate = level.triggers[1]
  let shots = 0, drained = false
  for (const { frames, input } of route.trace) for (let frame = 0; frame < frames; frame++) {
    assert.equal(run.finished, false)
    stepRun(run, { ...NEUTRAL_INPUT, ...input }, STEP)
    if (run.gadgets.shots > shots) {
      shots = run.gadgets.shots
      assert.ok(run.player.grounded && run.player.crouching && run.triggers[1].active)
      assert.ok(!run.props.some(p => propLoadsPlate(p, plate.x, plate.y, plate.w)), 'the player keeps the pump pressed while shooting')
      const pulse = run.gadgets.pulses.at(-1)
      assert.ok(pulse.to[0] < pulse.from[0])
      assert.ok(Math.abs(pulse.to[1] - pulse.from[1]) < 1e-6, 'holding Down fires horizontally')
    }
    drained ||= shots === route.shots && !run.triggers[1].active && run.water.pools[0].level < 70
  }
  const receiver = level.triggers[0], ball = run.props.find(p => p.name === 'Transfer float')
  assert.equal(shots, route.shots)
  assert.ok(run.finished && drained && run.goalLit)
  assert.ok(propLoadsPlate(ball, receiver.x, receiver.y, receiver.w))
  assert.equal(run.grade, 'A')
  assert.ok(Math.abs(run.elapsed - route.elapsed) < STEP)
})
