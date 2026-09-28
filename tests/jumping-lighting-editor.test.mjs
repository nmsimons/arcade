import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { blankTrial, levelHeight, parseLevel, levelProblems, triggerTargets } from '../src/games/jumping/level.ts'
import { addItem, allSelections, deleteItem, duplicateItem, hitItem, itemBounds, moveItem, renameItem, resizeItem, resizeLevelHeight, setTriggerTargets } from '../src/games/jumping/editor.ts'
import { editLight, lightHandles, setLevelAmbient, setLevelNightMode } from '../src/games/jumping/lightingEditor.ts'
import { nightModeEnabled } from '../src/games/jumping/ambientLight.ts'
import { lightTravelBounds } from '../src/games/jumping/lightingDefinition.ts'
import { copyForEditing } from '../src/games/jumping/puzzleEditor.ts'
import { createRun, stepRun } from '../src/games/jumping/challenge.ts'
import { LightingState } from '../src/games/jumping/lightingModel.ts'
import { NEUTRAL_INPUT } from '../src/games/jumping/model.ts'

const fixture = JSON.parse(readFileSync(new URL('./fixtures/jumping/lighting-prototype.json', import.meta.url)))
const lit = () => parseLevel({ ...structuredClone(fixture.level), version: 2, lighting: structuredClone(fixture.lighting) })
const selection = { kind: 'light', index: 0 }

test('lighting upgrades only edited documents; legacy levels round-trip unchanged', () => {
  const level = blankTrial()
  assert.equal(setLevelAmbient(level, 100), level)
  assert.equal(parseLevel(level).version, 1)
  assert.equal(parseLevel(level).lighting, undefined)
  const next = setLevelAmbient(level, 35)
  assert.equal(next.version, 2); assert.deepEqual(next.lighting, { nightMode: false, ambient: 35, lights: [] })
  assert.equal(setLevelAmbient(next, 100).version, 2)
  assert.deepEqual(parseLevel(JSON.parse(JSON.stringify(lit()))), lit())
  assert.deepEqual(levelProblems(lit()), [])
})
test('version, missing lighting, invalid values and unsupported light types cannot be silently downgraded', () => {
  for (const patch of [{ version: 3 }, { version: 1 }, { lighting: undefined }, { lighting: null }]) assert.throws(() => parseLevel({ ...lit(), ...patch }))
  for (const ambient of [-1, 101, .5, '50', null, NaN, Infinity]) assert.throws(() => parseLevel({ ...lit(), lighting: { ambient, lights: [] } }))
  for (const patch of [{ id: '' }, { id: 'x'.repeat(101) }, { x: -1 }, { y: Infinity }, { intensity: 0 }, { intensity: 101 }, { intensity: 1.5 }, { direction: 181 }, { spread: 19 }, { spread: 161 }, { power: 'flicker' }, { mount: 'missing' }]) {
    const level = lit(); Object.assign(level.lighting.lights[0], patch); assert.throws(() => parseLevel(level), JSON.stringify(patch))
  }
})
test('parser reconstructs lighting data and rejects duplicate targets, oversized collections and invalid connections', () => {
  const level = lit(); level.lighting.untrusted = '<script>'; level.lighting.lights[0].resource = 'https://example.com/a'
  assert.equal(parseLevel(level).lighting.untrusted, undefined); assert.equal(parseLevel(level).lighting.lights[0].resource, undefined)
  const bad = modify => { const l = lit(); modify(l); assert.throws(() => parseLevel(l)) }
  bad(l => { l.lighting.lights[0].id = l.mechanisms[0].id })
  bad(l => { l.lighting.lights[1].id = l.lighting.lights[0].id })
  bad(l => { l.lighting.lights = Array.from({ length: 17 }, (_, i) => ({ ...l.lighting.lights[0], id: `light${i}` })) })
  bad(l => { l.lighting.lights[0].power = 'switched' })
  bad(l => { l.triggers[0].targets = ['missing'] })
  bad(l => { l.triggers[0].targets = [l.lighting.lights[0].id] })
})
test('light footprints and complete mounted travel stay within the room', () => {
  for (const patch of [{ x: 9 }, { y: 9 }, { x: 1271 }, { y: 631 }]) {
    const level = lit(); Object.assign(level.lighting.lights[0], patch); assert.throws(() => parseLevel(level))
  }
  let level = editLight(lit(), 0, { mount: 'lift' })
  assert.doesNotThrow(() => parseLevel(level))
  const bounds = lightTravelBounds(level, level.lighting.lights[0])
  assert.ok(bounds.h > 20)
  level.mechanisms[0].travel = 620
  assert.throws(() => parseLevel(level))
})
test('mounted-light and geometry complexity limits reject expensive shared files', () => {
  const level = lit(), template = editLight(level, 0, { mount: 'lift' }).lighting.lights[0]
  level.lighting.lights = Array.from({ length: 5 }, (_, i) => ({ ...template, id: `lamp${i}` }))
  assert.throws(() => parseLevel(level), /4 mounted/)
  const heavy = lit(); heavy.lighting.lights = Array.from({ length: 16 }, (_, i) => ({ ...heavy.lighting.lights[0], id: `lamp${i}` }))
  // Valid individual shapes, but too many edge/light combinations.
  heavy.platforms = Array.from({ length: 120 }, () => ({ x: 200, y: 300, w: 100, h: 100,
    polygon: Array.from({ length: 24 }, (_, i) => [50 + 49 * Math.cos(i * Math.PI / 12), 50 + 49 * Math.sin(i * Math.PI / 12)]) }))
  heavy.climbables = { ropes: [], ladders: [] }
  assert.throws(() => parseLevel(heavy), /too complex/)
})
test('adding, aiming, naming, moving and duplicating lights preserve the input and use independent IDs', () => {
  const source = blankTrial(), before = JSON.stringify(source)
  let { level } = addItem(source, 'light', { x: 400, y: 200 }, { x: 400, y: 300 })
  assert.equal(JSON.stringify(source), before); assert.equal(level.version, 2)
  assert.equal(level.lighting.lights[0].direction, 90)
  assert.deepEqual(hitItem(level, 400, 200, 9), selection); assert.ok(allSelections(level).some(s => s.kind === 'light'))
  level = renameItem(level, selection, 'Over the stairs')
  level = moveItem(level, selection, 20, 40)
  assert.deepEqual(itemBounds(level, selection), { x: 410, y: 230, w: 20, h: 20 })
  const copy = duplicateItem(level, selection)
  assert.notEqual(copy.level.lighting.lights[0].id, copy.level.lighting.lights[1].id)
  assert.equal(level.lighting.lights.length, 1)
  assert.equal(parseLevel(level).lighting.lights[0].name, 'Over the stairs')
  const handles = lightHandles(level.lighting.lights[0], .5)
  assert.equal(handles.length, 3)
  for (const h of handles) assert.ok(Math.abs(Math.hypot(h.x - 420, h.y - 240) - 120) < 1e-6)
})
test('light edits constrain properties; mount attaches nearby, follows moves/resizing and detaches in place', () => {
  let level = editLight(lit(), 0, { direction: -900, spread: 1, mount: 'lift' })
  const light = level.lighting.lights[0], host = level.mechanisms[0]
  assert.deepEqual([light.intensity, light.direction, light.spread], [100, -180, 20])
  assert.equal(light.y, host.y - 10)
  level = moveItem(level, { kind: 'mechanism', index: 0 }, 20, -40)
  assert.equal(level.lighting.lights[0].x, light.x + 20); assert.equal(level.lighting.lights[0].y, light.y - 40)
  const moved = { ...level.lighting.lights[0] }
  const resized = resizeItem(level, { kind: 'mechanism', index: 0 }, host.w + 40, host.h, 'left')
  assert.equal(resized.lighting.lights[0].x, moved.x - 40)
  const detached = editLight(level, 0, { mount: '' }).lighting.lights[0]
  const { mount, ...expected } = moved
  assert.equal(mount, 'lift'); assert.deepEqual(detached, expected)
})
test('height grows at the top and shifts mounted lights exactly once', () => {
  const level = editLight(lit(), 0, { mount: 'lift' }), next = resizeLevelHeight(level, levelHeight(level) + 200)
  assert.equal(next.lighting.lights[0].y, level.lighting.lights[0].y + 200)
  assert.equal(next.mechanisms[0].y, level.mechanisms[0].y + 200)
  assert.doesNotThrow(() => parseLevel(next))
})
test('switch targets accept lights; changing power and deleting either endpoint cleans connections', () => {
  let level = editLight(lit(), 0, { power: 'switched', mount: 'lift' })
  const id = level.lighting.lights[0].id
  level = setTriggerTargets(level, 0, ['lift', id])
  assert.deepEqual(triggerTargets(parseLevel(level).triggers[0]), ['lift', id])
  const always = editLight(level, 0, { power: 'always' })
  assert.deepEqual(triggerTargets(always.triggers[0]), ['lift'])
  assert.deepEqual(triggerTargets(deleteItem(level, selection).triggers[0]), ['lift'])
  const hostDeleted = deleteItem(level, { kind: 'mechanism', index: 0 })
  assert.equal(hostDeleted.lighting.lights[0].mount, undefined)
  assert.equal(hostDeleted.lighting.lights[0].x, level.lighting.lights[0].x)
  assert.deepEqual(triggerTargets(hostDeleted.triggers[0]), [id])
})
test('templates remap all mount and switch references; copied lights do not inherit incoming connections', () => {
  let level = editLight(lit(), 0, { power: 'switched', mount: 'lift' })
  level = setTriggerTargets(level, 0, ['lift', level.lighting.lights[0].id])
  const clone = copyForEditing(level), lamp = clone.lighting.lights[0]
  assert.notEqual(lamp.id, level.lighting.lights[0].id)
  assert.equal(lamp.mount, clone.mechanisms[0].id)
  assert.deepEqual(triggerTargets(clone.triggers[0]), [clone.mechanisms[0].id, lamp.id])
  assert.doesNotThrow(() => parseLevel(clone))
  const duplicated = duplicateItem(level, selection).level
  assert.ok(levelProblems(duplicated).some(s => s.includes('Connect switched light')))
})
test('lighting has no effect on movement, clocks, pickups, or mechanisms under identical inputs', () => {
  const base = parseLevel(fixture.level), litLevel = lit(), a = createRun(base), b = createRun(litLevel)
  const lighting = new LightingState()
  for (let frame = 0; frame < 360; frame++) {
    const input = { ...NEUTRAL_INPUT, move: frame < 160 ? 1 : -1, jump: frame > 60 && frame < 110 }
    stepRun(a, input); stepRun(b, input); lighting.sources(litLevel.lighting, b, 1 / 120)
    for (const field of ['player', 'props', 'mechanisms', 'triggers', 'robots', 'elapsed', 'coinsCollected', 'empRemaining', 'finished']) assert.deepEqual(b[field], a[field], `${field} at ${frame}`)
  }
})

test('EMP and a last coin collected together defer lamp activation, and later EMP preserves the latch', () => {
  const level = blankTrial(); level.version = 2
  level.lighting = { ambient: 0, lights: [{ id: 'coin-lamp', x: 300, y: 200, intensity: 100, direction: 90, spread: 70, power: 'switched' }] }
  level.triggers = [{ mode: 'coins', x: 400, y: 600, w: 200, threshold: 1, targets: ['coin-lamp'] }]
  level.pickups = [{ kind: 'emp', x: 160, y: 888 }, { kind: 'coin', x: 160, y: 888 }]
  const world = createRun(parseLevel(level)), state = new LightingState()
  stepRun(world, NEUTRAL_INPUT)
  assert.equal(world.coinsCollected, 1); assert.equal(world.triggers[0].active, false)
  assert.equal(state.sources(level.lighting, world, 0)[0].fade, 0)
  world.started = true
  for (let i = 0; i < 600; i++) stepRun(world, NEUTRAL_INPUT)
  assert.equal(world.triggers[0].active, true)
  assert.equal(state.sources(level.lighting, world, .2)[0].fade, 1)
  world.pickups.push({ definition: { kind: 'emp', x: 160, y: 888 }, collectedAge: null })
  stepRun(world, NEUTRAL_INPUT)
  assert.equal(world.triggers[0].active, true)
  assert.equal(state.sources(level.lighting, world, .2)[0].fade, 0)
  for (let i = 0; i < 600; i++) stepRun(world, NEUTRAL_INPUT)
  assert.equal(state.sources(level.lighting, world, .2)[0].fade, 1)
})


test('night mode round-trips independently of ambient and preserves lamps when disabled', () => {
  const legacy = blankTrial()
  assert.equal(nightModeEnabled(legacy.lighting), false)
  assert.equal(setLevelNightMode(legacy, false), legacy)
  const night = setLevelNightMode(legacy, true)
  assert.equal(night.version, 2)
  assert.deepEqual(night.lighting, { nightMode: true, ambient: 100, lights: [] })
  const dim = setLevelAmbient(night, 0)
  assert.equal(nightModeEnabled(dim.lighting), true)
  const source = lit(), day = setLevelNightMode(source, false)
  assert.equal(source.lighting.nightMode, true)
  assert.equal(day.lighting.nightMode, false)
  assert.deepEqual(day.lighting.lights, source.lighting.lights)
  assert.equal(day.lighting.ambient, source.lighting.ambient)
  assert.deepEqual(parseLevel(JSON.parse(JSON.stringify(day))).lighting, day.lighting)
  assert.deepEqual(setLevelNightMode(day, true).lighting, source.lighting)
  assert.equal(setLevelAmbient(day, 0).lighting.nightMode, false)
  for (const ambient of [0, 34, 99, 100]) {
    const file = { ...legacy, version: 2, lighting: { ambient, lights: [] } }
    assert.equal(parseLevel(file).lighting.nightMode, ambient < 100)
    for (const nightMode of [true, false]) assert.equal(parseLevel({ ...file, lighting: { ...file.lighting, nightMode } }).lighting.nightMode, nightMode)
    for (const nightMode of [null, 0, 1, 'true', {}]) assert.throws(() => parseLevel({ ...file, lighting: { ...file.lighting, nightMode } }))
  }
})


test('spotlights default to full intensity and normalize older authored intensities', () => {
  for (const intensity of [undefined, 1, 35, 99, 100]) {
    const level = lit()
    if (intensity === undefined) delete level.lighting.lights[0].intensity
    else level.lighting.lights[0].intensity = intensity
    const parsed = parseLevel(level)
    assert.equal(parsed.lighting.lights[0].intensity, 100)
    assert.equal(new LightingState().sources(level.lighting, createRun(parsed), .2)[0].intensity, 100)
    assert.equal(parseLevel(JSON.parse(JSON.stringify(parsed))).lighting.lights[0].intensity, 100)
  }
})
