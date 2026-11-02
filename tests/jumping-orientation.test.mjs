import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { levelProblems, parseLevel } from '../src/games/jumping/level.ts'
import { createRun, stepRun } from './helpers/jumping-active-run.mjs'
import { NEUTRAL_INPUT, STEP } from '../src/games/jumping/model.ts'
import { translatePlayer } from '../src/games/jumping/playerContacts.ts'

const level = parseLevel(JSON.parse(readFileSync(new URL('../public/levels/jumping/Orientation.jump-level.json', import.meta.url), 'utf8')))

test('Orientation is a valid untimed night level with a day-lit training hall', () => {
  assert.deepEqual(levelProblems(level), [])
  assert.equal(level.timing, 'untimed')
  assert.equal(level.entrance.kind, 'charging-bay')
  assert.equal(level.lighting.nightMode, true)
  assert.equal(level.environment.baseLighting, 'night')
  assert.deepEqual(level.environment.walls.map(wall => [wall.name, wall.lighting]), [['Training hall', 'day']])
  assert.equal(level.robots.filter(robot => robot.kind === 'repulsor' && robot.chargingBay).length, 1)
  assert.deepEqual(level.timers, [], 'no clock')
  assert.ok(level.returnEntrance, 'a re-entry starts at the far end')
})

// One continuous run with ordinary inputs: wake, the four lessons, the drop
// through the broken floor into the cave, then the rope climb ahead of the
// waking response unit.
test('Orientation plays from the charging pod to Service access with ordinary inputs', () => {
  const run = createRun(level), p = run.player, bot = run.robots[0]
  const step = (input, count = 1) => { for (let i = 0; i < count && !run.finished; i++) stepRun(run, { ...NEUTRAL_INPUT, ...input }) }
  const until = (input, done, seconds, label) => {
    for (let i = 0; i < seconds / STEP && !done() && !run.finished; i++) step(input)
    assert.ok(done() || run.finished, `${label} at x ${p.x.toFixed(0)} y ${p.y.toFixed(0)}`)
  }
  const jump = frames => step({ move: 1, jump: true }, frames)

  // The latching power plate opens the gate into the training hall.
  until({ move: 1 }, () => p.x > 640, 10, 'cross the power plate')
  assert.equal(run.mechanisms[0].active, true, 'training access opens')
  // Leaps and Bounds I: a held jump catches the crate's edge; Up pulls up.
  until({ move: 1 }, () => p.x > 2180, 10, 'reach the crate'); jump(30)
  until({ move: 1 }, () => !!p.hang, 3, 'catch the crate')
  step({ climb: true }, 60)
  until({ move: 1 }, () => p.grounded && p.x > 2560, 6, 'over the crate')
  // First Gap and Second Gap: running held jumps; the plate opens the swing room.
  until({ move: 1 }, () => p.x > 3392, 10, 'first gap takeoff'); jump(22)
  until({ move: 1 }, () => p.grounded, 4, 'first gap landing')
  assert.ok(p.x > 3640, 'cleared the first gap')
  until({ move: 1 }, () => p.x > 4392, 10, 'second gap takeoff')
  assert.equal(run.mechanisms[1].active, true, 'running across the plate opens the swing room')
  jump(30)
  until({ move: 1 }, () => p.grounded, 4, 'second gap landing')
  assert.ok(p.x > 4780, 'cleared the second gap')
  // A Little Swing: jump to the rope, swing and release across the pool.
  until({ move: 1 }, () => p.x > 5492, 10, 'pool takeoff'); jump(30)
  until({ move: 1 }, () => p.climbing?.kind === 'rope', 3, 'catch the swing rope')
  until({ move: 1 }, () => p.x > 5860 && p.vx > 0, 6, 'swing forward'); jump(20)
  until({ move: 1 }, () => p.grounded, 4, 'land past the pool')
  assert.ok(p.x > 6100 && p.y <= 700.5, 'landed on the far side')
  // The hall's exit has caved in; the broken floor before it drops into the cave.
  until({ move: 1 }, () => p.x > 6980, 12, 'reach the broken floor')
  until({ move: 0.4 }, () => p.y > 900, 6, 'step into the hole')
  until({}, () => p.grounded && p.y > 1000, 4, 'land in the cave')
  assert.equal(run.mechanisms[2].active, false, 'the concourse exit stays jammed')
  assert.equal(bot.awakening?.triggered, false, 'the response unit is still asleep')
  // Company: jump to the rope's low end and climb out ahead of the response unit.
  until({ move: 1 }, () => p.x >= 7980, 12, 'reach the rope'); step({ move: 1, jump: true }, 6)
  until({ move: 1 }, () => p.climbing?.kind === 'rope', 3, 'catch the escape rope')
  until({ climb: true }, () => p.y <= 351, 12, 'climb to the gantry')
  assert.ok(!bot.awakening || bot.awakening.triggered, 'the response unit woke during the escape')
  until({ move: 1 }, () => run.finished, 6, 'leave through Service access')
  assert.equal(run.finished, true)
  assert.equal(run.grade, null, 'untimed')
})

test('running at the broken floor catches its far lip, and Drop lets go into the cave', () => {
  const run = createRun(level), p = run.player
  translatePlayer(p, 6700 - p.x, 700 - p.y)
  for (let i = 0; i < 400 && !p.hang && p.y < 900; i++) stepRun(run, { ...NEUTRAL_INPUT, move: 1 })
  assert.ok(p.hang, `caught the lip at x ${p.x.toFixed(0)}`)
  for (let i = 0; i < 10; i++) stepRun(run, { ...NEUTRAL_INPUT, drop: true, detach: true })
  for (let i = 0; i < 120; i++) stepRun(run, NEUTRAL_INPUT)
  assert.ok(p.grounded && p.y > 1000, 'landed in the cave')
})

test('re-entering starts beside Service access and stays until the robot walks back in', () => {
  const run = createRun({ ...level, entrance: level.returnEntrance }), p = run.player
  for (let i = 0; i < 240; i++) stepRun(run, NEUTRAL_INPUT)
  assert.equal(run.finished, false)
  assert.equal(run.robots[0].awakening?.triggered, false, 'the response unit sleeps below')
  for (let i = 0; i < 600 && !run.finished; i++) stepRun(run, { ...NEUTRAL_INPUT, move: -1 })
  assert.equal(run.finished, true)
})
