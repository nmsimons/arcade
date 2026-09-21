import assert from 'node:assert/strict'
import test from 'node:test'
import { createBuildings } from '../src/games/urbanFire/battlefield.ts'
import { createNavigator, clear, distance, angleDelta } from '../src/games/urbanFire/navigation.ts'
import { createTankBrain, createContact, driveTank, aimTank, observe, intercept, planTank, flyHelicopter } from '../src/games/urbanFire/ai.ts'

const makeTank = (x, y, role = 0) => ({ pos: { x, y }, vel: { x: 0, y: 0 }, angle: Math.PI / 2,
  turretAngle: Math.PI / 2, state: 'active', role, brain: createTankBrain(), trackOffset: 0,
  losTimeMs: 0, shootCooldown: 2000, recoil: 0 })
const jeepAt = (x, y) => ({ pos: { x, y }, vel: { x: 0, y: 0 }, state: 'active' })

test('tanks navigate five city entry routes, preserve hull clearance and establish firing lanes', () => {
  const walls = createBuildings(), route = createNavigator(walls), jeep = jeepAt(800, 950)
  for (const [x, y] of [[288, 32], [608, 32], [32, 198], [1568, 902], [1312, 1068]]) {
    const tank = makeTank(x, y), contact = createContact()
    let firstShot = null
    for (let i = 0; i < 900; i++) {
      observe(contact, jeep, [tank], walls, 1 / 30)
      const pos = { ...tank.pos }, angle = tank.angle
      driveTank(tank, [tank], contact, walls, route, 1 / 30)
      assert.ok(clear(pos, tank.pos, walls, 28), 'the whole hull stays clear of buildings')
      assert.ok(Math.abs(angleDelta(tank.angle, angle)) <= .95 / 30 + 1e-9)
      if (aimTank(tank, jeep, [tank], walls, 1 / 30)) { firstShot = i / 30; break }
    }
    assert.ok(firstShot !== null && firstShot < 25, `entry ${x},${y} must reach a firing lane`)
  }
})

test('aiming leads moving targets and honors reaction time, cover, turret rate and friendly lanes', () => {
  const tank = makeTank(200, 300), jeep = jeepAt(400, 300)
  jeep.vel.y = 50
  const target = intercept(tank.pos, jeep.pos, jeep.vel, 250), time = distance(tank.pos, target) / 250
  assert.ok(Math.abs(target.y - (jeep.pos.y + jeep.vel.y * time)) < .001)
  tank.turretAngle = 0; tank.shootCooldown = 0
  assert.equal(aimTank(tank, jeep, [tank], [], .1), null, 'reaction delay')
  assert.ok(tank.turretAngle <= .11 + 1e-9)
  for (let i = 0; i < 30; i++) aimTank(tank, jeep, [tank], [], 1 / 60)
  assert.ok(aimTank(tank, jeep, [tank], [], 1 / 60))
  const blocker = makeTank(300, 320, 1)
  assert.equal(aimTank(tank, jeep, [tank, blocker], [], 1 / 60), null)
  assert.equal(aimTank(tank, jeep, [tank], [{ x: 290, y: 200, width: 40, height: 200 }], 1 / 60), null)
  assert.equal(tank.losTimeMs, 0)
})

test('a squad spreads out and loses live knowledge of the player behind cover', () => {
  const a = makeTank(550, 800), b = makeTank(1000, 800, 1), contact = createContact()
  contact.pos = { x: 800, y: 800 }
  const route = createNavigator([])
  const planA = planTank(a, [a, b], contact, [], route); a.brain.goal = planA.goal
  const planB = planTank(b, [a, b], contact, [], route)
  assert.ok(distance(planA.goal, planB.goal) > 120)
  const jeep = jeepAt(750, 800), wall = [{ x: 650, y: 700, width: 30, height: 200 }]
  observe(contact, jeep, [a], [], .1)
  const reported = structuredClone(contact.pos)
  jeep.pos.x = 900
  observe(contact, jeep, [a], wall, 1)
  assert.deepEqual(contact.pos, reported)
  assert.equal(contact.age, 1)
  assert.deepEqual(jeep.pos, { x: 900, y: 800 }, 'planning never moves the player')
})

test('helicopters circle at standoff range, aim through clear lanes and remain inside the battlefield', () => {
  const jeep = jeepAt(800, 800), contact = createContact(); contact.pos = { ...jeep.pos }
  const heli = { pos: { x: 1020, y: 800 }, vel: { x: 0, y: 0 }, angle: Math.PI, orbit: 1,
    rotorAngle: 0, recoil: 0, shootCooldown: 0, losTimeMs: 0 }
  let shots = 0, minRange = Infinity
  for (let i = 0; i < 600; i++) {
    if (flyHelicopter(heli, jeep, contact, [], 1 / 30)) { shots++; heli.shootCooldown = 3000 }
    minRange = Math.min(minRange, distance(heli.pos, jeep.pos))
    assert.ok(heli.pos.x >= 20 && heli.pos.x <= 1580 && heli.pos.y >= 20 && heli.pos.y <= 1080)
  }
  assert.ok(minRange > 140, 'does not sit on top of the jeep')
  assert.ok(shots >= 3, 'can line up several strafing shots')
})

test('opposing tank routes yield and pass without overlapping hulls', () => {
  const a = makeTank(400, 500), b = makeTank(600, 500, 1), squad = [a, b]
  a.angle = 0; b.angle = Math.PI
  a.brain.path = [{ x: 700, y: 500 }]; b.brain.path = [{ x: 300, y: 500 }]
  a.brain.replan = b.brain.replan = 100
  const route = createNavigator([]), contact = createContact()
  for (let i = 0; i < 600; i++) {
    driveTank(a, squad, contact, [], route, 1 / 30)
    driveTank(b, squad, contact, [], route, 1 / 30)
    assert.ok(distance(a.pos, b.pos) >= 55)
  }
  assert.ok(a.pos.x > 550, 'priority tank gets through')
  assert.ok(distance(b.pos, { x: 600, y: 500 }) > 80, 'yielding tank resumes its route')
})
