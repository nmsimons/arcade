import { CAMPAIGN } from './helpers/jumping-fixtures.mjs'
import test from 'node:test'
import assert from 'node:assert/strict'
import { addItem, deleteItem, duplicateItem, hitItem, itemBounds, moveItem, resizeItem } from '../src/games/jumping/editor.ts'
import { blankTrial } from '../src/games/jumping/level.ts'
import { levelProblems, parseLevel } from '../src/games/jumping/level.ts'
import { carvePit } from '../src/games/jumping/puzzleEditor.ts'
import { createRun, stepRun } from '../src/games/jumping/challenge.ts'
import { NEUTRAL_INPUT } from '../src/games/jumping/model.ts'
import { mechanismAnchor } from '../src/games/jumping/mechanisms.ts'

test('a drawn pit includes solid banks, a catch floor, and a ladder returning to the left', () => {
  const source = blankTrial(), level = carvePit(source, { x: 540, y: 920 }, { x: 860, y: 1320 })
  assert.equal(source.platforms.length, 0); assert.equal(level.floor, 1320)
  assert.equal(level.platforms[0].x + level.platforms[0].w, 540); assert.equal(level.platforms[1].x, 860)
  assert.equal(level.climbables.ladders[0].side, -1); assert.equal(level.climbables.ladders[0].bottom, 1320)
  assert.deepEqual(levelProblems(level), []); assert.deepEqual(parseLevel(level), level)
})
test('every gameplay object survives editing and a portable JSON file round-trip', () => {
  let level = blankTrial()
  for (const [index, tool] of ['box', 'ball', 'pusher', 'lift', 'gate', 'plate'].entries()) {
    const added = addItem(level, tool, { x: 300 + index * 180, y: 920 }, { x: 300 + index * 180, y: 920 })
    level = added.level; level = moveItem(level, added.selection, 20, 0)
  }
  assert.equal(level.props.length, 2); assert.equal(level.robots.length, 1); assert.equal(level.mechanisms.length, 2)
  assert.equal(level.triggers[0].target, level.mechanisms[1].id)
  assert.deepEqual(levelProblems(level), [])
  assert.deepEqual(parseLevel(JSON.parse(JSON.stringify(level))), level)
})
test('duplicated mechanisms have unique identities; deleting one leaves an explicit missing connection', () => {
  const first = addItem(blankTrial(), 'lift', { x: 700, y: 890 }, { x: 700, y: 600 })
  const duplicate = duplicateItem(first.level, first.selection)
  assert.notEqual(duplicate.level.mechanisms[0].id, duplicate.level.mechanisms[1].id)
  let level = addItem(duplicate.level, 'plate', { x: 400, y: 920 }, { x: 400, y: 920 }).level
  level = deleteItem(level, { kind: 'mechanism', index: 0 })
  assert.equal(level.triggers[0].target, ''); assert.match(levelProblems(level).join(), /Connect each pressure plate/)
})
test('goals follow their supporting platform, and the start and goal cannot be deleted accidentally', () => {
  const before = CAMPAIGN[0], after = moveItem(before, { kind: 'platform', index: 1 }, -40, -60)
  assert.equal(after.goal.y, 460); assert.equal(after.goal.x, before.goal.x - 40)
  assert.deepEqual(deleteItem(after, { kind: 'goal', index: 0 }), after)
  assert.deepEqual(deleteItem(after, { kind: 'spawn', index: 0 }), after)
})

test('suspended mechanisms keep their thickness through import, editing, duplication and export', () => {
  const source = blankTrial(); source.mechanisms = [
    { id: 'gate', kind: 'gate', x: 600, y: 740, w: 44, h: 180, travel: 220 },
    { id: 'lift', kind: 'lift', x: 900, y: 890, w: 160, h: 22, travel: 300 },
  ]
  let level = parseLevel(source)
  assert.equal(level.mechanisms[0].w, 20); assert.equal(level.mechanisms[0].x, 612)
  assert.equal(level.mechanisms[1].h, 20); assert.equal(level.mechanisms[1].y, 890)
  assert.equal(source.mechanisms[0].w, 44); assert.equal(source.mechanisms[1].h, 22)
  for (const [i, m] of level.mechanisms.entries()) {
    const anchor = mechanismAnchor(m)
    assert.deepEqual(hitItem(level, anchor.x, anchor.y, 0), { kind: 'mechanism', index: i })
    assert.deepEqual(hitItem(level, anchor.x, anchor.y + 30, 0), { kind: 'mechanism', index: i })
  }
  level = resizeItem(level, { kind: 'mechanism', index: 0 }, 140, 160)
  level = resizeItem(level, { kind: 'mechanism', index: 1 }, 220, 100)
  assert.equal(level.mechanisms[0].w, 20); assert.equal(level.mechanisms[0].h, 160)
  assert.equal(level.mechanisms[1].w, 220); assert.equal(level.mechanisms[1].h, 20)
  const before = mechanismAnchor(level.mechanisms[0])
  level = moveItem(level, { kind: 'mechanism', index: 0 }, 40, -60)
  assert.deepEqual(mechanismAnchor(level.mechanisms[0]), { x: before.x + 40, y: before.y - 60 })
  level = duplicateItem(level, { kind: 'mechanism', index: 0 }).level
  assert.equal(level.mechanisms.at(-1).w, 20)
  assert.deepEqual(parseLevel(JSON.parse(JSON.stringify(level))), level)
  for (const w of [0, 19, 601, NaN]) {
    const invalid = structuredClone(source); invalid.mechanisms[0].w = w
    assert.throws(() => parseLevel(invalid))
  }
  source.mechanisms[1].h = 12; source.mechanisms[1].y = source.floor - 12
  const lift = parseLevel(source).mechanisms[1]
  assert.equal(lift.y + lift.h, source.floor)
  assert.deepEqual(createRun(source).mechanisms.map(m => m.definition), parseLevel(source).mechanisms)
})

test('flipped goals preserve their orientation through editing and import, with bounds on the light side', () => {
  const source = structuredClone(CAMPAIGN[0]); source.goal.flipX = true
  const carried = moveItem(source, { kind: 'platform', index: 1 }, -40, -60)
  assert.equal(carried.goal.flipX, true)
  assert.deepEqual(parseLevel(JSON.parse(JSON.stringify(carried))).goal, carried.goal)
  const placed = addItem(carried, 'goal', { x: 700, y: carried.floor }, { x: 700, y: carried.floor }).level
  assert.equal(placed.goal.flipX, true)
  assert.deepEqual(hitItem(placed, placed.goal.x - 44, placed.goal.y - 96, 0), { kind: 'goal', index: 0 })
  assert.notEqual(hitItem(placed, placed.goal.x + 44, placed.goal.y - 96, 0)?.kind, 'goal')
  for (const flipX of [true, false]) {
    const level = blankTrial(); level.goal = { x: level.width - 40, y: level.floor, flipX }
    assert.deepEqual(parseLevel(level).goal, level.goal)
    assert.equal(levelProblems(level).length, flipX ? 0 : 1, 'only the light-facing edge needs extra room')
    for (const dx of [-10000, 10000]) {
      const moved = moveItem(level, { kind: 'goal', index: 0 }, dx, 0), bounds = itemBounds(moved, { kind: 'goal', index: 0 })
      assert.equal(moved.goal.flipX, flipX)
      assert.ok(bounds.x >= 0 && bounds.x + bounds.w <= level.width)
      assert.deepEqual(levelProblems(moved), [])
    }
  }
  const legacy = blankTrial()
  assert.equal(Object.hasOwn(parseLevel(legacy).goal, 'flipX'), false)
  for (const flipX of ['true', 1, null]) {
    legacy.goal.flipX = flipX
    assert.throws(() => parseLevel(legacy))
  }
})
test('sizing props and moving robots keeps their definitions bounded', () => {
  const crate = addItem(blankTrial(), 'box', { x: 200, y: 920 }, { x: 200, y: 920 })
  const resized = resizeItem(crate.level, crate.selection, 5000, 5000); assert.equal(resized.props[0].size, 200); assert.doesNotThrow(() => parseLevel(resized))
  const pusher = addItem(resized, 'pusher', { x: 600, y: 920 }, { x: 600, y: 920 })
  const moved = moveItem(pusher.level, pusher.selection, 9999, 0); assert.doesNotThrow(() => parseLevel(moved))
})
test('imports reject unsafe object sizes, impossible counts, duplicate IDs, and invalid medal ordering', () => {
  const base = addItem(blankTrial(), 'lift', { x: 700, y: 890 }, { x: 700, y: 600 }).level
  for (const change of [l => { l.times.gold = l.times.silver + 1 }, l => { l.floor = Infinity }, l => { l.mechanisms[0].travel = 1e9 },
    l => { l.mechanisms.push({ ...l.mechanisms[0] }) }, l => { l.props = [{ kind: 'ball', x: 200, y: 920, size: -10 }] }]) {
    const bad = structuredClone(base); change(bad); assert.throws(() => parseLevel(bad))
  }
})
test('riding a crate on an elevator preserves support throughout the ascent', () => {
  const level = blankTrial(); level.mechanisms = [{ id: 'm', kind: 'lift', x: 700, y: 890, w: 160, h: 22, travel: 300 }]; level.props = [{ kind: 'box', x: 770, y: 890, size: 80 }]
  level.triggers = [{ x: 300, y: 920, w: 80, target: 'm', mode: 'weight' }]; level.props.push({ kind: 'box', x: 340, y: 920, size: 30 })
  const run = createRun(level); run.started = true; Object.assign(run.player, { x: 770, y: 810 })
  for (let i = 0; i < 300; i++) { stepRun(run, NEUTRAL_INPUT); assert.ok(Math.abs(run.player.y - run.props[0].y + 80) < .01) }
  assert.ok(Math.abs(run.player.y - 510) < .01)
})
