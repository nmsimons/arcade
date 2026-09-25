import test from 'node:test'
import assert from 'node:assert/strict'
import { createRun, stepRun } from '../src/games/jumping/challenge.ts'
import { blankTrial } from '../src/games/jumping/level.ts'
import { NEUTRAL_INPUT, STEP, TUNING } from '../src/games/jumping/model.ts'
import { bodyIntersects, bodyPolygon, polygonIntersects, polygonPoints } from '../src/games/jumping/geometry.ts'
import { ballShape, boxShape } from '../src/games/jumping/propGeometry.ts'
import { mechanismShape } from '../src/games/jumping/mechanisms.ts'

function clear(run) {
  const p = run.player, barriers = [...run.terrain, ...run.mechanisms.map(mechanismShape)]
  const hull = bodyPolygon(p.x, p.y, p.crouching ? TUNING.crouchHeight : TUNING.height)
  for (const barrier of barriers) assert.equal(bodyIntersects(p.x, p.y, barrier), false, 'the player stays outside solid barriers')
  for (const prop of run.props) {
    const shape = prop.kind === 'ball' ? ballShape(prop) : boxShape(prop)
    assert.equal(polygonIntersects(hull, shape, .002), false, 'the prop and player separate')
    for (const barrier of barriers) assert.equal(polygonIntersects(polygonPoints(shape), barrier, .05), false, 'the blocked prop stays outside terrain')
  }
}

for (const kind of ['ball', 'box']) for (const slope of [0, .3]) {
  test(`an incoming ${kind} cannot push the player through a gate on ${slope ? 'a slope' : 'flat ground'}`, () => {
    for (const direction of [-1, 1]) for (const dt of [STEP, 1 / 30]) {
      const level = blankTrial(), wall = 900, start = wall - direction * 30
      const surface = x => slope ? 700 + direction * slope * (x - 700) : 920
      if (slope) level.platforms = [{ x: 200, y: 400, w: 1200, h: 520,
        polygon: [[0, surface(200) - 400], [1200, surface(1400) - 400], [1200, 520], [0, 520]] }]
      level.mechanisms = [{ id: 'gate', kind: 'gate', x: wall - (direction < 0 ? 20 : 0), y: 350, w: 20, h: 570, travel: 570 }]
      level.spawn = { x: start, y: surface(start) }
      level.props = [{ kind, x: wall - direction * 190, y: surface(wall - direction * 190), size: 100 }]
      const run = createRun(level); run.started = true; run.props[0].vx = direction * 900
      let displaced = false
      for (let i = 0; i < Math.ceil(3 / dt); i++) {
        stepRun(run, NEUTRAL_INPUT, dt); clear(run)
        assert.ok((run.player.x - wall) * direction <= -12 + .001, 'the player remains on the original side of the closed gate')
        assert.equal(run.mechanisms[0].y, 350, 'the collision does not bypass the gate by opening it')
        displaced ||= (run.player.x - start) * direction > 2
      }
      assert.ok(displaced, 'the prop actually hits and moves the player before the gate stops them')
    }
  })
}

for (const kind of ['ball', 'box']) test(`a rising ${kind} cannot carry the player through a horizontal gate`, () => {
  const level = blankTrial()
  level.props = [{ kind, x: 740, y: 920, size: 80 }]
  level.mechanisms = [{ id: 'gate', kind: 'gate', orientation: 'horizontal', x: 650, y: 740, w: 180, h: 20, travel: 180 }]
  level.spawn = { x: 740, y: 840 }
  const run = createRun(level); run.started = true; run.player.grounded = true
  run.props[0].vy = -500
  let rose = false
  for (let i = 0; i < 180; i++) {
    stepRun(run, NEUTRAL_INPUT); clear(run)
    rose ||= run.player.y < 835
    assert.ok(run.player.y >= 760 + TUNING.height - .001, 'the rider stays beneath the closed gate')
  }
  assert.ok(rose, 'the support carries the player up before the ceiling blocks them')
})

test('a ball still pushes a player through open space', () => {
  const level = blankTrial(); level.spawn = { x: 800, y: 920 }
  level.props = [{ kind: 'ball', x: 650, y: 920, size: 100 }]
  const run = createRun(level); run.started = true; run.props[0].vx = 400
  for (let i = 0; i < 120; i++) { stepRun(run, NEUTRAL_INPUT); clear(run) }
  assert.ok(run.player.x > 900, 'an unobstructed impact still displaces the player')
})
