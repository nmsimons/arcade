import test from 'node:test'
import assert from 'node:assert/strict'
import { blankTrial, parseLevel } from '../src/games/jumping/level.ts'
import { backWallPoints, backWallPointAt, backWallEdgeAt, moveBackWallPoint, insertBackWallPoint, deleteBackWallPoint } from '../src/games/jumping/backWallEditing.ts'

const cave = () => parseLevel({ ...blankTrial(), version: 2,
  lighting: { nightMode: true, ambient: 0, lights: [] },
  environment: { kind: 'landscape', horizon: 300, walls: [{ kind: 'cave', x: 100, y: 200, w: 300, h: 400 }] } })

test('outline drags grow beyond the old wall bounds and preserve all playable geometry', () => {
  const level = cave(), before = structuredClone(level)
  const next = moveBackWallPoint(level, 0, 0, 20, 100)
  assert.deepEqual(backWallPoints(next.environment.walls[0]), [[20, 100], [400, 200], [400, 600], [100, 600]])
  assert.equal(next.environment.walls[0].x, 20)
  assert.equal(next.environment.walls[0].w, 380)
  assert.deepEqual(parseLevel(next), next)
  assert.deepEqual({ ...next, environment: level.environment }, level)
  assert.deepEqual(level, before)
  assert.deepEqual(backWallPoints(moveBackWallPoint(level, 0, 0, -100, -100).environment.walls[0])[0], [0, 0])
  assert.throws(() => moveBackWallPoint(level, 0, 0, 500, 400), /crossing/)
  assert.deepEqual(level, before, 'invalid drags leave the source untouched')
})

test('clicking an edge inserts a movable point; deleting restores the original outline', () => {
  const level = cave(), wall = level.environment.walls[0]
  assert.equal(backWallPointAt(wall, 102, 202, 10), 0)
  assert.equal(backWallPointAt(wall, 250, 204, 10), -1)
  const edge = backWallEdgeAt(wall, 250, 204, 10)
  assert.deepEqual(edge, { edge: 0, x: 250, y: 200 })
  assert.equal(backWallEdgeAt(wall, 250, 300, 10), null)
  const inserted = insertBackWallPoint(level, 0, edge.edge, edge.x, edge.y)
  assert.equal(backWallPoints(inserted.environment.walls[0]).length, 5)
  const moved = moveBackWallPoint(inserted, 0, 1, 250, 150)
  assert.deepEqual(backWallPoints(moved.environment.walls[0])[1], [250, 150])
  assert.deepEqual(backWallPoints(deleteBackWallPoint(moved, 0, 1).environment.walls[0]), backWallPoints(wall))
  const triangle = deleteBackWallPoint(level, 0, 0)
  assert.throws(() => deleteBackWallPoint(triangle, 0, 0), /three points/)
  assert.throws(() => insertBackWallPoint(level, 0, 0, 100, 200), /distinct/)
  assert.throws(() => insertBackWallPoint(level, 0, 0, NaN, 200), /distinct/)
})
