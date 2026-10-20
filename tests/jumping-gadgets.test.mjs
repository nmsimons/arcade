import test from 'node:test'
import assert from 'node:assert/strict'
import { blankTrial, parseLevel } from '../src/games/jumping/level.ts'
import { NEUTRAL_INPUT, STEP } from '../src/games/jumping/model.ts'
import { createRun, stepRun } from './helpers/jumping-active-run.mjs'
import { addItem, duplicateItem, deleteItem } from '../src/games/jumping/editor.ts'
import { heldToolFrame, toolShape, pulseHit, cancelGadgetInput, finishGadgetMotion } from '../src/games/jumping/gadgets.ts'
import { polygonIntersects, polygonPoints } from '../src/games/jumping/geometry.ts'
import { athletePose, presentedAthletePose, drawAthlete } from '../src/games/jumping/athlete.ts'
import { createJumpController } from '../src/games/jumping/input.ts'
import { boxShape, propHeight } from '../src/games/jumping/propGeometry.ts'
import { propGravity, propWaterStrength, createGravityField, updateGravityField } from '../src/games/jumping/gravity.ts'
import { drawGadgets } from '../src/games/jumping/gadgetRender.ts'

const gadget = (kind = 'repulsor', x = 190) => ({ kind: 'box', gadget: kind, x, y: 920, size: 40 })
function scene(props = [gadget()]) { const level = blankTrial(); level.props = props; return level }
const tick = (run, frames = 1, input = {}) => { for (let i = 0; i < frames; i++) stepRun(run, { ...NEUTRAL_INPUT, ...input }) }
const pickup = run => { tick(run, 1, { interact: true }); tick(run) }

test('tools round trip through authoring without changing automatic EMP pickups', () => {
  let level = scene(); level.pickups = [{ kind: 'emp', x: 800, y: 880 }]
  assert.deepEqual(parseLevel(JSON.parse(JSON.stringify(level))), level)
  const created = addItem(level, 'carried-emp', { x: 300, y: 920 }, { x: 300, y: 920 })
  assert.equal(created.level.props[1].gadget, 'emp')
  const copied = duplicateItem(created.level, created.selection)
  assert.equal(copied.level.props[2].gadget, 'emp')
  level = deleteItem(copied.level, copied.selection)
  assert.equal(parseLevel(JSON.parse(JSON.stringify(level))).props.length, 2)
  for (const patch of [{ gadget: 'laser' }, { kind: 'ball', gadget: 'emp' }])
    assert.throws(() => parseLevel({ ...scene(), props: [{ ...gadget(), ...patch }] }))
})

test('pickup is deliberate, a held input cannot use newly collected equipment, drop is one action', () => {
  const run = createRun(scene())
  tick(run, 25)
  assert.equal(run.gadgets.held, null)
  tick(run, 1, { interact: true, use: true })
  assert.equal(run.gadgets.held.gadget, 'repulsor')
  assert.equal(run.props.length, 0)
  tick(run, 80, { interact: true, use: true })
  assert.equal(run.gadgets.shots, 0)
  tick(run); tick(run, 1, { use: true })
  assert.equal(run.gadgets.shots, 1)
  tick(run); tick(run, 1, { interact: true })
  assert.equal(run.gadgets.held, null)
  assert.equal(run.props.length, 1)
  assert.ok(run.props[0].gadgetCooldown > 0, 'drop preserves cooldown on the physical item')
  tick(run, 40, { interact: true })
  assert.equal(run.gadgets.held, null, 'holding drop cannot immediately pick it back up')
})

test('directions aim and move together, with horizontal hip fire when released', () => {
  const run = createRun(scene())
  pickup(run)
  tick(run, 1, { use: true, move: 1 })
  assert.equal(run.gadgets.shots, 1)
  assert.equal(run.gadgets.aiming, true)
  tick(run, 60)
  const x = run.player.x
  tick(run, 60, { move: 1, climb: true })
  assert.equal(run.gadgets.aiming, true)
  assert.equal(run.gadgets.angle, -Math.PI / 4)
  assert.ok(run.player.x > x + 100, 'diagonal aim retains horizontal movement')
  tick(run, 1, { use: true })
  assert.equal(run.gadgets.shots, 2)
  assert.equal(run.gadgets.aiming, false)
  assert.equal(run.gadgets.angle, 0)
  const before = run.player.x
  tick(run, 20, { move: 1 })
  assert.ok(run.player.x > before + 30, 'no mode-exit release requirement delays movement')
})

for (const mode of ['objects', 'player']) test(`rifle pulse ${mode === 'objects' ? 'stops at red' : 'passes through blue'} fields`, () => {
  const level = scene([gadget(), { kind: 'ball', x: 500, y: 920, size: 68 }])
  level.forceFields = [{ id: 'beam', mode, x: 350, y: 500, w: 12, h: 420, orientation: 'vertical' }]
  const run = createRun(level)
  pickup(run); tick(run, 1, { use: true })
  const ball = run.props.find(p => p.kind === 'ball')
  assert.equal(run.gadgets.shots, 1)
  if (mode === 'objects') assert.ok(Math.abs(ball.vx) < .01)
  else assert.ok(ball.vx > 50)
})

test('red contact detaches the sleeve on the arrival side while the player continues', () => {
  const level = scene()
  level.forceFields = [{ id: 'red', mode: 'objects', x: 350, y: 500, w: 12, h: 420, orientation: 'vertical' }]
  const run = createRun(level), empty = createRun({ ...level, props: [] })
  pickup(run); tick(empty, 2)
  const prop = run.gadgets.held
  tick(run, 120, { move: 1 }); tick(empty, 120, { move: 1 })
  assert.equal(run.gadgets.held, null)
  assert.equal(run.player.heldTool, undefined)
  assert.equal(run.props[0], prop, 'the same physical tool drops off')
  assert.ok(run.player.x > 380)
  assert.ok(Math.abs(run.player.x - empty.player.x) < .1, 'the field does not arrest player travel')
  assert.ok(run.props[0].x < 350)
  assert.ok(!polygonIntersects(polygonPoints(boxShape(run.props[0])), run.forceFields[0].platform, .01))
})

test('rifle obeys mass, occlusion, cooldown, no automatic repeat, and EMP power', () => {
  const shots = size => {
    const run = createRun(scene([gadget(), { kind: 'ball', x: 450, y: 920, size }]))
    pickup(run); tick(run, 1, { use: true }); return run
  }
  const small = shots(68), large = shots(160)
  assert.ok(small.props[0].vx > large.props[0].vx)
  tick(small, 90, { use: true }); assert.equal(small.gadgets.shots, 1)
  tick(small); small.empRemaining = 2
  tick(small, 1, { use: true }); assert.equal(small.gadgets.shots, 1)
  small.empRemaining = 0; tick(small); tick(small, 1, { use: true }); assert.equal(small.gadgets.shots, 2)
  const level = scene([gadget(), { kind: 'ball', x: 500, y: 920, size: 68 }])
  level.platforms = [{ x: 350, y: 600, w: 20, h: 320 }]
  const blocked = createRun(level); pickup(blocked); tick(blocked, 1, { use: true })
  assert.ok(Math.abs(blocked.props[0].vx) < .01)
})

test('pause/cancellation clears aiming and cannot replay a held Use', () => {
  const run = createRun(scene()); pickup(run)
  tick(run, 1, { climb: true })
  cancelGadgetInput(run)
  assert.equal(run.gadgets.aiming, false)
  tick(run, 70, { use: true })
  assert.equal(run.gadgets.aiming, false)
  assert.equal(run.gadgets.shots, 0)
  tick(run); tick(run, 1, { use: true })
  assert.equal(run.gadgets.shots, 1)
})

test('pulse first-hit ordering follows actual polygon boundaries', () => {
  const wall = { x: 300, y: 0, w: 20, h: 300 }, near = { x: 150, y: 90, w: 30, h: 20 }
  assert.equal(pulseHit([100, 100], [1, 0], [wall, near]).index, 1)
  assert.equal(pulseHit([100, 100], [1, 0], [wall]).distance, 200)
})

test('repulsor has a strong impulse at long range and still has a finite reach', () => {
  for (const [x, hits] of [[1300, true], [2000, false]]) {
    const run = createRun(scene([gadget(), { kind: 'ball', x, y: 920, size: 68 }]))
    pickup(run); tick(run, 1, { use: true })
    assert.equal(run.gadgets.shots, 1)
    assert.ok(hits ? run.props[0].vx > 700 : Math.abs(run.props[0].vx) < .01)
  }
})

test('stick aiming snaps to eight sectors, turns toward the shot, and needs no trigger', () => {
  const controller = createJumpController()
  const pad = { index: 0, id: 'aim test', mapping: 'standard', connected: true,
    axes: [0, 0], buttons: Array.from({ length: 16 }, () => ({ pressed: false, value: 0 })) }
  controller.sample([pad], 'playing', 0)
  const run = createRun(scene()); pickup(run)
  let facing = run.player.facing
  for (const [degrees, snapped] of [[5, 0], [17, 0], [33, 45], [79, 90], [113, 135], [172, 180], [201, 180], [224, 225], [263, 270], [311, 315], [354, 360]]) {
    const angle = degrees * Math.PI / 180
    pad.axes = [Math.cos(angle) * .8, Math.sin(angle) * .8]
    const sample = controller.sample([pad], 'playing', degrees)
    tick(run, 1, { aimX: sample.aimX, aimY: sample.aimY })
    const frame = heldToolFrame(run.player)
    const expected = snapped * Math.PI / 180
    assert.ok(Math.abs(Math.atan2(Math.sin(frame.angle - expected), Math.cos(frame.angle - expected))) < 1e-8, `angle ${degrees} snaps to ${snapped}`)
    if (Math.abs(Math.cos(expected)) > .01) facing = Math.cos(expected) < 0 ? -1 : 1
    assert.equal(run.player.facing, facing, 'vertical aim retains facing; sideways aim turns the player')
  }
  pad.axes = [.08, -.09]
  const neutral = controller.sample([pad], 'playing', 400)
  assert.equal(neutral.aimX, 0); assert.equal(neutral.aimY, 0)
  tick(run, 1, neutral)
  assert.equal(run.gadgets.aiming, false)
  assert.equal(run.gadgets.angle, 0, 'resting the stick returns to horizontal hip fire')
})

test('sleeve stays on the forearm with exact bone lengths, including crouch, travel and reversed gravity', () => {
  const run = createRun(scene()); pickup(run)
  for (const inverted of [false, true]) for (const crouch of [0, 1]) for (const facing of [-1, 1]) {
    const p = { ...run.player, x: 417, y: 600, inverted, crouch, crouching: !!crouch, facing,
      heldTool: { ...run.player.heldTool, aiming: true, angle: 1.234 } }
    const pose = athletePose(p), arm = facing < 0 ? pose.backArm : pose.frontArm, frame = heldToolFrame(p), flip = inverted ? -1 : 1
    assert.ok(Math.abs(Math.hypot(arm.joint[0] - arm.root[0], arm.joint[1] - arm.root[1]) - 10) < 1e-8)
    assert.ok(Math.abs(Math.hypot(arm.end[0] - arm.joint[0], arm.end[1] - arm.joint[1]) - 9) < 1e-8)
    assert.ok(Math.abs(frame.x - p.x - (arm.joint[0] + arm.end[0]) * .5 * facing) < 1e-8)
    assert.ok(Math.abs(frame.y - p.y - (arm.joint[1] + arm.end[1]) * .5 * flip) < 1e-8)
    assert.ok(Math.abs(frame.angle - 1.234) < 1e-8)
    const loose = { ...gadget(), x: frame.x, y: frame.y + propHeight(gadget()) / 2, angle: frame.angle }
    assert.deepEqual(boxShape(loose), toolShape(frame), 'pickup/drop preserve the sleeve hull dimensions')
  }
})

test('the displayed arm and sleeve ease toward eight-direction aim while shots remain immediate', () => {
  const run = createRun(scene()); pickup(run)
  const visibleAngle = () => {
    const p = run.player, pose = presentedAthletePose(p), arm = p.facing < 0 ? pose.backArm : pose.frontArm
    assert.ok(Math.abs(Math.hypot(arm.joint[0] - arm.root[0], arm.joint[1] - arm.root[1]) - 10) < 1e-8)
    assert.ok(Math.abs(Math.hypot(arm.end[0] - arm.joint[0], arm.end[1] - arm.joint[1]) - 9) < 1e-8)
    return Math.atan2(arm.end[1] - arm.joint[1], (arm.end[0] - arm.joint[0]) * p.facing)
  }
  assert.ok(Math.abs(visibleAngle()) < 1e-8)
  tick(run, 1, { climb: true })
  let previous = visibleAngle()
  assert.ok(previous < 0 && previous > -Math.PI / 2, 'first visual step does not jump to the new sector')
  assert.equal(run.gadgets.angle, -Math.PI / 2, 'authoritative aim selects the sector immediately')
  for (let frame = 0; frame < 35; frame++) {
    tick(run, 1, { climb: true })
    const angle = visibleAngle()
    assert.ok(angle <= previous + 1e-8 && angle >= -Math.PI / 2 - 1e-8)
    previous = angle
  }
  assert.ok(Math.abs(previous + Math.PI / 2) < .001)
  tick(run, 1, { move: -1, climb: true, use: true })
  assert.equal(run.gadgets.shots, 1)
  assert.ok(Math.abs(visibleAngle() + Math.PI * 3 / 4) < 1e-8, 'the emitter aligns with a fresh shot immediately')
  const pulse = run.gadgets.pulses[0]
  assert.ok(Math.abs(Math.atan2(pulse.to[1] - pulse.from[1], pulse.to[0] - pulse.from[0]) + Math.PI * 3 / 4) < 1e-8)
})

test('a loose sleeve rests and floats using its actual compact hull', () => {
  const run = createRun(scene()); tick(run, 90)
  const prop = run.props[0], shape = boxShape(prop)
  assert.ok(Math.abs(shape.y + shape.h - 920) < .1)
  assert.equal(shape.w, 16); assert.equal(shape.h, 8)
  const field = createGravityField()
  updateGravityField(field, [{ id: 'water', x: 0, y: 500, w: 1000, h: 500, effect: 'water', gravity: 1 }], new Map(), true)
  assert.ok(Math.abs(propWaterStrength(field, prop) - 1) < 1e-8)
  assert.ok(propGravity(field, prop) < 0)
})

test('walking and crouching through loose tools does not trip, push, or load them', () => {
  for (const crouch of [false, true]) {
    const run = createRun(scene([gadget('repulsor', 280), gadget('emp', 320)]))
    const empty = createRun(scene([]))
    tick(run, 200, { move: 1, crouch }); tick(empty, 200, { move: 1, crouch })
    assert.ok(Math.abs(run.player.x - empty.player.x) < 1e-6)
    assert.ok(Math.abs(run.player.y - empty.player.y) < 1e-6)
    assert.equal(run.player.contacts.push, null)
    assert.ok(Math.abs(run.props[0].x - 280) < 1e-6)
    assert.ok(Math.abs(run.props[1].x - 320) < 1e-6)
    assert.ok(Math.abs(run.props[0].vx) < 1e-6)
  }
})

test('normal loose tools rise to float at the waterline, heavy tools sink, and gravity lifts raise both', () => {
  const level = scene([gadget('repulsor', 500), { ...gadget('emp', 700), weight: 'heavy' }])
  level.gravityPlates = [{ id: 'pool', x: 350, y: 700, w: 700, h: 220, effect: 'water', gravity: -1 }]
  const run = createRun(level); tick(run, 1200)
  assert.ok(Math.abs(run.props[0].y - 704) < 4, `normal sleeve floats near half immersion, y=${run.props[0].y}`)
  assert.ok(run.props[1].y > 900, 'heavy sleeve remains on the pool floor')
  const lifted = scene([gadget('repulsor', 500)])
  lifted.gravityPlates = [{ id: 'lift', x: 350, y: 100, w: 700, h: 820, gravity: -1, power: 'always' }]
  const raised = createRun(lifted); tick(raised, 90)
  assert.ok(raised.props[0].y < 700)
})

test('the right sleeve renders behind a left-facing torso and ahead of a right-facing torso', () => {
  const OriginalPath = globalThis.Path2D
  globalThis.Path2D = class { constructor() { return new Proxy(this, { get: () => () => {} }) } }
  try {
    const run = createRun(scene()); pickup(run)
    for (const facing of [-1, 1]) for (const backView of [0, 1]) {
      const operations = []
      const ctx = new Proxy({ fillStyle: '', fill() { operations.push(this.fillStyle) },
        roundRect(x, y, w, h) { if (x === -8 && y === -4 && w === 16 && h === 8) operations.push('sleeve') } },
      { get: (object, key) => key in object ? object[key] : () => {} })
      const p = { ...run.player, facing }, pose = presentedAthletePose(p)
      drawAthlete(ctx, p, undefined, { ...pose, backView })
      const sleeve = operations.indexOf('sleeve'), face = operations.indexOf('#b8c0b5')
      assert.ok(sleeve >= 0 && face >= 0)
      assert.equal(sleeve < face, facing < 0 || !!backView, 'climbing/back-view equipment draws with its arm behind the torso')
      assert.equal(operations.filter(operation => operation === 'sleeve').length, 1)
    }
  } finally { globalThis.Path2D = OriginalPath }
})

test('a sleeve foreshortens with a forearm turning through depth', () => {
  const OriginalPath = globalThis.Path2D
  globalThis.Path2D = class { constructor() { return new Proxy(this, { get: () => () => {} }) } }
  try {
    const run = createRun(scene()); pickup(run)
    const pose = presentedAthletePose(run.player), arm = pose.frontArm, scales = []
    const ctx = new Proxy({ scale(x, y) { scales.push([x, y]) } }, { get: (object, key) => key in object ? object[key] : () => {} })
    drawAthlete(ctx, run.player, undefined, { ...pose, frontArm: { ...arm, end: [arm.joint[0] + 4.5, arm.joint[1]], endDepth: Math.sqrt(81 - 4.5 ** 2) } })
    assert.ok(scales.some(([x, y]) => Math.abs(x - .5) < 1e-8 && y === 1))
  } finally { globalThis.Path2D = OriginalPath }
})

test('red detachment preserves cooldown and EMP charge without a manual drop', () => {
  for (const kind of ['repulsor', 'emp']) {
    const level = scene([gadget(kind)])
    level.forceFields = [{ id: 'red', mode: 'objects', x: 350, y: 500, w: 12, h: 420, orientation: 'vertical' }]
    const run = createRun(level); pickup(run)
    const prop = run.gadgets.held; prop.gadgetCooldown = 2
    for (let frame = 0; frame < 120 && run.gadgets.held; frame++) tick(run, 1, { move: 1 })
    assert.equal(run.gadgets.held, null)
    assert.equal(run.props[0], prop)
    assert.ok(prop.gadgetCooldown > 0)
    assert.equal(run.empRemaining, 0, 'stripping the EMP does not activate or consume it')
    assert.ok(!polygonIntersects(polygonPoints(boxShape(prop)), run.forceFields[0].platform, .01))
  }
})

test('fast transport through a red field strips the sleeve on either arrival side', () => {
  for (const direction of [-1, 1]) {
    const level = scene()
    level.forceFields = [{ id: 'red', mode: 'objects', x: 350, y: 500, w: 12, h: 420, orientation: 'vertical' }]
    const run = createRun(level); pickup(run)
    run.player.facing = direction
    run.player.x = direction > 0 ? 200 : 600
    const from = heldToolFrame(run.player), prop = run.gadgets.held
    run.player.x = direction > 0 ? 600 : 200
    const x = run.player.x
    finishGadgetMotion(run, from)
    assert.equal(run.player.x, x)
    assert.equal(run.gadgets.held, null)
    assert.equal(run.props[0], prop)
    const shape = boxShape(prop)
    assert.ok(direction > 0 ? shape.x + shape.w < 350 : shape.x > 362)
    assert.ok(!polygonIntersects(polygonPoints(shape), run.forceFields[0].platform, .01))
  }
})

test('the beam flashes briefly while its separate impact ring finishes fading', () => {
  const run = createRun(scene()); pickup(run); tick(run, 1, { use: true, move: 1 })
  const drawn = () => {
    const calls = []
    const ctx = new Proxy({ globalAlpha: 1, moveTo() { calls.push('beam') }, arc() { calls.push('impact') } },
      { get: (object, key) => key in object ? object[key] : () => {} })
    drawGadgets(ctx, run); return calls
  }
  assert.deepEqual(drawn(), ['beam', 'impact'])
  tick(run, 4, { move: 1 })
  assert.deepEqual(drawn(), ['impact'], 'the beam is gone after 33 ms of running')
  tick(run, 10, { move: 1 })
  assert.deepEqual(drawn(), [])
  assert.equal(run.gadgets.pulses.length, 0)
})
