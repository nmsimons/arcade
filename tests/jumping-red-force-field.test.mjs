import test from 'node:test'
import assert from 'node:assert/strict'
import { blankTrial, parseLevel, levelProblems } from '../src/games/jumping/level.ts'
import { createRun, stepRun } from './helpers/jumping-active-run.mjs'
import { NEUTRAL_INPUT, STEP } from '../src/games/jumping/model.ts'
import { ropePath } from '../src/games/jumping/climbables.ts'
import { bodyIntersects, lineBlocked, polygonIntersects, polygonPoints } from '../src/games/jumping/geometry.ts'
import { ballShape, boxShape } from '../src/games/jumping/propGeometry.ts'
import { mechanismShape } from '../src/games/jumping/mechanisms.ts'
import { dynamicCasters } from '../src/games/jumping/lightingModel.ts'
import { copySelections, pasteSelections } from '../src/games/jumping/editorSelection.ts'
import { encodeEditorClipboard, decodeEditorClipboard } from '../src/games/jumping/editorClipboard.ts'
import { placeOnSurface } from '../src/games/jumping/editorPlacement.ts'

function fixture(horizontal = false, changes = {}) {
  return { ...blankTrial(), id: 'red-force-field', width: 1200, height: 800, floor: 800,
    entrance: { x: 300, y: 800 }, goal: { x: 1000, y: 800 },
    forceFields: [{ id: 'red', x: horizontal ? 100 : 500, y: horizontal ? 400 : 0,
      w: horizontal ? 1000 : 12, h: horizontal ? 12 : 800,
      orientation: horizontal ? 'horizontal' : 'vertical', mode: 'objects', power: 'always', ...changes }] }
}
function step(run, seconds, input = {}, dt = STEP) {
  for (let i = 0; i < Math.ceil(seconds / dt); i++) stepRun(run, { ...NEUTRAL_INPUT, ...input }, dt)
}
const shape = prop => prop.kind === 'box' ? boxShape(prop) : ballShape(prop)

for (const side of [-1, 1]) for (const dt of [STEP, 1 / 30]) test(`red fields stop fast boxes and balls while a running player passes (${side}, ${Math.round(1 / dt)} Hz)`, () => {
  const level = fixture(); level.entrance.x = side === 1 ? 300 : 700
  level.props = ['box', 'ball'].map((kind, i) => ({ kind, x: side === 1 ? 350 : 660, y: 80 + i * 120, size: 50 }))
  const run = createRun(level), beam = run.forceFields[0]
  assert.equal(beam.active, true)
  run.props.forEach(b => { b.vx = side * 1000 })
  step(run, 1, { move: side }, dt)
  assert.ok(side === 1 ? run.player.x > 560 : run.player.x < 450, `the player crosses: ${run.player.x}`)
  for (const prop of run.props) {
    assert.ok(side === 1 ? prop.x < 500 : prop.x > 512, `${prop.kind} stays on its side: ${prop.x}`)
    assert.equal(polygonIntersects(polygonPoints(shape(prop)), beam.platform, .01), false)
  }
})

for (const gravity of [1, -1]) test(`horizontal red fields support props but pass the player under gravity ${gravity}`, () => {
  const level = fixture(true)
  if (gravity < 0) level.gravityPlates = [{ id: 'gravity', x: 0, y: 0, w: 1200, h: 800, gravity, power: 'always' }]
  level.props = ['box', 'ball'].map((kind, i) => ({ kind, x: 650 + i * 100, y: gravity > 0 ? 200 : 700, size: 50 }))
  const run = createRun(level)
  if (gravity > 0) Object.assign(run.player, { y: 200, grounded: false })
  step(run, 2)
  assert.ok(Math.abs(run.player.y - (gravity > 0 ? 800 : 0)) < .1, 'the player falls through or rises through')
  for (const prop of run.props) assert.ok(Math.abs(prop.y - (gravity > 0 ? 400 : 462)) < .1, `${prop.kind} rests on the beam: ${prop.y}`)
})

test('red fields stop charging shovebots without obscuring their sight of the player', () => {
  const level = fixture(); level.entrance.x = 610
  level.robots = [{ x: 370, y: 800, left: 300, right: 950 }]
  const run = createRun(level)
  let charged = false
  for (let i = 0; i < 360; i++) {
    stepRun(run, NEUTRAL_INPUT)
    charged ||= run.robots[0].phase === 'charge'
    assert.ok(run.robots[0].x < 475, `the bot cannot cross: ${run.robots[0].x}`)
  }
  assert.ok(run.robots[0].x > 440 && run.robots[0].seesPlayer, 'the bot can see through the red field')
  assert.ok(charged, 'exercise the high-speed charge against the beam')
})

for (const kind of ['lift', 'gate']) test(`red fields obstruct a moving ${kind} and release it when switched off`, () => {
  const level = fixture(false, { power: 'switched' }); level.entrance.x = 200
  level.triggers = [{ x: 100, y: 800, w: 80, mode: 'touch', behavior: 'toggle', startsOn: true, targets: ['red'] }]
  level.mechanisms = [{ id: 'mover', kind, orientation: 'horizontal', flipX: true,
    x: 280, y: 500, w: 120, h: 20, travel: 350, power: kind === 'lift' ? 'always' : 'switched', switchReversed: true }]
  const run = createRun(level)
  let reached = 0
  for (let i = 0; i < 300; i++) {
    stepRun(run, NEUTRAL_INPUT)
    reached = Math.max(reached, run.mechanisms[0].x)
    assert.equal(polygonIntersects(polygonPoints(mechanismShape(run.mechanisms[0])), run.forceFields[0].platform, .01), false)
  }
  assert.ok(reached > 370 && reached <= 380.01, `the mechanism stops at the beam: ${reached}`)
  run.triggers[0].active = false
  let released = 0
  for (let i = 0; i < 720; i++) { stepRun(run, NEUTRAL_INPUT); released = Math.max(released, run.mechanisms[0].x) }
  assert.equal(run.forceFields[0].active, false)
  assert.ok(released > 390, 'the released mechanism can cross')
})

for (const withRope of [false, true]) test(`EMP releases sleeping props${withRope ? ' and a rope prepared on the red field' : ' from a red field'}`, () => {
  const level = fixture(true)
  if (withRope) level.climbables.ropes = [{ x: 500, y: 120, length: 420, segments: 53 }]
  level.props = [{ kind: 'box', x: 650, y: 400, size: 50 }, { kind: 'ball', x: 750, y: 400, size: 50 }]
  const run = createRun(level), rope = run.player.ropes[0], beam = run.forceFields[0]
  assert.equal(beam.active, true)
  step(run, 2)
  if (rope) {
    const path = ropePath(rope.definition, rope)
    assert.ok(rope.nodes.at(-1).y < 400, 'the tail rests on the field')
    assert.ok(path.slice(1).every((p, i) => !lineBlocked(path[i], p, [beam.platform])))
  }
  assert.equal(dynamicCasters(run).length, run.props.length + 1, 'red fields do not cast shadows')
  run.empRemaining = .5; step(run, .3)
  assert.equal(beam.active, false)
  if (rope) assert.ok(rope.nodes.at(-1).y > 410, 'the rope wakes and falls through')
  assert.ok(run.props.every(p => p.y > 420), 'sleeping props lose support immediately')
  step(run, .8)
  assert.equal(beam.active, !withRope)
  assert.equal(beam.pending, withRope, 'a threaded rope holds the returning field pending')
  assert.ok(run.props.every(p => p.y > 500), 'restoring power does not teleport objects back above')
})

for (const object of ['box', 'ball', 'bot', 'mechanism', 'rope']) test(`red activation waits for an overlapping ${object}, while ignoring the player`, () => {
  const level = fixture(false, { power: 'switched', switchReversed: true }); level.entrance.x = 506
  if (object === 'box' || object === 'ball') level.props = [{ kind: object, x: 506, y: 300, size: 50 }]
  if (object === 'bot') level.robots = [{ x: 506, y: 800, left: 300, right: 900 }]
  if (object === 'mechanism') level.mechanisms = [{ id: 'gate', kind: 'gate', x: 500, y: 100, w: 20, h: 100, travel: 100 }]
  if (object === 'rope') level.climbables.ropes = [{ x: 506, y: 100, length: 300, segments: 38 }]
  const run = createRun(level)
  assert.equal(run.forceFields[0].active, false)
  assert.equal(run.forceFields[0].pending, true)
  run.empRemaining = 1; stepRun(run, NEUTRAL_INPUT)
  assert.equal(run.forceFields[0].pending, false)
})

test('a player overlapping a red beam never delays it and ordinary switch wiring powers it', () => {
  const level = fixture(false, { power: 'switched' }); level.entrance.x = 506
  level.triggers = [{ x: 470, y: 800, w: 80, mode: 'touch', targets: ['red'] }]
  const run = createRun(level)
  assert.equal(run.forceFields[0].active, false)
  step(run, .3)
  assert.equal(run.forceFields[0].active, true); assert.equal(run.forceFields[0].pending, false)
  step(run, .5, { move: 1 })
  assert.ok(run.player.x > 560); assert.equal(run.forceFields[0].active, false)
})

test('a pending red field activates as soon as an overlapping ball clears it', () => {
  const level = fixture(false, { power: 'switched', switchReversed: true })
  level.props = [{ kind: 'ball', x: 506, y: 300, size: 50 }]
  const run = createRun(level)
  assert.equal(run.forceFields[0].pending, true)
  run.props[0].vx = 600
  step(run, .5)
  assert.ok(run.props[0].x > 600)
  assert.equal(run.forceFields[0].active, true); assert.equal(run.forceFields[0].pending, false)
})

for (const side of [-1, 1]) test(`a climbing body passes through red while its loaded rope stays clear (${side})`, () => {
  const level = fixture(false, { x: side === 1 ? 510 : 478 })
  level.entrance = { x: 500 - side * 20, y: 600 }
  level.climbables.ropes = [{ x: 500, y: 100, length: 650, segments: 82 }]
  const run = createRun(level), beam = run.forceFields[0]
  run.player.facing = side
  let overlap = 0, caught = 0
  for (let i = 0; i < 360; i++) {
    stepRun(run, { ...NEUTRAL_INPUT, climb: true })
    overlap += Number(bodyIntersects(run.player.x, run.player.y, beam.platform))
    caught += Number(!!run.player.climbing)
    const rope = run.player.ropes[0], path = ropePath(rope.definition, rope)
    assert.ok(path.slice(1).every((point, j) => !lineBlocked(path[j], point, [beam.platform])), `rope at frame ${i}`)
  }
  assert.ok(caught > 300 && overlap > 100, 'exercise a loaded climb with the player inside the beam')
  assert.ok(run.player.y < 500, 'the red field does not arrest the body’s climb')
  assert.equal(beam.active, true)
})

test('field modes validate and survive save, group clipboard and wiring remapping', () => {
  const level = fixture()
  level.triggers = [{ x: 200, y: 800, w: 80, mode: 'touch', targets: ['red'] }]
  level.forceFields[0].power = 'switched'
  for (const version of [1, 2]) {
    const parsed = parseLevel({ ...level, version, ...(version === 2 ? { lighting: { nightMode: false, ambient: 0, lights: [] } } : {}) })
    assert.equal(parsed.forceFields[0].mode, 'objects'); assert.deepEqual(levelProblems(parsed), [])
  }
  for (const mode of ['red', 'everything', true, null]) assert.throws(() => parseLevel({ ...level, forceFields: [{ ...level.forceFields[0], mode }] }))
  const copied = decodeEditorClipboard(encodeEditorClipboard(copySelections(level, [{ kind: 'force-field', index: 0 }, { kind: 'trigger', index: 0 }])))
  const pasted = pasteSelections(level, copied, 40, 0).level
  assert.equal(pasted.forceFields[1].mode, 'objects')
  assert.notEqual(pasted.forceFields[1].id, 'red')
  assert.deepEqual(pasted.triggers[1].targets, [pasted.forceFields[1].id])
  assert.doesNotThrow(() => parseLevel(pasted))
})

test('studio surface placement supports objects on red fields while the entrance passes through', () => {
  const level = fixture(true)
  level.props = [{ kind: 'box', x: 300, y: 200, size: 50 }]
  level.entrance = { x: 300, y: 200 }
  assert.equal(placeOnSurface(level, { kind: 'prop', index: 0 }).props[0].y, 400)
  assert.equal(placeOnSurface(level, { kind: 'entrance', index: 0 }).entrance.y, 800)
})
