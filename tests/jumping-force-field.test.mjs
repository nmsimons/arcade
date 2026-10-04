import test from 'node:test'
import assert from 'node:assert/strict'
import { blankTrial, parseLevel, levelProblems } from '../src/games/jumping/level.ts'
import { createRun, createPreviewRun, stepRun } from '../src/games/jumping/challenge.ts'
import { NEUTRAL_INPUT } from '../src/games/jumping/model.ts'
import { bodyIntersects } from '../src/games/jumping/geometry.ts'
import { addItem, hitItem, itemBounds, resizeItem, moveItem, deleteItem, setObjectPower, setObjectSwitchReversed, resizeLevelHeight } from '../src/games/jumping/editor.ts'
import { copySelections, pasteSelections, moveSelections, selectionsInRect } from '../src/games/jumping/editorSelection.ts'
import { copyForEditing } from '../src/games/jumping/puzzleEditor.ts'
import { switchedItems, switchWiringProblems } from '../src/games/jumping/switchPower.ts'
import { dynamicCasters } from '../src/games/jumping/lightingModel.ts'

const field = (orientation = 'vertical', changes = {}) => ({ id: 'barrier', x: 500, y: orientation === 'vertical' ? 200 : 400,
  w: orientation === 'vertical' ? 12 : 300, h: orientation === 'vertical' ? 400 : 12, orientation, power: 'always', ...changes })
const pick = (index = 0) => ({ kind: 'force-field', index })
function fixture(orientation = 'vertical', changes = {}) {
  return { ...blankTrial(), id: 'force-field-test', width: 1200, height: 600, floor: 600,
    spawn: { x: 300, y: 600 }, goal: { x: 1000, y: 600 }, forceFields: [field(orientation, changes)] }
}
const step = (run, count, input = NEUTRAL_INPUT) => { for (let i = 0; i < count; i++) stepRun(run, input) }
const close = (a, b, tolerance = .02) => assert.ok(Math.abs(a - b) < tolerance, `${a} != ${b}`)

for (const direction of [-1, 1]) test(`vertical field blocks a running player from direction ${direction} without blocking free objects`, () => {
  const level = fixture(); level.spawn.x = direction > 0 ? 300 : 700
  level.props = ['box', 'ball'].map((kind, i) => ({ kind, x: direction > 0 ? 360 : 660, y: 220 + i * 110, size: 50 }))
  const run = createRun(level); run.started = true
  for (const p of run.props) { p.vx = direction * 650; p.vy = -80 }
  step(run, 120, { ...NEUTRAL_INPUT, move: direction })
  assert.ok(direction > 0 ? run.player.x < 500 : run.player.x > 512)
  close(run.player.x, direction > 0 ? 474.5 : 537.5)
  assert.equal(run.player.contacts.push?.collider.id, 'force-field:0')
  for (const prop of run.props) assert.ok(direction > 0 ? prop.x > 550 : prop.x < 470, `${prop.kind} failed to pass: ${prop.x}`)
  assert.equal(run.platforms.some(b => b === run.forceFields[0].platform), false)
})

for (const gravity of [1, -1]) test(`horizontal field supports player gravity ${gravity} while props fall through it`, () => {
  const level = fixture('horizontal', { x: 180, y: 300, w: 650 })
  if (gravity < 0) level.gravityPlates = [{ id: 'g', x: 0, y: 0, w: 1200, h: 600, gravity, power: 'always' }]
  const run = createRun(level); run.started = true
  if (gravity > 0) { run.player.y = 100; run.player.grounded = false }
  run.props = []
  // Recreate with authored props so they belong to the ordinary Matter world.
  level.props = ['box', 'ball'].map((kind, i) => ({ kind, x: 650 + i * 90, y: gravity > 0 ? 130 : 550, size: 50 }))
  const propsRun = createRun(level); propsRun.started = true
  step(run, 180)
  close(run.player.y, gravity > 0 ? 300 : 312)
  assert.equal(run.player.grounded, true); assert.equal(!!run.player.inverted, gravity < 0)
  const start = run.player.x
  step(run, 30, { ...NEUTRAL_INPUT, move: 1 })
  assert.ok(run.player.x > start + 15); assert.equal(run.player.grounded, true)
  step(run, 1, { ...NEUTRAL_INPUT, jump: true }); step(run, 10)
  assert.ok(gravity > 0 ? run.player.y < 285 : run.player.y > 327)
  step(propsRun, 180)
  for (const prop of propsRun.props) close(prop.y, gravity > 0 ? 600 : prop.size, .8)
})

test('fast player sweeps cannot tunnel through either field orientation', () => {
  for (const orientation of ['horizontal', 'vertical']) {
    const run = createRun(fixture(orientation)); run.started = true
    Object.assign(run.player, { x: orientation === 'vertical' ? 460 : 600, y: orientation === 'vertical' ? 550 : 370, grounded: false, vx: orientation === 'vertical' ? 1200 : 0, vy: orientation === 'vertical' ? 0 : 1100 })
    stepRun(run, NEUTRAL_INPUT, .1)
    assert.equal(bodyIntersects(run.player.x, run.player.y, run.forceFields[0].platform), false)
    assert.ok(orientation === 'vertical' ? run.player.x <= 488 : run.player.y <= 400)
  }
})

test('a switched field waits for an overlapping player to leave, then blocks; EMP disables and safely restores it', () => {
  const level = fixture('vertical', { power: 'switched', switchReversed: true })
  level.spawn.x = 506
  const run = createRun(level); run.started = true
  assert.equal(run.forceFields[0].active, false); assert.equal(run.forceFields[0].pending, true)
  step(run, 40, { ...NEUTRAL_INPUT, move: 1 })
  assert.ok(run.player.x > 550); assert.equal(run.forceFields[0].active, true)
  step(run, 100, { ...NEUTRAL_INPUT, move: -1 }); close(run.player.x, 537.5)
  run.empRemaining = .5; step(run, 35, { ...NEUTRAL_INPUT, move: -1 })
  assert.equal(run.forceFields[0].active, false); assert.ok(run.player.x < 500)
  step(run, 60); assert.equal(run.empRemaining, 0); assert.equal(run.forceFields[0].active, true)
  const reset = createRun(level); assert.equal(reset.forceFields[0].pending, true)
})

test('normal pressure wiring activates fields and releasing the pressure removes support', () => {
  const level = fixture('horizontal', { x: 180, y: 300, w: 650, power: 'switched' })
  level.triggers = [{ x: 260, y: 600, w: 80, mode: 'touch', targets: ['barrier'] }]
  const run = createRun(level); run.started = true
  assert.equal(run.forceFields[0].active, false)
  step(run, 25); assert.equal(run.forceFields[0].active, true)
  Object.assign(run.player, { x: 500, y: 300, grounded: true })
  step(run, 20)
  assert.equal(run.forceFields[0].active, false); assert.equal(run.player.grounded, false); assert.ok(run.player.y > 310)
})

test('fields do not obstruct rope particles, shovebot navigation, or cast shadows', () => {
  const level = fixture('horizontal', { x: 120, y: 350, w: 760 })
  level.climbables.ropes = [{ x: 250, y: 120, length: 420, segments: 53 }]
  level.forceFields.push(field('vertical', { id: 'v', x: 500, y: 0, h: 600 }))
  level.robots = [{ x: 370, y: 600, left: 300, right: 850 }]
  level.spawn.x = 900
  const run = createRun(level); run.started = true
  step(run, 240)
  assert.ok(run.player.ropes[0].nodes.at(-1).y > 500)
  assert.ok(run.robots[0].x > 520, `bot stopped at ${run.robots[0].x}`)
  assert.equal(dynamicCasters(run).length, run.robots.length + 1)
})

test('moving supports and charging bots cannot carry or push the player through a field', () => {
  const level = fixture('vertical', { x: 480, y: 0, h: 600 }); level.spawn.x = 400
  level.mechanisms = [{ id: 'lift', kind: 'lift', orientation: 'horizontal', flipX: true, x: 340, y: 540, w: 140, h: 20, travel: 300, power: 'always' }]
  level.spawn.y = 540
  const run = createRun(level); run.started = true; step(run, 180)
  assert.ok(run.player.x <= 468.01); assert.equal(bodyIntersects(run.player.x, run.player.y, run.forceFields[0].platform), false)
  assert.ok(run.mechanisms[0].x > 500, 'the lift itself should pass through')
  const botLevel = fixture('vertical', { x: 500, y: 0, h: 600 }); botLevel.spawn.x = 488
  botLevel.robots = [{ x: 370, y: 600, left: 300, right: 900 }]
  const botRun = createRun(botLevel); botRun.started = true; step(botRun, 120)
  assert.ok(botRun.player.x <= 488.01); assert.equal(bodyIntersects(botRun.player.x, botRun.player.y, botRun.forceFields[0].platform), false)
})

test('bounded force-field schema round trips power, names and wiring, rejecting invalid sizes and duplicate IDs', () => {
  const level = fixture(); level.forceFields[0].name = 'Blue barrier'
  assert.deepEqual(parseLevel(level).forceFields, level.forceFields)
  assert.deepEqual(levelProblems(level), [])
  for (const change of [{orientation:'diagonal'}, {w:13}, {h:30}, {x:1195}, {y:-1}, {power:'sometimes'}, {id:' '}]) {
    const bad = structuredClone(level); Object.assign(bad.forceFields[0],change); assert.throws(() => parseLevel(bad))
  }
  const bad = structuredClone(level); bad.forceFields = Array.from({ length: 41 }, (_, i) => field('vertical', {id:`f${i}`})); assert.throws(() => parseLevel(bad))
  bad.forceFields = [field(), field('horizontal')]; assert.throws(() => parseLevel(bad))
  const legacy = blankTrial(); assert.equal(parseLevel(legacy).forceFields, undefined)
})

test('studio fields place in both directions, resize from either end, move, copy wiring, and clean up deleted connections', () => {
  let level = fixture(); level.forceFields = []
  const placed = addItem(level,'force-field',{x:500,y:550},{x:500,y:150}); level = placed.level
  assert.deepEqual(itemBounds(level,pick()), {id:level.forceFields[0].id,x:500,y:150,w:12,h:400,orientation:'vertical',power:'always'})
  assert.deepEqual(hitItem(level,506,330,3),pick())
  level = resizeItem(level,pick(),50,250,'top'); close(level.forceFields[0].y,300); close(level.forceFields[0].h,250); close(level.forceFields[0].w,12)
  level = moveItem(level,pick(),50,-50)
  const horizontal = addItem(level,'horizontal-force-field',{x:800,y:300},{x:650,y:300}); level = horizontal.level
  close(level.forceFields[1].w,150); close(level.forceFields[1].h,12)
  level = setObjectPower(level,pick(),'switched'); level.triggers = [{x:200,y:600,w:80,mode:'touch',targets:[level.forceFields[0].id]}]
  level = setObjectSwitchReversed(level,pick(),true)
  assert.ok(switchedItems(level).some(s => s.kind === 'force-field')); assert.deepEqual(switchWiringProblems(level),[])
  const pasted = pasteSelections(level,copySelections(level,[pick(),{kind:'trigger',index:0}]),40,0)
  assert.notEqual(pasted.level.forceFields[2].id,level.forceFields[0].id)
  assert.deepEqual(pasted.level.triggers[1].targets,[pasted.level.forceFields[2].id])
  const copied = copyForEditing(level); assert.deepEqual(copied.triggers[0].targets,[copied.forceFields[0].id])
  assert.ok(selectionsInRect(level,{x:540,y:200,w:40,h:300}).some(s => s.kind === 'force-field'))
  const moved = moveSelections(level,[pick(),pick(1)],10,-10); close(moved.forceFields[0].x,560); close(moved.forceFields[1].x,660)
  const taller = resizeLevelHeight(level,700); close(taller.forceFields[0].y,level.forceFields[0].y+100)
  const deleted = deleteItem(level,pick()); assert.deepEqual(deleted.triggers[0].targets,[])
  const always = setObjectPower(level,pick(),'always'); assert.deepEqual(always.triggers[0].targets,[])
  assert.doesNotThrow(() => parseLevel(pasted.level)); assert.equal(createPreviewRun(pasted.level).forceFields.length,3)
})
