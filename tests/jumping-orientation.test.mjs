import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { isHubLevel, levelProblems, parseLevel } from '../src/games/jumping/level.ts'
import { arrivalLevel } from '../src/games/jumping/facility.ts'
import { createRun, stepRun } from './helpers/jumping-active-run.mjs'
import { NEUTRAL_INPUT, STEP } from '../src/games/jumping/model.ts'
import { translatePlayer } from '../src/games/jumping/playerContacts.ts'

const level = parseLevel(JSON.parse(readFileSync(new URL('../public/levels/jumping/Orientation.jump-level.json', import.meta.url), 'utf8')))
const SERVICE_ACCESS = 'orientation-to-concourse'
/** A facility run of Orientation, with its bulkhead open as the facility opens it. */
function orientationRun(played = level) {
  const run = createRun(played)
  run.hub.open.add(SERVICE_ACCESS)
  return run
}

test('Orientation is a night facility area with a day-lit training hall and a bulkhead to the concourse', () => {
  assert.deepEqual(levelProblems(level), [])
  assert.equal(isHubLevel(level), true)
  assert.equal(level.goal, undefined, 'no exit: the robot leaves through the bulkhead')
  assert.equal(level.entrance.kind, 'charging-bay')
  assert.equal(level.lighting.nightMode, true)
  assert.equal(level.environment.baseLighting, 'night')
  assert.deepEqual(level.environment.walls.map(wall => [wall.name, wall.lighting]), [['Training hall', 'day']])
  assert.equal(level.robots.filter(robot => robot.kind === 'repulsor' && robot.chargingBay).length, 1)
  assert.deepEqual(level.bulkheads.map(door => [door.id, door.to]), [[SERVICE_ACCESS, 'facility-concourse']])
  assert.deepEqual(level.courseDoors, [])
})

// One continuous run with ordinary inputs: wake in the pit, the lessons, the drop
// through the broken floor into the cave, then the rope climb ahead of the
// waking response unit and Up into Service access.
test('Orientation plays from the charging pod to Service access with ordinary inputs', () => {
  const run = orientationRun(), p = run.player, bot = run.robots[0]
  const step = (input, count = 1) => { for (let i = 0; i < count && !run.finished; i++) stepRun(run, { ...NEUTRAL_INPUT, ...input }) }
  const until = (input, done, seconds, label) => {
    for (let i = 0; i < seconds / STEP && !done() && !run.finished; i++) step(input)
    assert.ok(done() || run.finished, `${label} at x ${p.x.toFixed(0)} y ${p.y.toFixed(0)}`)
  }
  const jump = frames => step({ move: 1, jump: true }, frames)

  // The pod wakes in a pit under the broken floor. A running held jump catches
  // the rope hanging through the hole, and Up climbs it into the training hall.
  until({ move: 1 }, () => p.x > 1400, 12, 'run along the pit'); jump(30)
  until({ move: 1 }, () => p.climbing?.kind === 'rope', 2, 'catch the rope through the hole')
  until({ climb: true }, () => p.y < 721, 6, 'climb the rope')
  until({ climb: true, move: 1 }, () => p.grounded && p.y <= 700.5, 3, 'pull up onto the hall floor')
  // A held jump catches the crate's edge; Up pulls up.
  until({ move: 1 }, () => p.x > 2180, 10, 'reach the crate'); jump(30)
  until({ move: 1 }, () => !!p.hang, 3, 'catch the crate')
  step({ climb: true }, 60)
  until({ move: 1 }, () => p.grounded && p.x > 2560, 6, 'over the crate')
  // Two gaps: running held jumps.
  until({ move: 1 }, () => p.x > 3392, 10, 'first gap takeoff'); jump(22)
  until({ move: 1 }, () => p.grounded, 4, 'first gap landing')
  assert.ok(p.x > 3640, 'cleared the first gap')
  until({ move: 1 }, () => p.x > 4392, 10, 'second gap takeoff'); jump(30)
  until({ move: 1 }, () => p.grounded, 4, 'second gap landing')
  assert.ok(p.x > 4780, 'cleared the second gap')
  // Jump to the rope, swing and release across the pool.
  until({ move: 1 }, () => p.x > 5492, 10, 'pool takeoff'); jump(30)
  until({ move: 1 }, () => p.climbing?.kind === 'rope', 3, 'catch the swing rope')
  until({ move: 1 }, () => p.x > 5860 && p.vx > 0, 6, 'swing forward'); jump(20)
  until({ move: 1 }, () => p.grounded, 4, 'land past the pool')
  assert.ok(p.x > 6100 && p.y <= 700.5, 'landed on the far side')
  // The broken floor drops into the cave.
  until({ move: 1 }, () => p.x > 6980, 12, 'reach the broken floor')
  until({ move: 0.4 }, () => p.y > 900, 6, 'step into the hole')
  until({}, () => p.grounded && p.y > 1000, 4, 'land in the cave')
  assert.equal(bot.awakening?.triggered, false, 'the response unit is still asleep')
  // Jump to the rope's low end and climb out ahead of the response unit.
  until({ move: 1 }, () => p.x >= 7980, 12, 'reach the rope'); step({ move: 1, jump: true }, 6)
  until({ move: 1 }, () => p.climbing?.kind === 'rope', 3, 'catch the escape rope')
  until({ climb: true }, () => p.y <= 351, 12, 'climb to the gantry')
  assert.ok(!bot.awakening || bot.awakening.triggered, 'the response unit woke during the escape')
  // Stop in the bulkhead's doorway; a fresh Up leads through.
  const bulkhead = level.bulkheads[0]
  until({ move: 1 }, () => p.grounded && p.x >= bulkhead.x - 60, 6, 'run along the gantry')
  until({}, () => Math.abs(p.vx) < 1, 2, 'stop')
  until({ move: Math.sign(bulkhead.x - p.x) * .3 }, () => Math.abs(p.x - bulkhead.x) < 6, 3, 'walk into the doorway')
  until({}, () => Math.abs(p.vx) < 1, 2, 'stop in the doorway')
  assert.ok(Math.abs(p.x - bulkhead.x) < 20, `stopped in Service access at x ${p.x.toFixed(0)}`)
  step({}, 2); step({ climb: true }, 2)
  assert.equal(run.hub.departure?.door.id, SERVICE_ACCESS)
  until({}, () => run.finished, 3, 'leave through Service access')
  assert.equal(run.grade, null, 'untimed')
})

test('running at the broken floor catches its far lip, and Drop lets go into the cave', () => {
  const run = orientationRun(), p = run.player
  translatePlayer(p, 6700 - p.x, 700 - p.y)
  for (let i = 0; i < 400 && !p.hang && p.y < 900; i++) stepRun(run, { ...NEUTRAL_INPUT, move: 1 })
  assert.ok(p.hang, `caught the lip at x ${p.x.toFixed(0)}`)
  for (let i = 0; i < 10; i++) stepRun(run, { ...NEUTRAL_INPUT, drop: true, detach: true })
  for (let i = 0; i < 120; i++) stepRun(run, NEUTRAL_INPUT)
  assert.ok(p.grounded && p.y > 1000, 'landed in the cave')
})

test("arriving by a door leaves the robot's charging pod in place, empty", () => {
  const arrived = arrivalLevel(level, { kind: 'door', id: SERVICE_ACCESS })
  assert.equal(arrived.entrance.kind, undefined, 'the robot steps out of the door')
  assert.deepEqual(arrived.vacantPods, [{ x: level.entrance.x, y: level.entrance.y }])
  assert.equal(arrivalLevel(level, { kind: 'entrance' }).vacantPods, undefined, 'waking in the pod, it is the entrance')
})

test('after the first visit the response unit has left; its pod stays, empty, however the robot arrives', () => {
  const unit = level.robots.find(robot => robot.chargingBay)
  for (const arrival of [{ kind: 'door', id: SERVICE_ACCESS }, { kind: 'entrance' }]) {
    const arrived = arrivalLevel(level, arrival, true)
    assert.equal(arrived.robots.some(robot => robot.chargingBay), false, 'no robot in a pod')
    assert.equal(arrived.robots.length, level.robots.length - 1)
    assert.ok(arrived.vacantPods.some(pod => pod.robot && pod.x === unit.x && pod.y === unit.y), 'its pod stands empty')
    assert.equal(arrived.vacantPods.some(pod => !pod.robot), arrival.kind === 'door', "the robot's own pod stays when it arrives by a door")
    const run = orientationRun(arrived)
    for (let i = 0; i < 120; i++) stepRun(run, NEUTRAL_INPUT)
    assert.equal(run.robots.some(robot => robot.definition.chargingBay), false)
  }
  assert.deepEqual(levelProblems(arrivalLevel(level, { kind: 'door', id: SERVICE_ACCESS }, true)), [])
})

test('arriving from the concourse steps out of Service access, above the sleeping response unit', () => {
  const run = orientationRun(arrivalLevel(level, { kind: 'door', id: SERVICE_ACCESS })), p = run.player
  for (let i = 0; i < 240; i++) stepRun(run, NEUTRAL_INPUT)
  assert.equal(run.finished, false, 'arriving never leaves at once')
  assert.ok(p.grounded && Math.abs(p.x - level.bulkheads[0].x) < 20 && Math.abs(p.y - 350) < 1, 'on the gantry in the doorway')
  assert.equal(run.robots[0].awakening?.triggered, false, 'the response unit sleeps below')
  stepRun(run, { ...NEUTRAL_INPUT, climb: true })
  assert.equal(run.hub.departure?.door.id, SERVICE_ACCESS, 'Up goes straight back to the concourse')
})
