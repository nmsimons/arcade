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

test('the captured Hurricane quarantine circuit closes, reopens and closes again with ordinary plate contacts', () => {
  const recording = recordings.supersededQuarantine, level = recordedLevel(recording.file)
  assert.ok(recording.reason?.trim() && recording.trace.length, 'preserve the superseded live-pursuit observation without claiming it still completes')
  assert.equal(level.robots[0].kind, 'repulsor')
  // Isolate the circuit from combat. The lower service route above still
  // completes with the actual Rbot; the revised upper pursuit needs a new audit.
  const run = createRun({ ...level, entrance: { x: 1180, y: 500 }, robots: [] })
  for (let frame = 0; frame < 30; frame++) stepRun(run, NEUTRAL_INPUT)
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
