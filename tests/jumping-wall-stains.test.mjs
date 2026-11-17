import test from 'node:test'
import assert from 'node:assert/strict'
import { blankTrial, parseLevel } from '../src/games/jumping/level.ts'
import { drawLevelBackdrop } from '../src/games/jumping/render.ts'
import { drawWallFinish, panelAt } from '../src/games/jumping/wallFinish.ts'
import { drawWallPanels } from '../src/games/jumping/surfaceDepth.ts'
import { drawWallPipes } from '../src/games/jumping/wallPipes.ts'
import { STAIN_LEVELS, wallWear } from '../src/games/jumping/wallWear.ts'
import { ARGUMENTS, MOVE, LINE } from '../src/games/jumping/webgl/artPath.ts'

// Stain intensity (docs/jumping-wall-wear.md): one setting per level, None, Light or Heavy (the default), chooses
// how much water has stained the room, and the level's ID gives each room its own pattern. Stains run from the
// bottom of a tile, and water washes the wall it covers.
const FINISHES = ['chamber', 'plank', 'upright', 'tile', 'plate']
const LEVELS = ['none', 'light', 'heavy']
const level = (extra = {}) => ({ ...blankTrial(), id: 'stain-room', width: 2400, height: 1600, floor: 1600, ...extra })
const wear = (stains, id = 'stain-room', extra = {}) => wallWear({ id, ...(stains === 'heavy' ? {} : { stains }), ...extra })

function recorder() {
  const calls = []
  const ctx = { canvas: { width: 2400, height: 1600 }, globalAlpha: 1, fillStyle: '', strokeStyle: '', lineWidth: 1, lineCap: 'butt', lineJoin: 'miter',
    getTransform: () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }) }
  for (const name of ['save', 'restore', 'beginPath', 'moveTo', 'lineTo', 'rect', 'clip', 'closePath', 'fillText', 'setLineDash'])
    ctx[name] = (...args) => calls.push([name, ...args])
  ctx.fillRect = (x, y, w, h) => calls.push(['fillRect', ctx.fillStyle, { x, y, w, h }])
  ctx.fill = path => calls.push(['fill', ctx.fillStyle, path])
  ctx.stroke = path => calls.push(['stroke', ctx.strokeStyle, path])
  return { ctx, calls }
}
const alpha = colour => Number(/,([\d.]+)\)$/.exec(colour)[1])
const rgb = colour => /^rgba\((\d+,\d+,\d+)/.exec(colour)?.[1]
const area = { x: 0, y: 0, w: 2400, h: 1600 }

/** A joint band: a rectangle exactly 1.1 (the shade) or .8 (the light lip) thick (wallFinish.ts, JointLines). */
const band = (r, width) => Math.abs(r.w - width) < 1e-9 || Math.abs(r.h - width) < 1e-9
/** A wall's stains, from its recorded calls: rectangles in the wall's ink (the course wall's, or the finish's, its joints' shade's), other than the joints. */
function stainsOf(calls) {
  const shade = calls.find(c => c[0] === 'fillRect' && band(c[2], 1.1) && /^rgba/.test(c[1]) && !c[1].startsWith('rgba(255,255,255'))
  const ink = rgb(shade?.[1] ?? '') ?? '74,78,62'
  const inked = calls.filter(c => c[0] === 'fillRect' && rgb(c[1]) === ink && !band(c[2], 1.1) && !band(c[2], .8))
  const styles = [...new Set(inked.map(c => c[1]))]
  const streaks = inked.map(c => c[2])
  // A streak starts where no step of another ends just above it.
  const heads = streaks.filter(r => !streaks.some(o => o !== r && Math.abs(o.y + o.h - r.y) < 1e-9 && o.x < r.x + r.w && r.x < o.x + o.w))
  return { styles, streaks, heads }
}
const course = (stains, extra) => { const r = recorder(); drawWallPanels(r.ctx, area, wear(stains, undefined, extra)); return stainsOf(r.calls) }
const finished = (finish, stains, night = false) => { const r = recorder(); drawWallFinish(r.ctx, finish, area, night, wear(stains)); return stainsOf(r.calls) }
const overlap = (a, b) => a.x < b.x + b.w - 1e-9 && b.x < a.x + a.w - 1e-9 && a.y < b.y + b.h - 1e-9 && b.y < a.y + a.h - 1e-9
const walls = [['course', course], ...FINISHES.map(finish => [finish, stains => finished(finish, stains)])]

test('a level saves its stains only when they are not Heavy, reads the old levels as Heavy, and rejects unknown ones', () => {
  assert.equal(parseLevel(level()).stains, undefined)
  assert.equal(parseLevel(level({ stains: 'heavy' })).stains, undefined, 'Heavy is saved by leaving the field out')
  for (const stains of ['none', 'light']) {
    const parsed = parseLevel(level({ stains }))
    assert.equal(parsed.stains, stains)
    assert.equal(parseLevel(JSON.parse(JSON.stringify(parsed))).stains, stains, 'round trip')
  }
  // Files saved when there were five levels.
  for (const old of ['normal', 'soaked']) assert.equal(parseLevel(level({ stains: old })).stains, undefined, `${old} reads as Heavy`)
  assert.throws(() => parseLevel(level({ stains: 'damp' })))
  assert.deepEqual(STAIN_LEVELS.map(s => s.id), LEVELS)
})

test('Light stains less of the wall than Heavy, more faintly, and None stains nothing', () => {
  for (const [name, draw] of walls) {
    assert.equal(draw('none').streaks.length, 0, `${name}: None draws no stains`)
    const light = draw('light'), heavy = draw('heavy')
    assert.ok(heavy.heads.length > light.heads.length && light.heads.length > 0, `${name}: more streaks when Heavy (${light.heads.length}, ${heavy.heads.length})`)
    assert.ok(alpha(heavy.styles[0]) > alpha(light.styles[0]), `${name}: darker when Heavy`)
    assert.equal(heavy.styles.length, 1, `${name}: one ink`)
  }
  // Heavy is lighter than the look every room had before the setting (the course wall's .075): .85 of it.
  assert.equal(course('heavy').styles[0], 'rgba(74,78,62,0.064)')
})

test('every stain runs from the bottom of a tile, the joint at the top of its panel, and stays within that panel', () => {
  for (const finish of ['course', ...FINISHES]) {
    const r = recorder(), joints = new Set()
    if (finish === 'course') drawWallPanels(r.ctx, area, wear('heavy')); else drawWallFinish(r.ctx, finish, area, false, wear('heavy'))
    // The level joints the wall draws, as their heights: the middles of the shade's level bands.
    for (const [, colour, band] of r.calls.filter(c => c[0] === 'fillRect')) if (Math.abs(band.h - 1.1) < 1e-9 && !colour.startsWith('rgba(255,255,255')) joints.add(Math.round((band.y + .55) * 1000) / 1000)
    const { streaks, heads } = stainsOf(r.calls)
    assert.ok(heads.length > 5)
    for (const head of heads) {
      assert.ok(joints.has(Math.round((head.y - 1.5) * 1000) / 1000), `${finish}: a streak at ${head.y} starts just under a joint`)
      assert.ok(head.y - 1.5 > 0, `${finish}: none from the top of the room, where no tile is above`)
    }
    for (const step of streaks) { const p = panelAt(finish, step.x + step.w / 2, step.y + .01); assert.ok(step.y + step.h <= p.y + p.h + 1e-6, `${finish}: within its panel`) }
  }
})

test('stains are rectangles that never overlap one another, so none darkens another', () => {
  // Regression: the daylight patch redraw must match the cached frame exactly, and Chrome rounds translucent
  // paths differently under its clip; rectangles drawn with fillRect match (wallWear.ts, stainLayer).
  for (const [name, draw] of walls) {
    const { streaks } = draw('heavy')
    assert.ok(streaks.length > 20, `${name}: stained`)
    for (const [i, a] of streaks.entries()) for (const b of streaks.slice(i + 1)) assert.ok(!overlap(a, b), `${name}: steps ${JSON.stringify(a)} and ${JSON.stringify(b)} overlap`)
  }
})

test('water washes the wall: a stain stops where it would run into a water zone, and none starts in one', () => {
  const water = { x: 0, y: 900, w: 2400, h: 700, effect: 'water' }
  const dry = course('heavy'), wet = course('heavy', { gravityPlates: [water] })
  assert.ok(dry.streaks.some(r => r.y + r.h > water.y), 'without water, stains run below its surface')
  assert.ok(wet.streaks.length > 0 && wet.streaks.every(r => r.y + r.h <= water.y + 1e-6), 'with water, every stain stops at its surface')
  assert.ok(wet.streaks.filter(r => r.y < water.y).length > 0)
  // A part of the wall beside the water is stained as before.
  const narrow = course('heavy', { gravityPlates: [{ ...water, w: 600 }] })
  assert.deepEqual(narrow.streaks.filter(r => r.x > 700), dry.streaks.filter(r => r.x > 700))
  // Pipe rust stops at the water too.
  const pipe = { points: [[100, 890], [2300, 890]] }
  const rust = extra => { const r = recorder(); drawWallPipes(r.ctx, [{ ...pipe, points: pipe.points.map(p => [...p]) }], wear('heavy', undefined, extra)); return r.calls.find(c => c[0] === 'fill' && String(c[1]).startsWith('rgba(104,66,36'))[2].commands }
  const ys = commands => { const out = []; for (let i = 0; i < commands.length; i += 1 + ARGUMENTS[commands[i]]) if (ARGUMENTS[commands[i]] === 2) out.push(commands[i + 2]); return out }
  assert.ok(ys(rust()).some(y => y > water.y + 1) && ys(rust({ gravityPlates: [water] })).every(y => y <= water.y + 1e-6), 'rust runs into the water only without it')
})

test('each room has its own stains, the same on every visit, and the same from every view', () => {
  const pattern = (id, view = area, finish) => {
    const r = recorder()
    if (finish) drawWallFinish(r.ctx, finish, view, false, wear('heavy', id)); else drawWallPanels(r.ctx, view, wear('heavy', id))
    return stainsOf(r.calls).streaks
  }
  assert.deepEqual(pattern('stain-room'), pattern('stain-room'), 'the same room draws the same stains')
  assert.notDeepEqual(pattern('stain-room'), pattern('another-room'), 'another room is stained differently')
  const key = r => `${r.x},${r.y},${r.w},${r.h}`
  for (const finish of [undefined, ...FINISHES]) {
    const all = new Set(pattern('stain-room', area, finish).map(key)), view = { x: 300, y: 400, w: 1500, h: 900 }
    const part = pattern('stain-room', view, finish).filter(r => r.x >= view.x && r.x + r.w <= view.x + view.w && r.y >= view.y && r.y + r.h <= view.y + view.h)
    assert.ok(part.length > 1 && part.every(r => all.has(key(r))), `${finish ?? 'course'}: a part of the wall draws the streaks the whole does`)
  }
  const draw = file => { const r = recorder(); drawLevelBackdrop(r.ctx, parseLevel(file), area, 1, false); return stainsOf(r.calls).streaks }
  assert.notDeepEqual(draw(level({ stains: 'light' })), draw(level()))
  assert.notDeepEqual(draw(level({ id: 'other' })), draw(level()))
})

test('pipe rust follows the room\'s stains: none at None, more when Heavy', () => {
  const pipe = { points: [[100, 400], [2300, 400]] }
  const rust = stains => { const r = recorder(); drawWallPipes(r.ctx, [{ ...pipe, points: pipe.points.map(p => [...p]) }], wear(stains)); return r.calls.find(c => c[0] === 'fill' && String(c[1]).startsWith('rgba(104,66,36'))[2] }
  const starts = path => { let n = 0; for (let i = 0, c = path.commands; i < c.length; i += 1 + ARGUMENTS[c[i]]) if (c[i] === MOVE) n++; return n }
  assert.equal(starts(rust('none')), 0)
  assert.ok(starts(rust('heavy')) > starts(rust('light')))
})
