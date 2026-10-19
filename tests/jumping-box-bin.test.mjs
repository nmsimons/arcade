import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import Matter from 'matter-js'
import { parseLevel } from '../src/games/jumping/level.ts'
import { createRun, stepRun } from './helpers/jumping-active-run.mjs'
import { NEUTRAL_INPUT, STEP } from '../src/games/jumping/model.ts'
import { boxShape } from '../src/games/jumping/propGeometry.ts'
import { bodyIntersects, nearestBoundary, pointInside, polygonIntersects, polygonPoints } from '../src/games/jumping/geometry.ts'
import { athletePose } from '../src/games/jumping/athlete.ts'
import { athleteOutlinePoints } from './helpers/jumpingAthleteOutline.mjs'
import { playerContactBody } from '../src/games/jumping/playerContacts.ts'

const fixture = () => parseLevel(JSON.parse(readFileSync(new URL('fixtures/jumping/box-bin.json', import.meta.url))))
function clear(run) {
  const shapes = run.props.map(boxShape)
  for (let i = 0; i < shapes.length; i++) {
    const points = polygonPoints(shapes[i])
    for (const other of [...run.terrain, ...shapes.slice(i + 1)]) {
      assert.equal(polygonIntersects(points, other, .05), false, `crate ${i} remains outside its neighbours and bin: ${JSON.stringify(other)}`)
    }
  }
}

test('the mixed-size heavy box bin settles and stays quiet', () => {
  const run = createRun(fixture())
  for (let f = 0; f < 480; f++) stepRun(run, NEUTRAL_INPUT)
  clear(run)
  const settled = run.props.map(({ x, y, angle }) => [x, y, angle])
  for (let f = 0; f < 600; f++) stepRun(run, NEUTRAL_INPUT)
  assert.deepEqual(run.props.map(({ x, y, angle }) => [x, y, angle]), settled)
  assert.ok(run.props.every(prop => prop.grounded && Math.hypot(prop.vx, prop.vy) < .01))
})

test('holding forward into the loaded bin keeps the coupled cargo and walls separate', t => {
  const level = fixture()
  level.entrance = { x: 630, y: 1620 }
  const run = createRun(level)
  for (let f = 0; f < 480; f++) stepRun(run, NEUTRAL_INPUT)
  const create = Matter.Collision.create
  let manifolds = 0, maxManifolds = 0
  t.mock.method(Matter.Collision, 'create', (...args) => { manifolds++; return create(...args) })
  let loaded = false
  for (let f = 0; f < 600; f++) {
    manifolds = 0
    stepRun(run, { ...NEUTRAL_INPUT, move: 1 })
    maxManifolds = Math.max(maxManifolds, manifolds)
    loaded ||= run.player.contacts.body.some(contact => contact.collider.prop && contact.load > 0 && Math.abs(contact.normal[0]) > .5)
    clear(run)
  }
  assert.ok(loaded, 'the player supplies a real side load to the mixed-weight stack')
  assert.ok(maxManifolds < 250, `ten loaded crates should not create hundreds of manifolds per tick (${maxManifolds})`)
})

function approachPile(side, x) {
  const level = fixture()
  level.entrance = { x, y: 1620 }
  if (side < 0) {
    level.entrance.x = level.width - x
    level.props = level.props.map(b => ({ ...b, x: level.width - b.x }))
    level.platforms = level.platforms.map(b => ({ ...b, x: level.width - b.x - b.w,
      ...(b.polygon ? { polygon: b.polygon.map(([x, y]) => [b.w - x, y]) } : {}) }))
  }
  const run = createRun(level)
  for (let f = 0; f < 480; f++) stepRun(run, NEUTRAL_INPUT)
  return run
}

for (const side of [-1, 1]) for (const dt of [STEP, 1 / 30]) {
  test(`a futile shove on the pile keeps its legs continuous without rapid shuffling (${side}, ${dt})`, () => {
    const run = approachPile(side, 630), p = run.player
    let previous, planted, starts = 0, braced = 0
    for (let f = 0; f < Math.round(15 / dt); f++) {
      stepRun(run, { ...NEUTRAL_INPUT, move: side, jump: f * dt < 22 * STEP }, dt)
      const pose = athletePose(p), legs = [pose.frontLeg, pose.backLeg]
      const points = legs.flatMap(leg => [leg.joint, leg.end]).map(([x, y]) => [p.x + x * side, p.y + y])
      if (f * dt >= 3) {
        assert.equal(p.contacts.support?.collider.prop, run.props[3])
        assert.equal(p.contacts.push?.collider.prop, run.props[8])
        braced++
        if (previous) for (const [i, point] of points.entries()) {
          assert.ok(Math.hypot(point[0] - previous[i][0], point[1] - previous[i][1]) < 180 * dt,
            `leg joint ${i} cannot jump between landing targets at frame ${f}`)
        }
        if (f * dt >= 5) starts += legs.filter((leg, i) => !leg.planted && planted?.[i]).length
      }
      previous = points; planted = legs.map(leg => leg.planted)
    }
    assert.ok(braced > 2 / dt, 'the encounter retains sustained physical pushing')
    assert.ok(starts <= 4, `ten seconds of blocked effort allow occasional balance steps without churning (${starts})`)
    stepRun(run, { ...NEUTRAL_INPUT, move: side, jump: true }, dt)
    assert.ok(!p.grounded && p.vy < 0, 'a fresh jump still leaves the blocked stance')
  })

  test(`jumping onto the loaded pile and pushing cannot jack its supporting crates upward (${side}, ${dt})`, () => {
    const run = approachPile(side, 630), heights = run.props.map(b => b.y)
    let braced = false
    for (let f = 0; f < Math.round(6 / dt); f++) {
      stepRun(run, { ...NEUTRAL_INPUT, move: side, jump: f * dt < 22 * STEP }, dt)
      braced ||= run.player.contacts.support?.collider.prop === run.props[3]
        && run.player.contacts.push?.collider.prop === run.props[8]
      clear(run)
      for (const [i, prop] of run.props.entries()) {
        assert.ok(heights[i] - prop.y < 2, `crate ${i} stays in its stack instead of floating upward`)
      }
    }
    assert.ok(braced, 'ordinary controls reach the LAB crate and push its upper neighbor')
    for (let f = 0; f < Math.round(3 / dt); f++) stepRun(run, NEUTRAL_INPUT, dt)
    assert.ok(run.props.every(b => b.grounded && Math.hypot(b.vx, b.vy) < .01), 'release lets the whole pile settle again')
  })

  test(`approaching the LAB crate keeps both palms on the near face and the rig together (${side}, ${dt})`, () => {
    const run = approachPile(side, 730), p = run.player
    let prepared = false
    for (let f = 0; f < Math.round(2 / dt); f++) {
      stepRun(run, { ...NEUTRAL_INPUT, move: side, jump: f * dt >= 20 * STEP && f * dt < 42 * STEP }, dt)
      if (!p.pushing?.palms) continue
      prepared = true
      const [front, back] = p.pushing.palms
      assert.ok(front.nx * side < -.5 && back.nx * side < -.5, 'both palms use a side face, including at its upper corner')
      assert.ok(Math.hypot(front.x - back.x, front.y - back.y) < 6, 'the hands cannot select opposite ends of a shallow top')
      const pose = athletePose(p)
      assert.ok(Math.abs(pose.hip[0]) < 20 && Math.abs(pose.shoulder[0]) < 30, 'the drawn body stays beside its physical root')
      assert.ok(Math.hypot(pose.head[0] - pose.shoulder[0], pose.head[1] - pose.shoulder[1]) < 12, 'head and shoulders stay connected')
    }
    assert.ok(prepared, 'the approach exercises the actual reaching pose')
  })

  for (const jumpAt of [0, 20 * STEP]) test(`the rendered jump and reaching limbs clear every crate (${side}, ${dt}, jump at ${jumpAt})`, () => {
    const run = approachPile(side, 700), p = run.player
    let airborne = false, reached = false
    for (let f = 0; f < Math.round(2 / dt); f++) {
      stepRun(run, { ...NEUTRAL_INPUT, move: side, jump: f * dt >= jumpAt && f * dt < jumpAt + 22 * STEP }, dt)
      airborne ||= !p.grounded
      reached ||= !!p.ledgeReach
      const body = playerContactBody(p)
      assert.ok(run.platforms.every(s => !bodyIntersects(body.x, body.y, s, body.height)), 'the collision hull stays clear too')
      for (const [dx, dy] of athleteOutlinePoints(p)) {
        const x = p.x + dx * p.facing, y = p.y + dy
        for (const solid of run.platforms) if (pointInside(solid, x, y)) {
          const depth = nearestBoundary(solid, x, y).distance
          // Rounded skin and the sampled corner clearance can differ by less
          // than one unit; the reported bad reaches penetrate by 3-40 units.
          assert.ok(depth <= .75,
            `drawn skin clears frame ${f}: depth ${depth}, point ${x}/${y}, root ${p.x}/${p.y}, hang ${!!p.hang}, slide ${!!p.sliding}`)
        }
      }
    }
    assert.ok(airborne, 'the route includes a normal held jump')
    if (jumpAt === 0) assert.ok(reached, 'the higher box receives an ordinary airborne hand reach')
  })
}
