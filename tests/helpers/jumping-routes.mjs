import assert from 'node:assert/strict'
import { createRun, stepRun } from '../../src/games/jumping/challenge.ts'
import { CAMPAIGN } from './jumping-fixtures.mjs'
import { NEUTRAL_INPUT } from '../../src/games/jumping/model.ts'
import { climbGait, ropePoint } from '../../src/games/jumping/climbables.ts'

/** Complete each lesson with normal controls, including actual rope catches and transfers. */
export function playLesson(index) {
  const run = createRun(CAMPAIGN[index]), p = run.player, caught = new Set()
  const tick = (frames, input = {}) => { for (let i = 0; i < frames; i++) { stepRun(run, { ...NEUTRAL_INPUT, ...input }); if (p.climbing?.kind === 'rope') caught.add(p.climbing.index) } }
  while (p.x < 535) tick(1, { move: 1, jump: true })
  for (let i = 0; i < 450 && !run.finished && !p.climbing; i++) tick(1, { move: 1, climb: true })
  for (let rope = 0; rope < index; rope++) {
    assert.equal(p.climbing?.kind, 'rope'); assert.equal(p.climbing?.index, rope)
    // Keep enough rope below the anchor to build a swing, then launch with its momentum.
    for (let i = 0; i < 600 && p.climbing?.distance > 180; i++) tick(1, { climb: true })
    const anchor = run.level.climbables.ropes[rope].x
    let move = 1
    for (let i = 0; i < 1440; i++) {
      const c = p.climbing, grip = climbGait(c.distance, c.rope.definition.length).grip
      const velocity = ropePoint(c.rope, grip)[0] - ropePoint(c.rope, grip, true)[0]
      if (Math.abs(velocity) > .025) move = Math.sign(velocity)
      tick(1, { move })
      if (p.climbing.time >= .25 && p.x > anchor + 30 && p.vx > 120) break
    }
    assert.ok(p.vx > 120, 'release while the rope is carrying the player toward the next bank')
    tick(1, { move: 1, jump: true })
    for (let i = 0; i < 650 && !run.finished && !p.climbing; i++) tick(1, { move: 1, climb: true })
  }
  assert.equal(run.finished, true); assert.equal(caught.size, index)
  return run
}
