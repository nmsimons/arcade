import test from 'node:test'
import assert from 'node:assert/strict'
import { blankTrial, parseLevel } from '../src/games/jumping/level.ts'
import { addItem, duplicateItem, hitItem, itemOutline, moveItem, resizeItem, setElevatorTravel } from '../src/games/jumping/editor.ts'
import { mechanismAnchor, mechanismLabel, mechanismOpenPosition, mechanismShape } from '../src/games/jumping/mechanisms.ts'
import { createRun, stepRun } from '../src/games/jumping/challenge.ts'
import { NEUTRAL_INPUT, STEP } from '../src/games/jumping/model.ts'
import { bodyIntersects, polygonIntersects, polygonPoints } from '../src/games/jumping/geometry.ts'
import { boxShape, ballShape } from '../src/games/jumping/propGeometry.ts'

function fixture(flipX = false) {
  return { ...blankTrial(), spawn: { x: 100, y: 920 },
    mechanisms: [{ id: 'ferry', kind: 'lift', orientation: 'horizontal', flipX, x: 700, y: 700, w: 160, h: 20, travel: 300 }],
    triggers: [{ mode: 'touch', x: 50, y: 920, w: 100, targets: ['ferry'] }] }
}
function start(level = fixture()) {
  const run = createRun(level); run.started = true
  return run
}
function trace(run, seconds, check = () => {}, dt = STEP) {
  const m = run.mechanisms[0], turns = []
  for (let i = 0; i < Math.round(seconds / dt); i++) {
    const direction = m.direction
    stepRun(run, NEUTRAL_INPUT, dt)
    const shape = mechanismShape(m)
    assert.equal(m.y, m.definition.y, 'horizontal travel never changes height')
    for (const solid of [...run.terrain, ...run.mechanisms.slice(1).map(mechanismShape)]) {
      assert.equal(polygonIntersects(polygonPoints(shape), solid, .01), false, 'platform stays clear of solids')
    }
    for (const solid of run.platforms) assert.equal(bodyIntersects(run.player.x, run.player.y, solid), false, 'player stays clear of solids')
    if (m.direction !== direction) turns.push({ x: m.x, wait: m.wait })
    check(m)
  }
  return turns
}

test('moving platform placement, travel, width, flip, duplicate and JSON retain independent dimensions', () => {
  for (const dx of [-240, 0, 240]) {
    let { level, selection } = addItem(blankTrial(), 'moving-platform', { x: 700, y: 600 }, { x: 700 + dx, y: 640 })
    let m = level.mechanisms[0]
    assert.deepEqual({ x: m.x, y: m.y, w: m.w, h: m.h, travel: m.travel }, { x: 700, y: 600, w: 140, h: 20, travel: Math.abs(dx) || 300 })
    assert.equal(mechanismLabel(m), 'Moving platform')
    const direction = dx > 0 ? 1 : -1
    assert.deepEqual(mechanismOpenPosition(m), { x: 700 + direction * m.travel, y: 600 })
    const stop = mechanismAnchor(m)
    assert.deepEqual(hitItem(level, stop.x, stop.y, 3), selection)
    assert.deepEqual(itemOutline(level, selection), { x: Math.min(700, 700 + direction * m.travel), y: 600, w: 140 + m.travel, h: 20 })
    level = resizeItem(level, selection, 240, 100)
    assert.equal(level.mechanisms[0].travel, Math.abs(dx) || 300)
    level = setElevatorTravel(level, 0, 360)
    level = moveItem(level, selection, 40, -60)
    m = level.mechanisms[0]
    assert.deepEqual({ x: m.x, y: m.y, w: m.w, h: m.h, travel: m.travel }, { x: 740, y: 540, w: 240, h: 20, travel: 360 })
    m.flipX = !m.flipX
    assert.deepEqual(mechanismOpenPosition(m), { x: 740 - direction * 360, y: 540 })
    level = duplicateItem(level, selection).level
    assert.equal(level.mechanisms[1].orientation, 'horizontal')
    assert.equal(level.mechanisms[1].flipX, m.flipX)
    assert.notEqual(level.mechanisms[1].id, m.id)
    assert.deepEqual(parseLevel(JSON.parse(JSON.stringify(level))), level)
  }
})

test('horizontal lifts retain strict orientation, flip and travel validation', () => {
  for (const invalid of [{ orientation: 'diagonal' }, { orientation: undefined, flipX: true }, { flipX: 'true' }, { travel: -1 }, { travel: 1201 }]) {
    const level = fixture(); Object.assign(level.mechanisms[0], invalid)
    assert.throws(() => parseLevel(level))
  }
  const legacy = fixture(); delete legacy.mechanisms[0].orientation; delete legacy.mechanisms[0].flipX
  assert.equal(mechanismLabel(parseLevel(legacy).mechanisms[0]), 'Elevator')
  assert.deepEqual(mechanismOpenPosition(legacy.mechanisms[0]), { x: 700, y: 400 })
})

for (const flipX of [false, true]) {
  const direction = flipX ? 1 : -1, far = 700 + direction * 300, label = flipX ? 'right' : 'left'
  for (const dt of [STEP, 1 / 60]) test(`moving ${label} cycles, pauses, releases and resumes (${dt})`, () => {
    const run = start(fixture(flipX)), m = run.mechanisms[0]
    const turns = trace(run, 24, () => {}, dt)
    assert.ok(turns.filter(t => t.x === far && t.wait === 3).length >= 2)
    assert.ok(turns.filter(t => t.x === 700 && t.wait === 2).length >= 2)
    assert.equal(m.definition.travel, 300)
    run.player.x = 250
    trace(run, dt, () => {}, dt)
    const paused = { x: m.x, direction: m.direction, wait: m.wait }
    trace(run, 4, () => assert.deepEqual({ x: m.x, direction: m.direction, wait: m.wait }, paused), dt)
    run.player.x = 100
    assert.ok(trace(run, 12, () => {}, dt).some(t => t.x === far))
  })

  for (const passenger of ['player', 'box', 'ball']) test(`moving ${label} carries a ${passenger} through a full cycle`, () => {
    const level = fixture(flipX)
    if (passenger === 'player') {
      level.spawn = { x: 780, y: 700 }
      level.props = [{ kind: 'box', x: 100, y: 920, size: 40 }]
    } else level.props = [{ kind: passenger, x: 780, y: 700, size: 60 }]
    const run = start(level), rider = passenger === 'player' ? run.player : run.props[0]
    const turns = trace(run, 12, m => {
      assert.ok(Math.abs(rider.x - m.x - 80) < .2, `rider stays aboard: offset ${rider.x - m.x}`)
      assert.ok(Math.abs(rider.y - m.y) < .1, `rider stays on top: ${rider.y - m.y}`)
    })
    assert.ok(turns.some(t => t.x === far)); assert.ok(turns.some(t => t.x === 700))
  })

  for (const vy of [0, 180]) test(`landing on a platform moving ${label} does not stop or reverse it (${vy})`, () => {
    const level = fixture(flipX)
    level.props = [{ kind: 'box', x: 100, y: 920, size: 40 }]
    const run = start(level), m = run.mechanisms[0]
    run.triggers[0].held = 1
    Object.assign(run.player, { x: 780, y: 698, vy, grounded: false })
    trace(run, .7, () => { assert.equal(m.direction, -1); assert.equal(m.wait, 0) })
    assert.ok(Math.abs(run.player.y - m.y) < .01)
    assert.ok(direction * (m.x - 700) > 80)
  })

  test(`moving ${label} reverses at a wall and recovers full travel when cleared`, () => {
    const level = fixture(flipX), obstacle = { x: flipX ? 1060 : 440, y: 600, w: 60, h: 200 }
    level.platforms = [obstacle]
    const run = start(level), endpoint = flipX ? 900 : 500
    const turns = trace(run, 24)
    assert.ok(turns.filter(t => Math.abs(t.x - endpoint) < 1.1 && t.wait === 3).length >= 2)
    assert.ok(turns.filter(t => t.x === 700 && t.wait === 2).length >= 2)
    run.terrain = run.terrain.filter(p => p !== obstacle)
    assert.ok(trace(run, 12).some(t => t.x === far))
  })

  for (const passenger of ['player', 'box', 'ball']) for (const dt of [STEP, 1 / 60]) test(`moving ${label} slides under an obstructed ${passenger} without shortening its trip (${1 / dt} Hz)`, () => {
    const level = fixture(flipX), obstacle = { x: flipX ? 920 : 650, y: 600, w: 20, h: 80 }
    level.platforms = [obstacle]
    if (passenger === 'player') {
      level.spawn = { x: 780, y: 700 }
      level.props = [{ kind: 'box', x: 100, y: 920, size: 40 }]
    } else level.props = [{ kind: passenger, x: 780, y: 700, size: 60 }]
    const run = start(level), rider = passenger === 'player' ? run.player : run.props[0]
    let leftBehind = false, fell = false
    const turns = trace(run, 24, m => {
      leftBehind ||= Math.abs(rider.x - m.x - 80) > 40
      fell ||= rider.y > 780
      if (passenger !== 'player') {
        const shape = passenger === 'box' ? boxShape(rider) : ballShape(rider)
        for (const solid of [...run.terrain, mechanismShape(m)]) assert.equal(polygonIntersects(polygonPoints(shape), solid, .03), false)
      }
    }, dt)
    assert.ok(leftBehind && fell, 'the obstruction strips the passenger off the moving platform')
    assert.ok(turns.filter(t => t.x === far && t.wait === 3).length >= 2, 'a blocked passenger does not shorten travel')
    assert.ok(turns.filter(t => t.x === 700 && t.wait === 2).length >= 2)
  })

  test(`moving ${label} leaves a blocked player behind while carrying their supporting crate onward`, () => {
    const level = fixture(flipX)
    level.spawn = { x: 780, y: 640 }
    level.props = [{ kind: 'box', x: 100, y: 920, size: 40 }, { kind: 'box', x: 780, y: 700, size: 60 }]
    level.platforms = [{ x: flipX ? 920 : 650, y: 540, w: 20, h: 80 }]
    const run = start(level), box = run.props[1]
    let dismounted = false
    const turns = trace(run, 12, m => {
      assert.ok(Math.abs(box.x - m.x - 80) < .2, 'clear cargo keeps riding')
      dismounted ||= run.player.y > 660 && Math.abs(run.player.x - box.x) > 40
    })
    assert.ok(dismounted, 'a blocked player is not rigidly attached to their crate')
    assert.ok(turns.some(t => t.x === far) && turns.some(t => t.x === 700))
  })
}

test('coin switches power moving platforms and EMP pauses their exact state until power returns', () => {
  const level = fixture(true)
  level.triggers = [{ mode: 'coins', x: 100, y: 700, w: 160, threshold: 1, targets: ['ferry'] }]
  const run = start(level), m = run.mechanisms[0]
  run.empRemaining = 5; run.coinsCollected = 1
  trace(run, 4)
  assert.equal(m.x, 700); assert.equal(run.triggers[0].active, false)
  trace(run, 2)
  assert.ok(m.x > 800); assert.equal(run.triggers[0].active, true)
  run.empRemaining = 5
  const before = { x: m.x, direction: m.direction, wait: m.wait }
  trace(run, 5, () => assert.deepEqual({ x: m.x, direction: m.direction, wait: m.wait }, before))
  assert.equal(run.triggers[0].active, true)
  assert.ok(trace(run, 12).some(t => t.x === 1000))
})

test('a ball in the horizontal path can roll aside without being tunneled through', () => {
  const level = fixture(true)
  level.mechanisms[0].y = 900
  level.props = [{ kind: 'ball', x: 960, y: 920, size: 60 }]
  const run = start(level), ball = run.props[0]
  trace(run, 4, m => assert.equal(polygonIntersects(polygonPoints(ballShape(ball)), mechanismShape(m), .1), false))
  assert.ok(ball.x > 1000)
  assert.ok(run.mechanisms[0].x > 850)
})
