import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRun, stepRun } from './helpers/jumping-active-run.mjs'
import { parseLevel, levelProblems } from '../src/games/jumping/level.ts'
import { NEUTRAL_INPUT, STEP } from '../src/games/jumping/model.ts'
import { propLoadsPlate } from '../src/games/jumping/propGeometry.ts'

// Retain the reviewed layout so later Studio revisions do not erase this
// float-delivery and drain/refill contact regression. The catalog medal audit
// independently replays the fast route against the current built-in asset.
const fixture = JSON.parse(readFileSync(new URL('./fixtures/jumping-lockout2-runs.json', import.meta.url), 'utf8'))
const receiver = run => run.props.find(p => p.name === 'Transfer float')
const loaded = run => {
  const plate = run.level.triggers[0]
  return propLoadsPlate(receiver(run), plate.x, plate.y, plate.w)
}

test('the revised Lock Out II and its captured working layout validate', () => {
  const current = JSON.parse(readFileSync(new URL('../public/levels/jumping/Lock Out 2.jump-level.json', import.meta.url), 'utf8'))
  assert.deepEqual(levelProblems(parseLevel(current)), [])
  assert.deepEqual(levelProblems(parseLevel(fixture.level)), [])
})

for (const route of fixture.routes) test(`Lock Out II: ${route.name} delivers a physical float and retains both loads`, () => {
  const run = createRun(parseLevel(fixture.level))
  let carried = false, drainedEarly = false, refilled = false, heldDry = false
  for (const { frames, input } of route.trace) for (let frame = 0; frame < frames; frame++) {
    assert.equal(run.finished, false, 'the recording stops at completion')
    stepRun(run, { ...NEUTRAL_INPUT, ...input }, STEP)
    const water = run.water.pools[0].level, ball = receiver(run)
    if (run.triggers[2].active && water < 6 && !run.triggers[0].active) drainedEarly = true
    if (drainedEarly && water > 99 && !run.triggers[2].active) refilled = true
    if (water > 90 && ball.x < 780 && ball.y < 300 && !run.triggers[0].active) carried = true
    if (run.triggers[0].active) {
      heldDry = true
      assert.ok(loaded(run), 'the delivered ball, rather than the player, loads the receiver')
      assert.ok(water < 70, 'the receiver is below the high-water surface')
    }
  }
  assert.ok(carried && heldDry && run.finished)
  assert.ok(run.triggers[1].active && run.triggers[2].active && loaded(run))
  assert.equal(run.gadgets.shots, route.shots)
  assert.equal(run.grade, route.grade)
  assert.ok(Math.abs(run.elapsed - route.elapsed) < STEP)
  if (route.name === 'refill recovery') assert.ok(drainedEarly && refilled)
})

test('draining leaves the delivered ball parked after the player releases movement', () => {
  const run = createRun(parseLevel(fixture.level)), route = fixture.routes.find(r => r.name === 'ordinary')
  delivery: for (const { frames, input } of route.trace) for (let frame = 0; frame < frames; frame++) {
    stepRun(run, { ...NEUTRAL_INPUT, ...input }, STEP)
    if (run.triggers[0].active) break delivery
  }
  assert.ok(loaded(run)); assert.equal(run.finished, false)
  for (let frame = 0; frame < 600; frame++) {
    stepRun(run, NEUTRAL_INPUT, STEP)
    assert.ok(loaded(run) && run.goalLit, 'the ball remains a stable exit load as the reservoir empties')
  }
  assert.equal(run.water.pools[0].level, 5)
  assert.ok(run.player.x > 1200, 'the player is away from the receiving plate')
})
