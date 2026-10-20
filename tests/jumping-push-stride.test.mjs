import test from 'node:test'
import assert from 'node:assert/strict'
import { pushScenario } from './helpers/jumpingPushScenarios.mjs'
import { stepRun } from './helpers/jumping-active-run.mjs'
import { NEUTRAL_INPUT, STEP } from '../src/games/jumping/model.ts'
import { athletePose } from '../src/games/jumping/athlete.ts'

for (const kind of ['box', 'ball']) for (const side of [-1, 1]) for (const dt of [STEP, 1 / 30]) {
  test(`moving ${kind} pushes use deliberate supported steps (${side}, ${Math.round(1 / dt)} Hz)`, () => {
    const run = pushScenario({ kind, size: 80 }, side), p = run.player
    const warmup = Math.round(1 / dt), ticks = Math.round(5 / dt)
    let previous = [true, true], steps = 0, start = 0
    const movers = new Set()
    for (let i = 0; i < ticks; i++) {
      stepRun(run, { ...NEUTRAL_INPUT, move: side }, dt)
      assert.ok(p.grounded && p.pushing?.effort, 'retain the actual loaded push')
      assert.ok(p.footwork.feet.some(f => f.planted), 'one real foot carries every step')
      if (i === warmup) start = p.x
      if (i > warmup) {
        const pose = athletePose(p)
        for (const [j, foot] of p.footwork.feet.entries()) {
          if (!foot.planted && previous[j]) { steps++; movers.add(j) }
          const leg = j === 0 ? pose.frontLeg : pose.backLeg
          if (foot.planted) assert.ok(Math.hypot(p.x + leg.end[0] * side - foot.x, p.y + leg.end[1] - foot.y) < 1e-6, 'a loaded ankle cannot slide under the body')
          assert.ok(Math.abs(foot.x - p.x) < 18, 'the step retains a modest reach')
        }
      }
      previous = p.footwork.feet.map(f => f.planted)
    }
    const seconds = (ticks - warmup - 1) * dt, cadence = steps / seconds, speed = Math.abs(p.x - start) / seconds
    assert.equal(movers.size, 2, 'both legs advance')
    assert.ok(cadence > 2 && cadence < (kind === 'ball' ? 4.8 : 3.7), `${kind} cadence should not churn: ${cadence}`)
    assert.ok(kind === 'ball' ? Math.abs(speed - 90) < .01 : speed > 45 && speed < 60, `retain the existing shove speed: ${speed}`)
  })
}
