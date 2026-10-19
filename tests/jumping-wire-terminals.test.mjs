import test from 'node:test'
import assert from 'node:assert/strict'
import { blankTrial, copyLevel, parseLevel, levelHeight } from '../src/games/jumping/level.ts'
import { addItem, setWallTerminal, moveItem, duplicateItem, resizeLevelHeight } from '../src/games/jumping/editor.ts'
import { copySelections, pasteSelections, moveSelections } from '../src/games/jumping/editorSelection.ts'
import { wallWires, wallTerminals } from '../src/games/jumping/wallWiring.ts'
import { wallWiringItems } from '../src/games/jumping/switchPower.ts'
import { createRun, stepRun } from './helpers/jumping-active-run.mjs'
import { NEUTRAL_INPUT } from '../src/games/jumping/model.ts'

const source = { kind: 'trigger', index: 0 }, lamp = { kind: 'wall-light', index: 0 }
function circuit() {
  const level = blankTrial()
  level.wallLights = [{ id: 'lamp', x: 600, y: 700 }]
  level.triggers = [{ x: 300, y: level.floor, w: 100, mode: 'weight', behavior: 'switch', startsOn: true, targets: ['lamp'], showWires: true }]
  return level
}

test('custom jacks share a position across different incoming lanes and outgoing connections', () => {
  const base = circuit()
  base.wallLights[0].relay = true; base.wallLights[0].targets = ['exit']; base.wallLights[0].showWires = true
  base.goal = { ...base.goal, id: 'exit', power: 'switched' }
  base.triggers.push({ ...base.triggers[0], x: 900, wireHeight: 400 })
  const level = setWallTerminal(setWallTerminal(base, source, { x: 380, y: 650 }), lamp, { x: 560, y: 620 })
  const wires = wallWires(parseLevel(level))
  assert.deepEqual(wires[0].points[0], [380, 650])
  assert.deepEqual(wires[0].points.at(-1), [560, 620])
  assert.deepEqual(wires[1].points.at(-1), [560, 620])
  assert.deepEqual(wires[2].points[0], [560, 620])
  assert.equal(wallTerminals(level).filter(p => p.owner.kind === 'wall-light').length, 1)
  assert.deepEqual(wallWires(setWallTerminal(setWallTerminal(level, source, null), lamp, null)), wallWires(base))
  assert.equal('wireTerminal' in base.triggers[0], false, 'editing never mutates the original')
})

test('every wall-wired item preserves its optional jack through JSON parsing, including the shared water pump port', () => {
  let level = circuit()
  for (const tool of ['lift', 'light', 'float-switch', 'logic-relay', 'gravity-plate', 'water', 'force-field'])
    level = addItem(level, tool, { x: 800, y: 500 }, { x: 800, y: 500 }).level
  for (const item of wallWiringItems(level)) level = setWallTerminal(level, item, { x: 780, y: 400 })
  const loaded = parseLevel(JSON.parse(JSON.stringify(level)))
  for (const item of wallWiringItems(loaded)) assert.deepEqual(item.definition.wireTerminal, { x: 780, y: 400 }, item.kind)
  const old = parseLevel(circuit())
  assert.ok(wallWiringItems(old).every(item => !('wireTerminal' in item.definition)))
})

test('malformed and out-of-room jack positions are rejected even on disconnected devices', () => {
  for (const point of [null, [], {}, { x: 40 }, { x: '40', y: 50 }, { x: NaN, y: 50 }, { x: 40, y: Infinity },
    { x: 3, y: 100 }, { x: 100, y: 3 }, { x: 1800, y: 100 }, { x: 100, y: 920 }, { x: 20000, y: 100 }]) {
    const level = circuit(); level.wallLights[0].wireTerminal = point; level.triggers[0].targets = []
    assert.throws(() => parseLevel(level), JSON.stringify(point))
  }
  const level = setWallTerminal(circuit(), lamp, { x: -100, y: 4000 })
  assert.deepEqual(level.wallLights[0].wireTerminal, { x: 4, y: levelHeight(level) - 4 })
  assert.deepEqual(parseLevel(level).wallLights[0].wireTerminal, level.wallLights[0].wireTerminal)
})

test('water fill and drain wires use the same authored wall terminal after save/reopen', () => {
  const level = circuit()
  level.gravityPlates = [{ id: 'pool', x: 700, y: 400, w: 300, h: 300, gravity: -1, effect: 'water', wireTerminal: { x: 660, y: 380 } }]
  level.triggers[0].targets = ['pool:fill', 'pool:drain']
  const wires = wallWires(parseLevel(JSON.parse(JSON.stringify(level))))
  assert.equal(wires.length, 2)
  for (const wire of wires) assert.deepEqual(wire.points.at(-1), [660, 380])
  assert.equal(wallTerminals(level).filter(p => p.owner.kind === 'gravity-plate').length, 1)
})

test('owner movement, group movement and duplication carry jacks without changing their originals', () => {
  const level = setWallTerminal(setWallTerminal(circuit(), source, { x: 350, y: 700 }), lamp, { x: 560, y: 620 })
  const moved = moveSelections(level, [source, lamp], 200, -60)
  assert.deepEqual(moved.triggers[0].wireTerminal, { x: 550, y: 640 })
  assert.deepEqual(moved.wallLights[0].wireTerminal, { x: 760, y: 560 })
  const copied = pasteSelections(level, copySelections(level, [source, lamp]), 200, -60).level
  assert.deepEqual(copied.triggers[1].wireTerminal, moved.triggers[0].wireTerminal)
  assert.deepEqual(copied.wallLights[1].wireTerminal, moved.wallLights[0].wireTerminal)
  assert.equal(wallWires(copied)[1].target, copied.wallLights[1].id)
  const duplicated = duplicateItem(level, source).level
  assert.deepEqual(duplicated.triggers[1].wireTerminal, { x: 390, y: 700 })
  assert.deepEqual(duplicated.triggers[0].wireTerminal, level.triggers[0].wireTerminal)
  const clamped = moveItem(level, lamp, 5000, 0)
  assert.equal(clamped.wallLights[0].wireTerminal.x - 560, clamped.wallLights[0].x - 600, 'carry by the actual clamped device movement')
  assert.deepEqual(level.wallLights[0].wireTerminal, { x: 560, y: 620 })
})

test('room resizing preserves floor-relative jack height and stops before cropping a custom jack', () => {
  const level = setWallTerminal(circuit(), lamp, { x: 560, y: 100 })
  const taller = resizeLevelHeight(level, level.floor + 300)
  assert.deepEqual(taller.wallLights[0].wireTerminal, { x: 560, y: 400 })
  const shorter = resizeLevelHeight(level, 400)
  assert.equal(shorter.wallLights[0].wireTerminal.y, 4)
  assert.equal(levelHeight(shorter), levelHeight(level) - 96)
  assert.deepEqual(parseLevel(shorter).wallLights[0].wireTerminal, shorter.wallLights[0].wireTerminal)
})

test('a goal carried by terrain keeps its custom wall point at the same offset', () => {
  const level = circuit()
  level.platforms = [{ x: 900, y: 700, w: 500, h: 100 }]
  level.goal = { x: 1100, y: 700 }
  const wired = setWallTerminal(level, { kind: 'goal', index: 0 }, { x: 1050, y: 520 })
  const moved = moveItem(wired, { kind: 'platform', index: 0 }, 100, -60)
  assert.deepEqual(moved.goal.wireTerminal, { x: 1150, y: 460 })
})

test('runtime mechanism movement leaves the authored jack on the back wall', () => {
  let level = circuit()
  level.mechanisms = [{ id: 'lift', kind: 'lift', x: 800, y: 800, w: 180, h: 20, travel: 300 }]
  level.triggers[0].targets = ['lift']
  level = setWallTerminal(level, { kind: 'mechanism', index: 0 }, { x: 760, y: 680 })
  const original = copyLevel(level), run = createRun(level)
  for (let i = 0; i < 240; i++) stepRun(run, NEUTRAL_INPUT)
  assert.ok(run.mechanisms[0].y < 750, 'the lift actually travels')
  assert.deepEqual(wallWires(run.level)[0].points.at(-1), [760, 680])
  assert.deepEqual(level, original)
})
