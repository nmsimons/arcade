import test from 'node:test'
import assert from 'node:assert/strict'
import { blankTrial, parseLevel } from '../src/games/jumping/level.ts'
import { drawLevelBackdrop } from '../src/games/jumping/render.ts'
import { WALL_FINISHES, drawWallFinish } from '../src/games/jumping/wallFinish.ts'

const level = (wallFinish) => ({ ...blankTrial(), ...(wallFinish === undefined ? {} : { wallFinish }) })

test('a level saves its wall finish only when it is not the course wall, and rejects unknown finishes', () => {
  assert.equal(parseLevel(level()).wallFinish, undefined)
  assert.equal(parseLevel(level('course')).wallFinish, undefined, 'the default is saved by leaving the field out')
  for (const finish of ['panels', 'tile', 'bulkhead']) {
    const parsed = parseLevel(level(finish))
    assert.equal(parsed.wallFinish, finish)
    assert.equal(parseLevel(JSON.parse(JSON.stringify(parsed))).wallFinish, finish, 'round trip')
  }
  assert.throws(() => parseLevel(level('marble')))
  assert.deepEqual(WALL_FINISHES.map(f => f.id), ['course', 'panels', 'tile', 'bulkhead'])
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
const view = { x: 0, y: 0, w: 1600, h: 900 }

test('every finish keeps the course wall: its base fill, fine grid and shaded panels, with the finish layered after them', () => {
  const plain = recorder()
  drawLevelBackdrop(plain.ctx, parseLevel(level()), view, 1, false)
  for (const finish of ['panels', 'tile', 'bulkhead']) {
    const { ctx, calls } = recorder()
    drawLevelBackdrop(ctx, parseLevel(level(finish)), view, 1, false)
    const fills = calls.filter(c => c[0] === 'fillRect')
    assert.deepEqual(fills[1].slice(1, 3), [0, 0], `${finish}: base fill at the level origin`)
    assert.equal(fills[1].at(-1), '#f1f1ed', `${finish}: base fill colour, which locates the camera`)
    // The finish is one block inserted into the plain drawing: take it out and the course wall is unchanged.
    const extra = calls.length - plain.calls.length, at = calls.findIndex((c, i) => JSON.stringify(c) !== JSON.stringify(plain.calls[i]))
    assert.ok(extra > 0 && at >= 0, `${finish}: adds its own layer`)
    assert.deepEqual([...calls.slice(0, at), ...calls.slice(at + extra)], plain.calls, `${finish}: the course wall is otherwise unchanged`)
    const before = calls.slice(0, at), block = calls.slice(at, at + extra)
    for (const ink of ['#353f4810', '#52635421', '#ffffff91']) assert.ok(before.some(c => c[0] === 'stroke' && c[1] === ink), `${finish}: after the grid and panels (${ink})`)
    assert.equal(block.some(c => c[0] === 'stroke'), false, `${finish}: draws no lines of its own`)
  }
})

test('finishes stay light: a faint wash at most, and small fixings only when close enough to see them', () => {
  for (const finish of ['panels', 'bulkhead']) {
    const near = recorder(), far = recorder()
    drawWallFinish(near.ctx, finish, { x: 0, y: 0, w: 1600, h: 900 }, 1)
    drawWallFinish(far.ctx, finish, { x: 0, y: 0, w: 1600, h: 900 }, .2)
    assert.equal(near.calls.filter(c => c[0] === 'fill').length, 1, `${finish}: fixings as one path`)
    assert.equal(far.calls.filter(c => c[0] === 'fill').length, 0, `${finish}: no fixings when zoomed out`)
  }
  for (const finish of ['tile', 'bulkhead']) {
    const { ctx, calls } = recorder()
    drawWallFinish(ctx, finish, { x: 0, y: 0, w: 1600, h: 900 }, 1)
    const wash = calls.find(c => c[0] === 'fillRect')
    assert.ok(Number(/,(\.\d+)\)$/.exec(wash.at(-1))[1]) <= .08, `${finish}: a faint wash, ${wash.at(-1)}`)
  }
  const empty = recorder(); drawWallFinish(empty.ctx, 'tile', { x: 0, y: 0, w: 0, h: 900 }, 1)
  assert.equal(empty.calls.length, 0)
})
