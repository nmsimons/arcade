import test from 'node:test'
import assert from 'node:assert/strict'
import { encodeEditorClipboard, decodeEditorClipboard, MAX_CLIPBOARD_BYTES } from '../src/games/jumping/editorClipboard.ts'
import { copySelections, pasteSelections } from '../src/games/jumping/editorSelection.ts'
import { blankTrial, copyLevel } from '../src/games/jumping/level.ts'

const pick = (kind, index = 0) => ({ kind, index })
function scene() {
  return { ...blankTrial(), id: 'clipboard-source', width: 1800, height: 1000, floor: 1000,
    platforms: [{ x: 300, y: 300, w: 240, h: 180, material: 'earth' },
      { x: 600, y: 500, w: 240, h: 180, material: 'steel', polygon: [[0,0],[240,60],[240,180],[0,180]] }],
    climbables: { ropes: [{ x: 300, y: 300, length: 180, segments: 23, anchor: { platform: 0, x: 0, y: 0 } }],
      ladders: [{ x: 284, top: 300, bottom: 700, side: 1, platform: 0 }] },
    mechanisms: [{ id: 'lift', kind: 'lift', x: 800, y: 600, w: 120, h: 20, travel: 100 }],
    triggers: [{ x: 810, y: 600, w: 80, mode: 'touch', targets: ['lift'], mount: { mechanism: 'lift', x: 10 } }] }
}

test('a serialized clipboard preserves polygon geometry, attachments, mounts and internal wiring across levels', () => {
  const source = scene(), original = copyLevel(source)
  const copied = copySelections(source, [pick('platform'), pick('platform', 1), pick('rope'), pick('ladder'), pick('mechanism'), pick('trigger')])
  const decoded = decodeEditorClipboard(encodeEditorClipboard(copied))
  const result = pasteSelections({ ...blankTrial(), id: 'clipboard-target', height: 1000, floor: 1000 }, decoded, 40, 40)
  assert.deepEqual(result.level.platforms[1].polygon, source.platforms[1].polygon)
  assert.equal(result.level.platforms[0].material, 'earth')
  assert.equal(result.level.climbables.ropes[0].anchor.platform, 0)
  assert.equal(result.level.climbables.ladders[0].platform, 0)
  assert.deepEqual(result.level.triggers[0].targets, [result.level.mechanisms[0].id])
  assert.equal(result.level.triggers[0].mount.mechanism, result.level.mechanisms[0].id)
  assert.notEqual(result.level.mechanisms[0].id, source.mechanisms[0].id)
  assert.deepEqual(source, original)
})

test('serialization omits unfinished derived rope caches without mutating the copied draft', () => {
  const source = scene()
  source.climbables.ropes[0].rest = { key: 'preview:unfinished', points: [] }
  const copied = copySelections(source, [pick('platform')])
  const decoded = decodeEditorClipboard(encodeEditorClipboard(copied))
  assert.equal(decoded.level.climbables.ropes[0].rest, undefined)
  assert.equal(copied.level.climbables.ropes[0].rest.key, 'preview:unfinished')
})

test('serialized external switch connections are retained in the source level and omitted elsewhere', () => {
  const source = scene(), decoded = decodeEditorClipboard(encodeEditorClipboard(copySelections(source, [pick('trigger')])))
  assert.deepEqual(pasteSelections(source, decoded).level.triggers[1].targets, ['lift'])
  assert.deepEqual(pasteSelections({ ...blankTrial(), height: 1000, floor: 1000 }, decoded).level.triggers[0].targets, [])
})

test('clipboard parsing ignores unrelated text and rejects invalid versions, geometry and selections', () => {
  assert.equal(decodeEditorClipboard('a normal text field'), null)
  assert.equal(decodeEditorClipboard('{not json'), null)
  assert.equal(decodeEditorClipboard('{"version":1,"level":{}}'), null)
  const data = JSON.parse(encodeEditorClipboard(copySelections(scene(), [pick('platform')])))
  for (const selections of [[], [pick('entrance')], [pick('platform', -1)], [pick('platform', .5)],
    [pick('platform', 3)], [pick('__proto__')], [null], [pick('platform'), pick('platform')]]) {
    assert.throws(() => decodeEditorClipboard(JSON.stringify({ ...data, selections })))
  }
  assert.throws(() => decodeEditorClipboard(JSON.stringify({ ...data, version: 2 })), /unsupported version/)
  data.level.platforms[0].w = -10
  assert.throws(() => decodeEditorClipboard(JSON.stringify(data)), /not a valid jumping level/)
})

test('clipboard limits bound both string length and UTF-8 bytes', () => {
  assert.throws(() => decodeEditorClipboard('x'.repeat(MAX_CLIPBOARD_BYTES + 1)), /size limit/)
  assert.throws(() => decodeEditorClipboard('🙂'.repeat(Math.ceil(MAX_CLIPBOARD_BYTES / 3))), /size limit/)
})
