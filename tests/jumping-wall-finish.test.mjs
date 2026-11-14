import test from 'node:test'
import assert from 'node:assert/strict'
import { blankTrial, parseLevel } from '../src/games/jumping/level.ts'
import { drawLevelBackdrop } from '../src/games/jumping/render.ts'
import { WALL_FINISHES, drawWallFinish } from '../src/games/jumping/wallFinish.ts'

const FINISHES = ['chamber', 'plank', 'upright', 'tile', 'plate']
const level = (wallFinish) => ({ ...blankTrial(), ...(wallFinish === undefined ? {} : { wallFinish }) })

test('a level saves its wall finish only when it is not the course wall, and rejects unknown finishes', () => {
  assert.equal(parseLevel(level()).wallFinish, undefined)
  assert.equal(parseLevel(level('course')).wallFinish, undefined, 'the default is saved by leaving the field out')
  for (const finish of FINISHES) {
    const parsed = parseLevel(level(finish))
    assert.equal(parsed.wallFinish, finish)
    assert.equal(parseLevel(JSON.parse(JSON.stringify(parsed))).wallFinish, finish, 'round trip')
  }
  assert.throws(() => parseLevel(level('marble')))
  assert.deepEqual(WALL_FINISHES.map(f => f.id), ['course', ...FINISHES])
})

test('levels saved under the first finish names still load, as the finishes that replaced them', () => {
  assert.equal(parseLevel(level('panels')).wallFinish, 'plank')
  assert.equal(parseLevel(level('bulkhead')).wallFinish, 'plate')
})

/** A Canvas 2D stand-in recording calls with the styles in force. */
function recorder() {
  const calls = []
  const ctx = { canvas: { width: 1600, height: 900 }, globalAlpha: 1, fillStyle: '', strokeStyle: '', lineWidth: 1,
    getTransform: () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }) }
  for (const name of ['save', 'restore', 'beginPath', 'moveTo', 'lineTo', 'rect', 'clip', 'closePath'])
    ctx[name] = (...args) => calls.push([name, ...args])
  ctx.fillRect = (...args) => calls.push(['fillRect', ...args, ctx.fillStyle])
  ctx.fill = () => calls.push(['fill', ctx.fillStyle])
  ctx.stroke = () => calls.push(['stroke', ctx.strokeStyle, ctx.lineWidth])
  return { ctx, calls }
}
const view = { x: 0, y: 0, w: 1600, h: 900 }, area = { x: 0, y: 0, w: 1600, h: 900 }
const alpha = colour => colour.startsWith('rgba') ? Number(/,([\d.]+)\)$/.exec(colour)[1]) : parseInt(colour.slice(7, 9) || 'ff', 16) / 255

test('every finish keeps the wall under it: the base fill that locates the camera, then the fine grid, then its panels', () => {
  const plain = recorder()
  drawLevelBackdrop(plain.ctx, parseLevel(level()), view, 1, false)
  const panelsAt = plain.calls.findIndex(c => c[0] === 'stroke' && c[1] === '#353f4810') + 1
  for (const finish of FINISHES) {
    const { ctx, calls } = recorder()
    drawLevelBackdrop(ctx, parseLevel(level(finish)), view, 1, false)
    assert.deepEqual(calls.slice(0, panelsAt), plain.calls.slice(0, panelsAt), `${finish}: the wall up to its grid is the course wall's`)
    assert.equal(calls.slice(0, panelsAt).some(c => c[0] === 'fillRect' && c.at(-1) === '#f1f1ed'), true, `${finish}: base fill`)
    assert.ok(calls.length > panelsAt, `${finish}: draws its panels after the grid`)
  }
})

test('a finish is the course wall\'s construction: light panel tints that never overlap, and its two joint lines', () => {
  for (const finish of FINISHES) {
    const { ctx, calls } = recorder()
    drawWallFinish(ctx, finish, area)
    const strokes = calls.filter(c => c[0] === 'stroke')
    assert.equal(strokes.length, 4, `${finish}: a shade and a light lip, along the wall and up it, each a single path`)
    assert.deepEqual(strokes.map(s => s[2]), [1.1, .8, 1.1, .8], `${finish}: the course wall's joint widths`)
    for (const shade of [strokes[0], strokes[2]]) assert.ok(alpha(shade[1]) <= .22, `${finish}: a soft joint shade, ${shade[1]}`)
    assert.equal(calls.some(c => c[0] === 'fill'), false, `${finish}: no hardware or other marks`)
    const fills = calls.filter(c => c[0] === 'fillRect'), whole = fills.filter(f => f[3] === area.w && f[4] === area.h)
    assert.ok(whole.length <= 1 && whole.every(f => alpha(f.at(-1)) <= .1), `${finish}: at most one light wash`)
    const panels = fills.filter(f => !whole.includes(f))
    assert.ok(panels.length > 4, `${finish}: panels`)
    for (const [, , , , , colour] of panels) assert.ok(colour.startsWith('rgba(255,255,255') ? alpha(colour) <= .17 : alpha(colour) <= .1, `${finish}: a light tint, ${colour}`)
    // Translucent tints must not accumulate where panels meet.
    for (const [i, a] of panels.entries()) for (const b of panels.slice(i + 1))
      assert.ok(a[1] + a[3] <= b[1] || b[1] + b[3] <= a[1] || a[2] + a[4] <= b[2] || b[2] + b[4] <= a[2], `${finish}: panels ${a.slice(1, 5)} and ${b.slice(1, 5)} overlap`)
    const tints = new Set(panels.map(f => f.at(-1)))
    assert.ok(tints.size > 3, `${finish}: panels differ a little from one another`)
  }
})

test('a finish is anchored to the world, so panning the view never moves a panel', () => {
  for (const finish of FINISHES) {
    const a = recorder(), b = recorder()
    drawWallFinish(a.ctx, finish, { x: 0, y: 0, w: 1600, h: 900 })
    drawWallFinish(b.ctx, finish, { x: 500, y: 300, w: 1600, h: 900 })
    const key = f => f.join(), shared = new Set(a.calls.filter(c => c[0] === 'fillRect' && c[3] !== 1600).map(key))
    const again = b.calls.filter(c => c[0] === 'fillRect' && c[3] !== 1600 && c[1] < 1600 && c[2] < 900 && c[1] + c[3] > 500 && c[2] + c[4] > 300)
    assert.ok(again.length > 0)
    for (const panel of again) assert.ok(shared.has(key(panel)), `${finish}: panel ${panel.slice(1, 5)} is the same from both views`)
  }
  const empty = recorder(); drawWallFinish(empty.ctx, 'tile', { x: 0, y: 0, w: 0, h: 900 })
  assert.equal(empty.calls.length, 0)
})

test('a dark level draws its finish stronger, the joints most of all, on the same panels', () => {
  for (const finish of FINISHES) {
    const day = recorder(), night = recorder()
    drawWallFinish(day.ctx, finish, area)
    drawWallFinish(night.ctx, finish, area, true)
    const shape = calls => calls.map(c => c[0] === 'fillRect' ? c.slice(0, 5) : c[0] === 'stroke' ? [c[0], c[2]] : c)
    assert.deepEqual(shape(night.calls), shape(day.calls), `${finish}: the same panels and joints by night`)
    const strokes = calls => calls.filter(c => c[0] === 'stroke').map(c => alpha(c[1]))
    const fills = calls => calls.filter(c => c[0] === 'fillRect').map(c => alpha(c.at(-1)))
    strokes(day.calls).forEach((a, i) => assert.ok(strokes(night.calls)[i] > a && strokes(night.calls)[i] <= .9, `${finish}: joint ${i}, ${a} by day and ${strokes(night.calls)[i]} by night`))
    fills(day.calls).forEach((a, i) => assert.ok(fills(night.calls)[i] > a && fills(night.calls)[i] <= .25, `${finish}: fill ${i}, ${a} by day and ${fills(night.calls)[i]} by night`))
  }
  // The level decides: night mode strengthens the finish, daylight leaves it as it was.
  const lit = recorder(), dark = recorder()
  drawLevelBackdrop(lit.ctx, parseLevel(level('tile')), view, 1, false)
  drawLevelBackdrop(dark.ctx, { ...parseLevel(level('tile')), lighting: { ambient: 0, nightMode: true, lights: [] } }, view, 1, false)
  const washes = calls => calls.filter(c => c[0] === 'fillRect' && c.at(-1).startsWith('rgba(96,168,188')).map(c => alpha(c.at(-1)))
  assert.deepEqual(washes(lit.calls), [.1])
  assert.deepEqual(washes(dark.calls), [.18])
})
