import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRun, createPreviewRun, stepRun, BEST_TIME_KEY } from '../src/games/jumping/challenge.ts'
import { parseLevel, levelProblems } from '../src/games/jumping/level.ts'
import { NEUTRAL_INPUT, STEP } from '../src/games/jumping/model.ts'
import { AWAKENING_SECONDS, awakeningPower, awakeningProgress, chargingBayOpening, entranceBounds, entranceDoor } from '../src/games/jumping/goal.ts'
import { awakeningCamera, gameCamera } from '../src/games/jumping/camera.ts'
import { itemOutline, hitItem } from '../src/games/jumping/editor.ts'
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

test('the pod restores power before waking and releasing its cover; the camera hands off without a cut', () => {
  assert.equal(awakeningPower(0), 0)
  assert.equal(awakeningProgress(.9), 0)
  assert.equal(chargingBayOpening(2), 0)
  assert.equal(awakeningPower(2), 1)
  assert.equal(awakeningProgress(3.3), 1)
  assert.equal(chargingBayOpening(3.3), 1)
  const run = createRun(opening()), animation = run.entrance, before = structuredClone(animation)
  for (const [width, height] of [[1280, 800], [390, 844], [844, 390]]) {
    const base = gameCamera(width, height, run.player, run.level, true)
    const close = awakeningCamera(base, width, height, animation)
    assert.ok(close.zoom > base.zoom, 'the occupied pod gets a closer first view')
    const pod = entranceBounds(run.level.entrance)
    const left = (pod.x - close.x) * close.zoom, top = (pod.y - close.y) * close.zoom
    assert.ok(left >= 0 && left + pod.w * close.zoom <= width, 'the complete capsule stays in view')
    assert.ok(top >= 0 && top + pod.h * close.zoom <= height)
    for (let frame = 0; frame < AWAKENING_SECONDS / STEP; frame++) {
      const c = awakeningCamera(base, width, height, { ...animation, elapsed: frame * STEP })
      assert.ok((pod.y - c.y) * c.zoom >= 0, 'the top of the pod stays visible throughout the reveal')
      assert.ok((run.level.floor - c.y) * c.zoom < height, 'the landing floor stays visible throughout the reveal')
    }
    const almost = awakeningCamera(base, width, height, { ...animation, elapsed: AWAKENING_SECONDS - STEP })
    assert.ok(Math.abs(almost.zoom - base.zoom) < .001)
    assert.ok(Math.hypot(almost.x - base.x, almost.y - base.y) * base.zoom < .1)
    assert.deepEqual(awakeningCamera(base, width, height, { ...animation, elapsed: AWAKENING_SECONDS }), base)
    assert.deepEqual(awakeningCamera(base, width, height, { ...animation, kind: undefined }), base, 'ordinary entrances keep their framing')
  }
  assert.deepEqual(animation, before, 'framing never advances the sequence')
})

test('the studio selects the full pod shell while its validated physical start stays the ordinary clear footprint', () => {
  const level = opening(), bounds = entranceBounds(level.entrance)
  assert.deepEqual(itemOutline(level, { kind: 'entrance', index: 0 }), bounds)
  assert.deepEqual(hitItem(level, bounds.x + 3, bounds.y + 28, 0), { kind: 'entrance', index: 0 })
  assert.deepEqual(entranceDoor(level.entrance), { x: 180, y: 580, w: 40, h: 80 })
  assert.deepEqual(levelProblems(level), [])
})

test('the robot wakes inside the raised pod and can hop down to the room without a special movement rule', () => {
  const level = opening(), run = createRun(level)
  const plinth = level.platforms.find(platform => platform.name === 'Charging pod plinth')
  assert.equal(run.player.y, plinth.y)
  assert.ok(run.player.x > plinth.x && run.player.x < plinth.x + plinth.w)
  assert.equal(level.floor - plinth.y, 60)
  stepRun(run, NEUTRAL_INPUT, AWAKENING_SECONDS)
  for (let i = 0; i < 150; i++) stepRun(run, { ...NEUTRAL_INPUT, move: 1, jump: i < 8 })
  assert.ok(run.player.x > plinth.x + plinth.w)
  assert.equal(run.player.y, level.floor)
  assert.equal(run.player.grounded, true)
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
    assert.equal(run.elapsed, 0); assert.equal(run.grade, null)
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
