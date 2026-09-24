import { createPlayer, stepPlayer, PLATFORMS } from './helpers/jumping-fixtures.mjs'
import test from 'node:test'
import assert from 'node:assert/strict'
import { NEUTRAL_INPUT, STEP } from '../src/games/jumping/model.ts'
import { groundAt, platformSurface } from '../src/games/jumping/terrain.ts'
import { athletePose } from '../src/games/jumping/athlete.ts'
import { FOOT_CONTACT, footPoint } from '../src/games/jumping/footwork.ts'

const floor = { x: 0, y: 620, w: 1800, h: 400 }
const hill = { x: 300, y: 500, w: 700, h: 120, profile: [[0, 120], [240, 0], [400, 0], [700, 120]] }
const world = [floor, hill]
function at(x, terrain = world) {
  const p = createPlayer(); p.x = x; p.y = groundAt(terrain, x, 620, 200).y
  return p
}
function advance(p, seconds, input = {}, terrain = world) {
  for (let t = 0; t < seconds - STEP / 2; t += STEP) stepPlayer(p, { ...NEUTRAL_INPUT, ...input }, STEP, terrain)
}
function footClearance(p, leg, terrain) {
  return Math.min(...FOOT_CONTACT.map(point => {
    const sole = footPoint(point, leg.footAngle * leg.footFacing, leg.toeAngle * leg.footFacing)
    const x = p.x + (leg.end[0] + sole[0] * leg.footFacing) * p.facing
    const y = p.y + leg.end[1] + sole[1], ground = groundAt(terrain, x, p.y)
    return ground ? ground.y - y : Infinity
  }))
}

test('walk and run across ramps, crests and rough terrain in either direction without losing ground contact', () => {
  for (const [start, end] of [[280, 580], [580, 280], [2600, 4300], [4300, 2600]]) for (const speed of [.35, 1]) {
    const p = at(start, PLATFORMS), direction = Math.sign(end - start)
    for (let frame = 0; frame < 2200 && (end - p.x) * direction > 0; frame++) {
      const oldY = p.y
      stepPlayer(p, { ...NEUTRAL_INPUT, move: direction * speed }, STEP)
      assert.ok(p.grounded, `lost support at ${p.x}, ${p.y}`)
      assert.equal(p.hang, null); assert.equal(p.mantle, null)
      assert.ok(Math.abs(p.y - oldY) < 2, 'terrain transitions must be continuous')
      assert.ok(Math.abs(p.y - groundAt(PLATFORMS, p.x, p.y).y) < 1e-6)
      assert.equal(p.landing, 0, 'following a slope must not trigger landing animations')
    }
    assert.ok((end - p.x) * direction <= 0, `blocked before the end: ${p.x}`)
  }
})

test('slope feet maintain planted anchors and reach the ground without changing limb lengths', () => {
  for (const direction of [-1, 1]) for (const speed of [.35, 1]) {
    const p = at(direction === 1 ? 2650 : 4250, PLATFORMS)
    let previous, contacts = 0
    for (let i = 0; i < 1600 && p.x > 2600 && p.x < 4300; i++) {
      stepPlayer(p, { ...NEUTRAL_INPUT, move: direction * speed }, STEP)
      const pose = athletePose(p)
      for (const [j, leg] of [pose.frontLeg, pose.backLeg].entries()) {
        const foot = p.footwork.feet[j], clearance = footClearance(p, leg, PLATFORMS)
        assert.ok(clearance > -.08, `sole penetrated terrain at ${p.x}: ${clearance}`)
        assert.ok(Math.abs(Math.hypot(leg.joint[0] - leg.root[0], leg.joint[1] - leg.root[1]) - 15) < 1e-6)
        assert.ok(Math.abs(Math.hypot(leg.end[0] - leg.joint[0], leg.end[1] - leg.joint[1]) - 14.5) < 1e-6)
        if (leg.planted) {
          contacts++
          assert.ok(clearance < 1.5, `planted foot floated at ${p.x}: ${clearance}`)
          assert.ok(Math.hypot(p.x + leg.end[0] * p.facing - foot.x, p.y + leg.end[1] - foot.y) < .05, 'IK lost its planted target')
          if (previous?.[j].planted) {
            assert.equal(foot.anchorX, previous[j].anchorX)
            assert.equal(foot.anchorY, previous[j].anchorY)
          }
        }
      }
      previous = p.footwork.feet.map(foot => ({ ...foot }))
    }
    assert.ok(contacts > 300)
  }
})

test('stopping, turning, crouching and charging on either incline keep the body supported', () => {
  for (const x of [430, 800]) for (const direction of [-1, 1]) {
    const p = at(x)
    advance(p, .12, { move: direction * .35 }); advance(p, .8)
    const stopped = { x: p.x, y: p.y }
    advance(p, .5, { jump: true, crouch: true })
    assert.equal(p.x, stopped.x); assert.equal(p.y, stopped.y); assert.equal(p.charge, 1)
    assert.ok(p.footwork.feet.every(foot => foot.planted))
    for (const foot of p.footwork.feet) assert.ok(Math.abs(foot.angle - foot.groundAngle * foot.facing) < .001)
    advance(p, .12, { move: -direction * .35, jump: true })
    assert.ok(p.grounded); assert.equal(p.facing, -direction)
  }
})

test('jumps release slope support immediately and land on the surface from either direction', () => {
  for (const x of [420, 820]) for (const direction of [-1, 1]) {
    const p = at(x); advance(p, .15, { jump: true, move: direction * .35 })
    const launchY = p.y
    advance(p, STEP, { move: direction * .35 })
    assert.ok(!p.grounded && p.vy < 0); assert.equal(p.footwork, null)
    let rise = 0
    for (let i = 0; i < 200 && !p.grounded; i++) {
      advance(p, STEP, { move: direction * .35 }); rise = Math.max(rise, launchY - p.y)
    }
    assert.ok(rise > 80 && rise < 90); assert.ok(p.grounded)
    assert.ok(Math.abs(p.y - groundAt(world, p.x, p.y).y) < 1e-6)
  }
})

test('slope support does not bridge gaps or pull the player down a real drop', () => {
  const ramp = { x: 100, y: 500, w: 300, h: 200, profile: [[0, 100], [300, 0]] }
  for (const gap of [1, 40]) {
    const terrain = [ramp, { x: 400 + gap, y: 560, w: 200, h: 300 }], p = at(397, terrain)
    advance(p, .06, { move: 1 }, terrain)
    assert.ok(p.x > 400); assert.ok(!p.grounded); assert.equal(p.footwork, null)
    assert.ok(p.y < 510, 'the player must fall naturally toward the lower surface')
  }
})

test('a ramp cannot carry the standing player through a low ceiling', () => {
  const ceiling = { x: 330, y: 480, w: 170, h: 32 }, terrain = [...world, ceiling], p = at(320, terrain)
  advance(p, 1, { move: 1 }, terrain)
  assert.ok(p.x < 400 && p.grounded)
  assert.ok(p.y - 62 >= ceiling.y + ceiling.h - .01)
  assert.equal(p.y, platformSurface(hill, p.x).y)
})
