import test from 'node:test'
import assert from 'node:assert/strict'
import { blankTrial, parseLevel, levelProblems, triggerTargets } from '../src/games/jumping/level.ts'
import { createRun, createPreviewRun, stepRun } from '../src/games/jumping/challenge.ts'
import { NEUTRAL_INPUT, STEP } from '../src/games/jumping/model.ts'
import { goalDoor, GOAL_OPEN_SECONDS } from '../src/games/jumping/goal.ts'
import { setObjectPower, setPlateBehavior, setTriggerTargets, duplicateItem, deleteItem, moveItem } from '../src/games/jumping/editor.ts'
import { placeOnSurface } from '../src/games/jumping/editorPlacement.ts'
import { copyForEditing } from '../src/games/jumping/puzzleEditor.ts'
import { switchedItems } from '../src/games/jumping/switchPower.ts'
import { JumpingAudioState } from '../src/games/jumping/audioState.ts'

const step = (run, frames = 1) => { for (let i = 0; i < frames; i++) stepRun(run, NEUTRAL_INPUT) }
function fixture(behavior = 'pressure', startsOn = false) {
  const level = blankTrial()
  level.goal = { ...level.goal, power: 'switched', id: 'exit' }
  level.mechanisms = [{ id: 'lift', kind: 'lift', x: 600, y: 900, w: 120, h: 20, travel: 240 }]
  level.triggers = [{ x: 120, y: 920, w: 100, mode: 'weight', behavior, ...(behavior === 'switch' || behavior === 'toggle' ? { startsOn } : {}), targets: ['exit', 'lift'] }]
  return level
}
const start = level => { const run = createRun(level); run.started = true; return run }

test('legacy exits start fully open without moving; legacy plates and lifts keep their behavior', () => {
  const level = fixture(); delete level.goal.id; delete level.goal.power; delete level.triggers[0].behavior
  level.triggers[0].targets = ['lift']
  const restored = parseLevel(JSON.parse(JSON.stringify(level)))
  assert.deepEqual(restored, level)
  for (const create of [createRun, createPreviewRun]) {
    const run = create(restored)
    assert.equal(run.goalLit, true); assert.equal(run.goalElapsed, GOAL_OPEN_SECONDS)
    assert.equal(run.mechanisms[0].active, false); assert.equal(run.triggers[0].active, false)
    step(run, 60); assert.equal(run.elapsed, 0); assert.equal(run.mechanisms[0].y, 900)
  }
  assert.deepEqual(goalDoor(restored.goal), goalDoor(level.goal))
})

test('Pressure is the default for both legacy contact modes and opens and closes a switched exit', () => {
  for (const mode of ['weight', 'touch']) {
    const level = fixture(); level.triggers[0].mode = mode; delete level.triggers[0].behavior
    const run = start(level)
    step(run, 17); assert.equal(run.goalLit, false, 'activation keeps the existing debounce')
    step(run, 50); assert.equal(run.goalLit, true); assert.equal(run.goalElapsed, GOAL_OPEN_SECONDS)
    run.player.x = 300; step(run)
    assert.equal(run.goalLit, false); assert.equal(run.mechanisms[0].active, false)
    step(run, 40); assert.equal(run.goalElapsed, 0)
    assert.equal(run.triggers[0].depression, 0)
    run.player.x = goalDoor(level.goal).x + 20; step(run, 5)
    assert.equal(run.exit, null, 'a closed exit cannot be entered')
  }
})

for (const startsOn of [false, true]) test(`Switch starts ${startsOn ? 'on' : 'off'}, changes once and stays depressed until restart`, () => {
  const level = parseLevel(fixture('switch', startsOn)), run = start(level)
  assert.equal(run.triggers[0].active, startsOn); assert.equal(run.goalLit, startsOn)
  assert.equal(run.mechanisms[0].active, startsOn)
  const preview = createPreviewRun(level)
  assert.equal(preview.triggers[0].active, startsOn); assert.equal(preview.triggers[0].depression, 0)
  assert.equal(preview.goalLit, startsOn)
  assert.equal(run.triggers[0].depression, 0)
  step(run, 17); assert.equal(run.triggers[0].active, startsOn, 'the first press keeps the existing debounce')
  step(run, 7); assert.equal(run.triggers[0].active, !startsOn)
  step(run, 60); assert.equal(run.triggers[0].active, !startsOn, 'holding keeps the changed state')
  run.player.x = 300; step(run, 60)
  assert.equal(run.triggers[0].pressed, false); assert.equal(run.triggers[0].depression, 1)
  assert.equal(run.goalLit, !startsOn); assert.equal(run.mechanisms[0].active, !startsOn)
  run.player.x = 160; step(run, 60); assert.equal(run.triggers[0].active, !startsOn)
  run.player.x = 300; step(run, 60); assert.equal(run.triggers[0].active, !startsOn)
  assert.equal(run.triggers[0].depression, 1)
  const fresh = createRun(level)
  assert.equal(fresh.triggers[0].active, startsOn); assert.equal(fresh.goalLit, startsOn)
  assert.equal(fresh.triggers[0].depression, 0)
})

for (const startsOn of [false, true]) test(`Toggle starts ${startsOn ? 'on' : 'off'}, changes once per press, and restores on restart`, () => {
  const level = fixture('toggle', startsOn), run = start(level)
  assert.equal(run.triggers[0].active, startsOn); assert.equal(run.goalLit, startsOn)
  assert.equal(run.mechanisms[0].active, startsOn)
  assert.equal(createPreviewRun(level).goalLit, startsOn)
  step(run, 24); assert.equal(run.triggers[0].active, !startsOn)
  step(run, 300); assert.equal(run.triggers[0].active, !startsOn, 'holding does not oscillate')
  run.player.x = 300; step(run, 24)
  assert.equal(run.triggers[0].active, !startsOn, 'release rearms without changing state')
  assert.equal(run.triggers[0].depression, 0)
  run.player.x = 160; step(run, 24); assert.equal(run.triggers[0].active, startsOn)
  assert.equal(createRun(level).triggers[0].active, startsOn)
})

test('multiple loads and a player-to-box handoff do not retrigger a Toggle plate', () => {
  const level = fixture('toggle')
  level.props = [{ kind: 'box', x: 195, y: 920, size: 30 }]
  const run = start(level); step(run, 24)
  assert.equal(run.triggers[0].active, true)
  run.player.x = 300; step(run, 120)
  assert.equal(run.triggers[0].pressed, true); assert.equal(run.triggers[0].active, true)
  run.player.x = 160; step(run, 24); assert.equal(run.triggers[0].active, true)
})

test('active switches combine with OR, including an initially on Toggle', () => {
  const level = fixture('pressure')
  level.triggers.push({ ...level.triggers[0], x: 300, behavior: 'toggle', startsOn: true })
  const run = start(level); step(run, 24)
  run.player.x = 500; step(run, 24); assert.equal(run.goalLit, true)
  run.player.x = 350; step(run, 24); assert.equal(run.goalLit, false)
  run.player.x = 160; step(run, 24); assert.equal(run.goalLit, true)
})

for (const behavior of ['switch', 'toggle']) for (const startsOn of [false, true]) test(`${behavior} starting ${startsOn ? 'on' : 'off'} retains its state through EMP without recording presses while unpowered`, () => {
  const run = start(fixture(behavior, startsOn)); step(run, 24)
  assert.equal(run.goalLit, !startsOn)
  run.empRemaining = 1; const y = run.mechanisms[0].y
  step(run, 60); assert.equal(run.triggers[0].active, !startsOn); assert.equal(run.mechanisms[0].y, y)
  run.player.x = 300; step(run, 1); run.player.x = 160; step(run, 10)
  run.player.x = 300; step(run, 49)
  assert.equal(run.empRemaining, 0); assert.equal(run.triggers[0].active, !startsOn)
  if (behavior === 'switch') assert.equal(run.triggers[0].depression, 1)
  step(run, 24); assert.equal(run.triggers[0].active, !startsOn)
  assert.equal(run.triggers[0].depression, behavior === 'switch' ? 1 : 0)
  run.player.x = 160; step(run, 24)
  assert.equal(run.triggers[0].active, behavior === 'switch' ? !startsOn : startsOn)
  assert.equal(run.goalLit, behavior === 'switch' ? !startsOn : startsOn)
})

for (const startsOn of [false, true]) test(`a fresh Switch starting ${startsOn ? 'on' : 'off'} waits for a powered press during EMP`, () => {
  const run = start(fixture('switch', startsOn)); run.empRemaining = 1
  step(run, 120); assert.equal(run.triggers[0].active, startsOn)
  assert.equal(run.triggers[0].depression, 0)
  step(run, 24); assert.equal(run.triggers[0].active, !startsOn)
  assert.equal(run.triggers[0].depression, 1)
})

test('coin switches can open an exit and its timer locks only when the player enters', () => {
  const level = fixture()
  level.triggers = [{ x: 400, y: 100, w: 120, mode: 'coins', threshold: 1, targets: ['exit'] }]
  level.pickups = [{ kind: 'coin', x: 160, y: 888 }]
  const run = start(level); step(run, 80)
  assert.equal(run.goalLit, true); assert.equal(run.exit, null); assert.equal(run.medal, null)
  const time = run.elapsed; step(run, 120); assert.ok(run.elapsed > time)
  run.player.x = goalDoor(level.goal).x + 20; step(run)
  assert.ok(run.exit); const locked = run.elapsed
  step(run, 120); assert.equal(run.finished, true); assert.equal(run.elapsed, locked)
})

for (const horizontal of [false, true]) test(`always-on ${horizontal ? 'platforms' : 'elevators'} cycle, wait for input, and resume after EMP`, () => {
  const level = fixture(); level.triggers = []; level.goal.power = 'always'
  level.mechanisms[0] = { ...level.mechanisms[0], power: 'always', ...(horizontal ? { orientation: 'horizontal', flipX: true } : {}) }
  const run = createRun(level), m = run.mechanisms[0]
  const position = () => horizontal ? m.x : m.y
  assert.equal(m.active, true); const original = position(); step(run, 60); assert.equal(position(), original)
  run.started = true; step(run, 120); assert.notEqual(position(), original)
  const direction = m.direction; step(run, 300); assert.notEqual(m.direction, direction)
  run.empRemaining = .5; const saved = structuredClone(m); step(run, 60); assert.deepEqual(m, saved)
  step(run, Math.ceil(saved.wait / STEP) + 60); assert.notEqual(position(), saved[horizontal ? 'x' : 'y'])
})

test('builder power settings clean both connection formats, expose only switched targets, and protect gates', () => {
  let level = fixture(); level.triggers.push({ ...level.triggers[0], targets: undefined, target: 'lift' })
  level = setObjectPower(level, { kind: 'mechanism', index: 0 }, 'always')
  assert.deepEqual(triggerTargets(level.triggers[0]), ['exit']); assert.deepEqual(triggerTargets(level.triggers[1]), [])
  assert.deepEqual(switchedItems(level).map(t => t.id), ['exit'])
  assert.deepEqual(triggerTargets(setTriggerTargets(level, 0, ['exit', 'lift', 'unknown']).triggers[0]), ['exit'])
  level = setObjectPower(level, { kind: 'goal', index: 0 }, 'always')
  assert.deepEqual(triggerTargets(level.triggers[0]), []); assert.equal(switchedItems(level).length, 0)
  level.mechanisms.push({ id: 'gate', kind: 'gate', x: 900, y: 740, w: 20, h: 180, travel: 180 })
  assert.equal(setObjectPower(level, { kind: 'mechanism', index: 1 }, 'always'), level)
  const switched = setObjectPower(blankTrial(), { kind: 'goal', index: 0 }, 'switched')
  assert.ok(switched.goal.id); assert.deepEqual(parseLevel(switched), switched)
})

test('plate settings, duplicates, templates, and portable files preserve state and remap every target', () => {
  for (const version of [1, 2]) for (const behavior of ['switch', 'toggle']) {
    let level = fixture(); level.version = version
    if (version === 2) level.lighting = { nightMode: true, ambient: 0, lights: [] }
    level = setPlateBehavior(level, 0, behavior, true)
    const copy = duplicateItem(level, { kind: 'trigger', index: 0 }).level
    assert.equal(copy.triggers[1].startsOn, true)
    const template = copyForEditing(copy)
    assert.notEqual(template.goal.id, copy.goal.id); assert.notEqual(template.mechanisms[0].id, copy.mechanisms[0].id)
    assert.deepEqual(triggerTargets(template.triggers[0]), [template.goal.id, template.mechanisms[0].id])
    assert.deepEqual(parseLevel(JSON.parse(JSON.stringify(template))), template)
    assert.deepEqual(levelProblems(template), [])
    const pressure = setPlateBehavior(template, 0, 'pressure')
    assert.equal(Object.hasOwn(pressure.triggers[0], 'startsOn'), false)
    assert.deepEqual(triggerTargets(deleteItem(template, { kind: 'mechanism', index: 0 }).triggers[0]), [template.goal.id])
  }
})

test('shared-file validation rejects malformed behaviors, power states and colliding exit IDs', () => {
  for (const patch of [{ behavior: 'invalid' }, { behavior: null }, { behavior: 'toggle', startsOn: 1 },
    { behavior: 'pressure', startsOn: true }, { behavior: 'switch', startsOn: 1 },
    { behavior: 'switch', startsOn: 'false' }, { behavior: 'switch', startsOn: null }]) {
    const level = fixture(); Object.assign(level.triggers[0], patch); assert.throws(() => parseLevel(level))
  }
  for (const patch of [{ power: 'invalid' }, { power: null }, { id: '' }, { id: 'lift' }, { id: undefined }]) {
    const level = fixture(); Object.assign(level.goal, patch); assert.throws(() => parseLevel(level))
  }
  for (const patch of [{ power: 'invalid' }, { kind: 'gate', power: 'always' }]) {
    const level = fixture(); Object.assign(level.mechanisms[0], patch); assert.throws(() => parseLevel(level))
  }
  const coins = fixture(); coins.triggers = [{ mode: 'coins', x: 400, y: 100, w: 120, threshold: 1, targets: [], behavior: 'toggle' }]
  assert.throws(() => parseLevel(coins))
})

test('the removed goal plate needs no support; an exit on a narrow landing places and moves safely', () => {
  const level = blankTrial(); level.goal = { x: 800, y: 500 }
  level.platforms = [{ x: 830, y: 500, w: 100, h: 20 }]
  assert.deepEqual(levelProblems(level), [])
  const raised = { ...level, goal: { ...level.goal, y: 480 } }
  assert.equal(placeOnSurface(raised, { kind: 'goal', index: 0 }).goal.y, 500)
  const carried = moveItem(level, { kind: 'platform', index: 0 }, 40, -40)
  assert.deepEqual(carried.goal, { x: 840, y: 460 }, 'the visible assembly follows its support even when its origin is outside it')
  assert.deepEqual(levelProblems(carried), [])
  const moved = moveItem(level, { kind: 'goal', index: 0 }, -10000, 0)
  assert.equal(moved.goal.x, 0); assert.deepEqual(parseLevel(moved), moved)
})

for (const behavior of ['switch', 'toggle']) test(`${behavior} off emits one switch cue and a restored initial state is quiet`, () => {
  const level = fixture(behavior, true), run = start(level), audio = new JumpingAudioState()
  audio.reset(run.player, run); audio.step(run.player, run, STEP); assert.deepEqual(audio.drain().cues, [])
  step(run, 24); audio.step(run.player, run, STEP)
  assert.deepEqual(audio.drain().cues.map(c => c.kind), ['switch'])
  step(run, 60); audio.step(run.player, run, STEP); assert.deepEqual(audio.drain().cues, [])
})
