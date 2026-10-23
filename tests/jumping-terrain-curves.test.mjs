import test from 'node:test'
import assert from 'node:assert/strict'
import { blankTrial, copyLevel, parseLevel } from '../src/games/jumping/level.ts'
import { cubicPoint, terrainCubic, terrainNodes, terrainCurveOutline, CURVE_GRID_SIZE } from '../src/games/jumping/terrainCurves.ts'
import { bodyIntersects, convexParts, lineBlocked, moveBody, nearestBoundary, platformOutline, pointInside, polygonPoints } from '../src/games/jumping/geometry.ts'
import { groundAt, platformSurface } from '../src/games/jumping/terrain.ts'
import { deleteTerrainNode, insertTerrainNode, moveTerrainHandle, moveVertex, resizeItem, setTerrainNodeMode, terrainNodeTarget, terrainVertexTarget, transformTerrain } from '../src/games/jumping/editor.ts'
import { copySelections, pasteSelections } from '../src/games/jumping/editorSelection.ts'
import { platformLedges } from '../src/games/jumping/terrainLedges.ts'
import { mirrorPlatform } from '../src/games/jumping/gravityFrame.ts'
import { createPlayer, NEUTRAL_INPUT, STEP, stepPlayer } from '../src/games/jumping/model.ts'
import { NO_CLIMBABLES } from '../src/games/jumping/climbables.ts'
import { createRun, stepRun } from './helpers/jumping-active-run.mjs'

const hill = () => ({ x: 200, y: 300, w: 800, h: 300,
  polygon: [[0,150],[800,150],[800,300],[0,300]],
  bezier: [{ out: [260,-140], mode: 'corner' }, { in: [-260,-140], mode: 'corner' }, null, null] })
const levelWith = (shape = hill()) => ({ ...blankTrial(), platforms: [shape] })
const near = (a, b, tolerance = 1e-7) => assert.ok(Math.abs(a - b) <= tolerance, `${a} differs from ${b}`)

test('Bézier handles round-trip and reject malformed, unbounded or crossing geometry', () => {
  const level = levelWith()
  assert.deepEqual(parseLevel(JSON.parse(JSON.stringify(level))).platforms, level.platforms)
  for (const change of [b => b.bezier.pop(), b => b.bezier[0].out = [NaN,0], b => b.bezier[0].out = [Infinity,0],
    b => b.bezier[0].out = [900,0], b => b.bezier[0].out = [0,-200], b => b.bezier[0].out = [0],
    b => b.bezier[0].mode = 'unknown', b => delete b.polygon, b => b.profile = [[0,0],[800,0]]]) {
    const invalid = copyLevel(level); change(invalid.platforms[0]); assert.throws(() => parseLevel(invalid))
  }
  const invalid = levelWith({ x: 200, y: 200, w: 400, h: 400, polygon: [[0,0],[400,0],[400,400],[200,100],[0,400]],
    bezier: [{ out: [150,400] }, { in: [-150,400] }, null, null, null] })
  assert.throws(() => parseLevel(invalid), 'curve crossing the concave notch must be rejected')
})

test('drawing, solid queries, surface heights and swept collisions share the curved outline', () => {
  const b = hill(), points = polygonPoints(b)
  assert.equal(terrainNodes(b).length, 4); assert.ok(points.length > 4 && points.length < 25)
  assert.deepEqual(points, terrainCurveOutline(b))
  assert.ok(points.every(p => p.every(v => v % CURVE_GRID_SIZE === 0)))
  assert.deepEqual(points, platformOutline(b)); assert.ok(convexParts(b).length)
  for (let t = .05; t < 1; t += .05) {
    const p = cubicPoint(terrainCubic(b, 0), t)
    assert.ok(nearestBoundary(b, ...p).distance <= CURVE_GRID_SIZE)
    near(platformSurface(b, p[0]).y, p[1], CURVE_GRID_SIZE)
  }
  assert.equal(pointInside(b, 600, 400), true, 'the bulge above the old straight edge is solid')
  assert.equal(pointInside(b, 600, 330), false)
  assert.equal(lineBlocked([550,400], [650,400], [b]), true)
  assert.equal(lineBlocked([550,330], [650,330], [b]), false)
  const landed = moveBody([600,250], [600,500], [b])
  near(landed.y, 345, CURVE_GRID_SIZE)
  assert.equal(bodyIntersects(landed.x, landed.y, b), false)
  const mirrored = mirrorPlatform(b)
  for (const p of points) assert.ok(nearestBoundary(mirrored, p[0], -p[1]).distance < 1e-6)
})

test('curve caches refresh after in-place handle edits and return independent authoring arrays', () => {
  const b = hill(), before = platformOutline(b)
  b.bezier[0].out[1] = -80
  assert.notStrictEqual(platformOutline(b), before)
  assert.ok(platformSurface(b, 600).y > 345)
  const copy = polygonPoints(b); copy[0][0] = -100
  assert.notEqual(platformOutline(b)[0][0], -100)
})

test('grid fitting removes collapsed curved tips without rejecting a valid saved level', () => {
  const shape = { x:200,y:200,w:200,h:200, polygon:[[200,200],[0,20],[20,0],[200,0]],
    bezier:[{ out:[0,-120] },{ in:[120,0] },null,null] }
  const level = levelWith(shape), original = copyLevel(level)
  assert.doesNotThrow(() => parseLevel(level))
  const points = polygonPoints(shape)
  for (let i = 0; i < points.length; i++) {
    const a = points[(i + points.length - 1) % points.length], b = points[i], c = points[(i + 1) % points.length]
    assert.notEqual((b[0]-a[0])*(c[1]-b[1])-(b[1]-a[1])*(c[0]-b[0]), 0, 'no retraced or collinear grid edges')
  }
  assert.deepEqual(level, original, 'compilation must not rewrite saved anchors or handles')
})

test('nodes split curves exactly, stay editable and retain neighboring handles and attachments', () => {
  const level = levelWith(), b = level.platforms[0], cubic = terrainCubic(b, 0), p = cubicPoint(cubic, .37)
  const target = terrainNodeTarget(level, ...p, 2)
  assert.ok(target && target.t > .36 && target.t < .38)
  assert.equal(terrainVertexTarget(level, ...p, 2), null, 'samples must never become editable nodes')
  const inserted = insertTerrainNode(level, target), changed = inserted.platforms[0]
  assert.equal(changed.polygon.length, 5)
  for (let t = 0; t <= 1; t += .01) {
    const expected = cubicPoint(cubic, t)
    const actual = t <= target.t ? cubicPoint(terrainCubic(changed, 0), t / target.t) : cubicPoint(terrainCubic(changed, 1), (t - target.t) / (1 - target.t))
    near(actual[0], expected[0]); near(actual[1], expected[1])
  }
  assert.deepEqual(parseLevel(inserted).platforms, inserted.platforms)
  const deleted = deleteTerrainNode(inserted, 0, 1)
  assert.equal(deleted.platforms[0].polygon.length, 4); assert.ok(deleted.platforms[0].bezier)
  const moved = moveVertex(inserted, 0, 1, 10, 10)
  near(terrainNodes(moved.platforms[0])[1][0], terrainNodes(changed)[1][0] + 10)
  assert.deepEqual(moved.platforms[0].bezier[1], changed.bezier[1])
  assert.deepEqual(level.platforms[0], hill())
  const snapped = terrainNodeTarget(level, ...p, 2, 20)
  near(snapped.x / 20, Math.round(snapped.x / 20), 1e-7)
  const onCurve = cubicPoint(cubic, snapped.t)
  near(onCurve[0], snapped.x); near(onCurve[1], snapped.y)
  const straight = terrainNodeTarget(level, 1000, 520, 2)
  const straightInserted = insertTerrainNode(level, straight)
  assert.equal(straightInserted.platforms[0].bezier[straight.edge + 1], null, 'new straight nodes never get handles automatically')
})

test('handle modes align tangents and preserve independent or symmetric lengths', () => {
  const level = levelWith({ x:200, y:300, w:400, h:300, polygon:[[0,100],[200,0],[400,100],[400,300],[0,300]] })
  for (const mode of ['corner','smooth','symmetric']) {
    const enabled = setTerrainNodeMode(level, 0, 1, mode)
    const changed = moveTerrainHandle(enabled, 0, 1, 'out', 480, 320), handle = changed.platforms[0].bezier[1]
    assert.equal(handle.mode, mode); assert.deepEqual(handle.out, [80,20])
    if (mode !== 'corner') near(handle.in[0] * handle.out[1] - handle.in[1] * handle.out[0], 0)
    if (mode === 'symmetric') near(Math.hypot(...handle.in), Math.hypot(...handle.out))
    if (mode === 'smooth') near(Math.hypot(...handle.in), Math.hypot(...enabled.platforms[0].bezier[1].in))
    assert.deepEqual(parseLevel(changed).platforms, changed.platforms)
    assert.equal(setTerrainNodeMode(changed, 0, 1, 'straight').platforms[0].bezier, undefined)
  }
})

test('expanding handle bounds keeps attached ropes and supported markers at the same world x', () => {
  const level = levelWith({ x:300, y:300, w:400, h:200 })
  level.entrance = { x:500, y:300 }
  level.climbables.ropes = [{ x:700, y:300, length:150, segments:15, anchor:{ platform:0, x:400, y:0 } }]
  const changed = setTerrainNodeMode(level, 0, 0, 'smooth')
  assert.ok(changed.platforms[0].x < 300)
  assert.equal(changed.entrance.x, 500)
  near(changed.climbables.ropes[0].x, 700); near(changed.climbables.ropes[0].y, 300)
  assert.deepEqual(parseLevel(changed).platforms, changed.platforms)
})

test('rotate, flip, resize and clipboard preserve curved nodes and control vectors', () => {
  const level = levelWith(), original = copyLevel(level), selection = { kind:'platform', index:0 }
  for (const transform of ['rotate-left','rotate-right','flip-horizontal','flip-vertical']) {
    const changed = transformTerrain(level, 0, transform)
    assert.equal(changed.platforms[0].polygon.length, 4)
    assert.deepEqual(parseLevel(changed).platforms, changed.platforms)
    const inverse = transform === 'rotate-left' ? 'rotate-right' : transform === 'rotate-right' ? 'rotate-left' : transform
    assert.deepEqual(transformTerrain(changed, 0, inverse).platforms[0], level.platforms[0])
  }
  const resized = resizeItem(level, selection, 400, 150)
  assert.deepEqual(resized.platforms[0].bezier[0].out, [130,-70])
  assert.deepEqual(parseLevel(resized).platforms, resized.platforms)
  const pasted = pasteSelections(level, copySelections(level, [selection]), 40, 40).level.platforms[1]
  assert.deepEqual(pasted.bezier, hill().bezier); assert.equal(pasted.x, 240)
  assert.deepEqual(level, original)
})

test('running both ways follows a curved hill without snagging, hanging or losing support', () => {
  const b = hill()
  for (const direction of [-1,1]) {
    const x = direction > 0 ? 240 : 960, p = createPlayer({ x, y: platformSurface(b, x).y })
    p.grounded = true
    for (let i = 0; i < 1200 && p.x > 225 && p.x < 975; i++) {
      stepPlayer(p, { ...NEUTRAL_INPUT, move: direction }, STEP, [b], NO_CLIMBABLES, { checkpoints:[], fallY:2000 })
      assert.ok(p.grounded, `lost curve support at ${p.x},${p.y}`)
      assert.equal(p.hang, null); assert.equal(p.mantle, null)
      near(p.y, groundAt([b], p.x, p.y).y, .2)
    }
    assert.ok(direction > 0 ? p.x >= 975 : p.x <= 225, `stopped on curve at ${p.x}`)
  }
  assert.ok(platformLedges(b).every(edge => terrainNodes(b).some(p => p[0] === edge.edgeX && p[1] === edge.edgeY)))
})

test('loose balls settle on the actual curved crest above the straight anchor chord', () => {
  const level = levelWith()
  level.props = [{ kind:'ball', x:600, y:250, size:60 }]
  const run = createRun(level)
  for (let i = 0; i < 600; i++) stepRun(run, NEUTRAL_INPUT)
  const ball = run.props[0]
  near(ball.y, platformSurface(level.platforms[0], ball.x).y, .6)
  assert.ok(ball.y < 400)
})
