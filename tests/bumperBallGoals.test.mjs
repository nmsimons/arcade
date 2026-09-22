import assert from 'node:assert/strict'
import test from 'node:test'
import { createArena, crossedGoal, resolveFieldBoundary, stepPhysics } from '../src/games/bumperBall/physics.ts'

const world = (side, x, y, vx, vy = 0) => {
  const arena = createArena(), sign = side === 'left' ? -1 : 1
  const goal = arena.goals.find(goal => goal.side === side)
  const car = (x, side) => ({ pos: { x, y: 100 }, vel: { x: 0, y: 0 }, angle: 0, wheelAngle: 0, side })
  return { ...arena, bumpers: [], vehicle1: car(700, 'left'), vehicle2: car(900, 'right'),
    ball: { pos: { x: goal.pos.x - sign * x, y }, vel: { x: sign * vx, y: vy }, radius: 30 } }
}

for (const side of ['left', 'right']) {
  test(`${side} soccer goal has no pull and requires the entire ball over the line`, () => {
    const still = world(side, 80, 500, 0)
    const before = structuredClone(still.ball)
    stepPhysics(still, 0.1)
    assert.deepEqual(still.ball, before, 'a nearby stationary ball must not be sucked into the net')
    const shot = world(side, 5, 500, 180)
    assert.equal(stepPhysics(shot, 0.1), undefined, 'partially crossing the line is not a goal')
    assert.equal(stepPhysics(shot, 0.1)?.side, side)
  })

  test(`${side} fast shots score through the mouth, but posts and end walls bounce misses`, () => {
    const shot = world(side, 20, 500, 600)
    assert.equal(stepPhysics(shot, 0.1)?.side, side)
    for (const y of [370, 630, 250, 750]) {
      const miss = world(side, 60, y, 600)
      assert.equal(stepPhysics(miss, 0.15), undefined, `no score at y=${y}`)
      assert.ok(miss.ball.vel.x * (side === 'left' ? -1 : 1) < 0, 'post/wall reflects the shot')
    }
  })

  test(`${side} goal net contains the ball and cars, with an open entrance`, () => {
    const arena = world(side, 5, 500, 0), goal = arena.goals.find(goal => goal.side === side)
    const sign = side === 'left' ? -1 : 1
    for (const radius of [15, 30]) {
      const body = { pos: { x: goal.pos.x + sign * 20, y: 500 }, vel: { x: sign * 200, y: 0 } }
      assert.equal(resolveFieldBoundary(body, radius, arena.goals), false, 'goal mouth is open')
      body.pos.x = goal.pos.x + sign * 120
      assert.equal(resolveFieldBoundary(body, radius, arena.goals), true)
      assert.equal(body.pos.x, goal.pos.x + sign * (goal.depth - radius))
      body.pos.y = 620; body.vel.y = 100
      resolveFieldBoundary(body, radius, arena.goals)
      assert.ok(body.pos.y <= 630 - goal.postRadius - radius)
      assert.ok(body.vel.y < 0)
    }
  })
}

test('crossing checks use the swept goal-line position and reject inward or outside-mouth travel', () => {
  const goal = createArena().goals[0]
  assert.equal(crossedGoal(goal, { x: 100, y: 450 }, { x: -60, y: 500 }, 30), true)
  assert.equal(crossedGoal(goal, { x: -60, y: 500 }, { x: 100, y: 450 }, 30), false)
  assert.equal(crossedGoal(goal, { x: 100, y: 0 }, { x: -60, y: 450 }, 30), false)
  assert.equal(crossedGoal(goal, { x: -45, y: 500 }, { x: -60, y: 500 }, 30), false)
})
