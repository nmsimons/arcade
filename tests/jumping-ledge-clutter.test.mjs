import test from 'node:test'
import assert from 'node:assert/strict'
import { blankTrial, levelProblems } from '../src/games/jumping/level.ts'
import { createRun, stepRun } from '../src/games/jumping/challenge.ts'
import { NEUTRAL_INPUT, STEP } from '../src/games/jumping/model.ts'
import { athletePose } from '../src/games/jumping/athlete.ts'
import { bodyIntersects, polygonIntersects, polygonPoints } from '../src/games/jumping/geometry.ts'
import { playerContactBody } from '../src/games/jumping/playerContacts.ts'
import { boxShape, ballShape } from '../src/games/jumping/propGeometry.ts'
import { robotHulls } from '../src/games/jumping/robotPhysics.ts'

function fixture(side, clutter = true) {
  const x = value => 700 + side * (500 - value)
  const level = { ...blankTrial(), width: 1400, height: 700, floor: 620,
    spawn: { x: x(260), y: 560 }, goal: { x: 1240, y: 620 },
    platforms: [
      { x: Math.min(x(200), x(500)), y: 520, w: 300, h: 100,
        polygon: (side === -1 ? [[0,100],[100,0],[300,0],[300,100]] : [[0,0],[200,0],[300,100],[0,100]]) },
      { x: Math.min(x(340), x(660)), y: 440, w: 320, h: 40 },
    ],
    props: clutter ? [{ kind: 'box', x: x(515), y: 620, size: 30 }, { kind: 'ball', x: x(545), y: 620, size: 30 }] : [],
    robots: clutter ? [{ x: x(620), y: 620, left: 400, right: 1000 }] : [],
  }
  assert.deepEqual(levelProblems(level), [])
  return createRun(level)
}
function advance(run, seconds, input = {}) {
  for (let i = 0; i < Math.round(seconds / STEP); i++) {
    stepRun(run, { ...NEUTRAL_INPUT, ...input })
    const grip = run.player.hang ?? run.player.mantle
    if (grip) {
      assert.equal(grip.edgeX, 700, 'contact cannot move the fixed terrain grip sideways')
      assert.equal(grip.edgeY, 520, 'contact cannot move the fixed terrain grip vertically')
      const body = playerContactBody(run.player)
      for (const prop of run.props) {
        const shape = prop.kind === 'box' ? boxShape(prop) : ballShape(prop)
        assert.equal(bodyIntersects(body.x, body.y, shape, body.height), false, 'the climb stays outside loose objects')
        for (const terrain of run.terrain) assert.equal(polygonIntersects(polygonPoints(shape), terrain, .03), false)
        for (const bot of run.robots) for (const hull of robotHulls(bot)) assert.equal(polygonIntersects(hull, shape, .03), false)
      }
    }
  }
}

for (const side of [-1, 1]) test(`a small box, ball and shovebot below a low ledge allow lowering and pulling up: ${side}`, () => {
  const run = fixture(side), p = run.player
  const botStart = run.robots[0].x
  for (let cycle = 0; cycle < 2; cycle++) {
    advance(run, cycle ? 2 : 4, { move: -side, crouch: true, descend: true, drop: true })
    assert.ok(p.hang, 'the folded legs clear the small box beneath the grip')
    const pose = athletePose(p)
    assert.ok(Math.abs(p.x + pose.frontArm.hand[0] * p.facing - (700 + side * 2)) < .01)
    advance(run, 1.5, { climb: true })
    assert.ok(p.grounded && p.crouching, 'Up completes the pull-up into the two-tile opening')
    assert.equal(p.y, 520)
  }
  assert.notEqual(run.robots[0].x, botStart, 'the bot approaches and loads the objects during the test')
})

for (const side of [-1, 1]) test(`jumping past a small box can catch and climb the ledge: ${side}`, () => {
  const level = fixture(side).level
  level.spawn = { x: 700 - side * 60, y: 620 }
  level.props = level.props.slice(0, 1); level.robots = []
  assert.deepEqual(levelProblems(level), [])
  const run = createRun(level)
  advance(run, .1, { jump: true })
  advance(run, 2, { move: side })
  assert.ok(run.player.hang, 'the standing hull must not reject a clear folded hang above the box')
  advance(run, 1.5, { climb: true })
  assert.ok(run.player.grounded && run.player.crouching)
  assert.equal(run.player.y, 520)
})

for (const kind of ['box', 'ball']) for (const side of [-1, 1]) test(`an incoming ${kind} cannot displace a fixed grip: ${side}`, () => {
  const run = fixture(side, false)
  run.level.props = [{ kind, x: 700 - side * 140, y: 620, size: 60 }]
  const withProp = createRun(run.level)
  advance(withProp, 4, { move: -side, crouch: true, descend: true, drop: true })
  assert.ok(withProp.player.hang)
  Object.assign(withProp.props[0], { x: 700 - side * 50, y: 620, vx: side * 160, vy: 0 })
  advance(withProp, 1)
  assert.ok(withProp.player.hang)
  advance(withProp, 1.5, { climb: true })
  if (kind === 'ball') assert.ok(withProp.player.grounded && withProp.player.crouching)
  else {
    assert.ok(withProp.player.mantle, 'a heavy box may block the pull, without dislodging the grip')
    advance(withProp, 1.5, { descend: true })
    assert.ok(withProp.player.hang, 'the blocked pull can return to the hold')
    advance(withProp, .1, { jump: true })
    advance(withProp, STEP, { move: -side })
    assert.equal(withProp.player.hang, null)
    assert.ok(withProp.player.vy < 0, 'jumping away remains available')
  }
})
