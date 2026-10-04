import test from 'node:test'
import assert from 'node:assert/strict'
import { blankTrial, parseLevel } from '../src/games/jumping/level.ts'
import { setShovebotHeadlight, moveItem, duplicateItem } from '../src/games/jumping/editor.ts'
import { setLevelNightMode } from '../src/games/jumping/lightingEditor.ts'
import { copyForEditing } from '../src/games/jumping/puzzleEditor.ts'
import { createRun, createPreviewRun, stepRun } from '../src/games/jumping/challenge.ts'
import { NEUTRAL_INPUT, STEP } from '../src/games/jumping/model.ts'
import { dynamicCasters, exposureAt, LightingState, sourceCovered } from '../src/games/jumping/lightingModel.ts'
import { robotHeadlightPose } from '../src/games/jumping/robotHeadlight.ts'
import { robotPlatforms } from '../src/games/jumping/robotPhysics.ts'
import { levelLightCount } from '../src/games/jumping/lightingDefinition.ts'

const level = () => {
  const next = blankTrial(); next.robots = [{ x: 700, y: 920, left: 400, right: 1000 }]
  return next
}
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-8, `${a} != ${b}`)

test('headlights default off, round-trip as booleans, and reject malformed file values', () => {
  const legacy = level(), robot = legacy.robots[0]
  assert.deepEqual(parseLevel(legacy).robots[0], robot)
  for (const headlight of [true, false]) {
    const file = { ...legacy, robots: [{ ...robot, headlight }] }
    assert.deepEqual(parseLevel(JSON.parse(JSON.stringify(file))).robots, file.robots)
  }
  for (const headlight of ['true', 1, null, {}, []]) {
    assert.throws(() => parseLevel({ ...legacy, robots: [{ ...robot, headlight }] }))
  }
})

test('headlight edits are immutable and survive duplication, moving, templates and day/night toggles', () => {
  const original = level(), enabled = setShovebotHeadlight(original, 0, true)
  assert.equal(original.robots[0].headlight, undefined)
  assert.equal(enabled.robots[0].headlight, true)
  const night = setLevelNightMode(enabled, true), day = setLevelNightMode(night, false)
  for (const file of [night, day, copyForEditing(night), moveItem(night, { kind: 'robot', index: 0 }, 20, 0)]) {
    assert.equal(parseLevel(file).robots[0].headlight, true)
  }
  const duplicate = duplicateItem(night, { kind: 'robot', index: 0 }).level
  assert.deepEqual(duplicate.robots.map(robot => robot.headlight), [true, true])
  assert.equal(setShovebotHeadlight(night, 0, false).robots[0].headlight, undefined)
  assert.equal(setShovebotHeadlight(night, 1, true), night)
})

test('enabled headlights add sources in day and night, with IDs distinct from authored lamps', () => {
  const file = setShovebotHeadlight(setLevelNightMode(level(), true), 0, true)
  file.lighting.lights = [{ id: 'shovebot-headlight:0', x: 100, y: 100, direction: 90, spread: 60, intensity: 100, power: 'always' }]
  const run = createPreviewRun(file), state = new LightingState()
  let sources = state.sources(file.lighting, run, 0)
  assert.equal(sources.length, 2); assert.equal(new Set(sources.map(s => s.id)).size, 2)
  assert.equal(sources[1].robot, 0); assert.equal(sources[1].spread, 40)
  assert.equal(levelLightCount(file), 2)
  const before = JSON.stringify(file)
  assert.equal(state.sources({ ...file.lighting, nightMode: false }, run, .2).length, 2)
  assert.equal(JSON.stringify(file), before)
  delete run.robots[0].definition.headlight
  sources = state.sources(file.lighting, run, .2)
  assert.equal(sources.length, 1); assert.equal(sources[0].robot, undefined)
})

test('the downward beam follows both facings, slope tilt and windup without self-shadowing', () => {
  const file = setShovebotHeadlight(setLevelNightMode(level(), true), 0, true)
  const run = createPreviewRun(file), robot = run.robots[0]
  run.player.x = 1500; run.player.y = 920
  for (const facing of [-1, 1]) for (const angle of [0, -.3, .4]) for (const phase of ['patrol', 'windup']) {
    Object.assign(robot, { x: 700, y: 500, facing, angle, phase })
    const before = JSON.stringify(run), hull = JSON.stringify(robotPlatforms(robot))
    const source = new LightingState().sources(file.lighting, run, 0)[0]
    const pose = robotHeadlightPose(robot), c = Math.cos(angle), s = Math.sin(angle)
    const dx = source.x - robot.x, dy = source.y - (robot.y - 9)
    close(dx * c + dy * s, 27 * facing)
    close(dy * c - dx * s, (phase === 'windup' ? -39 : -46) + 28)
    close(source.direction, angle * 180 / Math.PI + (facing < 0 ? 165 : 15) > 180
      ? angle * 180 / Math.PI - 195 : angle * 180 / Math.PI + (facing < 0 ? 165 : 15))
    assert.deepEqual({ x: source.x, y: source.y, direction: source.direction }, pose)
    const groups = dynamicCasters(run), direction = source.direction * Math.PI / 180
    assert.equal(sourceCovered(source, groups), false)
    assert.equal(exposureAt(0, [source], groups, source.x + Math.cos(direction) * 80, source.y + Math.sin(direction) * 80), 1)
    assert.equal(exposureAt(0, [source], groups, source.x - Math.cos(direction) * 80, source.y - Math.sin(direction) * 80), .35)
    assert.equal(JSON.stringify(run), before); assert.equal(JSON.stringify(robotPlatforms(robot)), hull)
  }
})

test('EMP fades headlights off and back on, respects pauses, and starts dark during an outage', () => {
  const file = setShovebotHeadlight(setLevelNightMode(level(), true), 0, true)
  const run = createPreviewRun(file), state = new LightingState()
  assert.equal(state.sources(file.lighting, run, 0)[0].fade, 1)
  run.empRemaining = 5
  close(state.sources(file.lighting, run, .1)[0].fade, .5)
  close(state.sources(file.lighting, run, 0)[0].fade, .5)
  assert.equal(state.sources(file.lighting, run, .1)[0].fade, 0)
  assert.equal(new LightingState().sources(file.lighting, run, 0)[0].fade, 0)
  run.empRemaining = 0
  close(state.sources(file.lighting, run, .1)[0].fade, .5)
  assert.equal(state.sources(file.lighting, run, .1)[0].fade, 1)
})

test('headlights leave player and shovebot physics identical through patrol, pursuit and EMP', () => {
  const file = setLevelNightMode(level(), true), unlit = createRun(file), lit = createRun(setShovebotHeadlight(file, 0, true))
  const lighting = new LightingState()
  for (let frame = 0; frame < 240; frame++) {
    if (frame === 120) { unlit.empRemaining = 1; lit.empRemaining = 1 }
    const input = { ...NEUTRAL_INPUT, move: frame < 120 ? 1 : -1, jump: frame === 50 }
    stepRun(unlit, input, STEP); stepRun(lit, input, STEP); lighting.sources(lit.level.lighting, lit, STEP)
    // Contacts can now include a ridden bot; ignore its presentation-only option.
    const physics = p => JSON.parse(JSON.stringify(p, (key, value) => key === 'headlight' ? undefined : value))
    assert.deepEqual(physics(lit.player), physics(unlit.player))
    const { definition: _a, ...a } = lit.robots[0], { definition: _b, ...b } = unlit.robots[0]
    assert.deepEqual(a, b); assert.equal(lit.elapsed, unlit.elapsed)
  }
})

test('headlight-only rooms share the lighting complexity budget', () => {
  const heavy = setLevelNightMode(level(), true)
  heavy.robots = Array.from({ length: 12 }, () => ({ ...heavy.robots[0], headlight: true }))
  heavy.platforms = Array.from({ length: 120 }, () => ({ x: 200, y: 300, w: 100, h: 100,
    polygon: Array.from({ length: 24 }, (_, i) => [50 + 49 * Math.cos(i * Math.PI / 12), 50 + 49 * Math.sin(i * Math.PI / 12)]) }))
  assert.throws(() => parseLevel(heavy), /too complex/)
  assert.throws(() => parseLevel(setLevelNightMode(heavy, false)), /too complex/)
})
