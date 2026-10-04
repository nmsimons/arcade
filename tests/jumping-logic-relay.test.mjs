import test from 'node:test'
import assert from 'node:assert/strict'
import { readLevelAsset } from './helpers/jumping-fixtures.mjs'
import { blankTrial, copyLevel, parseLevel, levelProblems } from '../src/games/jumping/level.ts'
import { createRun, createPreviewRun, stepRun } from '../src/games/jumping/challenge.ts'
import { NEUTRAL_INPUT } from '../src/games/jumping/model.ts'
import { resolveSwitchStates, switchSources } from '../src/games/jumping/switchPower.ts'
import { addItem, allSelections, duplicateItem, deleteItem, hitItem, itemBounds, moveItem, renameItem, resizeLevelHeight, setObjectRelay, setObjectPower, setObjectSwitchLogic, setObjectSwitchReversed, setSwitchTargets } from '../src/games/jumping/editor.ts'
import { copySelections, pasteSelections, moveSelections, selectionsInRect } from '../src/games/jumping/editorSelection.ts'
import { copyForEditing } from '../src/games/jumping/puzzleEditor.ts'
import { editorSolids } from '../src/games/jumping/editorGeometry.ts'
import { LightingState } from '../src/games/jumping/lightingModel.ts'
import { lightingForLevel } from '../src/games/jumping/lightingDefinition.ts'
import { drawPuzzleWorld } from '../src/games/jumping/challengeRender.ts'

const fixture = () => readLevelAsset('logic-relay-exclusive.json')
const selection = { kind: 'logic-relay', index: 0 }
const tick = (run, frames = 24) => { for (let i = 0; i < frames; i++) stepRun(run, NEUTRAL_INPUT) }

test('one logic relay gives five exclusive lights for all 32 input combinations, in play and preview', () => {
  for (const version of [1, 2]) for (let mask = 0; mask < 32; mask++) {
    const level = fixture(); level.version = version
    if (version === 2) level.lighting = { nightMode: false, ambient: 0, lights: [] }
    level.triggers.forEach((t, i) => Object.assign(t, { behavior: 'toggle', startsOn: !!(mask & 2 ** i) }))
    const pressed = level.triggers.filter(t => t.startsOn).length
    const restored = parseLevel(JSON.parse(JSON.stringify(level)))
    assert.deepEqual(restored, level); assert.deepEqual(levelProblems(restored), [])
    for (const create of [createRun, createPreviewRun]) {
      const run = create(restored)
      for (const afterStep of [false, true]) {
        if (afterStep) { run.started = true; tick(run, 1) }
        assert.equal(run.switchStates.get('one-button'), pressed === 1)
        level.wallLights.forEach((l, i) => assert.equal(run.switchStates.get(l.id), pressed === 1 && level.triggers[i].startsOn, `${l.id}: mask ${mask}`))
      }
    }
  }
})

test('pressure contacts, competing loads, EMP and restart use the existing switch rules', () => {
  const level = fixture(); level.props = [{ kind: 'box', x: 610, y: 920, size: 60 }]
  const run = createRun(parseLevel(level)); run.started = true; tick(run)
  assert.equal(run.switchStates.get('light-2'), true)
  run.player.x = 370; tick(run)
  assert.equal(run.triggers.filter(t => t.active).length, 2)
  assert.ok(level.wallLights.every(l => !run.switchStates.get(l.id)))
  run.player.x = 480; tick(run)
  assert.equal(run.switchStates.get('light-2'), true)
  run.empRemaining = 1; tick(run)
  assert.equal(run.switchStates.get('one-button'), false)
  tick(run, 150); assert.equal(run.switchStates.get('light-2'), true)
  const restarted = createRun(level)
  assert.equal(restarted.switchStates.get('one-button'), false)
  restarted.started = true; tick(restarted); assert.equal(restarted.switchStates.get('light-2'), true)
})

test('pure logic chains settle in one evaluation, including reversal, physical relays and unconnected inputs', () => {
  const level = fixture()
  level.goal = { ...level.goal, id: 'exit', power: 'switched' }
  level.logicRelays = [
    { id: 'last', x: 800, y: 200, switchLogic: 'and', targets: ['exit'] },
    { id: 'inverter', x: 600, y: 200, switchReversed: true, targets: ['last'] },
    { id: 'first', x: 400, y: 200, switchLogic: 'xor', targets: ['inverter', 'light-1'] },
    { id: 'constant', x: 1000, y: 200, switchReversed: true, targets: ['last'] },
  ]
  Object.assign(level.wallLights[0], { switchLogic: 'or', relay: true, targets: ['light-2'] })
  level.triggers = level.triggers.slice(0, 2).map(t => ({ ...t, targets: ['first'] }))
  const restored = parseLevel(level)
  for (const mask of [0, 1, 2, 3]) {
    const triggers = [0, 1].map(i => ({ active: !!(mask & 2 ** i) }))
    const states = resolveSwitchStates(restored, triggers), first = mask === 1 || mask === 2
    assert.equal(states.get('first'), first); assert.equal(states.get('inverter'), !first)
    assert.equal(states.get('exit'), !first); assert.equal(states.get('constant'), true)
    assert.equal(states.get('light-2'), first)
    const reordered = copyLevel(restored); reordered.logicRelays.reverse()
    assert.deepEqual(resolveSwitchStates(reordered, triggers), states)
  }
})

test('logic relays place, select, move, duplicate, rename and always expose outputs', () => {
  const placed = addItem(blankTrial(), 'logic-relay', { x: 400, y: 300 }, { x: 400, y: 300 })
  assert.equal(placed.level.version, 1); assert.equal(placed.level.lighting, undefined)
  assert.deepEqual(placed.selection, selection)
  assert.ok(allSelections(placed.level).some(s => s.kind === 'logic-relay'))
  assert.deepEqual(hitItem(placed.level, 400, 300, 2), selection)
  assert.deepEqual(selectionsInRect(placed.level, { x: 390, y: 290, w: 20, h: 20 }), [selection])
  let level = renameItem(placed.level, selection, 'Exactly one')
  level = setObjectSwitchLogic(level, selection, 'xor'); level = setObjectSwitchReversed(level, selection, true)
  level.wallLights = [{ id: 'lamp', x: 500, y: 300 }]
  level = setSwitchTargets(level, selection, ['lamp'])
  assert.equal(switchSources(level).length, 1)
  assert.equal(setObjectRelay(level, selection, false), level)
  assert.equal(setObjectPower(level, selection, 'always'), level)
  const moved = moveItem(level, selection, 40, 60)
  assert.deepEqual(itemBounds(moved, selection), { x: 410, y: 340, w: 60, h: 40 })
  assert.equal(resizeLevelHeight(level, 1020).logicRelays[0].y, 400)
  const group = moveSelections(level, [selection, { kind: 'wall-light', index: 0 }], 40, 60)
  assert.deepEqual([group.logicRelays[0].x, group.logicRelays[0].y], [440, 360])
  const copy = duplicateItem(level, selection)
  assert.notEqual(copy.level.logicRelays[1].id, level.logicRelays[0].id)
  assert.deepEqual(copy.level.logicRelays[1].targets, ['lamp'])
  assert.equal(copy.level.logicRelays[1].name, 'Exactly one')
  for (const candidate of [level, moved, group, copy.level]) assert.deepEqual(parseLevel(candidate), candidate)
  const terrain = copyLevel(level); terrain.platforms.push({ x: 350, y: 250, w: 100, h: 100 })
  assert.deepEqual(hitItem(terrain, 400, 300, 2), selection, 'studio nodes stay selectable over world objects')
})

test('templates and copied groups remap relay inputs and outputs; deletion cleans all source kinds', () => {
  const level = fixture(), template = copyForEditing(level)
  assert.notEqual(template.logicRelays[0].id, level.logicRelays[0].id)
  assert.equal(template.triggers[0].targets[0], template.logicRelays[0].id)
  assert.deepEqual(template.logicRelays[0].targets, template.wallLights.map(l => l.id))
  const clipboard = copySelections(level, [selection, { kind: 'trigger', index: 0 }, { kind: 'wall-light', index: 0 }])
  const pasted = pasteSelections(level, clipboard, 0, -80).level
  assert.deepEqual(pasted.triggers[5].targets, [pasted.logicRelays[1].id, pasted.wallLights[5].id])
  assert.deepEqual(pasted.logicRelays[1].targets, [pasted.wallLights[5].id, ...level.wallLights.slice(1).map(l => l.id)])
  const foreign = pasteSelections(blankTrial(), clipboard, 0, -80).level
  assert.deepEqual(foreign.logicRelays[0].targets, [foreign.wallLights[0].id])
  for (const candidate of [template, pasted, foreign]) assert.deepEqual(parseLevel(candidate), candidate)
  level.logicRelays.push({ id: 'upstream', x: 800, y: 500, targets: ['one-button'] })
  Object.assign(level.wallLights[0], { relay: true, targets: ['upstream'] })
  const removed = deleteItem(level, { kind: 'logic-relay', index: 1 })
  assert.deepEqual(removed.wallLights[0].targets, [])
  const last = deleteItem(removed, selection)
  assert.ok(last.triggers.every(t => !t.targets.includes('one-button')))
  assert.deepEqual(parseLevel(last), last)
})

test('logic relays add no colliders, emitted lights, or playable artwork', () => {
  const level = fixture(), without = copyLevel(level); delete without.logicRelays
  assert.deepEqual(editorSolids(level), editorSolids(without))
  const run = createRun(level), baseline = createRun(without)
  assert.deepEqual(run.platforms, baseline.platforms)
  assert.deepEqual(new LightingState().sources(lightingForLevel(level), run, 0), [])
  const draws = candidate => {
    const events = []
    const ctx = new Proxy({ canvas: { width: 1800, height: 920 }, getTransform: () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }),
      measureText: () => ({ width: 20 }), createLinearGradient: () => ({ addColorStop() {} }) }, {
      get(target, key) { return key in target ? target[key] : (...args) => events.push([key, ...args]) },
    })
    drawPuzzleWorld(ctx, candidate, false, undefined, undefined, [], 'wall')
    return events
  }
  assert.deepEqual(draws(run), draws(baseline))
})

test('relay imports reject malformed fields, duplicate IDs, excess nodes and invalid wiring', () => {
  for (const patch of [{ id: '' }, { id: 'light-1' }, { x: 0 }, { y: 920 }, { switchLogic: 'bad' }, { switchReversed: 1 },
    { relay: false }, { power: 'always' }, { targets: ['missing'] }, { targets: ['light-1', 'light-1'] }]) {
    const level = fixture(); Object.assign(level.logicRelays[0], patch)
    assert.throws(() => parseLevel(level), undefined, JSON.stringify(patch))
  }
  const limit = fixture(); limit.logicRelays = Array.from({ length: 40 }, (_, i) => ({ id: `relay-${i}`, x: 400, y: 300 }))
  limit.triggers.forEach(t => { t.targets = [] })
  assert.doesNotThrow(() => parseLevel(limit))
  assert.throws(() => addItem(limit, 'logic-relay', { x: 400, y: 300 }, { x: 400, y: 300 }), /40 logic relays/)
  assert.equal(duplicateItem(limit, selection), null)
  limit.logicRelays.push({ id: 'overflow', x: 400, y: 300 }); assert.throws(() => parseLevel(limit))
  const duplicate = fixture(); duplicate.logicRelays[0].id = duplicate.wallLights[0].id
  assert.match(levelProblems(duplicate).join(), /unique IDs/)
  const goal = fixture(); goal.goal.id = 'one-button'; assert.match(levelProblems(goal).join(), /unique ID/)
})

test('pure and mixed relay loops name their path and fail safely in previews', () => {
  for (const mixed of [false, true]) {
    const level = fixture()
    level.logicRelays[0].targets = [mixed ? 'light-1' : 'one-button']
    if (mixed) Object.assign(level.wallLights[0], { relay: true, targets: ['one-button'] })
    assert.throws(() => parseLevel(level), /Relay wiring loop:.*Exactly one/)
    assert.match(levelProblems(level).join(), /Relay wiring loop/)
    const run = createPreviewRun(level)
    assert.equal(run.switchStates.get('one-button') ?? false, false)
    assert.ok(level.wallLights.every(l => !run.switchStates.get(l.id)))
  }
})
