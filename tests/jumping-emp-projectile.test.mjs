import test from 'node:test'
import assert from 'node:assert/strict'
import { blankTrial } from '../src/games/jumping/level.ts'
import { NEUTRAL_INPUT, STEP } from '../src/games/jumping/model.ts'
import { createRun, stepRun } from './helpers/jumping-active-run.mjs'
import { heldToolFrame, EMP_COOLDOWN, EMP_DISABLE_SECONDS } from '../src/games/jumping/gadgets.ts'
import { gravityAtPoint } from '../src/games/jumping/gravity.ts'
import { drawEmpCrackle, drawGadgets } from '../src/games/jumping/gadgetRender.ts'
import { translatePlayer } from '../src/games/jumping/playerContacts.ts'
import { JumpingAudioState } from '../src/games/jumping/audioState.ts'
import { LightingState } from '../src/games/jumping/lightingModel.ts'

const tick = (run, frames = 1, input = {}) => { for (let i = 0; i < frames; i++) stepRun(run, { ...NEUTRAL_INPUT, ...input }) }
const lift = (id, x, y = 880) => ({ id, kind: 'lift', orientation: 'horizontal', x, y, w: 120, h: 20, travel: 250, power: 'always' })
function scene() {
  const level = blankTrial(); level.props = [{ kind: 'box', gadget: 'emp', x: 190, y: 920, size: 40 }]
  level.mechanisms = [lift('target', 500), lift('other', 900)]
  return level
}
function equipped(level = scene()) { const run = createRun(level); tick(run, 1, { interact: true }); tick(run); return run }
function impact(run, device) {
  for (let frame = 0; frame < 180 && !run.gadgets.disabled.has(device); frame++) tick(run)
  assert.ok(run.gadgets.disabled.has(device), 'the projectile reaches its selected device')
}

test('EMP fires a traveling bolt, disables one mechanism, and remains equipped', () => {
  const run = equipped(), weapon = run.gadgets.held, [target, other] = run.mechanisms
  const audio = new JumpingAudioState(); audio.reset(run.player, run)
  tick(run, 1, { use: true })
  audio.step(run.player, run, STEP)
  const cues = audio.drain().cues.map(cue => cue.kind)
  assert.ok(cues.includes('emp-shot')); assert.equal(cues.includes('emp'), false)
  assert.equal(run.gadgets.held, weapon)
  assert.equal(run.gadgets.shots, 1)
  assert.equal(run.empRemaining, 0)
  assert.equal(run.gadgets.disabled.size, 0, 'a distant target is not disabled on the firing frame')
  const x = run.gadgets.bolts[0].position[0]
  tick(run)
  assert.ok(run.gadgets.bolts[0].position[0] > x)
  impact(run, target)
  assert.ok(run.gadgets.disabled.get(target) <= EMP_DISABLE_SECONDS)
  const xStopped = target.x, otherX = other.x
  tick(run, 60)
  assert.equal(target.x, xStopped)
  assert.notEqual(other.x, otherX)
  assert.equal(run.gadgets.disabled.has(other), false)
  tick(run, Math.ceil(EMP_DISABLE_SECONDS / STEP) + 20)
  assert.equal(run.gadgets.disabled.size, 0)
  assert.notEqual(target.x, xStopped, 'ordinary machinery resumes when its timer expires')
  assert.equal(run.gadgets.held, weapon)
})

test('dropping the EMP does not cancel its traveling bolt or device disable', () => {
  const run = equipped(), target = run.mechanisms[0], weapon = run.gadgets.held
  tick(run, 1, { use: true }); tick(run, 1, { interact: true })
  assert.equal(run.gadgets.held, null)
  assert.ok(run.props.includes(weapon))
  impact(run, target)
  const x = target.x; tick(run, 120)
  assert.equal(target.x, x)
  tick(run, Math.ceil(EMP_DISABLE_SECONDS / STEP) + 20)
  assert.equal(run.gadgets.disabled.size, 0)
  assert.notEqual(target.x, x)
})

test('EMP cooldown needs a fresh press, survives drop/pickup, and repeated hits refresh rather than stack', () => {
  const run = equipped(), weapon = run.gadgets.held, target = run.mechanisms[0]
  tick(run, 1, { use: true }); tick(run, 180, { use: true })
  assert.equal(run.gadgets.shots, 1)
  const before = run.gadgets.disabled.get(target)
  tick(run); tick(run, 1, { use: true }); impact(run, target)
  tick(run, 40)
  assert.ok(run.gadgets.disabled.get(target) > before)
  assert.ok(run.gadgets.disabled.get(target) <= EMP_DISABLE_SECONDS)
  assert.equal(run.gadgets.shots, 2)
  tick(run, 1, { interact: true })
  assert.equal(run.props[0], weapon)
  assert.ok(weapon.gadgetCooldown > 0 && weapon.gadgetCooldown < EMP_COOLDOWN)
  tick(run); tick(run, 1, { interact: true })
  assert.equal(run.gadgets.held, weapon)
  tick(run, 1, { use: true })
  assert.equal(run.gadgets.shots, 2)
})

for (const blocker of ['wall', 'prop', 'range']) test(`EMP is stopped by ${blocker} without disabling a target through it`, () => {
  const level = scene()
  if (blocker === 'wall') level.platforms = [{ x: 350, y: 600, w: .1, h: 320 }]
  if (blocker === 'prop') level.props.push({ kind: 'box', x: 360, y: 920, size: 80 })
  if (blocker === 'range') { level.mechanisms = [lift('distant', 1700)] }
  const run = equipped(level); tick(run, 1, { use: true }); tick(run, 150)
  assert.equal(run.gadgets.disabled.size, 0)
  assert.equal(run.gadgets.bolts.length, 0)
  assert.ok(run.gadgets.held)
})

test('a red field absorbs the EMP bolt and temporarily disables only that field', () => {
  const level = scene(); level.mechanisms = []
  level.forceFields = [{ id: 'red', mode: 'objects', x: 350, y: 500, w: 12, h: 420, orientation: 'vertical' }]
  const run = equipped(level), field = run.forceFields[0]
  tick(run, 1, { use: true }); impact(run, field)
  assert.equal(field.active, false)
  assert.equal(run.gadgets.bolts.length, 0)
  assert.equal(run.gadgets.disabled.size, 1)
  tick(run, Math.ceil(EMP_DISABLE_SECONDS / STEP) + 20)
  assert.equal(field.active, true)
})

test('a locally disabled red field waits for a body to clear before returning', () => {
  const level = scene(); level.mechanisms = []
  level.forceFields = [{ id: 'red', mode: 'objects', x: 350, y: 500, w: 12, h: 420, orientation: 'vertical' }]
  const run = equipped(level), field = run.forceFields[0]
  tick(run, 1, { use: true }); impact(run, field)
  translatePlayer(run.player, 356 - heldToolFrame(run.player).x, 0)
  tick(run, 1, { interact: true })
  assert.equal(run.gadgets.held, null)
  // Drop the sleeve across the beam; restoration must use the ordinary
  // object-clearance policy rather than materializing a solid inside equipment.
  tick(run, Math.ceil(EMP_DISABLE_SECONDS / STEP) + 20)
  assert.equal(run.gadgets.disabled.size, 0)
  assert.equal(field.active, false)
  assert.equal(field.pending, true)
  tick(run, 1, { interact: true }); tick(run, 60, { move: 1 })
  assert.equal(field.active, true)
})

test('EMP crackle changes in discrete flickers, has bounded work, and draws no countdown', () => {
  const capture = (w, h, age) => {
    const calls = []
    const ctx = new Proxy({ moveTo(x, y) { calls.push(['move', x, y]) }, lineTo(x, y) { calls.push(['line', x, y]) },
      stroke() { calls.push(['stroke']) }, arc() { assert.fail('disabled effects have no countdown ring') } },
    { get: (object, key) => key in object ? object[key] : () => {} })
    drawEmpCrackle(ctx, 400, 300, w, h, age)
    return calls
  }
  const first = capture(120, 20, 0)
  assert.deepEqual(capture(120, 20, .01), first, 'geometry holds between flickers')
  assert.notDeepEqual(capture(120, 20, .1), first)
  assert.equal(first.filter(call => call[0] === 'stroke').length, 3)
  assert.equal(capture(10000, 10000, 4).length, first.length, 'large devices do not increase arc or vertex count')
  const run = equipped(); run.gadgets.disabled.set(run.mechanisms[0], 2)
  let arcs = 0
  const ctx = new Proxy({ globalAlpha: 1, stroke() { arcs++ }, arc() { assert.fail('no timer icon over disabled devices') } },
  { get: (object, key) => key in object ? object[key] : () => {} })
  drawGadgets(ctx, run)
  assert.equal(arcs, 3)
  const exposures = []
  drawGadgets(ctx, run, (_ctx, exposure, draw) => { exposures.push(exposure); draw() })
  assert.deepEqual(exposures, [1], 'electricity stays visible in darkness through the existing emission pass')
})

test('blue beams pass EMP bolts, but their emitters can be targeted', () => {
  const level = scene()
  level.forceFields = [{ id: 'blue', x: 350, y: 500, w: 12, h: 420, orientation: 'vertical' }]
  const run = equipped(level)
  tick(run, 1, { use: true }); impact(run, run.mechanisms[0])
  assert.equal(run.forceFields[0].active, true)
  const second = equipped({ ...level, forceFields: [{ ...level.forceFields[0], y: 881, h: 40 }] })
  tick(second, 1, { use: true }); impact(second, second.forceFields[0])
  assert.equal(second.forceFields[0].active, false)
})

test('EMP stuns just the hit shovebot, turns it toward the shooter, and leaves it solid', () => {
  const level = scene(); level.mechanisms = []; level.lighting = { ambient: 0, lights: [] }
  level.robots = [{ x: 500, y: 920, left: 450, right: 750, headlight: true }, { x: 1100, y: 920, left: 1000, right: 1400, headlight: true }]
  const run = equipped(level), target = run.robots[0], other = run.robots[1]
  const lights = new LightingState()
  assert.deepEqual(lights.sources(run.level.lighting, run, 0).map(light => light.fade), [1, 1])
  target.facing = 1
  tick(run, 1, { use: true }); impact(run, target)
  const x = target.x, phase = target.phase, time = target.time, otherX = other.x
  tick(run, 90)
  assert.equal(target.x, x); assert.equal(target.phase, phase); assert.equal(target.time, time)
  assert.equal(target.facing, -1)
  assert.equal(target.vx, 0)
  assert.notEqual(other.x, otherX)
  assert.deepEqual(lights.sources(run.level.lighting, run, .2).map(light => light.fade), [0, 1])
  translatePlayer(run.player, target.x - run.player.x, target.y - 46 - run.player.y)
  run.player.vx = 0; run.player.vy = 0; tick(run, 30)
  assert.equal(run.player.contacts.support?.collider.robot, target, 'the player can stand on a disabled chassis')
  assert.equal(target.x, x)
})

test('a dry gravity emitter is individually disabled without changing other fields or water', () => {
  const level = scene(); level.mechanisms = []
  level.gravityPlates = [{ id: 'one', x: 400, y: 778, w: 150, h: 110, gravity: -1, power: 'always' },
    { id: 'two', x: 900, y: 778, w: 150, h: 110, gravity: -1, power: 'always' }]
  const run = equipped(level), [one, two] = run.water.plates
  tick(run, 1, { use: true }); impact(run, one)
  assert.ok(gravityAtPoint(run.gravityField, 450, 820) > 0)
  assert.ok(gravityAtPoint(run.gravityField, 950, 820) < 0)
  assert.equal(run.gadgets.disabled.has(two), false)
})

test('EMP aims in eight directions, works underwater, and clears effects on restart', () => {
  const level = scene(); level.mechanisms = []
  level.gravityPlates = [{ id: 'pool', effect: 'water', x: 0, y: 600, w: 1000, h: 320, gravity: -1 }]
  const run = equipped(level)
  tick(run, 1, { aimX: 1, aimY: -1, use: true })
  const frame = heldToolFrame(run.player)
  assert.ok(Math.abs(frame.angle + Math.PI / 4) < 1e-8)
  assert.equal(run.gadgets.shots, 1)
  assert.ok(run.gadgets.held)
  const restarted = createRun(level)
  assert.equal(restarted.gadgets.disabled.size, 0)
  assert.equal(restarted.gadgets.bolts.length, 0)
  assert.equal(restarted.props[0].gadgetCooldown, undefined)
})

test('legacy collectible EMP still triggers the global outage', () => {
  const level = scene(); level.props = []; level.pickups = [{ kind: 'emp', x: 160, y: 880 }]
  const run = createRun(level); tick(run)
  assert.ok(run.empRemaining > 4)
})
