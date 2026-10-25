import test from 'node:test'
import assert from 'node:assert/strict'
import { blankTrial, copyLevel, levelProblems, parseLevel } from '../src/games/jumping/level.ts'
import { createRun, stepRun } from './helpers/jumping-active-run.mjs'
import { createPreviewRun, createRun as createInitialRun } from '../src/games/jumping/challenge.ts'
import { NEUTRAL_INPUT } from '../src/games/jumping/model.ts'
import { addPlateToggleGroup, deleteToggleGroup, renameToggleGroup, setPlateToggleGroup } from '../src/games/jumping/toggleGroupEditor.ts'
import { setPlateBehavior, duplicateItem, deleteItem } from '../src/games/jumping/editor.ts'
import { copySelections, pasteSelections } from '../src/games/jumping/editorSelection.ts'
import { copyForEditing } from '../src/games/jumping/puzzleEditor.ts'
import { resolveSwitchStates } from '../src/games/jumping/switchPower.ts'
import { triggerStartsOn, withTriggerActive } from '../src/games/jumping/toggleGroups.ts'
import { JumpingAudioState } from '../src/games/jumping/audioState.ts'

function fixture(startsOn = false) {
  const level = blankTrial()
  level.goal = { ...level.goal, id: 'exit', power: 'switched' }
  level.toggleGroups = [{ id: 'doors', name: 'Doors', startsOn }]
  level.triggers = [120, 400, 700].map(x => ({ mode: 'weight', behavior: 'toggle', toggleGroup: 'doors', x, y: 920, w: 100, targets: ['exit'] }))
  return level
}
function step(run, seconds = .3, fps = 120) {
  for (let i = 0; i < Math.ceil(seconds * fps); i++) stepRun(run, NEUTRAL_INPUT, 1 / fps)
}
const states = run => run.triggers.map(t => t.active)

for (const fps of [30, 120]) for (const startsOn of [false, true]) test(`shared toggles starting ${startsOn} synchronize, rearm and restart at ${fps} Hz`, () => {
  const level = parseLevel(fixture(startsOn)), run = createRun(level)
  for (const create of [createInitialRun, createPreviewRun]) {
    const initial = create(level)
    assert.deepEqual(states(initial), [startsOn, startsOn, startsOn])
    assert.equal(initial.goalLit, startsOn)
  }
  step(run, .1, fps); assert.deepEqual(states(run), [startsOn, startsOn, startsOn], 'debounce remains physical')
  step(run, .2, fps); assert.deepEqual(states(run), [!startsOn, !startsOn, !startsOn])
  assert.equal(run.goalLit, !startsOn)
  assert.ok(run.triggers[0].depression > .99)
  assert.equal(run.triggers[1].depression, 0, 'remote indicator does not depress the plate')
  step(run, 1, fps); assert.deepEqual(states(run), [!startsOn, !startsOn, !startsOn], 'holding never repeats')
  run.player.x = 450; step(run, .3, fps)
  assert.deepEqual(states(run), [startsOn, startsOn, startsOn], 'a second member reverses the whole group')
  run.player.x = 750; step(run, .3, fps)
  assert.deepEqual(states(run), [!startsOn, !startsOn, !startsOn])
  run.player.x = 160; step(run, .3, fps)
  assert.deepEqual(states(run), [startsOn, startsOn, startsOn], 'a released member rearms')
  assert.equal(run.toggleGroupStates.get('doors'), startsOn)
  assert.deepEqual(states(createRun(level)), [startsOn, startsOn, startsOn])
})

test('simultaneous loads flip a group once, and a held member does not block another press', () => {
  const level = fixture()
  level.props = [{ kind: 'box', x: 450, y: 920, size: 40 }]
  const run = createRun(level)
  step(run)
  assert.deepEqual(run.triggers.map(t => t.pressed), [true, true, false])
  assert.deepEqual(states(run), [true, true, true], 'two simultaneous edges are one action')
  run.player.x = 750; step(run)
  assert.equal(run.triggers[1].pressed, true, 'the box keeps its own member held')
  assert.deepEqual(states(run), [false, false, false], 'the newly pressed member can switch off')
  step(run, 1); assert.deepEqual(states(run), [false, false, false])
})

test('EMP preserves shared state without queuing released presses', () => {
  const run = createRun(fixture())
  step(run); assert.deepEqual(states(run), [true, true, true])
  run.empRemaining = 1
  run.player.x = 450; step(run, .8)
  assert.deepEqual(states(run), [true, true, true])
  run.player.x = 1100; step(run, .4)
  assert.deepEqual(states(run), [true, true, true], 'an unpowered, released press is not queued')
  run.player.x = 450; step(run)
  assert.deepEqual(states(run), [false, false, false])
})

test('a fresh grouped press held through EMP waits for powered debounce, like an independent toggle', () => {
  const run = createRun(fixture())
  run.empRemaining = 1
  step(run, 1); assert.deepEqual(states(run), [false, false, false])
  step(run, .1); assert.deepEqual(states(run), [false, false, false])
  step(run, .2); assert.deepEqual(states(run), [true, true, true])
})

test('other groups and independent toggles keep their own state', () => {
  const level = fixture()
  level.toggleGroups.push({ id: 'lights', name: 'Lights', startsOn: true })
  level.triggers[1].toggleGroup = 'lights'
  delete level.triggers[2].toggleGroup
  level.triggers[2].startsOn = false
  const run = createRun(level); step(run)
  assert.deepEqual(states(run), [true, true, false])
  run.player.x = 450; step(run); assert.deepEqual(states(run), [true, false, false])
  run.player.x = 750; step(run); assert.deepEqual(states(run), [true, false, true])
})

for (const logic of ['or', 'and', 'xor']) test(`a shared group is one ${logic.toUpperCase()} input, regardless of how many members are wired`, () => {
  const level = fixture(true)
  level.goal.switchLogic = logic
  let run = createRun(level)
  assert.equal(run.goalLit, true)
  step(run); assert.equal(run.goalLit, false)
  level.triggers.push({ mode: 'touch', behavior: 'toggle', startsOn: true, x: 1000, y: 920, w: 100, targets: ['exit'] })
  run = createRun(level)
  assert.equal(run.goalLit, logic !== 'xor', 'another independent signal is still counted')
  step(run); assert.equal(run.goalLit, logic !== 'and')
})

test('each member drives its own connections and bot predictions include the entire group', () => {
  const level = fixture()
  level.wallLights = [{ id: 'a', x: 300, y: 600 }, { id: 'b', x: 700, y: 600 }]
  level.triggers[0].targets = ['a']; level.triggers[1].targets = ['b']
  const run = createRun(level)
  const predicted = resolveSwitchStates(level, withTriggerActive(level, run.triggers, 0, true))
  assert.equal(predicted.get('a'), true); assert.equal(predicted.get('b'), true)
  step(run)
  assert.deepEqual(run.switchStates, predicted)
  run.player.x = 450; step(run)
  assert.equal(run.switchStates.get('a'), false); assert.equal(run.switchStates.get('b'), false)
})

test('only a newly pressed member emits a shared-toggle click', () => {
  const level = fixture()
  level.goal.power = 'always'; level.triggers.forEach(t => { t.targets = [] })
  const run = createRun(level), audio = new JumpingAudioState()
  audio.reset(run.player, run)
  const cues = []
  for (let i = 0; i < 36; i++) {
    stepRun(run, NEUTRAL_INPUT); audio.step(run.player, run, 1 / 120)
    cues.push(...audio.drain().cues.filter(c => c.kind === 'switch'))
  }
  assert.equal(cues.length, 1)
})

test('editor creation, renaming, joining, shared Starts and leaving have one saved source of truth', () => {
  let level = fixture(true); delete level.toggleGroups
  level.triggers.forEach(t => { delete t.toggleGroup; t.startsOn = true })
  level = addPlateToggleGroup(level, 0)
  const id = level.toggleGroups[0].id
  level = renameToggleGroup(level, id, '  Main doors  ')
  level = setPlateToggleGroup(level, 1, id)
  assert.equal(level.toggleGroups[0].name, 'Main doors')
  assert.equal(level.triggers[0].startsOn, undefined); assert.equal(level.triggers[1].startsOn, undefined)
  level = setPlateBehavior(level, 1, 'toggle', false)
  assert.equal(triggerStartsOn(level, level.triggers[0]), false)
  assert.equal(triggerStartsOn(level, level.triggers[1]), false)
  assert.equal(triggerStartsOn(level, level.triggers[2]), true)
  const left = setPlateToggleGroup(level, 1, null)
  assert.equal(left.triggers[1].toggleGroup, undefined); assert.equal(left.triggers[1].startsOn, false)
  assert.equal(left.triggers[0].toggleGroup, id)
  const pressure = setPlateBehavior(level, 1, 'pressure')
  assert.equal(pressure.triggers[1].toggleGroup, undefined); assert.equal(pressure.triggers[1].startsOn, undefined)
  const deleted = deleteToggleGroup(level, id)
  assert.equal(deleted.toggleGroups, undefined)
  assert.deepEqual(deleted.triggers.map(t => t.startsOn), [false, false, true])
  assert.deepEqual(parseLevel(level), level)
  assert.deepEqual(levelProblems(level), [])
})

test('duplicates and same-level pastes share membership; cross-level pastes and templates remap groups', () => {
  const level = fixture(true), selection = { kind: 'trigger', index: 0 }
  const duplicate = duplicateItem(level, selection).level
  assert.equal(duplicate.triggers[3].toggleGroup, 'doors')
  const clipboard = copySelections(level, [selection, { kind: 'trigger', index: 1 }])
  const same = pasteSelections(level, clipboard, 0, 0).level
  assert.equal(same.toggleGroups.length, 1)
  assert.deepEqual(same.triggers.map(t => t.toggleGroup), Array(5).fill('doors'))
  const destination = fixture(false)
  destination.id = 'another-level'
  const pasted = pasteSelections(destination, clipboard, 0, 0).level
  assert.equal(pasted.toggleGroups.length, 2)
  const copiedId = pasted.triggers[3].toggleGroup
  assert.notEqual(copiedId, 'doors'); assert.equal(pasted.triggers[4].toggleGroup, copiedId)
  assert.equal(pasted.toggleGroups[1].startsOn, true)
  assert.notEqual(pasted.toggleGroups[0].name, pasted.toggleGroups[1].name)
  const template = copyForEditing(level)
  assert.notEqual(template.toggleGroups[0].id, 'doors')
  assert.ok(template.triggers.every(t => t.toggleGroup === template.toggleGroups[0].id))
  assert.deepEqual(parseLevel(template), template)
  const deleted = deleteItem(level, selection)
  assert.deepEqual(deleted.triggers.map(t => t.toggleGroup), ['doors', 'doors'])
  assert.equal(level.triggers.length, 3, 'source is unchanged')
})

for (const version of [1, 2]) test(`version ${version} round-trips groups and rejects malformed or conflicting state`, () => {
  const level = fixture(true); level.version = version
  if (version === 2) level.lighting = { nightMode: false, ambient: 0, lights: [] }
  assert.deepEqual(parseLevel(JSON.parse(JSON.stringify(level))), level)
  const invalidGroups = [null, {}, Array(41).fill(level.toggleGroups[0]),
    [level.toggleGroups[0], level.toggleGroups[0]], [{ id: '', name: 'Doors' }],
    [{ id: 'doors', name: '' }], [{ id: 'doors', name: 'a'.repeat(81) }],
    [{ id: 'a'.repeat(101), name: 'Doors' }], [{ id: 'doors', name: 'Doors', startsOn: 1 }]]
  for (const groups of invalidGroups) {
    const invalid = copyLevel(level); invalid.toggleGroups = groups
    assert.throws(() => parseLevel(invalid))
  }
  for (const patch of [{ toggleGroup: null }, { toggleGroup: 'missing' }, { toggleGroup: 1 },
    { startsOn: true }, { behavior: 'pressure' }, { behavior: 'switch' }, { mode: 'coins', threshold: 1 }]) {
    const invalid = copyLevel(level); Object.assign(invalid.triggers[0], patch)
    assert.throws(() => parseLevel(invalid))
  }
})
