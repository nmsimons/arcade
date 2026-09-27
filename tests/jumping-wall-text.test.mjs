import test from 'node:test'
import assert from 'node:assert/strict'
import { blankTrial, newLevel, levelProblems, parseLevel } from '../src/games/jumping/level.ts'
import { addItem, deleteItem, duplicateItem, hitItem, itemOutline, moveItem, resizeItem, resizeLevelHeight, setWallTextRotation } from '../src/games/jumping/editor.ts'
import { wallTextBounds, wallTextLines, wallTextPoint } from '../src/games/jumping/wallText.ts'
import { createRun, stepRun } from '../src/games/jumping/challenge.ts'
import { NEUTRAL_INPUT } from '../src/games/jumping/model.ts'

test('wall text supports editing, duplication, room resizing, and lossless JSON for trials and playgrounds', () => {
  for (const source of [blankTrial(), newLevel()]) {
    const { level, selection } = addItem(source, 'text', { x: 300, y: 200 }, { x: 700, y: 320 })
    level.texts[0].text = 'Hold to charge.\nRelease to jump.'
    level.texts[0].align = 'center'
    const duplicate = duplicateItem(level, selection)
    duplicate.level.texts[1].text = 'Another route →'
    assert.equal(level.texts[0].text, 'Hold to charge.\nRelease to jump.')
    let edited = moveItem(duplicate.level, duplicate.selection, 500, 100)
    edited = resizeItem(edited, duplicate.selection, 240, 160)
    assert.deepEqual(hitItem(edited, 850, 310, 0), duplicate.selection)
    assert.deepEqual(parseLevel(JSON.parse(JSON.stringify(edited))), edited)
    assert.deepEqual(levelProblems(edited), [])
    const originalHeight = edited.floor ?? edited.height
    const taller = resizeLevelHeight(edited, originalHeight + 300)
    assert.equal(taller.texts[0].y, 500)
    assert.equal(taller.texts[1].y, 600)
    assert.equal(resizeLevelHeight(taller, 400).height, originalHeight - 200, 'shrinking stops before cropping the highest text')
    assert.deepEqual(deleteItem(taller, selection).texts, [taller.texts[1]])
    const bounded = moveItem(edited, duplicate.selection, 50000, 50000).texts[1]
    assert.equal(bounded.x + bounded.w, edited.width)
    assert.equal(bounded.y + bounded.h, originalHeight)
  }
})

test('wall text is behind terrain, stays attached to the wall, and never changes player or prop physics', () => {
  const level = blankTrial()
  level.props = [{ kind: 'box', x: 420, y: 920, size: 60 }, { kind: 'ball', x: 700, y: 920, size: 60 }]
  const decorated = addItem(level, 'text', { x: 200, y: 800 }, { x: 900, y: 920 }).level
  const front = { ...decorated, platforms: [{ x: 200, y: 800, w: 100, h: 100 }] }
  assert.deepEqual(hitItem(front, 250, 850, 0), { kind: 'platform', index: 0 })
  assert.deepEqual(moveItem(front, { kind: 'platform', index: 0 }, 100, 0).texts, decorated.texts)
  const plainRun = createRun(level), textRun = createRun(decorated)
  for (let i = 0; i < 400; i++) {
    const input = { ...NEUTRAL_INPUT, move: 1, jump: i >= 100 && i < 135 }
    stepRun(plainRun, input); stepRun(textRun, input)
    assert.deepEqual(textRun.player, plainRun.player)
    assert.deepEqual(textRun.props, plainRun.props)
  }
})

test('wall text imports are bounded, and old files do not acquire a text field', () => {
  const legacy = blankTrial(); delete legacy.texts
  assert.deepEqual(parseLevel(legacy), legacy)
  const valid = { x: 100, y: 200, w: 320, h: 100, text: '<b>Literal text</b>\n→', fontSize: 24, align: 'left' }
  assert.deepEqual(parseLevel({ ...legacy, texts: [valid] }).texts, [valid])
  for (const value of [null, 12, Array(81).fill(valid), ...[
    { text: 2 }, { text: 'a'.repeat(1001) }, { fontSize: 97 }, { fontSize: 0 }, { align: 'bottom' },
    { x: -1 }, { y: 900 }, { w: 2001 }, { h: 0 }, { fontSize: NaN },
    { style: 'url(https://example.com/font)' }, { style: 1 }, { rotation: '30' }, { rotation: NaN }, { rotation: 181 }, { rotation: -181 },
  ].map(patch => [{ ...valid, ...patch }])]) assert.throws(() => parseLevel({ ...legacy, texts: value }))
})

for (const rotation of [-180, -90, -25, 0, 30, 90, 180]) test(`wall text at ${rotation} degrees selects, moves, resizes and round-trips in both styles`, () => {
  for (const style of ['official', 'graffiti']) {
    const added = addItem(blankTrial(), 'text', { x: 400, y: 350 }, { x: 720, y: 470 })
    let level = setWallTextRotation(added.level, 0, rotation)
    const text = level.texts[0], selection = added.selection
    text.style = style
    const inside = wallTextPoint(text, 8, 8), outside = wallTextPoint(text, -5, -5)
    assert.deepEqual(hitItem(level, inside.x, inside.y, 0), selection)
    assert.notDeepEqual(hitItem(level, outside.x, outside.y, 0), selection)
    assert.deepEqual(itemOutline(level, selection), wallTextBounds(text))
    const fixed = wallTextPoint(text, 0, 0)
    level = resizeItem(level, selection, 380, 160, 'bottom-right')
    const after = wallTextPoint(level.texts[0], 0, 0)
    assert.ok(Math.hypot(after.x - fixed.x, after.y - fixed.y) < 1e-6, 'the opposite corner stays planted')
    const copy = duplicateItem(level, selection)
    assert.equal(copy.level.texts[1].style, style); assert.equal(copy.level.texts[1].rotation, rotation)
    for (const direction of [-1, 1]) {
      const moved = moveItem(level, selection, direction * 50000, direction * 50000)
      assert.deepEqual(levelProblems(moved), [])
      assert.deepEqual(parseLevel(JSON.parse(JSON.stringify(moved))), moved)
      const b = wallTextBounds(moved.texts[0])
      assert.ok(b.x >= -.001 && b.y >= -.001 && b.x + b.w <= moved.width + .001 && b.y + b.h <= moved.height + .001)
    }
    const taller = resizeLevelHeight(level, 1300)
    assert.equal(taller.texts[0].rotation, rotation)
    assert.deepEqual(parseLevel(JSON.parse(JSON.stringify(taller))), taller)
  }
})

test('rotating a large text area fits it inside the room and height reduction respects the rotated top', () => {
  const added = addItem(blankTrial(), 'text', { x: 0, y: 0 }, { x: 1600, y: 800 })
  for (const rotation of [45, 90, -90]) {
    const level = setWallTextRotation(added.level, 0, rotation)
    assert.deepEqual(levelProblems(level), [])
    assert.deepEqual(parseLevel(JSON.parse(JSON.stringify(level))), level)
    const shorter = resizeLevelHeight(level, 400)
    assert.deepEqual(levelProblems(shorter), [])
  }
})

test('a long vertical text area fits a narrow room and stays valid when the ceiling is lowered', () => {
  const source = { ...blankTrial(), width: 800, height: 2200, floor: 2200, spawn: { x: 160, y: 2200 }, goal: { x: 640, y: 2200 } }
  const added = addItem(source, 'text', { x: 200, y: 1000 }, { x: 400, y: 1060 })
  let level = setWallTextRotation(added.level, 0, 90)
  level = resizeItem(level, added.selection, 1800, 120)
  assert.equal(level.texts[0].w, 1800, 'local text width follows the tall dimension after rotation')
  assert.deepEqual(parseLevel(level), level)
  level = resizeLevelHeight(level, 1900)
  assert.deepEqual(parseLevel(level), level)
  assert.deepEqual(levelProblems(level), [])
})

test('wall text wraps words, long words and Unicode without losing explicit blank lines', () => {
  const measure = value => [...value].length * 10
  assert.deepEqual(wallTextLines('Hold to charge.\n\nRelease to jump.', 100, measure), ['Hold to', 'charge.', '', 'Release to', 'jump.'])
  assert.deepEqual(wallTextLines('abcdefghijk', 40, measure), ['abcd', 'efgh', 'ijk'])
  assert.deepEqual(wallTextLines('→ 🙂🙂🙂🙂🙂', 40, measure), ['→', '🙂🙂🙂🙂', '🙂'])
})
