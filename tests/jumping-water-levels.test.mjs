import test from 'node:test'
import assert from 'node:assert/strict'
import { blankTrial, parseLevel } from '../src/games/jumping/level.ts'
import { createRun, stepRun, setWaterEffectsEnabled } from '../src/games/jumping/challenge.ts'
import { NEUTRAL_INPUT, STEP } from '../src/games/jumping/model.ts'
import { createWaterLevels, advanceWaterLevels, waterControlId } from '../src/games/jumping/waterLevel.ts'
import { playerSwimStrength, createGravityField, updateGravityField } from '../src/games/jumping/gravity.ts'
import { waterSpace } from '../src/games/jumping/waterTerrain.ts'
import { polygonArea, pointInside, bodyIntersects } from '../src/games/jumping/geometry.ts'
import { resolveSwitchStates, switchedItems } from '../src/games/jumping/switchPower.ts'
import { deleteItem, setGravityPlateEffect } from '../src/games/jumping/editor.ts'
import { copySelections, pasteSelections } from '../src/games/jumping/editorSelection.ts'
import { copyForEditing } from '../src/games/jumping/puzzleEditor.ts'

const pool = { id: 'pool', effect: 'water', gravity: -1, x: 400, y: 320, w: 1000, h: 600, waterLevel: 25, waterRate: 20 }
const level = () => ({ ...blankTrial(), spawn: { x: 100, y: 920 }, gravityPlates: [{ ...pool }],
  goal: { id: 'closed', power: 'switched', x: 1600, y: 920 },
  triggers: [{ x: 200, y: 920, w: 80, mode: 'weight', behavior: 'toggle', startsOn: false, targets: ['pool:fill', 'pool:drain'] }] })
const advance = (run, seconds, input = NEUTRAL_INPUT, dt = STEP) => {
  run.started = true
  for (let i = 0; i < Math.round(seconds / dt); i++) stepRun(run, input, dt)
}

for (const version of [1, 2]) test(`water levels and pump wiring round trip in file version ${version}`, () => {
  const source = { ...level(), version, ...(version === 2 ? { lighting: { nightMode: false, ambient: 0, lights: [] } } : {}) }
  source.gravityPlates[0].drain = { switchLogic: 'and', switchReversed: true }
  source.gravityPlates[0].waterMinLevel = 12.5
  const parsed = parseLevel(source)
  assert.deepEqual(parseLevel(JSON.parse(JSON.stringify(parsed))), parsed)
  assert.equal(parsed.gravityPlates[0].waterMinLevel, 12.5)
  assert.deepEqual(parsed.triggers[0].targets, ['pool:fill', 'pool:drain'])
  assert.deepEqual(switchedItems(parsed).filter(t => t.kind === 'gravity-plate').map(t => t.id), ['pool:fill', 'pool:drain'])
  for (const patch of [{ waterLevel: -1 }, { waterLevel: 101 }, { waterMinLevel: -1 }, { waterMinLevel: 101 },
    { waterMinLevel: NaN }, { waterMinLevel: 26 }, { waterRate: 0 }, { fill: { relay: true } }, { drain: { targets: [] } }])
    assert.throws(() => parseLevel({ ...source, gravityPlates: [{ ...pool, ...patch }] }))
  assert.throws(() => parseLevel({ ...source, logicRelays: [{ id: 'pool:fill', x: 100, y: 100 }] }), 'pump IDs cannot collide with other devices')
})

for (const dt of [STEP, 1 / 60, 1 / 30]) for (const effects of [true, false])
  test(`drain stops at the low water mark without rebuilding at ${dt}, effects ${effects}`, () => {
    const document = level(); document.gravityPlates[0].waterMinLevel = 12.5
    document.gravityPlates[0].drain = { switchReversed: true }
    const run = createRun(parseLevel(document)); setWaterEffectsEnabled(run, effects)
    advance(run, 4, NEUTRAL_INPUT, dt)
    assert.equal(run.water.pools[0].level, 12.5)
    assert.equal(run.water.plates[0].h, 75); assert.equal(run.water.plates[0].y, 845)
    assert.equal(run.gravityField.hasWater, true, 'the remaining water keeps its buoyancy')
    const revision = run.gravityField.revision, spaces = run.waterSpaces.get(run.water.plates[0])
    const surface = run.waterSurface, ticks = surface?.ticks
    advance(run, 2, NEUTRAL_INPUT, dt)
    assert.equal(run.gravityField.revision, revision, 'continuous draining at the minimum does no geometric work')
    assert.equal(run.waterSpaces.get(run.water.plates[0]), spaces)
    assert.equal(run.waterSurface, surface); assert.equal(surface?.ticks, ticks)
    run.triggers[0].active = true; advance(run, 1, NEUTRAL_INPUT, dt)
    assert.ok(Math.abs(run.water.pools[0].level - 32.5) < 1e-8, 'reversing the toggle fills immediately from the mark')
    assert.equal(createRun(run.level).water.pools[0].level, 25, 'restart restores initial level, not the low water mark')
    assert.equal(document.gravityPlates[0].waterLevel, 25)
  })

test('each reservoir has its own low water mark, including a fully retained pool', () => {
  const water = createWaterLevels([{ ...pool, waterMinLevel: 12.5 },
    { ...pool, id: 'second', waterLevel: 80, waterMinLevel: 40 },
    { ...pool, id: 'full', waterLevel: 100, waterMinLevel: 100 }])
  const drains = new Map(['pool', 'second', 'full'].map(id => [waterControlId(id, 'drain'), true]))
  for (let i = 0; i < 720; i++) advanceWaterLevels(water, drains, STEP)
  assert.deepEqual(water.pools.map(p => p.level), [12.5, 40, 100])
  assert.deepEqual(water.plates.map(p => p.y), [845, 680, 320])
  const revision = water.revision
  for (let i = 0; i < 120; i++) advanceWaterLevels(water, drains, STEP)
  assert.equal(water.revision, revision)
  assert.equal(parseLevel({ ...level(), gravityPlates: [{ ...pool, waterLevel: 100, waterMinLevel: 100 }] }).gravityPlates[0].waterMinLevel, 100)
})

test('cached terrain difference excludes islands, concave shelves and overlapping solids', () => {
  const region = { ...pool, x: 0, y: 0, w: 500, h: 500 }
  const terrain = [
    { x: 100, y: 100, w: 100, h: 100 }, { x: 150, y: 150, w: 100, h: 100 },
    { x: 300, y: 100, w: 100, h: 200, polygon: [[0, 0], [100, 0], [100, 50], [30, 50], [30, 200], [0, 200]] },
  ]
  const space = waterSpace(region, terrain)
  const area = space.reduce((sum, p) => sum + Math.abs(polygonArea(p)), 0)
  assert.equal(area, 250000 - 17500 - 9500)
  const wet = (x, y) => space.some(p => pointInside({ x: 0, y: 0, w: 500, h: 500, polygon: p }, x, y))
  for (const p of [[110, 110], [175, 175], [240, 240], [310, 200], [390, 120]]) assert.equal(wet(...p), false)
  for (const p of [[90, 110], [260, 200], [350, 200], [450, 450]]) assert.equal(wet(...p), true)
})

for (const dt of [STEP, 1 / 60, 1 / 30]) test(`one toggle fills on and drains off with cached, bounded levels at ${dt}`, () => {
  const document = level(); document.gravityPlates[0].drain = { switchReversed: true }
  const run = createRun(document), original = structuredClone(document.gravityPlates)
  assert.equal(run.water.plates[0].y, 770)
  run.triggers[0].active = true; advance(run, 2, NEUTRAL_INPUT, dt)
  assert.ok(Math.abs(run.water.pools[0].level - 65) < 1e-8)
  assert.ok(run.water.revision <= 60)
  run.triggers[0].active = false; advance(run, 5, NEUTRAL_INPUT, dt)
  assert.equal(run.water.pools[0].level, 0); assert.equal(run.gravityField.hasWater, false)
  run.triggers[0].active = true; advance(run, 6, NEUTRAL_INPUT, dt)
  assert.equal(run.water.pools[0].level, 100)
  const revision = run.gravityField.revision, spaces = run.waterSpaces.get(run.water.plates[0])
  advance(run, 1, NEUTRAL_INPUT, dt)
  assert.equal(run.gravityField.revision, revision, 'a pump at its endpoint does not rebuild fields')
  assert.equal(run.waterSpaces.get(run.water.plates[0]), spaces, 'terrain geometry never rebuilds while filling')
  assert.deepEqual(document.gravityPlates, original, 'the live level and initial state remain authored data')
})

test('two pump inputs hold when both are on or both are off, including relay logic', () => {
  const document = level()
  document.triggers = [
    { x: 100, y: 920, w: 40, mode: 'weight', targets: ['fill-relay'] },
    { x: 200, y: 920, w: 40, mode: 'weight', targets: ['pool:drain'] },
  ]
  document.logicRelays = [{ id: 'fill-relay', x: 300, y: 800, targets: ['pool:fill'] }]
  for (const [fill, drain, expected] of [[false, false, 25], [true, true, 25], [true, false, 45], [false, true, 5]]) {
    const water = createWaterLevels(document.gravityPlates), states = resolveSwitchStates(document, [{ active: fill }, { active: drain }])
    for (let i = 0; i < 120; i++) advanceWaterLevels(water, states, STEP)
    assert.ok(Math.abs(water.pools[0].level - expected) < 1e-8)
  }
})

test('short pump presses retain their actual duration without crediting idle time', () => {
  const water = createWaterLevels([pool])
  advanceWaterLevels(water, new Map(), STEP)
  advanceWaterLevels(water, new Map([[waterControlId('pool', 'fill'), true]]), STEP)
  advanceWaterLevels(water, new Map(), 2 * STEP)
  assert.ok(Math.abs(water.pools[0].level - (25 + 20 * STEP)) < 1e-8)
})

test('EMP pauses pumps while the existing water keeps its buoyancy', () => {
  const document = level(); document.triggers[0].targets = ['pool:fill']
  const run = createRun(document); run.triggers[0].active = true; run.empRemaining = 2
  const region = { ...run.water.plates[0] }
  advance(run, 2)
  assert.deepEqual(run.water.plates[0], region)
  assert.equal(run.gravityField.hasWater, true)
  advance(run, 1)
  assert.ok(Math.abs(run.water.pools[0].level - 45) < 1e-8)
})

test('floats rise and settle as a reservoir fills and drains, with solid underwater shelves', () => {
  const document = level()
  document.props = [{ kind: 'ball', size: 40, x: 1100, y: 800 }, { kind: 'box', size: 50, x: 650, y: 800 }]
  document.platforms = [{ x: 600, y: 500, w: 150, h: 30 }]
  document.gravityPlates[0].waterRate = 10
  document.triggers = [{ ...document.triggers[0], targets: ['pool:fill'] }]
  const run = createRun(document); advance(run, 2)
  const y = run.props[0].y
  run.triggers[0].active = true; advance(run, 7.5); advance(run, 2)
  assert.ok(run.props[0].y < y - 250)
  assert.ok(run.props[1].y >= 579, 'the rising crate stays below the shelf instead of being teleported through it')
  assert.ok(run.props.every(b => Number.isFinite(b.y) && Math.abs(b.vy) < 200))
  const reset = createRun(document)
  assert.equal(reset.water.pools[0].level, 25)
  run.level.triggers[0].targets = ['pool:drain']; advance(run, 10); advance(run, 2)
  assert.equal(run.water.pools[0].level, 0)
  assert.ok(run.props.every(b => Math.abs(b.y - 920) < .5))
})

test('low performance mode keeps fill/drain gameplay and cached terrain but skips surface rebuilding', () => {
  const document = level(); document.triggers[0].targets = ['pool:fill']
  const run = createRun(document); setWaterEffectsEnabled(run, false)
  const state = run.waterSurface, ticks = state.ticks
  run.triggers[0].active = true; advance(run, 1)
  assert.ok(Math.abs(run.water.pools[0].level - 45) < 1e-8)
  assert.equal(run.waterSurface, state); assert.equal(state.ticks, ticks)
  setWaterEffectsEnabled(run, true)
  assert.equal(run.waterSurface.surfaces[0].y, run.water.plates[0].y)
  assert.equal(run.waterSurface.active, false)
})

test('a newly filled second reservoir keeps its own terrain dividers and the global wave budget', () => {
  const document = level()
  document.gravityPlates = [{ ...pool, x: 200, w: 400, waterLevel: 100 }, { ...pool, id: 'second', x: 800, w: 600, waterLevel: 0 }]
  document.platforms = [{ x: 1080, y: 320, w: 40, h: 600 }]
  document.triggers[0].targets = ['second:fill']
  const run = createRun(document); run.triggers[0].active = true; advance(run, 5)
  const surfaces = run.waterSurface.surfaces
  assert.equal(surfaces.length, 3)
  assert.deepEqual(surfaces.filter(s => s.left >= 800).map(s => [s.left, s.right]), [[800, 1080], [1120, 1400]])
  assert.ok(surfaces.reduce((sum, s) => sum + s.height.length, 0) <= 128)
})

test('copied reservoirs remap both pump ports, and deleting/converting removes their connections', () => {
  const document = level(), selection = { kind: 'gravity-plate', index: 0 }
  document.gravityPlates[0].fill = { switchLogic: 'xor' }
  document.gravityPlates[0].waterMinLevel = 12.5
  const copied = copyForEditing(document), id = copied.gravityPlates[0].id
  assert.equal(copied.gravityPlates[0].waterMinLevel, 12.5)
  assert.deepEqual(copied.triggers[0].targets, [`${id}:fill`, `${id}:drain`])
  const pasted = pasteSelections(document, copySelections(document, [selection, { kind: 'trigger', index: 0 }]), 0, 0).level
  assert.deepEqual(pasted.triggers[1].targets, [`${pasted.gravityPlates[1].id}:fill`, `${pasted.gravityPlates[1].id}:drain`])
  assert.deepEqual(pasted.gravityPlates[1].fill, { switchLogic: 'xor' })
  assert.equal(pasted.gravityPlates[1].waterMinLevel, 12.5)
  assert.deepEqual(deleteItem(document, selection).triggers[0].targets, [])
  const converted = setGravityPlateEffect(document, 0, 'gravity')
  assert.deepEqual(converted.triggers[0].targets, [])
  assert.equal(converted.gravityPlates[0].waterLevel, undefined)
  assert.equal(converted.gravityPlates[0].waterMinLevel, undefined)
})

test('a completely drained reservoir has no water force or hidden collision volume', () => {
  const document = level(); document.gravityPlates[0].waterLevel = 0
  document.spawn = { x: 1100, y: 920 }
  const run = createRun(document), field = createGravityField()
  updateGravityField(field, run.water.plates, new Map(), true)
  assert.equal(playerSwimStrength(field, run.player), 0)
  assert.equal(run.waterSurface, undefined)
  assert.equal(run.player.grounded, true)
  assert.equal(bodyIntersects(run.player.x, run.player.y, { x: 400, y: 940, w: 1000, h: 100 }), false)
})
