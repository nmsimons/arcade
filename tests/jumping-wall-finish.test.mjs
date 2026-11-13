import test from 'node:test'
import assert from 'node:assert/strict'
import { blankTrial, parseLevel } from '../src/games/jumping/level.ts'
import { drawLevelBackdrop } from '../src/games/jumping/render.ts'
import { WALL_FINISHES, drawWallFinish, wallHasGrid } from '../src/games/jumping/wallFinish.ts'

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
  assert.equal(wallHasGrid(undefined), true); assert.equal(wallHasGrid('course'), true); assert.equal(wallHasGrid('panels'), false)
})

/** A Canvas 2D stand-in recording calls with the styles in force. */
function recorder() {
  const calls = []
  const ctx = { canvas: { width: 1600, height: 900 }, globalAlpha: 1, fillStyle: '', strokeStyle: '', lineWidth: 1,
    getTransform: () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }) }
  for (const name of ['save', 'restore', 'beginPath', 'moveTo', 'lineTo', 'rect', 'clip', 'closePath'])
    ctx[name] = (...args) => calls.push([name, ...args])
  ctx.fillRect = (...args) => calls.push(['fillRect', ...args, ctx.fillStyle])
  ctx.fill = (...args) => calls.push(['fill', ctx.fillStyle, args[0]?.constructor?.name])
  ctx.stroke = (...args) => calls.push(['stroke', ctx.strokeStyle, ctx.lineWidth, args[0]?.constructor?.name])
  return { ctx, calls }
}
const view = { x: 0, y: 0, w: 1600, h: 900 }

test('every finish keeps the wall base fill the camera is located by, and only the course wall draws the fine grid', () => {
  for (const finish of [undefined, 'panels', 'tile', 'bulkhead']) {
    const { ctx, calls } = recorder()
    drawLevelBackdrop(ctx, parseLevel(level(finish)), view, 1, false)
    const fills = calls.filter(c => c[0] === 'fillRect')
    assert.deepEqual(fills[1].slice(1, 3), [0, 0], `${finish}: base fill at the level origin`)
    assert.equal(fills[1].at(-1), '#f1f1ed', `${finish}: base fill colour`)
    // The course grid is one translucent hairline stroke of #353f4810.
    const grid = calls.some(c => c[0] === 'stroke' && c[1] === '#353f4810')
    assert.equal(grid, finish === undefined, `${finish}: fine grid`)
  }
})

test('finishes draw within the visible part of the level, and drop small fixings when zoomed out', () => {
  for (const finish of ['panels', 'bulkhead']) {
    const near = recorder(), far = recorder()
    drawWallFinish(near.ctx, finish, { x: 0, y: 0, w: 1600, h: 900 }, 1)
    drawWallFinish(far.ctx, finish, { x: 0, y: 0, w: 1600, h: 900 }, .2)
    const fixings = calls => calls.filter(c => c[0] === 'fill').length
    assert.equal(fixings(near.calls), 1, `${finish}: fixings as one path`)
    assert.equal(fixings(far.calls), 0, `${finish}: no fixings when zoomed out`)
    assert.ok(near.calls.some(c => c[0] === 'clip'), 'clipped to the area')
  }
  const empty = recorder(); drawWallFinish(empty.ctx, 'tile', { x: 0, y: 0, w: 0, h: 900 }, 1)
  assert.equal(empty.calls.length, 0)
})
