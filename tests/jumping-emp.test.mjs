import test from 'node:test'
import assert from 'node:assert/strict'
import { blankTrial, parseLevel, levelProblems } from '../src/games/jumping/level.ts'
import { createRun, stepRun } from '../src/games/jumping/challenge.ts'
import { NEUTRAL_INPUT, STEP } from '../src/games/jumping/model.ts'
import { EMP_SECONDS, EMP_ANIMATION_SECONDS, pickupBounds } from '../src/games/jumping/pickups.ts'
import { addItem, duplicateItem, moveItem, deleteItem, resizeLevelHeight } from '../src/games/jumping/editor.ts'
import { JumpingAudioState } from '../src/games/jumping/audioState.ts'
import { goalDoor } from '../src/games/jumping/goal.ts'
import { robotHulls } from '../src/games/jumping/robotPhysics.ts'
import { ballShape, boxShape } from '../src/games/jumping/propGeometry.ts'
import { polygonIntersects } from '../src/games/jumping/geometry.ts'

const emp = (x = 160, y = 888) => ({ kind: 'emp', x, y })
const coin = (x = 160) => ({ kind: 'coin', x, y: 888 })
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-7, `${actual} ≈ ${expected}`)
const step = (run, frames = 1, input = NEUTRAL_INPUT) => { for (let i = 0; i < frames; i++) stepRun(run, input) }
const fixture = () => ({ ...blankTrial(), pickups: [emp()],
  mechanisms: [
    { id: 'gate', kind: 'gate', x: 600, y: 740, w: 20, h: 180, travel: 180 },
    { id: 'horizontal', kind: 'gate', orientation: 'horizontal', x: 850, y: 650, w: 180, h: 20, travel: 180 },
    { id: 'lift', kind: 'lift', x: 1100, y: 900, w: 140, h: 20, travel: 220 },
  ],
  triggers: [{ mode: 'coins', x: 400, y: 600, w: 200, threshold: 1, targets: ['gate', 'horizontal', 'lift'] }],
  robots: [{ x: 1400, y: 920, left: 1300, right: 1600 }] })

test('EMP collects once, waits for the run to start, extends by five seconds, and resets', () => {
  const level = fixture(); level.pickups.push(emp(500))
  const run = createRun(level); step(run, 120)
  assert.equal(run.started, false); assert.equal(run.empRemaining, EMP_SECONDS)
  assert.equal(run.elapsed, 0); assert.equal(run.coinsCollected, 0)
  assert.equal(run.timeStopRemaining, 0); assert.equal(run.timeFastRemaining, 0)
  assert.equal(run.pickups[0].collectedAge, EMP_ANIMATION_SECONDS)
  run.started = true; step(run, 120); near(run.empRemaining, 4); near(run.elapsed, 1)
  run.player.x = 500; step(run); near(run.empRemaining, 9 - STEP)
  const reset = createRun(level)
  assert.equal(reset.empRemaining, 0); assert.ok(reset.pickups.every(p => p.collectedAge === null))
})

for (const phase of ['patrol', 'chase', 'windup', 'charge', 'recover']) {
  test(`EMP freezes all mechanisms and a ${phase} bot, including timers and solid rider support`, () => {
    const run = createRun(fixture()); step(run); run.started = true
    run.coinsCollected = 1; run.triggers[0].active = true
    run.mechanisms[0].y -= 60; run.mechanisms[1].x -= 60; run.mechanisms[2].y -= 60
    run.mechanisms[2].wait = .3; run.mechanisms[0].safetyHold = .2
    Object.assign(run.robots[0], { phase, time: .1, facing: 1 })
    Object.assign(run.player, { x: 1400, y: phase === 'windup' ? 881 : 874, grounded: true })
    step(run)
    const machines = structuredClone(run.mechanisms), robot = structuredClone(run.robots[0]), playerY = run.player.y
    step(run, 598)
    near(run.empRemaining, STEP); assert.deepEqual(run.mechanisms, machines); assert.deepEqual(run.robots[0], robot)
    near(run.player.y, playerY); assert.equal(run.player.grounded, true)
    step(run); assert.equal(run.empRemaining, 0)
    assert.deepEqual(run.mechanisms, machines); assert.deepEqual(run.robots[0], robot)
    run.player.x = 200; run.player.y = 920
    step(run, 60)
    assert.ok(run.mechanisms[0].y < machines[0].y); assert.ok(run.mechanisms[1].x < machines[1].x)
    assert.ok(run.mechanisms[2].y < machines[2].y); assert.notDeepEqual(run.robots[0], robot)
  })
}

test('a partial last outage step advances machinery only for the powered fraction', () => {
  const level = fixture(); level.pickups = []
  const run = createRun(level); run.started = true; run.empRemaining = STEP / 2
  run.coinsCollected = 1; const before = run.mechanisms[0].y
  step(run); assert.equal(run.empRemaining, 0); near(run.mechanisms[0].y, before - 130 * STEP / 2)
})

for (const reversed of [false, true]) test(`EMP and last coin collected together defer switching, independent of order (${reversed})`, () => {
  const level = fixture(); level.pickups = reversed ? [coin(), emp()] : [emp(), coin()]
  const run = createRun(level); step(run)
  assert.equal(run.coinsCollected, 1); assert.equal(run.triggers[0].active, false)
  assert.ok(run.mechanisms.every(m => !m.active))
  run.started = true; step(run, 599)
  assert.equal(run.triggers[0].active, false); assert.equal(run.mechanisms[0].y, 740)
  step(run); assert.equal(run.triggers[0].active, true); assert.ok(run.mechanisms.every(m => m.active))
  step(run); assert.ok(run.mechanisms[0].y < 740)
})

test('coins still increment during the outage and a previously latched switch never unswitches', () => {
  const level = fixture(); level.pickups = [coin(), emp(320), coin(480)]
  level.triggers.push({ ...level.triggers[0], x: 650, threshold: 2, targets: ['lift'] })
  level.triggers[0].targets = ['gate', 'horizontal']
  const run = createRun(level); step(run); run.started = true; step(run, 200)
  assert.equal(run.mechanisms[0].y, 560, 'first gate fully opens')
  run.player.x = 320; step(run)
  assert.deepEqual(run.triggers.map(t => t.active), [true, false]); assert.equal(run.mechanisms[0].active, true)
  run.player.x = 480; step(run)
  assert.equal(run.coinsCollected, 2); assert.deepEqual(run.triggers.map(t => t.active), [true, false])
  step(run, 599)
  assert.deepEqual(run.triggers.map(t => t.active), [true, true]); assert.equal(run.mechanisms[0].y, 560)
  step(run); assert.ok(run.mechanisms[2].y < 900)
})

test('pressure plates cannot switch during EMP and use their current load after restoration', () => {
  const level = fixture(); level.triggers = [{ mode: 'weight', x: 120, y: 920, w: 100, targets: ['gate'] }]
  const run = createRun(level); step(run); run.started = true; step(run, 600)
  assert.equal(run.triggers[0].active, false); assert.equal(run.mechanisms[0].y, 740)
  step(run, 20); assert.equal(run.triggers[0].active, true); assert.ok(run.mechanisms[0].y < 740)
  run.pickups.push({ definition: emp(), collectedAge: null }); step(run)
  const stopped = run.mechanisms[0].y
  run.player.x = 320; step(run, 600)
  assert.equal(run.triggers[0].active, false); assert.equal(run.mechanisms[0].y, stopped)
  step(run); assert.ok(run.mechanisms[0].y > stopped, 'unloaded gate closes after power returns')
})

for (const kind of ['box', 'ball']) for (const incoming of [false, true]) test(`disabled bot neither drives nor overlaps a ${incoming ? 'moving' : 'stationary'} ${kind}`, () => {
  const level = fixture(); level.spawn = { x: 160, y: 500 }
  level.platforms = [{ x: 100, y: 500, w: 200, h: 20 }]; level.pickups = []
  level.props = [{ kind, x: incoming ? 1500 : 1466, y: 920, size: 80 }]
  const run = createRun(level); run.started = true; run.empRemaining = 5
  Object.assign(run.robots[0], { phase: 'charge', facing: 1 })
  if (incoming) run.props[0].vx = -300
  const original = structuredClone(run.robots[0])
  step(run, 120)
  assert.deepEqual(run.robots[0], original)
  const prop = run.props[0], shape = kind === 'box' ? boxShape(prop) : ballShape(prop)
  assert.ok(robotHulls(run.robots[0]).every(hull => !polygonIntersects(hull, shape, .03)))
  if (!incoming) { near(prop.x, 1466); near(prop.vx, 0) }
})

test('EMP leaves the player, loose objects, and elapsed clock running; clock effects do not change its duration', () => {
  const level = blankTrial(); level.props = [{ kind: 'ball', x: 700, y: 800, size: 80 }]
  const plain = createRun(level), outage = createRun({ ...level, pickups: [emp()] })
  step(plain); step(outage)
  for (let i = 0; i < 120; i++) {
    const input = { ...NEUTRAL_INPUT, move: 1 }
    step(plain, 1, input); step(outage, 1, input)
    assert.deepEqual(outage.player, plain.player); assert.deepEqual(outage.props, plain.props); assert.equal(outage.elapsed, plain.elapsed)
  }
  for (const watch of ['stopwatch', 'fast-stopwatch']) {
    const run = createRun({ ...blankTrial(), pickups: [emp(), { kind: watch, x: 160, y: 888 }] })
    step(run); run.started = true; step(run, 600)
    assert.equal(run.empRemaining, 0); near(run.elapsed, watch === 'stopwatch' ? 0 : 10)
  }
})

test('exit plate, light, and doorway still complete a level during an outage', () => {
  const level = blankTrial(); level.pickups = [emp(1620)]
  const run = createRun(level); run.started = true; Object.assign(run.player, level.goal)
  step(run); assert.equal(run.goalLit, true); assert.equal(run.empRemaining, 5)
  step(run, 120); const door = goalDoor(level.goal); run.player.x = door.x + door.w / 2
  step(run); assert.ok(run.exit); const score = run.elapsed
  run.pickups.push({ definition: emp(run.player.x), collectedAge: null })
  step(run, 240); assert.equal(run.finished, true); assert.ok(run.empRemaining > 0)
  assert.equal(run.elapsed, score); assert.equal(run.pickups[1].collectedAge, null)
})

test('EMP collects only through player contact and produces one power-down cue', () => {
  const level = blankTrial(); level.pickups = [emp(160, 848), emp(500)]
  level.props = [{ kind: 'ball', x: 500, y: 920, size: 80 }]
  const run = createRun(level), audio = new JumpingAudioState(); run.player.crouching = true; audio.reset(run.player, run)
  step(run); assert.ok(run.pickups.every(p => p.collectedAge === null))
  run.player.crouching = false; step(run); audio.step(run.player, run, STEP)
  assert.equal(run.pickups[0].collectedAge, 0); assert.equal(run.pickups[1].collectedAge, null)
  assert.deepEqual(audio.drain().cues.map(c => c.kind), ['emp'])
  step(run, 120); audio.step(run.player, run, STEP); assert.deepEqual(audio.drain().cues, [])
  audio.reset(run.player, run); audio.step(run.player, run, STEP); assert.deepEqual(audio.drain().cues, [])
})

test('EMP supports builder editing and JSON round trips with bounded shared-file validation', () => {
  const added = addItem(blankTrial(), 'emp', { x: 300, y: 800 }, { x: 300, y: 800 })
  assert.equal(added.level.pickups[0].kind, 'emp')
  const copied = duplicateItem(added.level, added.selection)
  const taller = resizeLevelHeight(moveItem(copied.level, copied.selection, 160, -80), 1200)
  assert.deepEqual(parseLevel(JSON.parse(JSON.stringify(taller))), taller); assert.deepEqual(levelProblems(taller), [])
  assert.equal(deleteItem(taller, added.selection).pickups.length, 1)
  assert.deepEqual(pickupBounds(emp(100, 100)), { x: 76, y: 76, w: 48, h: 48 })
  for (const point of [{ x: 23 }, { x: 1777 }, { y: 23 }, { y: 897 }, { x: NaN }, { y: Infinity }]) {
    assert.throws(() => parseLevel({ ...blankTrial(), pickups: [{ ...emp(), ...point }] }))
  }
  assert.throws(() => parseLevel({ ...blankTrial(), pickups: Array.from({ length: 81 }, () => emp()) }))
})
