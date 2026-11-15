import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRun, stepRun } from '../src/games/jumping/challenge.ts'
import { parseLevel } from '../src/games/jumping/level.ts'
import { NEUTRAL_INPUT } from '../src/games/jumping/model.ts'
import { entranceDuration } from '../src/games/jumping/goal.ts'
import { presentedAthletePose } from '../src/games/jumping/athletePose.ts'
import { cockAt, glanceAt, glancePose, idleGlance, robotsStir, standingIdle } from '../src/games/jumping/idleGlance.ts'

const floor = () => {
  const run = createRun(parseLevel(JSON.parse(readFileSync(new URL('../dev/model-review/scenes/floor.jump-level.json', import.meta.url), 'utf8'))))
  if (run.entrance) stepRun(run, NEUTRAL_INPUT, entranceDuration(run.entrance))
  return run
}
/** Step with an input, sampling the look once per drawn frame as the game does. */
const play = (run, input, seconds, stirring = () => false) => {
  const samples = []
  for (let i = 0; i < Math.round(seconds * 120); i++) {
    stepRun(run, { ...NEUTRAL_INPUT, ...input })
    if (i % 2) samples.push(idleGlance(run.player, run.activeTime, stirring()))
  }
  return samples
}

test('the head turns to the camera and stays, cocking to one side now and then', () => {
  assert.equal(glanceAt(0), 0); assert.equal(glanceAt(2.99), 0)
  assert.ok(glanceAt(3.1) > 0 && glanceAt(3.1) < 1)
  for (const rest of [3.3, 5, 60, 3600]) assert.equal(glanceAt(rest), 1, 'it does not look away by itself')
  let previous = 0, cocks = 0, left = 0, right = 0, most = 0
  for (let rest = 0; rest < 140; rest += 1 / 60) {
    const tilt = cockAt(rest)
    assert.ok(Math.abs(tilt - previous) < .06, 'the head never snaps')
    if (tilt && !previous) { cocks++; if (rest < 3.26) assert.fail('no cock before it faces the camera') }
    if (tilt < 0) left++; if (tilt > 0) right++
    most = Math.max(most, Math.abs(tilt)); previous = tilt
  }
  assert.ok(cocks >= 17 && cocks <= 20, `${cocks} cocks in about two minutes of looking`)
  assert.ok(left > 0 && right > 0, 'to either side')
  assert.ok(most > .15 && most < .3, 'by about 12 degrees')
  assert.equal(cockAt(57.3), cockAt(57.3))
})

test('the robot looks only once it stands idle, and faces ahead at once when it moves off', () => {
  const run = floor()
  const waiting = play(run, {}, 4)
  assert.ok(standingIdle(run.player))
  assert.ok(waiting.slice(0, 170).every(glance => glance.face === 0), 'not before it has stood a while')
  assert.equal(waiting.at(-1).face, 1, 'then it looks at the camera')
  assert.ok(play(run, {}, 12).every(glance => glance.face === 1), 'and keeps looking')
  const leaving = play(run, { move: 1 }, .5)
  assert.ok(!standingIdle(run.player))
  assert.ok(leaving[0].face > .9 && leaving[5].face > 0 && leaving[5].face < .9, 'the head turns back rather than snapping')
  assert.ok(leaving.every((glance, i) => !i || glance.face <= leaving[i - 1].face))
  assert.equal(leaving[20].face, 0, 'and is in profile within a few frames')
  assert.ok(play(run, {}, 2.5).every(glance => glance.face === 0), 'standing again starts the wait again')
})

test('a robot stirring nearby takes the look away until it is quiet again', () => {
  const run = floor()
  play(run, {}, 4)
  let stirring = true
  const disturbed = play(run, {}, 1, () => stirring)
  assert.ok(standingIdle(run.player), 'the player has not moved')
  assert.ok(disturbed[0].face > .9 && disturbed.at(-1).face === 0)
  stirring = false
  const quiet = play(run, {}, 4, () => stirring)
  assert.equal(quiet[100].face, 0, 'the wait starts over')
  assert.equal(quiet.at(-1).face, 1)

  const player = { x: 0, y: 0 }, robot = { x: 300, y: 0, vx: 0, phase: 'patrol', seesPlayer: false }
  const stirs = change => robotsStir({ player, robots: [{ ...robot, ...change }] })
  assert.ok(!stirs({}), 'a robot standing its patrol is no event')
  assert.ok(stirs({ seesPlayer: true })); assert.ok(stirs({ vx: 80 })); assert.ok(stirs({ phase: 'windup' })); assert.ok(stirs({ actor: { vx: -120 } }))
  assert.ok(!stirs({ seesPlayer: true, x: 2000 }), 'nor is one far away')
  assert.ok(!stirs({ vx: 80, deactivated: true })); assert.ok(!stirs({ phase: 'chase', collapse: 1 }))
  assert.ok(!robotsStir({ player, robots: [] }))
})

test('the look is read from the run and never changes it', () => {
  const run = floor()
  play(run, {}, 3.5)
  const before = JSON.stringify(run.player), time = run.activeTime, glance = idleGlance(run.player, time)
  assert.ok(glance.face > 0)
  for (let i = 0; i < 5; i++) assert.deepEqual(idleGlance(run.player, time), glance, 'every composition pass of a frame draws the same head')
  assert.equal(JSON.stringify(run.player), before)
  for (const input of [{ crouch: true, descend: true }, { jump: true }, { climb: true }]) {
    const other = floor()
    play(other, {}, 3.5)
    play(other, input, .3)
    assert.ok(idleGlance(other.player, other.activeTime).face < .05, JSON.stringify(input))
  }
})

test('the head cocks on the top of its neck, so its crown swings aside and the neck stays put', () => {
  const run = floor()
  play(run, {}, .5)
  const pose = { ...presentedAthletePose(run.player), headTilt: .05 }
  // Where the neck artwork meets the head: 4 units below its centre, along the head's own axis.
  const joint = ({ head, headTilt }) => [head[0] - Math.sin(headTilt) * 4, head[1] + Math.cos(headTilt) * 4]
  for (const tilt of [.21, -.21, .1]) {
    const cocked = glancePose(pose, { face: 1, tilt })
    assert.equal(cocked.faceView, 1); assert.ok(Math.abs(cocked.headTilt - (.05 + tilt)) < 1e-12)
    joint(cocked).forEach((value, axis) => assert.ok(Math.abs(value - joint(pose)[axis]) < 1e-9, 'the neck joint does not move'))
    assert.equal(Math.sign(cocked.head[0] - pose.head[0]), Math.sign(tilt), 'the head leans to the side it cocks to')
    assert.ok(Math.abs(cocked.head[0] - pose.head[0]) > .3)
  }
  const level = glancePose(pose, { face: .5, tilt: 0 })
  assert.deepEqual(level.head, pose.head); assert.equal(level.faceView, .5)
  assert.deepEqual(glancePose(pose, { face: 1, tilt: .21 }).frontArm, pose.frontArm, 'only the head moves')
})
