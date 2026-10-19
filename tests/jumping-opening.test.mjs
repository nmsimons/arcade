import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRun, createPreviewRun, stepRun, BEST_TIME_KEY } from '../src/games/jumping/challenge.ts'
import { parseLevel, levelProblems } from '../src/games/jumping/level.ts'
import { NEUTRAL_INPUT, STEP } from '../src/games/jumping/model.ts'
import { AWAKENING_SECONDS } from '../src/games/jumping/goal.ts'
import { awakeningPose, athletePose } from '../src/games/jumping/athlete.ts'
import { COMPLETION_KEY, readCompleted, saveCompleted } from '../src/games/jumping/completion.ts'
import { emptyWorkspace, parseWorkspace } from '../src/accounts/data.ts'
import { workspaceFiles, filesWorkspace } from '../src/accounts/cloudLayout.ts'

const opening = () => parseLevel(JSON.parse(readFileSync(new URL('../public/levels/jumping/Wake.jump-level.json', import.meta.url), 'utf8')))

test('Wake starts the built-in collection and uses an authored, valid, untimed night room', () => {
  const index = JSON.parse(readFileSync(new URL('../public/levels/jumping/index.json', import.meta.url), 'utf8'))
  assert.equal(index.levels[0], 'Wake.jump-level.json')
  const level = opening()
  assert.deepEqual(levelProblems(level), [])
  assert.equal(level.timing, 'untimed'); assert.equal(level.entrance.kind, 'charging-bay')
  assert.equal(level.lighting.nightMode, true); assert.equal(level.pickups.length, 0); assert.equal(level.timers.length, 0)
  assert.deepEqual(parseLevel(JSON.parse(JSON.stringify(level))), level)
})

test('awakening holds gameplay, preserves planted feet, then hands off automatically; restart and preview are deterministic', () => {
  const level = opening()
  for (let restart = 0; restart < 2; restart++) {
    const run = createRun(level), before = structuredClone(run.player)
    const sleeping = awakeningPose(run.entrance.player, 0), standing = athletePose(run.entrance.player)
    assert.ok(sleeping.head[1] > standing.head[1], 'the head starts lowered')
    assert.deepEqual(sleeping.frontLeg.end, standing.frontLeg.end)
    assert.deepEqual(sleeping.backLeg.end, standing.backLeg.end)
    assert.deepEqual(awakeningPose(run.entrance.player, 1), standing)
    stepRun(run, { ...NEUTRAL_INPUT, move: 1, jump: true }, AWAKENING_SECONDS - STEP)
    assert.deepEqual(run.player, before); assert.equal(run.started, false); assert.equal(run.activeTime, 0)
    stepRun(run, NEUTRAL_INPUT, STEP)
    assert.equal(run.started, true); assert.equal(run.entrance, null)
    stepRun(run, NEUTRAL_INPUT)
    assert.equal(run.player.grounded, true, 'the held early jump is not queued')
    assert.ok(run.activeTime > 0); assert.equal(run.elapsed, 0)
  }
  const preview = createPreviewRun(level), before = structuredClone(preview)
  stepRun(preview, { ...NEUTRAL_INPUT, move: 1 }, 30)
  assert.deepEqual(preview, before)
})

test('the opening completes with ordinary running and a held jump; time and medals remain absent', () => {
  for (const move of [1, .5]) {
    const run = createRun(opening())
    for (let frame = 0; frame < 2400 && !run.finished; frame++) {
      stepRun(run, { ...NEUTRAL_INPUT, move: run.started ? move : 0, jump: run.started && run.player.x > 780 && run.player.x < 1050 })
    }
    assert.equal(run.finished, true)
    assert.equal(run.triggers[0].active, true, 'crossing the switch latches access without stopping')
    assert.equal(run.switchStates.get('access-light'), true); assert.equal(run.goalLit, true)
    assert.equal(run.elapsed, 0); assert.equal(run.medal, null)
  }
})

test('awakening and timing settings reject malformed values', () => {
  const level = opening()
  for (const kind of ['wake', false, 3]) assert.throws(() => parseLevel({ ...level, entrance: { ...level.entrance, kind } }))
  for (const timing of ['silver', true, 1]) assert.throws(() => parseLevel({ ...level, timing }))
})

test('untimed completions persist separately, older finishes still count, and cloud files preserve completion data', () => {
  const values = new Map(), storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) }
  assert.equal(readCompleted(storage, 'wake'), false)
  saveCompleted(storage, 'wake'); saveCompleted(storage, 'other')
  assert.equal(readCompleted(storage, 'wake'), true); assert.equal(readCompleted(storage, 'other'), true)
  assert.equal(storage.getItem(BEST_TIME_KEY), null, 'no artificial zero-second personal best')
  storage.setItem(BEST_TIME_KEY, JSON.stringify({ older: 999 }))
  assert.equal(readCompleted(storage, 'older'), true)
  const workspace = parseWorkspace(JSON.stringify({ ...emptyWorkspace(), slots: { [COMPLETION_KEY]: storage.getItem(COMPLETION_KEY) } }))
  const files = workspaceFiles(workspace)
  assert.equal(files.get('Untitled Jumping Game/completed-levels.json'), storage.getItem(COMPLETION_KEY))
  assert.deepEqual(filesWorkspace(files), workspace)
  for (const invalid of [{ wake: false }, { wake: 0 }, []]) assert.throws(() => parseWorkspace(JSON.stringify({ ...emptyWorkspace(), slots: { [COMPLETION_KEY]: JSON.stringify(invalid) } })))
})
