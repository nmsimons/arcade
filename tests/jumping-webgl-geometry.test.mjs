import assert from 'node:assert/strict'
import test from 'node:test'
import { ArtPath, IDENTITY, MOVE, LINE, CUBIC, CLOSE, ELLIPSE, TARC, appendTransformed, arcCubics, expandArcs, roundRectCommands, svgPathCommands } from '../src/games/jumping/webgl/artPath.ts'
import { dashContours, earClip, flatten, isConvex, strokeTriangles, thinStrokeQuads, FLOATS_PER_VERTEX, THIN } from '../src/games/jumping/webgl/geometry.ts'
import { GlRecorder, parseColor } from '../src/games/jumping/webgl/recorder.ts'
import { SceneBuilder, ShapeCache, buildScene } from '../src/games/jumping/webgl/scene.ts'

const close = (a, b, epsilon = 1e-9) => assert.ok(Math.abs(a - b) <= epsilon, `${a} is not within ${epsilon} of ${b}`)
/** Unsigned area covered by a triangle list, counting overlaps once per triangle. */
const triangleArea = vertices => {
  let area = 0
  for (let v = 0; v < vertices.length; v += FLOATS_PER_VERTEX * 3) {
    const [ax, ay] = vertices.slice(v, v + 2), [bx, by] = vertices.slice(v + FLOATS_PER_VERTEX, v + FLOATS_PER_VERTEX + 2)
    const [cx, cy] = vertices.slice(v + FLOATS_PER_VERTEX * 2, v + FLOATS_PER_VERTEX * 2 + 2)
    area += Math.abs((bx - ax) * (cy - ay) - (by - ay) * (cx - ax)) / 2
  }
  return area
}

test('colours parse as Canvas reads them, and unknown forms are refused', () => {
  assert.deepEqual(parseColor('#fff'), [1, 1, 1, 1])
  assert.deepEqual(parseColor('#00000080').map(v => +v.toFixed(3)), [0, 0, 0, .502])
  assert.deepEqual(parseColor('#52635421').map(v => Math.round(v * 255)), [0x52, 0x63, 0x54, 0x21])
  assert.deepEqual(parseColor('rgba(91,111,94,0.5)').map(v => +v.toFixed(3)), [.357, .435, .369, .5])
  assert.equal(parseColor('hsl(0 0% 0%)'), null)
  assert.equal(parseColor('#12345'), null)
})

test('flattening follows Canvas: lines after a close restart at its start, repeats drop, curves stay within tolerance', () => {
  const contours = flatten([MOVE, 0, 0, LINE, 10, 0, LINE, 10, 0, LINE, 10, 10, CLOSE, LINE, 0, 20], .1)
  assert.deepEqual(contours, [{ points: [0, 0, 10, 0, 10, 10], closed: true }, { points: [0, 0, 0, 20], closed: false }])
  // A line with no current point starts a subpath there.
  assert.deepEqual(flatten([LINE, 5, 5, LINE, 6, 5], .1), [{ points: [5, 5, 6, 5], closed: false }])
  // A quarter circle as one quadratic: every flattened point lies on the curve, so each chord's midpoint is the error.
  const [curve] = flatten([MOVE, 0, 0, 2, 50, 0, 50, 50], .05)
  const p = curve.points
  for (let k = 2; k < p.length; k += 2) {
    const t = (k / 2 - .5) / (p.length / 2 - 1), u = 1 - t
    const x = 2 * u * t * 50 + t * t * 50, y = t * t * 50
    assert.ok(Math.hypot((p[k - 2] + p[k]) / 2 - x, (p[k - 1] + p[k + 1]) / 2 - y) < .06)
  }
})

test('only one outline that turns one way, once, is convex', () => {
  assert.equal(isConvex([{ points: [0, 0, 10, 0, 10, 10, 0, 10], closed: true }]), true)
  assert.equal(isConvex([{ points: [0, 0, 10, 0, 10, 5, 5, 5, 5, 10, 0, 10], closed: true }]), false)
  assert.equal(isConvex([{ points: [0, 0, 10, 10, 10, 0, 0, 10], closed: true }]), false)
  assert.equal(isConvex([{ points: [0, 0, 1, 0, 1, 1], closed: true }, { points: [5, 5, 6, 5, 6, 6], closed: true }]), false)
  // A pentagram turns one way but twice.
  const star = []
  for (let k = 0; k < 5; k++) { const a = k * 4 * Math.PI / 5; star.push(Math.cos(a), Math.sin(a)) }
  assert.equal(isConvex([{ points: star, closed: true }]), false)
})

test('ear clipping covers a simple outline exactly and refuses one that crosses itself', () => {
  const lShape = []; assert.equal(earClip([0, 0, 10, 0, 10, 5, 5, 5, 5, 10, 0, 10], lShape), true)
  close(triangleArea(lShape), 75)
  // Collinear and repeated points add no triangles.
  const square = []; assert.equal(earClip([0, 0, 5, 0, 10, 0, 10, 10, 10, 10, 0, 10], square), true)
  close(triangleArea(square), 100)
  // Clockwise or counter-clockwise alike.
  const reversed = []; assert.equal(earClip([0, 10, 5, 10, 5, 5, 10, 5, 10, 0, 0, 0], reversed), true)
  close(triangleArea(reversed), 75)
  const bowtie = []; assert.equal(earClip([0, 0, 10, 10, 10, 0, 0, 10], bowtie), false)
})

test('thick strokes cover the line, its caps and its joins', () => {
  const style = { width: 4, cap: 'butt', join: 'miter', miterLimit: 10 }
  const line = []; strokeTriangles([{ points: [0, 0, 100, 0], closed: false }], style, .5, line)
  close(triangleArea(line), 400)
  const round = []; strokeTriangles([{ points: [0, 0, 100, 0], closed: false }], { ...style, cap: 'round' }, .05, round)
  close(triangleArea(round), 400 + Math.PI * 4, .05)
  const square = []; strokeTriangles([{ points: [0, 0, 100, 0], closed: false }], { ...style, cap: 'square' }, .5, square)
  close(triangleArea(square), 400 + 2 * 2 * 4)
  // A right-angle miter adds the corner square once, beyond the two segment quads.
  const corner = []; strokeTriangles([{ points: [0, 0, 100, 0, 100, 100], closed: false }], style, .5, corner)
  close(triangleArea(corner), 2 * 400 + 2 * 2 / 2 + 2 * 2 / 2)
  // Beyond the miter limit, Canvas bevels: the miter triangle is left out.
  const sharp = []; strokeTriangles([{ points: [0, 0, 100, 0, 0, 1], closed: false }], style, .5, sharp)
  const sharpRound = []; strokeTriangles([{ points: [0, 0, 100, 0, 0, 1], closed: false }], { ...style, join: 'round' }, .5, sharpRound)
  assert.ok(triangleArea(sharp) < triangleArea(sharpRound))
})

test('thin strokes carry their half width and signed distance across for exact coverage', () => {
  const quads = []; thinStrokeQuads([{ points: [0, 0, 10, 0], closed: false }], { width: .5, cap: 'butt', join: 'miter', miterLimit: 10 }, 1, quads)
  assert.equal(quads.length, 6 * FLOATS_PER_VERTEX)
  for (let v = 0; v < quads.length; v += FLOATS_PER_VERTEX) {
    const [, y, mode, across, half] = quads.slice(v, v + FLOATS_PER_VERTEX)
    assert.equal(mode, THIN); assert.equal(half, .25); close(across, y); close(Math.abs(across), 1.25)
  }
})

test('ArtPath records what Canvas draws, and addPath applies the matrix to every point', () => {
  const tuft = new ArtPath(); tuft.moveTo(0, 0); tuft.lineTo(1, 0); tuft.rect(0, 0, 2, 1)
  const slice = new ArtPath(); slice.addPath(tuft, { a: 0, b: 1, c: -1, d: 0, e: 10, f: 20 })
  assert.equal(slice.unsupported, false)
  const [first, second] = flatten(slice.commands, .1)
  assert.deepEqual(first.points, [10, 20, 10, 21])
  assert.deepEqual(second.points.map(v => +v.toFixed(9)), [10, 20, 10, 22, 9, 22, 9, 20])
  // A full circle in quarter-turn cubics stays on the circle.
  const { start, curves } = arcCubics(0, 0, 10, 10, 0, 0, Math.PI * 2, false)
  assert.equal(curves.length, 4); close(start[0], 10); close(start[1], 0)
  for (const c of curves) close(Math.hypot(c[4], c[5]), 10, 1e-9)
})

test('the recorder keeps world units, reports its zoom, nests clips and refuses what it cannot draw', () => {
  const recorder = new GlRecorder(2), ctx = recorder.asContext()
  assert.equal(ctx.getTransform().a, 2)
  ctx.save(); ctx.translate(100, 0); ctx.beginPath(); ctx.rect(0, 0, 50, 50); ctx.clip()
  ctx.fillStyle = '#ff000080'; ctx.fillRect(10, 10, 5, 5)
  ctx.restore()
  assert.deepEqual(recorder.ops.map(op => op.kind), ['clip', 'fill', 'unclip'])
  assert.equal(recorder.ops[1].depth, 1)
  assert.deepEqual(flatten(recorder.ops[1].commands, .1)[0].points, [110, 10, 115, 10, 115, 15, 110, 15])
  assert.deepEqual(recorder.ops[1].box, { x0: 110, y0: 10, x1: 115, y1: 15 })
  assert.equal(recorder.unsupported, null)
  // A retained layer is placed by the camera later; device-space artwork cannot be part of it.
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  assert.equal(recorder.unsupported, 'absolute transform')
})

test("a frame recording is the camera: device transforms, the canvas size, culling, and each draw's light", () => {
  const view = { x: 100, y: 50, zoom: 2, width: 400, height: 300 }
  const recorder = new GlRecorder(2, view), ctx = recorder.asContext()
  const t = ctx.getTransform()
  assert.deepEqual([t.a, t.d, t.e, t.f], [2, 2, -200, -100])
  assert.deepEqual(recorder.canvas, { width: 400, height: 300 })
  // On screen, then wholly off it (the view spans x 100..300, y 50..200).
  ctx.fillRect(120, 60, 10, 10); ctx.fillRect(400, 60, 10, 10)
  assert.equal(recorder.ops.length, 1)
  // Device-space drawing (a cached glow, say) lands back in world units.
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillRect(20, 20, 2, 2); ctx.restore()
  const box = recorder.ops[1].box
  assert.ok(Math.abs(box.x0 - 110) < 1e-9 && Math.abs(box.y0 - 60) < 1e-9 && Math.abs(box.x1 - 111) < 1e-9)
  recorder.light = { floor: 1, receives: false }
  ctx.fillText('7', 150, 100)
  assert.equal(recorder.ops[2].kind, 'text')
  assert.deepEqual(recorder.ops[2].light, { floor: 1, receives: false })
  assert.equal(recorder.unsupported, null)
  ctx.globalCompositeOperation = 'multiply'; ctx.fillRect(120, 60, 10, 10)
  assert.equal(recorder.unsupported, 'composite multiply')
})

test('roundRect follows Canvas: radii lists, scaling when they overlap, and a new subpath at the corner', () => {
  const out = []
  roundRectCommands(out, 0, 0, 10, 4, [3, 1])
  // Upper left 3, upper right 1 (two radii pair diagonally): 3 + 1 fits both across and down.
  assert.deepEqual(out.slice(0, 3), [MOVE, 3, 0])
  // Radii of 5 on a side of 4 overlap: all of them scale by 4/10.
  const scaled = []; roundRectCommands(scaled, 0, 0, 10, 4, 5)
  assert.deepEqual(scaled.slice(0, 3), [MOVE, 2, 0])
  assert.deepEqual(out.slice(-4), [CLOSE, MOVE, 0, 0])
  const contour = flatten(out, .01)[0]
  assert.equal(contour.closed, true)
  const xs = contour.points.filter((_, i) => i % 2 === 0), ys = contour.points.filter((_, i) => i % 2 === 1)
  assert.deepEqual([Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)], [0, 10, 0, 4])
  assert.throws(() => roundRectCommands([], 0, 0, 10, 10, -1), RangeError)
  assert.throws(() => roundRectCommands([], 0, 0, 10, 10, [1, 2, 3, 4, 5]), RangeError)
  const path = new ArtPath(); path.roundRect(0, 0, 10, 10, 2)
  assert.equal(path.unsupported, false)
  assert.equal(path.commands.filter(c => c === CUBIC).length >= 4, true)
})

test('SVG path data: absolute and relative commands, implicit lines, and endpoint arcs', () => {
  assert.deepEqual(svgPathCommands('M6 -21L-14 3L-2 3Z'), [MOVE, 6, -21, LINE, -14, 3, LINE, -2, 3, CLOSE])
  assert.deepEqual(svgPathCommands('M1 2 3 4h5v-6'), [MOVE, 1, 2, LINE, 3, 4, LINE, 8, 4, LINE, 8, -2])
  // A half circle of radius 20 from (20, 0) to (-20, 0), sweeping through +y.
  const arc = svgPathCommands('M20 0a20 20 0 1 1-40 0')
  assert.equal(arc[3], ELLIPSE)
  const normal = []; appendTransformed(normal, new ArtPath('M20 0a20 20 0 1 1-40 0').commands, IDENTITY)
  const points = flatten(normal, .01)[0].points
  for (let k = 0; k < points.length; k += 2) assert.ok(Math.abs(Math.hypot(points[k], points[k + 1]) - 20) < .02 && points[k + 1] >= -1e-9)
  assert.equal(svgPathCommands('M0 0 X1'), null)
  assert.equal(new ArtPath('M0 0 X1').unsupported, true)
  const copy = new ArtPath(new ArtPath('M0 0L1 1'))
  assert.deepEqual(copy.commands, [MOVE, 0, 0, LINE, 1, 1])
})

test("transformed arcs are a line to the start, then Canvas's quarter-turn cubics through the matrix", () => {
  const m = { a: 1.3, b: .4, c: -.2, d: .9, e: 12, f: -7 }
  const at = (x, y) => [m.a * x + m.c * y + m.e, m.b * x + m.d * y + m.f]
  for (const [rx, ry, rotation, start, end, ccw] of [[5, 5, 0, 0, Math.PI * 2, false], [8, 3, .7, -1, 2.5, true], [4, 6, -.3, 3, 1, false], [2, 2, 0, 1, 1, false]]) {
    const arc = [], through = []
    appendTransformed(arc, [ELLIPSE, 3, 4, rx, ry, rotation, start, end, ccw ? 1 : 0], m)
    assert.equal(arc[0], TARC)
    const direct = expandArcs(arc)
    const pieces = arcCubics(3, 4, rx, ry, rotation, start, end, ccw)
    through.push(LINE, ...at(...pieces.start))
    for (const p of pieces.curves) through.push(CUBIC, ...at(p[0], p[1]), ...at(p[2], p[3]), ...at(p[4], p[5]))
    assert.equal(direct.length, through.length)
    for (let i = 0; i < direct.length; i++) assert.ok(Math.abs(direct[i] - through[i]) < 1e-9, `${i}: ${direct[i]} vs ${through[i]}`)
  }
})

test('dashes restart on each subpath at the offset and run on around a closed one', () => {
  const pieces = dashContours([{ points: [0, 0, 10, 0], closed: false }], [3, 2], 1)
  assert.deepEqual(pieces.map(p => p.points), [[0, 0, 2, 0], [4, 0, 7, 0], [9, 0, 10, 0]])
  const square = dashContours([{ points: [0, 0, 4, 0, 4, 4, 0, 4], closed: true }], [6, 2], 0)
  assert.deepEqual(square.map(p => p.points), [[0, 0, 4, 0, 4, 2], [4, 4, 0, 4, 0, 2]])
})

// One frame of a SceneBuilder: `draw` records with the frame's context.
const buildFrame = (builder, draw, view = { x: 0, y: 0, zoom: 1, width: 500, height: 500 }) => {
  const recorder = new GlRecorder(view.zoom, view), ctx = recorder.asContext()
  draw(ctx)
  builder.reset(view.zoom, view); builder.add(recorder.ops); builder.finish()
  return { stats: { ...builder.stats }, passes: builder.passes, vertices: [...new Float32Array(builder.vertexView.slice().buffer)].filter((_, k) => k % 6 < 2) }
}
// A curved outline that is no ellipse, so it goes through the shape cache.
const leaf = ctx => { ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(10, -20, 20, 0); ctx.lineTo(10, 14); ctx.closePath(); ctx.fill() }

test('frames keep shapes seen two frames running and reuse their triangles wherever they move and turn; changing shapes are not kept', () => {
  const cache = new ShapeCache(), builder = new SceneBuilder(cache)
  const at = (x, angle) => buildFrame(builder, ctx => { ctx.fillStyle = '#336699'; ctx.translate(x, 40); ctx.rotate(angle); leaf(ctx) })
  const a = at(100.25, 0), kept = at(140, 0), b = at(173.5, 0)
  assert.equal(a.stats.misses, 1); assert.equal(kept.stats.misses, 1); assert.equal(b.stats.hits, 1)
  assert.ok(cache.size > 0)
  // The same triangles, moved with the shape.
  assert.equal(b.vertices.length, a.vertices.length)
  for (let k = 0; k < a.vertices.length; k += 2) { close(b.vertices[k] - a.vertices[k], 73.25, 1e-3); close(b.vertices[k + 1], a.vertices[k + 1], 1e-3) }
  // Turned, the shape is still found, and its triangles turn with it onto where Canvas would draw them.
  const turned = at(173.5, .7), fresh = buildFrame(new SceneBuilder(), ctx => { ctx.fillStyle = '#336699'; ctx.translate(173.5, 40); ctx.rotate(.7); leaf(ctx) })
  assert.equal(turned.stats.hits, 1)
  assert.equal(turned.vertices.length, fresh.vertices.length)
  for (let k = 0; k < fresh.vertices.length; k++) close(turned.vertices[k], fresh.vertices[k], 1e-2)
  // A shape that changes every frame is drawn but never kept.
  const changing = new ShapeCache(), other = new SceneBuilder(changing)
  for (let k = 0; k < 4; k++) {
    const frame = buildFrame(other, ctx => { ctx.beginPath(); ctx.moveTo(100, 40); ctx.lineTo(120, 40); ctx.lineTo(110, 60 + k); ctx.lineTo(105, 50); ctx.fill() })
    assert.ok(frame.vertices.length > 0)
  }
  assert.equal(changing.size, 0)
})

test('a whole ellipse is a unit circle through its matrix: the points flattening would give, without the cache', () => {
  const cache = new ShapeCache(), builder = new SceneBuilder(cache)
  const view = { x: 0, y: 0, zoom: 1.5, width: 500, height: 500 }
  for (const [rotation, start, ccw] of [[0, 0, false], [.4, 1.1, false], [0, 0, true]]) {
    const frame = buildFrame(builder, ctx => {
      ctx.fillStyle = '#336699'; ctx.translate(120, 80); ctx.rotate(.3); ctx.scale(1, .8)
      ctx.beginPath(); ctx.ellipse(4, -2, 30, 12, rotation, start, start + (ccw ? -1 : 1) * Math.PI * 2, ccw); ctx.fill()
    }, view)
    assert.deepEqual([frame.stats.ellipses, frame.stats.hits, frame.stats.misses], [1, 0, 0])
    assert.deepEqual(frame.passes.map(p => p.kind), ['direct'])
    // The same triangles as flattening at the builder's tolerance and fanning from the first point.
    const recorder = new GlRecorder(1.5, view), ctx = recorder.asContext()
    ctx.translate(120, 80); ctx.rotate(.3); ctx.scale(1, .8); ctx.beginPath(); ctx.ellipse(4, -2, 30, 12, rotation, start, start + (ccw ? -1 : 1) * Math.PI * 2, ccw); ctx.fill()
    const [contour] = flatten(recorder.ops[0].commands, .2 / 1.5), p = contour.points, expected = []
    for (let k = 2; k + 3 < p.length; k += 2) expected.push(p[0], p[1], p[k], p[k + 1], p[k + 2], p[k + 3])
    assert.equal(frame.vertices.length, expected.length)
    for (let k = 0; k < expected.length; k++) close(frame.vertices[k], expected[k], 1e-3)
  }
  assert.equal(cache.size, 0)
})

test('a coin edge (an ellipse and its rim, winding one way) is drawn directly; rims and rings winding the other way keep the stencil', () => {
  const coin = (reverse, color = '#d9a33a') => buildFrame(new SceneBuilder(new ShapeCache()), ctx => {
    ctx.fillStyle = color; ctx.beginPath(); ctx.ellipse(101, 50, 6, 10, 0, 0, Math.PI * 2)
    if (reverse) { ctx.moveTo(98, 40); ctx.lineTo(98, 60); ctx.lineTo(100, 60); ctx.lineTo(100, 40); ctx.closePath() } else ctx.rect(98, 40, 2, 20)
    ctx.fill()
  })
  const edge = coin(false)
  assert.deepEqual([edge.stats.ellipses, edge.stats.misses], [1, 0])
  assert.deepEqual(edge.passes.map(p => p.kind), ['direct'])
  // The ellipse's fan and the rim's two triangles.
  const fan = buildFrame(new SceneBuilder(new ShapeCache()), ctx => { ctx.fillStyle = '#d9a33a'; ctx.beginPath(); ctx.ellipse(101, 50, 6, 10, 0, 0, Math.PI * 2); ctx.fill() })
  assert.equal(edge.vertices.length, fan.vertices.length + 12)
  // A rim winding against the ellipse would cut the overlap away under nonzero: the stencil decides.
  const against = coin(true)
  assert.deepEqual([against.stats.ellipses, against.stats.misses], [0, 1])
  assert.deepEqual(against.passes.map(p => p.kind), ['stencil-fill'])
  // So does a translucent edge, whose overlap must blend once.
  assert.deepEqual(coin(false, '#d9a33a80').passes.map(p => p.kind), ['stencil-fill'])
  // A ring of two circles winding against each other keeps its hole; two winding together are their union.
  const ring = ccw => buildFrame(new SceneBuilder(new ShapeCache()), ctx => {
    ctx.fillStyle = '#000'; ctx.beginPath(); ctx.arc(50, 50, 20, 0, Math.PI * 2); ctx.moveTo(64.6, 50); ctx.arc(50, 50, 14.6, 0, Math.PI * 2, ccw); ctx.fill()
  })
  assert.deepEqual(ring(true).passes.map(p => p.kind), ['stencil-fill'])
  assert.deepEqual(ring(false).passes.map(p => p.kind), ['direct'])
})

test('scenes draw convex fills and opaque lines directly, and use the stencil or coverage where Canvas unions a shape', () => {
  const recorder = new GlRecorder(1), ctx = recorder.asContext()
  ctx.fillStyle = '#808080'; ctx.fillRect(0, 0, 10, 10); ctx.fillRect(20, 0, 10, 10)
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(10, 0); ctx.lineTo(10, 5); ctx.lineTo(5, 5); ctx.lineTo(5, 10); ctx.lineTo(0, 10); ctx.fill()
  ctx.fillStyle = '#80808080'; ctx.beginPath(); ctx.rect(0, 0, 10, 10); ctx.rect(5, 5, 10, 10); ctx.fill()
  ctx.strokeStyle = '#353f4810'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, 100); ctx.moveTo(0, 50); ctx.lineTo(100, 50); ctx.stroke()
  ctx.strokeStyle = '#57794f'; ctx.stroke()
  ctx.save(); ctx.beginPath(); ctx.rect(0, 0, 5, 5); ctx.clip(); ctx.lineWidth = 8; ctx.strokeStyle = '#ffffff91'; ctx.stroke(); ctx.restore()
  const scene = buildScene(recorder.ops, 1)
  assert.deepEqual(scene.passes.map(p => p.kind), ['direct', 'stencil-fill', 'thin-max', 'direct', 'clip', 'stroke-once', 'unclip'])
  // The two rectangles and the ear-clipped L share one draw call; the translucent overlap needs the stencil.
  assert.equal(scene.passes[0].draw.count, 12 + 12)
  assert.equal(scene.passes[5].depth, 1)
  assert.equal(scene.passes[4].end, 6)
  assert.equal(scene.vertices.byteLength, scene.vertexCount * 24)
})

test('ear clipping takes any simple outline, however many reflex corners, and convexity refuses a star', () => {
  // Radial outlines with random radii are simple; many corners are reflex.
  let seed = 7
  const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647
  for (let trial = 0; trial < 200; trial++) {
    const n = 3 + Math.floor(random() * 60), points = []
    for (let k = 0; k < n; k++) {
      const angle = (k + random() * .8) / n * Math.PI * 2, r = 5 + random() * 40
      points.push(Math.cos(angle) * r, Math.sin(angle) * r)
    }
    const out = []
    assert.equal(earClip(points, out), true, `trial ${trial}`)
    // At most n - 2 triangles; earClip itself checks they cover exactly the outline's area.
    assert.ok(out.length > 0 && out.length / FLOATS_PER_VERTEX <= (n - 2) * 3)
  }
  const star = []
  for (let k = 0; k < 5; k++) star.push(Math.cos(k * 4 * Math.PI / 5) * 10, Math.sin(k * 4 * Math.PI / 5) * 10)
  assert.equal(isConvex([{ points: star, closed: true }]), false)
  assert.equal(earClip(star, []), false)
  const hexagon = []
  for (let k = 0; k < 6; k++) hexagon.push(Math.cos(k * Math.PI / 3) * 10, Math.sin(k * Math.PI / 3) * 10)
  assert.equal(isConvex([{ points: hexagon, closed: true }]), true)
})

test('a stroke through a stretched transform is outlined where it was drawn, then stretched, as Canvas strokes', () => {
  const view = { x: 0, y: 0, zoom: 1, width: 200, height: 200 }
  const recorder = new GlRecorder(1, view), ctx = recorder.asContext()
  ctx.translate(50, 20); ctx.scale(2, 1); ctx.strokeStyle = '#a5b1a5'; ctx.lineWidth = 1; ctx.strokeRect(0, 0, 10, 10)
  assert.equal(recorder.unsupported, null)
  const [op] = recorder.ops
  // The path stays in the units it was drawn in, with the matrix that stretches it.
  assert.deepEqual([op.matrix.a, op.matrix.d, op.matrix.e, op.matrix.f], [2, 1, 50, 20])
  assert.deepEqual(op.commands.slice(0, 3), [MOVE, 0, 0])
  assert.equal(op.style.width, 1)
  const builder = new SceneBuilder(new ShapeCache())
  builder.reset(1, view); builder.add(recorder.ops); builder.finish()
  const v = new Float32Array(builder.vertexView.slice().buffer), xs = [], ys = []
  for (let k = 0; k < builder.count; k++) { xs.push(v[k * 6]); ys.push(v[k * 6 + 1]) }
  // Vertical sides are stretched to two units wide, horizontal ones stay one: the outline's reach shows both.
  close(Math.min(...xs), 49, 1e-4); close(Math.max(...xs), 71, 1e-4)
  close(Math.min(...ys), 19.5, 1e-4); close(Math.max(...ys), 30.5, 1e-4)
  assert.deepEqual(builder.passes.map(p => p.kind), ['direct'])
})

test('the airborne effects keep their place in the frame, inside the clips they were recorded in', () => {
  const view = { x: 0, y: 0, zoom: 1, width: 100, height: 100 }
  const recorder = new GlRecorder(1, view), ctx = recorder.asContext()
  ctx.fillStyle = '#808080'; ctx.fillRect(0, 0, 10, 10)
  recorder.effect('beam')
  ctx.save(); ctx.beginPath(); ctx.rect(0, 0, 50, 50); ctx.clip(); recorder.effect('unbeam'); ctx.restore()
  ctx.fillRect(20, 20, 10, 10); recorder.effect('glow'); ctx.fillRect(40, 40, 10, 10)
  const builder = new SceneBuilder(new ShapeCache())
  builder.reset(1, view); builder.add(recorder.ops); builder.finish()
  assert.deepEqual(builder.passes.map(p => p.kind === 'effect' ? `${p.name}@${p.depth}` : p.kind),
    ['direct', 'beam@0', 'clip', 'unbeam@1', 'unclip', 'direct', 'glow@0', 'direct'])
})
