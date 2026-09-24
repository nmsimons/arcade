import test from 'node:test'
import assert from 'node:assert/strict'
import { newLevel, prepareLevelRopes, levelPlayer, levelTerrain, parseLevel, saveLevel, readSavedLevels } from '../src/games/jumping/level.ts'
import { createRope, stepRope, ropeImpulse, ropePoint, ropePath, findRope, ROPE_SEGMENT_LENGTH } from '../src/games/jumping/climbables.ts'
import { STEP, respawn } from '../src/games/jumping/model.ts'
import { hitItem, itemHandle, itemOutline, moveItem, resizeItem, deleteItem, replacePlatform } from '../src/games/jumping/editor.ts'
import { lineBlocked, nearestBoundary, pointInside } from '../src/games/jumping/geometry.ts'

const points = rope => rope.nodes.map(n => [n.x, n.y])
function fixture(x = 400, y = 200, block = { x: 300, y: 300, w: 200, h: 300 }) {
  const level = newLevel()
  level.width = 1200; level.platforms = block ? [block] : []
  level.climbables.ropes = [{ x, y, length: 500, segments: 24 }]
  return level
}
const cases = [
  ['cliff edge', () => fixture(300, 300, { x: 300, y: 300, w: 200, h: 600 })],
  ['through a block', () => fixture()],
  ['buried anchor', () => fixture(400, 450)],
  ['polygon slope', () => fixture(400, 200, { x: 300, y: 300, w: 200, h: 300, polygon: [[0, 0], [200, 200], [200, 300], [0, 300]] })],
  ['thin platform between particles', () => fixture(400, 200, { x: 300, y: 305, w: 200, h: 8 })],
  ['excess rope on the level floor', () => fixture(500, 750, null)],
  ['anchor on top of a shelf', () => fixture(500, 300, { x: 300, y: 300, w: 600, h: 20 })],
  ['anchor set back from a tall cliff', () => fixture(480, 300, { x: 0, y: 300, w: 600, h: 700 })],
  ['overlapping blocks', () => { const l = fixture(475, 450); l.platforms.push({ x: 450, y: 300, w: 200, h: 300 }); return l }],
]
for (const [name, make] of cases) test(`editor resolves ${name} before the first frame, with no visible startup settling`, () => {
  const input = make(), original = structuredClone(input), level = prepareLevelRopes(input), terrain = levelTerrain(level)
  assert.deepEqual(input, original, 'authoring preparation must not mutate an undo snapshot')
  const definition = level.climbables.ropes[0], saved = definition.rest.points
  assert.equal(saved.length, definition.segments + 1)
  const path = ropePath(definition)
  for (let i = 1; i < path.length; i++) {
    assert.ok(!terrain.some(b => pointInside(b, ...path[i])), `particle ${i} is in terrain`)
    assert.ok(!lineBlocked(path[i - 1], path[i], terrain), `span ${i} crosses terrain`)
  }
  assert.deepEqual(parseLevel(level), level)
  const player = levelPlayer(level), rope = player.ropes[0]
  assert.deepEqual(points(rope), saved)
  assert.ok(rope.nodes.every(n => n.x === n.oldX && n.y === n.oldY), 'saved positions start without residual velocity')
  let drift = 0
  for (let frame = 0; frame < 240; frame++) {
    stepRope(rope, STEP, terrain, null)
    drift = Math.max(drift, ...rope.nodes.map((n, i) => Math.hypot(n.x - saved[i][0], n.y - saved[i][1])))
  }
  assert.ok(drift < 1, `startup drift should be subpixel, got ${drift}`)
  respawn(player)
  assert.deepEqual(points(player.ropes[0]), saved, 'reset restores the exact editor shape')
  assert.deepEqual(points(levelPlayer(level).ropes[0]), saved, 'another playtest starts identically')
})

test('terrain and rope edits rebuild the layout, while unrelated edits and undo keep it', () => {
  const level = prepareLevelRopes(fixture()), before = JSON.stringify(level), original = level.climbables.ropes[0].rest
  assert.equal(prepareLevelRopes({ ...level, name: 'Renamed' }).climbables.ropes[0].rest, original)
  for (const edited of [
    moveItem(level, { kind: 'platform', index: 0 }, 200, 0),
    replacePlatform(level, 0, { x: 300, y: 300, w: 200, h: 300, polygon: [[0, 0], [200, 200], [200, 300], [0, 300]] }),
    deleteItem(level, { kind: 'platform', index: 0 }),
    moveItem(level, { kind: 'rope', index: 0 }, 200, 0),
    resizeItem(level, { kind: 'rope', index: 0 }, 0, 300),
    { ...level, height: 700 },
  ]) {
    const updated = prepareLevelRopes(edited)
    assert.notEqual(updated.climbables.ropes[0].rest.key, original.key)
    assert.deepEqual(parseLevel(updated), updated)
  }
  assert.equal(JSON.stringify(level), before)
  assert.equal(prepareLevelRopes(level), level, 'undo can reuse its original prepared geometry')
})

test('saved, exported and imported ropes retain their exact shape and remain selectable along it', () => {
  const level = prepareLevelRopes(fixture()), data = new Map()
  const storage = { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) }
  saveLevel(storage, level)
  assert.deepEqual(readSavedLevels(storage)[0], level)
  assert.deepEqual(prepareLevelRopes(parseLevel(JSON.parse(JSON.stringify(level)))), level)
  const selection = { kind: 'rope', index: 0 }, rope = level.climbables.ropes[0]
  const tip = rope.rest.points.at(-1), bounds = itemOutline(level, selection)
  assert.ok(Math.abs(tip[0] - rope.x) > 50, 'the settled rope bends around the block')
  assert.deepEqual(hitItem(level, ...tip, 3), selection)
  assert.deepEqual(itemHandle(level, selection), { x: tip[0], y: tip[1] })
  assert.ok(tip[0] >= bounds.x && tip[0] <= bounds.x + bounds.w)
})

test('buried anchors snap to an exposed face and follow that terrain during later edits', () => {
  const level = prepareLevelRopes(fixture(400, 450)), rope = level.climbables.ropes[0]
  assert.equal(rope.anchor.platform, 0)
  assert.ok(nearestBoundary(level.platforms[0], rope.x, rope.y).distance < .01)
  const moved = prepareLevelRopes(moveItem(level, { kind: 'platform', index: 0 }, 100, -40)).climbables.ropes[0]
  assert.equal(moved.x, rope.x + 100); assert.equal(moved.y, rope.y - 40)
})

test('prepared ropes still swing freely after interaction and cannot mutate the saved layout', () => {
  const level = prepareLevelRopes(fixture(500, 200, null)), def = level.climbables.ropes[0], saved = structuredClone(def.rest)
  const rope = createRope(def)
  ropeImpulse(rope, 250, 200, 0, STEP)
  let excursion = 0
  for (let frame = 0; frame < 90; frame++) {
    stepRope(rope, STEP, levelTerrain(level), { distance: 250, move: 0 })
    excursion = Math.max(excursion, Math.abs(ropePoint(rope, 250)[0] - def.x))
  }
  assert.ok(excursion > 10)
  assert.deepEqual(def.rest, saved)
})

test('a fresh editor session computes identical geometry without relying on its cache', async () => {
  const level = fixture(), prepared = prepareLevelRopes(level)
  const fresh = await import('../src/games/jumping/ropeLayout.ts?fresh-editor')
  assert.deepEqual(fresh.prepareRope(level.climbables.ropes[0], levelTerrain(level)), prepared.climbables.ropes[0])
})

test('imports reject malformed saved rope geometry and rebuild stale layouts', () => {
  const level = prepareLevelRopes(fixture())
  for (const change of [
    r => r.rest.points.pop(), r => r.rest.points.push([0, 0]), r => r.rest.points[1][0] = NaN,
    r => r.rest.points[0][0]++, r => r.rest.points[1][1] += 200, r => r.rest.key = 'unbounded format',
    r => r.rest.distances[1] = 0, r => r.rest.distances.pop(), r => r.rest.distances[2] = Infinity,
    r => r.rest.bends.pop(), r => r.rest.bends[1] = [Infinity, 0], r => r.rest.bends[1] = [r.x + 200, r.y],
  ]) {
    const corrupt = structuredClone(level); change(corrupt.climbables.ropes[0])
    assert.throws(() => parseLevel(corrupt), /valid jumping level/)
  }
  const stale = structuredClone(level); stale.platforms[0].x += 200
  assert.notEqual(prepareLevelRopes(parseLevel(stale)).climbables.ropes[0].rest.key, level.climbables.ropes[0].rest.key)
})

test('ropes lie flat on either shelf edge, with bend joints and consistent material grip positions', () => {
  for (const side of [-1, 1]) for (const length of [320, 500]) {
    const level = fixture(500, 300, { x: side === 1 ? 300 : 100, y: 300, w: 600, h: 20 })
    level.climbables.ropes[0].length = length
    const prepared = prepareLevelRopes(level), def = prepared.climbables.ropes[0], rope = createRope(def), b = level.platforms[0]
    const roof = ropePath(def).filter(p => p[0] > b.x && p[0] < b.x + b.w && p[1] < b.y)
    assert.ok(roof.every(p => p[1] > b.y - 1.55), 'terrain bends must not lift a hump above the roof')
    assert.deepEqual(parseLevel(prepared), prepared)
    def.rest.distances.forEach((distance, i) => assert.deepEqual(ropePoint(rope, distance), def.rest.points[i]))
    const p = levelPlayer(prepared), distance = length - 65, hand = ropePoint(p.ropes[0], distance)
    Object.assign(p, { x: hand[0] - 10, y: hand[1] + 56, facing: 1, grounded: false })
    const catchPose = findRope(p, levelTerrain(level))
    assert.ok(catchPose && Math.abs(catchPose.distance - distance) < .00001, 'catching the rope keeps its material location')
  }
})

test('an older stored hump is rebuilt, without changing the anchor or the undo snapshot', () => {
  const level = fixture(480, 300, { x: 0, y: 300, w: 600, h: 700 }), ready = prepareLevelRopes(level)
  const old = level.climbables.ropes[0]
  old.rest = { key: ready.climbables.ropes[0].rest.key.replace(/^\d+:/, '1:'), points: Array.from({ length: old.segments + 1 }, (_, i) => [old.x, old.y + old.length * i / old.segments]) }
  const snapshot = structuredClone(level), corrected = prepareLevelRopes(parseLevel(level))
  assert.deepEqual(corrected, ready)
  assert.deepEqual(level, snapshot)
  const tail = corrected.climbables.ropes[0].rest.points.at(-1)
  assert.ok(Math.abs(tail[0] - 600) < 3, 'the resting tail should hang against the cliff instead of floating away from it')
})

test('short and long ropes use the same fixed material segment size, independent of legacy counts', () => {
  for (const length of [80, 83, 320, 333, 2000]) for (const segments of [12, 24, 40]) {
    const rope = createRope({ x: 200, y: 100, length, segments })
    assert.equal(rope.nodes.length, Math.ceil(length / ROPE_SEGMENT_LENGTH) + 1)
    rope.nodes.slice(1).forEach((node, i) => {
      assert.equal(node.y - rope.nodes[i].y, Math.min(ROPE_SEGMENT_LENGTH, length - i * ROPE_SEGMENT_LENGTH))
    })
    assert.deepEqual(ropePoint(rope, length), [200, 100 + length])
    assert.deepEqual(ropePoint(rope, length + 5), [200, 105 + length])
  }
})

test('fixed segments wrap an overhanging lip without lifting a hump, including off-grid anchors', () => {
  for (const offset of [157, 160, 165]) for (const polygon of [false, true]) {
    const level = fixture(620 - offset, 200)
    level.height = 1000
    level.platforms = polygon
      ? [{ x: 0, y: 200, w: 620, h: 800, polygon: [[0, 0], [620, 0], [620, 20], [600, 20], [600, 800], [0, 800]] }]
      : [{ x: 0, y: 200, w: 600, h: 800 }, { x: 0, y: 200, w: 620, h: 20 }]
    level.climbables.ropes[0].length = offset === 160 ? 380 : 503
    const prepared = prepareLevelRopes(level), def = prepared.climbables.ropes[0], path = ropePath(def)
    assert.ok(path.filter(p => p[0] < 620).every(p => p[1] >= 198.25), 'rope should rest flat on the roof within a quarter-unit solver tolerance')
    assert.ok(Math.abs(path.at(-1)[0] - 621.5) < .1, 'tail hangs just outside the lip')
    path.slice(1).forEach((p, i) => assert.ok(!lineBlocked(path[i], p, levelTerrain(prepared))))
    def.rest.distances.slice(1).forEach((d, i) => assert.equal(d - def.rest.distances[i], Math.min(8, def.length - i * 8)))
    assert.deepEqual(parseLevel(prepared), prepared)
  }
})
