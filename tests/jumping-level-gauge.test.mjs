import test from 'node:test'
import assert from 'node:assert/strict'
import { blankTrial, copyLevel, levelProblems, parseLevel } from '../src/games/jumping/level.ts'
import { createRun, createPreviewRun, stepRun } from './helpers/jumping-active-run.mjs'
import { NEUTRAL_INPUT } from '../src/games/jumping/model.ts'
import { LEVEL_GAUGE_TOLERANCE, MAX_LEVEL_GAUGES, createLevelGauge, levelGaugeBounds, levelGaugePool, levelGaugeReads, levelGaugeStates, updateLevelGauge } from '../src/games/jumping/levelGauge.ts'
import { STEP } from '../src/games/jumping/model.ts'
import { WATER_LEVEL_STEP, createWaterLevels, effectiveWaterLevel } from '../src/games/jumping/waterLevel.ts'
import { resolveSwitchStates, switchSources } from '../src/games/jumping/switchPower.ts'
import { wallWireEnergized, wallWires } from '../src/games/jumping/wallWiring.ts'
import { addItem, allSelections, deleteItem, duplicateItem, editLevelGauge, hitItem, itemBounds, moveItem, renameItem, resizeLevelHeight, setSwitchTargets } from '../src/games/jumping/editor.ts'
import { copySelections, pasteSelections } from '../src/games/jumping/editorSelection.ts'
import { copyForEditing } from '../src/games/jumping/puzzleEditor.ts'
import { defaultObjectLabel } from '../src/games/jumping/objectLabels.ts'

/** Two 400-tall pools side by side: the west top edge is y 520, the east one sits higher. */
function locks({ west = {}, east = {}, gauges } = {}) {
  const level = blankTrial()
  level.gravityPlates = [
    { id: 'west', x: 200, y: 520, w: 400, h: 400, effect: 'water', gravity: -1, waterLevel: 50, ...west },
    { id: 'east', x: 1000, y: 320, w: 400, h: 400, effect: 'water', gravity: -1, ...east },
  ]
  level.wallLights = [{ id: 'lamp', x: 900, y: 200 }]
  level.levelGauges = gauges ?? [{ id: 'gauge', x: 300, y: 520, targets: ['lamp'] }]
  return level
}
/** A switch plate that starts on keeps the named pumps running. */
const pumps = (level, targets) => { level.triggers = [{ x: 1600, y: level.floor, w: 100, mode: 'weight', behavior: 'switch', startsOn: true, targets }]; return level }
const pool = (run, id) => run.water.pools.find(p => p.definition.id === id)

test('parses both file versions and rejects malformed gauges', () => {
  const level = locks({ gauges: [{ id: 'gauge', name: 'Lock mark', x: 300, y: 520, targets: ['lamp'], activeWhen: 'below', showWires: true, wireHeight: 300 }] })
  assert.deepEqual(parseLevel(level), level)
  assert.deepEqual(parseLevel(JSON.parse(JSON.stringify(level))), level)
  assert.deepEqual(parseLevel({ ...copyLevel(level), version: 2, lighting: { nightMode: false, ambient: 0, lights: [] } }).levelGauges, level.levelGauges)
  // Targets may be omitted; activeWhen defaults to above.
  const bare = parseLevel(locks({ gauges: [{ id: 'gauge', x: 300, y: 600 }] }))
  assert.deepEqual(bare.levelGauges, [{ id: 'gauge', x: 300, y: 600, targets: [] }])
  // A mark outside every pool still parses, and the studio asks for it to be moved.
  const dry = locks({ gauges: [{ id: 'gauge', x: 800, y: 600, targets: [] }] })
  assert.deepEqual(levelProblems(parseLevel(dry)), ['Put the mark of “Level gauge 1” inside a pool.'])
  assert.deepEqual(levelProblems(level), [])
  // The lamp must be in the level; the lower half of the board may run on behind the floor.
  assert.ok(parseLevel(locks({ gauges: [{ id: 'gauge', x: 300, y: level.floor, targets: [] }] })))
  const bad = [
    { activeWhen: 'raised' }, { activeWhen: 'above', power: 'always' }, { relay: true }, { switchLogic: 'and' }, { switchReversed: true },
    { id: '' }, { id: 7 }, { x: 5 }, { x: level.width - 5 }, { y: 40 }, { y: level.floor + 1 }, { targets: 'lamp' }, { targets: ['lamp', 'lamp'] },
    { showWires: 'yes' }, { wireHeight: -1 },
  ]
  for (const patch of bad) {
    const file = locks({ gauges: [{ id: 'gauge', x: 300, y: 520, targets: ['lamp'], ...patch }] })
    assert.throws(() => parseLevel(file), undefined, JSON.stringify(patch))
  }
  assert.throws(() => parseLevel(locks({ gauges: Array.from({ length: MAX_LEVEL_GAUGES + 1 }, (_, i) => ({ id: `g${i}`, x: 300, y: 600, targets: [] })) })))
  assert.throws(() => parseLevel(locks({ gauges: [{ id: 'lamp', x: 300, y: 600, targets: [] }] })), undefined, 'IDs share the device namespace')
  assert.throws(() => parseLevel(locks({ gauges: [{ id: 'west:fill', x: 300, y: 600, targets: [] }] })), undefined, 'pump inputs are taken')
  assert.throws(() => parseLevel(locks({ gauges: [{ id: 'gauge', x: 300, y: 600, targets: ['nothing'] }] })))
})

test('a gauge reads the first water pool containing its mark, edges inclusive', () => {
  const plates = [
    { id: 'lift', x: 0, y: 0, w: 1000, h: 1000, gravity: -1 },
    { id: 'a', x: 100, y: 200, w: 300, h: 400, effect: 'water' },
    { id: 'b', x: 100, y: 200, w: 600, h: 400, effect: 'water' },
  ]
  for (const [x, y] of [[100, 200], [400, 200], [100, 600], [400, 600], [250, 400]]) assert.equal(levelGaugePool({ x, y }, plates)?.id, 'a', `${x},${y}`)
  assert.equal(levelGaugePool({ x: 500, y: 600 }, plates)?.id, 'b')
  for (const [x, y] of [[99.9, 400], [250, 199.9], [250, 600.1], [700.1, 400]]) assert.equal(levelGaugePool({ x, y }, plates), undefined, `${x},${y}`)
  // At or above: the surface y is at most the mark's (up is smaller y). The tolerance is tiny.
  assert.equal(levelGaugeReads({ y: 300 }, 300 + LEVEL_GAUGE_TOLERANCE), true)
  assert.equal(levelGaugeReads({ y: 300 }, 300.1), false)
  assert.equal(levelGaugeReads({ y: 300, activeWhen: 'below' }, 300 - LEVEL_GAUGE_TOLERANCE), true)
  assert.equal(levelGaugeReads({ y: 300, activeWhen: 'below' }, 299.9), false)
  // With no pool the gauge never switches on.
  const water = createWaterLevels(plates), none = createLevelGauge({ id: 'g', x: 900, y: 900, targets: [] }, water)
  assert.equal(none.pool, -1); updateLevelGauge(none, water, true); assert.equal(none.active, false)
  const level = locks({ gauges: [{ id: 'g', x: 800, y: 600, targets: ['lamp'] }] })
  assert.equal(createRun(level).levelGauges[0].active, false)
})

test('a filling pool switches a gauge at its full mark on the exact step, and holds it there', () => {
  const run = createRun(pumps(locks(), ['west:fill'])), west = pool(run, 'west'), gauge = run.levelGauges[0]
  assert.equal(gauge.active, false); assert.equal(run.switchStates.get('lamp'), false)
  let previous = { level: effectiveWaterLevel(west), active: gauge.active, lamp: run.switchStates.get('lamp') }, flipped = 0
  for (let i = 0; i < 120 * 8 && !flipped; i++) {
    stepRun(run, NEUTRAL_INPUT)
    if (gauge.active) {
      flipped = i
      assert.equal(previous.active, false); assert.ok(previous.level < 100, 'inactive one step before')
      assert.equal(effectiveWaterLevel(west), 100)
      assert.equal(run.switchStates.get('lamp'), true, 'its output follows on the same step')
      assert.equal(previous.lamp, false)
    }
    previous = { level: effectiveWaterLevel(west), active: gauge.active, lamp: run.switchStates.get('lamp') }
  }
  assert.ok(flipped > 0)
  for (let i = 0; i < 240; i++) { stepRun(run, NEUTRAL_INPUT); assert.equal(gauge.active, true, 'steady while the pump holds the pool full') }
  assert.equal(west.level, 100); assert.ok(Math.abs(west.region.y - 520) < 1e-9)
})

test('a draining pool switches an At or below gauge at the low water mark on the exact step', () => {
  // Low water mark 25%: the surface stops at 320 + 400 * .75 = 620.
  const level = pumps(locks({ east: { waterLevel: 60, waterMinLevel: 25, waterRate: 15 }, gauges: [{ id: 'gauge', x: 1200, y: 620, activeWhen: 'below', targets: ['lamp'] }] }), ['east:drain'])
  const run = createRun(level), east = pool(run, 'east'), gauge = run.levelGauges[0]
  assert.equal(gauge.active, false)
  let before = effectiveWaterLevel(east), flipped = false
  for (let i = 0; i < 120 * 6 && !flipped; i++) {
    stepRun(run, NEUTRAL_INPUT)
    if (gauge.active) {
      flipped = true
      assert.ok(before > 25); assert.equal(effectiveWaterLevel(east), 25)
      assert.equal(run.switchStates.get('lamp'), true)
    }
    before = effectiveWaterLevel(east)
  }
  assert.ok(flipped)
  for (let i = 0; i < 120; i++) { stepRun(run, NEUTRAL_INPUT); assert.equal(gauge.active, true) }
  assert.equal(east.level, 25); assert.ok(Math.abs(east.region.y - 620) < 1e-9)
})

test('EMP suppresses the contact, and it returns with power', () => {
  const run = createRun(locks({ west: { waterLevel: 100 } })), gauge = run.levelGauges[0]
  assert.equal(gauge.active, true); assert.equal(run.switchStates.get('lamp'), true)
  run.empRemaining = 1
  stepRun(run, NEUTRAL_INPUT)
  assert.equal(gauge.reading, true); assert.equal(gauge.active, false); assert.equal(run.switchStates.get('lamp'), false)
  for (let i = 0; i < 150; i++) stepRun(run, NEUTRAL_INPUT)
  assert.equal(gauge.active, true); assert.equal(run.switchStates.get('lamp'), true)
})

test('a gate wired AND to gauges on both sides opens only when both waterlines sit at the shared mark', () => {
  // The shared level is y 520: the west pool full, the east pool at its 50% low water mark.
  const level = pumps(locks({ east: { waterMinLevel: 50, waterRate: 20 }, gauges: [
    { id: 'west-mark', x: 560, y: 520, targets: ['gate'] },
    { id: 'east-mark', x: 1040, y: 520, activeWhen: 'below', targets: ['gate'] },
  ] }), ['west:fill', 'east:drain'])
  level.mechanisms = [{ id: 'gate', kind: 'gate', x: 790, y: 620, w: 20, h: 300, travel: 300, switchLogic: 'and' }]
  const parsed = parseLevel(level), run = createRun(parsed), west = pool(run, 'west'), east = pool(run, 'east')
  assert.equal(run.switchStates.get('gate'), false)
  assert.deepEqual(resolveSwitchStates(parsed, [{ active: true }], [], undefined, levelGaugeStates(parsed)).get('gate'), false, 'static preview agrees')
  let opened = -1, eastArrived = -1
  for (let i = 0; i < 120 * 8; i++) {
    stepRun(run, NEUTRAL_INPUT)
    if (eastArrived < 0 && run.levelGauges[1].active) eastArrived = i
    const open = run.switchStates.get('gate')
    const level = Math.abs(west.region.y - 520) <= LEVEL_GAUGE_TOLERANCE && Math.abs(east.region.y - 520) <= LEVEL_GAUGE_TOLERANCE
    assert.equal(open, level, `step ${i}: west ${west.region.y}, east ${east.region.y}`)
    if (open && opened < 0) opened = i
  }
  assert.ok(eastArrived >= 0 && opened > eastArrived, 'the east pool arrives first, and the gate waits for the west')
  assert.equal(run.mechanisms[0].active, true)
  // Authored at the shared level, the gate is open from the first frame, in play and in the studio preview.
  const settled = parseLevel({ ...copyLevel(level), triggers: [], gravityPlates: level.gravityPlates.map(p => ({ ...p, waterLevel: p.id === 'west' ? 100 : 50 })) })
  assert.equal(createPreviewRun(settled).switchStates.get('gate'), true)
  assert.equal(createRun(settled).switchStates.get('gate'), true)
  assert.equal(resolveSwitchStates(settled, [], [], undefined, levelGaugeStates(settled)).get('gate'), true)
})

test('wiring previews read the authored water, and gauges can drive pumps, relays, gates, lamps and exits', () => {
  for (const waterLevel of [50, 100]) {
    const level = locks({ west: { waterLevel }, gauges: [{ id: 'gauge', x: 300, y: 520, targets: ['lamp'], showWires: true }] })
    const [wire] = wallWires(level)
    assert.equal(wire.source.kind, 'level-gauge')
    assert.equal(wallWireEnergized(level, wire, createPreviewRun(level)), waterLevel === 100)
  }
  const level = locks()
  level.logicRelays = [{ id: 'relay', x: 900, y: 400, targets: [] }]
  level.mechanisms = [{ id: 'gate', kind: 'gate', x: 790, y: 620, w: 20, h: 300, travel: 300 }]
  level.goal = { ...level.goal, id: 'exit', power: 'switched' }
  const source = { kind: 'level-gauge', index: 0 }
  assert.ok(switchSources(level).some(s => s.kind === 'level-gauge' && s.index === 0))
  const targets = ['west:fill', 'east:drain', 'relay', 'gate', 'lamp', 'exit']
  const wired = setSwitchTargets(level, source, targets)
  assert.deepEqual(wired.levelGauges[0].targets, targets)
  assert.deepEqual(parseLevel(wired), wired)
  const states = createRun({ ...copyLevel(wired), gravityPlates: wired.gravityPlates.map(p => ({ ...p, waterLevel: 100 })) }).switchStates
  for (const id of targets) assert.equal(states.get(id), true, id)
})

test('studio placement, labels, editing, copies and deletion keep level gauges', () => {
  const placed = addItem(locks({ gauges: [] }), 'level-gauge', { x: 300, y: 600 }, { x: 300, y: 600 })
  const { selection } = placed, level = placed.level
  assert.deepEqual(selection, { kind: 'level-gauge', index: 0 })
  assert.deepEqual(level.levelGauges, [{ id: level.levelGauges[0].id, x: 300, y: 600, targets: [] }])
  assert.ok(allSelections(level).some(s => s.kind === 'level-gauge'))
  assert.equal(defaultObjectLabel(level, selection), 'Level gauge 1')
  assert.deepEqual(itemBounds(level, selection), levelGaugeBounds(level.levelGauges[0]))
  const b = levelGaugeBounds(level.levelGauges[0])
  assert.ok(b.w <= 30 && b.h <= 130, 'a compact footprint')
  for (const [x, y] of [[300, 600], [300, b.y + 2], [b.x + 1, 600]]) assert.deepEqual(hitItem(level, x, y, 1), selection)
  const named = renameItem(level, selection, 'West lock')
  const wired = setSwitchTargets(named, selection, ['lamp', 'west:fill'])
  const moved = moveItem(wired, selection, 40, -80)
  assert.equal(moved.levelGauges[0].x, 340); assert.equal(moved.levelGauges[0].y, 520)
  const low = moveItem(moved, selection, 0, 1000)
  assert.equal(low.levelGauges[0].y, low.floor, 'the mark may go down to the floor')
  const edited = editLevelGauge(moved, 0, { activeWhen: 'below' })
  assert.equal(edited.levelGauges[0].activeWhen, 'below')
  assert.equal('activeWhen' in editLevelGauge(edited, 0, { activeWhen: 'above' }).levelGauges[0], false, 'the default is omitted')
  const copied = copyForEditing(edited)
  assert.notEqual(copied.levelGauges[0].id, edited.levelGauges[0].id)
  assert.deepEqual(copied.levelGauges[0].targets, [copied.wallLights[0].id, `${copied.gravityPlates[0].id}:fill`])
  assert.notEqual(copied.gravityPlates[0].id, 'west')
  const pasted = pasteSelections(edited, copySelections(edited, [selection, { kind: 'wall-light', index: 0 }]), 0, 0).level
  assert.equal(pasted.levelGauges.length, 2)
  assert.deepEqual(pasted.levelGauges[1].targets, [pasted.wallLights[1].id, 'west:fill'])
  const duplicated = duplicateItem(edited, selection).level
  assert.notEqual(duplicated.levelGauges[0].id, duplicated.levelGauges[1].id)
  assert.deepEqual(duplicated.levelGauges[1].targets, edited.levelGauges[0].targets)
  assert.deepEqual(deleteItem(edited, { kind: 'wall-light', index: 0 }).levelGauges[0].targets, ['west:fill'])
  assert.equal(deleteItem(edited, selection).levelGauges.length, 0)
  const resized = resizeLevelHeight(edited, 1020)
  assert.equal(resized.levelGauges[0].y, edited.levelGauges[0].y + 100)
  for (const candidate of [wired, moved, low, edited, copied, pasted, duplicated, resized]) assert.deepEqual(parseLevel(candidate), candidate)
})

/**
 * Equal 400 × 400 pools with a 36% low water mark, pumping at 15% per second: 0.125% a frame,
 * which divides the 64% working range into 512 whole frames.
 */
function transfer(levels, routes) {
  const level = blankTrial()
  const ids = Object.keys(levels)
  level.gravityPlates = ids.map((id, i) => ({ id, x: 60 + i * 560, y: 420, w: 400, h: 400, effect: 'water', gravity: -1, waterLevel: levels[id], waterMinLevel: 36, waterRate: 15 }))
  const low = 420 + 400 * .64
  level.levelGauges = [], level.logicRelays = []
  for (const [i, [from, to]] of routes.entries()) {
    const relay = `move-${from}-${to}`, a = level.gravityPlates.find(p => p.id === from), b = level.gravityPlates.find(p => p.id === to)
    // On while neither the source reads empty nor the destination reads full.
    level.logicRelays.push({ id: relay, x: 900, y: 120 + i * 60, switchLogic: 'or', switchReversed: true, targets: [`${from}:drain`, `${to}:fill`] })
    level.levelGauges.push({ id: `${from}-empty-${i}`, x: a.x + 20 + i * 40, y: low, activeWhen: 'below', targets: [relay] })
    level.levelGauges.push({ id: `${to}-full-${i}`, x: b.x + b.w - 20 - i * 40, y: 420, targets: [relay] })
  }
  return parseLevel(level)
}
const volume = run => run.water.pools.reduce((sum, pool) => sum + effectiveWaterLevel(pool), 0)

test('a guarded transfer stops on whole frames: the source exactly at its low mark, the destination exactly full', () => {
  assert.equal(STEP, 1 / 120); assert.equal(WATER_LEVEL_STEP, 1 / 30)
  for (let phase = 0; phase < 4; phase++) {
    const run = createRun(transfer({ source: 100, destination: 36 }, [['source', 'destination']]))
    // Start the transfer at each frame phase of the 30 Hz water step.
    run.water.accumulator = phase * STEP
    const [source, destination] = run.water.pools, total = volume(run)
    let frames = 0
    for (let i = 0; i < 120 * 6; i++) {
      if (run.switchStates.get('source:drain')) frames++
      stepRun(run, NEUTRAL_INPUT)
      assert.equal(volume(run), total, `phase ${phase}, frame ${i}: water is conserved`)
    }
    assert.equal(frames, 512, `phase ${phase}`)
    assert.equal(source.level, 36); assert.equal(destination.level, 100)
    assert.equal(source.pending, 0); assert.equal(destination.pending, 0)
    assert.equal(run.switchStates.get('source:drain'), false); assert.equal(run.switchStates.get('destination:fill'), false)
    assert.deepEqual(run.levelGauges.map(g => g.active), [true, true], 'both gauges read their marks')
  }
})

test('a chained transfer through a holding pool conserves the total', () => {
  for (let phase = 0; phase < 4; phase++) {
    const run = createRun(transfer({ a: 100, b: 50, c: 36 }, [['a', 'b'], ['b', 'c']]))
    run.water.accumulator = phase * STEP
    const [a, b, c] = run.water.pools, total = volume(run)
    for (let i = 0; i < 120 * 6; i++) {
      stepRun(run, NEUTRAL_INPUT)
      assert.equal(volume(run), total, `phase ${phase}, frame ${i}`)
      assert.equal(effectiveWaterLevel(b), 50, 'B fills and drains at once, so it holds')
    }
    assert.deepEqual([a.level, b.level, c.level], [36, 50, 100])
    assert.equal(run.switchStates.get('move-a-b'), false); assert.equal(run.switchStates.get('move-b-c'), false)
  }
})

test('a gauge marked below the lowest its pool can drain to is reported', () => {
  // Snapping Locks to the grid once left lock 2's low mark at 655.28 (y 510, h 227, low 36%)
  // and its gauge at 660, so the gate it fed could never open.
  const level = { ...blankTrial(), gravityPlates: [{ id: 'lock2', effect: 'water', x: 600, y: 510, w: 380, h: 227, waterLevel: 36, waterMinLevel: 36, waterRate: 24 }],
    levelGauges: [{ id: 'low', x: 760, y: 660, activeWhen: 'below', targets: [] }, { id: 'high', x: 800, y: 700, targets: [] }] }
  const problems = levelProblems(level).filter(issue => /lowest its pool drains to/.test(issue))
  assert.equal(problems.length, 2)
  assert.match(problems[0], /never switches on/); assert.match(problems[1], /never switches off/)
  const aligned = { ...level, gravityPlates: [{ ...level.gravityPlates[0], y: 500, h: 250, waterMinLevel: 40, waterLevel: 40 }],
    levelGauges: [{ ...level.levelGauges[0], y: 650 }, { ...level.levelGauges[1], y: 500 }] }
  assert.deepEqual(levelProblems(aligned).filter(issue => /lowest its pool drains to/.test(issue)), [], 'marks at the low and full levels are fine')
})
