import test from 'node:test'
import assert from 'node:assert/strict'
import { readLevelAsset } from './helpers/jumping-fixtures.mjs'
import { parseLevel, levelProblems } from '../src/games/jumping/level.ts'
import { createRun, createPreviewRun, stepRun } from '../src/games/jumping/challenge.ts'
import { NEUTRAL_INPUT } from '../src/games/jumping/model.ts'
import { LightingState } from '../src/games/jumping/lightingModel.ts'
import { setObjectPower, setObjectSwitchLogic, setObjectSwitchReversed, setObjectRelay, setSwitchTargets, duplicateItem, deleteItem } from '../src/games/jumping/editor.ts'
import { editLight } from '../src/games/jumping/lightingEditor.ts'
import { copyForEditing } from '../src/games/jumping/puzzleEditor.ts'
import { resolveSwitchStates, switchSources } from '../src/games/jumping/switchPower.ts'

function fixture(logic, reversed) {
  const level = readLevelAsset('switch-modes.json')
  level.mechanisms.push({ id: 'hatch', kind: 'gate', orientation: 'horizontal', x: 1300, y: 500, w: 120, h: 20, travel: 120 })
  level.wallLights = [{ id: 'indicator', x: 400, y: 300 }]
  for (const item of [level.goal, ...level.mechanisms, ...level.lighting.lights, ...level.wallLights]) {
    if (logic !== undefined) item.switchLogic = logic
    if (reversed !== undefined) item.switchReversed = reversed
  }
  return level
}
const targets = level => [level.goal.id, ...level.mechanisms.map(m => m.id), ...level.lighting.lights.map(l => l.id), ...level.wallLights.map(l => l.id)]
const step = (run, frames = 24) => { for (let i = 0; i < frames; i++) stepRun(run, NEUTRAL_INPUT) }
function assertPowered(run, expected) {
  assert.equal(run.goalLit, expected, 'exit')
  assert.equal(run.switchStates.get('indicator'), expected, 'wall light')
  for (const mechanism of run.mechanisms) assert.equal(mechanism.active, expected, mechanism.definition.id)
  assert.equal(new LightingState().sources(run.level.lighting, run, 0)[0].fade,
    run.empRemaining > 0 ? 0 : Number(expected), 'spotlight')
}

for (const logic of [undefined, 'or', 'and', 'xor']) for (const reversed of [false, true]) test(`${logic ?? 'legacy OR'}, reversed ${reversed}: truth table with zero through three connected inputs`, () => {
  for (let connected = 0; connected <= 3; connected++) for (let mask = 0; mask < 2 ** connected; mask++) {
    const level = fixture(logic, reversed), ids = targets(level)
    level.triggers = Array.from({ length: connected }, (_, i) => ({ mode: 'weight', behavior: 'toggle', startsOn: !!(mask & 2 ** i),
      x: 300 + i * 160, y: 920, w: 100, targets: ids }))
    level.triggers.push({ mode: 'weight', behavior: 'toggle', startsOn: true, x: 1000, y: 920, w: 100, targets: [] })
    const active = level.triggers.slice(0, connected).filter(t => t.startsOn).length
    const normal = connected > 0 && (logic === 'and' ? active === connected : logic === 'xor' ? active === 1 : active > 0)
    const expected = reversed ? !normal : normal
    const restored = parseLevel(JSON.parse(JSON.stringify(level)))
    assert.deepEqual(restored, level)
    for (const create of [createRun, createPreviewRun]) {
      const run = create(restored); assertPowered(run, expected)
      run.started = true; step(run, 1); assertPowered(run, expected)
    }
  }
})

for (const logic of ['or', 'and', 'xor']) for (const reversed of [false, true]) test(`${logic}, reversed ${reversed}: pressure, toggle, coins, EMP and restart`, () => {
  const level = fixture(logic, reversed), ids = targets(level)
  level.triggers = [
    { mode: 'weight', x: 120, y: 920, w: 100, targets: ids },
    { mode: 'touch', behavior: 'toggle', x: 300, y: 920, w: 100, targets: ids },
    { mode: 'coins', x: 500, y: 100, w: 120, threshold: 1, targets: ids },
  ]
  level.pickups = [{ kind: 'coin', x: 500, y: 888 }]
  const run = createRun(parseLevel(level)); run.started = true
  const expectCount = count => {
    assert.equal(run.triggers.filter(t => t.active).length, count)
    const normal = logic === 'or' ? count > 0 : logic === 'and' ? count === 3 : count === 1
    assertPowered(run, reversed ? !normal : normal)
  }
  step(run); expectCount(1)
  run.player.x = 350; step(run); expectCount(1)
  run.player.x = 500; step(run); expectCount(2)
  run.player.x = 160; step(run); expectCount(3)
  run.empRemaining = 1
  const positions = run.mechanisms.map(m => [m.x, m.y])
  step(run); expectCount(2)
  assert.deepEqual(run.mechanisms.map(m => [m.x, m.y]), positions)
  step(run, 150); expectCount(3)
  run.player.x = 800; step(run); expectCount(2)
  run.player.x = 350; step(run); expectCount(1)
  assertPowered(createRun(level), reversed)
})

test('targets choose independent rules and count legacy single-target sources', () => {
  const level = fixture(), ids = targets(level)
  level.goal.switchLogic = 'and'; level.mechanisms[0].switchLogic = 'xor'
  level.mechanisms[2].switchLogic = 'and'; level.lighting.lights[0].switchLogic = 'xor'
  level.triggers = [true, true, false].map((startsOn, i) => ({ mode: 'weight', behavior: 'toggle', startsOn, x: 300 + i * 160, y: 920, w: 100, targets: ids }))
  level.triggers.push({ mode: 'touch', behavior: 'toggle', startsOn: true, x: 1000, y: 920, w: 100, target: 'gate' })
  const run = createRun(parseLevel(level))
  assert.equal(run.goalLit, false)
  assert.deepEqual(run.mechanisms.map(m => m.active), [false, true, false, true])
  assert.equal(new LightingState().sources(level.lighting, run, 0)[0].fade, 0)
  level.triggers[2].startsOn = true
  const all = createRun(parseLevel(level))
  assert.equal(all.goalLit, true); assert.equal(all.mechanisms[2].active, true)
  assert.equal(all.mechanisms[0].active, false, 'XOR remains off with three active inputs')
})

function relayFixture() {
  const level = fixture()
  // Deliberately wire from the last mechanism toward the first, then through
  // the lamp and exit: evaluation must not depend on collection order.
  Object.assign(level.mechanisms[3], { relay: true, switchLogic: 'and', targets: ['lift', 'platform'] })
  Object.assign(level.mechanisms[0], { relay: true, targets: ['lamp'] })
  Object.assign(level.mechanisms[1], { relay: true, targets: ['lamp'] })
  Object.assign(level.lighting.lights[0], { relay: true, switchLogic: 'xor', switchReversed: true, flicker: true, targets: ['exit'] })
  Object.assign(level.goal, { relay: true, targets: ['gate'] })
  level.triggers = [
    { mode: 'weight', x: 120, y: 920, w: 100, targets: ['hatch'] },
    { mode: 'weight', behavior: 'toggle', startsOn: true, x: 300, y: 920, w: 100, targets: ['hatch'] },
  ]
  return level
}

test('enabled relays settle immediately through mixed mechanisms, lights and exits, with fan-in and fan-out', () => {
  const level = parseLevel(relayFixture())
  assert.equal(switchSources(level).length, 7)
  for (const create of [createRun, createPreviewRun]) {
    const run = create(level)
    assert.deepEqual(run.mechanisms.map(m => m.active), [false, false, true, false])
    assert.equal(run.goalLit, true, 'reversed XOR with zero active relay inputs starts on')
    assert.equal(new LightingState().sources(level.lighting, run, 0)[0].fade, 1)
  }
  const run = createRun(level); run.started = true; step(run)
  assert.deepEqual(run.mechanisms.map(m => m.active), [true, true, true, true])
  assert.equal(run.goalLit, true, 'reversed XOR with two active relay inputs stays on')
  run.player.x = 500; step(run)
  assert.deepEqual(run.mechanisms.map(m => m.active), [false, false, true, false])
  run.empRemaining = 1; step(run)
  assert.equal(new LightingState().sources(level.lighting, run, 0)[0].fade, 0)
  assert.equal(run.goalLit, true, 'logical relay output is independent of lamp flicker and EMP fade')
  const reordered = structuredClone(level); reordered.mechanisms.reverse()
  assert.deepEqual(resolveSwitchStates(reordered, run.triggers), resolveSwitchStates(level, run.triggers))
})

test('Relay is opt-in; disabling it clears outputs, and incoming relay connections edit the same source', () => {
  let level = fixture()
  assert.equal(switchSources(level).length, 1)
  level = setObjectRelay(level, { kind: 'mechanism', index: 0 }, true)
  assert.equal(switchSources(level).length, 2)
  level = setSwitchTargets(level, { kind: 'mechanism', index: 0 }, ['exit', 'lamp', 'exit', 'unknown'])
  assert.deepEqual(level.mechanisms[0].targets, ['exit', 'lamp'])
  const off = setObjectRelay(level, { kind: 'mechanism', index: 0 }, false)
  assert.equal(switchSources(off).length, 1); assert.equal(off.mechanisms[0].targets, undefined)
  assert.equal(setSwitchTargets(off, { kind: 'mechanism', index: 0 }, ['exit']), off)
  assert.deepEqual(level.mechanisms[0].targets, ['exit', 'lamp'], 'source remains available for undo')
})

test('logic, reversal and relay wiring survive duplication, templates and portable files', () => {
  let level = relayFixture()
  level = setObjectSwitchLogic(level, { kind: 'goal', index: 0 }, 'xor')
  level = setObjectSwitchReversed(level, { kind: 'goal', index: 0 }, true)
  for (const selection of [{ kind: 'mechanism', index: 0 }, { kind: 'light', index: 0 }]) {
    const copy = duplicateItem(level, selection)
    const item = copy.selection.kind === 'light' ? copy.level.lighting.lights[copy.selection.index] : copy.level.mechanisms[copy.selection.index]
    const original = selection.kind === 'light' ? level.lighting.lights[selection.index] : level.mechanisms[selection.index]
    assert.equal(item.relay, true); assert.equal(item.switchLogic, original.switchLogic)
    assert.equal(item.switchReversed, original.switchReversed); assert.deepEqual(item.targets, original.targets)
    assert.notEqual(item.id, original.id); assert.deepEqual(parseLevel(copy.level), copy.level)
  }
  const template = copyForEditing(level)
  assert.deepEqual(parseLevel(JSON.parse(JSON.stringify(template))), template)
  assert.deepEqual(levelProblems(template), [])
  const originalIds = new Set(targets(level))
  for (const source of switchSources(template)) for (const id of source.definition.targets ?? []) assert.equal(originalIds.has(id), false)
  assert.equal(setObjectSwitchLogic(level, { kind: 'trigger', index: 0 }, 'and'), level)
  assert.equal(setObjectRelay(level, { kind: 'trigger', index: 0 }, true), level)
})

test('deletion and Always on clean relay inputs and outputs, preserving logic and reversal', () => {
  const level = relayFixture()
  for (const changed of [deleteItem(level, { kind: 'light', index: 0 }), setObjectPower(level, { kind: 'light', index: 0 }, 'always'), editLight(level, 0, { power: 'always' })]) {
    for (const source of switchSources(changed)) assert.equal(source.definition.targets?.includes('lamp') ?? false, false)
    assert.deepEqual(parseLevel(changed), changed)
    assert.deepEqual(levelProblems(changed), [])
    if (changed.lighting.lights.length) {
      assert.equal(changed.lighting.lights[0].relay, undefined); assert.equal(changed.lighting.lights[0].targets, undefined)
      assert.equal(changed.lighting.lights[0].switchLogic, 'xor'); assert.equal(changed.lighting.lights[0].switchReversed, true)
    }
  }
  const removed = deleteItem(level, { kind: 'mechanism', index: 0 })
  assert.deepEqual(removed.mechanisms[2].targets, ['platform'])
  assert.deepEqual(levelProblems(removed), [])
})

test('feedback loops report their named path and invalid previews stay editable', () => {
  for (const self of [false, true]) {
    const level = fixture()
    Object.assign(level.mechanisms[0], { relay: true, name: 'Relay A', targets: [self ? 'lift' : 'lamp'] })
    Object.assign(level.lighting.lights[0], { relay: true, name: 'Relay B', targets: ['lift'] })
    assert.throws(() => parseLevel(level), /Relay wiring loop:.*Relay A/)
    assert.match(levelProblems(level).join('\n'), /Relay wiring loop:.*Relay A/)
    if (!self) assert.match(levelProblems(level).join('\n'), /Relay A.*Relay B.*Relay A/)
    assert.doesNotThrow(() => createPreviewRun(level))
    assert.equal(createPreviewRun(level).mechanisms[0].active, false)
  }
})

test('versions 1 and 2 preserve omitted defaults and reject malformed switch and relay settings', () => {
  for (const version of [1, 2]) for (const logic of [undefined, 'or', 'and', 'xor']) {
    const level = fixture(logic); level.version = version
    if (version === 1) { delete level.lighting; level.triggers[0].targets = level.triggers[0].targets.filter(id => id !== 'lamp') }
    assert.deepEqual(parseLevel(level), level)
  }
  for (const patch of [{ switchLogic: null }, { switchLogic: 'OR' }, { switchLogic: 'invalid' }, { switchReversed: 1 }, { relay: 'true' },
    { relay: true, targets: null }, { relay: true, targets: ['exit', 'exit'] }, { relay: true, targets: ['missing'] }, { targets: ['exit'] },
    { power: 'always', relay: true }]) for (const kind of ['goal', 'mechanism', 'light']) {
    const level = fixture(), item = kind === 'goal' ? level.goal : kind === 'mechanism' ? level.mechanisms[0] : level.lighting.lights[0]
    Object.assign(item, patch); assert.throws(() => parseLevel(level), undefined, `${kind}: ${JSON.stringify(patch)}`)
  }
})
