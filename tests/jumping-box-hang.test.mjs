import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { blankTrial, parseLevel } from '../src/games/jumping/level.ts'
import { createRun, stepRun } from '../src/games/jumping/challenge.ts'
import { NEUTRAL_INPUT, TUNING } from '../src/games/jumping/model.ts'
import { platformLedges } from '../src/games/jumping/terrainLedges.ts'
import { bodyIntersects } from '../src/games/jumping/geometry.ts'

function settledBox({ size = 160, angle = .2, platform = false } = {}) {
  const level = blankTrial()
  if (platform) level.platforms = [{ x: 300, y: 700, w: 500, h: 20 }]
  level.props = [{ kind: 'box', x: 500, y: 400, size }]
  const run = createRun(level); run.started = true; run.props[0].angle = angle
  for (let i = 0; i < 480; i++) stepRun(run, NEUTRAL_INPUT)
  return run
}
function approach(run, side) {
  const b = run.props[0]
  Object.assign(run.player, { x: b.x - side * (b.size / 2 + 18), y: b.y - b.size + TUNING.hangReach,
    grounded: false, facing: side, vy: 20, vx: 0 })
  stepRun(run, NEUTRAL_INPUT)
}
function advance(run, frames, input = {}) {
  for (let i = 0; i < frames; i++) {
    stepRun(run, { ...NEUTRAL_INPUT, ...input })
    // Mantling uses the authored limb contacts rather than the standing hull.
    if (!run.player.mantle) assert.ok(!run.platforms.some(b => bodyIntersects(run.player.x, run.player.y, b)), 'the hanging or standing body stays clear')
  }
}

for (const direction of [-1, 1]) for (const approach of ['running', 'pushing']) for (const hold of [14, 22]) {
  test(`the first level box catches a ${approach} jump, hold ${hold}, direction ${direction}`, () => {
    const level = parseLevel(JSON.parse(readFileSync(new URL('../public/levels/jumping/Untitled.jump-level.json', import.meta.url))))
    if (direction < 0) level.spawn.x = level.width - level.spawn.x
    const run = createRun(level), p = run.player, b = run.props[0]
    let approached = false
    for (let tick = 0; tick < 500; tick++) {
      if ((b.x - p.x) * direction - b.size / 2 <= 80) { approached = true; break }
      stepRun(run, { ...NEUTRAL_INPUT, move: direction })
    }
    assert.ok(approached, 'normal movement reaches the box')
    if (approach === 'pushing') {
      advance(run, 120, { move: direction })
      assert.ok(p.pushing?.amount > .8, 'the jump starts from an ordinary working shove')
    }
    for (let tick = 0; tick < 180 && !p.hang; tick++) {
      stepRun(run, { ...NEUTRAL_INPUT, move: direction, jump: tick < hold })
      assert.ok(!run.platforms.some(solid => bodyIntersects(p.x, p.y, solid)), 'the airborne body clears the box')
    }
    assert.ok(p.hang, 'a reachable lip remains grabbable after ordinary player contact')
    assert.ok(Math.abs(b.angle) > 1e-7, 'the encounter exercises actual resting solver tilt')
    advance(run, 120)
    assert.ok(p.hang, 'the grip remains stable after releasing the movement and jump keys')
    advance(run, 180, { climb: true })
    assert.ok(p.grounded && !p.hang && !p.mantle, 'Up completes a normal pull-up onto the box')
    assert.ok(Math.abs(p.y - (b.y - b.size)) < .01, 'the player finishes on the actual box top')
  })
}

test('settled boxes support a lasting hang and climb from both sides, on floors and platforms', () => {
  for (const side of [-1, 1]) for (const platform of [false, true]) for (const angle of [.2, 1.55]) {
    const run = settledBox({ platform, angle }), b = run.props[0], p = run.player
    approach(run, side)
    assert.ok(p.hang, 'a box remains grabbable after falling and settling on a face')
    advance(run, 240)
    assert.ok(p.hang); assert.ok(Math.abs(p.y - (b.y - b.size + TUNING.hangReach)) < .001)
    advance(run, 180, { climb: true })
    assert.equal(p.hang, null); assert.equal(p.mantle, null); assert.ok(p.grounded)
    assert.ok(Math.abs(p.y - (b.y - b.size)) < .001)
  }
})

test('a box grip uses the usual drop and jump-away controls', () => {
  for (const side of [-1, 1]) for (const action of ['drop', 'jump']) {
    const run = settledBox(), p = run.player
    approach(run, side); advance(run, 60)
    if (action === 'jump') { advance(run, 24, { jump: true }); advance(run, 1, { move: -side }) }
    else advance(run, 1, { drop: true })
    assert.equal(p.hang, null); assert.ok(p.grabCooldown > 0)
    if (action === 'jump') assert.ok(p.vy < 0 && p.vx * side < 0)
    else assert.ok(p.vy > 0)
  }
})

test('short, falling, balancing, or tilted props never offer a stable box grip', () => {
  const small = settledBox({ size: 60, angle: 0 })
  assert.equal(platformLedges(small.platforms.at(-1)).length, 0)
  for (const condition of ['falling', 'tilted', 'balancing', 'ball']) {
    const level = blankTrial()
    if (condition === 'balancing') level.platforms = [{ x: 490, y: 700, w: 20, h: 220 }]
    level.props = [{ kind: condition === 'ball' ? 'ball' : 'box', x: 500, y: condition === 'falling' ? 500 : condition === 'balancing' ? 700 : 920, size: 160 }]
    const run = createRun(level); run.started = true
    if (condition === 'tilted') { run.props[0].angle = .15; run.props[0].y = 900 }
    stepRun(run, NEUTRAL_INPUT)
    assert.equal(platformLedges(run.platforms.at(-1)).length, 0, condition)
  }
})

test('a grip follows a flat moving box and releases when its support disappears', () => {
  const run = settledBox(), p = run.player, b = run.props[0]
  approach(run, 1); advance(run, 60)
  b.vx = 60
  advance(run, 12)
  assert.ok(p.hang); assert.ok(Math.abs(p.hang.edgeX - b.x + b.size / 2) < .001)
  b.y -= 30; b.vy = -60
  advance(run, 1)
  assert.equal(p.hang, null); assert.equal(p.mantle, null); assert.ok(p.grabCooldown > 0)
})
