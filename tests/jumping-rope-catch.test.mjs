import test from 'node:test'
import assert from 'node:assert/strict'
import { createRun, stepRun } from '../src/games/jumping/challenge.ts'
import { NEUTRAL_INPUT } from '../src/games/jumping/model.ts'
import { ropePath } from '../src/games/jumping/climbables.ts'
import { bodyIntersects, bodyPolygon, polygonIntersects, lineBlocked } from '../src/games/jumping/geometry.ts'
import { ropeTower } from './helpers/rope-tower.mjs'

test('catching below an undercut cannot pull the rope through the tower or its closed gates', () => {
  const run = createRun(ropeTower()), p = run.player; run.started = true
  Object.assign(p, { x: 372, y: 700, grounded: false, facing: -1, vx: -150, vy: -300 })
  let caught = false
  for (let i = 0; i < 240; i++) {
    stepRun(run, { ...NEUTRAL_INPUT, climb: true })
    caught ||= !!p.climbing
    const rope = p.ropes[0], path = ropePath(rope.definition, rope)
    for (let j = 1; j < path.length; j++) assert.ok(!lineBlocked(path[j - 1], path[j], run.platforms), `frame ${i}, span ${j}`)
    assert.ok(!run.platforms.some(b => polygonIntersects(bodyPolygon(p.x, p.y, 62), b, .02)), `body at frame ${i}`)
  }
  assert.ok(caught, 'exercise a real catch instead of rejecting the reachable rope')
})

test('a catch through an open gate can establish a rappel after the body clears the tower face', () => {
  const run = createRun(ropeTower()), p = run.player; run.started = true
  Object.assign(p, { x: 344, y: 548, grounded: false, facing: -1, vx: -100, vy: 0 })
  run.mechanisms[1].y = 360
  let caughtInside = false, braced = 0
  for (let i = 0; i < 240; i++) {
    stepRun(run, { ...NEUTRAL_INPUT, descend: i < 50 })
    caughtInside ||= p.climbing?.caught.x > 340
    braced += Number(!!p.climbing?.wall)
    assert.ok(!run.platforms.some(b => bodyIntersects(p.x, p.y, b)))
    if (p.climbing?.wall) assert.ok(p.x < 340, 'brace only after moving outside')
  }
  assert.ok(caughtInside)
  assert.ok(braced > 100, 'hold a stable wall brace after the mid-rope catch')
  assert.equal(p.climbing.wall.x, 340)
})
