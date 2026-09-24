import { CAMPAIGN } from './helpers/jumping-fixtures.mjs'
import test from 'node:test'
import assert from 'node:assert/strict'
import { addItem, deleteItem, duplicateItem, moveItem, resizeItem } from '../src/games/jumping/editor.ts'
import { blankTrial } from '../src/games/jumping/level.ts'
import { levelProblems, parseLevel, saveLevel, readSavedLevels } from '../src/games/jumping/level.ts'
import { carvePit } from '../src/games/jumping/puzzleEditor.ts'
import { createRun, stepRun } from '../src/games/jumping/challenge.ts'
import { NEUTRAL_INPUT } from '../src/games/jumping/model.ts'

test('a drawn pit includes solid banks, a catch floor, and a ladder returning to the left', () => {
  const source = blankTrial(), level = carvePit(source, { x: 540, y: 920 }, { x: 860, y: 1320 })
  assert.equal(source.platforms.length, 0); assert.equal(level.floor, 1320)
  assert.equal(level.platforms[0].x + level.platforms[0].w, 540); assert.equal(level.platforms[1].x, 860)
  assert.equal(level.climbables.ladders[0].side, -1); assert.equal(level.climbables.ladders[0].bottom, 1320)
  assert.deepEqual(levelProblems(level), []); assert.deepEqual(parseLevel(level), level)
})
test('every gameplay object survives editing, save/load, and a portable JSON round-trip', () => {
  let level = blankTrial()
  for (const [index, tool] of ['box', 'ball', 'pusher', 'lift', 'gate', 'plate'].entries()) {
    const added = addItem(level, tool, { x: 300 + index * 180, y: 920 }, { x: 300 + index * 180, y: 920 })
    level = added.level; level = moveItem(level, added.selection, 20, 0)
  }
  assert.equal(level.props.length, 2); assert.equal(level.robots.length, 1); assert.equal(level.mechanisms.length, 2)
  assert.equal(level.triggers[0].target, level.mechanisms[1].id)
  assert.deepEqual(levelProblems(level), [])
  let raw = null; const storage = { getItem: () => raw, setItem: (_, value) => { raw = value } }
  saveLevel(storage, level); assert.deepEqual(readSavedLevels(storage)[0], level)
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
test('goals follow their supporting platform, and the start and flag cannot be deleted accidentally', () => {
  const before = CAMPAIGN[0], after = moveItem(before, { kind: 'platform', index: 1 }, -40, -60)
  assert.equal(after.flag.y, 460); assert.equal(after.flag.x, before.flag.x - 40)
  assert.deepEqual(deleteItem(after, { kind: 'flag', index: 0 }), after)
  assert.deepEqual(deleteItem(after, { kind: 'spawn', index: 0 }), after)
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
  const run = createRun(level); run.started = true; run.mechanisms[0].active = true; Object.assign(run.player, { x: 770, y: 810 })
  for (let i = 0; i < 300; i++) { stepRun(run, NEUTRAL_INPUT); assert.ok(Math.abs(run.player.y - run.props[0].y + 80) < .01) }
  assert.equal(run.player.y, 510)
})
