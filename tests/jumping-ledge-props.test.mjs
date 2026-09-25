import test from 'node:test'
import assert from 'node:assert/strict'
import { blankTrial } from '../src/games/jumping/level.ts'
import { createRun, stepRun } from '../src/games/jumping/challenge.ts'
import { NEUTRAL_INPUT } from '../src/games/jumping/model.ts'
import { athletePose } from '../src/games/jumping/athlete.ts'
import { ballShape } from '../src/games/jumping/propGeometry.ts'
import { bodyIntersects, polygonIntersects, polygonPoints } from '../src/games/jumping/geometry.ts'

function setup(side, pinned = false, size = 30) {
  const level = blankTrial()
  level.platforms = [{ x: side === 1 ? 400 : 0, y: 300, w: 400, h: 620 }]
  if (pinned) level.platforms.push({ x: side === 1 ? 440 : 300, y: 0, w: 60, h: 300 })
  level.climbables.ropes = [{ x: 400, y: 300, length: 560, segments: 70 }]
  level.props = [{ kind: 'ball', x: 400 + side * 6, y: 300, size }]
  const run = createRun(level); run.started = true
  Object.assign(run.player, { x: 400 - side * 23, y: 410, grounded: false, facing: side, vx: 0, vy: 0 })
  return run
}
function step(run, input) {
  stepRun(run, { ...NEUTRAL_INPUT, ...input })
  const p = run.player, b = run.props[0]
  assert.ok(!bodyIntersects(p.x, p.y, ballShape(b)), 'the movement hull stays outside the ball')
  if (p.mantle) {
    const head = athletePose(p).head
    assert.ok(Math.hypot(p.x + head[0] * p.facing - b.x, p.y + head[1] - b.y + b.size / 2) >= b.size / 2 + 6.2 - .1,
      'the forward-leaning head also stays outside the ball')
  }
  assert.ok(!run.terrain.some(terrain => polygonIntersects(polygonPoints(ballShape(b)), terrain, .01)), 'the ball stays outside terrain')
}

test('a small ball on the rope exit is pushed aside by the climb on either face', () => {
  for (const side of [-1, 1]) {
    const run = setup(side), p = run.player
    let caught = false, mantled = false, pressed = false
    for (let i = 0; i < 300; i++) {
      step(run, { climb: true })
      caught ||= !!p.climbing; mantled ||= !!p.mantle
      pressed ||= p.contacts.body.some(c => c.collider.prop === run.props[0] && c.load > 0)
    }
    assert.ok(caught && mantled && pressed)
    assert.equal(p.climbing, null); assert.equal(p.hang, null); assert.equal(p.mantle, null)
    assert.ok(p.grounded); assert.equal(p.y, 300); assert.equal(p.x, 400 + side * 20)
    assert.ok((run.props[0].x - 400) * side > 50)
  }
})

test('a pinned ball pauses the climb without jitter and Down returns to a usable ledge hold', () => {
  for (const side of [-1, 1]) for (const size of [30, 60]) {
    const run = setup(side, true, size), p = run.player
    for (let i = 0; i < 300; i++) step(run, { climb: true })
    assert.ok(p.mantle, 'a blocked prop keeps the climb supported')
    const position = { x: p.x, y: p.y, time: p.mantle.time }
    for (let i = 0; i < 120; i++) {
      step(run, { climb: true })
      assert.deepEqual({ x: p.x, y: p.y, time: p.mantle.time }, position)
      assert.equal(p.mantle.edgeX, 400, 'prop collisions cannot move the gripped terrain edge')
    }
    for (let i = 0; i < 130; i++) step(run, { descend: true })
    assert.equal(p.mantle, null); assert.ok(p.hang)
    assert.equal(p.y, 374); assert.equal(p.x, 400 - side * 14)
    step(run, {})
    step(run, { jump: true, move: -side })
    assert.ok(p.hang)
    step(run, { move: -side })
    assert.equal(p.hang, null); assert.equal(p.climbing, null)
    assert.ok(p.vy < 0 && p.vx * side < 0, 'the player can jump away after retreating')
  }
})
