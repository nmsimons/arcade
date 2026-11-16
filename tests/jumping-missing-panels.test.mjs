import test from 'node:test'
import assert from 'node:assert/strict'
import { blankTrial, levelProblems, parseLevel } from '../src/games/jumping/level.ts'
import { drawLevelBackdrop } from '../src/games/jumping/render.ts'
import { panelAt, panelGrid } from '../src/games/jumping/wallFinish.ts'
import { wallWear } from '../src/games/jumping/wallWear.ts'
import { MAX_MISSING_PANELS, holeOf, missingPanelArt, missingPanelHoles, voidLayout } from '../src/games/jumping/wallMissingPanels.ts'
import { levelSalt } from '../src/games/jumping/wallWear.ts'

// Missing panels (docs/jumping-wall-wear.md): a panel taken out of the back wall, showing the services behind it.
const FINISHES = ['course', 'chamber', 'plank', 'upright', 'tile', 'plate']
const level = (extra = {}) => ({ ...blankTrial(), id: 'hole-room', width: 3000, height: 1400, floor: 1400, ...extra })
const wall = (finish = 'course', id = 'hole-room') => ({ width: 3000, height: 1400, finish, id })
const art = (missing, finish = 'course', stains, id) => missingPanelArt(wall(finish, id), missing, wallWear({ id: id ?? 'hole-room', ...(stains ? { stains } : {}) }), false)
const VOID = '#3a403c', STRUT = '#4c534e', PIPE = '#474f4a', SHADE = '#2b302d'
const area = rects => rects.reduce((sum, r) => sum + r.w * r.h, 0)
/** The void as drawn: its rectangles. */
const voidOf = pieces => pieces.filter(p => p[0] === VOID).map(([, x, y, w, h]) => ({ x, y, w, h }))

test('missing panels round trip, saving their defaults by leaving them out, and reject what they cannot draw', () => {
  const file = level({ missingPanels: [{ x: 500, y: 400 }, { name: 'Pump access', x: 1300, y: 400, damage: 'broken', contents: 'pipes', leak: true },
    { x: 900, y: 900, damage: 'removed', contents: 'services', leak: false }] })
  const parsed = parseLevel(file)
  assert.deepEqual(parsed.missingPanels, [{ x: 500, y: 400 }, { name: 'Pump access', x: 1300, y: 400, damage: 'broken', contents: 'pipes', leak: true }, { x: 900, y: 900 }])
  assert.deepEqual(parseLevel(JSON.parse(JSON.stringify(parsed))).missingPanels, parsed.missingPanels, 'round trip')
  for (const bad of [{ x: 10, y: 10, damage: 'shattered' }, { x: 10, y: 10, contents: 'gas' }, { x: 10, y: 10, leak: 'yes' }, { y: 10 }])
    assert.throws(() => parseLevel(level({ missingPanels: [bad] })), JSON.stringify(bad))
  assert.throws(() => parseLevel(level({ missingPanels: Array.from({ length: MAX_MISSING_PANELS + 1 }, (_, i) => ({ x: 100 + i * 100, y: 400 })) })))
})

test('a missing panel must be on a panelled wall, on a panel of its own, and leave the wall\'s displays something to hang on', () => {
  const problems = extra => levelProblems(parseLevel(level(extra))).filter(p => /Missing panel|panelled|same panel| off “/.test(p))
  assert.deepEqual(problems({ missingPanels: [{ x: 500, y: 400 }, { x: 1300, y: 400 }] }), [])
  const p = panelAt('course', 500, 400)
  assert.deepEqual(problems({ missingPanels: [{ x: 500, y: 400 }, { x: p.x + 5, y: p.y + 5 }] }), ['“Missing panel 2” is the same panel as “Missing panel 1”.'])
  assert.deepEqual(problems({ missingPanels: [{ x: 500, y: 400 }], timers: [{ x: p.x + 20, y: p.y + 20 }] }), ['Move “Wall timer 1” off “Missing panel 1”.'])
  assert.deepEqual(problems({ missingPanels: [{ name: 'Fuse box', x: 500, y: 400 }], wallLights: [{ id: 'lamp', x: p.x + 40, y: p.y + 40 }] }), ['Move “Wall light 1” off “Fuse box”.'])
  // Against the sky, only a facility wall has panels: not a cave wall, and not the open sky.
  const environment = { kind: 'landscape', horizon: 500, walls: [{ x: 0, y: 0, w: 1200, h: 1400, kind: 'facility' }, { x: 1800, y: 0, w: 600, h: 1400, kind: 'cave' }] }
  assert.deepEqual(problems({ version: 2, environment, lighting: { ambient: 0, lights: [] }, missingPanels: [{ x: 500, y: 400 }, { x: 2000, y: 400 }, { x: 1500, y: 400 }] }),
    ['Put “Missing panel 2” on a panelled back wall.', 'Put “Missing panel 3” on a panelled back wall.'])
})

test('a removed panel opens its whole panel; a broken one about two thirds of it, keeping shards along its sides', () => {
  for (const finish of FINISHES) for (const [x, y] of [[600, 400], [1500, 700], [2200, 1000]]) {
    const panel = panelAt(finish, x, y)
    assert.deepEqual(holeOf(wall(finish), { x, y }).strips, [{ x: panel.x, y: panel.y, w: panel.w, h: panel.h }], `${finish}: removed opens the panel`)
    const broken = holeOf(wall(finish), { x, y, damage: 'broken' }).strips, share = area(broken) / (panel.w * panel.h)
    assert.ok(share > .5 && share < .8, `${finish}: a broken panel loses about two thirds (${share.toFixed(2)})`)
    for (const s of broken) assert.ok(s.x >= panel.x - 1e-9 && s.x + s.w <= panel.x + panel.w + 1e-9 && s.y >= panel.y - 1e-9 && s.y + s.h <= panel.y + panel.h + 1e-9)
    assert.deepEqual(holeOf(wall(finish), { x, y, damage: 'broken' }).strips, broken, 'the same on every visit')
  }
  // A hole crossing the level's edge is cut to it.
  const edge = holeOf({ ...wall(), width: 1000 }, { x: 990, y: 400 }).strips
  assert.ok(edge.every(s => s.x + s.w <= 1000 + 1e-9) && edge.length === 1)
})

test('a hole is drawn in rectangles inside its panel, the void filled, with the stain it leaves below', () => {
  for (const finish of FINISHES) for (const damage of [undefined, 'broken']) {
    const missing = { x: 900, y: 600, ...(damage ? { damage } : {}) }, panel = panelAt(finish, 900, 600), pieces = art(missing, finish)
    // Every strip of the hole is filled; strips reach a unit into the next, so the wall never shows at a seam.
    const voids = voidOf(pieces), strips = holeOf(wall(finish), missing).strips
    assert.ok(strips.every(s => voids.some(v => v.x <= s.x + 1e-9 && v.x + v.w >= s.x + s.w - 1e-9 && v.y <= s.y + 1e-9 && v.y + v.h >= s.y + s.h - 1e-9)), `${finish} ${damage ?? 'removed'}: the void fills the hole`)
    assert.ok(area(voids) <= area(strips) + panel.w * strips.length + 1e-6, `${finish}: and not much past it`)
    const below = pieces.filter(p => p[2] >= panel.y + panel.h)
    assert.ok(below.length > 0 && below.every(p => /^rgba\(/.test(p[0])), `${finish}: a stain runs from the hole's bottom joint`)
    // Apart from the stain and the bolt holes beside the joints, everything stays inside the panel.
    for (const [colour, x, y, w, h] of pieces) if (!/^rgba\(/.test(colour) && colour !== '#2f3431')
      assert.ok(x >= panel.x - 1e-6 && x + w <= panel.x + panel.w + 1e-6 && y >= panel.y - .5 && y + h <= panel.y + panel.h + .5, `${finish}: ${colour} at ${x},${y} inside the panel`)
  }
  // A leak runs the full height of the panel below, wider, with a core.
  const plain = art({ x: 900, y: 600 }), leak = art({ x: 900, y: 600, leak: true }), panel = panelAt('course', 900, 600)
  const reach = pieces => Math.max(...pieces.filter(p => /^rgba\(74,78,62/.test(p[0])).map(p => p[2] + p[4]))
  assert.ok(reach(leak) >= panel.y + panel.h * 2 - 2 && reach(plain) < panel.y + panel.h * 1.7, `a leak runs on down the wall (${reach(leak)} against ${reach(plain)})`)
  // A hole is drawn with fillRect alone: no paths, strokes or clips.
  const calls = []
  const ctx = new Proxy({ canvas: null }, { get: (t, k) => k in t ? t[k] : (...a) => calls.push(k), set: (t, k, v) => { t[k] = v; return true } })
  const { drawMissingPanels } = await_import
  drawMissingPanels(ctx, parseLevel(level({ missingPanels: [{ x: 900, y: 600, damage: 'broken', leak: true }] })), 1400, false)
  assert.ok(calls.length > 20 && calls.every(c => c === 'fillRect'), `only fillRect (${[...new Set(calls)]})`)
})
const await_import = await import('../src/games/jumping/wallMissingPanels.ts')

test('the void is one world-wide layout: neighbouring holes show the same services running through', () => {
  // The services behind any stretch of wall are the part of one layout that falls there, so two holes side by
  // side see one pipe or tray run straight through. (A hole the layout leaves empty gets a line of its own.)
  const salt = levelSalt('joined'), key = s => JSON.stringify(s)
  let joined = 0
  for (let row = 0; row < 4; row++) for (let col = 0; col < 6; col++) {
    const a = panelAt('course', 200 + col * 360, 200 + row * 240), b = panelAt('course', a.x + a.w + 5, a.y + 5)
    const both = new Set(voidLayout({ x: a.x, y: a.y, w: a.w + b.w, h: a.h }, 'services', salt).map(key))
    for (const service of voidLayout(a, 'services', salt)) if (service.kind !== 'strut' && service.kind !== 'box' && !service.upright && service.x1 > b.x) {
      assert.ok(both.has(key(service)) && voidLayout(b, 'services', salt).some(s => key(s) === key(service)), `${service.kind} at ${service.y} runs on into the next hole`)
      joined++
    }
    // And as drawn: a pipe reaching the joint from one hole continues from it in the next, unless it was promoted.
    const pa = art({ x: a.x + 5, y: a.y + 5 }, 'course', undefined, 'joined'), pb = art({ x: b.x + 5, y: b.y + 5 }, 'course', undefined, 'joined')
    const world = voidLayout(a, 'services', salt).filter(s => s.kind === 'pipe' && !s.upright && s.x1 > b.x && s.y > a.y + 8 && s.y < a.y + a.h - 8)
    for (const service of world) assert.ok(pa.some(q => q[0] === PIPE && Math.abs(q[2] - (service.y - service.size / 2)) < 1e-6)
      && pb.some(q => q[0] === PIPE && Math.abs(q[1] - b.x) < 1e-6 && Math.abs(q[2] - (service.y - service.size / 2)) < 1e-6), `the pipe at ${service.y} is drawn in both`)
  }
  assert.ok(joined > 5, `some services cross from one hole into the next (${joined})`)
})

test('every hole shows a service, except an empty one, and its contents choose which', () => {
  const services = pieces => pieces.filter(p => ![VOID, STRUT, SHADE, '#646c66', '#2b302d', '#8d948e', '#2f3431'].includes(p[0]) && !/^rgba\(/.test(p[0]))
  for (let i = 0; i < 60; i++) {
    const x = 150 + (i * 233) % 2700, y = 150 + (i * 151) % 1100
    for (const contents of [undefined, 'pipes', 'electrical']) assert.ok(services(art({ x, y, ...(contents ? { contents } : {}) }, 'tile', undefined, `r${i}`)).length > 0, `${contents ?? 'services'} at ${x},${y}`)
    assert.equal(services(art({ x, y, contents: 'empty' }, 'tile', undefined, `r${i}`)).length, 0, 'empty shows only its strut')
    assert.ok(!art({ x, y, contents: 'electrical' }, 'tile', undefined, `r${i}`).some(p => p[0] === PIPE), 'wiring holds no pipes')
    assert.ok(!art({ x, y, contents: 'pipes' }, 'tile', undefined, `r${i}`).some(p => ['#5a615c', '#6a716c', '#5c645e'].includes(p[0])), 'pipes hold no trays, conduit or boxes')
  }
})

test('wall text is paint, clipped out of the holes; the wall\'s hardware is drawn over them', () => {
  const calls = []
  const ctx = new Proxy({ canvas: { width: 3000, height: 1400 }, getTransform: () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }) },
    { get: (t, k) => k in t ? t[k] : (...a) => calls.push([k, ...a]), set: (t, k, v) => { t[k] = v; return true } })
  const file = parseLevel(level({ missingPanels: [{ x: 900, y: 600 }], texts: [{ x: 700, y: 500, w: 400, h: 50, text: 'KEEP CLEAR', fontSize: 24, align: 'left' }],
    pipes: [{ points: [[100, 610], [2900, 610]] }] }))
  drawLevelBackdrop(ctx, file, { x: 0, y: 0, w: 3000, h: 1400 }, 1, true)
  const hole = missingPanelHoles(file, 1400)[0], clip = calls.findIndex(c => c[0] === 'clip' && c[1] === 'evenodd')
  assert.ok(clip > 0 && calls.slice(0, clip).some(c => c[0] === 'rect' && c[1] === hole.x && c[2] === hole.y && c[3] === hole.w), 'the text is clipped to the wall outside the hole')
  const firstVoid = calls.findIndex(c => c[0] === 'fillRect' && c[1] === hole.x && c[3] === hole.w), pipe = calls.findIndex((c, i) => i > firstVoid && c[0] === 'stroke')
  assert.ok(firstVoid > 0 && pipe > firstVoid, 'the wall pipe is drawn after, and so over, the hole')
})

test('the panel grid sizes the holes: a double is removed whole', () => {
  // Some points on chamber and plank land on doubles; their holes take both halves.
  for (const finish of ['chamber', 'plank']) {
    const grid = panelGrid(finish)
    let doubles = 0
    for (let x = 100; x < 2900; x += 37) for (let y = 100; y < 1300; y += 53) if (panelAt(finish, x, y).w === grid.w * 2) doubles++
    assert.ok(doubles > 0)
  }
})
