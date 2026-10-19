import test from 'node:test'
import assert from 'node:assert/strict'
import { blankTrial, parseLevel, copyLevel } from '../src/games/jumping/level.ts'
import { setWallWiring, setSwitchTargets, deleteItem, moveItem, duplicateItem, resizeLevelHeight } from '../src/games/jumping/editor.ts'
import { copySelections, pasteSelections } from '../src/games/jumping/editorSelection.ts'
import { wallWires, wallWireEnergized } from '../src/games/jumping/wallWiring.ts'
import { createPreviewRun } from '../src/games/jumping/challenge.ts'
import { createRun, stepRun } from './helpers/jumping-active-run.mjs'
import { NEUTRAL_INPUT } from '../src/games/jumping/model.ts'
import { goalBounds, goalDoor, goalPoleX, GOAL_LIGHT_HEIGHT } from '../src/games/jumping/goal.ts'
import { lineBlocked } from '../src/games/jumping/geometry.ts'

function circuit() {
  const level = blankTrial()
  level.wallLights = [{ id: 'lamp', x: 600, y: 700 }]
  level.triggers = [{ x: 140, y: level.floor, w: 100, mode: 'weight', behavior: 'switch', targets: ['lamp'] }]
  return level
}
const source = { kind: 'trigger', index: 0 }

test('wall conduit is optional, follows actual targets, and retains authored height through save and room resizing', () => {
  const level = circuit()
  assert.deepEqual(wallWires(level), [])
  const wired = parseLevel(setWallWiring(level, source, true, 240))
  const [wire] = wallWires(wired)
  assert.equal(wire.target, 'lamp'); assert.equal(wire.points[1][1], level.floor - 240)
  assert.deepEqual(parseLevel(JSON.parse(JSON.stringify(wired))), wired)
  const moved = moveItem(wired, { kind: 'wall-light', index: 0 }, 120, -20)
  assert.notDeepEqual(wallWires(moved)[0].points.at(-1), wire.points.at(-1))
  const taller = resizeLevelHeight(wired, level.floor + 300)
  assert.equal(wallWires(taller)[0].points[1][1], wire.points[1][1] + 300)
  assert.deepEqual(wallWires(setWallWiring(wired, source, false)), [])
  assert.deepEqual(wallWires(setSwitchTargets(wired, source, [])), [])
  assert.deepEqual(wallWires(deleteItem(wired, { kind: 'wall-light', index: 0 })), [])
})

test('conduit and source settings survive duplication and group copy with remapped target IDs', () => {
  const level = setWallWiring(circuit(), source, true, 210)
  assert.equal(wallWires(duplicateItem(level, source).level).length, 2)
  const copied = pasteSelections(level, copySelections(level, [source, { kind: 'wall-light', index: 0 }]), 200, -60).level
  assert.equal(wallWires(copied).length, 2)
  assert.equal(wallWires(copied)[1].target, copied.wallLights[1].id)
  assert.notEqual(copied.wallLights[1].id, 'lamp')
})

test('wires stop at separate wall terminals with clear space from floor plates and lamps, including near room edges', () => {
  for (const lamp of [{ x: 600, y: 700 }, { x: 14, y: 14 }, { x: 1786, y: 906 }]) {
    const level = circuit(); Object.assign(level.wallLights[0], lamp)
    const [wire] = wallWires(setWallWiring(level, source, true, 240))
    const start = wire.points[0], end = wire.points.at(-1)
    assert.ok(start[1] < level.floor - 20, 'the wire ends above the floor-mounted switch')
    assert.ok(Math.hypot(end[0] - lamp.x, end[1] - lamp.y) > 28, 'the wall jack is separate from the lamp')
    for (const [x, y] of [start, end]) assert.ok(x >= 4 && x <= level.width - 4 && y >= 4 && y <= level.floor - 4)
  }
})

test('exit wires stay clear of the whole assembly from above and below, in either orientation and approach direction', () => {
  for (const flipX of [false, true]) for (const sourceX of [180, 1400]) for (const wireHeight of [40, 100, 240]) {
    const level = circuit()
    level.goal = { x: 900, y: level.floor, flipX, id: 'exit', power: 'switched' }
    level.triggers[0] = { ...level.triggers[0], x: sourceX, targets: ['exit'], showWires: true, wireHeight }
    const [wire] = wallWires(level), end = wire.points.at(-1), assembly = goalBounds(level.goal)
    if (wireHeight <= 100) {
      assert.equal(end[1], level.goal.y - GOAL_LIGHT_HEIGHT, 'a low incoming wire ends at indicator height')
      assert.ok(sourceX < 900 ? end[0] < assembly.x : end[0] > assembly.x + assembly.w, 'the jack stays on the incoming side of the assembly')
    } else assert.equal(end[0], goalPoleX(level.goal), 'an overhead wire keeps its terminal above the indicator')
    for (let i = 1; i < wire.points.length; i++) {
      assert.equal(lineBlocked(wire.points[i - 1], wire.points[i], [assembly]), false, 'the wire never crosses the pole or doorway')
    }
  }
})

test('exit wall terminals stay in the room when the preferred side has no clearance', () => {
  for (const goal of [{ x: 140, flipX: true }, { x: 1660, flipX: false }]) {
    const level = circuit(); level.goal = { ...goal, y: level.floor, id: 'exit', power: 'switched' }
    level.triggers[0] = { ...level.triggers[0], x: goal.flipX ? 10 : 1710, targets: ['exit'], showWires: true, wireHeight: 40 }
    const [wire] = wallWires(level), [x, y] = wire.points.at(-1), door = goalDoor(level.goal)
    assert.ok(x >= 4 && x <= level.width - 4 && y >= 4 && y <= level.floor - 4)
    assert.ok(x < door.x || x > door.x + door.w, 'the terminal never lands inside the doorway')
  }
})

test('visible wires do not change switch behavior, physics, or EMP', () => {
  const plain = circuit(), wired = setWallWiring(plain, source, true)
  const a = createRun(plain), b = createRun(wired)
  const [wire] = wallWires(wired)
  assert.equal(wallWireEnergized(wired, wire, b), false)
  for (let frame = 0; frame < 90; frame++) { stepRun(a, NEUTRAL_INPUT); stepRun(b, NEUTRAL_INPUT) }
  assert.equal(b.switchStates.get('lamp'), true)
  assert.equal(wallWireEnergized(wired, wire, b), true)
  assert.deepEqual(b.player, a.player); assert.deepEqual(b.switchStates, a.switchStates)
  a.empRemaining = b.empRemaining = 1
  assert.equal(wallWireEnergized(wired, wire, b), false, 'EMP darkens a wire even when its switch remains latched')
  for (let frame = 0; frame < 180; frame++) { stepRun(a, NEUTRAL_INPUT); stepRun(b, NEUTRAL_INPUT) }
  assert.deepEqual(b.player, a.player); assert.deepEqual(b.switchStates, a.switchStates)
  assert.equal(wallWireEnergized(wired, wire, b), true, 'the latched signal returns after EMP')
})

test('each wire shows its own input signal; relay outputs follow AND, XOR and reversal independently of destination power', () => {
  for (const logic of ['and', 'xor']) for (const reversed of [false, true]) for (const a of [false, true]) for (const b of [false, true]) {
    const level = circuit()
    level.logicRelays = [{ id: 'decision', x: 400, y: 600, switchLogic: logic, switchReversed: reversed, targets: ['lamp'], showWires: true }]
    level.triggers = [a, b].map((on, index) => ({ x: 140 + index * 200, y: level.floor, w: 100, mode: 'weight', behavior: 'switch', startsOn: on, targets: ['decision'], showWires: true }))
    const run = createPreviewRun(level), wires = wallWires(level)
    assert.equal(wallWireEnergized(level, wires[0], run), a)
    assert.equal(wallWireEnergized(level, wires[1], run), b)
    const combined = logic === 'and' ? a && b : a !== b
    assert.equal(wallWireEnergized(level, wires[2], run), reversed ? !combined : combined)
  }
})

test('float-switch wiring follows the actual raised/lowered output in static previews', () => {
  for (const raised of [false, true]) for (const activeWhen of ['raised', 'lowered']) {
    const level = circuit(); level.triggers = []
    level.floatSwitches = [{ id: 'float', x: 300, y: 500, size: 40, armLength: 80, startsRaised: raised, activeWhen, targets: ['lamp'], showWires: true }]
    const run = createPreviewRun(level), [wire] = wallWires(level)
    assert.equal(wallWireEnergized(level, wire, run), activeWhen === 'raised' ? raised : !raised)
  }
})

test('wire settings reject malformed files, normalize false away, and support legacy single-target sources', () => {
  const level = circuit()
  for (const value of ['yes', 1, null]) {
    const invalid = copyLevel(level); invalid.triggers[0].showWires = value
    assert.throws(() => parseLevel(invalid))
  }
  for (const wireHeight of [-1, 6001, Infinity, '220']) {
    const invalid = copyLevel(level); invalid.triggers[0].wireHeight = wireHeight
    assert.throws(() => parseLevel(invalid))
  }
  const legacy = copyLevel(level); delete legacy.triggers[0].targets; legacy.triggers[0].target = 'lamp'; legacy.triggers[0].showWires = true
  assert.equal(wallWires(parseLevel(legacy)).length, 1)
  legacy.triggers[0].showWires = false
  assert.equal('showWires' in parseLevel(legacy).triggers[0], false)
})
