import { createPlayer, stepPlayer } from './helpers/jumping-fixtures.mjs'
import test from 'node:test'
import assert from 'node:assert/strict'
import { STEP, NEUTRAL_INPUT, TUNING, cancelJumpInput, playerState, respawn, stepPlayer as stepController } from '../src/games/jumping/model.ts'
import { bodyIntersects, moveBody } from '../src/games/jumping/geometry.ts'
import { mirrorPlatform, mirrorPlayerState } from '../src/games/jumping/gravityFrame.ts'
import { athletePose } from '../src/games/jumping/athlete.ts'
import { FOOT_CONTACT, footPoint } from '../src/games/jumping/footwork.ts'

const floor = { x: 0, y: 620, w: 1000, h: 400 }
const wall = { x: 350, y: 0, w: 100, h: 620 }
const world = [floor, wall]
const airborne = (values = {}) => Object.assign(createPlayer(), { x: 338, y: 400, grounded: false, coyote: 0, vy: 100 }, values)
function advance(p, seconds, input = {}, platforms = world) {
  for (let t = 0; t < seconds - STEP / 2; t += STEP) stepPlayer(p, { ...NEUTRAL_INPUT, ...input }, STEP, platforms)
}

function cantedWall(cant, side, reverse = false) {
  const h = 600, lean = Math.tan(cant * Math.PI / 180) * h, w = Math.abs(lean) + 120
  const polygon = [[Math.max(0, -lean), 0], [w, 0], [w, h], [Math.max(0, lean), h]]
  const shape = { x: 350, y: 0, w, h, polygon: side === 1 ? polygon : polygon.map(([x, y]) => [w - x, y]) }
  if (reverse) shape.polygon.reverse()
  const face = shape.x + (side === 1 ? Math.max(0, -lean) + lean * 400 / h : w - Math.max(0, -lean) - lean * 400 / h)
  const contact = moveBody([face - side * 80, 400], [face + side * 20, 400], [shape])
  const p = airborne({ x: contact.x, y: contact.y, facing: side, vy: 0 })
  return { p, shape }
}

test('fresh wall jumps work on both leans up to thirty degrees from vertical, with either polygon winding', () => {
  for (const cant of [-30, -20, -5, 5, 20, 30]) for (const side of [-1, 1]) for (const reverse of [false, true]) {
    const { p, shape } = cantedWall(cant, side, reverse)
    advance(p, STEP, { move: side }, [shape])
    assert.ok(p.wallBrace?.active, `braces at ${cant} degrees on side ${side}`)
    const start = { x: p.x, y: p.y }
    advance(p, STEP, { jump: true, move: side }, [shape])
    assert.equal(p.wallJump?.direction, -side)
    assert.equal(p.vx, -side * TUNING.wallJumpPush)
    assert.ok(Math.abs(p.vy + TUNING.wallJumpSpeed - TUNING.gravity * STEP) < 1e-6)
    assert.ok((p.x - start.x) * side < 0 && p.y < start.y)
    assert.equal(bodyIntersects(p.x, p.y, shape), false)
    advance(p, .1, { jump: true, move: side }, [shape])
    assert.ok(p.vy < -300, 'holding still adds the normal bounded lift')
    assert.equal(bodyIntersects(p.x, p.y, shape), false)
  }
})

test('canted wall jumps require real exposed contact and do not turn ordinary slopes into walls', () => {
  for (const side of [-1, 1]) {
    for (const cant of [-45, -31, 31, 45]) {
      const { p, shape } = cantedWall(cant, side)
      advance(p, STEP, { move: side }, [shape])
      assert.equal(p.wallBrace, null)
      advance(p, STEP, { jump: true, move: side }, [shape])
      assert.equal(p.wallJump, null)
    }
    const { p, shape } = cantedWall(20, side)
    p.x -= side * 2
    advance(p, STEP, {}, [shape])
    advance(p, STEP, { jump: true }, [shape])
    assert.equal(p.wallJump, null, 'a gap cannot supply a wall jump')
    const stale = cantedWall(-20, side)
    advance(stale.p, STEP, { move: side }, [stale.shape])
    assert.ok(stale.p.wallBrace?.active)
    const moved = { ...stale.shape, x: stale.shape.x + side * 10 }
    advance(stale.p, STEP, { jump: true, move: side }, [moved])
    assert.equal(stale.p.wallJump, null, 'moving the wall away invalidates the old contact')
    const straightened = cantedWall(-20, side)
    advance(straightened.p, STEP, { move: side }, [straightened.shape])
    const vertical = { x: straightened.p.x + side * TUNING.width / 2 - (side === -1 ? 120 : 0), y: 0, w: 120, h: 600 }
    advance(straightened.p, STEP, { jump: true, move: side }, [vertical])
    assert.equal(straightened.p.wallJump?.direction, -side, 'a face that becomes vertical still supports the fresh jump')
  }
})

test('canted wall bracing and jumping also follow reversed gravity', () => {
  for (const cant of [-20, 20]) for (const side of [-1, 1]) {
    const { p, shape } = cantedWall(cant, side)
    mirrorPlayerState(p); p.inverted = true; p.gravity = -TUNING.gravity
    const terrain = [mirrorPlatform(shape)]
    const tick = input => stepController(p, { ...NEUTRAL_INPUT, ...input }, STEP, terrain, undefined, undefined, undefined, undefined, -TUNING.gravity)
    tick({ move: side })
    assert.ok(p.wallBrace?.active)
    const start = { x: p.x, y: p.y }
    tick({ jump: true, move: side })
    assert.equal(p.wallJump?.direction, -side)
    assert.ok((p.x - start.x) * side < 0 && p.y > start.y)
    assert.ok(p.vy > 450)
  }
})

test('canted walls accept a buffered fresh press but cannot turn a held jump into another jump', () => {
  for (const cant of [-25, 25]) for (const side of [-1, 1]) {
    const { p, shape } = cantedWall(cant, side)
    p.x -= side * 20; p.vx = side * 350
    advance(p, STEP, { jump: true, move: side }, [shape])
    advance(p, .1, { move: side }, [shape])
    assert.equal(p.wallJump?.direction, -side)
    assert.ok(p.vy < -400)
    const held = cantedWall(cant, side)
    held.p.jumpHeld = true
    advance(held.p, STEP, { jump: true, move: side }, [held.shape])
    assert.ok(held.p.wallBrace?.active)
    advance(held.p, .1, { jump: true, move: side }, [held.shape])
    assert.equal(held.p.wallJump, null)
  }
})

test('canted bracing keeps the rendered head and feet outside the actual wall', () => {
  for (const cant of [-30, -20, 20, 30]) for (const side of [-1, 1]) {
    const { p, shape } = cantedWall(cant, side)
    let wall
    for (let frame = 0; frame < 16; frame++) {
      advance(p, STEP, { move: side }, [shape])
      if (!frame) { assert.ok(p.wallBrace?.active); wall = structuredClone(p.wallBrace) }
      const pose = athletePose(p)
      const distance = (x, y) => (p.x + x * side - wall.wallX) * wall.normal[0] + (p.y + y - wall.wallY) * wall.normal[1]
      assert.ok(distance(...pose.head) > 6.2, `${cant}: head clears the wall`)
      for (const leg of [pose.frontLeg, pose.backLeg]) for (const point of FOOT_CONTACT) {
        const [x, y] = footPoint(point, leg.footAngle, leg.toeAngle)
        assert.ok(distance(leg.end[0] + x, leg.end[1] + y) > -.03, `${cant}: foot clears the wall`)
      }
      assert.equal(bodyIntersects(p.x, p.y, shape), false)
    }
  }
})

test('a fresh jump from either braced wall launches upward and away', () => {
  for (const side of [-1, 1]) for (const vy of [-300, 800]) {
    const p = airborne({ x: side === 1 ? 338 : 462, facing: side, vy })
    advance(p, .1, { move: side })
    assert.equal(playerState(p), 'Bracing')
    advance(p, STEP, { jump: true, move: side })
    assert.equal(playerState(p), 'Wall jump')
    assert.equal(p.vx, -side * TUNING.wallJumpPush)
    assert.equal(p.vy, -TUNING.wallJumpSpeed + TUNING.gravity * STEP)
    assert.equal(p.wallBrace, null)
    assert.equal(p.hang, null)
    assert.equal(p.buffer, 0)
  }
})

test('inset wall faces launch immediately in either orientation without penetration', () => {
  for (const side of [-1, 1]) {
    const points = [[0,0],[80,0],[80,520],[360,520],[360,600],[0,600]]
    const shape = { x: 100, y: 100, w: 360, h: 600, polygon: side === -1 ? points : points.map(([x,y]) => [360-x,y]) }
    const wallX = side === -1 ? 180 : 380
    const p = airborne({ x: wallX - side * TUNING.width / 2, y: 350, facing: side })
    advance(p, .08, { move: side }, [shape]); assert.ok(p.wallBrace?.active)
    const startX = p.x
    advance(p, STEP, { jump: true, move: side }, [shape])
    assert.equal(p.wallJump?.direction, -side); assert.equal(p.vx, -side * TUNING.wallJumpPush)
    assert.equal(p.vy, -TUNING.wallJumpSpeed + TUNING.gravity * STEP); assert.ok((p.x - startX) * side < 0)
    assert.equal(p.wallBrace, null); assert.equal(bodyIntersects(p.x, p.y, shape), false)
  }
})

test('holding toward the wall can trim a jump but cannot reverse its outward arc', () => {
  for (const side of [-1, 1]) {
    const p = airborne({ x: side === 1 ? 338 : 462, facing: side }); advance(p, .1)
    const start = { x: p.x, y: p.y }, outward = { ...p }
    advance(p, STEP, { jump: true, move: side })
    advance(outward, STEP, { jump: true, move: -side })
    advance(p, STEP, { move: side }); advance(outward, STEP, { move: -side })
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
  assert.ok(p.vx > 0); assert.equal(p.vy, -TUNING.wallJumpSpeed + TUNING.gravity * STEP)
  advance(p, .2, { move: 1 }, corridor)
  assert.ok(p.y < height - 65)
})

test('a held ground jump never becomes a wall jump', () => {
  const p = Object.assign(createPlayer(), { x: 280, y: 400, vx: 350 })
  const edge = [{ x: 0, y: 400, w: 300, h: 300 }, { x: 340, y: 0, w: 100, h: 1000 }]
  advance(p, .7, { jump: true, move: 1 }, edge)
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

test('wall jumps start at the same strength regardless of steering, then a hold adds lift', () => {
  for (const side of [-1, 1]) for (const move of [-1, 0, 1]) {
    const p = airborne({ x: side === 1 ? 338 : 462, y: 200, facing: side, vy: 0 })
    advance(p, STEP)
    advance(p, STEP, { jump: true, move })
    assert.ok(p.wallJump); assert.equal(p.vx, -side * TUNING.wallJumpPush)
    assert.ok(Math.abs(p.vy + TUNING.wallJumpSpeed - TUNING.gravity * STEP) < 1e-6)
    const vy = p.vy
    advance(p, STEP, { jump: true, move })
    assert.ok(p.vy < vy + TUNING.gravity * STEP, 'holding adds bounded lift after takeoff')
  }
})

test('wall holds build modest extra height, cap at full strength, and end permanently on release', () => {
  for (const side of [-1, 1]) {
    const jump = (hold, repress = false, strength) => {
      const p = airborne({ x: side === 1 ? 338 : 462, y: 200, facing: side, vy: 0 })
      advance(p, STEP)
      p.bestHeight = 0
      advance(p, STEP, { jump: true, jumpStrength: strength })
      assert.equal(p.vx, -side * TUNING.wallJumpPush)
      advance(p, hold, { jump: true, jumpStrength: strength })
      advance(p, STEP)
      assert.equal(p.jumpLift, null)
      advance(p, 1.5, { jump: repress })
      return p.bestHeight
    }
    const tap = jump(0), partial = jump(.08), full = jump(.2), preset = jump(0, false, 1)
    assert.ok(tap > 75 && tap < 85, tap)
    assert.ok(tap < partial && partial < full)
    assert.ok(full > 108 && full < 118, full)
    assert.equal(full, jump(.8))
    assert.ok(full <= preset && preset - full < 1)
    assert.equal(partial, jump(.08, true), 'a later airborne press cannot restart lift')
  }
})
