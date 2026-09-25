import test from 'node:test'
import assert from 'node:assert/strict'
import { createPlayer, stepPlayer, cancelJumpInput, NEUTRAL_INPUT, STEP } from '../src/games/jumping/model.ts'
import { bodyIntersects, pointInside, nearestBoundary } from '../src/games/jumping/geometry.ts'
import { athletePose } from '../src/games/jumping/athlete.ts'
import { staticContactWorld, translatePlayer } from '../src/games/jumping/playerContacts.ts'
import { FOOT_CONTACT, footPoint } from '../src/games/jumping/footwork.ts'

const floor = { x: -400, y: 0, w: 800, h: 80 }
const setup = (height, side = 1, x = 0) => ({
  p: createPlayer({ x, y: 0 }),
  terrain: [floor, { x: side === 1 ? 100 : -300, y: -height, w: 200, h: height }],
})
const tick = (p, terrain, input = {}, world = staticContactWorld(terrain)) =>
  stepPlayer(p, { ...NEUTRAL_INPUT, ...input }, STEP, terrain, undefined, undefined, world)
function approach(p, terrain, input = {}, world) {
  for (let i = 0; i < 180; i++) {
    tick(p, terrain, { move: 1, ...input }, world)
    if (p.mantle?.step) return true
  }
  return false
}

test('one and two tile terrain steps climb in either direction without penetrating any solid', () => {
  for (const height of [20, 40]) for (const side of [1, -1]) for (const start of [0, 88]) {
    const { p, terrain } = setup(height, side, start * side)
    assert.ok(approach(p, terrain, { move: side }))
    const duration = p.mantle.step.duration, vx = p.mantle.step.caught.vx
    let frames = 0
    while (p.mantle && frames++ < 100) {
      const x = p.x, y = p.y
      tick(p, terrain, { move: side })
      assert.ok((p.x - x) * side >= -.01, 'the root never backs away from the step')
      assert.ok(p.y <= y + .01, 'the rise is monotone')
      assert.ok(Math.hypot(p.x - x, p.y - y) < 9, 'no root teleport')
      assert.ok(terrain.every(b => !bodyIntersects(p.x, p.y, b)), 'including the supporting ledge')
      const pose = athletePose(p)
      for (const limb of [pose.frontArm, pose.backArm, pose.frontLeg, pose.backLeg]) {
        assert.ok([...limb.root, ...limb.joint, ...limb.end].every(Number.isFinite))
        assert.ok(Math.hypot(limb.end[0] - limb.joint[0], limb.end[1] - limb.joint[1]) <= 14.51)
      }
    }
    assert.ok(p.grounded && !p.mantle)
    assert.equal(p.y, -height)
    assert.equal(p.x, side * 112)
    assert.equal(p.vx, vx, 'resume the incoming movement speed')
    assert.ok(frames * STEP <= duration + STEP)
  }
})

test('three tile ledges retain deliberate jumping', () => {
  const { p, terrain } = setup(60)
  assert.equal(approach(p, terrain), false)
  assert.equal(p.y, 0)
  for (let i = 0; i < 42; i++) tick(p, terrain, { move: 1, jump: true })
  tick(p, terrain, { move: 1 })
  assert.ok(p.vy < -500 && !p.grounded)
})

test('two tile mantles need a sustained push at the face, while one tile steps remain immediate', () => {
  const low = setup(20, 1, 88)
  tick(low.p, low.terrain, { move: 1 })
  assert.ok(low.p.mantle?.step)
  const { p, terrain } = setup(40, 1, 88)
  for (let i = 0; i < 20; i++) {
    tick(p, terrain, { move: 1 })
    assert.equal(p.mantle, null, 'brief contact does not climb')
    assert.equal(p.y, 0)
  }
  for (let i = 0; i < 6; i++) tick(p, terrain, { move: 1 })
  assert.ok(p.mantle?.step, 'continuing to push starts the mantle')
})

test('releasing, reversing, jumping, or a light stick input cannot accumulate mantle intent', () => {
  for (const interruption of [{}, { move: -1 }, { move: .3 }, { move: 1, jump: true }]) {
    const { p, terrain } = setup(40, 1, 88)
    for (let i = 0; i < 18; i++) tick(p, terrain, { move: 1 })
    tick(p, terrain, interruption)
    assert.equal(p.stepIntent, null)
    assert.equal(p.mantle, null)
    if (interruption.jump) continue
    for (let i = 0; i < 18; i++) tick(p, terrain, { move: 1 })
    assert.equal(p.mantle, null, 'the hold must start over')
  }
  const { p, terrain } = setup(40, 1, 88)
  for (let i = 0; i < 90; i++) tick(p, terrain, { move: .3 })
  assert.equal(p.mantle, null)
})

test('stepping requires grounded directional intent and does not take over crouching or jump charging', () => {
  for (const input of [{}, { move: -1 }, { move: 1, crouch: true }, { move: 1, jump: true }, { move: 1, descend: true }]) {
    const { p, terrain } = setup(40, 1, 80)
    for (let i = 0; i < 25; i++) { tick(p, terrain, input); assert.equal(p.mantle?.step, undefined) }
  }
  const { p, terrain } = setup(40, 1, 80)
  Object.assign(p, { grounded: false, coyote: 0, y: -1, vy: -100 })
  tick(p, terrain, { move: 1 })
  assert.equal(p.mantle?.step, undefined)
})

test('boxes and moving mechanisms are not automatic terrain steps', () => {
  for (const id of ['prop:box', 'prop:ball', 'mechanism:gate', 'mechanism:lift']) {
    const { p, terrain } = setup(40)
    const world = staticContactWorld(terrain)
    world.colliders[1].id = id
    assert.equal(approach(p, terrain, {}, world), false)
    assert.equal(p.y, 0)
  }
})

test('low ceilings, occupied landings, short ledges and gaps prevent automatic climbs', () => {
  for (const variant of ['ceiling', 'landing', 'narrow', 'gap']) {
    const { p, terrain } = setup(40)
    if (variant === 'ceiling') terrain.push({ x: 50, y: -105, w: 220, h: 20 })
    if (variant === 'landing') terrain.push({ x: 117, y: -130, w: 100, h: 90 })
    if (variant === 'narrow') terrain[1].w = 10
    if (variant === 'gap') terrain[0] = { ...floor, w: 480 }
    assert.equal(approach(p, terrain), false, variant)
  }
})

test('stairs work in one polygon and as separate terrain blocks', () => {
  for (const joined of [false, true]) {
    const terrain = joined ? [{ x: -200, y: -60, w: 600, h: 120,
      polygon: [[0,60],[300,60],[300,40],[360,40],[360,20],[420,20],[420,0],[600,0],[600,120],[0,120]] }]
      : [floor, { x: 100, y: -20, w: 60, h: 20 }, { x: 160, y: -40, w: 60, h: 40 }, { x: 220, y: -60, w: 180, h: 60 }]
    const p = createPlayer(), climbs = new Set()
    for (let i = 0; i < 130; i++) {
      tick(p, terrain, { move: 1 })
      if (p.mantle?.step) climbs.add(p.mantle.edgeY)
      assert.ok(terrain.every(b => !bodyIntersects(p.x, p.y, b)))
    }
    assert.deepEqual([...climbs], [-20, -40, -60])
    assert.equal(p.y, -60)
    assert.ok(p.x > 240)
  }
})

test('a new obstacle interrupts a step safely rather than phasing through it', () => {
  const { p, terrain } = setup(40)
  assert.ok(approach(p, terrain))
  terrain.push({ x: 100, y: -120, w: 40, h: 80 })
  for (let i = 0; i < 80; i++) {
    tick(p, terrain, { move: 1 })
    assert.ok(terrain.every(b => !bodyIntersects(p.x, p.y, b)))
  }
  assert.equal(p.mantle, null)
  assert.ok(p.x < 100)
})

test('a tap or held jump during a short mantle is preserved', () => {
  for (const held of [false, true]) {
    const { p, terrain } = setup(40)
    assert.ok(approach(p, terrain))
    tick(p, terrain, { move: 1, jump: true })
    for (let i = 0; i < 100 && p.mantle; i++) tick(p, terrain, { move: 1, jump: held })
    if (held) {
      assert.ok(p.charging)
      for (let i = 0; i < 15; i++) tick(p, terrain, { move: 1, jump: true })
      tick(p, terrain, { move: 1 })
    }
    assert.ok(p.vy < -250 && !p.grounded)
  }
})

test('pausing clears a jump queued during a step', () => {
  const { p, terrain } = setup(40)
  assert.ok(approach(p, terrain))
  tick(p, terrain, { move: 1, jump: true })
  cancelJumpInput(p)
  for (let i = 0; i < 100 && p.mantle; i++) tick(p, terrain)
  assert.ok(p.grounded && !p.charging)
  assert.equal(p.vy, 0)
})

test('external displacement interrupts a terrain step without shifting its destination', () => {
  const { p, terrain } = setup(40)
  assert.ok(approach(p, terrain))
  const x = p.x
  translatePlayer(p, -3, 0)
  assert.equal(p.x, x - 3)
  assert.equal(p.mantle, null)
  assert.ok(p.grabCooldown > 0)
  tick(p, terrain)
  assert.ok(terrain.every(b => !bodyIntersects(p.x, p.y, b)))
})

test('step animation keeps planted soles fixed and toes outside the riser, without a torso snap', () => {
  for (const height of [20, 40]) for (const side of [1, -1]) {
    const { p, terrain } = setup(height, side)
    assert.ok(approach(p, terrain, { move: side }))
    let previous = null
    for (let i = 0; i < 60; i++) {
      const pose = athletePose(p), head = [p.x + pose.head[0] * side, p.y + pose.head[1]]
      if (previous) assert.ok(Math.hypot(head[0] - previous[0], head[1] - previous[1]) < 8)
      previous = head
      if (!p.mantle) break
      for (const leg of [pose.frontLeg, pose.backLeg]) {
        const x = p.x + leg.end[0] * side, y = p.y + leg.end[1]
        if (leg.planted && x * side > 100) assert.ok(Math.abs(y + 2.8 + height) < .02, 'the supporting ankle stays on top')
        for (const point of FOOT_CONTACT) {
          const sole = footPoint(point, leg.footAngle * leg.footFacing, leg.toeAngle * leg.footFacing)
          const sx = x + sole[0] * side * leg.footFacing, sy = y + sole[1]
          for (const b of terrain) if (pointInside(b, sx, sy)) assert.ok(nearestBoundary(b, sx, sy).distance < .1)
        }
      }
      tick(p, terrain, { move: side })
    }
  }
})
