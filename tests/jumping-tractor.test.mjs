import test from 'node:test'
import assert from 'node:assert/strict'
import { blankTrial, parseLevel } from '../src/games/jumping/level.ts'
import { NEUTRAL_INPUT, STEP } from '../src/games/jumping/model.ts'
import { createRun, stepRun } from './helpers/jumping-active-run.mjs'
import { addItem, duplicateItem } from '../src/games/jumping/editor.ts'
import { objectLabel } from '../src/games/jumping/objectLabels.ts'
import { gadgetLabel, heldToolFrame, GADGET_REACH } from '../src/games/jumping/gadgets.ts'
import { propWidth } from '../src/games/jumping/propGeometry.ts'

const tool = (kind = 'tractor', x = 190, y = 920) => ({ kind: 'box', gadget: kind, x, y, size: 40 })
const tick = (run, frames = 1, input = {}) => { for (let i = 0; i < frames; i++) stepRun(run, { ...NEUTRAL_INPUT, ...input }) }
function equipped(props, edit = level => level) {
  const level = blankTrial(); level.props = props
  const run = createRun(parseLevel(edit(level)))
  tick(run, 30); tick(run, 1, { interact: true }); tick(run, 2)
  assert.ok(run.gadgets.held, 'the tool is picked up')
  return run
}
/** The item's near edge, measured from the tractor's emitter along a rightward shot. */
const gap = run => {
  const item = run.props[0], frame = heldToolFrame(run.player)
  return item.x - propWidth(item) / 2 - (frame.x + frame.size * .2)
}
const zeroG = level => { level.gravityPlates = [{ id: 'z', x: 0, y: 0, w: 1800, h: 920, gravity: 0, power: 'always' }]; return level }

test('tractor guns are authored, labelled, duplicated and saved like the other sleeves', () => {
  const level = blankTrial()
  const created = addItem(level, 'tractor', { x: 300, y: 920 }, { x: 300, y: 920 })
  assert.deepEqual(created.level.props[0], { kind: 'box', gadget: 'tractor', x: 300, y: 920, size: 40 })
  assert.equal(objectLabel(created.level, created.selection), 'Tractor gun 1')
  assert.equal(gadgetLabel('tractor'), 'Tractor gun')
  const copied = duplicateItem(created.level, created.selection)
  assert.equal(copied.level.props[1].gadget, 'tractor')
  assert.deepEqual(parseLevel(JSON.parse(JSON.stringify(copied.level))).props, copied.level.props)
  assert.throws(() => parseLevel({ ...blankTrial(), props: [{ kind: 'ball', gadget: 'tractor', x: 300, y: 920, size: 40 }] }))
})

test('a pull is the repulsor impulse reversed: same ray, same mass scaling, opposite direction', () => {
  for (const size of [80, 160]) {
    const pushed = equipped([tool('repulsor'), { kind: 'box', x: 700, y: 920, size }])
    const pulled = equipped([tool(), { kind: 'box', x: 700, y: 920, size }])
    tick(pushed, 1, { use: true }); tick(pulled, 1, { use: true })
    assert.ok(pulled.props[0].vx < -1, `a ${size} box is pulled toward the player`)
    assert.ok(Math.abs(pulled.props[0].vx + pushed.props[0].vx) < 1e-6, 'the far pull mirrors the push exactly')
    assert.equal(pulled.gadgets.lastShotKind, 'tractor')
  }
  const light = equipped([tool(), { kind: 'box', x: 700, y: 920, size: 80 }])
  const heavy = equipped([tool(), { kind: 'box', x: 700, y: 920, size: 160 }])
  tick(light, 1, { use: true }); tick(heavy, 1, { use: true })
  assert.ok(light.props[0].vx < heavy.props[0].vx, 'mass sets the velocity change')
})

test('nothing slows a pulled item near the player: it arrives at full speed and shoves them', () => {
  const run = equipped([tool(), { kind: 'ball', x: 900, y: 920, size: 68 }])
  const x = run.player.x
  tick(run, 1, { use: true })
  const launch = run.props[0].vx
  assert.ok(launch < -900)
  let last = launch
  while (gap(run) > 30) { last = run.props[0].vx; tick(run) }
  // Only the ball's ordinary rolling losses remain over 650 units of floor.
  assert.ok(last < launch * .9, `no arrival brake (launched ${launch.toFixed(0)}, ${last.toFixed(0)} at the hands)`)
  tick(run, 120)
  assert.ok(run.player.x < x - 50, `the player takes the hit (moved ${(run.player.x - x).toFixed(1)})`)
})

test('a close item gets the full pull too, and repeat pulls add up as repulsor shots do', () => {
  const near = equipped([tool(), { kind: 'ball', x: 330, y: 920, size: 68 }])
  const far = equipped([tool(), { kind: 'ball', x: 1200, y: 920, size: 68 }], level => { level.width = 2400; return level })
  tick(near, 1, { use: true }); tick(far, 1, { use: true })
  assert.ok(Math.abs(near.props[0].vx - far.props[0].vx) < 1e-6, 'the impulse ignores distance')
  const run = equipped([tool(), { kind: 'box', x: 1500, y: 880, size: 160 }], level => { level.width = 2400; return zeroG(level) })
  tick(run, 1, { use: true })
  const once = run.props[0].vx
  tick(run, Math.ceil(.4 / STEP)); tick(run, 1, { use: true })
  assert.ok(Math.abs(run.props[0].vx - 2 * once) < 1, 'a second shot doubles the approach')
  assert.equal(run.gadgets.shots, 2)
})

test('the player cannot pull their own footing toward themselves', () => {
  const level = blankTrial()
  level.props = [tool('tractor', 300, 800), { kind: 'box', x: 300, y: 920, size: 120 }]
  level.entrance = { x: 300, y: 800 }
  const run = createRun(parseLevel(level))
  tick(run, 60); tick(run, 1, { interact: true }); tick(run, 2)
  assert.ok(run.gadgets.held)
  assert.equal(run.player.contacts.support.collider.prop, run.props[0])
  const box = { x: run.props[0].x, y: run.props[0].y }, player = { x: run.player.x, y: run.player.y }
  // A stick held down and forward points the beam into the box underfoot.
  tick(run, 1, { aimX: 1, aimY: 1, use: true })
  assert.equal(run.gadgets.shots, 1)
  assert.equal(run.gadgets.feedback, 'No pull')
  tick(run, 60)
  assert.ok(Math.hypot(run.props[0].x - box.x, run.props[0].y - box.y) < .5)
  assert.ok(Math.hypot(run.player.x - player.x, run.player.y - player.y) < .5, 'no self-propulsion')
})

test('bots are pulled toward the gun as the repulsor pushes them away, turning to face the player', () => {
  const pushed = equipped([tool('repulsor')], level => { level.robots = [{ x: 600, y: 920, left: 100, right: 1200 }]; return level })
  const run = equipped([tool()], level => { level.robots = [{ x: 600, y: 920, left: 100, right: 1200 }]; return level })
  const bot = run.robots[0], x = run.player.x
  bot.facing = 1; pushed.robots[0].facing = 1
  tick(pushed, 1, { use: true }); tick(run, 1, { use: true })
  assert.equal(run.gadgets.feedback, 'Pulled')
  assert.ok(bot.recoilVx < 0 && Math.abs(bot.recoilVx + pushed.robots[0].recoilVx) < 1e-6, 'the pull mirrors the push')
  assert.equal(bot.facing, -1, 'it turns toward the player')
  assert.equal(bot.phase, 'recover')
  const start = bot.x
  tick(run, 30)
  assert.ok(bot.x < start - 20, 'it slides toward the player')
  assert.ok(Math.abs(run.player.x - x) < 300)
})

test('a dropped tool can be fetched back past the hands, where it can be caught', () => {
  // Weightless, the thin sleeve floats in the beam's level path. (On a floor,
  // a level beam passes over it, as it does the repulsor's.)
  const run = equipped([tool(), tool('emp', 900, 888)], zeroG)
  tick(run, 1, { use: true })
  assert.equal(run.gadgets.feedback, 'Pulled')
  let closest = Infinity
  for (let frame = 0; frame < 240; frame++) {
    tick(run)
    const emp = run.props[0], frame0 = heldToolFrame(run.player)
    closest = Math.min(closest, Math.hypot(emp.x - frame0.x, emp.y - frame0.y))
  }
  assert.equal(run.props[0].gadget, 'emp')
  assert.ok(closest < GADGET_REACH, `it passes within pickup reach (${closest.toFixed(0)})`)
})

test('a ball pulled down off a shelf falls under ordinary gravity', () => {
  // A ball on a shelf above and ahead is pulled down the diagonal.
  const shelf = level => { level.platforms = [{ x: 350, y: 700, w: 400, h: 20 }]; return level }
  const run = equipped([tool(), { kind: 'ball', x: 390, y: 700, size: 68 }], shelf)
  const free = equipped([tool(), { kind: 'ball', x: 390, y: 700, size: 68 }], shelf)
  tick(run, 1, { aimX: 1, aimY: -1, use: true })
  assert.equal(run.gadgets.feedback, 'Pulled')
  let fastest = 0
  for (let frame = 0; frame < 120; frame++) { tick(run); fastest = Math.max(fastest, run.props[0].vy) }
  tick(free, 121)
  assert.ok(run.props[0].x < free.props[0].x - 20, 'the ball came off the shelf toward the player')
  assert.ok(fastest > 300, `the ball falls freely (peak ${fastest.toFixed(0)})`)
  assert.ok(Math.abs(run.props[0].y - 920) < 1, 'and lands on the floor')
})
