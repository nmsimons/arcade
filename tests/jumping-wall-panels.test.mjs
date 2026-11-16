import test from 'node:test'
import assert from 'node:assert/strict'
import { drawWallFinish, panelAt, panelGrid } from '../src/games/jumping/wallFinish.ts'
import { drawWallPanels } from '../src/games/jumping/surfaceDepth.ts'
import { ARGUMENTS, MOVE, LINE } from '../src/games/jumping/webgl/artPath.ts'

// panelAt (docs/jumping-wall-wear.md, Where a hole goes): the panel under a point, exactly as the wall draws it,
// so a missing panel's hole always matches the joints around it.
const FINISHES = ['course', 'chamber', 'plank', 'upright', 'tile', 'plate']
const area = { x: 0, y: 0, w: 3200, h: 2000 }

/** The joint lines a wall draws: the shade's bands along and up the wall (1.1 thick), as level and upright segments. */
function joints(finish) {
  const bands = []
  const ctx = { canvas: { width: 2400, height: 1600 }, fillStyle: '', strokeStyle: '', lineWidth: 1,
    save() {}, restore() {}, beginPath() {}, rect() {}, clip() {}, fill() {}, stroke() {},
    fillRect(x, y, w, h) { bands.push([this.fillStyle, x, y, w, h]) } }
  if (finish === 'course') drawWallPanels(ctx, area); else drawWallFinish(ctx, finish, area)
  const level = [], upright = []
  // The shade is the 1.1-wide band; the light lip, .8 wide and white, sits just inside it.
  for (const [colour, x, y, w, h] of bands) {
    if (colour.startsWith('rgba(255,255,255') || colour === '#ffffff91') continue
    if (Math.abs(h - 1.1) < 1e-9) level.push({ at: y + .55, from: x, to: x + w })
    else if (Math.abs(w - 1.1) < 1e-9) upright.push({ at: x + .55, from: y, to: y + h })
  }
  return { level, upright }
}
/** Whether the segments along one line cover `from` to `to` without a gap. */
function covered(segments, at, from, to) {
  const on = segments.filter(s => Math.abs(s.at - at) < 1e-6 && s.to > from && s.from < to).sort((a, b) => a.from - b.from)
  // The course wall's upright bands stop just short of the level ones, where those cover the corner.
  let reach = from
  for (const s of on) { if (s.from > reach + .6) return false; reach = Math.max(reach, s.to) }
  return reach >= to - .6
}

test('the panel under a point is the one whose joints the wall draws around it, doubles whole', () => {
  for (const finish of FINISHES) {
    const { level, upright } = joints(finish), grid = panelGrid(finish)
    let doubles = 0
    for (let i = 0; i < 400; i++) {
      // Points well inside the drawn area, so every edge of their panel is drawn.
      const x = 400 + ((i * 97.31) % 1600), y = 400 + ((i * 53.77) % 800), p = panelAt(finish, x, y)
      assert.ok(x >= p.x && x < p.x + p.w && y >= p.y && y < p.y + p.h, `${finish}: the panel holds the point`)
      assert.ok(covered(level, p.y, p.x, p.x + p.w) && covered(level, p.y + p.h, p.x, p.x + p.w), `${finish}: joints along the top and bottom of ${JSON.stringify(p)}`)
      assert.ok(covered(upright, p.x, p.y, p.y + p.h) && covered(upright, p.x + p.w, p.y, p.y + p.h), `${finish}: joints up both sides of ${JSON.stringify(p)}`)
      if (p.w === grid.w * 2) {
        doubles++
        assert.ok(!covered(upright, p.x + grid.w, p.y + 2, p.y + p.h - 2), `${finish}: no joint down the middle of a double`)
        assert.deepEqual(panelAt(finish, p.x + grid.w * 1.5, p.y + 1), p, `${finish}: either half gives the whole double`)
      } else assert.equal(p.w, grid.w)
      assert.equal(p.h, grid.h)
      // Every point in the panel gives the same panel.
      assert.deepEqual(panelAt(finish, p.x + p.w - .01, p.y + p.h - .01), p)
    }
    if (grid.merged) assert.ok(doubles > 0, `${finish}: some points land on doubles`)
  }
})

test('neighbouring panels tile the wall: no two overlap and none leaves a gap', () => {
  for (const finish of FINISHES) {
    const seen = new Map()
    for (let x = 300; x < 2100; x += 7) for (let y = 300; y < 1300; y += 7) {
      const p = panelAt(finish, x, y), key = `${p.x},${p.y}`
      if (!seen.has(key)) seen.set(key, p)
      assert.deepEqual(seen.get(key), p, `${finish}: one panel at ${key}`)
    }
    const all = [...seen.values()]
    for (const [i, a] of all.entries()) for (const b of all.slice(i + 1))
      assert.ok(a.x + a.w <= b.x + 1e-9 || b.x + b.w <= a.x + 1e-9 || a.y + a.h <= b.y + 1e-9 || b.y + b.h <= a.y + 1e-9, `${finish}: ${JSON.stringify(a)} and ${JSON.stringify(b)} overlap`)
  }
})
