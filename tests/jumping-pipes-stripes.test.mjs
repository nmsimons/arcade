import test from 'node:test'
import assert from 'node:assert/strict'
import { blankTrial, levelProblems, parseLevel } from '../src/games/jumping/level.ts'
import { addItem, deleteItem, deletePipePoint, duplicateItem, hitItem, insertPipePoint, itemOutline, moveItem, movePipePoint, resizeItem, resizeLevelHeight, setPipe, setWallStripes } from '../src/games/jumping/editor.ts'
import { copySelections, moveSelections, pasteSelections } from '../src/games/jumping/editorSelection.ts'
import { deleteShapeNode, insertShapeNode, moveShapeVertex, shapeNodeTarget, shapePoints, shapeVertexTarget } from '../src/games/jumping/editorShape.ts'
import { objectLabel } from '../src/games/jumping/objectLabels.ts'
import { drawLevelBackdrop } from '../src/games/jumping/render.ts'
import { drawWallPipes } from '../src/games/jumping/wallPipes.ts'
import { HAZARD_YELLOW, drawTerrainTrim, drawWallStripes } from '../src/games/jumping/hazardStripes.ts'
import { drawTerrainEdges } from '../src/games/jumping/surfaceDepth.ts'
import { levelTerrain } from '../src/games/jumping/level.ts'
import { GlRecorder } from '../src/games/jumping/webgl/recorder.ts'
import { ARGUMENTS, ELLIPSE, MOVE, LINE, CLOSE } from '../src/games/jumping/webgl/artPath.ts'

const room = extra => ({ ...blankTrial(), id: 'plumbing', name: 'Plumbing', width: 1200, height: 1000, floor: 1000,
  entrance: { x: 160, y: 1000 }, goal: { x: 1040, y: 1000 }, ...extra })
const pipe = { points: [[100, 200], [700, 200], [700, 400]], size: 'large', name: 'Main' }
const band = { x: 80, y: 600, w: 200, h: 24, lean: 'left' }

test('pipes, wall stripes and terrain trim parse, round trip, and refuse what they cannot draw', () => {
  const level = parseLevel(room({ pipes: [pipe, { points: [[0, 0], [10, 0]] }], stripes: [band, { x: 0, y: 0, w: 16, h: 6 }],
    platforms: [{ x: 0, y: 700, w: 400, h: 100, trim: 'hazard' }, { x: 500, y: 700, w: 100, h: 100, trim: 'none' }] }))
  assert.deepEqual(level.pipes, [pipe, { points: [[0, 0], [10, 0]] }])
  assert.deepEqual(level.stripes, [band, { x: 0, y: 0, w: 16, h: 6 }])
  assert.deepEqual(level.platforms.map(p => p.trim), ['hazard', 'none'])
  assert.deepEqual(parseLevel(JSON.parse(JSON.stringify(level))), level)
  assert.deepEqual(levelProblems(level), [])
  for (const broken of [
    { pipes: [{ points: [[0, 0]] }] }, { pipes: [{ points: [[0, 0], [0, 0]] }] }, { pipes: [{ points: [[0, 0], [10, 0]], size: 'huge' }] },
    { pipes: [{ points: [[0, 0], [10, 0, 5]] }] }, { pipes: [{ points: Array.from({ length: 17 }, (_, i) => [i * 10, 0]) }] },
    { stripes: [{ x: 0, y: 0, w: 4, h: 24 }] }, { stripes: [{ ...band, lean: 'right' }] }, { stripes: [{ ...band, x: 1100 }] },
    { platforms: [{ x: 0, y: 700, w: 400, h: 100, trim: 'chevrons' }] },
  ]) assert.throws(() => parseLevel(room(broken)), /not a valid jumping level/, JSON.stringify(broken))
  assert.deepEqual(levelProblems(parseLevel(room({ pipes: [{ points: [[100, 200], [100, 1100]] }], stripes: [{ ...band, y: 980 }] }))),
    ['Keep “Pipe 1” inside the level rectangle.', 'Keep “Hazard stripes 1” inside the level rectangle.'])
})

test('a pipe is laid by a drag, turning a corner when drawn on the slant, and a click lays a short level run', () => {
  const at = (x, y) => ({ x, y })
  assert.deepEqual(addItem(room(), 'pipe', at(100, 300), at(100, 300)).level.pipes, [{ points: [[100, 300], [340, 300]] }])
  assert.deepEqual(addItem(room(), 'pipe', at(100, 300), at(600, 310)).level.pipes, [{ points: [[100, 300], [600, 300]] }])
  assert.deepEqual(addItem(room(), 'pipe', at(100, 300), at(105, 800)).level.pipes, [{ points: [[100, 300], [100, 800]] }])
  assert.deepEqual(addItem(room(), 'pipe', at(100, 300), at(600, 500)).level.pipes, [{ points: [[100, 300], [600, 300], [600, 500]] }])
  assert.deepEqual(addItem(room(), 'pipe', at(100, 300), at(200, 800)).level.pipes, [{ points: [[100, 300], [100, 800], [200, 800]] }])
  const edge = addItem(room(), 'pipe', at(1150, 300), at(1150, 300))
  assert.deepEqual(edge.level.pipes, [{ points: [[1150, 300], [1200, 300]] }], 'a run is kept inside the level')
  const stripes = addItem(room(), 'wall-stripes', at(300, 400), at(300, 400))
  assert.deepEqual(stripes.level.stripes, [{ x: 220, y: 388, w: 160, h: 24 }])
  assert.deepEqual(addItem(room(), 'wall-stripes', at(300, 400), at(500, 440)).level.stripes, [{ x: 300, y: 400, w: 200, h: 40 }])
  assert.equal(objectLabel(stripes.level, stripes.selection), 'Hazard stripes 1')
})

test('pipes and stripes are selected, restyled, moved, resized, copied, duplicated and deleted like other wall art', () => {
  const level = parseLevel(room({ pipes: [pipe], stripes: [band] })), p = { kind: 'pipe', index: 0 }, s = { kind: 'wall-stripes', index: 0 }
  assert.deepEqual(hitItem(level, 400, 208, 2), p, 'within the large pipe\'s width of its centre line')
  assert.equal(hitItem(level, 400, 240, 2), null)
  assert.deepEqual(hitItem(level, 100, 610, 2), s)
  assert.equal(objectLabel(level, p), 'Main · Pipe 1')
  assert.deepEqual(itemOutline(level, p), { x: 100 - 16.5, y: 200 - 16.5, w: 600 + 33, h: 200 + 33 }, 'the outline holds the flanges')
  assert.equal(setPipe(level, 0, { size: 'medium' }).pipes[0].size, undefined, 'medium is the default, saved by leaving it out')
  assert.equal(setPipe(level, 0, { size: 'small' }).pipes[0].size, 'small')
  assert.equal(setPipe(level, 0, { size: 'huge' }), level)
  assert.equal(setWallStripes(level, 0, { lean: undefined }).stripes[0].lean, undefined)
  assert.deepEqual(moveItem(level, p, 40, -20).pipes[0].points, [[140, 180], [740, 180], [740, 380]], 'every point moves')
  assert.deepEqual(moveItem(level, p, -5000, 0).pipes[0].points[0], [0, 200], 'and stays in the level')
  const both = moveSelections(level, [p, s], 20, 20)
  assert.deepEqual(both.pipes[0].points[0], [120, 220]); assert.deepEqual([both.stripes[0].x, both.stripes[0].y], [100, 620])
  assert.deepEqual(resizeItem(level, s, 300, 40, 'top-left').stripes[0], { x: -20 < 0 ? 0 : -20, y: 584, w: 280, h: 40, lean: 'left' })
  const pasted = pasteSelections(level, copySelections(level, [p, s]))
  assert.deepEqual(pasted.level.pipes[1].points, [[140, 240], [740, 240], [740, 440]])
  assert.deepEqual(pasted.level.pipes[0].points, pipe.points, 'the original is untouched')
  assert.equal(duplicateItem(level, p).level.pipes.length, 2)
  assert.deepEqual(deleteItem(deleteItem(level, p), s).pipes, [])
  // Changing the room's height keeps the art where it was on the wall, above the floor.
  const taller = resizeLevelHeight(level, 1200)
  assert.deepEqual(taller.pipes[0].points[0], [100, 400]); assert.equal(taller.stripes[0].y, 800)
})

test('a pipe is rerouted by its points, which never land on a neighbour, and keeps both of its ends', () => {
  const level = parseLevel(room({ pipes: [pipe] })), p = { kind: 'pipe', index: 0 }
  assert.deepEqual(shapePoints(level, p), pipe.points)
  assert.deepEqual(movePipePoint(level, 0, 1, 720, 180).pipes[0].points[1], [720, 180])
  assert.equal(movePipePoint(level, 0, 1, 100, 200), level, 'a point never lands on its neighbour')
  assert.deepEqual(moveShapeVertex(level, p, 2, 0, 5000).pipes[0].points[2], [700, 1000], 'and stays in the room')
  assert.deepEqual(insertPipePoint(level, 0, 0, 400, 200).pipes[0].points, [[100, 200], [400, 200], [700, 200], [700, 400]])
  assert.deepEqual(shapeVertexTarget(level, 702, 398, 6, p), { index: 0, vertex: 2, x: 702, y: 398, kind: 'pipe' })
  assert.equal(shapeVertexTarget(level, 400, 200, 6, p), null, 'with a pipe selected, other shapes\' nodes stay out of the way')
  const target = shapeNodeTarget(level, 403, 206, 8, 20, p)
  assert.deepEqual(target, { index: 0, edge: 0, x: 400, y: 200, kind: 'pipe' })
  assert.equal(insertShapeNode(level, target).pipes[0].points.length, 4)
  assert.deepEqual(deleteShapeNode(level, p, 1).pipes[0].points, [[100, 200], [700, 400]])
  assert.throws(() => deletePipePoint(parseLevel(room({ pipes: [{ points: [[0, 0], [10, 0]] }] })), 0, 0), /both of its ends/)
})

/** A Canvas 2D stand-in that keeps the paths it is asked to fill or stroke. */
/** Every terrain wear style (surfaceDepth.ts WEAR) and the chips. */
const WEAR_STYLE = /^rgba\((46,48,38|78,84,72|40,44,38|150,84,44|104,54,30|96,76,54|255,246,226|126,126,120),/
const gritShapes = commands => {
  const shapes = []
  for (let i = 0; i < commands.length; i += 1 + ARGUMENTS[commands[i]]) {
    if (commands[i] === MOVE) shapes.push([])
    if (commands[i] === MOVE || commands[i] === LINE) shapes.at(-1).push([commands[i + 1], commands[i + 2]])
  }
  return shapes
}
function recorder() {
  const calls = []
  const ctx = { canvas: { width: 1600, height: 900 }, globalAlpha: 1, fillStyle: '', strokeStyle: '', lineWidth: 1, lineCap: 'butt', lineJoin: 'miter', filter: 'none',
    getTransform: () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }) }
  for (const name of ['save', 'restore', 'beginPath', 'moveTo', 'lineTo', 'rect', 'clip', 'closePath', 'quadraticCurveTo', 'bezierCurveTo', 'arc', 'ellipse', 'setLineDash', 'translate', 'scale', 'rotate', 'fillText', 'strokeRect'])
    ctx[name] = (...args) => calls.push([name, ...args])
  ctx.createPattern = () => ({ setTransform() {} })
  ctx.fillRect = (...args) => calls.push(['fillRect', ...args, ctx.fillStyle])
  ctx.fill = path => calls.push(['fill', ctx.fillStyle, path])
  ctx.stroke = path => calls.push(['stroke', ctx.strokeStyle, path])
  return { ctx, calls }
}
const subpaths = path => {
  const out = [], c = path.commands
  for (let i = 0; i < c.length; i += 1 + ARGUMENTS[c[i]]) out.push(c[i])
  return out
}

test('every bolt is its own circle: none is joined to the last by a filled wedge', () => {
  // An ellipse continues the path from wherever it was, so bolts added in a row without a move between them
  // filled long wedges across the pipe (reported on the first review sheet).
  const { ctx, calls } = recorder()
  drawWallPipes(ctx, [pipe])
  const bolts = calls.find(c => c[0] === 'fill' && c[1] === '#b6bdb8')[2], ops = subpaths(bolts)
  assert.ok(ops.filter(op => op === ELLIPSE).length >= 4)
  ops.forEach((op, i) => { if (op === ELLIPSE) assert.equal(ops[i - 1], MOVE, `bolt ${i} starts its own subpath`) })
  ops.forEach((op, i) => { if (op === ELLIPSE) assert.equal(ops[i + 1], CLOSE, `bolt ${i} is closed`) })
})

test('the new wall art and the terrain grit are drawn with what the WebGL renderer can replay', () => {
  const level = parseLevel(room({ version: 2, lighting: { nightMode: false, ambient: 0, lights: [] }, pipes: [pipe, { ...pipe, size: 'small' }], stripes: [band, { ...band, lean: undefined }],
    platforms: [{ x: 0, y: 700, w: 400, h: 100, trim: 'hazard' }, { x: 500, y: 600, w: 300, h: 200, polygon: [[0, 200], [150, 0], [300, 200]], trim: 'hazard' }] }))
  const backdrop = new GlRecorder(1), ground = new GlRecorder(1)
  drawLevelBackdrop(backdrop.asContext(), level, { x: 0, y: 0, w: level.width, h: 1000 }, 1, false)
  // The trim and the grit, as drawTerrain lays them over the fill (whose material pattern needs a document).
  drawTerrainTrim(ground.asContext(), levelTerrain(level), level)
  drawTerrainEdges(ground.asContext(), levelTerrain(level), level)
  assert.ok(ground.ops.length >= 5)
  assert.equal(backdrop.unsupported, null)
  assert.equal(ground.unsupported, null)
})

test('hazard trim paints a band under a piece\'s exposed tops only, and only on pieces that ask for it', () => {
  const yellow = (platforms) => {
    const level = parseLevel(room({ platforms })), { ctx, calls } = recorder()
    drawTerrainTrim(ctx, levelTerrain(level), level)
    const fill = calls.find(c => c[0] === 'fill' && c[1] === HAZARD_YELLOW)
    return fill ? subpaths(fill[2]).filter(op => op === MOVE).length : 0
  }
  assert.equal(yellow([{ x: 0, y: 700, w: 400, h: 100 }]), 0, 'no trim, no paint')
  const open = yellow([{ x: 0, y: 700, w: 400, h: 100, trim: 'hazard' }])
  assert.ok(open > 20, `stripes run along the whole top (${open})`)
  // A crate-sized block standing on the trimmed top covers part of it.
  const covered = yellow([{ x: 0, y: 700, w: 400, h: 100, trim: 'hazard' }, { x: 100, y: 600, w: 200, h: 100 }])
  assert.ok(covered < open * .6 && covered > 4, `a covered top is not painted (${covered} of ${open})`)
  // Nothing is drawn under a steep side, only under walkable tops.
  const post = yellow([{ x: 0, y: 200, w: 30, h: 600, trim: 'hazard' }])
  assert.ok(post <= 4, `a post's 600-unit sides carry none, only its 30-unit top (${post})`)
})

test('hazard trim can mark a piece\'s exposed undersides, alone or with its tops', () => {
  // A floating slab, open above and below. Its yellow bands sit within 2.5-10.5 units of whichever face they mark.
  const slab = { x: 0, y: 400, w: 400, h: 100 }
  const bands = (platforms) => {
    const level = parseLevel(room({ platforms })), { ctx, calls } = recorder()
    drawTerrainTrim(ctx, levelTerrain(level), level)
    const fill = calls.find(c => c[0] === 'fill' && c[1] === HAZARD_YELLOW)
    const ys = [], c = fill?.[2].commands ?? []
    for (let i = 0; i < c.length; i += 1 + ARGUMENTS[c[i]]) if (c[i] === MOVE || c[i] === LINE) ys.push(c[i + 2])
    return { top: ys.some(y => y < 450), bottom: ys.some(y => y > 450), count: fill ? subpaths(fill[2]).filter(op => op === MOVE).length : 0,
      outside: ys.some(y => y < slab.y + 2 || y > slab.y + slab.h - 2 || (y > slab.y + 11 && y < slab.y + slab.h - 11)) }
  }
  const top = bands([{ ...slab, trim: 'hazard' }]), bottom = bands([{ ...slab, trim: 'hazard-bottom' }]), both = bands([{ ...slab, trim: 'hazard-both' }])
  assert.deepEqual([top.top, top.bottom], [true, false], 'the original trim still marks only the top')
  assert.deepEqual([bottom.top, bottom.bottom], [false, true], 'the underside alone')
  assert.deepEqual([both.top, both.bottom], [true, true], 'tops and undersides')
  assert.ok(!top.outside && !bottom.outside && !both.outside, 'every band hugs the face it marks')
  assert.ok(Math.abs(both.count - top.count - bottom.count) <= 2, `both is the two bands together (${both.count} vs ${top.count} + ${bottom.count})`)
  // An underside resting on another piece is covered, like a covered top.
  const resting = bands([{ ...slab, trim: 'hazard-bottom' }, { x: 0, y: 500, w: 400, h: 100 }])
  assert.equal(resting.count, 0, 'a covered underside carries none')
  assert.deepEqual(parseLevel(room({ platforms: [{ ...slab, trim: 'hazard-both' }] })).platforms[0].trim, 'hazard-both', 'the new values load')
})

test('terrain grit is deterministic, stays inside the level, and is quick to prepare against the enclosing floor', () => {
  const level = parseLevel(room({ platforms: [{ x: 0, y: 700, w: 1200, h: 300 }] })), terrain = levelTerrain(level)
  const draw = () => { const { ctx, calls } = recorder(); drawTerrainEdges(ctx, terrain, level); return calls }
  const started = performance.now(), first = draw()
  assert.ok(performance.now() - started < 500, 'the enclosing floor runs far past the level; grit is only laid along the level')
  // Wear, not water: hairline cracks and pits on stone, each its own fill, then the chips as one path.
  const marks = calls => calls.filter(c => c[0] === 'fill' && WEAR_STYLE.test(String(c[1]))).map(c => [String(c[1]), c[2].commands])
  const kinds = marks(first).map(([style]) => style), cracks = kinds.filter(k => k.startsWith('rgba(46,48,38')).length
  assert.ok(cracks > 2, `cracks along the level's floor and top (${cracks})`)
  assert.ok(!kinds.some(k => /^rgba\((150,84,44|96,76,54|126,126,120)/.test(k)), 'stone neither rusts nor shows soil')
  const xs = marks(first).flatMap(([, c]) => c.flatMap((op, i) => op === MOVE ? [c[i + 1]] : []))
  assert.ok(xs.every(x => x >= -10 && x <= level.width + 10), 'wear stays along the level')
  // Regression: the daylight cache redraws a clipped patch over a cached frame, and Chrome rounds a clipped
  // translucent path differently along a slanted edge or across a long path of many marks (pits added to the
  // chips' path broke it). Grit has only upright and level edges, and each mark is its own fill (surfaceDepth.ts).
  for (const [index, [style, commands]] of marks(first).entries()) {
    const shapes = gritShapes(commands)
    if (index < kinds.length - 1) {
      // A mark fills a small area; several marks in one fill would spread along the top or across the face.
      const xs = shapes.flat().map(p => p[0]), ys = shapes.flat().map(p => p[1])
      assert.ok(Math.max(...xs) - Math.min(...xs) < 80 && Math.max(...ys) - Math.min(...ys) < 70, `one mark per fill (${style})`)
    }
    for (const points of shapes) for (let i = 0; i < points.length; i++) {
      const [a, b] = [points[i], points[(i + 1) % points.length]]
      assert.ok(Math.abs(a[0] - b[0]) < 1e-9 || Math.abs(a[1] - b[1]) < 1e-9, `grit edges are upright or level (${a} to ${b})`)
    }
  }
  const again = parseLevel(room({ platforms: [{ x: 0, y: 700, w: 1200, h: 300 }] }))
  const { ctx, calls } = recorder(); drawTerrainEdges(ctx, levelTerrain(again), again)
  assert.deepEqual(marks(calls), marks(first), 'the same on every visit')
  // Wall stripes over a wall: two colours of paint, then the wear.
  const wall = recorder(); drawWallStripes(wall.ctx, [band])
  assert.deepEqual(wall.calls.filter(c => c[0] === 'fill').map(c => c[1]), ['#2f312e', HAZARD_YELLOW, '#e4e4de'])
})

test('terrain wears by material: stone and chalk crack, steel rusts, earth varies, and a frame draws only the wear it can see', () => {
  const styles = (platforms, ctx = recorder()) => {
    const level = parseLevel(room({ platforms })); drawTerrainEdges(ctx.ctx, levelTerrain(level), level)
    return ctx.calls.filter(c => c[0] === 'fill' && WEAR_STYLE.test(String(c[1]))).map(c => String(c[1]))
  }
  const count = (list, prefix) => list.filter(s => s.startsWith(prefix)).length
  const piece = material => [{ x: 0, y: 400, w: 1200, h: 600, material }]
  const steel = styles(piece('steel')), earth = styles(piece('earth')), chalk = styles(piece('chalk')), stone = styles(piece('stone'))
  assert.ok(count(steel, 'rgba(150,84,44') > 3 && count(steel, 'rgba(104,54,30') > 3 && !count(steel, 'rgba(46,48,38'), 'steel rusts and does not crack')
  assert.ok(count(earth, 'rgba(126,126,120') > 3 && count(earth, 'rgba(96,76,54') + count(earth, 'rgba(255,246,226') > 3
    && !count(earth, 'rgba(46,48,38') && !count(earth, 'rgba(78,84,72'), 'earth shows pebbles and patches of soil, and does not crack')
  assert.ok(count(chalk, 'rgba(78,84,72') > count(stone, 'rgba(46,48,38'), 'chalk cracks more than stone')
  // A stone boulder in front of earth wears as stone: no soil is laid across it.
  const level = parseLevel(room({ platforms: [{ x: 0, y: 400, w: 1200, h: 600, material: 'earth' }, { x: 300, y: 300, w: 400, h: 400 }] }))
  const { ctx, calls } = recorder(); drawTerrainEdges(ctx, levelTerrain(level), level)
  for (const call of calls.filter(c => c[0] === 'fill' && /^rgba\((96,76,54|255,246,226|126,126,120)/.test(String(c[1]))))
    for (const [x, y] of gritShapes(call[2].commands).flat()) assert.ok(!(x > 302 && x < 698 && y > 302 && y < 698), `soil at ${x},${y} lies on the boulder`)
  // A frame leaves out wear outside its canvas; a retained layer, recorded without one, keeps it all.
  const all = recorder(); all.ctx.canvas = null
  const left = recorder(); left.ctx.canvas = { width: 300, height: 1000 }
  const whole = styles(piece('earth'), all).length, seen = styles(piece('earth'), left).length
  assert.ok(seen > 0 && seen < whole * .5, `a 300-unit canvas draws a fraction of the wear (${seen} of ${whole})`)
})
