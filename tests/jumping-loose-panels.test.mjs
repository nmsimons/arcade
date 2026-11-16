import test from 'node:test'
import assert from 'node:assert/strict'
import { blankTrial, levelProblems, parseLevel } from '../src/games/jumping/level.ts'
import { drawLevelBackdrop } from '../src/games/jumping/render.ts'
import { panelAt, panelGrid } from '../src/games/jumping/wallFinish.ts'
import { levelSalt, wallWear } from '../src/games/jumping/wallWear.ts'
import { MAX_LOOSE_PANELS, drawLoosePanels, loosePanelArt, loosePanelRect, voidLayout } from '../src/games/jumping/wallLoosePanels.ts'

// Loose panels (docs/jumping-wall-wear.md): a panel of the back wall hanging from its last bolt, tilted, with a
// wedge of the room's services showing in its frame behind it.
const FINISHES = ['course', 'chamber', 'plank', 'upright', 'tile', 'plate']
const level = (extra = {}) => ({ ...blankTrial(), id: 'loose-room', width: 3000, height: 1400, floor: 1400, ...extra })
const wall = (finish = 'course', id = 'loose-room') => ({ width: 3000, height: 1400, finish, id })
const art = (loose, finish = 'course', id = 'loose-room') => loosePanelArt(wall(finish, id), loose, wallWear({ id }), false)
const VOID = '#c6ccc7', PIPE = '#646d67'
const rects = pieces => pieces.filter(p => p.length === 5)
const polygons = pieces => pieces.filter(p => p.length === 2)

test('loose panels round trip, saving their defaults by leaving them out, and reject what they cannot draw', () => {
  const parsed = parseLevel(level({ loosePanels: [{ x: 500, y: 400 }, { name: 'Pump access', x: 1300, y: 400, hang: 'right', contents: 'pipes', leak: true },
    { x: 900, y: 900, contents: 'services', leak: false }] }))
  assert.deepEqual(parsed.loosePanels, [{ x: 500, y: 400 }, { name: 'Pump access', x: 1300, y: 400, hang: 'right', contents: 'pipes', leak: true }, { x: 900, y: 900 }])
  assert.deepEqual(parseLevel(JSON.parse(JSON.stringify(parsed))).loosePanels, parsed.loosePanels, 'round trip')
  for (const bad of [{ x: 10, y: 10, hang: 'down' }, { x: 10, y: 10, contents: 'gas' }, { x: 10, y: 10, leak: 'yes' }, { y: 10 }])
    assert.throws(() => parseLevel(level({ loosePanels: [bad] })), JSON.stringify(bad))
  assert.throws(() => parseLevel(level({ loosePanels: Array.from({ length: MAX_LOOSE_PANELS + 1 }, (_, i) => ({ x: 100 + i * 100, y: 400 })) })))
})

test('a loose panel must be on a panelled wall, on a panel of its own, and leave the wall\'s displays something to hang on', () => {
  const problems = extra => levelProblems(parseLevel(level(extra))).filter(p => /Loose panel|panelled|same panel| off “/.test(p))
  assert.deepEqual(problems({ loosePanels: [{ x: 500, y: 400 }, { x: 1300, y: 400 }] }), [])
  const p = loosePanelRect('course', { x: 500, y: 400 })
  assert.deepEqual(problems({ loosePanels: [{ x: 500, y: 400 }, { x: p.x + 5, y: p.y + 5 }] }), ['“Loose panel 2” is the same panel as “Loose panel 1”.'])
  assert.deepEqual(problems({ loosePanels: [{ x: 500, y: 400 }], timers: [{ x: p.x + 20, y: p.y + 20 }] }), ['Move “Wall timer 1” off “Loose panel 1”.'])
  assert.deepEqual(problems({ loosePanels: [{ name: 'Fuse box', x: 500, y: 400 }], wallLights: [{ id: 'lamp', x: p.x + 40, y: p.y + 40 }] }), ['Move “Wall light 1” off “Fuse box · Loose panel 1”.'])
  const environment = { kind: 'landscape', horizon: 500, walls: [{ x: 0, y: 0, w: 1200, h: 1400, kind: 'facility' }, { x: 1800, y: 0, w: 600, h: 1400, kind: 'cave' }] }
  assert.deepEqual(problems({ version: 2, environment, lighting: { ambient: 0, lights: [] }, loosePanels: [{ x: 500, y: 400 }, { x: 2000, y: 400 }, { x: 1500, y: 400 }] }),
    ['Put “Loose panel 2” on a panelled back wall.', 'Put “Loose panel 3” on a panelled back wall.'])
})

test('a loose panel is its whole panel, doubles whole, hanging from one top bolt and tilted a few degrees', () => {
  for (const finish of FINISHES) for (const [x, y] of [[600, 400], [1500, 700], [2200, 1000]]) {
    const panel = loosePanelRect(finish, { x, y })
    assert.deepEqual(panel, panelAt(finish, x, y), `${finish}: the panel under the point`)
    for (const hang of ['left', 'right']) {
      const pieces = art({ x, y, hang }, finish), voids = rects(pieces).filter(p => p[0] === VOID)
      assert.deepEqual(voids.map(([, ...r]) => r), [[panel.x, panel.y, panel.w, panel.h]], `${finish}: the frame behind it shows the void`)
      // The face is the panel turned about its bolt: its pivot corner stays, the other top corner drops.
      const face = polygons(pieces).find(p => /^#f1f1ed$/.test(p[0]))[1], [tl, tr] = face
      const pivot = hang === 'left' ? [panel.x + 10.5, panel.y + 10.5] : [panel.x + panel.w - 10.5, panel.y + 10.5]
      const angle = Math.atan2(tr[1] - tl[1], tr[0] - tl[0]) * 180 / Math.PI
      assert.ok(Math.abs(angle) >= 4 - 1e-6 && Math.abs(angle) <= 8 + 1e-6 && Math.sign(angle) === (hang === 'left' ? 1 : -1), `${finish} ${hang}: tilted ${angle.toFixed(1)} degrees, the free side down`)
      const original = hang === 'left' ? [panel.x, panel.y] : [panel.x + panel.w, panel.y], moved = hang === 'left' ? tl : tr
      assert.ok(Math.hypot(moved[0] - pivot[0], moved[1] - pivot[1]) - Math.hypot(original[0] - pivot[0], original[1] - pivot[1]) < 1e-6, `${finish} ${hang}: turned about its bolt`)
    }
    assert.deepEqual(art({ x, y }, finish), art({ x, y }, finish), `${finish}: the same on every visit`)
  }
  // A double hangs as one piece.
  for (const finish of ['chamber', 'plank']) {
    let doubles = 0
    for (let x = 100; x < 2900; x += 37) for (let y = 100; y < 1300; y += 53) if (loosePanelRect(finish, { x, y }).w === panelGrid(finish).w * 2) doubles++
    assert.ok(doubles > 0)
  }
})

test('the void behind is one world-wide layout: side by side, loose panels show the same services running through', () => {
  const salt = levelSalt('joined'), key = s => JSON.stringify(s)
  let joined = 0
  for (let row = 0; row < 4; row++) for (let col = 0; col < 6; col++) {
    const a = loosePanelRect('course', { x: 200 + col * 360, y: 200 + row * 240 }), b = loosePanelRect('course', { x: a.x + a.w + 5, y: a.y + 5 })
    for (const service of voidLayout(a, 'services', salt)) if (service.kind !== 'strut' && service.kind !== 'box' && !service.upright && service.x1 > b.x) {
      assert.ok(voidLayout(b, 'services', salt).some(s => key(s) === key(service)), `${service.kind} at ${service.y} runs on behind the next panel`)
      joined++
    }
  }
  assert.ok(joined > 5, `some services run behind neighbouring panels (${joined})`)
})

test('every loose panel shows a service behind it, except an empty one, and its contents choose which', () => {
  const services = pieces => rects(pieces).filter(p => ![VOID, '#a7aea8', '#d4d9d5', '#737a74', '#3f4541', '#5c645e', '#c4c9c5'].includes(p[0]) && !/^rgba\(/.test(p[0]))
  for (let i = 0; i < 40; i++) {
    const x = 150 + (i * 233) % 2700, y = 150 + (i * 151) % 1100
    for (const contents of [undefined, 'pipes', 'electrical']) assert.ok(services(art({ x, y, ...(contents ? { contents } : {}) }, 'tile', `r${i}`)).length > 0, `${contents ?? 'services'} at ${x},${y}`)
    assert.equal(services(art({ x, y, contents: 'empty' }, 'tile', `r${i}`)).length, 0, 'empty shows only its strut')
    assert.ok(!art({ x, y, contents: 'electrical' }, 'tile', `r${i}`).some(p => p[0] === PIPE), 'wiring holds no pipes')
    assert.ok(!art({ x, y, contents: 'pipes' }, 'tile', `r${i}`).some(p => ['#5f6661', '#8a918b', '#8e958f'].includes(p[0])), 'pipes hold no trays, conduit or boxes')
  }
  // A leak runs on down the wall below the panel, past an ordinary stain.
  const panel = loosePanelRect('course', { x: 900, y: 600 }), reach = pieces => Math.max(...rects(pieces).filter(p => /^rgba\(74,78,62/.test(p[0])).map(p => p[2] + p[4]))
  assert.ok(reach(art({ x: 900, y: 600, leak: true })) > panel.y + panel.h * 1.8 && reach(art({ x: 900, y: 600 })) < panel.y + panel.h * 1.7)
})

test('loose panels draw over the wall\'s paint and under its hardware, with wall text left as it is', () => {
  const calls = []
  const ctx = new Proxy({ canvas: { width: 3000, height: 1400 }, getTransform: () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }) },
    { get: (t, k) => k in t ? t[k] : (...a) => calls.push([k, ...a]), set: (t, k, v) => { t[k] = v; return true } })
  const file = parseLevel(level({ loosePanels: [{ x: 900, y: 600 }], texts: [{ x: 700, y: 500, w: 400, h: 50, text: 'KEEP CLEAR', fontSize: 24, align: 'left' }],
    pipes: [{ points: [[100, 610], [2900, 610]] }] }))
  drawLevelBackdrop(ctx, file, { x: 0, y: 0, w: 3000, h: 1400 }, 1, true)
  const panel = loosePanelRect('course', { x: 900, y: 600 })
  const frame = calls.findIndex(c => c[0] === 'fillRect' && c[1] === panel.x && c[2] === panel.y && c[3] === panel.w)
  const pipe = calls.findIndex((c, i) => i > frame && c[0] === 'stroke')
  assert.ok(frame > 0 && pipe > frame, 'the wall pipe is drawn after, and so over, the loose panel')
  assert.ok(!calls.some(c => c[0] === 'clip' && c[1] === 'evenodd'), 'no paint is clipped')
  // Outside an HTML canvas (a WebGL recording, these tests) the pieces are drawn directly: rectangles and filled polygons.
  const direct = []
  const plain = new Proxy({ canvas: null }, { get: (t, k) => k in t ? t[k] : (...a) => direct.push(k), set: (t, k, v) => { t[k] = v; return true } })
  drawLoosePanels(plain, file, 1400, false)
  assert.ok(direct.includes('fillRect') && direct.includes('fill') && !direct.includes('clip'), [...new Set(direct)].join())
})

test('in the studio a click loosens the panel under it, saved at its centre, and it moves a panel at a time', async () => {
  const { addItem, moveItem, duplicateItem, deleteItem, hitItem, setLoosePanel, allSelections, resizeLevelHeight, itemBounds } = await import('../src/games/jumping/editor.ts')
  const { copySelections, pasteSelections } = await import('../src/games/jumping/editorSelection.ts')
  const { objectLabel } = await import('../src/games/jumping/objectLabels.ts')
  const { placementPreview } = await import('../src/games/jumping/builderPlacement.ts')
  const start = parseLevel(level({ pipes: [{ points: [[100, 600], [2900, 600]] }], stripes: [{ x: 500, y: 300, w: 900, h: 500 }] }))
  const added = addItem(start, 'loose-panel', { x: 900, y: 700 }, { x: 900, y: 700 }), p = loosePanelRect('course', { x: 900, y: 700 })
  assert.deepEqual(added.level.loosePanels, [{ x: p.x + p.w / 2, y: p.y + p.h / 2 }], 'its point is the panel\'s centre')
  assert.deepEqual(added.selection, { kind: 'loose-panel', index: 0 })
  assert.deepEqual(itemBounds(added.level, added.selection), { x: p.x, y: p.y, w: p.w, h: p.h }, 'its outline is its frame')
  assert.equal(objectLabel(added.level, added.selection), 'Loose panel 1')
  assert.deepEqual(placementPreview(start, 'loose-panel', { x: 900, y: 700, free: true }, false, 1)?.level.loosePanels, added.level.loosePanels, 'hovering shows the panel a click loosens')
  assert.deepEqual(hitItem(added.level, 900, 600, 4), { kind: 'pipe', index: 0 }, 'under the pipe')
  assert.deepEqual(hitItem(added.level, 900, 700, 4), { kind: 'loose-panel', index: 0 }, 'over the stripes')
  const small = moveItem(added.level, added.selection, 30, 0), across = moveItem(added.level, added.selection, p.w, 0)
  assert.deepEqual(itemBounds(small, added.selection), itemBounds(added.level, added.selection), 'a short drag keeps its panel')
  assert.equal(itemBounds(across, added.selection).x, p.x + p.w, 'past a joint it moves to the next panel')
  const copy = duplicateItem(added.level, added.selection)
  assert.equal(itemBounds(copy.level, copy.selection).x, p.x + p.w, 'a copy goes on the next panel')
  let edited = setLoosePanel(added.level, 0, { hang: 'right', contents: 'pipes', leak: true })
  assert.deepEqual(edited.loosePanels[0], { ...added.level.loosePanels[0], hang: 'right', contents: 'pipes', leak: true })
  edited = setLoosePanel(edited, 0, { hang: undefined, contents: undefined, leak: undefined })
  assert.deepEqual(edited.loosePanels[0], added.level.loosePanels[0], 'defaults are saved by leaving fields out')
  const pasted = pasteSelections(added.level, copySelections(added.level, [added.selection]), 360, 0)
  assert.equal(pasted.level.loosePanels.length, 2)
  assert.ok(allSelections(added.level).some(s => s.kind === 'loose-panel'))
  assert.equal(deleteItem(added.level, added.selection).loosePanels.length, 0)
  const taller = resizeLevelHeight(added.level, 1640)
  assert.equal(1640 - taller.loosePanels[0].y, 1400 - added.level.loosePanels[0].y, 'a taller room keeps its height above the floor')
})
