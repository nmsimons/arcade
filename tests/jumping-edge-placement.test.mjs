import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { blankTrial, levelProblems, parseLevel } from '../src/games/jumping/level.ts'
import { addItem, itemBounds, moveItem, resizeItem, setCoinSwitchDisplay, setCoinSwitchOrientation, setShovebotLimit } from '../src/games/jumping/editor.ts'
import { placeOnSurface } from '../src/games/jumping/editorPlacement.ts'
import { createRun, stepRun } from '../src/games/jumping/challenge.ts'
import { NEUTRAL_INPUT, STEP } from '../src/games/jumping/model.ts'
import { propLoadsPlate } from '../src/games/jumping/propGeometry.ts'
import { robotHulls } from '../src/games/jumping/robotPhysics.ts'

function source() {
  const level = blankTrial()
  level.pickups = [300, 400, 500].map(x => ({ kind: 'coin', x, y: 300 }))
  return level
}
function roundTrip(level) {
  assert.deepEqual(levelProblems(level), [])
  assert.deepEqual(parseLevel(JSON.parse(JSON.stringify(level))), level)
}

for (const side of ['left', 'right']) {
  test(`${side} boundary accepts the real footprint of props, mechanisms and switches`, () => {
    const level = source(), left = side === 'left'
    for (const kind of ['ball', 'box']) for (const size of [30, 68, 200]) {
      level.props = [{ kind, size, x: left ? size / 2 : level.width - size / 2, y: level.floor }]
      roundTrip(level)
      const invalid = structuredClone(level); invalid.props[0].x += left ? -.01 : .01
      assert.throws(() => parseLevel(invalid), `${kind} must not cross the wall`)
    }
    level.props = []
    for (const definition of [
      { kind: 'lift', w: 120, h: 20 }, { kind: 'gate', w: 20, h: 180 },
      { kind: 'gate', orientation: 'horizontal', w: 160, h: 20 },
    ]) {
      level.mechanisms = [{ ...definition, id: 'edge', x: left ? 0 : level.width - definition.w, y: 500, travel: definition.orientation ? definition.w : 180 }]
      roundTrip(level)
      const invalid = structuredClone(level); invalid.mechanisms[0].x += left ? -.01 : .01
      assert.throws(() => parseLevel(invalid))
    }
    level.mechanisms = []
    for (const definition of [
      { mode: 'touch', w: 100, y: level.floor }, { mode: 'weight', w: 40, y: 0, ceiling: true },
      { mode: 'coins', w: 120, y: 200, threshold: 3 },
      { mode: 'coins', w: 20, h: 180, orientation: 'vertical', y: 200, threshold: 3 },
      { mode: 'coins', w: 120, display: 'digital', y: 200, threshold: 3 },
    ]) {
      level.triggers = [{ ...definition, x: left ? 0 : level.width - definition.w, targets: [] }]
      roundTrip(level)
      const invalid = structuredClone(level); invalid.triggers[0].x += left ? -.01 : .01
      assert.throws(() => parseLevel(invalid))
    }
  })

  test(`${side} boundary stays reachable through creation, dragging, snapping and resizing`, () => {
    const left = side === 'left'
    for (const tool of ['ball', 'box', 'plate', 'lift', 'moving-platform', 'gate', 'horizontal-gate', 'coin-switch', 'pusher']) {
      const level = source(), point = { x: left ? -100 : level.width + 100, y: tool === 'coin-switch' ? 200 : level.floor }
      const added = addItem(level, tool, point, point)
      const bounds = itemBounds(added.level, added.selection)
      assert.equal(left ? bounds.x : bounds.x + bounds.w, left ? 0 : level.width, `${tool} creation`)
      roundTrip(added.level)
      const moved = moveItem(added.level, added.selection, left ? 500 : -500, 0)
      const back = moveItem(moved, added.selection, left ? -10000 : 10000, 0)
      const snapped = tool === 'coin-switch' ? back : placeOnSurface(back, added.selection)
      const edge = itemBounds(snapped, added.selection)
      assert.equal(left ? edge.x : edge.x + edge.w, left ? 0 : level.width, `${tool} drag and snap`)
      roundTrip(snapped)
    }
    for (const tool of ['ball', 'box', 'plate', 'lift', 'horizontal-gate', 'coin-switch']) {
      const level = source(), added = addItem(level, tool, { x: 120, y: level.floor - 100 }, { x: 120, y: level.floor - 100 })
      if (tool === 'coin-switch') added.level = setCoinSwitchDisplay(added.level, added.selection.index, 'bar')
      const b = itemBounds(added.level, added.selection)
      const positioned = moveItem(added.level, added.selection, (left ? 60 : level.width - b.w - 60) - b.x, 0)
      const resized = resizeItem(positioned, added.selection, 5000, b.h, left ? 'left' : 'right')
      const edge = itemBounds(resized, added.selection)
      assert.equal(left ? edge.x : edge.x + edge.w, left ? 0 : level.width, `${tool} resize`)
      roundTrip(resized)
    }
  })

  test(`${side} boundary coin displays preserve wiring through orientation and style conversion`, () => {
    const level = source(), left = side === 'left'
    level.triggers = [{ mode: 'coins', x: left ? 0 : level.width - 20, y: 200, w: 20, h: 180,
      orientation: 'vertical', threshold: 3, name: 'Edge display', targets: [] }]
    const numeric = setCoinSwitchDisplay(level, 0, 'digital')
    assert.equal(numeric.triggers[0].x, left ? 0 : level.width - 120)
    roundTrip(numeric)
    const horizontal = setCoinSwitchOrientation(level, 0, 'horizontal')
    assert.equal(horizontal.triggers[0].x, left ? 0 : level.width - 180)
    assert.equal(horizontal.triggers[0].name, 'Edge display')
    roundTrip(horizontal)
    for (const thickness of [24, 40, 60]) {
      const legacy = structuredClone(level); legacy.triggers[0].w = thickness
      legacy.triggers[0].x = left ? 0 : level.width - thickness
      const decoded = parseLevel(legacy)
      assert.equal(decoded.triggers[0].x, legacy.triggers[0].x + (thickness - 20) / 2)
      assert.equal(decoded.triggers[0].w, 20)
      assert.deepEqual(levelProblems(decoded), [])
    }
  })

  test(`${side} boundary mounted plate stays attached when its elevator is moved or resized`, () => {
    const level = source(), left = side === 'left'
    level.mechanisms = [{ kind: 'lift', id: 'edge-lift', x: 600, y: 900, w: 140, h: 20, travel: 180 }]
    level.triggers = [{ mode: 'weight', x: 600, y: 900, w: 100, targets: [], mount: { mechanism: 'edge-lift', x: 0 } }]
    const selection = { kind: 'mechanism', index: 0 }
    const moved = moveItem(level, selection, left ? -10000 : 10000, 0)
    const resized = resizeItem(moved, selection, 100, 20)
    assert.equal(resized.triggers[0].x, resized.mechanisms[0].x)
    assert.equal(resized.triggers[0].mount.mechanism, 'edge-lift')
    roundTrip(resized)
  })

  test(`${side} boundary shovebot patrol uses its real flat hull and turns safely at the wall`, () => {
    const level = source(), left = side === 'left'
    const added = addItem(level, 'pusher', { x: left ? 0 : level.width, y: level.floor }, { x: left ? 0 : level.width, y: level.floor })
    const limited = setShovebotLimit(added.level, 0, left ? 'left' : 'right', left ? -999 : 99999)
    assert.equal(left ? limited.robots[0].left : limited.robots[0].right, left ? 26 : level.width - 26)
    roundTrip(limited)
    const run = createRun(limited)
    stepRun(run, { ...NEUTRAL_INPUT, move: 1 })
    for (let frame = 0; frame < 240; frame++) {
      stepRun(run, NEUTRAL_INPUT)
      for (const hull of robotHulls(run.robots[0])) for (const [x] of hull) assert.ok(x >= -.01 && x <= level.width + .01, `hull crosses wall at ${x}`)
    }
  })
}

test('goal creation clamps the complete door and indicator footprint in either orientation', () => {
  for (const flipX of [false, true]) for (const right of [false, true]) {
    const level = source(); level.goal.flipX = flipX
    const point = { x: right ? level.width + 100 : -100, y: level.floor }
    const added = addItem(level, 'goal', point, point)
    roundTrip(added.level)
  }
})

test('edge receivers replace artificial stops and hold real cargo at the wall after release', async () => {
  for (const [file, y] of [['Balls.jump-level.json', 920], ['Tower.jump-level.json', 2000]]) {
    const level = parseLevel(JSON.parse(await readFile(new URL(`../public/levels/jumping/${file}`, import.meta.url), 'utf8')))
    assert.ok(!level.platforms.some(p => p.x === 0 && p.y + p.h === y), `${file} has no added boundary stop`)
    const plate = level.triggers.find(t => t.x <= 15 && t.y === y)
    assert.ok(plate, `${file} receiver covers the resting ball center beside the world wall`)
    const trial = blankTrial(); trial.spawn.x = 500; trial.goal.power = 'always'; trial.props = [{ kind: 'ball', x: 160, y: trial.floor, size: 30 }]
    trial.triggers = [{ ...plate, y: trial.floor, targets: [] }]
    const run = createRun(parseLevel(trial)); stepRun(run, { ...NEUTRAL_INPUT, move: 1 }); run.props[0].vx = -500
    for (let frame = 0; frame < 10 / STEP; frame++) stepRun(run, NEUTRAL_INPUT)
    assert.ok(Math.abs(run.props[0].x - 15) < .1, `small ball rests at the wall: ${run.props[0].x}`)
    assert.ok(propLoadsPlate(run.props[0], plate.x, trial.floor, plate.w))
    assert.equal(run.triggers[0].active, true)
  }
})
