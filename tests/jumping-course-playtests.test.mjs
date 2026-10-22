import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { parseLevel } from '../src/games/jumping/level.ts'
import { createRun, stepRun } from './helpers/jumping-active-run.mjs'
import { NEUTRAL_INPUT, STEP } from '../src/games/jumping/model.ts'

const recordings = JSON.parse(readFileSync(new URL('./fixtures/jumping-course-playtests.json', import.meta.url), 'utf8'))
const fixtures = JSON.parse(readFileSync(new URL('./fixtures/jumping/course-regression-levels.json', import.meta.url), 'utf8'))
const recordedLevel = file => parseLevel(structuredClone(fixtures.levels[file]))
assert.equal(recordings.jumpModel, 'tap-hold')
const audited = [...recordings.runs, ...recordings.pendingAudit]
assert.equal(audited.length, 7)
assert.equal(new Set(audited.map(run => run.file)).size, 7)

test('captured course layouts retain pending audits and superseded evidence after catalog edits', () => {
  assert.equal(fixtures.version, 1)
  assert.match(fixtures.sourceCommit, /^[a-f0-9]{40}$/)
  for (const audit of audited) assert.ok(recordedLevel(audit.file), 'each historical route retains its authored layout')
  for (const audit of recordings.pendingAudit) assert.ok(audit.reason.trim().length > 0)
  for (const old of recordings.supersededRuns) {
    assert.ok(recordings.pendingAudit.some(audit => audit.file === old.file))
    assert.ok(old.trace.length > 0, 'the old completion remains available for comparison, without certifying the edited layout')
  }
})

for (const recording of [...recordings.runs, ...recordings.alternatives]) test(`captured course completion: ${recording.file}${recording.label ? ` / ${recording.label}` : ''}`, () => {
  const level = recordedLevel(recording.file)
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

test('the captured Hurricane encounter contains Rbot and lets the player reset quarantine', () => {
  const recording = recordings.quarantine
  const level = recordedLevel(recording.file)
  const run = createRun(level), boundary = level.forceFields[0].x
  let activatedAt
  for (const { frames, input } of recording.trace) for (let frame = 0; frame < frames; frame++) {
    stepRun(run, { ...NEUTRAL_INPUT, ...input })
    if (run.forceFields[0].active) {
      activatedAt ??= run.activeTime
      assert.ok(run.robots[0].x < boundary, 'the hunter cannot cross the closed field')
    }
  }
  assert.ok(activatedAt !== undefined && run.activeTime - activatedAt > 9)
  assert.ok(run.robots[0].shots > 0, 'the trap follows a live pursuit')
  assert.ok(run.player.x > boundary && run.player.grounded)
  assert.ok(Math.abs(run.player.x - 1180) < 4, 'the player remains safe during the observation')
  assert.equal(run.forceFields[0].active, true)

  // Walk off and back onto the same toggle with ordinary analog steering.
  const walk = target => {
    for (let frame = 0; frame < 180; frame++) {
      const dx = target - run.player.x
      if (Math.abs(dx) < 3 && Math.abs(run.player.vx) < 25) break
      stepRun(run, { ...NEUTRAL_INPUT, move: Math.max(-1, Math.min(1, dx / 70)) })
    }
    for (let frame = 0; frame < 30; frame++) stepRun(run, NEUTRAL_INPUT)
  }
  walk(1100); walk(1180)
  assert.equal(run.forceFields[0].active, false, 'an early seal can be reopened')
  walk(1100); walk(1180)
  assert.equal(run.forceFields[0].active, true, 'quarantine can be closed again')
})
