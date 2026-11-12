import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRun, settleRun, stepRun } from '../src/games/jumping/challenge.ts'
import { AREA_STATE_KEY, captureAreaState, keepsState, levelFingerprint, readAreaState, readAreaStates, restoreAreaState, trackAreaProps, writeAreaState } from '../src/games/jumping/areaState.ts'
import { blankTrial, parseLevel, prepareLevelRopes } from '../src/games/jumping/level.ts'
import { NEUTRAL_INPUT } from '../src/games/jumping/model.ts'
import { setPropCarried } from '../src/games/jumping/propPhysics.ts'

const builtIn = file => parseLevel(JSON.parse(readFileSync(new URL(`../public/levels/jumping/${file}`, import.meta.url), 'utf8')))
const concourse = builtIn('Concourse.jump-level.json'), orientation = builtIn('Orientation.jump-level.json'), exit = builtIn('exit.jump-level.json')
/** A fresh run that keeps its state, as the game prepares one. */
const fresh = level => { const run = createRun(level); trackAreaProps(run); return run }
const storage = () => { const values = new Map(); return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) } }

test('untimed levels keep their state; timed courses do not', () => {
  assert.deepEqual([concourse, orientation, exit].map(keepsState), [true, true, true])
  assert.equal(keepsState({ ...blankTrial() }), false)
})

test('a place’s props, float switch and water come back as they were left', () => {
  const run = fresh(concourse), fingerprint = levelFingerprint(concourse)
  // The concourse's lift carries its ball up the column on its own.
  for (let i = 0; i < 480; i++) stepRun(run, NEUTRAL_INPUT)
  const pool = run.water.pools[0]
  pool.level = 40
  const left = captureAreaState(run, fingerprint)
  const ball = concourse.props[1]
  assert.ok(Math.hypot(left.props[1].x - ball.x, left.props[1].y - ball.y) > 20, 'the lift moved the ball')

  const again = fresh(concourse)
  assert.equal(restoreAreaState(again, left), true)
  assert.deepEqual(captureAreaState(again, fingerprint), left)
  const restored = again.water.pools[0]
  assert.equal(restored.region.h, restored.definition.h * .4)
  assert.equal(restored.region.y, restored.definition.y + restored.definition.h * .6)
  // The restored world steps on from there.
  for (let i = 0; i < 120; i++) stepRun(again, NEUTRAL_INPUT)
  assert.ok(again.props.every(prop => Number.isFinite(prop.x) && Number.isFinite(prop.y)))
})

test('mechanisms and switches come back, with what they drive derived again', () => {
  const run = fresh(exit), fingerprint = levelFingerprint(exit)
  // A plate held down drives its targets, and its mechanisms move partway.
  run.triggers[0].active = true; run.triggers[0].held = 1; run.triggers[0].pressed = true
  settleRun(run)
  run.mechanisms.forEach((mechanism, i) => { mechanism.x += i; mechanism.direction = 1 })
  const left = captureAreaState(run, fingerprint)
  const again = fresh(exit)
  assert.equal(restoreAreaState(again, left), true)
  assert.deepEqual(captureAreaState(again, fingerprint), left)
  assert.deepEqual([...again.switchStates], [...run.switchStates])
  assert.deepEqual(again.mechanisms.map(m => m.active), run.mechanisms.map(m => m.active))
  assert.equal(again.goalLit, run.goalLit)
})

test('a carried tool keeps its place in the saved order and stays behind at the robot’s feet', () => {
  const run = fresh(orientation), fingerprint = levelFingerprint(orientation)
  const tool = run.props[6]
  assert.equal(tool.gadget, 'emp')
  setPropCarried(run, tool, true); run.gadgets.held = tool
  assert.equal(run.props.length, orientation.props.length - 1, 'a carried tool leaves the props')
  const carried = captureAreaState(run, fingerprint)
  assert.equal(carried.props.length, orientation.props.length)
  assert.deepEqual(carried.props[6], { x: run.player.x, y: run.player.y, angle: 0 })
  assert.deepEqual(carried.props[7], { x: run.props[6].x, y: run.props[6].y, angle: run.props[6].angle }, 'the props after it keep their places')
  // Dropping it puts it back at the end of the props; the saved order is still the authored one.
  setPropCarried(run, tool, false); run.gadgets.held = null
  Object.assign(tool, { x: 1234, y: 567 })
  assert.equal(run.props.at(-1), tool)
  const dropped = captureAreaState(run, fingerprint)
  assert.deepEqual(dropped.props[6], { x: 1234, y: 567, angle: tool.angle })
  const again = fresh(orientation)
  assert.equal(restoreAreaState(again, dropped), true)
  assert.deepEqual([again.props[6].x, again.props[6].y], [1234, 567])
})

test('a tied rope that let go of an anchor stays released, even with its switch off again', () => {
  const pillars = [{ x: 300, y: 500, w: 200, h: 420 }, { x: 1100, y: 500, w: 200, h: 420 }]
  // The tied-rope tests' course; saving and restoring do not depend on timing.
  const level = prepareLevelRopes(parseLevel({ ...blankTrial(), platforms: pillars,
    climbables: { ladders: [], ropes: [{ x: 500, y: 500, length: 680, segments: 85, anchor: { platform: 0, x: 200, y: 0 },
      end: { x: 1100, y: 500, anchor: { platform: 1, x: 0, y: 0 } }, release: { id: 'drop', anchor: 'start' } }] },
    triggers: [{ x: 1500, y: 920, w: 80, mode: 'weight', behavior: 'toggle', targets: ['drop'] }] }))
  const run = fresh(level), fingerprint = levelFingerprint(level)
  run.triggers[0].active = true; settleRun(run)
  assert.equal(run.player.ropes[0].definition.end, undefined)
  const left = { ...captureAreaState(run, fingerprint), triggers: [{ held: 0, pressed: false, active: false, depression: 0 }] }
  assert.deepEqual(left.ropes, [0])
  const again = fresh(level)
  assert.equal(restoreAreaState(again, left), true)
  assert.equal(again.player.ropes[0].definition.end, undefined, 'released')
  assert.deepEqual([again.player.ropes[0].definition.x, again.player.ropes[0].definition.y], [1100, 500], 'hanging from the other anchor')
})

test('a state that does not fit the level changes nothing', () => {
  const run = fresh(concourse), left = captureAreaState(run, levelFingerprint(concourse))
  const again = fresh(concourse), before = captureAreaState(again, 'x')
  assert.equal(restoreAreaState(again, { ...left, props: left.props.slice(1), water: [0, 0] }), false)
  assert.deepEqual(captureAreaState(again, 'x'), before)
})

test('saved states are kept by level and only for the same level file', () => {
  const save = storage(), state = captureAreaState(fresh(concourse), levelFingerprint(concourse))
  writeAreaState(save, concourse.id, state)
  assert.deepEqual(readAreaState(save, concourse), state)
  // Editing the level makes its saved state stale.
  const edited = { ...concourse, props: concourse.props.map((prop, i) => i ? prop : { ...prop, x: prop.x + 10 }) }
  assert.notEqual(levelFingerprint(edited), levelFingerprint(concourse))
  assert.equal(readAreaState(save, edited), null)
  // Unreadable entries are dropped; others survive.
  save.setItem(AREA_STATE_KEY, JSON.stringify({ [concourse.id]: state, broken: { level: 'x', props: [{ x: 'no' }] } }))
  assert.deepEqual(Object.keys(readAreaStates(save)), [concourse.id])
  save.setItem(AREA_STATE_KEY, 'not json')
  assert.deepEqual(readAreaStates(save), {})
  writeAreaState(save, concourse.id, state)
  writeAreaState(save, concourse.id, null)
  assert.deepEqual(readAreaStates(save), {})
})
