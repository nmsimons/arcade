import test from 'node:test'
import assert from 'node:assert/strict'
import { DEFAULT_LEVEL, DRAFT_STORAGE_KEY, LEVEL_STORAGE_KEY, copyLevel, levelPlayer, levelRules, newLevel, parseLevel, readSavedLevels, saveLevel, snapToGround, spawnProblem } from '../src/games/jumping/level.ts'
import { addItem, deleteItem, moveItem, replacePlatform, resizeItem } from '../src/games/jumping/editor.ts'
import { createPlayer, NEUTRAL_INPUT, PLATFORMS, STEP, stepPlayer, WORLD_WIDTH } from '../src/games/jumping/model.ts'
import { createRope, NO_CLIMBABLES, stepRope } from '../src/games/jumping/climbables.ts'
import { groundAt } from '../src/games/jumping/terrain.ts'

function advance(p, frames, move, platforms, rules) {
  for (let i = 0; i < frames; i++) stepPlayer(p, { ...NEUTRAL_INPUT, move }, STEP, platforms, NO_CLIMBABLES, rules)
}
test('joined slopes have no internal wall in either direction, including uphill and downhill seams', () => {
  const terrain = [{ x: 0, y: 620, w: 200, h: 320 },
    { x: 200, y: 560, w: 200, h: 380, profile: [[0, 60], [200, 0]] },
    { x: 400, y: 560, w: 200, h: 380, profile: [[0, 0], [200, 60]] },
    { x: 600, y: 620, w: 500, h: 320 }]
  for (const direction of [-1, 1]) {
    const p = createPlayer(); p.x = direction === 1 ? 120 : 850
    for (let frame = 0; frame < 225; frame++) {
      const before = p.x
      advance(p, 1, direction, terrain)
      assert.ok(p.grounded); assert.ok((p.x - before) * direction > 0, `blocked at ${p.x}`)
      assert.ok(Math.abs(p.y - groundAt(terrain, p.x, p.y).y) < .001)
    }
    assert.ok(direction === 1 ? p.x > 720 : p.x < 250)
  }
})
test('world edges let the player fall off the visible terrain instead of blocking invisibly', () => {
  for (const direction of [-1, 1]) {
    const p = createPlayer(); p.x = direction === 1 ? WORLD_WIDTH - 15 : 15
    advance(p, 25, direction, PLATFORMS)
    assert.ok(direction === 1 ? p.x > WORLD_WIDTH : p.x < 0)
    assert.ok(!p.grounded && p.vy > 0)
  }
  const level = newLevel(); level.width = 7000; level.platforms[0].w = 7000; level.spawn = { x: 5000, y: 620 }
  const p = levelPlayer(level); advance(p, 80, 1, level.platforms, levelRules(level))
  assert.ok(p.x > 5180 && p.grounded)
})
test('rope collisions use the visible slope rather than its rectangular bounding box', () => {
  const terrain = [{ x: 0, y: 400, w: 1000, h: 200, profile: [[0, 200], [1000, 0]] }]
  const rope = createRope({ x: 200, y: 200, length: 300, segments: 24 })
  for (let i = 0; i < 60; i++) stepRope(rope, STEP, terrain, null)
  assert.ok(rope.nodes.at(-1).y > 495, 'rope should hang freely above the actual surface at y=560')
})
test('custom checkpoints and falling use the custom spawn rather than playground coordinates', () => {
  const level = newLevel(); level.spawn = { x: 600, y: 620 }; level.checkpoints = [{ x: 1000, y: 620 }]
  const p = levelPlayer(level); p.x = 960
  advance(p, 1, 0, level.platforms, levelRules(level)); assert.equal(p.spawnX, 1000)
  p.y = levelRules(level).fallY + 1; p.grounded = false
  advance(p, 1, 0, level.platforms, levelRules(level)); assert.equal(p.x, 1000); assert.equal(p.y, 620)
  const other = newLevel(); other.checkpoints = []
  const q = levelPlayer(other); q.x = 1500
  advance(q, 1, 0, other.platforms, levelRules(other)); assert.equal(q.spawnX, 200)
})
test('builder operations create editable terrain, keep the source unchanged, and move attached markers', () => {
  const level = newLevel(), original = copyLevel(level)
  const result = addItem(level, 'rough', { x: 400, y: 620 }, { x: 900, y: 520 })
  assert.equal(result.level.platforms.length, 2); assert.equal(result.level.platforms[1].profile.length, 11)
  assert.deepEqual(level, original)
  let edited = addItem(result.level, 'spawn', { x: 500, y: 520 }, { x: 500, y: 520 }).level
  assert.equal(spawnProblem(edited), null)
  const spawn = { ...edited.spawn }
  edited = moveItem(edited, result.selection, 100, -20)
  assert.equal(edited.spawn.x, spawn.x + 100); assert.equal(edited.spawn.y, spawn.y - 20)
  edited = resizeItem(edited, result.selection, 1000, 120)
  assert.equal(edited.platforms[1].profile.at(-1)[0], 1000)
  assert.equal(spawnProblem(edited), null)
  assert.deepEqual(parseLevel(edited), edited)
  assert.equal(deleteItem(edited, result.selection).platforms.length, 1)
})
test('deleting a platform removes only its ladders and reindexes remaining attachments', () => {
  const level = copyLevel(DEFAULT_LEVEL)
  const removed = deleteItem(level, { kind: 'platform', index: 4 })
  assert.equal(removed.climbables.ladders.length, 1); assert.equal(removed.climbables.ladders[0].platform, 4)
  const moved = replacePlatform(removed, 4, { ...removed.platforms[4], x: 2300, y: 470 })
  assert.equal(moved.climbables.ladders[0].x, 2284); assert.equal(moved.climbables.ladders[0].top, 470)
  assert.deepEqual(parseLevel(moved), moved)
})
test('a placed ladder attaches to a platform and a rope keeps its authored length', () => {
  const level = newLevel(); level.platforms.push({ x: 600, y: 400, w: 200, h: 20 })
  const ladder = addItem(level, 'ladder', { x: 580, y: 400 }, { x: 580, y: 620 })
  assert.equal(ladder.level.climbables.ladders[0].x, 584)
  const rope = addItem(ladder.level, 'rope', { x: 900, y: 200 }, { x: 900, y: 500 })
  assert.equal(rope.level.climbables.ropes[0].length, 300)
  assert.deepEqual(parseLevel(rope.level), rope.level)
})
test('import rejects malformed, unbounded and non-finite geometry before it reaches the simulation', () => {
  for (const change of [v => { v.platforms[0].w = Infinity }, v => { v.platforms[0].profile = [[0, 0], [0, 20]] },
    v => { v.platforms[0].profile = [[0, 0], [v.platforms[0].w, 9000]] }, v => { v.climbables.ropes = [{ x: 0, y: 0, length: 100, segments: 1e9 }] },
    v => { v.climbables.ladders = [{ x: 0, top: 0, bottom: 100, platform: 900, side: 1 }] }, v => { v.spawn.x = -40 }]) {
    const value = newLevel(); change(value); assert.throws(() => parseLevel(value))
  }
  const valid = parseLevel(JSON.parse(JSON.stringify(DEFAULT_LEVEL))); assert.deepEqual(valid, DEFAULT_LEVEL)
})
test('saved library round-trips levels, updates by identity, and preserves unreadable data', () => {
  const data = new Map(), storage = { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) }
  const first = newLevel(), second = newLevel(); first.name = 'Hills'; second.name = 'Ropes'
  saveLevel(storage, first); saveLevel(storage, second)
  first.name = 'Long hills'; saveLevel(storage, first)
  assert.deepEqual(readSavedLevels(storage).map(l => l.name), ['Long hills', 'Ropes'])
  assert.equal(data.has(DRAFT_STORAGE_KEY), false)
  data.set(LEVEL_STORAGE_KEY, '{bad')
  assert.throws(() => saveLevel(storage, first)); assert.equal(data.get(LEVEL_STORAGE_KEY), '{bad')
  assert.throws(() => saveLevel({ getItem: () => null, setItem: () => { throw new Error('quota') } }, first), /quota/)
})
test('spawn validation flags missing ground and low ceilings, and start placement snaps to terrain', () => {
  const level = newLevel(); level.spawn = { x: 200, y: 500 }; assert.ok(spawnProblem(level))
  level.spawn = snapToGround(level, 200, 580); assert.equal(spawnProblem(level), null)
  level.platforms.push({ x: 100, y: 540, w: 300, h: 40 }); assert.match(spawnProblem(level), /space/)
})
