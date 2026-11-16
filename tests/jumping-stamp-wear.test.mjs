import test from 'node:test'
import assert from 'node:assert/strict'
import { LAB_STAMP_FADED } from '../src/branding/lab.ts'
import { labStampWear } from '../src/games/jumping/stampWear.ts'
import { drawWallTexts } from '../src/games/jumping/wallText.ts'
import { wallWear } from '../src/games/jumping/wallWear.ts'
import { ARGUMENTS, CLOSE, LINE, MOVE, RECT } from '../src/games/jumping/webgl/artPath.ts'

// L.A.B. wall stamps wear with the room's stain level (docs/jumping-wall-wear.md): chips, specks and scuffs of
// ink gone, and faded patches from Normal up, random per stamp and the same on every visit.
const LEVELS = ['none', 'light', 'heavy']
const wear = (stains, id = 'stamp-room') => wallWear({ id, ...(stains === 'heavy' ? {} : { stains }) })
const stamp = (extra = {}) => ({ x: 100, y: 200, w: 240, h: 110, text: 'L.A.B.\nexperiments', fontSize: 28, align: 'center', style: 'lab-stamp', ...extra })

/** Each closed outline in a path, as its points. */
function outlines(path) {
  const shapes = []
  let current = null
  for (let i = 0, c = path.commands; i < c.length; i += 1 + ARGUMENTS[c[i]]) {
    if (c[i] === MOVE) { current = [[c[i + 1], c[i + 2]]]; shapes.push(current) }
    else if (c[i] === LINE) current.push([c[i + 1], c[i + 2]])
    else assert.ok(c[i] === CLOSE || c[i] === RECT, `unexpected command ${c[i]}`)
  }
  return shapes
}
const box = points => ({ x0: Math.min(...points.map(p => p[0])), y0: Math.min(...points.map(p => p[1])),
  x1: Math.max(...points.map(p => p[0])), y1: Math.max(...points.map(p => p[1])) })
const overlap = (a, b) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1

test('a stamp wears more as the room gets wetter, and not at all in a spotless room', () => {
  assert.equal(labStampWear(stamp(), wear('none')), null)
  const marks = LEVELS.slice(1).map(level => outlines(labStampWear(stamp(), wear(level)).gone).length)
  for (let i = 1; i < marks.length; i++) assert.ok(marks[i] > marks[i - 1], `${LEVELS[i + 1]} wears more than ${LEVELS[i]}: ${marks}`)
  assert.ok(marks[0] >= 4, `even a lightly stained room chips the stamp: ${marks}`)
  // Ink fades only from Normal up.
  assert.equal(labStampWear(stamp(), wear('light')).faded, null)
  for (const level of ['heavy']) assert.ok(outlines(labStampWear(stamp(), wear(level)).faded).length >= 1, level)
})

test('worn marks never overlap, so the even-odd clips remove each exactly once', () => {
  for (const level of LEVELS.slice(1)) for (const id of ['a', 'b', 'c', 'd']) {
    const worn = labStampWear(stamp({ w: 300, h: 140 }), wear(level, id))
    for (const shapes of [outlines(worn.gone), worn.faded ? outlines(worn.faded) : []]) {
      const boxes = shapes.map(box)
      for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++)
        assert.ok(!overlap(boxes[i], boxes[j]), `${level} ${id}: marks ${i} and ${j} overlap`)
    }
    // The clips' outer rectangle is the stamp's own.
    assert.deepEqual(worn.gone.commands.slice(0, 5), [RECT, 0, 0, 300, 140])
  }
})

test('wear is random per stamp and room, and the same on every visit', () => {
  const first = labStampWear(stamp(), wear('heavy')).gone.commands
  assert.deepEqual(labStampWear(stamp(), wear('heavy')).gone.commands, first)
  assert.deepEqual(labStampWear({ ...stamp() }, wallWear({ id: 'stamp-room', stains: 'heavy' })).gone.commands, first)
  assert.notDeepEqual(labStampWear(stamp({ x: 400 }), wear('heavy')).gone.commands, first)
  assert.notDeepEqual(labStampWear(stamp(), wear('heavy', 'other-room')).gone.commands, first)
})

function recorder() {
  const calls = []
  const ctx = { globalAlpha: 1, fillStyle: '', strokeStyle: '', lineWidth: 1, getTransform: () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }) }
  for (const name of ['save', 'restore', 'beginPath', 'rect', 'translate', 'rotate', 'scale', 'setLineDash'])
    ctx[name] = (...args) => calls.push([name, ...args])
  ctx.clip = (...args) => calls.push(['clip', ...args])
  ctx.strokeRect = () => calls.push(['strokeRect', ctx.globalAlpha])
  ctx.fill = () => calls.push(['fill', ctx.globalAlpha])
  return { ctx, calls }
}

test('a stamp is drawn through its wear, with faded ink thinner and never laid twice', () => {
  const clean = recorder()
  drawWallTexts(clean.ctx, [stamp()], false, undefined, wear('none'))
  assert.deepEqual(clean.calls.filter(c => c[0] === 'clip').length, 1, 'only the text area clip')
  assert.deepEqual(clean.calls.filter(c => c[0] === 'strokeRect').map(c => c[1]), [.9])

  const soaked = recorder(), worn = labStampWear(stamp(), wear('heavy'))
  drawWallTexts(soaked.ctx, [stamp()], false, undefined, wear('heavy'))
  const clips = soaked.calls.filter(c => c[0] === 'clip')
  assert.deepEqual(clips.slice(1).map(c => [c[1], c[2]]), [[worn.gone, 'evenodd'], [worn.unfaded, 'evenodd'], [worn.faded, undefined]])
  // Full ink, then the faded patches: each the border and the logo's two fills, once.
  assert.deepEqual(soaked.calls.filter(c => c[0] === 'strokeRect').map(c => c[1]), [.9, .9 * LAB_STAMP_FADED])
  assert.equal(soaked.calls.filter(c => c[0] === 'fill').length, 4)
})

test('wall text drawn without a level wears its stamps as a Normal room would', () => {
  const plain = recorder()
  drawWallTexts(plain.ctx, [stamp()])
  assert.equal(plain.calls.filter(c => c[0] === 'clip')[1][1], labStampWear(stamp(), wallWear()).gone)
})
