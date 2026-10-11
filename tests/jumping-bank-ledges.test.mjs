import test from 'node:test'
import assert from 'node:assert/strict'
import { createRun, stepRun } from './helpers/jumping-active-run.mjs'
import { parseLevel, levelProblems } from '../src/games/jumping/level.ts'
import { NEUTRAL_INPUT } from '../src/games/jumping/model.ts'
import { playerContactBody } from '../src/games/jumping/playerContacts.ts'
import { bodyIntersects, nearestBoundary, pointInside } from '../src/games/jumping/geometry.ts'
import { ledgeObstacles, platformLedges } from '../src/games/jumping/terrainLedges.ts'
import { outwardBankLevel } from './helpers/jumpingBankLedges.mjs'
import { waterBindings } from './helpers/jumpingWaterBindings.mjs'
import { athleteSkin } from './helpers/jumpingSkin.mjs'

for (const device of ['controller', 'touch']) for (const direction of [-1, 1]) {
  test(`${device} swims to an outward bank and pulls onto its uphill lip, direction ${direction}`, () => {
    for (const lean of [1, 5, 20]) for (const uphill of [0, .05, .2]) {
      const level = parseLevel(outwardBankLevel(direction, lean, uphill))
      assert.deepEqual(levelProblems(level), [])
      const run = createRun(level), p = run.player, input = waterBindings(device)
      const bank = level.platforms[0], edgeX = bank.x + (direction > 0 ? lean : bank.w - lean)
      let caught = false, pulled = false
      const advance = (frames, intent = {}) => {
        input.set(intent)
        for (let tick = 0; tick < frames; tick++) {
          stepRun(run, input.sample()); caught ||= !!p.hang; pulled ||= !!p.mantle
          if (p.hang && p.hang.time > .25) {
            const body = playerContactBody(p)
            assert.ok(!bodyIntersects(body.x, body.y, bank, body.height), 'the physical hanging body clears the outward face')
          }
          if (p.hang && p.hang.time > .25 && tick % 16 === 0) for (const shape of athleteSkin(p)) for (const [x, y] of shape.points) {
            // The rounded loaded palm has subpixel contact on an inclined top.
            const skin = shape.name.endsWith(':palm') ? .06 : .02
            assert.ok(!pointInside(bank, x, y) || nearestBoundary(bank, x, y).distance <= skin, 'the rendered quiet grip clears the actual bank')
          }
        }
      }
      advance(120, { vertical: -1 }); advance(120)
      assert.ok(p.grounded && p.y === 920, 'release leaves a standing rest at the pool bottom')
      advance(960, { vertical: 1 })
      assert.ok(p.waterMotion && !p.grounded && p.y < 460 && !caught, 'ordinary Up swims to the surface before approaching the bank')
      for (let tick = 0; tick < 300 && !p.hang; tick++) advance(1, { move: direction, vertical: 1 })
      assert.ok(p.hang, `real swimming catches the bank: lean ${lean}, uphill ${uphill}`)
      assert.equal(p.hang.edgeX, edgeX); assert.equal(p.hang.edgeY, 380)
      advance(120)
      assert.ok(p.hang && p.vx === 0 && p.vy === 0, 'releasing the controls leaves a stable, quiet hang')
      advance(240, { vertical: 1 })
      assert.ok(caught && pulled, `real swimming catches and pulls up: lean ${lean}, uphill ${uphill}`)
      assert.ok(p.grounded && !p.hang && !p.mantle, 'the pull-up completes on the bank')
      assert.ok((p.x - edgeX) * direction > 0, 'the player lands inward of the real corner')
      assert.ok(Math.abs(p.y - (380 - (p.x - edgeX) * direction * uphill)) < .01, 'the landing follows the actual sloped top')
      assert.ok(!bodyIntersects(p.x, p.y, bank), 'the final standing body clears the bank')
    }
  })
}

for (const direction of [-1, 1]) test(`swimming up against an outward bank reaches its real lip, direction ${direction}`, () => {
  for (const lean of [5, 20]) {
    const level = outwardBankLevel(direction, lean, .05), pool = level.gravityPlates[0]
    // Water overlaps the terrain and covers the whole slanted outside face.
    pool.w += lean
    if (direction < 0) pool.x -= lean
    const run = createRun(parseLevel(level)), p = run.player
    for (let tick = 0; tick < 1440 && !p.hang; tick++) stepRun(run, { ...NEUTRAL_INPUT, move: direction, climb: true })
    assert.ok(p.hang, 'holding toward the bank while ascending catches the actual corner')
    assert.equal(p.hang.edgeY, 380)
    for (let tick = 0; tick < 120; tick++) stepRun(run, NEUTRAL_INPUT)
    assert.ok(p.hang && p.vx === 0 && p.vy === 0, 'the grip settles without a swim/catch loop')
    for (let tick = 0; tick < 240; tick++) stepRun(run, { ...NEUTRAL_INPUT, climb: true })
    assert.ok(p.grounded && !p.hang && !p.mantle, 'Up completes the water exit')
  }
})

for (const direction of [-1, 1]) test(`ordinary jumps retain the outward bank grip, direction ${direction}`, () => {
  const level = outwardBankLevel(direction, 10, .05), bank = level.platforms[0]
  const edgeX = bank.x + (direction > 0 ? 10 : bank.w - 10)
  level.gravityPlates = []; level.entrance = { x: edgeX - direction * 50, y: 600 }; level.goal.y = 600
  level.platforms.push({ x: 0, y: 600, w: level.width, h: 320 })
  const run = createRun(parseLevel(level)), p = run.player
  for (let tick = 0; tick < 180 && !p.hang; tick++) stepRun(run, { ...NEUTRAL_INPUT, move: direction, jump: tick < 18 })
  assert.ok(p.hang, 'a normal jump catches the same physical lip')
  for (let tick = 0; tick < 120; tick++) stepRun(run, NEUTRAL_INPUT)
  assert.ok(p.hang && !bodyIntersects(p.x, p.y, bank), 'the resting grip remains clear')
  for (let tick = 0; tick < 180; tick++) stepRun(run, { ...NEUTRAL_INPUT, climb: true })
  assert.ok(p.grounded && !p.hang && !p.mantle, 'Up completes the pull-up')
  assert.ok(Math.abs(p.y - (380 - (p.x - edgeX) * direction * .05)) < .01)
})

for (const direction of [-1, 1]) test(`running off an outward bank preserves departure momentum, direction ${direction}`, () => {
  for (const lean of [.1, 1, 5, 20, 80]) for (const uphill of [0, .05]) {
    const level = outwardBankLevel(direction, lean, uphill), bank = level.platforms[0]
    const edgeX = bank.x + (direction > 0 ? lean : bank.w - lean)
    level.gravityPlates = []; level.entrance = { x: edgeX + direction * 150, y: 380 - 150 * uphill }
    const run = createRun(parseLevel(level)), p = run.player
    let departureSpeed, departed = 0
    for (let tick = 0; tick < 240 && departed < 36; tick++) {
      const before = { grounded: p.grounded, vx: p.vx }
      stepRun(run, { ...NEUTRAL_INPUT, move: -direction })
      assert.ok(!bodyIntersects(p.x, p.y, bank), 'the departing body clears the actual bank')
      if (before.grounded && !p.grounded) departureSpeed = Math.abs(before.vx)
      if (departureSpeed === undefined) continue
      departed++
      assert.ok(!p.grounded && !p.sliding?.active && !p.hang && !p.mantle, 'leaving the lip remains ordinary free flight')
      assert.ok(-p.vx * direction >= departureSpeed - .01, `departure keeps running speed: lean ${lean}, uphill ${uphill}`)
    }
    assert.equal(departed, 36, 'normal running actually leaves the bank')
    assert.ok(departureSpeed > 400, 'the approach reaches full running speed')
    assert.ok((edgeX - p.x) * direction > 100, 'momentum carries the player away from the face')
  }
})

test('a flush cap and slanted wall offer the same water pull-up, without bridging real gaps', () => {
  for (const direction of [-1, 1]) for (const reverse of [false, true]) {
    const level = outwardBankLevel(direction, 20, .05), bank = level.platforms[0]
    const cutY = 400, cutX = 20 * (920 - cutY) / 540
    const cap = { ...bank, h: cutY - bank.y, polygon: [bank.polygon[0], bank.polygon[1],
      [direction > 0 ? bank.w : 0, cutY - bank.y], [direction > 0 ? cutX : bank.w - cutX, cutY - bank.y]] }
    const wall = { x: bank.x, y: cutY, w: bank.w, h: 920 - cutY,
      polygon: [[cutX, 0], [bank.w, 0], [bank.w, 920 - cutY], [0, 920 - cutY]]
        .map(([x, y]) => [direction > 0 ? x : bank.w - x, y]) }
    const edge = platformLedges(cap).find(e => e.side === direction)
    assert.deepEqual(ledgeObstacles([cap, wall], edge), [], 'the collinear supporting face is continuous')
    const separated = { ...wall, y: wall.y + .001 }
    assert.ok(ledgeObstacles([cap, separated], edge).includes(separated), 'a real gap keeps the lower wall as an obstacle')
    level.platforms = reverse ? [wall, cap] : [cap, wall]
    const run = createRun(parseLevel(level)), p = run.player
    for (let tick = 0; tick < 960; tick++) stepRun(run, { ...NEUTRAL_INPUT, climb: true })
    let caught = false, pulled = false
    for (let tick = 0; tick < 600; tick++) {
      stepRun(run, { ...NEUTRAL_INPUT, climb: true, move: direction })
      caught ||= !!p.hang; pulled ||= !!p.mantle
    }
    assert.ok(caught && pulled && p.grounded && !p.mantle, 'ordinary swimming completes the joined bank pull-up')
  }
})

test('outward banks still require a clear hanging body and keep real ceilings', () => {
  for (const direction of [-1, 1]) for (const kind of ['steep', 'body-blocked', 'ceiling']) {
    const lean = kind === 'steep' ? 100 : kind === 'body-blocked' ? 80 : 10
    const level = outwardBankLevel(direction, lean, 0), bank = level.platforms[0]
    const edgeX = bank.x + (direction > 0 ? lean : bank.w - lean)
    level.gravityPlates[0].w += lean
    if (direction < 0) level.gravityPlates[0].x -= lean
    if (kind === 'ceiling') level.platforms.push({ x: edgeX - 60, y: 325, w: 120, h: 20 })
    const edge = platformLedges(bank).find(e => e.side === direction)
    assert.equal(!!edge, kind !== 'steep', 'only modest outward faces offer a possible lip')
    const run = createRun(parseLevel(level)), p = run.player
    for (let tick = 0; tick < 960; tick++) stepRun(run, { ...NEUTRAL_INPUT, climb: true })
    let caught = false, pulled = false
    for (let tick = 0; tick < 600; tick++) {
      stepRun(run, { ...NEUTRAL_INPUT, climb: true, move: direction })
      caught ||= !!p.hang; pulled ||= !!p.mantle
    }
    assert.equal(caught, kind === 'ceiling', 'an obstructed hanging body remains a real miss')
    assert.equal(pulled, false, 'a ceiling never becomes part of the cleared supporting bank')
    if (kind === 'body-blocked') assert.ok((edgeX - p.x) * direction < 24, 'water reaches the lip; the actual body clearance rejects the catch')
    if (kind === 'ceiling') assert.ok(p.hang, 'the blocked pull retains its grip')
  }
})
