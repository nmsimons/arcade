import test from 'node:test'
import assert from 'node:assert/strict'
import { blankTrial, parseLevel } from '../src/games/jumping/level.ts'
import { addItem, duplicateItem, setShovebotMode } from '../src/games/jumping/editor.ts'
import { NEUTRAL_INPUT, STEP } from '../src/games/jumping/model.ts'
import { createRun, stepRun } from './helpers/jumping-active-run.mjs'
import { CONTACT_EMP_SECONDS } from '../src/games/jumping/contactEmp.ts'
import { JumpingAudioState } from '../src/games/jumping/audioState.ts'

const tick = (run, frames = 1, input = {}) => {
  for (let i = 0; i < frames; i++) stepRun(run, { ...NEUTRAL_INPUT, ...input })
}
function scene(mode = 'emp') {
  const file = blankTrial()
  file.robots = [{ x: 450, y: 920, left: 350, right: 1000, ...(mode ? { mode } : {}) }]
  const run = createRun(file)
  Object.assign(run.robots[0], { phase: 'recover', time: -10 })
  Object.assign(run.player, { x: 413, y: 920, grounded: true, footwork: null })
  return run
}

test('EMP shovebot mode survives editing, duplication and JSON; ordinary bots stay compatible', () => {
  const placed = addItem(blankTrial(), 'pusher', { x: 450, y: 920 }, { x: 450, y: 920 })
  const changed = setShovebotMode(placed.level, placed.selection.index, 'emp')
  assert.equal(placed.level.robots[0].mode, undefined)
  assert.equal(changed.robots[0].mode, 'emp')
  assert.equal(parseLevel(JSON.parse(JSON.stringify(changed))).robots[0].mode, 'emp')
  assert.equal(duplicateItem(changed, placed.selection).level.robots[1].mode, 'emp')
  assert.equal(setShovebotMode(changed, 0, 'shove').robots[0].mode, undefined)
  for (const robot of [{ ...changed.robots[0], mode: 'laser' }, { ...changed.robots[0], mode: true }, { ...changed.robots[0], kind: 'repulsor' }])
    assert.throws(() => parseLevel({ ...changed, robots: [robot] }))
  const hunter = { ...placed.level, robots: [{ ...placed.level.robots[0], kind: 'repulsor' }] }
  assert.equal(setShovebotMode(hunter, 0, 'emp'), hunter)
})

test('real chassis contact disables movement, jumps, climbing and empty-handed actions, then recovers', () => {
  const run = scene()
  tick(run, 1, { move: -1, jump: true, climb: true, use: true })
  assert.ok(run.gadgets.disabled.get(run.player) > CONTACT_EMP_SECONDS - STEP * 2)
  assert.equal(run.player.shove, undefined)
  assert.equal(run.player.grounded, true)
  const x = run.player.x, y = run.player.y
  run.robots = []
  run.timeStopRemaining = 100; run.timeFastRemaining = 100
  tick(run, 120, { move: 1, jump: true, climb: true, use: true, interact: true })
  assert.equal(run.player.x, x); assert.equal(run.player.y, y)
  assert.equal(run.player.shove, undefined)
  assert.ok(run.gadgets.disabled.has(run.player), 'stopwatches do not spend the disable faster')
  tick(run, 119)
  assert.equal(run.gadgets.disabled.has(run.player), false)
  tick(run, 40, { move: -1, jump: true })
  assert.ok(run.player.x < x - 10)
  assert.ok(run.player.y < y - 20)
})

test('continued contact refreshes the disable without electrical sound spam', () => {
  const run = scene(), audio = new JumpingAudioState()
  audio.reset(run.player, run)
  for (let i = 0; i < 360; i++) { tick(run); audio.step(run.player, run, STEP) }
  assert.ok(run.gadgets.disabled.get(run.player) > 1.98)
  assert.equal(audio.drain().cues.filter(c => c.kind === 'emp').length, 1)
})

for (const condition of ['nearby', 'ordinary', 'global EMP', 'direct EMP', 'deactivated'])
  test(`${condition} does not shock the player`, () => {
    const run = scene(condition === 'ordinary' ? undefined : 'emp'), robot = run.robots[0]
    if (condition === 'ordinary') delete robot.definition.mode
    if (condition === 'nearby') run.player.x -= 6
    if (condition === 'global EMP') run.empRemaining = 5
    if (condition === 'direct EMP') run.gadgets.disabled.set(robot, 10)
    if (condition === 'deactivated') robot.deactivated = true
    tick(run)
    assert.equal(run.gadgets.disabled.has(run.player), false)
  })

test('an EMP shovebot still pushes through its normal charge while the shocked player cannot resist', () => {
  const run = scene(), robot = run.robots[0], x = run.player.x
  Object.assign(robot, { facing: -1, phase: 'charge', time: 0 })
  tick(run, 20, { move: 1, jump: true })
  assert.ok(run.player.x < x - 40)
  assert.ok(robot.x < 410)
  assert.ok(run.gadgets.disabled.has(run.player))
  assert.ok(Math.abs(robot.x - run.player.x) >= 36.9)
})

test('a shocked player keeps their sleeve, cannot fire or drop it, and regains both controls', () => {
  const file = blankTrial()
  file.props = [{ kind: 'box', gadget: 'emp', x: 190, y: 920, size: 40 }]
  const run = createRun(file)
  tick(run, 1, { interact: true }); tick(run)
  const sleeve = run.gadgets.held
  assert.ok(sleeve)
  const contact = scene()
  run.robots = contact.robots
  Object.assign(run.player, { x: 413, y: 920, vx: 0, vy: 0, footwork: null })
  tick(run, 1, { use: true, interact: true })
  run.robots = []
  for (let i = 0; i < 30; i++) { tick(run); tick(run, 1, { use: true, interact: true, climb: true }) }
  assert.equal(run.gadgets.held, sleeve)
  assert.equal(run.gadgets.shots, 0)
  assert.equal(run.gadgets.aiming, false)
  tick(run, 240)
  tick(run, 1, { use: true })
  assert.equal(run.gadgets.shots, 1)
  tick(run); tick(run, 1, { interact: true })
  assert.equal(run.gadgets.held, null)
})

test('gravity and the rest of the level continue while the player is disabled; restart clears it', () => {
  const run = scene()
  tick(run)
  run.robots = []
  run.player.grounded = false; run.player.y = 700; run.player.vx = 250
  const x = run.player.x
  tick(run, 30, { jump: true, move: -1 })
  assert.ok(run.player.y > 720, 'gravity continues')
  assert.ok(run.player.x > x + 20, 'existing momentum is not frozen')
  assert.ok(run.elapsed > .2)
  assert.equal(createRun(run.level).gadgets.disabled.size, 0)
})
