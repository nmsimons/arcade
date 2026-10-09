import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRun, stepRun } from '../src/games/jumping/challenge.ts'
import { parseLevel } from '../src/games/jumping/level.ts'
import { NEUTRAL_INPUT, TUNING } from '../src/games/jumping/model.ts'
import { athletePose } from '../src/games/jumping/athlete.ts'

const spelunk = JSON.parse(readFileSync(new URL('../public/levels/jumping/spelunk1.jump-level.json', import.meta.url)))

test('Spelunk downhill running completes descending-foot landings instead of restarting and dragging a leg', () => {
  // Retain the reported polygon and actual ball; place this isolated encounter
  // at the ridge above the exit. The authored level and its spawn stay unchanged.
  for (const mode of ['walk', 'run', 'crouch']) {
    const run = createRun(parseLevel({ ...spelunk, spawn: { x: 1280, y: 1460 } }))
    let previous = [], completedLandings = 0, maximumTrail = 0
    for (let tick = 0; tick < 160; tick++) {
      stepRun(run, { ...NEUTRAL_INPUT, move: mode === 'walk' ? -TUNING.walkSpeed / TUNING.runSpeed : -1,
        crouch: mode === 'crouch', descend: mode === 'crouch', drop: mode === 'crouch' })
      const p = run.player, feet = p.footwork?.feet ?? [], pose = athletePose(p)
      for (const [i, foot] of feet.entries()) {
        maximumTrail = Math.max(maximumTrail, (p.x - foot.x) * p.facing)
        if (previous[i]?.release?.landing && foot.release?.landing) {
          assert.ok(foot.release.time > previous[i].release.time, `${mode}/${tick}: the ongoing landing must advance`)
        }
        if (previous[i]?.release?.landing && !foot.release?.landing) completedLandings++
      }
      for (const leg of [pose.frontLeg, pose.backLeg]) {
        assert.ok(Math.abs(Math.hypot(...leg.joint.map((v, i) => v - leg.root[i]), leg.jointDepth ?? 0) - 15) < 1e-5)
        assert.ok(Math.abs(Math.hypot(...leg.end.map((v, i) => v - leg.joint[i]), (leg.endDepth ?? 0) - (leg.jointDepth ?? 0)) - 14.5) < 1e-5)
      }
      previous = structuredClone(feet)
    }
    assert.ok(maximumTrail < 25, `${mode}: the shoe trails ${maximumTrail.toFixed(2)} units behind the body`)
    if (mode === 'run') assert.ok(completedLandings > 0, 'the running route exercises the actual descending landing blend')
  }
})
