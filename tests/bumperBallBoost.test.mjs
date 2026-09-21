import assert from 'node:assert/strict'
import test from 'node:test'
import { BOOST_DURATION, BOOST_COOLDOWN, BOOST_MAX_SPEED, boostLaneClear, createBoost, startBoost, updateBoost } from '../src/games/bumperBall/boost.ts'
import { createArena, stepPhysics } from '../src/games/bumperBall/physics.ts'

const car = (angle = 0) => ({ pos: { x: 950, y: 500 }, vel: { x: 0, y: 0 }, angle, wheelAngle: 0, side: 'right' })

test('boost starts immediately in the facing direction, preserves drift, and cannot stack', () => {
  const vehicle = car(Math.PI / 2), boost = createBoost()
  vehicle.vel.x = 75
  assert.equal(startBoost(boost, vehicle), true)
  assert.ok(vehicle.vel.y > 100)
  assert.ok(Math.abs(vehicle.vel.x - 75) < 1e-10)
  const velocity = { ...vehicle.vel }
  assert.equal(startBoost(boost, vehicle), false)
  assert.deepEqual(vehicle.vel, velocity)
  updateBoost(boost, vehicle, BOOST_DURATION)
  assert.ok(Math.abs(vehicle.vel.y - BOOST_MAX_SPEED) < 1e-10)
})

test('the burst lasts half a second and recharges for three seconds afterward, including partial frames', () => {
  const vehicle = car(), boost = createBoost()
  startBoost(boost, vehicle)
  updateBoost(boost, vehicle, 0.3)
  assert.equal(boost.cooldownRemaining, BOOST_COOLDOWN)
  assert.ok(boost.activeRemaining > 0)
  updateBoost(boost, vehicle, 0.4)
  assert.equal(boost.activeRemaining, 0)
  assert.ok(Math.abs(boost.cooldownRemaining - 2.8) < 1e-10)
  const velocity = { ...vehicle.vel }
  updateBoost(boost, vehicle, 2.7)
  assert.deepEqual(vehicle.vel, velocity, 'cooldown adds no thrust')
  assert.equal(startBoost(boost, vehicle), false)
  updateBoost(boost, vehicle, 0.11)
  assert.deepEqual(boost, createBoost())
  assert.equal(startBoost(boost, vehicle), true)
  assert.equal(boost.activeRemaining, BOOST_DURATION)
})

test('boost reaches the ball earlier and makes a stronger hit through the real collision physics', () => {
  function kickoff(boosting) {
    const player = car(Math.PI), boost = createBoost()
    const world = { ...createArena(), bumpers: [], vehicle2: player,
      vehicle1: { ...car(), pos: { x: 100, y: 100 }, side: 'left' },
      ball: { pos: { x: 800, y: 500 }, vel: { x: 0, y: 0 }, radius: 30 } }
    if (boosting) startBoost(boost, player)
    let hit
    for (let tick = 0; tick < 180 && !hit; tick++) {
      player.vel.x -= 350 / 60
      updateBoost(boost, player, 1 / 60)
      stepPhysics(world, 1 / 60, { bump() {}, wallBounce() {}, kick(vehicle) {
        if (vehicle === player) hit = { seconds: tick / 60, speed: Math.hypot(world.ball.vel.x, world.ball.vel.y) }
      } })
    }
    assert.ok(hit, 'the car must actually contact the ball')
    return hit
  }
  const normal = kickoff(false), boosted = kickoff(true)
  assert.ok(boosted.seconds < normal.seconds * 0.6)
  assert.ok(boosted.speed > normal.speed * 1.5)
})

test('a boosted car cannot pass through an oncoming ball during a slow frame', () => {
  const player = car(), boost = createBoost()
  player.pos = { x: 500, y: 500 }
  startBoost(boost, player)
  updateBoost(boost, player, BOOST_DURATION)
  const world = { ...createArena(), bumpers: [], vehicle2: player,
    vehicle1: { ...car(), pos: { x: 100, y: 100 }, side: 'left' },
    ball: { pos: { x: 560, y: 500 }, vel: { x: -600, y: 0 }, radius: 30 } }
  let contacts = 0
  stepPhysics(world, 0.1, { bump() {}, wallBounce() {}, kick() { contacts++ } })
  assert.ok(contacts > 0, 'resolve the crossing even when the final positions no longer overlap')
  assert.ok(world.ball.vel.x > 0, 'the boost should knock the ball forward')
})

test('computer boost clearance accounts for walls, bumpers and the opposing car', () => {
  const player = car()
  player.pos = { x: 800, y: 500 }
  const world = { ...createArena(), bumpers: [], vehicle1: player,
    vehicle2: { ...car(), pos: { x: 100, y: 100 } },
    ball: { pos: { x: 920, y: 500 }, vel: { x: 0, y: 0 }, radius: 30 } }
  assert.equal(boostLaneClear(world, player), true, 'the ball is an intended target, not an obstacle')
  world.bumpers.push({ pos: { x: 930, y: 530 }, radius: 20, hitTimer: 0 })
  assert.equal(boostLaneClear(world, player), false)
  world.bumpers = []
  world.vehicle2.pos = { x: 950, y: 525 }
  assert.equal(boostLaneClear(world, player), false)
  world.vehicle2.pos = { x: 100, y: 100 }
  player.pos.x = 1470
  assert.equal(boostLaneClear(world, player), false)
})
