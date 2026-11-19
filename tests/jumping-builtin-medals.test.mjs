import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createRun, stepRun } from './helpers/jumping-active-run.mjs'
import { parseLevel } from '../src/games/jumping/level.ts'
import { NEUTRAL_INPUT, STEP } from '../src/games/jumping/model.ts'
import { resolveSwitchStates } from '../src/games/jumping/switchPower.ts'
import { propLoadsPlate } from '../src/games/jumping/propGeometry.ts'
import { builtinLevels, readBuiltinLevel } from './helpers/jumping-builtin-levels.mjs'

const root = new URL('../public/levels/jumping/', import.meta.url)
const catalog = JSON.parse(await readFile(new URL('index.json', root), 'utf8'))
const recordings = JSON.parse(await readFile(new URL('fixtures/jumping-builtin-medal-runs.json', import.meta.url), 'utf8'))
const historicalLevels = JSON.parse(await readFile(new URL('fixtures/jumping/course-regression-levels.json', import.meta.url), 'utf8'))
// Recordings name their level by its durable id (`level`), so renaming or retitling a level keeps its evidence.
const levelId = file => builtinLevels().find(level => level.file === file).id
const catalogIds = catalog.levels.map(levelId)
const levelName = id => builtinLevels().find(level => level.id === id)?.name ?? id
/** Levels whose routes check something of their own. */
const LEVEL = { balls: 'be6bf80d-c9fe-42a7-9eeb-fb304e1b1878', five: '0c899985-9bba-44ef-bb9b-ef2cfba7d6bd', jk: '5adc6677-fb33-4064-a4ce-507e37130bc4',
  rampingUp: 'f647e38f-d47e-4628-b322-b89e98882202', tower: '16f44bef-1ff7-42d7-ad5a-f8966310cd4b', towerII: '105e88ac-240d-49b1-b45d-4cc9c225b32e',
  exitI: '13b9b9d7-7937-4989-bc03-21238e7e58f2', buoyancy: '7fdfaebe-18c3-431e-b9f4-3faba6b18cfe', waterline: 'ecbb07bd-b1dd-476c-b09b-82eb321515e9' }
const untimed = []
for (const file of catalog.levels) {
  const level = parseLevel(JSON.parse(await readFile(new URL(file, root), 'utf8')))
  if (level.timing === 'untimed') untimed.push(level.id)
}

test('every built-in level has one medal recording, an explicit pending audit, or an authored untimed mode', () => {
  assert.equal(recordings.version, 2)
  assert.equal(recordings.jumpModel, 'recorded-impulses')
  const pending = recordings.pendingAudit ?? []
  for (const audit of pending) assert.ok(typeof audit.reason === 'string' && audit.reason.trim().length > 0, 'pending audits explain the missing evidence')
  // Keep all recorded routes strict. Adding a level must explicitly record a
  // route or acknowledge its unverified medal times; never silently skip it.
  const accounted = [...recordings.runs.map(run => run.level), ...pending.map(audit => audit.level), ...untimed]
  assert.equal(new Set(accounted).size, accounted.length, 'each level has exactly one audit status')
  assert.deepEqual(accounted.map(levelName).sort(), catalogIds.map(levelName).sort())
  assert.deepEqual(accounted.sort(), [...catalogIds].sort())
  for (const completion of recordings.completionRuns ?? []) {
    assert.ok(pending.some(audit => audit.level === completion.level), 'completion-only evidence must retain an explicit pending A audit')
    assert.ok(['B', 'C', 'D'].includes(completion.grade), 'completion-only evidence records its actual passing grade')
  }
  for (const historical of recordings.historicalRuns ?? []) {
    assert.ok(pending.some(audit => audit.level === historical.level), 'historical evidence cannot certify a revised live level')
    assert.ok(historicalLevels.levels[historical.file], 'historical routes retain their captured layout')
  }
  for (const superseded of recordings.supersededRuns ?? []) {
    assert.ok(pending.some(audit => audit.level === superseded.level), 'superseded evidence cannot certify a revised live level')
    assert.ok(superseded.reason?.trim() && superseded.trace.length > 0, 'retain the old route and explain why it no longer certifies the level')
  }
  for (const retired of recordings.retiredRuns ?? []) {
    assert.ok(!catalogIds.includes(retired.level), 'retired evidence cannot replace an active level audit')
    assert.ok(retired.reason?.trim() && retired.trace.length > 0, 'retain the retired route with its reason')
  }
})

// Historical routes preserve their jump impulses for contact/mechanism coverage.
// Revised live levels retain an explicit pending audit; their captured routes
// protect contact behavior without certifying the new layout or its grade times.
// Re-audited routes explicitly opt into current tap/hold controls.
const routes = [
  ...[...recordings.runs, ...recordings.completionRuns ?? []].map(recording => ({ recording, historical: false })),
  ...(recordings.historicalRuns ?? []).map(recording => ({ recording, historical: true })),
]
for (const { recording, historical } of routes) test(`${historical ? 'captured' : 'built-in'} ${recording.jumpModel ?? recordings.jumpModel} route: ${historical ? recording.file : levelName(recording.level)}`, async () => {
  assert.ok(catalogIds.includes(recording.level))
  const level = parseLevel(historical
    ? structuredClone(historicalLevels.levels[recording.file])
    : readBuiltinLevel(recording.level))
  const run = createRun(level)
  let entryTime
  let jammedGate = false
  let jammedFrontGate = false
  let gravityStarted = false
  let gravityReleased = false
  let bracedOnBall = false
  let waterFilled = false
  let waterlineUpperControls = false
  const jumpModel = recording.jumpModel ?? recordings.jumpModel
  assert.ok(['recorded-impulses', 'tap-hold'].includes(jumpModel))
  const weighted = plate => run.props.filter(prop => propLoadsPlate(prop, plate.x, plate.y, plate.w, plate.ceiling))
  for (const { frames, input } of recording.trace) {
    assert.ok(Number.isInteger(frames) && frames > 0)
    assert.ok(Object.keys(input).every(key => key in NEUTRAL_INPUT || ['jumpStrength', 'interact', 'use'].includes(key)))
    if (input.jump && jumpModel === 'recorded-impulses') assert.ok(input.jumpStrength >= 0 && input.jumpStrength <= 1)
    if (jumpModel === 'tap-hold') assert.equal('jumpStrength' in input, false)
    const controls = { ...NEUTRAL_INPUT, ...input }
    for (let frame = 0; frame < frames; frame++) {
      assert.equal(run.finished, false, 'recording must end at completion')
      stepRun(run, controls)
      if (entryTime === undefined && run.exit) entryTime = run.activeTime
      if (recording.file === '06.json' && !run.mechanisms[0].active
        && run.mechanisms[0].y < 601 && run.props[0].x > 500 && run.props[0].y < 801) jammedGate = true
      if (recording.level === LEVEL.towerII && !run.mechanisms[0].active
        && run.mechanisms[0].safetyHold !== null && run.props.some(prop => prop.x > 300 && prop.x < 400 && prop.y > 1900)) jammedFrontGate = true
      if (recording.level === LEVEL.rampingUp) {
        if (run.gravityField.mask) gravityStarted = true
        else if (gravityStarted) gravityReleased = true
      }
      if (recording.level === LEVEL.five && run.player.contacts.support?.collider.prop === run.props[0]
        && run.player.contacts.push?.collider.id === 'mechanism:0') bracedOnBall = true
      if (recording.level === LEVEL.buoyancy && run.water.pools[0].level >= 99.9) waterFilled = true
      if (recording.level === LEVEL.waterline && run.player.grounded
        && run.triggers.some((button, index) => button.active && Math.abs(run.player.y - level.triggers[index].y) < 1)) waterlineUpperControls = true
    }
  }
  assert.ok(entryTime !== undefined, 'the player must enter the powered doorway')
  assert.equal(run.finished, true)
  assert.equal(run.grade, recording.grade ?? 'A', `clock ${run.elapsed.toFixed(2)} must retain its recorded grade`)
  assert.ok(Math.abs(run.elapsed - recording.elapsed) < STEP, 'recorded clock time changed')
  assert.ok(Math.abs(run.activeTime - recording.activeTime) < STEP, 'recorded real duration changed')
  assert.equal(run.coinsCollected, recording.coins)
  if (recording.file === '06.json') {
    assert.ok(level.triggers.every(plate => !plate.behavior || plate.behavior === 'pressure'))
    assert.ok(jammedGate, 'the box must hold the unpowered gate open')
    assert.equal(run.triggers[0].active, false)
    assert.equal(run.triggers[1].active, true, 'cargo must hold the mounted exit plate')
    assert.ok(run.props[0].x > 940, 'the box must travel across the gap')
  }
  if (recording.level === LEVEL.balls) {
    assert.deepEqual(weighted(level.triggers[0]), [run.props[2]], 'the freely delivered small ball remains on the plate against the level boundary')
    assert.deepEqual(weighted(level.triggers[1]), [run.props[1]], 'the separate middle ball keeps the second plate loaded')
  }
  if (recording.level === LEVEL.five) {
    assert.ok(bracedOnBall, 'brace on the ball against the exit gate before sending it downhill')
    assert.deepEqual(weighted(level.triggers[0]), [run.props[0]], 'the ball must reach the lower-left gate plate')
    assert.equal(run.triggers[1].active, false, 'the upper box-and-bridge route is unnecessary')
    assert.ok(Math.abs(run.props[1].x - level.props[1].x) < 1, 'leave the box on its upper shelf')
  }
  if (recording.level === LEVEL.jk) {
    assert.deepEqual(weighted(level.triggers[1]), [run.props[2]], 'the small ball must hold the exit plate')
    const lift = run.mechanisms[0]
    assert.equal(lift.active, false, 'release the elevator plate after raising the crate')
    assert.ok(propLoadsPlate(run.props[0], lift.x, lift.y, lift.definition.w), 'leave the crate on the elevator')
    assert.ok(lift.y < lift.definition.y - 200 && lift.y > lift.definition.y - 400, 'stop the crate beside the chute')
    assert.ok(Math.abs(run.props[1].x - level.props[1].x) < 10 && run.props[1].y < level.floor - 350,
      'leave the large ball on its upper ledge')
  }
  if (recording.level === LEVEL.rampingUp) {
    assert.ok(gravityStarted && gravityReleased, 'activate and release gravity before landing cargo')
    assert.equal(run.coinsCollected, 10)
    assert.ok(weighted(level.triggers[1]).length > 0, 'a ball must take over the pressure plate')
  }
  if (recording.level === LEVEL.tower) {
    const outside = weighted(level.triggers.find(plate => plate.name === 'Outside'))
    const lobby = weighted(level.triggers.find(plate => plate.x === 580 && plate.y === 2000))
    assert.equal(outside.length, 1)
    assert.equal(lobby.length, 1)
    assert.notEqual(outside[0], lobby[0], 'use two separate balls for the lobby gate and outside exit plate')
  }
  if (recording.level === LEVEL.towerII) {
    assert.equal(run.coinsCollected, 8)
    assert.ok(jammedFrontGate, 'cargo must block the closing front gate during delivery')
    assert.equal(weighted(level.triggers.find(plate => plate.name === 'outside')).length, 1)
  }
  if (recording.level === LEVEL.exitI) {
    assert.equal(run.coinsCollected, 3)
    assert.deepEqual(run.triggers.slice(1, 5).map(button => button.active), [false, true, false, true])
    assert.equal(weighted(level.triggers[5]).length, 1, 'the ball must hold the exit plate')
  }
  if (recording.level === LEVEL.buoyancy) {
    assert.ok(waterFilled, 'release the heavy ball to fill the reservoir')
    assert.equal(run.water.pools[0].level, 25, 'drain back to the low water mark')
    assert.deepEqual(weighted(level.triggers[0]), [run.props[4]], 'the heavy ball must keep draining')
    assert.deepEqual(weighted(level.triggers[1]), [run.props[1], run.props[2]], 'the delivered floats must keep the exit and gravity lift powered')
    assert.ok(run.pickups.every(pickup => pickup.collectedAge !== null), 'collect both timing rewards')
  }
  if (recording.level === LEVEL.waterline) {
    assert.ok(waterlineUpperControls, 'operate the paired pumps from the upper deck')
    assert.deepEqual(run.floatSwitches.map(float => float.active), [false, true, true, true, true, true, false, false, true],
      'shaft 1 middle, shaft 2 high, shaft 3 low')
    assert.ok(level.wallLights.every(light => run.switchStates.get(light.id)), 'all three readiness lamps must light')
  }
})

test('Waterline accepts only shaft 1 middle, shaft 2 high and shaft 3 low across all float patterns', async () => {
  const level = parseLevel(JSON.parse(await readFile(new URL('Waterline1.jump-level.json', root), 'utf8')))
  const needed = new Map([
    ['Left top', false], ['Left middle', true], ['Left bottom', true],
    ['Centre top', true], ['Centre middle', true], ['Centre bottom', true],
    ['Right top', false], ['Right middle', false], ['Right bottom', true],
  ])
  assert.equal(level.floatSwitches.length, needed.size)
  assert.ok(level.floatSwitches.every(float => needed.has(float.name)))
  for (let mask = 0; mask < 512; mask++) {
    const floats = level.floatSwitches.map((_, index) => ({ active: !!(mask & (1 << index)) }))
    const expected = level.floatSwitches.every((float, index) => floats[index].active === needed.get(float.name))
    assert.equal(resolveSwitchStates(level, level.triggers.map(() => ({ active: false })), floats).get(level.goal.id), expected, `float mask ${mask}`)
  }
})

test('Exit I (once Spelunk I) accepts buttons 2 and 4 alone across all four-button patterns', async () => {
  const level = parseLevel(readBuiltinLevel(LEVEL.exitI))
  for (let value = 0; value < 16; value++) {
    const buttons = level.triggers.map(button => ({ active: !!(value & (1 << (Number(button.name) - 1))) }))
    assert.equal(resolveSwitchStates(level, buttons).get(level.mechanisms[0].id), value === 10, `button mask ${value}`)
  }
})

test('Nine opens for decimal 9 alone across all five-bit patterns', async () => {
  const level = parseLevel(JSON.parse(await readFile(new URL('nine.jump-level.json', root), 'utf8')))
  for (let value = 0; value < 32; value++) {
    const buttons = level.triggers.map(button => ({ active: !!(value & (1 << (Number(button.name) - 1))) }))
    assert.equal(resolveSwitchStates(level, buttons).get(level.goal.id), value === 9, `pattern ${value.toString(2).padStart(5, '0')}`)
  }
})
