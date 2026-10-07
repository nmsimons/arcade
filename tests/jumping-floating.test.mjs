import test from 'node:test'
import assert from 'node:assert/strict'
import Matter from 'matter-js'
import { blankTrial, parseLevel } from '../src/games/jumping/level.ts'
import { createRun, stepRun } from '../src/games/jumping/challenge.ts'
import { createPlayer, NEUTRAL_INPUT, STEP, stepPlayer, TUNING } from '../src/games/jumping/model.ts'
import { createGravityField, updateGravityField, playerGravity, propGravity, playerFloatDrag, propFloatDrag, playerSwimStrength, playerWaterCenterOffset, propWaterStrength } from '../src/games/jumping/gravity.ts'
import { addItem, duplicateItem, hitItem, resizeItem, setObjectPower } from '../src/games/jumping/editor.ts'
import { copySelections, pasteSelections } from '../src/games/jumping/editorSelection.ts'
import { objectLabel } from '../src/games/jumping/objectLabels.ts'
import { drawGravityDust, drawGravityPlate, drawGravityRegion, drawWaterRegion, WATER_COLOR } from '../src/games/jumping/gravityRender.ts'
import { athletePose } from '../src/games/jumping/athlete.ts'

const pool = overrides => ({ id: 'pool', x: 200, y: 400, w: 1000, h: 520, gravity: -1, power: 'always', ...overrides })
const fieldFor = plates => {
  const field = createGravityField()
  updateGravityField(field, plates, new Map(plates.map(p => [p.id, true])), true)
  return field
}
const step = (run, seconds, dt = STEP) => {
  for (let i = 0; i < Math.round(seconds / dt); i++) stepRun(run, NEUTRAL_INPUT, dt)
}
const fixture = (props = [], effect) => {
  const run = createRun({ ...blankTrial(), props, gravityPlates: [pool(effect ? { effect } : {})] })
  run.started = true
  return run
}

for (const effect of [undefined, 'water']) for (const kind of ['box', 'ball']) for (const dt of [STEP, 1 / 30]) {
  test(`${effect ?? 'grav plate'} settles a ${kind} approaching the surface from either direction at ${dt}`, () => {
    const run = fixture([{ kind, x: 500, y: 180, size: 80 }, { kind, x: 850, y: 800, size: 80 }], effect)
    step(run, 8, dt)
    for (const b of run.props) {
      assert.ok(Math.abs(b.y - 440) < (effect === 'water' ? 2.4 : .02), `partly submerged at rest: ${b.y}`)
      assert.ok(Math.abs(b.vy) < (effect === 'water' ? 4 : .05), `settled velocity: ${b.vy}`)
      assert.equal(b.grounded, false, 'floating does not manufacture a solid ground contact')
    }
  })
}

test('rotated floating boxes settle without artificial torque or a positional snap', () => {
  const run = fixture([{ kind: 'box', x: 500, y: 480, size: 80 }])
  run.props[0].angle = Math.PI / 4
  step(run, 8)
  assert.ok(Math.abs(run.props[0].y - 440) < .02)
  assert.ok(Math.abs(run.props[0].angle - Math.PI / 4) < 1e-8)
})

test('floating props can sleep, wake when disturbed, and fall when field power is lost', () => {
  const original = Matter.Engine.update
  let engine
  Matter.Engine.update = (world, dt) => { engine = world; return original(world, dt) }
  try {
    const run = fixture([{ kind: 'box', x: 500, y: 500, size: 80 }])
    step(run, 8)
    const body = Matter.Composite.allBodies(engine.world).find(b => !b.isStatic)
    assert.equal(body.isSleeping, true, 'buoyant equilibrium permits sleep')
    run.props[0].vy = 120
    step(run, .1)
    assert.equal(body.isSleeping, false)
    assert.ok(run.props[0].y > 440.5, 'an impulse displaces the float normally')
    step(run, 8)
    assert.equal(body.isSleeping, true)
    run.empRemaining = 1
    step(run, .3)
    assert.equal(body.isSleeping, false)
    assert.ok(run.props[0].y > 480, 'EMP removes buoyant support')
    step(run, 8)
    assert.ok(Math.abs(run.props[0].y - 440) < .02, 'power restoration brings it back to the surface')
  } finally { Matter.Engine.update = original }
})

test('surface damping preserves horizontal prop drift and exiting restores ordinary falling', () => {
  const run = fixture([{ kind: 'box', x: 500, y: 440, size: 80 }])
  run.props[0].vx = 40
  step(run, 2)
  assert.ok(Math.abs(run.props[0].x - 580) < .001)
  assert.ok(Math.abs(run.props[0].vx - 40) < .001)
  run.props[0].x = 1300
  step(run, .3)
  assert.ok(run.props[0].y > 480)
})

for (const inverted of [false, true]) for (const dt of [STEP, 1 / 30]) test(`player settles at a field surface, inverted=${inverted}, dt=${dt}`, () => {
  const field = fieldFor([pool()]), p = createPlayer({ x: 500, y: inverted ? 350 : 500 })
  p.grounded = false; p.coyote = 0; p.inverted = inverted
  for (let i = 0; i < Math.round(8 / dt); i++) stepPlayer(p, NEUTRAL_INPUT, dt, [], undefined, undefined, undefined, field)
  assert.ok(Math.abs(playerGravity(field, p)) < .01)
  assert.ok(Math.abs(p.vy) < .01)
  assert.equal(p.grounded, false)
  assert.equal(p.inverted, inverted, 'floating retains orientation without a ceiling/floor contact')
})

test('uniform and sideways fields add no floating drag; an unstable lower edge does not catch bodies', () => {
  const b = { kind: 'box', x: 500, y: 500, size: 80, angle: 0 }
  for (const gravity of [-1, -.001, 0, .001, 1]) {
    const field = fieldFor([pool({ y: 0, h: 920, gravity })])
    assert.equal(propFloatDrag(field, b), 0)
    assert.equal(playerFloatDrag(field, createPlayer({ x: 500, y: 500 })), 0)
  }
  assert.equal(propFloatDrag(fieldFor([pool({ x: 500, y: 0, h: 920 })]), b), 0)
  assert.equal(propFloatDrag(fieldFor([pool({ y: 200, h: 260 })]), b), 0)
})

test('water uses coordinated breaststroke pulls, frog kicks, glides and a head-first downward dive', () => {
  const field = fieldFor([pool({ x: 0, w: 5000, effect: 'water' })]), p = createPlayer({ x: 500, y: 650 })
  p.grounded = false; p.coyote = 0
  for (let i = 0; i < 120; i++) stepPlayer(p, { ...NEUTRAL_INPUT, move: 1 }, STEP, [], undefined, undefined, undefined, field)
  let submergedPull = false, forwardGlide = false, frogKick = false
  for (let i = 0; i < 120; i++) {
    p.waterMotion.phase = i / 120 * Math.PI * 2
    const pose = athletePose(p), arm = pose.frontArm
    submergedPull ||= arm.end[1] > arm.root[1] + 7
    forwardGlide ||= arm.end[0] > arm.root[0] + 17
    frogKick ||= pose.frontLeg.end[0] > pose.hip[0] - 16 && (pose.frontLeg.jointDepth ?? 0) > 8
    assert.ok(Math.abs((pose.frontArm.end[0] - pose.frontArm.root[0]) - (pose.backArm.end[0] - pose.backArm.root[0])) < .01, 'arms pull and recover together')
    for (const limb of [pose.frontArm, pose.backArm, pose.frontLeg, pose.backLeg]) {
      const leg = 'footAngle' in limb
      assert.ok(Math.abs(Math.hypot(limb.joint[0] - limb.root[0], limb.joint[1] - limb.root[1], limb.jointDepth ?? 0) - (leg ? 15 : 10)) < 1e-6)
      assert.ok(Math.abs(Math.hypot(limb.end[0] - limb.joint[0], limb.end[1] - limb.joint[1], (limb.endDepth ?? 0) - (limb.jointDepth ?? 0)) - (leg ? 14.5 : 9)) < 1e-6)
    }
  }
  assert.ok(submergedPull && forwardGlide && frogKick)
  for (let i = 0; i < 120; i++) stepPlayer(p, { ...NEUTRAL_INPUT, descend: true }, STEP, [], undefined, undefined, undefined, field)
  const dive = athletePose(p)
  assert.ok(dive.head[1] > dive.hip[1] + 20, 'diving leads with the head and trails the legs above it')
  assert.ok(p.vy > 0)
  for (let i = 0; i < 90; i++) stepPlayer(p, { ...NEUTRAL_INPUT, climb: true }, STEP, [], undefined, undefined, undefined, field)
  assert.equal(p.waterMotion.amount, 0, 'rising is upright floating without a stroke')
  assert.ok(athletePose(p).head[1] < athletePose(p).hip[1] - 20)
})

for (const dt of [STEP, 1 / 30]) for (const crouch of [false, true]) test(`diving plants stable feet on the pool floor, crouch=${crouch}, dt=${dt}`, () => {
  const run = fixture([], 'water'); run.player = createPlayer({ x: 500, y: 650 }); run.player.grounded = false; run.player.coyote = 0
  const hold = { ...NEUTRAL_INPUT, drop: true, crouch }
  let grounded = false, releasedContact = false, minHead = Infinity, maxHead = -Infinity, minRoot = Infinity, maxRoot = -Infinity
  for (let i = 0; i < Math.round(5 / dt); i++) {
    stepRun(run, hold, dt)
    const p = run.player, pose = athletePose(p)
    if (grounded && !p.grounded) releasedContact = true
    grounded ||= p.grounded
    if (i * dt > 4) {
      minHead = Math.min(minHead, p.y + pose.head[1]); maxHead = Math.max(maxHead, p.y + pose.head[1])
      minRoot = Math.min(minRoot, p.y); maxRoot = Math.max(maxRoot, p.y)
      assert.ok(pose.head[1] < pose.hip[1] - 7, 'underwater contact has an upright torso')
      assert.equal(pose.frontLeg.planted || pose.backLeg.planted, true, 'the floor owns foot placement')
      assert.equal(p.freeFall, null, 'contact does not replay prone landing recovery')
    }
  }
  assert.equal(grounded, true); assert.equal(releasedContact, false, 'buoyancy and the Down motor retain one continuous support')
  assert.ok(maxRoot - minRoot < 1e-7); assert.ok(maxHead - minHead < .1, 'holding-down strokes do not bob the torso')
  assert.equal(run.player.waterMotion.bottom, 1); assert.equal(run.player.crouching, crouch)
  const stride = run.player.stride, phase = run.player.waterMotion.phase, holdPhase = run.player.waterMotion.hold
  for (let i = 0; i < Math.round(.5 / dt); i++) stepRun(run, hold, dt)
  assert.equal(run.player.stride, stride, 'stationary feet do not step'); assert.equal(run.player.waterMotion.phase, phase, 'no traveling stroke at the floor')
  assert.notEqual(run.player.waterMotion.hold, holdPhase, 'hands work against actual downward load')
  const x = run.player.x
  const footAnchors = run.player.footwork.feet.map(f => f.anchorX)
  for (let i = 0; i < Math.round(1 / dt); i++) stepRun(run, { ...hold, move: -1 }, dt)
  assert.ok(run.player.x < x - 60); assert.equal(run.player.grounded, true); assert.ok(Math.abs(run.player.vx) <= TUNING.swimHorizontalSpeed + .01)
  assert.ok(run.player.stride !== stride || run.player.footwork.feet.some((f, i) => Math.abs(f.anchorX - footAnchors[i]) > 14), 'steps follow actual underwater floor travel')
  for (let i = 0; i < Math.round(.6 / dt); i++) stepRun(run, NEUTRAL_INPUT, dt)
  assert.equal(run.player.grounded, false); assert.ok(run.player.y < 895, 'release floats freely away from the bottom')
  assert.equal(run.player.waterMotion.bottom, 0)
})

test('a diagonal dive follows resolved travel and turns downward when a wall blocks sideways movement', () => {
  const field = fieldFor([pool({ x: 0, w: 5000, h: 3000, effect: 'water' })]), p = createPlayer({ x: 500, y: 650 })
  p.grounded = false; p.coyote = 0
  const input = { ...NEUTRAL_INPUT, move: 1, descend: true }
  for (let i = 0; i < 180; i++) stepPlayer(p, input, STEP, [], undefined, undefined, undefined, field)
  const pitch = p.waterMotion.dive * Math.PI / 2
  assert.ok(Math.abs(pitch - Math.atan2(p.vy, p.vx)) < .01, 'torso pitch follows the actual diagonal velocity')
  const wall = { x: p.x + 35, y: 400, w: 100, h: 2500 }
  for (let i = 0; i < 90; i++) stepPlayer(p, input, STEP, [wall], undefined, undefined, undefined, field)
  assert.equal(p.vx, 0); assert.ok(p.waterMotion.dive > .99, 'blocked sideways travel becomes a vertical dive')
  for (let i = 0; i < 120; i++) stepPlayer(p, { ...NEUTRAL_INPUT, move: -1, descend: true }, STEP, [wall], undefined, undefined, undefined, field)
  assert.equal(p.facing, -1); assert.ok(p.waterMotion.dive > .4 && p.waterMotion.dive < .6, 'the reversed diagonal keeps its side profile')
})

for (const dt of [STEP, 1 / 30]) test(`passive underwater rising stays slow and returns upright at ${dt}`, () => {
  const field = fieldFor([pool({ x: 0, w: 1800, h: 2000, effect: 'water' })]), p = createPlayer({ x: 500, y: 1500 })
  p.grounded = false; p.coyote = 0
  for (let i = 0; i < Math.round(4 / dt); i++) {
    stepPlayer(p, NEUTRAL_INPUT, dt, [], undefined, undefined, undefined, field)
    assert.ok(p.vy >= -TUNING.swimSpeed - 1, 'buoyancy returns the player without a rapid launch')
    assert.equal(p.waterMotion.amount, 0)
  }
  assert.ok(p.y < 1250, 'resistance still permits a steady return toward the surface')
})

for (const dt of [STEP, 1 / 30]) test(`water floats an idle player at neck depth and a horizontal swimmer at the surface at ${dt}`, () => {
  const field = fieldFor([pool({ x: 0, w: 5000, effect: 'water' })]), p = createPlayer({ x: 500, y: 700 })
  p.grounded = false; p.coyote = 0
  const advance = (seconds, input) => { for (let i = 0; i < Math.round(seconds / dt); i++) stepPlayer(p, input, dt, [], undefined, undefined, undefined, field) }
  const neck = () => p.y + athletePose(p).shoulder[1] - 2
  advance(6, NEUTRAL_INPUT)
  assert.equal(p.freeFall, null, 'idle floating stays upright')
  assert.ok(Math.abs(neck() - 400) < 3, `waterline at the neck: ${neck()}`)
  assert.ok(p.y + athletePose(p).head[1] < 400, 'head stays above water')
  const uprightY = p.y
  advance(3, { ...NEUTRAL_INPUT, move: 1 })
  assert.equal(p.freeFall?.amount, 1, 'horizontal swimming is prone')
  assert.ok(Math.abs(p.y + athletePose(p).shoulder[1] - 400) < 3, 'prone torso lies at the surface')
  assert.ok(Math.abs(p.y + athletePose(p).head[1] - 400) < 7, 'breathing lifts the head just above the surface')
  assert.ok(p.y < uprightY - 35, 'buoyancy raises the prone body')
  assert.ok(Math.abs(p.vy) < .05, 'posture and buoyancy settle together')
  advance(4, NEUTRAL_INPUT)
  assert.equal(p.freeFall, null, 'releasing horizontal swim returns upright')
  assert.ok(Math.abs(neck() - 400) < 3)
  assert.ok(Math.abs(p.y - uprightY) < 4.6, 'returning upright settles within the small resting bob')
})

test('changing water posture preserves the displaced center and keeps the head near the surface', () => {
  const field = fieldFor([pool({ x: 0, w: 5000, effect: 'water' })]), p = createPlayer({ x: 500, y: 450.34 })
  p.grounded = false; p.coyote = 0
  for (let i = 0; i < 600; i++) stepPlayer(p, NEUTRAL_INPUT, STEP, [], undefined, undefined, undefined, field)
  const center = p.y + playerWaterCenterOffset(p)
  stepPlayer(p, { ...NEUTRAL_INPUT, move: 1 }, STEP, [], undefined, undefined, undefined, field)
  assert.ok(Math.abs(p.y + playerWaterCenterOffset(p) - center - p.vy * STEP) < .001, 'posture alone does not teleport the displaced mass')
  for (let i = 0; i < 120; i++) {
    stepPlayer(p, { ...NEUTRAL_INPUT, move: 1 }, STEP, [], undefined, undefined, undefined, field)
    assert.ok(p.y + athletePose(p).head[1] < (p.waterMotion.gather > .1 ? 430 : 406), 'the deliberate tuck stays near the surface and extension restores the head')
    assert.ok(Math.abs(p.vx) <= TUNING.swimHorizontalSpeed + .01)
  }
})

test('swim starts and reversals gather the knees and arms, then extend with bounded movement', () => {
  const field = fieldFor([pool({ x: 0, w: 5000, effect: 'water' })]), p = createPlayer({ x: 500, y: 450.34 })
  p.grounded = false; p.coyote = 0
  let gathered = false
  for (let i = 0; i < 180; i++) {
    stepPlayer(p, { ...NEUTRAL_INPUT, move: 1 }, STEP, [], undefined, undefined, undefined, field)
    const pose = athletePose(p)
    gathered ||= p.waterMotion.gather > .9 && Math.hypot(pose.frontLeg.end[0] - pose.frontLeg.root[0], pose.frontLeg.end[1] - pose.frontLeg.root[1]) < 15
  }
  assert.equal(gathered, true, 'starting gathers the knees before extending')
  let tuckedTurn = false, oldHeading = false, newHeading = false
  for (let i = 0; i < 240; i++) {
    const x = p.x, center = p.y + playerWaterCenterOffset(p)
    stepPlayer(p, { ...NEUTRAL_INPUT, move: -1 }, STEP, [], undefined, undefined, undefined, field)
    oldHeading ||= p.vx > 20 && p.facing === 1
    newHeading ||= p.vx < -20 && p.facing === -1
    tuckedTurn ||= p.waterMotion.gather > .9
    assert.ok(Math.hypot(p.x - x, p.y + playerWaterCenterOffset(p) - center) < 2, 'gathering and extension cannot teleport the displaced body')
    assert.ok(Math.abs(p.vx) <= TUNING.swimHorizontalSpeed + .01)
  }
  assert.ok(tuckedTurn && oldHeading && newHeading)
  assert.equal(p.waterMotion.amount, 1); assert.ok(p.waterMotion.gather < .001)
})

test('a water stroke advances by actual travel and stops cycling against a solid wall', () => {
  const field = fieldFor([pool({ x: 0, w: 5000, effect: 'water' })]), p = createPlayer({ x: 500, y: 450.34 })
  p.grounded = false; p.coyote = 0
  for (let i = 0; i < 240; i++) stepPlayer(p, { ...NEUTRAL_INPUT, move: 1 }, STEP, [], undefined, undefined, undefined, field)
  const phase = p.waterMotion.phase, x = p.x, center = p.y + playerWaterCenterOffset(p)
  stepPlayer(p, { ...NEUTRAL_INPUT, move: 1 }, STEP, [], undefined, undefined, undefined, field)
  const distance = Math.hypot(p.x - x, p.y + playerWaterCenterOffset(p) - center)
  assert.ok(Math.abs((p.waterMotion.phase - phase + Math.PI * 2) % (Math.PI * 2) - distance * Math.PI * 2 / TUNING.swimStrokeDistance) < 1e-8)
  const wall = [{ x: p.x + 12, y: 0, w: 100, h: 920 }]
  for (let i = 0; i < 360; i++) stepPlayer(p, { ...NEUTRAL_INPUT, move: 1 }, STEP, wall, undefined, undefined, undefined, field)
  const blockedPhase = p.waterMotion.phase
  for (let i = 0; i < 60; i++) stepPlayer(p, { ...NEUTRAL_INPUT, move: 1 }, STEP, wall, undefined, undefined, undefined, field)
  assert.ok(Math.abs(p.waterMotion.phase - blockedPhase) < .001, 'blocked motion does not cycle the limbs on a timer')
})

test('water shares field composition and round-trips through editor operations and both file versions', () => {
  const source = blankTrial(), { level, selection } = addItem(source, 'water', { x: 400, y: 400 }, { x: 800, y: 920 })
  assert.equal(objectLabel(level, selection), 'Water 1')
  assert.equal(level.gravityPlates[0].effect, 'water')
  assert.equal(level.gravityPlates[0].power, 'always')
  for (const version of [1, 2]) assert.deepEqual(parseLevel({ ...level, version, ...(version === 2 ? { lighting: { nightMode: false, ambient: 0, lights: [] } } : {}) }).gravityPlates, level.gravityPlates)
  assert.throws(() => parseLevel({ ...level, gravityPlates: [{ ...level.gravityPlates[0], effect: 'lava' }] }))
  assert.deepEqual(hitItem(level, 600, 550, 5), selection)
  const resized = resizeItem(level, selection, 450, 570, 'top-left')
  assert.equal(resized.gravityPlates[0].effect, 'water')
  assert.equal(duplicateItem(resized, selection).level.gravityPlates[1].effect, 'water')
  assert.equal(pasteSelections(level, copySelections(level, [selection])).level.gravityPlates[1].effect, 'water')
  assert.equal(setObjectPower(level, selection, 'switched').gravityPlates[0].effect, 'water')
  const click = addItem(source, 'water', { x: 400, y: 400 }, { x: 400, y: 400 }).level.gravityPlates[0]
  assert.deepEqual([click.y, click.h], [400, 520], 'a click treats the pointer as the water surface')
  const plates = [pool({ effect: 'water' }), pool({ id: 'grav', gravity: 0 })]
  const b = { kind: 'ball', x: 500, y: 600, size: 80, angle: 0 }
  assert.equal(propGravity(fieldFor(plates), b), -.5 * TUNING.gravity)
})

test('active water draws only a blue rectangle; inactive water is hidden in play and outlined in the editor', () => {
  const draws = [], ctx = new Proxy({ globalAlpha: 1, canvas: { width: 1800, height: 920 }, getTransform: () => ({ a: 1, d: 1, e: 0, f: 0 }) }, {
    get(target, key) { return key in target ? target[key] : (...args) => draws.push({ kind: key, args, color: target.fillStyle }) },
  })
  const plate = pool({ effect: 'water' }), field = fieldFor([plate])
  drawWaterRegion(ctx, plate, true); drawGravityPlate(ctx, plate, true); drawGravityDust(ctx, [plate], field, 2)
  assert.deepEqual(draws.filter(d => d.kind === 'fillRect'), [{ kind: 'fillRect', args: [200, 400, 1000, 520], color: WATER_COLOR }])
  assert.equal(draws.some(d => d.kind === 'strokeRect'), false)
  draws.length = 0
  drawWaterRegion(ctx, plate, false)
  assert.equal(draws.length, 0)
  drawGravityRegion(ctx, plate, false, true)
  drawWaterRegion(ctx, plate, false, true)
  assert.ok(draws.some(d => d.kind === 'fillRect'))
  assert.ok(draws.some(d => d.kind === 'strokeRect'))
})

test('water buoyancy is fixed even if an older file contains a different gravity value', () => {
  const water = pool({ effect: 'water', gravity: 3 }), b = { kind: 'box', x: 500, y: 600, size: 80, angle: 0 }
  assert.equal(propGravity(fieldFor([water]), b), -TUNING.gravity)
  assert.equal(parseLevel({ ...blankTrial(), gravityPlates: [water] }).gravityPlates[0].gravity, -1)
  const { gravity: _gravity, ...withoutSetting } = water
  assert.equal(parseLevel({ ...blankTrial(), gravityPlates: [withoutSetting] }).gravityPlates[0].gravity, -1)
})

for (const inverted of [false, true]) {
  test(`Up/Down swim in screen directions in water, inverted=${inverted}`, () => {
    const field = fieldFor([pool({ y: 0, h: 920, effect: 'water' })])
    const positions = []
    for (const down of [false, true]) {
      const p = createPlayer({ x: 500, y: 450 }); p.grounded = false; p.coyote = 0; p.inverted = inverted
      const input = { ...NEUTRAL_INPUT, climb: !down, descend: down }
      for (let i = 0; i < 60; i++) stepPlayer(p, input, STEP, [], undefined, undefined, undefined, field)
      assert.ok(down ? p.y > 460 : p.y < 440, `screen ${down ? 'down' : 'up'}: ${p.y}`)
      positions.push(p.y)
    }
    assert.ok(positions[0] < positions[1])
  })
}

test('swimming coverage fades at field edges, overlapping regions average, and EMP removes the motor', () => {
  const p = createPlayer({ x: 500, y: 600 })
  assert.equal(playerSwimStrength(fieldFor([pool({ effect: 'water' })]), p), 1)
  assert.equal(playerSwimStrength(fieldFor([pool()]), p), 0)
  assert.equal(playerSwimStrength(fieldFor([pool({ effect: 'water' }), pool({ id: 'g' })]), p), .5)
  p.x = 200
  assert.ok(Math.abs(playerSwimStrength(fieldFor([pool({ effect: 'water' })]), p) - .5) < 1e-8)
  const field = fieldFor([pool({ effect: 'water' })])
  updateGravityField(field, [pool({ effect: 'water' })], new Map(), false)
  assert.equal(playerSwimStrength(field, p), 0)
})

test('Up and Down do not provide free-flight steering in gravity plates', () => {
  for (const gravity of [-1, 0, .1, 1]) {
    const field = fieldFor([pool({ y: 0, h: 920, gravity })]), players = []
    for (const input of [NEUTRAL_INPUT, { ...NEUTRAL_INPUT, climb: true }, { ...NEUTRAL_INPUT, descend: true }]) {
      const p = createPlayer({ x: 500, y: 500 }); p.grounded = false; p.coyote = 0
      for (let i = 0; i < 20; i++) stepPlayer(p, input, STEP, [], undefined, undefined, undefined, field)
      players.push(p)
    }
    assert.equal(players[0].y, players[1].y); assert.equal(players[0].y, players[2].y)
    assert.equal(players[1].swimAcceleration, 0); assert.equal(players[2].swimAcceleration, 0)
  }
})

for (const dt of [STEP, 1 / 30]) test(`a player can dive, return to the surface, swim clear, and jump out at ${dt}`, () => {
  const field = fieldFor([pool({ effect: 'water' })]), p = createPlayer({ x: 500, y: 430 })
  p.grounded = false; p.coyote = 0
  const advance = (seconds, input) => { for (let i = 0; i < Math.round(seconds / dt); i++) stepPlayer(p, input, dt, [], undefined, undefined, undefined, field) }
  advance(4, NEUTRAL_INPUT)
  const surface = p.y
  advance(.7, { ...NEUTRAL_INPUT, descend: true, crouch: true })
  assert.ok(p.y > surface + 40, `Down dives instead of trapping the player: ${p.y}`)
  let cleared = false
  for (let i = 0; i < Math.round(2 / dt); i++) {
    advance(dt, { ...NEUTRAL_INPUT, climb: true })
    cleared ||= p.y + athletePose(p).head[1] < 400
  }
  assert.equal(cleared, true, 'Up returns the head above the surface')
  advance(5, NEUTRAL_INPUT)
  assert.ok(Math.abs(p.vy) < 4, 'release resumes a slow surface bob')
  advance(dt, { ...NEUTRAL_INPUT, jump: true })
  assert.ok(p.vy < -300, 'a fresh jump launches from the water surface')
  advance(.2, NEUTRAL_INPUT)
  assert.ok(p.y < 400, 'a surface jump clears the water')
})

for (const effect of [undefined, 'water']) for (const kind of ['box', 'ball']) {
  test(`landing momentum, rider weight and unloading affect a floating ${kind} in ${effect ?? 'grav'}`, () => {
    const land = speed => {
      const run = fixture([{ kind, x: 500, y: 500, size: 80 }], effect)
      step(run, 8)
      run.player = createPlayer({ x: 500, y: 350 }); run.player.grounded = false; run.player.coyote = 0; run.player.vy = speed
      let impact = 0, dip = 0
      for (let i = 0; i < 60; i++) {
        stepRun(run, NEUTRAL_INPUT)
        impact = Math.max(impact, run.props[0].vy); dip = Math.max(dip, run.props[0].y - 440)
      }
      return { run, impact, dip }
    }
    const slow = land(200), fast = land(800)
    assert.ok(fast.impact > 20, 'landing wakes the float and transfers momentum')
    assert.ok(fast.impact > slow.impact * 1.5, `a harder landing reacts more: ${slow.impact}, ${fast.impact}`)
    assert.ok(fast.dip > 1)
    step(fast.run, 4)
    assert.ok(fast.run.props[0].y > 443, 'the rider displaces the float under sustained weight')
    assert.equal(fast.run.player.contacts.support?.collider.prop, fast.run.props[0])
    fast.run.player = createPlayer({ x: 100, y: 920 })
    step(fast.run, 8)
    assert.ok(Math.abs(fast.run.props[0].y - 440) < (effect === 'water' ? 2.4 : .02), 'unloading restores the unladen equilibrium with its small water bob')
  })
}

for (const left of [false, true]) for (const rim of [360, 400, 440]) test(`${rim < 380 ? 'Jump then Up' : 'Up'} pulls out over the ${left ? 'left' : 'right'} pool rim at ${rim}`, () => {
  const wall = left ? { x: 0, y: rim, w: 450, h: 920 - rim } : { x: 850, y: rim, w: 950, h: 920 - rim }
  const run = createRun({ ...blankTrial(), platforms: [wall], spawn: { x: left ? 520 : 780, y: 430 },
    gravityPlates: [pool({ x: 450, w: 400, effect: 'water' })] })
  run.started = true; run.player.grounded = false; run.player.coyote = 0
  step(run, 4)
  let caught = false, pulledUp = false, jumped = false
  for (let i = 0; i < 420; i++) {
    // A rim forty units above the waterline is beyond an upright arm's reach.
    // Reach it with the ordinary surface jump, rather than powered levitation.
    const jump = rim < 380 && !jumped && Math.abs(run.player.x - (left ? 450 : 850)) < 55
    stepRun(run, { ...NEUTRAL_INPUT, move: left ? -1 : 1, climb: true, jump })
    jumped ||= jump
    caught ||= !!run.player.hang || !!run.player.mantle
    pulledUp ||= run.player.grounded && Math.abs(run.player.y - rim) < .01 && (left ? run.player.x < 450 : run.player.x > 850)
  }
  if (rim <= 400) assert.equal(caught, true, 'a raised pool edge is reachable with normal controls')
  assert.equal(pulledUp, true, 'the ordinary pull-up lands outside the pool')
})

test('a blocked pool pull-up keeps the grip and allows dropping back into the water', () => {
  const run = createRun({ ...blankTrial(), spawn: { x: 780, y: 430 }, platforms: [
    { x: 850, y: 400, w: 950, h: 520 }, { x: 850, y: 280, w: 950, h: 90 },
  ], gravityPlates: [pool({ x: 450, w: 400, effect: 'water' })] })
  run.started = true; run.player.grounded = false; run.player.coyote = 0
  for (let i = 0; i < 300; i++) stepRun(run, { ...NEUTRAL_INPUT, move: 1, climb: true })
  assert.ok(run.player.hang || run.player.mantle, 'blocked landing preserves a recoverable grip')
  for (let i = 0; i < 90; i++) stepRun(run, { ...NEUTRAL_INPUT, move: -1, descend: true, drop: true })
  assert.equal(run.player.hang, null); assert.equal(run.player.mantle, null)
  assert.ok(run.player.x < 830 && run.player.y > 450, 'Down releases and swims back into open water')
})

for (const left of [false, true]) test(`a swimmer reaches the ${left ? 'left' : 'right'} pool lip before their head meets terrain`, () => {
  const wall = left ? { x: 0, y: 400, w: 450, h: 520 } : { x: 850, y: 400, w: 950, h: 520 }
  const run = createRun({ ...blankTrial(), platforms: [wall], spawn: { x: 650, y: 450.34 },
    gravityPlates: [pool({ x: 450, w: 400, effect: 'water' })] })
  run.started = true; run.player.grounded = false; run.player.coyote = 0
  let prepared = false, handsLead = false, caught = false
  const side = left ? -1 : 1, edge = left ? 450 : 850
  for (let i = 0; i < 360; i++) {
    stepRun(run, { ...NEUTRAL_INPUT, move: side })
    const p = run.player, pose = athletePose(p)
    if (p.hang) { caught = true; break }
    const gap = (edge - p.x) * side
    prepared ||= gap < 65 && !!p.waterMotion?.wall && p.waterMotion.amount < .7
    handsLead ||= gap < 35 && !!p.ledgeReach?.amount && pose.frontArm.end[0] > pose.head[0] + 3
    if (p.y + pose.head[1] + 6.2 > 400) assert.ok(pose.head[0] + 6.2 < gap + .01, 'the head stays outside the pool wall during the approach')
  }
  assert.ok(prepared && handsLead && caught, 'sideways swimming anticipates and catches a reachable lip without first colliding')
  for (let i = 0; i < 240; i++) stepRun(run, { ...NEUTRAL_INPUT, move: side, climb: true })
  assert.equal(run.player.grounded, true); assert.ok(Math.abs(run.player.y - 400) < .01)
})

test('an unreachable tall wall gets a leading palm brace while the swimmer stays clear', () => {
  const field = fieldFor([pool({ x: 0, w: 1800, effect: 'water' })]), p = createPlayer({ x: 650, y: 450.34 })
  p.grounded = false; p.coyote = 0
  const wall = [{ x: 850, y: 200, w: 950, h: 720 }]
  for (let i = 0; i < 360; i++) {
    stepPlayer(p, { ...NEUTRAL_INPUT, move: 1 }, STEP, wall, undefined, undefined, undefined, field)
    const pose = athletePose(p)
    assert.ok(p.x + pose.head[0] + 6.2 < 850 + .01)
  }
  assert.equal(p.hang, null); assert.equal(p.vx, 0); assert.equal(p.waterMotion.amount, 0)
  assert.ok(athletePose(p).frontArm.end[0] > athletePose(p).head[0] + 3)
})

test('an off-center landing rotates a floating box', () => {
  const run = fixture([{ kind: 'box', x: 500, y: 440, size: 80 }], 'water')
  step(run, 8)
  run.player = createPlayer({ x: 525, y: 350 }); run.player.grounded = false; run.player.coyote = 0; run.player.vy = 600
  let spin = 0
  for (let i = 0; i < 20; i++) { stepRun(run, NEUTRAL_INPUT); spin = Math.max(spin, Math.abs(run.props[0].angularVelocity)) }
  assert.ok(spin > .1, `off-center impact supplies real torque: ${spin}`)
})

test('floating upward into a box applies buoyant load through shared contacts', () => {
  const run = fixture([{ kind: 'box', x: 500, y: 440, size: 80 }], 'water')
  run.player.x = 850
  step(run, 8)
  const unladenY = run.props[0].y
  run.player = createPlayer({ x: 500, y: 650 }); run.player.grounded = false; run.player.coyote = 0
  let contact = false, lifted = false
  for (let i = 0; i < 420; i++) {
    stepRun(run, { ...NEUTRAL_INPUT, climb: true })
    contact ||= run.player.contacts.body.some(c => c.collider.prop === run.props[0])
    lifted ||= run.props[0].y < unladenY - 1
  }
  assert.equal(contact, true)
  assert.equal(lifted, true, 'buoyant ascent loads shared contacts instead of stopping at a fixed float')
  assert.equal(run.player.inverted, false, 'buoyancy against the underside does not reverse the swimmer')
})

for (const dt of [STEP, 1 / 30]) for (const kind of ['box', 'ball']) for (const direction of [-1, 1]) {
  test(`swimming pushes a floating ${kind} with fixed palms and kicking legs, direction=${direction}, dt=${dt}`, () => {
    const run = fixture([{ kind, x: 600, y: 440, size: 80 }], 'water')
    run.player = createPlayer({ x: 600 - direction * 120, y: 450.34 }); run.player.grounded = false; run.player.coyote = 0
    let pushes = 0
    for (let i = 0; i < Math.round(4 / dt); i++) {
      stepRun(run, { ...NEUTRAL_INPUT, move: direction }, dt)
      const p = run.player
      assert.equal(p.hang, null, 'sideways swimming does not accidentally climb the float')
      if (i * dt > 2) {
        assert.equal(p.waterMotion.amount, 1, 'prop contacts retain the prone swimming body')
        assert.equal(p.grounded, false)
        if (p.pushing?.amount > .99) pushes++
      }
    }
    assert.ok(pushes > 1 / dt, 'palms remain on the moving surface between body solver contacts')
    assert.ok((run.props[0].x - 600) * direction > 20, 'normal swimming contact drives the object')
    const p = run.player, pose = athletePose(p)
    assert.ok(pose.head[0] - pose.hip[0] > 18, 'body trails horizontally behind the hands')
    assert.equal(pose.frontLeg.planted || pose.backLeg.planted, false)
    const hands = [pose.frontArm.end, pose.backArm.end]
    p.waterMotion.phase = Math.PI
    const recovered = athletePose(p)
    p.waterMotion.phase = 0
    const extended = athletePose(p)
    assert.ok(Math.hypot(extended.frontLeg.end[0] - recovered.frontLeg.end[0], extended.frontLeg.end[1] - recovered.frontLeg.end[1]) > 8, 'legs recover and kick while the palms stay pressed')
    for (const value of [recovered, extended]) {
      assert.ok(Math.hypot(value.frontArm.end[0] - hands[0][0], value.frontArm.end[1] - hands[0][1]) < .01)
      for (const limb of [value.frontArm, value.backArm, value.frontLeg, value.backLeg]) {
        const leg = 'footAngle' in limb
        assert.ok(Math.abs(Math.hypot(limb.joint[0] - limb.root[0], limb.joint[1] - limb.root[1], limb.jointDepth ?? 0) - (leg ? 15 : 10)) < 1e-6)
        assert.ok(Math.abs(Math.hypot(limb.end[0] - limb.joint[0], limb.end[1] - limb.joint[1], (limb.endDepth ?? 0) - (limb.jointDepth ?? 0)) - (leg ? 14.5 : 9)) < 1e-6)
      }
    }
    for (let i = 0; i < Math.round(.7 / dt); i++) stepRun(run, NEUTRAL_INPUT, dt)
    assert.equal(run.player.pushing, null, 'release blends away the grip')
    assert.equal(run.player.waterMotion.amount, 0, 'release returns to upright floating')
  })
}

test('a swimmer keeps kicking against a blocked float but cannot push it from hand-reach distance', () => {
  const run = createRun({ ...blankTrial(), spawn: { x: 425, y: 408.36 }, props: [{ kind: 'box', x: 500, y: 440, size: 80 }],
    platforms: [{ x: 540, y: 300, w: 100, h: 620 }], gravityPlates: [pool({ x: 0, w: 1800, effect: 'water' })] })
  run.started = true; run.player.grounded = false; run.player.coyote = 0
  run.player.freeFall = { amount: 1, time: 0, recovery: null }; run.player.waterMotion = { amount: 1, dive: 0, phase: 0 }
  for (let i = 0; i < 10; i++) stepRun(run, { ...NEUTRAL_INPUT, move: 1 })
  assert.ok(run.player.pushing?.amount > 0, 'hands reach ahead of the head')
  assert.ok(Math.abs(run.props[0].x - 500) < .001, 'reaching does not add the grounded pushing motor')
  for (let i = 0; i < 600; i++) stepRun(run, { ...NEUTRAL_INPUT, move: 1 })
  const p = run.player, x = p.x, phase = p.waterMotion.phase, foot = athletePose(p).frontLeg.end
  for (let i = 0; i < 30; i++) stepRun(run, { ...NEUTRAL_INPUT, move: 1 })
  assert.ok(Math.abs(p.x - x) < .01)
  assert.ok(Math.abs(p.waterMotion.phase - phase) > .1, 'real pushing effort continues the kick when travel is blocked')
  let kick = 0
  for (let i = 0; i < 240; i++) {
    stepRun(run, { ...NEUTRAL_INPUT, move: 1 })
    const current = athletePose(p).frontLeg.end
    kick = Math.max(kick, Math.hypot(current[0] - foot[0], current[1] - foot[1]))
  }
  assert.ok(kick > 8, 'a complete blocked kick still recovers and extends the legs')
})

for (const dt of [STEP, 1 / 30]) test(`water resists released player momentum without slowing the driven swim pace at ${dt}`, () => {
  const field = fieldFor([pool({ x: 0, w: 5000, effect: 'water' })]), p = createPlayer({ x: 500, y: 450.34 })
  p.grounded = false; p.coyote = 0
  for (let i = 0; i < Math.round(3 / dt); i++) stepPlayer(p, { ...NEUTRAL_INPUT, move: 1 }, dt, [], undefined, undefined, undefined, field)
  assert.ok(p.vx > 100 && p.vx <= TUNING.swimHorizontalSpeed)
  const x = p.x
  for (let i = 0; i < Math.round(.5 / dt); i++) stepPlayer(p, NEUTRAL_INPUT, dt, [], undefined, undefined, undefined, field)
  assert.ok(p.x - x < 18, 'release loses momentum within a short glide')
  assert.ok(Math.abs(p.vx) < 1)
  p.vx = 500
  for (let i = 0; i < Math.round(.5 / dt); i++) stepPlayer(p, { ...NEUTRAL_INPUT, move: 1 }, dt, [], undefined, undefined, undefined, field)
  assert.ok(p.vx <= TUNING.swimHorizontalSpeed + .01, 'large carried momentum dissipates without a hard reset')
})

for (const dt of [STEP, 1 / 30]) test(`water resists floating box and ball drift and box spin at ${dt}`, () => {
  const run = fixture([{ kind: 'box', x: 500, y: 440, size: 80 }, { kind: 'ball', x: 850, y: 440, size: 80 }], 'water')
  for (const b of run.props) b.vx = 110
  run.props[0].angularVelocity = 1
  step(run, 1, dt)
  for (const [i, b] of run.props.entries()) {
    assert.ok(Math.abs(b.vx - 110 * Math.exp(-2.5)) < .01, 'half-submerged drag uses actual coverage')
    assert.ok(b.x - [500, 850][i] < 42, 'a pushed float quickly loses horizontal momentum')
  }
  assert.ok(Math.abs(run.props[0].angularVelocity) < .06, 'water damps tumbling as well as translation')
})

test('water resistance scales with submerged area and composition and disappears outside water or during EMP', () => {
  const b = { kind: 'box', x: 500, y: 440, size: 80, angle: 0 }
  assert.equal(propWaterStrength(fieldFor([pool({ effect: 'water' })]), b), .5)
  assert.equal(propWaterStrength(fieldFor([pool()]), b), 0)
  assert.equal(propWaterStrength(fieldFor([pool({ effect: 'water' }), pool({ id: 'grav' })]), b), .25)
  assert.equal(propWaterStrength(fieldFor([pool({ effect: 'water' })]), { ...b, y: 600 }), 1)
  const run = fixture([{ kind: 'box', x: 500, y: 440, size: 80 }], 'water')
  run.empRemaining = 2; run.props[0].vx = 110
  step(run, .2)
  assert.ok(Math.abs(run.props[0].vx - 110) < .001, 'suppressed water supplies no resistance')
  run.empRemaining = 0; run.props[0].x = 1400; run.props[0].vx = 110
  step(run, .2)
  assert.ok(Math.abs(run.props[0].vx - 110) < .001, 'leaving water restores ordinary prop travel')
})

for (const dt of [STEP, 1 / 30]) for (const effect of [undefined, 'water']) test(`a drifting and bobbing floating box carries a centered rider without invented torque or foot chatter, effect=${effect ?? 'grav'}, dt=${dt}`, () => {
  const run = fixture([{ kind: 'box', x: 600, y: 450, size: 100 }], effect)
  run.player = createPlayer({ x: 600, y: 340 }); run.player.grounded = false; run.player.coyote = 0
  step(run, 4, dt)
  const p = run.player, b = run.props[0], shoulder = athletePose(p).shoulder
  b.vx = 90; b.vy = -60
  let previous = { x: p.x, y: p.y }, travel = 0
  for (let i = 0; i < Math.round(6 / dt); i++) {
    stepRun(run, NEUTRAL_INPUT, dt)
    assert.equal(p.contacts.support?.collider.prop, b, 'normal carry retains one continuous support')
    assert.equal(p.grounded, true)
    assert.ok(Math.abs(p.x - b.x) < .001, 'rider remains above the same material point')
    assert.ok(Math.abs(b.angle) < .001, 'a centered weight cannot invent a rocking torque')
    assert.ok(p.contacts.motion.speed < .05, 'carried motion does not become walking')
    assert.equal(p.footwork.feet.every(f => f.planted), true)
    assert.ok(Math.hypot(...athletePose(p).shoulder.map((v, i) => v - shoulder[i])) < .1, 'the balanced pose does not snap while being carried')
    assert.ok(Math.hypot(p.x - previous.x, p.y - previous.y) < dt * 115, 'no carry teleport')
    travel += Math.abs(p.x - previous.x); previous = { x: p.x, y: p.y }
  }
  assert.ok(travel > 25, 'the platform actually carries the rider')
  stepRun(run, { ...NEUTRAL_INPUT, jump: true }, dt)
  assert.equal(p.grounded, false, 'rider can still jump free of the float')
})

test('gentle floating-box rocking carries planted feet through rotation without replaying steps', () => {
  const run = fixture([{ kind: 'box', x: 600, y: 460, size: 120 }], 'water')
  run.player = createPlayer({ x: 600, y: 330 }); run.player.grounded = false; run.player.coyote = 0
  step(run, 2)
  const p = run.player, b = run.props[0]
  let previous = athletePose(p), tilt = 0
  for (let i = 0; i < 600; i++) {
    b.vx = 20; b.vy = 20 * Math.cos(i / 120); b.angularVelocity = .15 * Math.cos(i / 60)
    stepRun(run, NEUTRAL_INPUT)
    assert.equal(p.contacts.support?.collider.prop, b)
    assert.equal(p.footwork.feet.every(f => f.planted), true)
    assert.ok(p.contacts.motion.speed < .05)
    const pose = athletePose(p)
    assert.ok(Math.hypot(pose.shoulder[0] - previous.shoulder[0], pose.shoulder[1] - previous.shoulder[1]) < .5)
    for (const foot of p.footwork.feet) assert.ok(Math.abs(foot.groundAngle - b.angle) < .001)
    previous = pose; tilt = Math.max(tilt, Math.abs(b.angle))
  }
  assert.ok(tilt > .05, 'the fixture actually changes the support angle')
})
