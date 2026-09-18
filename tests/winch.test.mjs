import assert from 'node:assert/strict'
import test from 'node:test'
import { updateHarpoon } from '../src/games/hardVacuum/harpoon.ts'
import { HARPOON_CABLE_LENGTH, HARPOON_TOW_REEL_SPEED } from '../src/games/hardVacuum/tuning.ts'

const rope = (ax, ay, bx, by, length) => {
  const points = Array.from({ length: 17 }, (_, i) => ({ x: ax + (bx - ax) * (i + 1) / 18, y: ay + (by - ay) * (i + 1) / 18 }))
  return { rope: points, ropePrev: structuredClone(points), segLen: length / 18 }
}
const setup = (length, state = 'attached', mass = 1) => {
  const ship = { pos: { x: 1000, y: 1000 }, vel: { x: 0, y: 0 }, radius: 15, angle: 0 }
  const body = { pos: { x: 1000 + length, y: 1000 }, vel: { x: 0, y: 0 }, radius: 23, mass }
  const hook = { current: { state, rock: body, pos: { ...body.pos }, vel: { x: 0, y: 0 }, maxLength: length, ropeLength: length, ...rope(1000, 1000, body.pos.x, body.pos.y, length) } }
  const args = {
    w: 3000, h: 2200, ship, shipRef: { current: ship }, rocks: [body], harpoonRef: hook,
    wrapX: x => x, wrapY: y => y, toroidalDelta: (ax, ay, bx, by) => ({ dx: bx - ax, dy: by - ay }),
    buildRopeBetween: rope, HARPOON_HOOK_MASS: 0.2, HARPOON_VISUAL_SLACK: 1.18, HARPOON_REEL_MIN_LEN: 22,
  }
  return { ship, body, hook, step: dt => updateHarpoon({ ...args, dt }) }
}

test('extended winches retract smoothly within one second, independent of frame rate', () => {
  for (const length of [162.5, 195, 227.5, 260]) for (const fps of [30, 60, 120]) {
    const { ship, body, hook, step } = setup(length, 'attached', 2)
    const centerOfMass = (ship.pos.x + 2 * body.pos.x) / 3
    for (let i = 0; i < fps * 2; i++) {
      const previous = hook.current.ropeLength, previousBodyX = body.pos.x
      step(1 / fps)
      const cable = hook.current
      assert.ok(previous - cable.ropeLength <= HARPOON_TOW_REEL_SPEED / fps + 1e-7, 'no instantaneous shortening')
      assert.ok(body.pos.x <= previousBodyX + 1e-7)
      assert.ok(previousBodyX - body.pos.x <= HARPOON_TOW_REEL_SPEED / fps + 1e-7, 'cargo moves smoothly at the reel rate')
      if (length === 260 && i + 1 === fps / 2) assert.ok(Math.abs(cable.ropeLength - 195) < 1e-7, 'maximum reach is halfway retracted at half a second')
      if (i + 1 === fps) assert.ok(Math.abs(cable.ropeLength - HARPOON_CABLE_LENGTH) < 1e-7, 'retraction finishes within one second')
      assert.ok(Math.abs(cable.segLen * (cable.rope.length + 1) - cable.ropeLength) < 1e-7, 'visible rope shortens with physical cable')
      assert.ok(Math.abs((ship.pos.x + 2 * body.pos.x) / 3 - centerOfMass) < 1e-7, 'winch pulls ship and cargo according to mass')
    }
    assert.equal(hook.current.state, 'attached')
    assert.equal(hook.current.ropeLength, HARPOON_CABLE_LENGTH)
    assert.equal(hook.current.maxLength, length, 'upgraded firing reach is retained')
    assert.ok(Math.abs(body.pos.x - ship.pos.x - HARPOON_CABLE_LENGTH) < 1e-7)
    const end = structuredClone([ship.pos, body.pos]); step(5)
    assert.deepEqual([ship.pos, body.pos], end, 'the winch stops at towing length')
  }
})

test('retraction starts only after attachment, including a hook that latches after deployment', () => {
  const { hook, body, step } = setup(260, 'deployed')
  body.pos.y += 70
  for (let i = 0; i < 60; i++) step(1 / 60)
  assert.equal(hook.current.state, 'deployed'); assert.equal(hook.current.ropeLength, 260)
  body.pos = { ...hook.current.pos }
  step(1 / 60)
  assert.equal(hook.current.state, 'attached'); assert.equal(hook.current.ropeLength, 260)
  step(1 / 60)
  assert.equal(hook.current.ropeLength, 260 - HARPOON_TOW_REEL_SPEED / 60)
})

test('the standard winch keeps its length, and slack cable never pushes cargo away', () => {
  const base = setup(130)
  base.step(5)
  assert.equal(base.hook.current.ropeLength, 130)
  assert.equal(base.body.pos.x - base.ship.pos.x, 130)
  const extended = setup(260)
  extended.body.pos.x = extended.ship.pos.x + 80
  const initial = structuredClone([extended.ship.pos, extended.body.pos])
  for (let i = 0; i < 600; i++) extended.step(1 / 60)
  assert.deepEqual([extended.ship.pos, extended.body.pos], initial)
  assert.equal(extended.hook.current.ropeLength, 130)
})
