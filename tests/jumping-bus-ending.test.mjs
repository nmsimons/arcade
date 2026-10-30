import test from 'node:test'
import assert from 'node:assert/strict'
import { createPlayer, NEUTRAL_INPUT } from '../src/games/jumping/model.ts'
import { createRun, stepRun } from './helpers/jumping-active-run.mjs'
import { createBusDeparture, createBusEnding, busEndingCamera, busEndingFrame, advanceBusEnding, BUS_ENDING_SECONDS, BUS_REAR_PIVOT_Y, BUS_REAR_WHEEL_BOTTOM_Y, BUS_DEPARTURE_START_SECONDS } from '../src/games/jumping/busEnding.ts'
import { parseLevel, levelProblems } from '../src/games/jumping/level.ts'
import { setFinish } from '../src/games/jumping/editor.ts'
import { readLevelAsset } from './helpers/jumping-fixtures.mjs'

const scene = () => createBusEnding(1200, 700, createPlayer({ x: 1224, y: 700 }), { x: 0, y: 0, zoom: 1 })
const busLevel = () => {
  const level = readLevelAsset('walk-off.json')
  level.goal = { kind: 'bus', x: 1080, y: 400 }
  return level
}

test('a bus is an untimed goal with a supported, clear walk-in entrance', () => {
  const level = busLevel()
  assert.deepEqual(parseLevel(JSON.parse(JSON.stringify(level))), level)
  assert.deepEqual(levelProblems(level), [])
  for (const patch of [{ timing: undefined }, { goal: { ...level.goal, flipX: true } }, { goal: { ...level.goal, id: 'bus', power: 'switched' } }])
    assert.throws(() => parseLevel({ ...level, ...patch }))
  assert.ok(levelProblems({ ...level, platforms: [...level.platforms, { x: 1000, y: 280, w: 180, h: 20 }] }).length)
  const selected = setFinish(readLevelAsset('walk-off.json'), 'bus')
  assert.equal(selected.goal.kind, 'bus'); assert.equal(selected.goal.ending, undefined)
  assert.deepEqual(levelProblems(selected), [])
})

for (const rate of [30, 120]) test(`walking onto the bus boards and finishes inside the level at ${rate} Hz`, () => {
  const run = createRun(busLevel())
  for (let i = 0; i < rate * 7 && !run.finished; i++) stepRun(run, { ...NEUTRAL_INPUT, move: 1 }, 1 / rate)
  assert.equal(run.finished, true); assert.ok(run.exit)
  assert.equal(run.player.x, run.level.goal.x - 34)
  assert.ok(run.player.x < run.level.width, 'boarding finishes before the map boundary')
  assert.equal(run.grade, null)
})

test('passing above a bus does not board; its departure starts at the real goal with a fixed camera', () => {
  const run = createRun(busLevel())
  run.player.x = run.level.goal.x - 80; run.player.y = run.level.goal.y - 120; run.player.grounded = false
  stepRun(run, NEUTRAL_INPUT)
  assert.equal(run.exit, null); assert.equal(run.finished, false)
  const camera = { x: 700, y: 100, zoom: .8 }, playerBefore = structuredClone(run.player)
  const ending = createBusDeparture(run.level.goal, run.player, camera)
  assert.equal(ending.elapsed, BUS_DEPARTURE_START_SECONDS)
  assert.equal(busEndingFrame(ending).busX, run.level.goal.x)
  assert.equal(busEndingFrame(ending).playerAlpha, 0)
  advanceBusEnding(ending, 3)
  assert.deepEqual(busEndingCamera(ending, 1280, 800), camera)
  assert.deepEqual(run.player, playerBefore)
})

test('the optional bus ending round-trips and only belongs to a walk-off finish', () => {
  const level = readLevelAsset('walk-off.json'); level.goal.ending = 'bus'
  assert.equal(parseLevel(JSON.parse(JSON.stringify(level))).goal.ending, 'bus')
  assert.equal(setFinish(level, 'walk-off').goal.ending, 'bus')
  for (const kind of ['doorway', 'overlook']) assert.equal(setFinish(level, kind).goal.ending, undefined)
  for (const goal of [{ ...level.goal, ending: 'other' }, { ...level.goal, kind: 'overlook' }])
    assert.throws(() => parseLevel({ ...level, goal }))
})

test('the bus starts lowering at wheel contact with the horizon and keeps shrinking', () => {
  const ending = scene(), frame = t => busEndingFrame({ ...ending, elapsed: t })
  assert.equal(frame(3.8).playerX, frame(4.2).playerX)
  assert.equal(frame(0).busX, frame(8.3).busX); assert.equal(frame(0).busVisible, true)
  assert.equal(frame(0).door, 1); assert.equal(frame(5.3).door, 1)
  assert.equal(frame(5.6).playerAlpha, 0)
  assert.equal(frame(6.2).door, 0)
  assert.equal(frame(5.6).passengerAlpha, 0)
  assert.equal(frame(6.2).passengerAlpha, 1)
  assert.equal(frame(8.3).busScale, 1, 'hold the full-size rear window before driving away')
  assert.equal(frame(8.3).passengerAlpha, 1)
  assert.equal(frame(10).busY, frame(8.3).busY)
  assert.ok(frame(10).busScale < frame(8.3).busScale)
  assert.equal(frame(14).passengerAlpha, 1, 'the passenger does not dissolve during departure')
  assert.equal(frame(14.3).busX, frame(0).busX, 'the bus travels straight away from us')
  let before = 8.3, after = 14.3
  for (let i = 0; i < 40; i++) {
    const mid = (before + after) / 2
    if (frame(mid).beyondHorizon) after = mid; else before = mid
  }
  const contact = frame(after)
  const wheels = contact.busY + (BUS_REAR_WHEEL_BOTTOM_Y - BUS_REAR_PIVOT_Y) * contact.busScale
  assert.ok(Math.abs(wheels - contact.horizonY) < 1e-8, 'the wheel bottoms meet the horizon at the transition')
  assert.ok(Math.abs(contact.busY - frame(8.3).busY) < 1e-8, 'keep the center fixed until contact')
  assert.ok(frame(12.2).busScale < contact.busScale, 'continue shrinking while lowering')
  assert.ok(frame(12.2).busY > contact.busY)
  assert.equal(frame(14).horizonY, ending.ground)
  assert.ok(frame(14).busY + (-166 - BUS_REAR_PIVOT_Y) * frame(14).busScale >= frame(14).horizonY, 'even the roof is hidden before the scene ends')
  assert.equal(frame(BUS_ENDING_SECONDS).busVisible, false); assert.equal(frame(BUS_ENDING_SECONDS).complete, true)
})

test('the cinematic owns its actor and seeking cannot change the finished gameplay player', () => {
  const player = createPlayer({ x: 1224, y: 680 }), before = structuredClone(player)
  const ending = createBusEnding(1200, 700, player, { x: 0, y: 0, zoom: 1 })
  assert.equal(advanceBusEnding(ending, 4), false)
  assert.equal(ending.player.x, 1760); assert.equal(ending.player.y, 700)
  assert.deepEqual(player, before)
  assert.equal(advanceBusEnding(ending, 30), true)
  assert.equal(ending.elapsed, BUS_ENDING_SECONDS)
  assert.equal(advanceBusEnding(ending, 1), true)
})

test('the camera starts at the live view and stays continuous and finite at narrow and wide sizes', () => {
  for (const [width, height] of [[1280, 800], [390, 844], [844, 390]]) {
    const ending = scene()
    assert.deepEqual(busEndingCamera(ending, width, height), ending.camera)
    let before = busEndingCamera(ending, width, height)
    for (let t = 1 / 60; t <= BUS_ENDING_SECONDS; t += 1 / 60) {
      ending.elapsed = t
      const camera = busEndingCamera(ending, width, height)
      assert.ok(Object.values(camera).every(Number.isFinite))
      assert.ok(Math.abs(camera.x - before.x) < 16)
      assert.ok(Math.abs(camera.zoom - before.zoom) < .01)
      if (t >= 4.4 && t <= 5.4) {
        const x = (busEndingFrame(ending).playerX - camera.x) * camera.zoom
        assert.ok(x > 0 && x < width)
      }
      before = camera
    }
  }
})
