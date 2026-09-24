import { createPlayer, stepPlayer } from './helpers/jumping-fixtures.mjs'
import test from 'node:test'
import assert from 'node:assert/strict'
import { STEP, NEUTRAL_INPUT, TUNING, cancelJumpInput, playerState, respawn } from '../src/games/jumping/model.ts'

const floor = { x: 0, y: 620, w: 1000, h: 400 }
const wall = { x: 350, y: 0, w: 100, h: 620 }
const world = [floor, wall]
const airborne = (values = {}) => Object.assign(createPlayer(), { x: 338, y: 400, grounded: false, coyote: 0, vy: 100 }, values)
function advance(p, seconds, input = {}, platforms = world) {
  for (let t = 0; t < seconds - STEP / 2; t += STEP) stepPlayer(p, { ...NEUTRAL_INPUT, ...input }, STEP, platforms)
}

test('a fresh jump from either braced wall launches upward and away', () => {
  for (const side of [-1, 1]) for (const vy of [-300, 800]) {
    const p = airborne({ x: side === 1 ? 338 : 462, facing: side, vy })
    advance(p, .1, { move: side })
    assert.equal(playerState(p), 'Bracing')
    advance(p, STEP, { jump: true, move: side })
    assert.equal(playerState(p), 'Wall jump')
    assert.equal(p.vx, -side * TUNING.wallJumpPush)
    assert.ok(p.vy < -530)
    assert.equal(p.wallBrace, null)
    assert.equal(p.charging, false)
    assert.equal(p.hang, null)
    assert.equal(p.buffer, 0)
  }
})

test('holding toward the wall can trim a jump but cannot reverse its outward arc', () => {
  for (const side of [-1, 1]) {
    const p = airborne({ x: side === 1 ? 338 : 462, facing: side }); advance(p, .1)
    const start = { x: p.x, y: p.y }, outward = { ...p }
    advance(p, STEP, { jump: true, move: side })
    advance(outward, STEP, { jump: true, move: -side })
    let crossedApex = false
    for (let frame = 0; frame < 120; frame++) {
      advance(p, STEP, { move: side })
      advance(outward, STEP, { move: -side })
      assert.ok(p.vx * side < 0, 'counter-steering must not turn the kick back toward its wall')
      assert.equal(p.wallBrace, null)
      if (p.vy >= 0) crossedApex = true
      if (p.vy > 0 && p.y >= start.y) break
    }
    assert.ok(crossedApex)
    assert.ok(p.y >= start.y, 'the check must cover the entire arc back to launch height')
    assert.ok((start.x - p.x) * side > 140)
    assert.ok((p.x - outward.x) * side > 45, 'air control still makes a useful adjustment to the landing point')
  }
})

test('ordinary airborne steering makes gradual adjustments without instantly reversing a running jump', () => {
  const p = airborne({ x: 200, y: 500, vx: 350, vy: -455 })
  advance(p, .5, { move: -1 }, [])
  assert.ok(p.vx > 150 && p.vx < 250)
  assert.ok(p.x > 320)
  const q = airborne({ x: 200, y: 500, vy: -455 })
  advance(q, .2, { move: 1 }, [])
  assert.ok(q.vx > 30 && q.vx < 90, 'a standing jump can still be nudged in the air')
})

test('a fresh airborne tap is buffered on approach, but an old or cancelled press cannot jump', () => {
  const p = airborne({ x: 312, vx: 350 })
  advance(p, STEP, { jump: true, move: 1 })
  advance(p, .09, { move: 1 })
  assert.ok(p.wallJump && p.vx < 0 && p.vy < -450)
  for (const cancelled of [false, true]) {
    const q = airborne({ x: cancelled ? 312 : 220, vx: 350, y: 350, vy: 0 })
    advance(q, STEP, { jump: true, move: 1 })
    if (cancelled) cancelJumpInput(q)
    advance(q, .35, { move: 1 })
    assert.equal(q.wallJump, null)
    assert.equal(q.x, 338)
    assert.ok(q.vy > 0)
  }
})

test('holding jump cannot chain bounces; a new press can jump from the opposite wall', () => {
  const corridor = [floor, { x: 0, y: 0, w: 100, h: 620 }, { x: 300, y: 0, w: 100, h: 620 }]
  const p = airborne({ x: 288, y: 500 })
  advance(p, STEP, {}, corridor)
  advance(p, STEP, { jump: true, move: -1 }, corridor)
  advance(p, .64, { jump: true, move: -1 }, corridor)
  assert.equal(p.x, 112)
  assert.equal(p.wallJump, null)
  assert.ok(p.vy > 0)
  advance(p, STEP, { move: -1 }, corridor)
  const height = p.y
  advance(p, STEP, { jump: true, move: -1 }, corridor)
  assert.equal(p.wallJump?.direction, 1)
  assert.ok(p.vx > 0 && p.vy < -530)
  advance(p, .2, { move: 1 }, corridor)
  assert.ok(p.y < height - 65)
})

test('ground charges carried off a ledge never become wall jumps', () => {
  const p = Object.assign(createPlayer(), { x: 280, y: 400, vx: 350 })
  const edge = [{ x: 0, y: 400, w: 300, h: 300 }, { x: 340, y: 0, w: 100, h: 1000 }]
  advance(p, .5, { jump: true, move: 1 }, edge)
  assert.equal(p.wallJump, null)
  assert.equal(p.wallJumpBuffer, 0)
  assert.ok(p.vy > 0)
})

test('a kick respects ceilings, and landing and respawn clear its impulse', () => {
  const p = airborne({ y: 500 })
  advance(p, STEP)
  advance(p, STEP, { jump: true }, [...world, { x: 250, y: 420, w: 100, h: 18 }])
  assert.equal(p.vy, 0)
  assert.equal(p.y, 500)
  advance(p, 1)
  assert.equal(p.grounded, true)
  assert.equal(p.wallJump, null)
  Object.assign(p, airborne())
  advance(p, STEP); advance(p, STEP, { jump: true })
  respawn(p)
  assert.equal(p.wallJump, null)
  assert.equal(p.wallJumpBuffer, 0)
  assert.equal(p.vx, 0)
})
