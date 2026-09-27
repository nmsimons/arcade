import test from 'node:test'
import assert from 'node:assert/strict'
import { createRun, stepRun } from '../src/games/jumping/challenge.ts'
import { blankTrial, parseLevel } from '../src/games/jumping/level.ts'
import { NEUTRAL_INPUT, STEP } from '../src/games/jumping/model.ts'
import { addItem, duplicateItem, hitItem, itemOutline, moveItem, resizeItem } from '../src/games/jumping/editor.ts'
import { bodyIntersects, polygonIntersects, polygonPoints } from '../src/games/jumping/geometry.ts'
import { mechanismOpenPosition, mechanismShape } from '../src/games/jumping/mechanisms.ts'
import { ballShape, boxShape } from '../src/games/jumping/propGeometry.ts'

const advance = (run, frames, dt = STEP) => { for (let i = 0; i < frames; i++) stepRun(run, NEUTRAL_INPUT, dt) }
const fixture = flipX => {
  const level = blankTrial(); level.spawn.x = 340
  level.mechanisms = [{ id: 'gate', kind: 'gate', orientation: 'horizontal', flipX, x: 700, y: 780, w: 180, h: 20, travel: 500 }]
  level.triggers = [{ x: 300, y: 920, w: 80, target: 'gate', mode: 'weight' }]
  return level
}

test('vertical and horizontal gates close at half their opening speed', () => {
  for (const orientation of ['vertical', 'horizontal']) for (const flipX of [false, true]) {
    const level = fixture(flipX)
    if (orientation === 'vertical') Object.assign(level.mechanisms[0], { orientation, w: 20, h: 180 })
    const run = createRun(level), gate = run.mechanisms[0]; run.started = true
    advance(run, 30); assert.equal(gate.active, true)
    const start = { x: gate.x, y: gate.y }
    advance(run, 60)
    const open = { x: gate.x, y: gate.y }
    assert.ok(Math.abs(Math.hypot(open.x - start.x, open.y - start.y) - 65) < .001)
    run.player.x = 450
    advance(run, 1); assert.equal(gate.active, false)
    const closing = { x: gate.x, y: gate.y }
    advance(run, 60)
    assert.ok(Math.abs(Math.hypot(gate.x - closing.x, gate.y - closing.y) - 32.5) < .001)
  }
})

test('gate travel follows barrier length through old imports and resizing, while lift travel stays independent', () => {
  let level = blankTrial()
  for (const tool of ['gate', 'horizontal-gate', 'lift']) level = addItem(level, tool, { x: 700, y: 700 }, { x: 700, y: 700 }).level
  for (const m of level.mechanisms) m.travel = 500
  level = parseLevel(level)
  assert.deepEqual(level.mechanisms.map(m => m.travel), [180, 180, 500])
  level = resizeItem(level, { kind: 'mechanism', index: 0 }, 100, 240)
  level = resizeItem(level, { kind: 'mechanism', index: 1 }, 260, 100)
  level = resizeItem(level, { kind: 'mechanism', index: 2 }, 200, 100)
  assert.deepEqual(level.mechanisms.map(m => [m.w, m.h, m.travel]), [[20, 240, 240], [260, 20, 260], [200, 20, 500]])
  assert.deepEqual(parseLevel(JSON.parse(JSON.stringify(level))), level)
})

for (const flipX of [false, true]) {
  const direction = flipX ? 1 : -1
  test(`horizontal gate ${flipX ? 'right' : 'left'}: editing, body bounds and JSON preserve its orientation`, () => {
    let level = parseLevel(fixture(flipX)), m = level.mechanisms[0]
    assert.deepEqual(mechanismOpenPosition(m), { x: 700 + direction * 180, y: 780 })
    assert.deepEqual(hitItem(level, 790, 790, 0), { kind: 'mechanism', index: 0 })
    assert.equal(hitItem(level, 790 + direction * 180, 790, 0), null, 'empty retraction space is not selectable')
    assert.deepEqual(itemOutline(level, { kind: 'mechanism', index: 0 }), { x: 700, y: 780, w: 180, h: 20 })
    level = moveItem(level, { kind: 'mechanism', index: 0 }, 40, -60)
    level = duplicateItem(level, { kind: 'mechanism', index: 0 }).level
    m = level.mechanisms[1]
    assert.equal(m.orientation, 'horizontal'); assert.equal(m.flipX, flipX)
    assert.deepEqual(mechanismOpenPosition(m), { x: 780 + direction * 180, y: 720 })
    assert.deepEqual(parseLevel(JSON.parse(JSON.stringify(level))), level)
  })

  test(`horizontal gate ${flipX ? 'right' : 'left'} reopens on a player and waits for clear space before closing`, () => {
    const level = fixture(flipX); level.mechanisms[0].y = 840
    level.platforms = [{ x: 760, y: 880, w: 60, h: 40 }]
    const run = createRun(level), gate = run.mechanisms[0], p = run.player; run.started = true
    advance(run, 240)
    assert.equal(gate.x, 700 + direction * 180); assert.equal(gate.y, 840)
    assert.deepEqual({ x: gate.x, y: gate.y }, mechanismOpenPosition(gate.definition))
    advance(run, 120); assert.equal(gate.x, 700 + direction * 180)
    Object.assign(p, { x: 790, y: 880, grounded: true, vx: 0, vy: 0, footwork: null })
    for (let i = 0; i < 240; i++) {
      advance(run, 1)
      assert.equal(bodyIntersects(p.x, p.y, mechanismShape(gate)), false, 'closing cannot penetrate the player')
    }
    assert.equal(gate.active, false); assert.equal(gate.x, 700 + direction * 180)
    assert.equal(gate.safetyHold, 0)
    advance(run, 600); assert.equal(gate.x, 700 + direction * 180, 'it must not retry while the player occupies its path')
    Object.assign(p, { x: 450, y: 920, footwork: null })
    advance(run, 60); assert.equal(gate.x, 700 + direction * 180, 'clearance includes time to step away')
    advance(run, 420); assert.equal(gate.x, 700); assert.equal(gate.safetyHold, null)
    const reset = createRun(level).mechanisms[0]
    assert.equal(reset.x, 700); assert.equal(reset.active, false)
  })

  for (const kind of ['box', 'ball']) test(`horizontal gate ${flipX ? 'right' : 'left'} reopens around a ${kind} then closes when clear`, () => {
    const level = fixture(flipX); level.mechanisms[0].y = 840
    level.props = [{ kind, x: 1200, y: 920, size: 100 }]
    const run = createRun(level), gate = run.mechanisms[0], prop = run.props[0]; run.started = true
    advance(run, 240)
    run.player.x = 450; prop.x = 790
    advance(run, 240)
    assert.equal(gate.x, 700 + direction * 180, 'the blocked gate reopens fully')
    assert.ok(Math.abs(prop.x - 790) < .1, 'the gate does not crush or teleport the prop')
    prop.x = 1200; advance(run, 420)
    assert.equal(gate.x, 700)
  })

  test(`horizontal gate ${flipX ? 'right' : 'left'} frees a player caught between its tip and a ledge`, () => {
    const level = fixture(flipX), wall = flipX ? 700 : 880
    level.platforms = [{ x: flipX ? wall - 200 : wall, y: 780, w: 200, h: 140 }]
    const run = createRun(level), gate = run.mechanisms[0], p = run.player; run.started = true
    // The gate is almost closed, with the player's lower legs in the narrowing gap.
    gate.x = 700 + direction * 30
    Object.assign(p, { x: wall + direction * 14, y: 798, grounded: false, facing: -direction, vx: 0, vy: 0, footwork: null })
    let reversed = false, reopened = false
    for (let i = 0; i < 480; i++) {
      advance(run, 1)
      reversed ||= gate.safetyHold !== null
      reopened ||= gate.x === 700 + direction * 180
      assert.equal(bodyIntersects(p.x, p.y, mechanismShape(gate)), false)
      assert.equal(bodyIntersects(p.x, p.y, level.platforms[0]), false)
    }
    assert.ok(reversed); assert.ok(reopened)
    // Facing the bank can catch its ledge once the gate releases the legs.
    // The ordinary drop control must now work, with enough room to reach ground.
    for (let i = 0; i < 20; i++) stepRun(run, { ...NEUTRAL_INPUT, drop: true })
    advance(run, 120)
    assert.equal(p.grounded, true); assert.equal(p.y, 920, 'the player gets out of the pinch and regains footing')
    const start = p.x
    for (let i = 0; i < 90; i++) stepRun(run, { ...NEUTRAL_INPUT, move: direction })
    assert.ok((p.x - start) * direction > 30, 'the player can move away after release')
  })

  test(`horizontal gate ${flipX ? 'right' : 'left'} carries a player and a box with its moving collider`, () => {
    const level = fixture(flipX)
    level.spawn = { x: 740, y: 780 }
    level.props = [{ kind: 'box', x: 340, y: 920, size: 60 }, { kind: 'box', x: 830, y: 780, size: 40 }]
    const run = createRun(level), gate = run.mechanisms[0]; run.started = true
    for (let i = 0; i < 240; i++) {
      advance(run, 1)
      assert.ok(run.player.grounded)
      assert.ok(Math.abs(run.player.x - gate.x - 40) < .05)
      assert.ok(Math.abs(run.props[1].x - gate.x - 130) < .05)
      assert.ok(Math.abs(run.props[1].y - gate.y) < .05)
    }
    assert.equal(gate.x, 700 + direction * 180)
  })

  for (const passenger of ['player', 'box', 'ball']) for (const dt of [STEP, 1 / 60]) test(`horizontal gate ${flipX ? 'right' : 'left'} closes beneath its obstructed ${passenger} rider (${1 / dt} Hz)`, () => {
    const level = fixture(flipX)
    level.platforms = [{ x: flipX ? 730 : 820, y: 600, w: 30, h: 180 }]
    if (passenger !== 'player') level.props = [{ kind: passenger, x: 1200, y: 920, size: 40 }]
    const run = createRun(level), gate = run.mechanisms[0], p = run.player; run.started = true
    advance(run, 240)
    const offset = passenger === 'player' ? flipX ? 10 : 170 : flipX ? 50 : 130
    p.x = 450
    if (passenger === 'player') Object.assign(p, { x: gate.x + offset, y: gate.y, footwork: null })
    else Object.assign(run.props[0], { x: gate.x + offset, y: gate.y })
    let reversed = false
    for (let i = 0; i < 600; i++) {
      advance(run, 1, dt)
      reversed ||= gate.safetyHold !== null
      if (passenger === 'player') assert.equal(bodyIntersects(p.x, p.y, level.platforms[0]), false)
      else {
        const shape = passenger === 'box' ? boxShape(run.props[0]) : ballShape(run.props[0])
        for (const solid of [...run.terrain, mechanismShape(gate)]) assert.equal(polygonIntersects(polygonPoints(shape), solid, .03), false)
      }
    }
    assert.equal(reversed, false, 'a blocked carry does not trigger gate safety reversal')
    assert.equal(gate.x, 700)
    assert.equal(gate.safetyHold, null)
  })
}

test('mechanism import rejects invalid orientations and flips', () => {
  for (const change of [m => { m.orientation = 'diagonal' }, m => { m.flipX = 'yes' }, m => { delete m.orientation }]) {
    const level = fixture(false); change(level.mechanisms[0])
    assert.throws(() => parseLevel(level))
  }
})
