import test from 'node:test'
import assert from 'node:assert/strict'
import Matter from 'matter-js'
import { createGravityField, updateGravityField, playerGravity, propGravity, gravityAtPoint, circleRectangleArea, clippedPolygonArea } from '../src/games/jumping/gravity.ts'
import { blankTrial, parseLevel, levelProblems, levelTerrain } from '../src/games/jumping/level.ts'
import { createRun, createPreviewRun, stepRun } from '../src/games/jumping/challenge.ts'
import { createPlayer, NEUTRAL_INPUT, STEP, TUNING, stepPlayer, respawn } from '../src/games/jumping/model.ts'
import { athletePose } from '../src/games/jumping/athlete.ts'
import { playerContactBody } from '../src/games/jumping/playerContacts.ts'
import { bodyIntersects } from '../src/games/jumping/geometry.ts'
import { canGrip } from '../src/games/jumping/friction.ts'
import { createRope, stepRope } from '../src/games/jumping/climbables.ts'
import { addItem, deleteItem, duplicateItem, moveItem, resizeItem, resizeLevelHeight, hitItem, itemBounds, setObjectPower, setObjectRelay, setSwitchTargets } from '../src/games/jumping/editor.ts'
import { copyForEditing } from '../src/games/jumping/puzzleEditor.ts'
import { resolveSwitchStates, switchedItems, switchWiringProblems } from '../src/games/jumping/switchPower.ts'

const close = (actual, expected, tolerance = 1e-7) => assert.ok(Math.abs(actual - expected) < tolerance, `${actual} ≠ ${expected}`)
const plate = (overrides = {}) => ({ id: 'gravity', x: 100, y: 0, w: 600, h: 920, gravity: -1, ...overrides })
function fieldFor(plates) {
  const field = createGravityField()
  updateGravityField(field, plates, new Map(plates.map(p => [p.id, true])), true)
  return field
}
const prop = (kind, overrides = {}) => ({ kind, x: 300, y: 500, size: 80, angle: 0, vx: 0, vy: 0, angularVelocity: 0, grounded: false, ...overrides })
const step = (run, count = 1, input = NEUTRAL_INPUT) => { for (let i = 0; i < count; i++) stepRun(run, input) }
function fixture(overrides = {}) {
  const level = blankTrial()
  level.gravityPlates = [plate(overrides)]
  level.triggers = [{ x: 800, y: 920, w: 80, mode: 'weight', behavior: 'toggle', startsOn: true, targets: ['gravity'] }]
  return level
}

for (const gravity of [-3, -1, 0, .5, 1, 3]) test(`a fully covered body uses gravity ${gravity} and an uncovered body keeps ordinary gravity`, () => {
  const field = fieldFor([plate({ gravity })]), p = createPlayer({ x: 300, y: 500 })
  close(playerGravity(field, p), gravity * TUNING.gravity)
  for (const kind of ['box', 'ball']) close(propGravity(field, prop(kind)), gravity * TUNING.gravity)
  p.x = 900; close(playerGravity(field, p), TUNING.gravity)
  for (const kind of ['box', 'ball']) close(propGravity(field, prop(kind, { x: 900 })), TUNING.gravity)
})

test('half coverage cancels equal reverse gravity for the player, crouch, rotated boxes and balls on both axes', () => {
  const vertical = fieldFor([plate({ x: 300, w: 400 })]), horizontal = fieldFor([plate({ y: 460, h: 460 })])
  const p = createPlayer({ x: 300, y: 500 })
  close(playerGravity(vertical, p), 0)
  p.crouching = true; close(playerGravity(vertical, p), 0)
  for (const kind of ['box', 'ball']) for (const angle of [0, .3, Math.PI / 4, 1.3]) {
    const b = prop(kind, { angle })
    close(propGravity(vertical, b), 0)
    close(propGravity(horizontal, b), 0)
  }
})

test('player top and sole boundaries use the collision hull area, rather than its center or rectangular bounds', () => {
  const p = createPlayer({ x: 300, y: 500 })
  const field = fieldFor([plate({ y: 480, h: 40 })])
  // The lower 20 units contain an 18-unit triangle and a 2-unit rectangle.
  const fraction = (24 * 9 + 24 * 2) / (24 * (TUNING.height - 9))
  close(playerGravity(field, p), TUNING.gravity * (1 - 2 * fraction))
})

test('exact round coverage rejects a bounding-box corner and includes all circular segments', () => {
  close(circleRectangleArea(0, 0, 10, 8, 8, 15, 15), 0)
  close(circleRectangleArea(0, 0, 10, -20, -20, 20, 20), Math.PI * 100)
  close(circleRectangleArea(0, 0, 10, 0, 0, 10, 10), Math.PI * 25)
  const segment = 100 * Math.acos(.5) - 5 * Math.sqrt(75)
  close(circleRectangleArea(0, 0, 10, 5, -10, 10, 10), segment)
  // Four adjoining quadrants must conserve the entire disk's mass.
  let area = 0
  for (const x of [-10, 0]) for (const y of [-10, 0]) area += circleRectangleArea(0, 0, 10, x, y, x + 10, y + 10)
  close(area, Math.PI * 100)
})

test('rotated polygon clipping conserves area and stays accurate far from the origin', () => {
  for (const offset of [0, 19000]) {
    const diamond = [[offset, 100], [offset + 100, 200], [offset, 300], [offset - 100, 200]]
    close(clippedPolygonArea(diamond, offset - 200, 0, offset + 200, 400), 20000)
    close(clippedPolygonArea(diamond, offset, 0, offset + 200, 400), 10000)
    close(clippedPolygonArea(diamond, offset + 50, 0, offset + 200, 400), 2500)
  }
})

test('crossing a field edge changes acceleration continuously without resetting momentum', () => {
  const field = fieldFor([plate({ x: 300 })])
  for (const kind of ['box', 'ball']) {
    let previous = Infinity
    for (let x = 250; x <= 350; x += .5) {
      const g = propGravity(field, prop(kind, { x }))
      assert.ok(g <= previous + 1e-7)
      assert.ok(g >= -TUNING.gravity - 1e-7 && g <= TUNING.gravity + 1e-7)
      if (previous !== Infinity) assert.ok(Math.abs(g - previous) < 30)
      previous = g
    }
  }
  const p = createPlayer({ x: 300, y: 500 }); p.grounded = false; p.vy = -200
  stepPlayer(p, NEUTRAL_INPUT, STEP, [], undefined, undefined, undefined, field)
  close(p.vy, -200 * Math.exp(-TUNING.zeroGravityDrag * STEP))
})

test('overlap averages local gravity, counts covered mass once and is independent of plate order', () => {
  const a = plate({ id: 'a', x: 260, w: 80, gravity: -1 }), b = plate({ id: 'b', x: 300, w: 80, gravity: 3 })
  for (const plates of [[a, b], [b, a]]) {
    const field = fieldFor(plates)
    close(gravityAtPoint(field, 280, 500), -TUNING.gravity)
    close(gravityAtPoint(field, 320, 500), TUNING.gravity)
    close(gravityAtPoint(field, 360, 500), 3 * TUNING.gravity)
    close(propGravity(field, prop('box')), 0)
    // Duplicate identical reverse fields must not double their force.
    close(propGravity(fieldFor([a, { ...a, id: 'copy' }]), prop('ball')), -TUNING.gravity)
  }
})

test('adjoining fields combine area correctly even when neither contains the center', () => {
  const field = fieldFor([plate({ id: 'a', x: 260, w: 40 }), plate({ id: 'b', x: 300, w: 40 })])
  close(propGravity(field, prop('box')), -TUNING.gravity)
  close(propGravity(field, prop('ball')), -TUNING.gravity)
})

test('unchanged power reuses the partition, and EMP or switch changes invalidate it', () => {
  const field = createGravityField(), plates = [plate()], states = new Map([['gravity', true]])
  updateGravityField(field, plates, states, true)
  const strips = field.strips, revision = field.revision
  updateGravityField(field, plates, states, true)
  assert.equal(field.strips, strips); assert.equal(field.revision, revision)
  updateGravityField(field, plates, states, false)
  assert.equal(field.strips.length, 0); assert.equal(field.revision, revision + 1)
  updateGravityField(field, plates, states, true)
  close(propGravity(field, prop('box')), -TUNING.gravity)
})

test('the switched plate lifts the player from rest, permits steering, and returns to ordinary gravity outside', () => {
  const run = createRun(fixture()); run.started = true
  step(run, 60)
  assert.ok(run.player.y < 750); assert.ok(run.player.vy < -700)
  assert.equal(run.player.grounded, false)
  step(run, 260, { ...NEUTRAL_INPUT, move: 1 })
  assert.ok(run.player.x > 710)
  assert.equal(run.player.gravity, TUNING.gravity)
  step(run, 240)
  assert.equal(run.player.grounded, true)
  close(run.player.y, 920)
})

test('reverse gravity turns at the ceiling, supports running and crouching, and jumps downward', () => {
  const run = createRun(fixture()); run.started = true
  step(run, 360)
  close(run.player.y, 0, .01)
  assert.ok(Math.abs(run.player.vy) < .01)
  assert.equal(run.player.grounded, true); assert.equal(run.player.inverted, true)
  step(run, 60, { ...NEUTRAL_INPUT, move: 1 })
  assert.ok(run.player.x > 250); assert.ok(run.player.vx > 300)
  close(run.player.y, 0, .01)
  step(run, 30, { ...NEUTRAL_INPUT, crouch: true })
  assert.equal(run.player.crouching, true); close(playerContactBody(run.player).height, TUNING.crouchHeight)
  step(run, 30)
  assert.equal(run.player.crouching, false)
  step(run, 1, { ...NEUTRAL_INPUT, jump: true, jumpStrength: 1 })
  assert.equal(run.player.grounded, false); assert.ok(run.player.vy > 500)
  step(run, 30); assert.ok(run.player.y > 100)
  step(run, 160); close(run.player.y, 0, .01); assert.equal(run.player.grounded, true)
  const snapshot = structuredClone(run.player)
  athletePose(run.player)
  assert.deepEqual(run.player, snapshot, 'pose reflection must leave gameplay state unchanged')
})

test('losing reverse power drops an inverted player and normal floor contact restores upright footing', () => {
  const run = createRun(fixture()); run.started = true
  step(run, 360); assert.equal(run.player.inverted, true)
  run.empRemaining = 5
  step(run, 60); assert.equal(run.player.inverted, true); assert.equal(run.player.grounded, false); assert.ok(run.player.vy > 700)
  step(run, 120); close(run.player.y, 920, .01); assert.equal(run.player.grounded, true); assert.equal(run.player.inverted, false)
  run.player.inverted = true; respawn(run.player)
  assert.equal(run.player.inverted, false); assert.equal(run.player.gravity, TUNING.gravity)
})

test('reverse footing follows polygon undersides without penetrating and can use a solid loose box as a ceiling', () => {
  for (const box of [false, true]) {
    const level = fixture()
    if (box) level.props = [{ kind: 'box', x: 160, y: 500, size: 120 }]
    else level.platforms = [{ x: 100, y: 200, w: 600, h: 150, polygon: [[0, 0], [600, 0], [600, 150], [0, 50]] }]
    const run = createRun(level); run.started = true
    step(run, 600)
    assert.equal(run.player.inverted, true); assert.equal(run.player.grounded, true)
    if (box) assert.ok(run.player.contacts.support.collider.prop)
    else {
      assert.ok(run.player.groundAngle > .1)
      step(run, 60, { ...NEUTRAL_INPUT, move: 1 })
      assert.ok(run.player.x > 240)
      close(run.player.y, 250 + (run.player.x - 100) / 6, .01)
      assert.ok(run.platforms.every(b => !bodyIntersects(run.player.x, run.player.y, b, TUNING.height, -1)))
    }
  }
})

for (const slope of [-2.5, -1.2, -.7, .7, 1.2, 2.5]) test(`reverse contact uses ordinary grip or sliding on an underside slope of ${slope}`, () => {
  const level = fixture({ x: 0, w: 1800, h: 2000 })
  level.height = level.floor = 2000; level.spawn = { x: 500, y: 2000 }; level.goal.y = 2000
  const rise = Math.abs(slope) * 240
  level.platforms = [{ x: 380, y: 400, w: 240, h: rise + 60,
    polygon: [[0, 0], [240, 0], [240, slope > 0 ? rise + 60 : 60], [0, slope > 0 ? 60 : rise + 60]] }]
  const run = createRun(level); run.started = true
  let turned = false, supported = false, sliding = false
  for (let i = 0; i < 360; i++) {
    step(run)
    if (!run.player.inverted) continue
    turned ||= run.player.y > 100
    const onSlope = run.player.contacts?.support?.platform.x === 380
    supported ||= run.player.grounded && onSlope; sliding ||= !!run.player.sliding?.active
    assert.ok(run.platforms.every(b => !bodyIntersects(run.player.x, run.player.y, b, TUNING.height, -1)))
    if (run.player.grounded && onSlope) {
      close(run.player.y, 460 + (slope > 0 ? run.player.x - 380 : 620 - run.player.x) * Math.abs(slope), .01)
      const before = structuredClone(run.player)
      athletePose(run.player); assert.deepEqual(run.player, before)
    }
  }
  assert.equal(turned, true)
  if (canGrip(Math.atan(slope))) {
    assert.equal(supported, true)
    step(run, 1, { ...NEUTRAL_INPUT, jump: true, jumpStrength: 1 })
    assert.ok(run.player.vy > 500)
  } else assert.equal(sliding, true, 'steep reverse surfaces must slip under the shared friction model')
})

test('reverse running follows a concave ceiling across flat and sloped seams', () => {
  const level = fixture()
  level.platforms = [{ x: 100, y: 100, w: 600, h: 150,
    polygon: [[0, 0], [600, 0], [600, 150], [400, 150], [200, 70], [0, 70]] }]
  const run = createRun(level); run.started = true; step(run, 360)
  assert.equal(run.player.inverted, true)
  let onRamp = false, beyondRamp = false
  for (let i = 0; i < 170; i++) {
    step(run, 1, { ...NEUTRAL_INPUT, move: 1 })
    const p = run.player
    if (p.x >= 680) break
    assert.equal(p.grounded, true)
    const surface = p.x < 300 ? 170 : p.x > 500 ? 250 : 170 + (p.x - 300) * .4
    close(p.y, surface, .01)
    onRamp ||= p.x > 350 && p.x < 450; beyondRamp ||= p.x > 550
  }
  assert.equal(onRamp, true); assert.equal(beyondRamp, true)
})

for (const horizontal of [false, true]) test(`reverse footing rides the underside of a ${horizontal ? 'horizontal platform' : 'vertical elevator'}`, () => {
  const level = fixture({ x: 0, w: 1800 }); level.spawn.x = 460
  level.mechanisms = [{ id: 'ferry', kind: 'lift', x: 400, y: 400, w: 240, h: 20, travel: 160, power: 'always',
    ...(horizontal ? { orientation: 'horizontal' } : {}) }]
  const run = createRun(level); run.started = true; step(run, 200)
  const offset = run.player.x - run.mechanisms[0].x
  for (let i = 0; i < 500; i++) {
    step(run)
    assert.equal(run.player.contacts.support?.collider.id, 'mechanism:0')
    assert.equal(run.player.inverted, true); assert.equal(run.player.grounded, true)
    close(run.player.y, run.mechanisms[0].y + 20, .01)
    close(run.player.x - run.mechanisms[0].x, offset, .01)
  }
})

test('boxes and balls rise using the existing prop solver, stop at ceilings, and sleep there', () => {
  const level = fixture()
  level.props = [{ kind: 'box', x: 320, y: 920, size: 60 }, { kind: 'ball', x: 500, y: 920, size: 60 }]
  const run = createRun(level); run.started = true
  // Capture the existing Matter world to verify sleeping, without exposing a
  // test-only gameplay API or replacing any motion/collision behavior.
  const original = Matter.Engine.update
  let engine
  Matter.Engine.update = (world, dt) => { engine = world; return original(world, dt) }
  try {
    step(run, 60)
    for (const b of run.props) { assert.ok(b.y < 750); assert.ok(b.vy < -700) }
    step(run, 600)
    for (const b of run.props) { assert.ok(b.y >= b.size - .15 && b.y < b.size + .15); assert.ok(Math.abs(b.vy) < .01) }
    const bodies = Matter.Composite.allBodies(engine.world).filter(body => !body.isStatic)
    assert.equal(bodies.length, 2)
    assert.ok(bodies.every(body => body.isSleeping), 'constant field corrections must not defeat Matter sleeping')
    run.empRemaining = 5; step(run, 60)
    for (const b of run.props) assert.ok(b.y > 200, 'EMP wakes objects resting against the ceiling')
  } finally { Matter.Engine.update = original }
})

test('a sleeping floor prop wakes when a remote switch powers reverse gravity', () => {
  const level = fixture(); level.triggers[0].startsOn = false; level.triggers[0].x = 800
  level.props = [{ kind: 'box', x: 320, y: 920, size: 60 }]
  const run = createRun(level); run.started = true
  step(run, 240); close(run.props[0].y, 920, .01)
  run.player.x = 840; step(run, 24)
  assert.equal(run.switchStates.get('gravity'), true)
  step(run, 60); assert.ok(run.props[0].y < 730)
})

test('zero gravity preserves free-object momentum and adds no torque', () => {
  const level = fixture({ gravity: 0 })
  level.props = [{ kind: 'box', x: 320, y: 500, size: 60 }, { kind: 'ball', x: 500, y: 500, size: 60 }]
  const run = createRun(level); run.started = true
  for (const b of run.props) { b.vx = 10; b.vy = -30 }
  step(run, 60)
  for (const b of run.props) { close(b.vx, 10, 1e-6); close(b.vy, -30, 1e-6); close(b.y, 485, 1e-6); close(b.angularVelocity, 0); close(b.angle, b.kind === 'ball' ? 5 / 30 : 0) }
})

test('EMP suppresses a latched field, preserves switch/relay state, and restores gravity after expiry', () => {
  const level = fixture({ relay: true, targets: ['exit'] }); level.goal = { ...level.goal, id: 'exit', power: 'switched' }
  const run = createRun(level); run.started = true
  assert.equal(run.switchStates.get('gravity'), true); assert.equal(run.goalLit, true)
  run.empRemaining = .5; step(run)
  assert.equal(run.player.gravity, TUNING.gravity); assert.equal(run.gravityField.strips.length, 0)
  assert.equal(run.triggers[0].active, true); assert.equal(run.goalLit, true)
  step(run, 61)
  assert.equal(run.empRemaining, 0); assert.equal(run.player.gravity, -TUNING.gravity)
})

for (const logic of ['or', 'and', 'xor']) test(`gravity plates use ordinary ${logic.toUpperCase()} inputs, reversal, relays and preview states`, () => {
  const level = fixture({ switchLogic: logic }); level.triggers.push({ ...level.triggers[0], startsOn: false })
  for (const a of [false, true]) for (const b of [false, true]) for (const reversed of [false, true]) {
    level.triggers[0].startsOn = a; level.triggers[1].startsOn = b; level.gravityPlates[0].switchReversed = reversed
    const expected = (logic === 'and' ? a && b : logic === 'xor' ? a !== b : a || b) !== reversed
    for (const create of [createRun, createPreviewRun]) {
      const run = create(level)
      assert.equal(run.switchStates.get('gravity'), expected)
      close(gravityAtPoint(run.gravityField, 300, 500), expected ? -TUNING.gravity : TUNING.gravity)
    }
  }
})

test('rope particles feel the field and wake when switched, while their anchor stays fixed', () => {
  const definition = { x: 300, y: 200, length: 120, segments: 8 }
  const rope = createRope(definition), field = createGravityField(), plates = [plate()]
  updateGravityField(field, plates, new Map(), true)
  for (let i = 0; i < 120; i++) stepRope(rope, STEP, [], null, field)
  const bottom = rope.nodes.at(-1).y
  updateGravityField(field, plates, new Map([['gravity', true]]), true)
  for (let i = 0; i < 60; i++) stepRope(rope, STEP, [], null, field)
  assert.ok(rope.nodes.at(-1).y < bottom - 50)
  close(rope.nodes[0].x, 300); close(rope.nodes[0].y, 200)
  updateGravityField(field, plates, new Map(), true)
  for (let i = 0; i < 240; i++) stepRope(rope, STEP, [], null, field)
  assert.ok(rope.nodes.at(-1).y > 300)
})

test('gravity rectangles round-trip in both level versions, with bounded, finite geometry and strength', () => {
  for (const version of [1, 2]) {
    const level = fixture({ name: 'Freight field', switchLogic: 'and', switchReversed: true })
    level.version = version
    if (version === 2) level.lighting = { ambient: 1, lights: [] }
    assert.deepEqual(parseLevel(JSON.parse(JSON.stringify(level))).gravityPlates, level.gravityPlates)
  }
  for (const patch of [{ gravity: -3.1 }, { gravity: 3.1 }, { gravity: Infinity }, { gravity: 'up' }, { w: 39 }, { h: 39 }, { x: -1 }, { y: -1 }, { w: 1801 }, { h: 921 }, { id: '' }, { switchLogic: 'nand' }]) {
    assert.throws(() => parseLevel(fixture(patch)), /valid jumping level/)
  }
  const duplicate = fixture(); duplicate.gravityPlates.push(plate())
  assert.throws(() => parseLevel(duplicate), /valid jumping level/)
  const many = fixture(); many.gravityPlates = Array.from({ length: 17 }, (_, i) => plate({ id: `g${i}` }))
  assert.throws(() => parseLevel(many), /valid jumping level/)
})

test('editor authors a rectangle with a bottom plate, resizes, moves, duplicates, templates and cleans wiring on delete', () => {
  const source = blankTrial(), added = addItem(source, 'gravity-plate', { x: 400, y: 920 }, { x: 400, y: 920 })
  const s = added.selection, p = added.level.gravityPlates[0]
  assert.deepEqual(itemBounds(added.level, s), p)
  assert.deepEqual([p.x, p.y, p.w, p.h, p.gravity], [320, 0, 160, 920, -1])
  assert.deepEqual(hitItem(added.level, 400, 915, 5), s)
  assert.equal(hitItem(added.level, 400, 700, 5), null, 'field interior does not swallow canvas selection')
  const resized = resizeItem(added.level, s, 200, 400, 'top-left')
  assert.deepEqual([resized.gravityPlates[0].x, resized.gravityPlates[0].y], [280, 520])
  const moved = moveItem(resized, s, -500, -600)
  assert.deepEqual([moved.gravityPlates[0].x, moved.gravityPlates[0].y], [0, 0])
  const taller = resizeLevelHeight(resized, 1200)
  assert.equal(taller.gravityPlates[0].y, 800)
  let level = fixture({ relay: true, targets: ['exit'] }); level.goal = { ...level.goal, id: 'exit', power: 'switched' }
  const copy = duplicateItem(level, { kind: 'gravity-plate', index: 0 })
  assert.equal(copy.level.gravityPlates.length, 2)
  assert.notEqual(copy.level.gravityPlates[0].id, copy.level.gravityPlates[1].id)
  const template = copyForEditing(level), id = template.gravityPlates[0].id
  assert.notEqual(id, 'gravity'); assert.deepEqual(template.triggers[0].targets, [id])
  assert.deepEqual(template.gravityPlates[0].targets, [template.goal.id])
  assert.equal(switchedItems(level).filter(i => i.kind === 'gravity-plate').length, 1)
  const deleted = deleteItem(level, { kind: 'gravity-plate', index: 0 })
  assert.equal(deleted.gravityPlates.length, 0); assert.deepEqual(deleted.triggers[0].targets, [])
  assert.deepEqual(levelProblems(resized), [])
  level = setObjectRelay(level, { kind: 'gravity-plate', index: 0 }, false)
  assert.equal(level.gravityPlates[0].targets, undefined)
  level = setObjectRelay(level, { kind: 'goal', index: 0 }, true)
  level = setObjectRelay(level, { kind: 'gravity-plate', index: 0 }, true)
  level = setSwitchTargets(level, { kind: 'gravity-plate', index: 0 }, ['exit'])
  level = setSwitchTargets(level, { kind: 'goal', index: 0 }, ['gravity'])
  assert.match(switchWiringProblems(level)[0], /Relay wiring loop/)
  assert.equal(resolveSwitchStates(level, [{ active: true }]).get('gravity'), undefined)
})

test('an inactive field leaves ordinary player movement unchanged', () => {
  const level = fixture(); level.triggers[0].startsOn = false; level.triggers[0].x = 800
  const run = createRun(level); run.started = true
  const p = createPlayer(level.spawn), terrain = levelTerrain(level)
  for (let i = 0; i < 100; i++) {
    const input = { ...NEUTRAL_INPUT, move: 1, jump: i === 20 }
    stepRun(run, input); stepPlayer(p, input, STEP, terrain)
    close(run.player.x, p.x); close(run.player.y, p.y); close(run.player.vx, p.vx); close(run.player.vy, p.vy)
  }
})


test('Always on powers gravity without inputs, EMP still suppresses it, and switching power cleans relay wiring', () => {
  const level = fixture({ power: 'always' }); level.triggers = []
  for (const create of [createRun, createPreviewRun]) {
    const run = create(level)
    close(gravityAtPoint(run.gravityField, 300, 500), -TUNING.gravity)
    assert.equal(switchedItems(level).some(i => i.kind === 'gravity-plate'), false)
  }
  const run = createRun(level); run.started = true
  step(run, 60); assert.ok(run.player.y < 750)
  run.empRemaining = .2; step(run)
  assert.equal(run.player.gravity, TUNING.gravity)
  step(run, 25); assert.equal(run.player.gravity, -TUNING.gravity)
  const wired = fixture({ relay: true, targets: ['exit'] }); wired.goal = { ...wired.goal, id: 'exit', power: 'switched' }
  const always = setObjectPower(wired, { kind: 'gravity-plate', index: 0 }, 'always')
  assert.equal(always.gravityPlates[0].power, 'always')
  assert.equal(always.gravityPlates[0].relay, undefined); assert.equal(always.gravityPlates[0].targets, undefined)
  assert.deepEqual(always.triggers[0].targets, [])
  assert.deepEqual(parseLevel(always).gravityPlates, always.gravityPlates)
  const switched = setObjectPower(always, { kind: 'gravity-plate', index: 0 }, 'switched')
  assert.equal(createRun(switched).gravityField.strips.length, 0)
  assert.throws(() => parseLevel(fixture({ power: 'sometimes' })), /valid jumping level/)
})
