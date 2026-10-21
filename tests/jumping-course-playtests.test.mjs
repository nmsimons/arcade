import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { parseLevel } from '../src/games/jumping/level.ts'
import { createRun, stepRun } from './helpers/jumping-active-run.mjs'
import { NEUTRAL_INPUT, STEP } from '../src/games/jumping/model.ts'

const recordings = JSON.parse(readFileSync(new URL('./fixtures/jumping-course-playtests.json', import.meta.url), 'utf8'))
assert.equal(recordings.jumpModel, 'tap-hold')
assert.equal(recordings.runs.length, 12)

for (const recording of recordings.runs) test(`fresh player completion with Rbot: ${recording.file}`, () => {
  const level = parseLevel(JSON.parse(readFileSync(new URL(`../public/levels/jumping/${recording.file}`, import.meta.url), 'utf8')))
  const run = createRun(level)
  for (const { frames, input } of recording.trace) {
    assert.ok(Number.isInteger(frames) && frames > 0)
    assert.ok(Object.keys(input).every(key => key in NEUTRAL_INPUT), 'ordinary controls, with no prescribed jump impulses')
    for (let frame = 0; frame < frames; frame++) {
      assert.equal(run.finished, false, 'the recording ends when the doorway completes')
      stepRun(run, { ...NEUTRAL_INPUT, ...input })
    }
  }
  assert.equal(run.finished, true)
  assert.equal(run.coinsCollected, recording.coins)
  assert.ok(Math.abs(run.elapsed - recording.elapsed) < STEP, `completion time changed: ${run.elapsed}`)
  assert.ok(Math.abs(run.activeTime - recording.activeTime) < STEP, 'the whole run replays from a fresh start')
})
