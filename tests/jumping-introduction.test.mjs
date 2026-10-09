import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createRun, stepRun } from '../src/games/jumping/challenge.ts'
import { levelProblems, parseLevel } from '../src/games/jumping/level.ts'
import { NEUTRAL_INPUT, STEP } from '../src/games/jumping/model.ts'

const evidence = JSON.parse(await readFile(new URL('fixtures/jumping-introduction-runs.json', import.meta.url)))
for (const recording of evidence.runs) test(`${recording.file}: current held-jump introduction ${recording.recovery ? 'after ladder recovery' : 'from a fresh start'}`, async () => {
  const level = parseLevel(JSON.parse(await readFile(new URL(`../public/levels/jumping/${recording.file}`, import.meta.url))))
  assert.deepEqual(levelProblems(level), [])
  const run = createRun(level), p = run.player
  let reachedFloor = false, ladder = false, recovered = false, automaticRope = false, heldCatch = false, departed = false
  for (const segment of recording.trace) {
    assert.ok(Number.isInteger(segment.frames) && segment.frames > 0)
    assert.ok(Object.keys(segment.input).every(key => key in NEUTRAL_INPUT), 'record only ordinary movement inputs')
    assert.equal('jumpStrength' in segment.input, false, 'use the current press/hold controls')
    const input = { ...NEUTRAL_INPUT, ...segment.input }
    for (let frame = 0; frame < segment.frames; frame++) {
      assert.equal(run.finished, false, 'stop recording at completion')
      const wasRope = p.climbing?.kind === 'rope'
      stepRun(run, input)
      reachedFloor ||= p.grounded && p.y === 1600
      ladder ||= p.climbing?.kind === 'ladder'
      recovered ||= ladder && p.grounded && p.y === 1200 && p.x < 540
      if (p.climbing?.kind === 'rope' && !input.climb) automaticRope = true
      if (wasRope && p.climbing?.kind === 'rope' && input.jump) heldCatch = true
      if (wasRope && !p.climbing && input.jump) departed = true
    }
  }
  assert.ok(run.finished, 'reach and enter the actual powered doorway')
  assert.equal(run.medal, recording.medal)
  assert.ok(Math.abs(run.elapsed - recording.elapsed) < STEP)
  assert.ok(Math.abs(run.activeTime - recording.activeTime) < STEP)
  if (recording.recovery) assert.ok(reachedFloor && ladder && recovered, 'fall to the floor and climb back to the starting bank')
  if (recording.file === '02.json') assert.ok(automaticRope && heldCatch && departed, 'catch without Up, consume the held press, then depart on a fresh press')
})
