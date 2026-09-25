import test from 'node:test'
import assert from 'node:assert/strict'
import { blankTrial } from '../src/games/jumping/level.ts'
import { createRun, stepRun } from '../src/games/jumping/challenge.ts'
import { NEUTRAL_INPUT } from '../src/games/jumping/model.ts'
import { ballShape } from '../src/games/jumping/propGeometry.ts'
import { exposedSide, platformSurface } from '../src/games/jumping/terrain.ts'
import { bodyIntersects } from '../src/games/jumping/geometry.ts'
import { athletePose } from '../src/games/jumping/athlete.ts'

// A beam, gate header and distant post share one terrain outline. The post
// extends to the floor, but there is empty space under the beam beside the gate.
const frame = { x: 700, y: 660, w: 400, h: 260,
  polygon: [[0,40],[380,40],[380,0],[400,0],[400,260],[380,260],[380,60],[100,60],[100,160],[80,160],[80,60],[0,60]] }
const mirrored = p => ({ ...p, x: 1800 - p.x - p.w, polygon: p.polygon.map(([x, y]) => [p.w - x, y]) })
const setup = (side, size = 30) => {
  const level = blankTrial(), wall = side === 1 ? 780 : 1020
  level.platforms = [side === 1 ? frame : mirrored(frame)]
  level.mechanisms = [{ id: 'gate', kind: 'gate', x: side === 1 ? wall : wall - 20, y: 820, w: 20, h: 100, travel: 100 }]
  level.props = [{ kind: 'ball', x: wall - side * size / 2, y: 920, size }]
  const run = createRun(level), p = run.player, ball = run.props[0], x = wall - side * 12.5
  Object.assign(p, { x, y: platformSurface(ballShape(ball), x).y, facing: side, footwork: null })
  run.started = true
  return { run, p, ball, wall }
}

test('a gate face below concave terrain stays exposed from either side', () => {
  for (const side of [1, -1]) for (const reverse of [false, true]) {
    const terrain = side === 1 ? frame : mirrored(frame)
    const outline = { ...terrain, polygon: reverse ? [...terrain.polygon].reverse() : terrain.polygon }
    const gate = { x: side === 1 ? 780 : 1000, y: 820, w: 20, h: 100 }
    assert.equal(exposedSide([outline, gate], gate, side, 844, 846), true)
    const cover = { x: side === 1 ? 750 : 1020, y: 830, w: 30, h: 50 }
    assert.equal(exposedSide([outline, gate, cover], gate, side, 844, 846), false, 'real covering geometry still blocks the hands')
  }
})

test('pushing a closed gate rolls a small supporting ball back under an overhang', () => {
  for (const side of [1, -1]) for (const size of [30, 40]) {
    const { run, p, ball, wall } = setup(side, size), start = ball.x
    let braced = false, reaction = false, handsOnGate = false
    for (let i = 0; i < 100; i++) {
      stepRun(run, { ...NEUTRAL_INPUT, move: side })
      braced ||= p.contacts.push?.collider.id === 'mechanism:0' && p.pushing?.effort > 0
      reaction ||= ball.vx * side < -20
      if (p.pushing?.amount === 1 && p.contacts.support?.collider.prop === ball) {
        const pose = athletePose(p)
        handsOnGate ||= [pose.frontArm, pose.backArm].every(arm => arm.hand && Math.abs(p.x + arm.hand[0] * side - wall) < 3)
      }
      assert.equal(p.mantle, null)
      assert.ok((p.x - wall) * side < 0, 'the gate keeps the player on the original side')
      assert.ok(run.platforms.every(b => !bodyIntersects(p.x, p.y, b)), 'the player does not clip through the gate or ball')
    }
    assert.ok(braced, 'the hands brace against the gate')
    assert.ok(handsOnGate, 'the bracing pose reaches the gate while standing on the ball')
    assert.ok(reaction, 'the supporting ball receives the opposite force')
    assert.ok((ball.x - start) * side < -8, 'the ball rolls away')
    assert.equal(run.mechanisms[0].y, 820, 'a shove does not open the gate')
  }
})

test('neutral contact beside the same gate leaves the supporting ball stationary', () => {
  for (const side of [1, -1]) {
    const { run, p, ball } = setup(side), start = ball.x
    for (let i = 0; i < 240; i++) {
      stepRun(run, NEUTRAL_INPUT)
      assert.ok(p.grounded)
      assert.equal(p.contacts.push, null)
    }
    assert.ok(Math.abs(ball.x - start) < .05)
    assert.ok(Math.abs(ball.vx) < .05)
  }
})

test('disjoint outer faces of one polygon do not fill its open side', () => {
  const shape = { x: 100, y: 100, w: 100, h: 200,
    polygon: [[0,0],[100,0],[100,200],[0,200],[0,180],[80,180],[80,20],[0,20]] }
  assert.equal(exposedSide([shape], shape, 1, 150, 160), false)
  assert.equal(exposedSide([shape], shape, 1, 110, 115), true)
  assert.equal(exposedSide([shape], shape, 1, 285, 290), true)
})
