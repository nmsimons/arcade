import test from 'node:test'
import assert from 'node:assert/strict'
import { blankTrial, newLevel, levelProblems, parseLevel } from '../src/games/jumping/level.ts'
import { addItem, deleteItem, duplicateItem, hitItem, moveItem, resizeItem, resizeLevelHeight } from '../src/games/jumping/editor.ts'
import { wallTextLines } from '../src/games/jumping/wallText.ts'
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
  ].map(patch => [{ ...valid, ...patch }])]) assert.throws(() => parseLevel({ ...legacy, texts: value }))
})

test('wall text wraps words, long words and Unicode without losing explicit blank lines', () => {
  const measure = value => [...value].length * 10
  assert.deepEqual(wallTextLines('Hold to charge.\n\nRelease to jump.', 100, measure), ['Hold to', 'charge.', '', 'Release to', 'jump.'])
  assert.deepEqual(wallTextLines('abcdefghijk', 40, measure), ['abcd', 'efgh', 'ijk'])
  assert.deepEqual(wallTextLines('→ 🙂🙂🙂🙂🙂', 40, measure), ['→', '🙂🙂🙂🙂', '🙂'])
})
