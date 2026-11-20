import test from 'node:test'
import assert from 'node:assert/strict'
import { performance } from 'node:perf_hooks'
import { blankTrial } from '../src/games/jumping/level.ts'
import { createRun, stepRun } from './helpers/jumping-active-run.mjs'
import { NEUTRAL_INPUT, STEP } from '../src/games/jumping/model.ts'

for (const side of [-1, 1]) for (const kind of ['box', 'ball']) {
  test(`holding Down beside a floating ${kind} blocking the ${side < 0 ? 'right' : 'left'} bank stays responsive and retries when clear`, () => {
    const edge = side > 0 ? 640 : 1160
    const run = createRun({ ...blankTrial(), entrance: { x: edge + side * 14, y: 360 },
      platforms: [{ x: side > 0 ? edge : 0, y: 360, w: 1160, h: 560 }],
      props: [{ kind, x: edge - side * 40, y: 440, size: 80 }],
      goal: { id: 'closed', x: 1600, y: 920, power: 'switched' },
      gravityPlates: [{ id: 'water', x: side > 0 ? 200 : edge, y: 400, w: 440, h: 520,
        effect: 'water', gravity: -1, power: 'always' }] })
    run.started = true
    for (let i = 0; i < 600; i++) stepRun(run, NEUTRAL_INPUT)
    const input = { ...NEUTRAL_INPUT, descend: true }, steps = []
    for (let i = 0; i < 600; i++) {
      const started = performance.now()
      stepRun(run, input)
      steps.push(performance.now() - started)
      assert.equal(run.player.grounded, true, 'the obstructing float prevents entering an unsafe descent')
      assert.equal(run.player.mantle, null)
      assert.ok(Math.abs(run.player.y - 360) < .001)
    }
    // Five simulated seconds must leave plenty of CPU budget for rendering.
    // This is deliberately generous; the original eager path search took >10s.
    // The median step stands for all 600, so a busy machine pausing the test
    // for a few steps (a full parallel suite) cannot fail it; a slow search
    // slows every step.
    const median = steps.sort((a, b) => a - b)[steps.length >> 1]
    assert.ok(median * steps.length < 1000, `a blocked descent must not stall the game (median step ${median.toFixed(2)} ms)`)
    run.props[0].vx = -side * 200
    let lowered = false
    for (let i = 0; i < Math.round(2 / STEP); i++) {
      stepRun(run, input)
      lowered ||= !!run.player.mantle?.descending
    }
    assert.ok(lowered, 'moving the real obstacle away immediately allows the same held input to lower over the bank')
  })
}
