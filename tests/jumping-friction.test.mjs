import test from 'node:test'
import assert from 'node:assert/strict'
import { createPlayer, stepPlayer, STEP, NEUTRAL_INPUT, TUNING } from '../src/games/jumping/model.ts'
import { bodyIntersects } from '../src/games/jumping/geometry.ts'
import { platformSurface } from '../src/games/jumping/terrain.ts'
import { canGrip, groundVelocity, slidingVelocity, TERRAIN_FRICTION } from '../src/games/jumping/friction.ts'
import { spawnProblem, snapToGround } from '../src/games/jumping/level.ts'
import { athletePose } from '../src/games/jumping/athlete.ts'

function ramp(degrees, polygon = true) {
  const rise = 2000 * Math.tan(Math.abs(degrees) * Math.PI / 180)
  const top = degrees > 0 ? [[0, 0], [2000, rise]] : [[0, rise], [2000, 0]]
  return { x: 0, y: 100, w: 2000, h: rise + 200,
    ...(polygon ? { polygon: [...top, [2000, rise + 200], [0, rise + 200]] } : { profile: top }) }
}
function on(shape, x = 1000) {
  const p = createPlayer({ x, y: platformSurface(shape, x).y })
  p.grabCooldown = 100
  return p
}
function tick(p, shape, input = {}) {
  stepPlayer(p, { ...NEUTRAL_INPUT, ...input }, STEP, [shape])
  assert.ok(!bodyIntersects(p.x, p.y, shape), 'terrain must never penetrate the body')
}

test('flat terrain retains running acceleration, top speed and stopping distance', () => {
  const shape = ramp(0), p = on(shape)
  let expectedX = p.x, expectedSpeed = 0
  for (let i = 0; i < 80; i++) {
    const moving = i < 50
    expectedSpeed = moving ? Math.min(TUNING.runSpeed, expectedSpeed + TUNING.acceleration * STEP)
      : Math.max(0, expectedSpeed - TUNING.braking * STEP)
    expectedX += expectedSpeed * STEP
    tick(p, shape, { move: Number(moving) })
    assert.equal(p.vx, expectedSpeed); assert.equal(p.x, expectedX); assert.ok(p.grounded)
  }
})

test('steeper walkable slopes reduce uphill traction and speed, with symmetric controls', () => {
  for (const direction of [-1, 1]) for (const polygon of [false, true]) {
    let previousAcceleration = Infinity, previousSpeed = Infinity
    for (const degrees of [0, 15, 30, 40, 45, 46]) {
      const shape = ramp(-direction * degrees, polygon), p = on(shape)
      tick(p, shape, { move: direction })
      assert.ok(p.vx * direction < previousAcceleration)
      previousAcceleration = p.vx * direction
      for (let i = 0; i < 120; i++) tick(p, shape, { move: direction })
      assert.ok(p.vx * direction < previousSpeed)
      previousSpeed = p.vx * direction
      assert.ok(p.grounded && !p.sliding?.active)
    }
  }
})

test('crossing 45 degrees has no special effect on footing, braking, or jumping', () => {
  for (const direction of [-1, 1]) for (const polygon of [false, true]) {
    const speeds = []
    for (const degrees of [44.99, 45, 45.01, 46]) {
      const shape = ramp(direction * degrees, polygon), p = on(shape)
      const start = { x: p.x, y: p.y }
      for (let i = 0; i < 120; i++) tick(p, shape)
      assert.ok(p.grounded && !p.sliding?.active)
      assert.deepEqual({ x: p.x, y: p.y }, start)
      for (let i = 0; i < 120; i++) tick(p, shape, { move: -direction })
      speeds.push(Math.abs(p.vx))
      for (let i = 0; i < 120; i++) tick(p, shape)
      assert.ok(p.grounded && p.vx === 0 && !p.sliding?.active)
      for (let i = 0; i < 45; i++) tick(p, shape, { jump: true })
      tick(p, shape)
      assert.ok(!p.grounded && !p.sliding?.active && p.vy < -700)
    }
    assert.ok(Math.abs(speeds[0] - speeds[2]) < 2, 'climbing speed must be continuous across 45 degrees')
  }
})

test('grip balance, rather than a fixed angle, controls stable starts and slip onset', () => {
  for (const friction of [{ grip: .5, sliding: .3 }, TERRAIN_FRICTION, { grip: 1.3, sliding: .8 }]) {
    const balance = Math.atan(friction.grip)
    for (const direction of [-1, 1]) {
      const before = direction * (balance - .0001), after = direction * (balance + .0001)
      assert.ok(canGrip(before, friction)); assert.ok(!canGrip(after, friction))
      assert.equal(slidingVelocity(0, before, TUNING.gravity, STEP, friction), 0)
      const slipping = slidingVelocity(0, after, TUNING.gravity, STEP, friction)
      assert.ok(slipping * direction > 0 && Math.abs(slipping) < .003, 'slip starts without a velocity kick')
      assert.ok(Math.abs(groundVelocity(0, -direction * 350, before, TUNING.acceleration, STEP, friction)) < .25)
      assert.equal(groundVelocity(0, -direction * 350, after, TUNING.acceleration, STEP, friction), 0)
    }
  }
  for (const degrees of [46, 48]) {
    const shape = ramp(degrees), p = on(shape)
    const level = { width: 2200, height: shape.y + shape.h + 100, platforms: [shape], spawn: { x: p.x, y: p.y } }
    if (degrees === 46) {
      assert.equal(spawnProblem(level), null)
      assert.deepEqual(snapToGround(level, p.x, p.y - 10), level.spawn)
    } else assert.match(spawnProblem(level), /grip/)
  }
})

test('a resting player near the grip balance starts slipping gently without contact flicker', () => {
  const balance = Math.atan(TERRAIN_FRICTION.grip) * 180 / Math.PI
  for (const direction of [-1, 1]) for (const polygon of [false, true]) {
    for (const offset of [-.001, .001]) {
      const shape = ramp(direction * (balance + offset), polygon), p = on(shape), startX = p.x
      for (let i = 0; i < 240; i++) {
        tick(p, shape)
        if (offset < 0) assert.ok(p.grounded && !p.sliding?.active)
        else assert.ok(p.sliding?.active && !p.grounded)
        assert.ok(Math.abs(p.vx) < .2, 'a barely unbalanced load should not suddenly become a fast slide')
      }
      if (offset < 0) assert.equal(p.x, startX)
      else assert.ok((p.x - startX) * direction > 0 && Math.abs(p.x - startX) < .5)
    }
  }
})

test('a slide continues across a gentler surface until friction restores a stable footing', () => {
  for (const polygon of [false, true]) {
    const h1 = 400 * Math.tan(55 * Math.PI / 180), h2 = h1 + 400 * Math.tan(40 * Math.PI / 180)
    const h3 = h2 + 800 * Math.tan(20 * Math.PI / 180), points = [[0, 0], [400, h1], [800, h2], [1600, h3]]
    const shape = { x: 0, y: 100, w: 1600, h: h3 + 200,
      ...(polygon ? { polygon: [...points, [1600, h3 + 200], [0, h3 + 200]] } : { profile: points }) }
    const p = on(shape, 300)
    Object.assign(p, { grounded: false, vx: 350 * Math.cos(55 * Math.PI / 180), vy: 350 * Math.sin(55 * Math.PI / 180) })
    let slidingBelow45 = false, recovered = false
    for (let i = 0; i < 700; i++) {
      tick(p, shape)
      if (p.x > 410 && p.x < 790 && p.sliding?.active) slidingBelow45 = true
      if (p.x > 800 && p.grounded && Math.abs(p.vx) < .01) recovered = true
      if (recovered) assert.ok(p.grounded && !p.sliding?.active && Math.abs(p.vx) < .01,
        `recovery at frame ${i}, polygon ${polygon}: x=${p.x}, vx=${p.vx}, grounded=${p.grounded}, sliding=${p.sliding?.active}`)
    }
    assert.ok(slidingBelow45 && recovered)
  }
})

test('sliding momentum can defeat static footing, then settle without a mode flicker', () => {
  for (const direction of [-1, 1]) for (const degrees of [20, 40]) for (const polygon of [false, true]) {
    const shape = ramp(direction * degrees, polygon), p = on(shape), angle = direction * degrees * Math.PI / 180
    Object.assign(p, { grounded: false, vx: direction * 200 * Math.cos(angle), vy: direction * 200 * Math.sin(angle),
      sliding: { angle, amount: 1, time: 1, active: true, x: p.x, y: p.y } })
    let stopped = false
    for (let i = 0; i < 120; i++) {
      tick(p, shape)
      if (degrees === 40) assert.ok(p.sliding?.active && !p.grounded, 'existing sliding momentum prevents instant grip')
      else if (p.grounded || stopped) {
        stopped = true
        assert.ok(p.grounded && !p.sliding?.active && Math.abs(p.vx) < .01)
      }
    }
    if (degrees === 20) assert.ok(stopped)
    else assert.ok(p.vx * direction > 300)
  }
})

test('uphill landings regain support and preserve only tangential momentum', () => {
  for (const direction of [-1, 1]) for (const polygon of [false, true]) {
    const shape = ramp(-direction * 35, polygon), p = on(shape)
    Object.assign(p, { y: p.y - .02, grounded: false, vx: direction * 600, vy: -200 })
    const energy = p.vx ** 2 + p.vy ** 2
    tick(p, shape, { move: direction })
    assert.ok(p.grounded, 'upward world velocity must not prevent landing on an uphill slope')
    assert.ok(p.footwork, 'the landing must restore foot placement')
    assert.ok((p.vx / Math.cos(35 * Math.PI / 180)) ** 2 <= energy)
    for (let i = 0; i < 120; i++) {
      tick(p, shape, { move: direction })
      assert.ok(p.grounded, 'holding uphill must not revert to airborne steering')
    }
    assert.ok(Math.abs(p.vx) <= TUNING.runSpeed * Math.cos(35 * Math.PI / 180) + .01)
  }
})

test('steep slopes allow a brief uphill coast, then friction and gravity overcome held uphill input', () => {
  for (const direction of [-1, 1]) for (const degrees of [48, 55, 65]) for (const polygon of [false, true]) {
    const shape = ramp(-direction * degrees, polygon), p = on(shape)
    Object.assign(p, { grounded: false, vx: direction * 600, vy: -200 })
    tick(p, shape, { move: direction })
    assert.ok(p.sliding?.active)
    assert.ok(p.vx * direction > 0, 'contact must not reverse incoming uphill momentum')
    const firstSpeed = Math.hypot(p.vx, p.vy)
    let coastFrames = 0, reversed = false
    for (let i = 0; i < 200; i++) {
      const previousSpeed = Math.hypot(p.vx, p.vy)
      tick(p, shape, { move: direction })
      assert.ok(p.sliding?.active, 'friction contact must persist between frames')
      assert.equal(p.grounded, false)
      if (p.vx * direction > 0) {
        coastFrames++
        assert.ok(Math.hypot(p.vx, p.vy) < previousSpeed, 'uphill sliding must lose momentum')
      } else reversed = true
    }
    assert.ok(firstSpeed > 50 && coastFrames > 5 && reversed)
    assert.ok(p.vx * direction < -100, 'holding uphill cannot motor up a surface without grip')
  }
})

test('sliding friction slows downhill acceleration and a jump releases contact immediately', () => {
  for (const direction of [-1, 1]) {
    const shape = ramp(direction * 55), p = on(shape)
    p.grounded = false
    tick(p, shape)
    const startSpeed = Math.hypot(p.vx, p.vy)
    for (let i = 0; i < 60; i++) tick(p, shape)
    const freeSlide = TUNING.gravity * Math.sin(55 * Math.PI / 180) * STEP * 60
    const gain = Math.hypot(p.vx, p.vy) - startSpeed
    assert.ok(gain > 100 && gain < freeSlide * .7, 'surface friction must resist gravity-driven sliding')
    tick(p, shape, { jump: true })
    assert.ok(!p.sliding?.active && !p.grounded && p.vy < 0)
    const vy = p.vy
    tick(p, shape, { jump: true })
    assert.ok(!p.sliding?.active)
    assert.ok(Math.abs(p.vy - vy - TUNING.gravity * STEP) < .00001, 'airborne motion has no surface friction')
  }
})

test('holding uphill at the base of a steep slope stays supported without vibrating and still permits jumping', () => {
  for (const direction of [-1, 1]) for (const degrees of [47, 55, 57, 70, 80]) for (const polygon of [false, true]) {
    const rise = 400 * Math.tan(degrees * Math.PI / 180), floor = { x: 0, y: rise + 100, w: 2000, h: 200 }
    const top = direction > 0 ? [[0, rise], [400, 0]] : [[0, 0], [400, rise]]
    const shape = { x: 600, y: 100, w: 400, h: rise + 100,
      ...(polygon ? { polygon: [...top, [400, rise + 100], [0, rise + 100]] } : { profile: top }) }
    const p = createPlayer({ x: direction > 0 ? 550 : 1050, y: floor.y }), terrain = [floor, shape]
    let previous
    for (let i = 0; i < 360; i++) {
      stepPlayer(p, { ...NEUTRAL_INPUT, move: direction }, STEP, terrain)
      const head = athletePose(p).head
      if (i > 150) {
        assert.ok(p.grounded && !p.sliding?.active, `contact toggled on ${degrees}° terrain`)
        assert.ok(Math.abs(p.x - previous.x) < .001 && Math.abs(p.y - previous.y) < .001)
        assert.ok(Math.hypot(head[0] - previous.head[0], head[1] - previous.head[1]) < .01, 'the blocked pose must not vibrate')
      }
      previous = { x: p.x, y: p.y, head }
    }
    for (let i = 0; i < 45; i++) stepPlayer(p, { ...NEUTRAL_INPUT, move: direction, jump: true }, STEP, terrain)
    stepPlayer(p, { ...NEUTRAL_INPUT, move: direction }, STEP, terrain)
    assert.ok(!p.grounded && p.vy < -700, 'floor support must release immediately on jumping')
    assert.ok(!terrain.some(b => bodyIntersects(p.x, p.y, b)))
  }
})

test('a gentle slope joined to a steep face keeps a stable stance in either direction', () => {
  for (const low of [15, 22, 40]) for (const high of [48, 55, 58, 70, 80])
    for (const direction of [-1, 1]) for (const polygon of [false, true]) {
      const gentle = 600 * Math.tan(low * Math.PI / 180), steep = 200 * Math.tan(high * Math.PI / 180)
      const height = gentle + steep + 200
      let top = [[0, gentle + steep], [600, steep], [800, 0], [1100, 0]]
      if (direction < 0) top = top.map(([x, y]) => [1100 - x, y]).reverse()
      const shape = { x: 100, y: 100, w: 1100, h: height,
        ...(polygon ? { polygon: [...top, [1100, height], [0, height]] } : { profile: top }) }
      const p = on(shape, 650), context = `${low}° into ${high}°, direction ${direction}, polygon ${polygon}`
      let previous
      for (let i = 0; i < 420; i++) {
        tick(p, shape, { move: direction })
        const pose = athletePose(p), points = [pose.head, pose.frontArm.end, pose.backArm.end, pose.frontLeg.end, pose.backLeg.end]
        if (i > 180) {
          assert.ok(p.grounded && !p.sliding?.active, `contact must stay supported: ${context}`)
          assert.ok(Math.hypot(p.x - previous.x, p.y - previous.y) < .001, `root must stay still: ${context}`)
          for (const [j, point] of points.entries())
            assert.ok(Math.hypot(point[0] - previous.points[j][0], point[1] - previous.points[j][1]) < .01,
              `limbs must not vibrate: ${context}`)
        }
        previous = { x: p.x, y: p.y, points }
      }
      const stopped = { x: p.x, y: p.y }
      for (let i = 0; i < 60; i++) tick(p, shape)
      assert.ok(p.grounded && !p.sliding?.active)
      assert.ok(Math.hypot(p.x - stopped.x, p.y - stopped.y) < .001, 'releasing input must preserve the stance')
      for (let i = 0; i < 60; i++) tick(p, shape, { move: -direction })
      assert.ok((p.x - stopped.x) * direction < -30 && p.grounded, 'walking away must release the corner')
      for (let i = 0; i < 240; i++) tick(p, shape, { move: direction })
      for (let i = 0; i < 45; i++) tick(p, shape, { move: direction, jump: true })
      tick(p, shape, { move: direction })
      assert.ok(!p.grounded && !p.sliding?.active && p.vy < -700, `jump must release the corner: ${context}`)
    }
})
