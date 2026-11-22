import test from 'node:test'
import assert from 'node:assert/strict'
import { blankTrial, copyLevel, levelProblems, parseLevel } from '../src/games/jumping/level.ts'
import { createRun, createPreviewRun, stepRun } from './helpers/jumping-active-run.mjs'
import { NEUTRAL_INPUT } from '../src/games/jumping/model.ts'
import { gateSeated } from '../src/games/jumping/mechanisms.ts'
import { GAUGE_MARK_SPACING, addItem, deleteItem, duplicateItem, editLevelGauge, hitItem, itemBounds, moveItem, resizeLevelHeight, setSwitchTargets, setWallWiring } from '../src/games/jumping/editor.ts'
import { copySelections, moveSelections, pasteSelections } from '../src/games/jumping/editorSelection.ts'
import { copyForEditing } from '../src/games/jumping/puzzleEditor.ts'
import { levelGaugeBounds, levelGaugeLamps, levelGaugeStates } from '../src/games/jumping/levelGauge.ts'
import { effectiveWaterLevel, waterSurfaceY } from '../src/games/jumping/waterLevel.ts'
import { resolveSwitchStates, switchSources } from '../src/games/jumping/switchPower.ts'
import { wallWireEnergized, wallWires } from '../src/games/jumping/wallWiring.ts'

/** A 400-high pool from y 420 to 820 with a 36% low water mark (y 676), 15% a second: 0.125% a frame. */
function tank({ waterLevel = 36, gauge = {}, triggers = [] } = {}) {
  const level = blankTrial()
  level.gravityPlates = [{ id: 'pool', x: 200, y: 420, w: 400, h: 400, effect: 'water', gravity: -1, waterLevel, waterMinLevel: 36, waterRate: 15 }]
  level.wallLights = [{ id: 'empty-lamp', x: 900, y: 200 }, { id: 'full-lamp', x: 1000, y: 200 }]
  level.levelGauges = [{ id: 'gauge', x: 300, low: { y: 676, targets: ['empty-lamp'] }, high: { y: 420, targets: ['full-lamp'] }, ...gauge }]
  level.triggers = triggers
  return level
}
const toggle = (x, targets, startsOn) => ({ x, y: 920, w: 100, mode: 'weight', behavior: 'toggle', targets, ...(startsOn ? { startsOn } : {}) })
const steps = (run, frames, each = () => {}) => { for (let i = 0; i < frames; i++) { stepRun(run, NEUTRAL_INPUT); each(i) } }

test('two-mark gauges parse in both file versions and reject mixed or malformed marks', () => {
  const level = tank()
  assert.deepEqual(parseLevel(level), level)
  assert.deepEqual(parseLevel(JSON.parse(JSON.stringify(level))), level)
  assert.deepEqual(parseLevel({ ...copyLevel(level), version: 2, lighting: { nightMode: false, ambient: 0, lights: [] } }).levelGauges, level.levelGauges)
  assert.deepEqual(parseLevel(tank({ gauge: { low: { y: 676 }, high: { y: 420 } } })).levelGauges[0], { id: 'gauge', x: 300, low: { y: 676, targets: [] }, high: { y: 420, targets: [] } })
  assert.ok(parseLevel(tank({ gauge: { high: { y: 656, targets: [] } } })), 'marks 20 apart')
  const bad = [{ y: 500 }, { targets: [] }, { activeWhen: 'below' }, { high: undefined }, { low: undefined }, { high: { y: 660, targets: [] } },
    { high: { y: 700, targets: [] } }, { low: { y: 676, targets: [], activeWhen: 'below' } }, { low: { y: 676, targets: 'empty-lamp' } },
    { low: { y: 676, targets: ['empty-lamp', 'empty-lamp'] } }, { low: { y: 676, targets: ['missing'] } }, { high: { y: 'top', targets: [] } }, { low: 676 },
    { switchReversed: true }, { high: { y: 30, targets: [] } }, { low: { y: 921, targets: [] } }]
  for (const gauge of bad) assert.throws(() => parseLevel(tank({ gauge })), undefined, JSON.stringify(gauge))
})

test('the studio reports marks outside the pool and a low mark the pool never drains to', () => {
  const name = '“Level gauge 1”'
  assert.deepEqual(levelProblems(parseLevel(tank())), [])
  assert.deepEqual(levelProblems(parseLevel(tank({ gauge: { low: { y: 860, targets: [] }, high: { y: 600, targets: [] } } }))), [`Put the low mark of ${name} inside a pool.`])
  assert.deepEqual(levelProblems(parseLevel(tank({ gauge: { high: { y: 380, targets: [] } } }))), [`Put the high mark of ${name} in the same pool as its low mark.`])
  assert.deepEqual(levelProblems(parseLevel(tank({ gauge: { low: { y: 700, targets: [] } } }))),
    [`The low mark of ${name} is below the lowest its pool drains to (676), so it never switches on. Move it to the pool's low water mark.`])
})

test('each contact switches on the exact frame the pumped water reaches its mark, and EMP opens both', () => {
  const level = parseLevel(tank({ triggers: [toggle(1300, ['pool:fill'], true), toggle(1500, ['pool:drain'])] }))
  const run = createRun(level), [pool] = run.water.pools, gauge = run.levelGauges[0]
  const check = i => {
    const surface = waterSurfaceY(pool.definition, effectiveWaterLevel(pool))
    assert.equal(gauge.active, surface >= 676, `frame ${i}: low contact`); assert.equal(gauge.highActive, surface <= 420, `frame ${i}: high contact`)
    assert.equal(run.switchStates.get('empty-lamp'), gauge.active); assert.equal(run.switchStates.get('full-lamp'), gauge.highActive)
  }
  assert.deepEqual([gauge.active, gauge.highActive], [true, false])
  let flips = 0, before = [gauge.active, gauge.highActive]
  const count = i => { check(i); if (gauge.active !== before[0] || gauge.highActive !== before[1]) flips++; before = [gauge.active, gauge.highActive] }
  steps(run, 600, count)
  assert.equal(pool.level, 100); assert.deepEqual([gauge.active, gauge.highActive], [false, true])
  run.triggers[0].active = false; run.triggers[1].active = true
  steps(run, 600, count)
  assert.equal(pool.level, 36); assert.deepEqual([gauge.active, gauge.highActive], [true, false])
  assert.equal(flips, 4, 'each contact changes once each way')
  run.empRemaining = 1; steps(run, 1)
  assert.deepEqual([gauge.reading, gauge.active, gauge.highActive], [true, false, false])
  steps(run, 130); assert.equal(gauge.active, true)
  // Starting full, both readings come from the authored level on frame one and in previews.
  const full = parseLevel(tank({ waterLevel: 100 }))
  assert.deepEqual([createRun(full).levelGauges[0].active, createRun(full).levelGauges[0].highActive], [false, true])
  assert.deepEqual(levelGaugeStates(full), [{ active: false, highActive: true }])
  assert.deepEqual(levelGaugeStates(full, [36]), [{ active: true, highActive: false }], 'saved levels')
})

test('each mark is its own source for wiring, previews, deletion and copies', () => {
  const level = parseLevel(tank({ gauge: { showWires: true } }))
  const kinds = switchSources(level).filter(s => s.index === 0 && s.kind.startsWith('level-gauge')).map(s => s.kind)
  assert.deepEqual(kinds, ['level-gauge-low', 'level-gauge-high'])
  const wires = wallWires(level)
  assert.deepEqual(wires.map(w => w.source.kind), ['level-gauge-low', 'level-gauge-high'])
  assert.deepEqual(wires.map(w => wallWireEnergized(level, w, createPreviewRun(level))), [true, false])
  const both = setSwitchTargets(setSwitchTargets(level, { kind: 'level-gauge-low', index: 0 }, ['empty-lamp', 'pool:fill']), { kind: 'level-gauge-high', index: 0 }, ['full-lamp', 'pool:drain'])
  assert.deepEqual([both.levelGauges[0].low.targets, both.levelGauges[0].high.targets], [['empty-lamp', 'pool:fill'], ['full-lamp', 'pool:drain']])
  assert.equal(resolveSwitchStates(both, [], [], undefined, [{ active: false, highActive: true }]).get('pool:drain'), true)
  assert.equal(resolveSwitchStates(both, [], [], undefined, [{ active: false, highActive: true }]).get('pool:fill'), false)
  assert.deepEqual(deleteItem(both, { kind: 'wall-light', index: 1 }).levelGauges[0].high.targets, ['pool:drain'])
  assert.throws(() => parseLevel({ ...copyLevel(both), wallLights: [] }), /low mark of/)
  const copied = copyForEditing(both), lamps = copied.wallLights.map(l => l.id), pool = copied.gravityPlates[0].id
  assert.deepEqual([copied.levelGauges[0].low.targets, copied.levelGauges[0].high.targets], [[lamps[0], `${pool}:fill`], [lamps[1], `${pool}:drain`]])
  const pasted = pasteSelections(both, copySelections(both, [{ kind: 'level-gauge', index: 0 }, { kind: 'wall-light', index: 0 }]), 0, 0).level
  assert.deepEqual(pasted.levelGauges[1].low.targets, [pasted.wallLights[2].id, 'pool:fill'])
  assert.deepEqual(pasted.levelGauges[1].high.targets, ['full-lamp', 'pool:drain'])
  const duplicated = duplicateItem(both, { kind: 'level-gauge', index: 0 }).level
  assert.notEqual(duplicated.levelGauges[1].low, duplicated.levelGauges[0].low)
  assert.deepEqual(duplicated.levelGauges[1].high.targets, both.levelGauges[0].high.targets)
  const unwired = setWallWiring(both, { kind: 'level-gauge', index: 0 }, false)
  assert.equal(unwired.levelGauges[0].showWires, undefined); assert.deepEqual(wallWires(unwired), [])
  for (const candidate of [both, copied, pasted, duplicated]) assert.deepEqual(parseLevel(candidate), candidate)
})

test('studio: new gauges have one snapped mark; marks convert both ways; moves carry both marks', () => {
  const placed = addItem(tank({ gauge: undefined }), 'level-gauge', { x: 303, y: 602 }, { x: 303, y: 602 })
  const single = placed.level.levelGauges.at(-1)
  assert.deepEqual([single.x, single.y, single.low], [305, 600, undefined])
  // At or above: the mark becomes the high mark and keeps its connections; the low mark goes 150 below.
  let level = parseLevel(tank({ gauge: { low: undefined, high: undefined, y: 450, targets: ['full-lamp'] } }))
  let two = editLevelGauge(level, 0, { marks: 'two' }).levelGauges[0]
  assert.deepEqual(two, { id: 'gauge', x: 300, low: { y: 450 + GAUGE_MARK_SPACING, targets: [] }, high: { y: 450, targets: ['full-lamp'] } })
  // Held inside the pool: a mark near the low water mark gets its partner at the low water mark.
  two = editLevelGauge(parseLevel(tank({ gauge: { low: undefined, high: undefined, y: 600, targets: [] } })), 0, { marks: 'two' }).levelGauges[0]
  assert.deepEqual([two.high.y, two.low.y], [600, 675])
  // At or below: the mark becomes the low mark; the high mark goes 150 above.
  level = parseLevel(tank({ gauge: { low: undefined, high: undefined, y: 676, activeWhen: 'below', targets: ['empty-lamp'] } }))
  const converted = editLevelGauge(level, 0, { marks: 'two' })
  assert.deepEqual(converted.levelGauges[0].low, { y: 676, targets: ['empty-lamp'] })
  assert.equal(converted.levelGauges[0].high.y, 525)
  assert.deepEqual(levelProblems(converted), [])
  // Back to one keeps the mark with connections: here the low mark, At or below.
  assert.deepEqual(editLevelGauge(converted, 0, { marks: 'one' }).levelGauges[0], level.levelGauges[0])
  // With both or neither connected, the high mark stays, At or above.
  const wired = setSwitchTargets(converted, { kind: 'level-gauge-high', index: 0 }, ['full-lamp'])
  assert.deepEqual(editLevelGauge(wired, 0, { marks: 'one' }).levelGauges[0], { id: 'gauge', x: 300, y: 525, targets: ['full-lamp'] })
  // Mark heights keep the high mark at least 20 above the low mark.
  const base = parseLevel(tank())
  assert.equal(editLevelGauge(base, 0, { highY: 690 }).levelGauges[0].high.y, 656)
  assert.equal(editLevelGauge(base, 0, { lowY: 430 }).levelGauges[0].low.y, 440)
  assert.equal(editLevelGauge(base, 0, { lowY: 640 }).levelGauges[0].low.y, 640)
  // Moving the gauge moves both marks, alone, in a group and with the room.
  const selection = { kind: 'level-gauge', index: 0 }
  const b = levelGaugeBounds(base.levelGauges[0]), lamps = levelGaugeLamps(base.levelGauges[0])
  assert.deepEqual(itemBounds(base, selection), b)
  assert.ok(lamps.foot.y > 676 && lamps.head.y < 420 && b.y + b.h > lamps.foot.y, 'bounds run from head to foot')
  for (const [x, y] of [[300, 430], [300, 650], [lamps.foot.x, lamps.foot.y]]) assert.deepEqual(hitItem(base, x, y, 1), selection)
  const moved = moveItem(base, selection, 20, -40).levelGauges[0]
  assert.deepEqual([moved.x, moved.low.y, moved.high.y], [320, 636, 380])
  const grouped = moveSelections(base, [selection, { kind: 'wall-light', index: 0 }], 10, 10).levelGauges[0]
  assert.deepEqual([grouped.x, grouped.low.y, grouped.high.y], [310, 686, 430])
  const taller = resizeLevelHeight(base, 1020).levelGauges[0]
  assert.deepEqual([taller.low.y, taller.high.y], [776, 520])
  assert.equal(moveItem(base, selection, 0, -1000).levelGauges[0].high.y, 420 - b.y, 'the head stops at the top of the level')
})

/**
 * Two locks in a flight, one two-mark gauge each: the lower lock fills to its full height (y 420),
 * where the upper lock's low water mark sits. The gate between them ANDs the lower lock's high
 * contact, the upper lock's low contact and "no transfer requested". Transfers wait on the gate's
 * shut contact and stop at the gauges.
 */
function flight() {
  const level = blankTrial()
  const pool = (id, x, y, waterLevel, waterMinLevel) => ({ id, x, y, w: 400, h: 400, effect: 'water', gravity: -1, waterLevel, waterMinLevel, waterRate: 15 })
  level.gravityPlates = [pool('lower', 100, 420, 50, 36), pool('upper', 520, 220, 100, 50)]
  level.levelGauges = [
    { id: 'lower-gauge', x: 140, low: { y: 676, targets: ['guard-up'] }, high: { y: 420, targets: ['level', 'guard-down'] } },
    { id: 'upper-gauge', x: 880, low: { y: 420, targets: ['level', 'guard-down'] }, high: { y: 220, targets: ['guard-up'] } },
  ]
  const relay = (id, i, targets, settings) => ({ id, x: 1200, y: 100 + i * 60, targets, ...settings })
  level.logicRelays = [
    relay('level', 0, ['gate'], { switchLogic: 'and' }),
    relay('idle', 1, ['gate'], { switchLogic: 'or', switchReversed: true }),
    relay('guard-down', 2, ['down'], { switchLogic: 'or', switchReversed: true }),
    relay('guard-up', 3, ['up'], { switchLogic: 'or', switchReversed: true }),
    relay('down', 4, ['upper:drain', 'lower:fill'], { switchLogic: 'and' }),
    relay('up', 5, ['lower:drain', 'upper:fill'], { switchLogic: 'and' }),
  ]
  level.platforms = [{ x: 440, y: 820, w: 140, h: 100 }]
  level.mechanisms = [{ id: 'gate', kind: 'gate', x: 500, y: 620, w: 20, h: 200, travel: 200, switchLogic: 'and', shutTargets: ['down', 'up'] }]
  level.triggers = [toggle(1300, ['down', 'idle']), toggle(1500, ['up', 'idle'])]
  return parseLevel(level)
}

test('a two-lock flight with one two-mark gauge per lock levels the water before the gate opens', () => {
  const level = flight()
  assert.deepEqual(levelProblems(level), [])
  const run = createRun(level), gate = run.mechanisms[0], [lower, upper] = run.water.pools
  const surface = pool => waterSurfaceY(pool.definition, effectiveWaterLevel(pool))
  const total = effectiveWaterLevel(lower) + effectiveWaterLevel(upper)
  let opened = 0
  const check = i => {
    assert.equal(effectiveWaterLevel(lower) + effectiveWaterLevel(upper), total, `frame ${i}: conserved`)
    if (!gateSeated(gate)) { opened++; assert.deepEqual([surface(lower), surface(upper)], [420, 420], `frame ${i}: level water under an open gate`) }
  }
  steps(run, 10, check)
  run.triggers[0].active = true
  steps(run, 120 * 5, check)
  assert.deepEqual([lower.level, upper.level], [100, 50]); assert.equal(gateSeated(gate), true, 'the request holds the gate')
  run.triggers[0].active = false
  steps(run, 120 * 3, check)
  assert.ok(opened > 0); assert.equal(gate.y, 420)
  run.triggers[1].active = true
  let sealed = -1
  steps(run, 120 * 8, i => {
    check(i)
    if (sealed < 0 && gateSeated(gate)) sealed = i
    if (sealed < 0) assert.deepEqual([effectiveWaterLevel(lower), effectiveWaterLevel(upper)], [100, 50], 'nothing moves before the seal')
  })
  assert.ok(sealed > 120 * 2)
  assert.deepEqual([lower.level, upper.level], [50, 100], 'the upper lock fills; the lower lock gives 50%')
  assert.equal(gateSeated(gate), true)
})
