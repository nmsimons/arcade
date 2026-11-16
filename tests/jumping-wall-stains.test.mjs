import test from 'node:test'
import assert from 'node:assert/strict'
import { blankTrial, parseLevel } from '../src/games/jumping/level.ts'
import { drawLevelBackdrop } from '../src/games/jumping/render.ts'
import { drawWallFinish } from '../src/games/jumping/wallFinish.ts'
import { drawWallPanels } from '../src/games/jumping/surfaceDepth.ts'
import { drawWallPipes } from '../src/games/jumping/wallPipes.ts'
import { STAIN_LEVELS, wallWear } from '../src/games/jumping/wallWear.ts'
import { ARGUMENTS, MOVE } from '../src/games/jumping/webgl/artPath.ts'

// Stain intensity (docs/jumping-wall-wear.md): one setting per level chooses how much water has stained the
// room, from spotless to soaked, and the level's ID gives each room its own pattern.
const FINISHES = ['chamber', 'plank', 'upright', 'tile', 'plate']
const LEVELS = ['none', 'light', 'normal', 'heavy', 'soaked']
const level = (extra = {}) => ({ ...blankTrial(), id: 'stain-room', width: 2400, height: 1600, floor: 1600, ...extra })
const wear = (stains, id = 'stain-room') => wallWear({ id, ...(stains === 'normal' ? {} : { stains }) })

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
const starts = path => { let n = 0; for (let i = 0, c = path?.commands ?? []; i < c.length; i += 1 + ARGUMENTS[c[i]]) if (c[i] === MOVE) n++; return n }
const area = { x: 0, y: 0, w: 2400, h: 1600 }

/**
 * A wall's stains, from its recorded calls: rectangles in the wall's ink (the course wall's, or a finish's,
 * which its joints are stroked in), split into streaks and, at Soaked, their cores.
 */
function stainsOf(calls) {
  const ink = rgb(calls.find(c => c[0] === 'stroke')?.[1] ?? '') ?? '74,78,62'
  const inked = calls.filter(c => c[0] === 'fillRect' && rgb(c[1]) === ink)
  const styles = [...new Set(inked.map(c => c[1]))].sort((a, b) => alpha(b) - alpha(a))
  const streaks = inked.filter(c => c[1] === styles[0]).map(c => c[2]), cores = inked.filter(c => c[1] === styles[1]).map(c => c[2])
  // A streak starts where no step of another ends just above it.
  const heads = streaks.filter(r => !streaks.some(o => o !== r && Math.abs(o.y + o.h - r.y) < 1e-9 && o.x < r.x + r.w && r.x < o.x + o.w))
  return { styles, streaks, cores, heads }
}
const course = stains => { const r = recorder(); drawWallPanels(r.ctx, area, wear(stains)); return stainsOf(r.calls) }
const finished = (finish, stains, night = false) => { const r = recorder(); drawWallFinish(r.ctx, finish, area, night, wear(stains)); return stainsOf(r.calls) }
const overlap = (a, b) => a.x < b.x + b.w - 1e-9 && b.x < a.x + a.w - 1e-9 && a.y < b.y + b.h - 1e-9 && b.y < a.y + a.h - 1e-9
const walls = [['course', course], ...FINISHES.map(finish => [finish, stains => finished(finish, stains)])]

test('a level saves its stains only when they are not Normal, and rejects unknown levels', () => {
  assert.equal(parseLevel(level()).stains, undefined)
  assert.equal(parseLevel(level({ stains: 'normal' })).stains, undefined, 'Normal is saved by leaving the field out')
  for (const stains of ['none', 'light', 'heavy', 'soaked']) {
    const parsed = parseLevel(level({ stains }))
    assert.equal(parsed.stains, stains)
    assert.equal(parseLevel(JSON.parse(JSON.stringify(parsed))).stains, stains, 'round trip')
  }
  assert.throws(() => parseLevel(level({ stains: 'damp' })))
  assert.deepEqual(STAIN_LEVELS.map(s => s.id), LEVELS)
})

test('each stain level stains more of the wall than the one before, more darkly, and None stains nothing', () => {
  for (const [name, draw] of walls) {
    assert.equal(draw('none').streaks.length, 0, `${name}: None draws no stains`)
    const heads = LEVELS.slice(1).map(stains => draw(stains).heads.length)
    const opacity = LEVELS.slice(1).map(stains => alpha(draw(stains).styles[0]))
    for (let i = 1; i < heads.length; i++) {
      assert.ok(heads[i] > heads[i - 1], `${name}: more streaks at ${LEVELS[i + 1]}: ${heads}`)
      assert.ok(opacity[i] > opacity[i - 1], `${name}: darker at ${LEVELS[i + 1]}: ${opacity}`)
    }
    // Streaks in one ink, and a second ink only at Soaked for the cores of its long streaks.
    assert.deepEqual(LEVELS.slice(1).map(stains => draw(stains).styles.length), [1, 1, 1, 2], name)
  }
  // Normal is today's look: the course wall's .075.
  assert.equal(course('normal').styles[0], 'rgba(74,78,62,0.075)')
})

test('stains are rectangles that never overlap one another, so none darkens another', () => {
  // Regression: the daylight patch redraw must match the cached frame exactly, and Chrome rounds translucent
  // paths differently under its clip; rectangles drawn with fillRect match (wallWear.ts, stainLayer).
  for (const [name, draw] of walls) for (const stains of ['heavy', 'soaked']) {
    const { streaks, cores } = draw(stains)
    assert.ok(streaks.length > 20, `${name} ${stains}: stained`)
    for (const [i, a] of streaks.entries()) for (const b of streaks.slice(i + 1)) assert.ok(!overlap(a, b), `${name} ${stains}: steps ${JSON.stringify(a)} and ${JSON.stringify(b)} overlap`)
    // A core lies within its own streak's steps.
    for (const core of cores) assert.ok(streaks.some(s => core.x >= s.x - 1e-9 && core.x + core.w <= s.x + s.w + 1e-9 && overlap(core, s)), `${name}: a core inside its streak`)
  }
})

test('soaked stains stay faint enough in daylight: a streak and its core together reach at most .16', () => {
  // A streak and its core are the only stains that overlap.
  const together = styles => 1 - styles.reduce((clear, style) => clear * (1 - alpha(style)), 1)
  assert.ok(together(course('soaked').styles) <= .16 + 1e-9, `course wall: ${together(course('soaked').styles)}`)
  for (const finish of FINISHES) assert.ok(together(finished(finish, 'soaked').styles) <= .16 + 1e-9, `${finish}: ${together(finished(finish, 'soaked').styles)}`)
  // A dark level strengthens its finish's stains with the rest of it.
  for (const finish of FINISHES) assert.ok(alpha(finished(finish, 'soaked', true).styles[0]) > alpha(finished(finish, 'soaked').styles[0]))
})

test('each room has its own stains, the same on every visit, and the same from every view', () => {
  const pattern = (id, view = area, finish) => {
    const r = recorder()
    if (finish) drawWallFinish(r.ctx, finish, view, false, wear('soaked', id)); else drawWallPanels(r.ctx, view, wear('soaked', id))
    return stainsOf(r.calls).streaks
  }
  assert.deepEqual(pattern('stain-room'), pattern('stain-room'), 'the same room draws the same stains')
  assert.notDeepEqual(pattern('stain-room'), pattern('another-room'), 'another room is stained differently')
  // A part of the wall draws the same streaks there as the whole: which streak gives way to one from the row
  // above never depends on how much of the wall is drawn.
  const key = r => `${r.x},${r.y},${r.w},${r.h}`
  for (const finish of [undefined, ...FINISHES]) {
    const all = new Set(pattern('stain-room', area, finish).map(key)), view = { x: 500, y: 700, w: 900, h: 500 }
    const part = pattern('stain-room', view, finish).filter(r => r.x >= view.x && r.x + r.w <= view.x + view.w && r.y >= view.y && r.y + r.h <= view.y + view.h)
    assert.ok(part.length > 5 && part.every(r => all.has(key(r))), `${finish ?? 'course'}: a part of the wall draws the streaks the whole does`)
  }
  // Through the level itself: its ID and setting reach the wall.
  const draw = file => { const r = recorder(); drawLevelBackdrop(r.ctx, parseLevel(file), area, 1, false); return stainsOf(r.calls).streaks }
  assert.notDeepEqual(draw(level({ stains: 'heavy' })), draw(level()))
  assert.notDeepEqual(draw(level({ id: 'other' })), draw(level()))
})

test('a heavy room\'s long streaks run past the joint below, and a view starting below a joint still shows them', () => {
  // Panels are 240 high on the course wall. A view starting just under a joint that a streak crosses misses the
  // panel the streak starts in, but still draws the streak.
  for (const stains of ['heavy', 'soaked']) {
    const crossing = course(stains).streaks.find(r => Math.floor(r.y / 240) !== Math.floor((r.y + r.h - 1e-6) / 240))
    assert.ok(crossing, `${stains}: a streak runs on past the joint below`)
    const joint = Math.ceil(crossing.y / 240) * 240
    const below = recorder(); drawWallPanels(below.ctx, { x: 0, y: joint + 10, w: 2400, h: 1600 - joint - 10 }, wear(stains))
    assert.ok(stainsOf(below.calls).streaks.some(r => r.x === crossing.x && r.y === crossing.y), `${stains}: the view below the joint draws it`)
  }
  // Normal streaks stay within their panel.
  const { streaks } = course('normal')
  assert.ok(streaks.every(r => Math.floor(r.y / 240) === Math.floor((r.y + r.h - 1e-6) / 240)), 'a normal streak ends within its panel')
})

test('pipe rust follows the room\'s stains: none at None, more and longer as the room gets wetter', () => {
  const pipe = { points: [[100, 400], [2300, 400]] }
  const rust = stains => { const r = recorder(); drawWallPipes(r.ctx, [{ ...pipe, points: pipe.points.map(p => [...p]) }], wear(stains)); return r.calls.find(c => c[0] === 'fill' && String(c[1]).startsWith('rgba(104,66,36'))[2] }
  assert.equal(starts(rust('none')), 0)
  const counts = LEVELS.slice(1).map(stains => starts(rust(stains)))
  for (let i = 1; i < counts.length; i++) assert.ok(counts[i] >= counts[i - 1], `rust at each level: ${counts}`)
  assert.ok(counts.at(-1) > counts[0], `soaked rusts more than light: ${counts}`)
})
