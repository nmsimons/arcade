import test from 'node:test'
import assert from 'node:assert/strict'
import { createRun, stepRun } from '../src/games/jumping/challenge.ts'
import { NEUTRAL_INPUT, TUNING } from '../src/games/jumping/model.ts'
import { ropePath } from '../src/games/jumping/climbables.ts'
import { bodyPolygon, polygonIntersects, lineBlocked } from '../src/games/jumping/geometry.ts'
import { levelProblems } from '../src/games/jumping/level.ts'
import { readLevelAsset } from './helpers/jumping-fixtures.mjs'

function mirrored(level) {
  const l = structuredClone(level), mirror = x => l.width - x
  l.spawn.x = mirror(l.spawn.x); l.goal = { ...l.goal, x: mirror(l.goal.x), flipX: true }
  l.platforms = l.platforms.map(b => ({ ...b, x: mirror(b.x + b.w), polygon: b.polygon?.map(([x, y]) => [b.w - x, y]) }))
  l.mechanisms.forEach(m => { m.x = mirror(m.x + m.w) })
  l.triggers.forEach(t => { t.x = mirror(t.x + t.w) })
  l.props.forEach(p => { p.x = mirror(p.x) })
  l.climbables.ropes.forEach(r => { r.x = mirror(r.x) })
  return l
}

for (const side of [1, -1]) for (const transfer of [false, true]) {
  test(`${transfer ? 'transferring through a window' : 'climbing beside an open gate'} keeps every loaded rope span clear (${side})`, () => {
    const original = readLevelAsset(transfer ? 'rope-window-transfer.json' : 'rope-window-gate.json')
    const level = side === 1 ? original : mirrored(original)
    assert.deepEqual(levelProblems(level), [])
    const run = createRun(level), p = run.player
    let frame = 0, caught = 0, transferred = false
    const tick = input => {
      stepRun(run, { ...NEUTRAL_INPUT, ...input })
      caught += Number(!!p.climbing)
      transferred ||= !!p.hang || !!p.mantle
      const rope = p.ropes[0], path = ropePath(rope.definition, rope)
      for (let j = 1; j < path.length; j++) assert.ok(!lineBlocked(path[j - 1], path[j], run.platforms), `frame ${frame}, span ${j}`)
      if (!p.mantle) assert.ok(!run.platforms.some(b => polygonIntersects(bodyPolygon(p.x, p.y, p.crouching ? 40 : 62), b, .02)), `body at frame ${frame}`)
      frame++
    }
    const walk = TUNING.walkSpeed / TUNING.runSpeed
    if (transfer) {
      for (let i = 0; i < 8; i++) tick({ move: side * walk })
      for (let i = 0; i < 150; i++) tick({})
    } else {
      // Turn toward the rope without automatically stepping onto the window sill.
      for (let i = 0; i < 160; i++) tick({ move: -side * walk, crouch: true, descend: true })
    }
    assert.ok(run.mechanisms.every(m => m.active && m.y === m.definition.y - m.definition.h), 'the crate opens both gates normally')
    const startY = p.y
    for (let i = 0; i < 600; i++) {
      tick({ climb: true, move: transfer ? side : 0 })
      if (transfer && transferred && p.grounded) break
    }
    assert.ok(caught > 0, 'exercise the rope under the player’s load')
    if (transfer) {
      assert.ok(transferred && p.grounded, 'finish the rope-to-window transfer')
      assert.equal(p.y, 560); assert.equal(p.x, side === 1 ? 360 : level.width - 360)
    } else {
      assert.ok(p.climbing && p.y < startY - 100, 'ascend while keeping the grip')
    }
  })
}
