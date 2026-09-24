import test from 'node:test'
import assert from 'node:assert/strict'
import { resizeLevelHeight } from '../src/games/jumping/editor.ts'
import { copyLevel, levelHeight, levelPlayer, levelProblems, levelTerrain, newLevel, parseLevel, prepareLevelRopes } from '../src/games/jumping/level.ts'
import { groundAt } from '../src/games/jumping/terrain.ts'

function fixture() {
  return prepareLevelRopes({
    version: 1, id: 'resize', name: 'Resize', width: 1600, height: 1200, floor: 1000,
    spawn: { x: 120, y: 1000 }, flag: { x: 1450, y: 1000 }, checkpoints: [{ x: 400, y: 400, radius: 60 }],
    platforms: [
      { x: 300, y: 400, w: 300, h: 600 },
      { x: 900, y: 700, w: 200, h: 300, polygon: [[0, 300], [200, 0], [200, 300]] },
      { x: 1300, y: 800, w: 100, h: 200, profile: [[0, 200], [100, 0]] },
    ],
    climbables: {
      ladders: [{ x: 284, top: 400, bottom: 1000, platform: 0, side: 1 }],
      ropes: [{ x: 600, y: 400, length: 350, segments: 24, anchor: { platform: 0, x: 300, y: 0 } }],
    },
    props: [{ kind: 'box', x: 650, y: 1000, size: 80 }, { kind: 'ball', x: 800, y: 1000, size: 60 }],
    robots: [{ x: 750, y: 1000, left: 650, right: 850 }],
    mechanisms: [{ id: 'lift', kind: 'lift', x: 1200, y: 700, w: 80, h: 20, travel: 100 }],
    triggers: [{ x: 1100, y: 1000, w: 100, target: 'lift', mode: 'weight' }],
    times: { gold: 10, silver: 20, bronze: 40 },
  })
}

test('adding height preserves every object above the floor, including attachments and legacy contents', () => {
  const level = fixture(), original = copyLevel(level), next = prepareLevelRopes(resizeLevelHeight(level, 1600))
  assert.equal(levelHeight(next), 1600)
  assert.equal(next.height, next.floor)
  const shifted = value => ({ ...value, y: value.y + 600 })
  for (const key of ['spawn', 'flag']) assert.deepEqual(next[key], shifted(level[key]))
  for (const key of ['platforms', 'checkpoints', 'props', 'robots', 'mechanisms', 'triggers']) assert.deepEqual(next[key], level[key].map(shifted))
  assert.deepEqual(next.climbables.ladders, level.climbables.ladders.map(l => ({ ...l, top: l.top + 600, bottom: l.bottom + 600 })))
  const rope = next.climbables.ropes[0], old = level.climbables.ropes[0]
  assert.deepEqual(rope.anchor, old.anchor)
  assert.equal(rope.y, old.y + 600); assert.equal(rope.length, old.length)
  assert.notEqual(rope.rest.key, old.rest.key, 'the prepared geometry belongs to the resized room')
  rope.rest.points.forEach((p, i) => assert.ok(Math.hypot(p[0] - old.rest.points[i][0], p[1] - old.rest.points[i][1] - 600) < .05))
  assert.deepEqual(parseLevel(JSON.parse(JSON.stringify(next))), next)
  assert.deepEqual(levelProblems(next), [])
  assert.equal(levelPlayer(next).y, 1600)
  assert.equal(groundAt(levelTerrain(next), 400, 1000).y, 1000)
  assert.deepEqual(level, original, 'height changes must not mutate undo snapshots')
})

test('shrinking removes the ceiling space, stops before cropping contents, and can restore the original layout', () => {
  const level = fixture(), taller = prepareLevelRopes(resizeLevelHeight(level, 1600))
  const restored = prepareLevelRopes(resizeLevelHeight(taller, 1000))
  assert.deepEqual(restored, { ...level, height: 1000 })
  const smaller = prepareLevelRopes(resizeLevelHeight(taller, 400))
  assert.equal(levelHeight(smaller), 662, 'leave standing room for the elevated checkpoint')
  assert.equal(smaller.platforms[0].y, 62)
  assert.equal(smaller.checkpoints[0].y, 62)
  assert.equal(smaller.spawn.y, 662)
  assert.deepEqual(levelProblems(smaller), [])
  assert.deepEqual(parseLevel(smaller), smaller)
})

test('height changes support playground files, arbitrary heights, and bounded input', () => {
  const level = newLevel(); delete level.height; level.spawn.y = 1020
  const next = resizeLevelHeight(level, 1437)
  assert.equal(next.height, 1437); assert.equal(next.spawn.y, 1437)
  assert.equal(next.floor, undefined)
  assert.deepEqual(parseLevel(next), next)
  assert.equal(resizeLevelHeight(next, 1437), next)
  for (const invalid of [NaN, Infinity, -Infinity]) assert.equal(resizeLevelHeight(level, invalid), level)
  assert.equal(levelHeight(resizeLevelHeight(next, 1)), 400)
  assert.equal(levelHeight(resizeLevelHeight(next, 9000)), 6000)
})
