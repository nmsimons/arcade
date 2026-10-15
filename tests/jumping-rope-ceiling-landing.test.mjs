import test from 'node:test'
import assert from 'node:assert/strict'
import { createPlayer, stepPlayer, NEUTRAL_INPUT, TUNING } from '../src/games/jumping/model.ts'
import { ropeGripDistance, ropePoint } from '../src/games/jumping/climbables.ts'
import { createGravityField, updateGravityField } from '../src/games/jumping/gravity.ts'
import { bodyPolygon, polygonIntersects } from '../src/games/jumping/geometry.ts'
import { playerTurnAngle } from '../src/games/jumping/ropeGravity.ts'
import { athletePose } from '../src/games/jumping/athlete.ts'
import { GameCamera } from '../src/games/jumping/camera.ts'
import { blankTrial } from '../src/games/jumping/level.ts'

const close = (a, b) => assert.ok(Math.abs(a - b) < .01, `${a} != ${b}`)
function ceilingScene(side = 1, dt = 1 / 120) {
  const p = createPlayer({ x: 1040 - side * 10, y: 1080 })
  Object.assign(p, { grounded: false, vx: side * 410, facing: -side })
  const terrain = [{ x: side === 1 ? 1140 : 580, y: 945, w: 360, h: 20 }]
  const world = { ladders: [], ropes: [{ x: 1040, y: 800, length: 305, segments: 39 }] }
  const field = createGravityField()
  updateGravityField(field, [{ id: 'g', x: side === 1 ? 1145 : 585, y: 965, w: 350, h: 120, gravity: -1, power: 'always' }], new Map(), true)
  const tick = (input = {}) => {
    stepPlayer(p, { ...NEUTRAL_INPUT, ...input }, dt, terrain, world, undefined, undefined, field)
    const hull = bodyPolygon(p.x, p.y, 62, p.inverted ? -1 : 1, playerTurnAngle(p))
    assert.ok(!terrain.some(b => polygonIntersects(hull, b, .01)), 'every rotated body clears the ceiling')
  }
  const pump = () => {
    const c = p.climbing
    if (!c?.rope) return c || p.releaseTurn || p.grounded ? 0 : side
    const d = ropeGripDistance(c)
    return Math.sign(ropePoint(c.rope, d)[0] - ropePoint(c.rope, d, true)[0]) || side
  }
  return { p, terrain, world, field, tick, pump }
}

test('ordinary gravity still lands upright after letting go of a rope over a platform', () => {
  const p = createPlayer({ x: 490, y: 400 }), terrain = [{ x: 400, y: 450, w: 300, h: 20 }]
  const world = { ladders: [], ropes: [{ x: 500, y: 100, length: 300, segments: 38 }] }
  p.grounded = false
  for (let i = 0; i < 60; i++) stepPlayer(p, NEUTRAL_INPUT, 1 / 120, terrain, world)
  assert.ok(p.climbing)
  for (let i = 0; i < 120; i++) stepPlayer(p, { ...NEUTRAL_INPUT, detach: true }, 1 / 120, terrain, world)
  assert.equal(p.inverted, false); assert.equal(p.grounded, true); close(p.y, 450)
})

for (const dt of [1 / 120, 1 / 30]) for (const side of [-1, 1]) {
  test(`letting go during the reverse turn settles onto the ceiling (${side}, ${1 / dt} Hz)`, () => {
    const s = ceilingScene(side, dt), { p } = s
    let released = false
    for (let i = 0; i < 8 / dt; i++) {
      if (p.climbing?.turn && (p.x - 1040) * side > 130 && Math.abs(p.climbing.turn.angle) > .4) released = true
      s.tick(released ? { detach: true } : { move: s.pump() })
      if (p.inverted && p.grounded) break
    }
    assert.ok(released, 'the release occurs before the hand-pivot turn finishes')
    assert.equal(p.inverted, true); assert.equal(p.grounded, true)
    assert.equal(p.climbing, null); assert.equal(p.releaseTurn, undefined); close(p.y, 965)
    const x = p.x
    for (let i = 0; i < .2 / dt; i++) s.tick({ move: side })
    assert.ok((p.x - x) * side > 5, 'ordinary ceiling walking remains available')
    s.tick({ jump: true })
    assert.equal(p.grounded, false); assert.ok(p.vy >= TUNING.jumpSpeed - Math.abs(p.gravity) * dt - .01)
  })

  test(`a blocked rope turn transfers automatically when the ceiling can support standing (${side}, ${1 / dt} Hz)`, () => {
    const s = ceilingScene(side, dt), { p } = s
    const camera = new GameCamera(), room = { ...blankTrial(), width: 2200, height: 2000, floor: 2000 }
    let previousView
    let transferred = false
    for (let i = 0; i < 8 / dt; i++) {
      const before = athletePose(p), wasHeld = !!p.climbing
      const worldPoint = ([x, y]) => [p.x + x * p.facing, p.y + y * (p.inverted ? -1 : 1)]
      const oldHands = [before.frontArm.end, before.backArm.end].map(worldPoint)
      s.tick({ move: transferred ? 0 : s.pump() })
      const view = camera.view(1280, 800, p, room, true, dt)
      if (previousView) assert.ok(Math.hypot(view.x - previousView.x, view.y - previousView.y) * view.zoom < 900 * dt,
        'the camera follows the continuous body through grip, release and ceiling footing')
      previousView = view
      if (wasHeld && p.releaseTurn) {
        const pose = athletePose(p), hands = [pose.frontArm.end, pose.backArm.end].map(worldPoint)
        for (let j = 0; j < 2; j++) assert.ok(Math.hypot(hands[j][0] - oldHands[j][0], hands[j][1] - oldHands[j][1]) < 1200 * dt + 2,
          'automatic release carries the held rig instead of snapping the hands into flight')
        const snapshot = structuredClone(p)
        athletePose(p); assert.deepEqual(p, snapshot, 'release-pose rendering remains read only')
      }
      transferred ||= !!p.releaseTurn
      if (p.inverted && p.grounded) break
    }
    assert.ok(transferred, 'real ceiling contact releases the blocked grip')
    assert.equal(p.inverted, true); assert.equal(p.grounded, true)
    assert.equal(p.climbing, null); assert.equal(p.releaseTurn, undefined); close(p.y, 965)
    for (let i = 0; i < 1 / dt; i++) s.tick()
    assert.equal(p.grounded, true, 'neutral input rests on the ceiling without recatching')
  })
}

test('a released turn cannot force a standing body into a passage without clearance', () => {
  const p = createPlayer({ x: 500, y: 500 })
  const terrain = [{ x: 400, y: 400, w: 300, h: 20 }, { x: 400, y: 455, w: 300, h: 20 }]
  Object.assign(p, { grounded: false, releaseTurn: { angle: -Math.PI / 2, target: -Math.PI } })
  // A horizontal body fits in this 35-unit tunnel; a standing body does not.
  p.y = 437
  const field = createGravityField()
  updateGravityField(field, [{ id: 'g', x: 0, y: 0, w: 1000, h: 1000, gravity: -1, power: 'always' }], new Map(), true)
  for (let i = 0; i < 120; i++) {
    stepPlayer(p, NEUTRAL_INPUT, 1 / 120, terrain, { ropes: [], ladders: [] }, undefined, undefined, field)
    assert.ok(!terrain.some(b => polygonIntersects(bodyPolygon(p.x, p.y, 62, 1, playerTurnAngle(p)), b, .01)))
  }
  assert.ok(p.releaseTurn); assert.equal(p.inverted, false)
})
