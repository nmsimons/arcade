import test from 'node:test'
import assert from 'node:assert/strict'
import { blankTrial, parseLevel, levelProblems } from '../src/games/jumping/level.ts'
import { createRun, createPreviewRun, stepRun } from './helpers/jumping-active-run.mjs'
import { NEUTRAL_INPUT } from '../src/games/jumping/model.ts'
import { createFloatSwitch, floatBallCenter, floatSwitchBounds, updateFloatSwitch } from '../src/games/jumping/floatSwitch.ts'
import { resolveSwitchStates, switchSources } from '../src/games/jumping/switchPower.ts'
import { addItem, allSelections, deleteItem, duplicateItem, editFloatSwitch, hitItem, itemBounds, moveItem, renameItem, resizeLevelHeight, setSwitchTargets } from '../src/games/jumping/editor.ts'
import { copySelections, pasteSelections } from '../src/games/jumping/editorSelection.ts'
import { copyForEditing } from '../src/games/jumping/puzzleEditor.ts'

function fixture(medium = 'dry', patch = {}) {
  const level = blankTrial()
  level.floatSwitches = [{ id: 'float', x: 400, y: 600, armLength: 100, size: 40, targets: ['lamp'], ...patch }]
  level.wallLights = [{ id: 'lamp', x: 750, y: 450 }]
  if (medium !== 'dry') level.gravityPlates = [{ id: 'field', x: 250, y: 400, w: 500, h: 500, gravity: -1,
    ...(medium === 'water' ? { effect: 'water' } : { power: 'always' }) }]
  return level
}
function advance(run, seconds = 3) {
  run.started = true
  for (let i = 0; i < seconds * 120; i++) {
    stepRun(run, NEUTRAL_INPUT)
    for (const f of run.floatSwitches) {
      const d = f.definition, center = { x: f.prop.x, y: f.prop.y - f.prop.size / 2 }
      assert.ok(Math.abs(Math.hypot(center.x - d.x, center.y - d.y) - d.armLength) < .02, 'rigid arm length')
      const angle = Math.atan2(center.y - d.y, (d.flipX ? -1 : 1) * (center.x - d.x)) * 180 / Math.PI
      assert.ok(Math.abs(angle) <= (d.travelAngle ?? 45) + .02, 'travel stops')
    }
  }
}

test('float contact has hysteresis, Raised/Lowered polarity and Pressure-style EMP suppression', () => {
  const state = createFloatSwitch(fixture().floatSwitches[0])
  for (const centerY of [599, 600, 601, 596]) { state.prop.y = centerY + 20; updateFloatSwitch(state, true); assert.equal(state.active, false) }
  state.prop.y = 610; updateFloatSwitch(state, true); assert.equal(state.active, true)
  for (const centerY of [600, 601, 604]) { state.prop.y = centerY + 20; updateFloatSwitch(state, true); assert.equal(state.active, true) }
  updateFloatSwitch(state, false); assert.equal(state.active, false); assert.equal(state.raised, true)
  updateFloatSwitch(state, true); assert.equal(state.active, true)
  state.prop.y = 626; updateFloatSwitch(state, true); assert.equal(state.active, false)
  state.definition.activeWhen = 'lowered'; updateFloatSwitch(state, true); assert.equal(state.active, true)
  updateFloatSwitch(state, false); assert.equal(state.active, false)
})

for (const medium of ['water', 'gravity']) for (const flipX of [false, true]) {
  test(`${medium} physically raises a ${flipX ? 'left' : 'right'} float and powers its lamp`, () => {
    const level = parseLevel(fixture(medium, { flipX })), run = createRun(level), initial = run.floatSwitches[0].prop.y
    assert.equal(run.switchStates.get('lamp'), false)
    advance(run)
    assert.ok(run.floatSwitches[0].prop.y < initial - 100)
    assert.equal(run.floatSwitches[0].active, true); assert.equal(run.switchStates.get('lamp'), true)
    assert.equal(level.floatSwitches[0].startsRaised, undefined, 'authored initial state remains unchanged')
    assert.equal(createRun(level).switchStates.get('lamp'), false, 'restart restores starting position')
  })
}

test('a raised dry float drops through gravity and activates the Lowered output', () => {
  const run = createRun(parseLevel(fixture('dry', { startsRaised: true, activeWhen: 'lowered' })))
  assert.equal(run.switchStates.get('lamp'), false)
  advance(run)
  assert.equal(run.switchStates.get('lamp'), true)
  assert.ok(run.floatSwitches[0].prop.y - 20 > 650)
})

test('terrain can obstruct the ball before it reaches the activation threshold', () => {
  const level = fixture('gravity')
  level.platforms = [{ x: 430, y: 570, w: 180, h: 20 }]
  const run = createRun(parseLevel(level)); advance(run)
  assert.ok(run.floatSwitches[0].prop.y - 20 >= 609.9, 'ball stays beneath the real underside')
  assert.equal(run.switchStates.get('lamp'), false)
})

test('a heavy crate can lower the float while the grav lift remains powered', () => {
  const level = fixture('gravity', { startsRaised: true })
  // The float is lifted while much of the crate remains outside the field.
  // A crate completely inside reverse gravity rises too; weight alone is not a brake.
  Object.assign(level.gravityPlates[0], { y: 586, h: 314 })
  const c = floatBallCenter(level.floatSwitches[0])
  level.props = [{ kind: 'box', x: c.x + 10, y: c.y - 20, size: 80, weight: 'heavy' }]
  const run = createRun(parseLevel(level))
  assert.equal(run.switchStates.get('lamp'), true)
  advance(run, 2)
  assert.equal(run.switchStates.get('lamp'), false)
  assert.ok(run.floatSwitches[0].prop.y - 20 > 610, 'load moves the real arm downward')
})

test('EMP suppresses the contact while water remains buoyant and a grav lift loses force', () => {
  for (const medium of ['water', 'gravity']) {
    const run = createRun(parseLevel(fixture(medium)))
    advance(run); assert.equal(run.switchStates.get('lamp'), true)
    run.empRemaining = 3; advance(run, 1)
    assert.equal(run.floatSwitches[0].active, false); assert.equal(run.switchStates.get('lamp'), false)
    assert.equal(run.floatSwitches[0].raised, medium === 'water')
    advance(run, 4); assert.equal(run.switchStates.get('lamp'), true)
  }
})

test('a lowered float controls its own Fill pump through physical water feedback', () => {
  const level = fixture('water', { activeWhen: 'lowered', targets: ['field:fill', 'lamp'] })
  Object.assign(level.gravityPlates[0], { waterLevel: 0, waterRate: 30 })
  const run = createRun(parseLevel(level)); advance(run, 6)
  assert.equal(run.floatSwitches[0].raised, true)
  assert.equal(run.switchStates.get('field:fill'), false)
  const water = run.water.pools[0].level
  assert.ok(water > 40 && water < 90)
  advance(run, 2); assert.ok(Math.abs(run.water.pools[0].level - water) < .1, 'automatic shutoff stays stable')
})

test('floats combine with ordinary switches through AND, OR, XOR and reversal without becoming relay targets', () => {
  const level = fixture()
  level.triggers = [{ x: 100, y: 920, w: 60, mode: 'weight', targets: ['lamp'] }]
  for (const logic of ['or','and','xor']) for (const reversed of [false,true]) for (const a of [false,true]) for (const b of [false,true]) {
    Object.assign(level.wallLights[0], { switchLogic: logic, switchReversed: reversed })
    const state = resolveSwitchStates(level, [{active:a}], [{active:b}])
    const expected = logic === 'or' ? a || b : logic === 'and' ? a && b : a !== b
    assert.equal(state.get('lamp'), reversed ? !expected : expected)
  }
  assert.ok(switchSources(level).some(s => s.kind === 'float-switch'))
  level.version = 2; level.lighting = { nightMode: false, ambient: 0, lights: [] }
  level.triggers[0].targets = ['float']; assert.throws(() => parseLevel(level), /existing switched items/)
})

test('float schema preserves both versions, rejects invalid geometry and duplicate IDs, and previews its starting state', () => {
  for (const version of [1,2]) {
    const level = fixture('dry', { startsRaised: true, activeWhen: 'lowered', flipX: true, travelAngle: 30 })
    level.version = version
    if (version === 2) level.lighting = { nightMode: false, ambient: 0, lights: [] }
    assert.deepEqual(parseLevel(JSON.parse(JSON.stringify(level))), level)
    assert.deepEqual(levelProblems(level), [])
    assert.equal(createPreviewRun(level).switchStates.get('lamp'), false)
  }
  for (const patch of [{armLength:0},{size:0},{travelAngle:90},{x:1790},{y:1},{startsRaised:1},{activeWhen:'toggle'},{id:'lamp'},{targets:['missing']}]) {
    assert.throws(() => parseLevel(fixture('dry',patch)), JSON.stringify(patch))
  }
})

test('studio placement, geometry, names, wiring, duplication, templates, paste and deletion preserve float sensors', () => {
  const placed = addItem(blankTrial(), 'float-switch', {x:400,y:600}, {x:400,y:600})
  const selection = placed.selection, level = placed.level
  assert.ok(allSelections(level).some(s => s.kind === 'float-switch'))
  const center = floatBallCenter(level.floatSwitches[0])
  assert.deepEqual(hitItem(level, center.x, center.y, 1), selection)
  assert.deepEqual(itemBounds(level, selection), floatSwitchBounds(level.floatSwitches[0]))
  level.wallLights = [{ id:'lamp',x:750,y:450 }]
  const named = renameItem(level, selection, 'Tank full')
  const wired = setSwitchTargets(named, selection, ['lamp'])
  assert.deepEqual(wired.floatSwitches[0].targets, ['lamp'])
  const moved = moveItem(wired,selection,40,-20)
  assert.equal(moved.floatSwitches[0].x,440); assert.equal(moved.floatSwitches[0].y,580)
  const edited = editFloatSwitch(moved,0,{flipX:true,armLength:140,size:50,travelAngle:35,activeWhen:'lowered'})
  const copied = copyForEditing(edited)
  assert.notEqual(copied.floatSwitches[0].id,edited.floatSwitches[0].id)
  assert.deepEqual(copied.floatSwitches[0].targets,[copied.wallLights[0].id])
  const pasted = pasteSelections(edited,copySelections(edited,[selection,{kind:'wall-light',index:0}]),0,0).level
  assert.equal(pasted.floatSwitches.length,2)
  assert.deepEqual(pasted.floatSwitches[1].targets,[pasted.wallLights[1].id])
  const duplicated = duplicateItem(edited,selection).level
  assert.notEqual(duplicated.floatSwitches[0].id,duplicated.floatSwitches[1].id)
  const deleted = deleteItem(edited,{kind:'wall-light',index:0})
  assert.deepEqual(deleted.floatSwitches[0].targets,[])
  assert.equal(deleteItem(edited,selection).floatSwitches.length,0)
  const resized = resizeLevelHeight(edited,1020)
  assert.equal(resized.floatSwitches[0].y,edited.floatSwitches[0].y+100)
  for (const candidate of [wired,moved,edited,copied,pasted,duplicated,deleted,resized]) assert.deepEqual(parseLevel(candidate),candidate)
})
