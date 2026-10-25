import test from 'node:test'
import assert from 'node:assert/strict'
import { blankTrial, copyLevel, parseLevel } from '../src/games/jumping/level.ts'
import { deleteItem, moveItem, reorderTerrain } from '../src/games/jumping/editor.ts'
import { expandEditorGroups, groupSelections, selectedEditorGroup, ungroupSelections } from '../src/games/jumping/editorGroups.ts'
import { copySelections, deleteSelections, moveSelections, pasteSelections, selectionBounds } from '../src/games/jumping/editorSelection.ts'
import { decodeEditorClipboard, encodeEditorClipboard } from '../src/games/jumping/editorClipboard.ts'
import { levelCenterSnap } from '../src/games/jumping/builderSnap.ts'
import { carvePit } from '../src/games/jumping/puzzleEditor.ts'

const pick = (kind, index = 0) => ({ kind, index })
const a = pick('platform'), b = pick('platform', 1), c = pick('platform', 2), box = pick('prop')
function scene() {
  return { ...blankTrial(), width: 1200, height: 800, floor: 800,
    entrance: { x: 180, y: 800 }, goal: { x: 960, y: 800 },
    platforms: [{ x: 200, y: 200, w: 100, h: 80 }, { x: 400, y: 300, w: 200, h: 100 }, { x: 800, y: 500, w: 100, h: 80 }],
    props: [{ kind: 'box', x: 750, y: 650, size: 60 }] }
}

test('flat editor groups merge whole groups and survive parsing, member edits and terrain reordering', () => {
  const source = scene(), first = groupSelections(source, [a, b]), original = copyLevel(first)
  assert.equal(source.editorGroups, undefined)
  assert.deepEqual(expandEditorGroups(first, [b, a, b]), [a, b])
  assert.equal(groupSelections(first, [a, b]), first)
  const merged = groupSelections(groupSelections(first, [c, box]), [b, box])
  assert.equal(merged.editorGroups.length, 1)
  assert.deepEqual(merged.editorGroups[0].members, [a, b, c, box])
  assert.ok(selectedEditorGroup(merged, [box, c, b, a]))
  const edited = moveItem(first, a, 20, 10)
  assert.deepEqual(edited.editorGroups, original.editorGroups)
  assert.equal(edited.platforms[1].x, original.platforms[1].x)
  assert.deepEqual(parseLevel(reorderTerrain(edited, 0, 'front')).editorGroups, first.editorGroups)
  assert.deepEqual(first, original)
  for (const version of [1, 2]) {
    const level = { ...merged, version, ...(version === 2 ? { lighting: { ambient: 0, lights: [] } } : {}) }
    assert.deepEqual(parseLevel(level).editorGroups, merged.editorGroups)
  }
  assert.equal(ungroupSelections(first, [c]), first)
  assert.equal(ungroupSelections(first, [b]).editorGroups, undefined)
})

test('deleting individual members and earlier objects remaps surviving group indices and removes singleton groups', () => {
  const grouped = groupSelections(scene(), [b, c, box])
  const changed = deleteItem(grouped, a)
  assert.deepEqual(changed.editorGroups[0].members, [a, b, box])
  const smaller = deleteItem(changed, a)
  assert.deepEqual(smaller.editorGroups[0].members, [a, box])
  assert.doesNotThrow(() => parseLevel(smaller))
  assert.equal(deleteItem(smaller, box).editorGroups, undefined)
  const removed = deleteSelections(grouped, [b, c, box])
  assert.equal(removed.editorGroups, undefined)
  assert.equal(removed.platforms.length, 1)
})

test('clipboard duplication preserves separate group membership and remaps members across levels', () => {
  const level = groupSelections(scene(), [a, b, box])
  const clipboard = decodeEditorClipboard(encodeEditorClipboard(copySelections(level, [a, b, box])))
  const result = pasteSelections(level, clipboard)
  assert.equal(result.level.editorGroups.length, 2)
  assert.notEqual(result.level.editorGroups[0].id, result.level.editorGroups[1].id)
  assert.deepEqual(result.level.editorGroups[1].members, [pick('platform', 3), pick('platform', 4), pick('prop', 1)])
  assert.deepEqual(expandEditorGroups(result.level, [pick('platform', 3)]), result.selections)
  const foreign = pasteSelections(blankTrial(), clipboard)
  assert.deepEqual(foreign.level.editorGroups[0].members, [a, b, box])
  assert.notEqual(foreign.level.editorGroups[0].id, level.editorGroups[0].id)
  assert.doesNotThrow(() => parseLevel(foreign.level))
  assert.equal(pasteSelections(level, copySelections(level, [a])).level.editorGroups.length, 1, 'one copied member stays independent')
})

test('pit carving preserves grouped terrain fragments and remaps grouped ladders', () => {
  const level = { ...scene(), platforms: [{ x: 100, y: 400, w: 900, h: 400 }, { x: 1050, y: 500, w: 100, h: 100 }],
    climbables: { ropes: [], ladders: [{ x: 1034, top: 500, bottom: 800, platform: 1, side: 1 }] } }
  const grouped = groupSelections(level, [a, b, pick('ladder')])
  const carved = carvePit(grouped, { x: 400, y: 400 }, { x: 700, y: 750 })
  assert.deepEqual(carved.editorGroups[0].members, [a, b, c, pick('platform', 3), pick('ladder')])
  assert.equal(carved.climbables.ladders[0].platform, 3)
  assert.doesNotThrow(() => parseLevel(carved))
  assert.deepEqual(grouped.platforms, level.platforms)
})

test('external group metadata rejects invalid references, duplicate membership, unsupported kinds and unbounded lists', () => {
  const level = groupSelections(scene(), [a, b]), good = level.editorGroups[0]
  const invalid = [null, {}, [{ ...good, members: [a] }], [{ ...good, id: '' }], [good, good],
    [{ ...good, members: [a, a] }], [good, { id: 'other', members: [b, box] }],
    [{ ...good, members: [a, pick('platform', 99)] }], [{ ...good, members: [a, pick('goal', 1)] }],
    [{ ...good, members: [a, pick('__proto__')] }], [{ ...good, members: [a, pick('platform', .5)] }],
    [{ ...good, members: [a, pick('platform', -1)] }], Array(513).fill(good)]
  for (const editorGroups of invalid) assert.throws(() => parseLevel({ ...level, editorGroups }), /Invalid editor groups/)
  assert.equal(parseLevel(scene()).editorGroups, undefined, 'existing levels need no migration')
})

test('center snapping aligns centers and every bounding edge independently on both axes', () => {
  const level = scene()
  // A: x=200..300, y=200..280. Room center: 600,400.
  for (const [dx, expected] of [[347, 350], [397, 400], [297, 300]]) {
    assert.deepEqual(levelCenterSnap(level, [a], dx, 1, 8), { dx: expected, dy: null })
  }
  for (const [dy, expected] of [[157, 160], [197, 200], [117, 120]]) {
    assert.deepEqual(levelCenterSnap(level, [a], 1, dy, 8), { dx: null, dy: expected })
  }
  assert.deepEqual(levelCenterSnap(level, [a], 347, 157, 8), { dx: 350, dy: 160 })
  assert.deepEqual(levelCenterSnap(level, [a], 338, 148, 8), { dx: null, dy: null })
})

test('multi-selection snaps its overall center and bounds with one shared movement', () => {
  const level = scene(), items = [a, b]
  assert.equal(levelCenterSnap(level, items, 197, 0, 8).dx, 200, 'overall center')
  assert.equal(levelCenterSnap(level, items, 397, 0, 8).dx, 400, 'left bounds edge')
  assert.equal(levelCenterSnap(level, items, 3, 0, 8).dx, 0, 'right bounds edge')
  const aligned = levelCenterSnap(level, items, 197, 0, 8)
  const moved = moveSelections(level, items, aligned.dx, 0)
  assert.equal(moved.platforms[1].x - moved.platforms[0].x, 200)
  assert.equal(selectionBounds(moved, items).x + 200, 600)
})

test('center snapping retains exact half-unit centers and respects screen-space tolerances', () => {
  const level = { ...scene(), width: 1201, height: 801, floor: 801 }
  assert.deepEqual(levelCenterSnap(level, [a], 350, 160, 8), { dx: 350.5, dy: 160.5 })
  assert.equal(levelCenterSnap(level, [a], 340, 0, 8).dx, null)
  assert.equal(levelCenterSnap(level, [a], 340, 0, 8 / .5).dx, 350.5)
})
