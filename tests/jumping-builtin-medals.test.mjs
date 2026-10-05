import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createRun, stepRun } from '../src/games/jumping/challenge.ts'
import { parseLevel } from '../src/games/jumping/level.ts'
import { NEUTRAL_INPUT, STEP } from '../src/games/jumping/model.ts'
import { resolveSwitchStates } from '../src/games/jumping/switchPower.ts'
import { propLoadsPlate } from '../src/games/jumping/propGeometry.ts'

const root = new URL('../public/levels/jumping/', import.meta.url)
const catalog = JSON.parse(await readFile(new URL('index.json', root), 'utf8'))
const recordings = JSON.parse(await readFile(new URL('fixtures/jumping-builtin-medal-runs.json', import.meta.url), 'utf8'))

test('every built-in level has one fresh-start medal recording', () => {
  assert.equal(recordings.version, 1)
  assert.deepEqual(recordings.runs.map(run => run.file).sort(), [...catalog.levels].sort())
})

// These are fresh-start control recordings against the deployed JSON assets.
// They do not teleport actors, bypass switches, or substitute legacy fixture maps.
for (const recording of recordings.runs) test(`built-in gold route: ${recording.file}`, async () => {
  assert.ok(catalog.levels.includes(recording.file))
  const level = parseLevel(JSON.parse(await readFile(new URL(recording.file, root), 'utf8')))
  const run = createRun(level)
  let entryTime
  let jammedGate = false
  let jammedFrontGate = false
  let gravityStarted = false
  let gravityReleased = false
  const weighted = plate => run.props.filter(prop => propLoadsPlate(prop, plate.x, plate.y, plate.w, plate.ceiling))
  for (const { frames, input } of recording.trace) {
    assert.ok(Number.isInteger(frames) && frames > 0)
    assert.ok(Object.keys(input).every(key => key in NEUTRAL_INPUT))
    const controls = { ...NEUTRAL_INPUT, ...input }
    for (let frame = 0; frame < frames; frame++) {
      assert.equal(run.finished, false, 'recording must end at completion')
      stepRun(run, controls)
      if (entryTime === undefined && run.exit) entryTime = run.activeTime
      if (recording.file === '06.json' && !run.mechanisms[0].active
        && run.mechanisms[0].y < 601 && run.props[0].x > 500 && run.props[0].y < 801) jammedGate = true
      if (recording.file === 'Tower II.jump-level.json' && !run.mechanisms[0].active
        && run.mechanisms[0].safetyHold !== null && run.props.some(prop => prop.x > 300 && prop.x < 400 && prop.y > 1900)) jammedFrontGate = true
      if (recording.file === 'rampingup.jump-level.json') {
        if (run.gravityField.mask) gravityStarted = true
        else if (gravityStarted) gravityReleased = true
      }
    }
  }
  assert.ok(entryTime !== undefined, 'the player must enter the powered doorway')
  assert.equal(run.finished, true)
  assert.equal(run.medal, 'Gold', `clock ${run.elapsed.toFixed(2)} exceeds gold ${level.times.gold}`)
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
  if (recording.file === '01.json') {
    assert.equal(weighted(level.triggers[0]).length, 1, 'the ball must keep the remote exit powered')
  }
  if (recording.file === 'jk.jump-level.json') {
    assert.deepEqual(weighted(level.triggers[1]), [run.props[2]], 'the small ball must hold the exit plate')
    const lift = run.mechanisms[0]
    assert.equal(lift.active, false, 'release the elevator plate after raising the crate')
    assert.ok(propLoadsPlate(run.props[0], lift.x, lift.y, lift.definition.w), 'leave the crate on the elevator')
    assert.ok(lift.y < lift.definition.y - 200 && lift.y > lift.definition.y - 400, 'stop the crate beside the chute')
    assert.ok(Math.abs(run.props[1].x - level.props[1].x) < 10 && run.props[1].y < level.floor - 350,
      'leave the large ball on its upper ledge')
  }
  if (recording.file === 'rampingup.jump-level.json') {
    assert.ok(gravityStarted && gravityReleased, 'activate and release gravity before landing cargo')
    assert.equal(run.coinsCollected, 10)
    assert.ok(weighted(level.triggers[1]).length > 0, 'a ball must take over the pressure plate')
  }
  if (recording.file === 'Tower.jump-level.json') {
    const outside = weighted(level.triggers.find(plate => plate.x === 40 && plate.y === 2000))
    const lobby = weighted(level.triggers.find(plate => plate.x === 580 && plate.y === 2000))
    assert.equal(outside.length, 1)
    assert.equal(lobby.length, 1)
    assert.notEqual(outside[0], lobby[0], 'use two separate balls for the lobby gate and outside exit plate')
  }
  if (recording.file === 'Tower II.jump-level.json') {
    assert.equal(run.coinsCollected, 8)
    assert.ok(jammedFrontGate, 'cargo must block the closing front gate during delivery')
    assert.equal(weighted(level.triggers.find(plate => plate.name === 'outside')).length, 1)
  }
  if (recording.file === 'spelunk1.jump-level.json') {
    assert.equal(run.coinsCollected, 3)
    assert.deepEqual(run.triggers.slice(1, 5).map(button => button.active), [false, true, false, true])
    assert.equal(weighted(level.triggers[5]).length, 1, 'the ball must hold the exit plate')
  }
})

test('Spelunk I accepts buttons 2 and 4 alone across all four-button patterns', async () => {
  const level = parseLevel(JSON.parse(await readFile(new URL('spelunk1.jump-level.json', root), 'utf8')))
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
