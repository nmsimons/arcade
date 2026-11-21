import test from 'node:test'
import assert from 'node:assert/strict'
import { graffitiMarks } from '../src/games/jumping/graffitiWear.ts'
import { drawWallTexts } from '../src/games/jumping/wallText.ts'
import { wallWear } from '../src/games/jumping/wallWear.ts'
import { ARC, ARGUMENTS, CLOSE, LINE, MOVE, QUAD, RECT } from '../src/games/jumping/webgl/artPath.ts'

// Graffiti drips and wears (docs/jumping-wall-wear.md, Graffiti): drips from the strokes' lowest points on every
// piece, and flaked and faded paint by the room's stain level, as L.A.B. stamps wear.
const wear = (stains, id = 'graffiti-room') => wallWear({ id, ...(stains === 'heavy' ? {} : { stains }) })
const piece = (extra = {}) => ({ x: 300, y: 200, w: 400, h: 120, text: 'Hold jump. Then run.', fontSize: 40, align: 'left', ...extra })
const lettering = (text, extra = {}) => ({ w: text.w, h: text.h, fontSize: text.fontSize, align: text.align, lines: [text.text], baseline: 40, font: 'test', ...extra })
const LINE_HEIGHT = 52

/**
 * Each closed outline in a path, as its points (curves by their end points, arcs by their centre ± radius). A
 * drip's bead, a sub-path that is only an arc, joins the outline before it.
 */
function outlines(path) {
  const shapes = []
  let current = null
  for (let i = 0, c = path.commands; i < c.length; i += 1 + ARGUMENTS[c[i]]) {
    if (c[i] === MOVE && c[i + 3] === ARC && shapes.length) current = shapes.at(-1)
    else if (c[i] === MOVE) { current = [[c[i + 1], c[i + 2]]]; shapes.push(current) }
    else if (c[i] === LINE) current.push([c[i + 1], c[i + 2]])
    else if (c[i] === QUAD) current.push([c[i + 3], c[i + 4]])
    else if (c[i] === ARC) current.push([c[i + 1] - c[i + 3], c[i + 2] - c[i + 3]], [c[i + 1] + c[i + 3], c[i + 2] + c[i + 3]])
    else assert.ok(c[i] === CLOSE || c[i] === RECT, `unexpected command ${c[i]}`)
  }
  return shapes
}
const box = points => ({ x0: Math.min(...points.map(p => p[0])), y0: Math.min(...points.map(p => p[1])),
  x1: Math.max(...points.map(p => p[0])), y1: Math.max(...points.map(p => p[1])) })
const overlap = (a, b) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1
const noScan = () => null

/** An ink grid at one cell per unit holding the given filled rectangles, in the area's frame. */
function grid(w, h, rects) {
  const ink = new Uint8Array(w * h)
  for (const [x, y, rw, rh] of rects) for (let cy = y; cy < y + rh; cy++) for (let cx = x; cx < x + rw; cx++) ink[cy * w + cx] = 1
  return () => ({ width: w, height: h, res: 1, ink })
}

test('graffiti wears more as the room gets wetter, and stays fresh in a spotless room', () => {
  const none = graffitiMarks(piece(), lettering(piece()), LINE_HEIGHT, wear('none'), noScan)
  assert.equal(none.gone, null); assert.equal(none.faded, null)
  const marks = ['light', 'heavy'].map(level => outlines(graffitiMarks(piece(), lettering(piece()), LINE_HEIGHT, wear(level), noScan).gone).length)
  assert.ok(marks[0] >= 2, `even a lightly stained room flakes the paint: ${marks}`)
  assert.ok(marks[1] > marks[0], `heavy wears more than light: ${marks}`)
  // Paint thins in patches only at Heavy, in two steps: a ring and its core.
  assert.equal(graffitiMarks(piece(), lettering(piece()), LINE_HEIGHT, wear('light'), noScan).faded, null)
  const heavy = graffitiMarks(piece(), lettering(piece()), LINE_HEIGHT, wear('heavy'), noScan)
  assert.ok(outlines(heavy.thinnest).length >= 1)
  assert.equal(outlines(heavy.faded).length, outlines(heavy.thinnest).length * 2)
})

test('flaked marks and faded patches never overlap, so the even-odd clips remove each exactly once', () => {
  for (const level of ['light', 'heavy']) for (const id of ['a', 'b', 'c', 'd']) {
    const text = piece({ w: 600, h: 200, text: 'Nothing works in here but the way out is up there' })
    const worn = graffitiMarks(text, lettering(text), LINE_HEIGHT, wear(level, id), noScan)
    for (const shapes of [outlines(worn.gone).slice(0), worn.thinnest ? outlines(worn.thinnest) : []]) {
      const boxes = shapes.map(box)
      for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++)
        assert.ok(!overlap(boxes[i], boxes[j]), `${level} ${id}: marks ${i} and ${j} overlap`)
    }
    assert.deepEqual(worn.gone.commands.slice(0, 5), [RECT, 0, 0, 600, 200])
  }
})

test('drips and wear are random per piece and room, and the same on every visit', () => {
  const marks = (text = piece(), room = wear('heavy')) => graffitiMarks(text, lettering(text), LINE_HEIGHT, room, noScan).gone.commands
  const first = marks()
  assert.deepEqual(marks(), first)
  assert.deepEqual(marks({ ...piece() }), first)
  assert.notDeepEqual(marks(piece({ x: 500 })), first)
  assert.notDeepEqual(marks(piece({ text: 'Hold jump. Then walk.' })), first)
  assert.notDeepEqual(marks(piece(), wear('heavy', 'other-room')), first)
})

test('drips hang from the bottom of a stroke and stop short of the stroke below', () => {
  // A long bar of paint with a second bar 30 units under it.
  const text = piece({ w: 300, h: 100, fontSize: 40 })
  const scan = grid(300, 100, [[10, 10, 280, 10], [10, 50, 280, 10]])
  const { drips } = graffitiMarks(text, lettering(text), LINE_HEIGHT, wear('none'), scan)
  const shapes = outlines(drips)
  assert.ok(shapes.length >= 2, 'a long stroke drips')
  for (const shape of shapes) {
    const b = box(shape)
    // Each drip joins a bar's lower edge from inside it and runs down into the open wall, never into ink.
    const fromTop = b.y0 < 20 && b.y0 >= 10, fromBottom = b.y0 < 60 && b.y0 >= 50
    assert.ok(fromTop || fromBottom, `drip starts inside a stroke: ${JSON.stringify(b)}`)
    if (fromTop) assert.ok(b.y1 <= 50, `a drip from the top bar stops before the bar below: ${b.y1}`)
    assert.ok(b.y1 <= 100, 'a drip stays in the area')
  }
})

test('a tilted piece drips down the wall, not down its lettering', () => {
  // Turned 90° clockwise, the wall's down runs along the area's +x: drips grow to the right of a bar's edge.
  const text = piece({ w: 200, h: 200, fontSize: 40, rotation: 90 })
  const scan = grid(200, 200, [[40, 10, 10, 180]])
  const shapes = outlines(graffitiMarks(text, lettering(text), LINE_HEIGHT, wear('none'), scan).drips)
  assert.ok(shapes.length >= 1)
  for (const shape of shapes) {
    const b = box(shape)
    assert.ok(b.x0 >= 40 && b.x1 > 50, `drip runs to the right of the bar: ${JSON.stringify(b)}`)
  }
})

test('graffiti draws its lettering, drips and worn clips without a browser', () => {
  const calls = []
  const ctx = new Proxy({ getTransform: () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }), measureText: text => ({ width: text.length * 20, actualBoundingBoxAscent: 30 }) }, {
    get(target, key) { return key in target ? target[key] : (...args) => calls.push([key, args[1]]) },
    set(target, key, value) { target[key] = value; return true },
  })
  drawWallTexts(ctx, [{ ...piece(), style: 'graffiti' }], false, undefined, wear('heavy'))
  assert.ok(calls.some(([name]) => name === 'fillText'))
  assert.ok(calls.some(([name, rule]) => name === 'clip' && rule === 'evenodd'), 'flaked paint is clipped away')
})
