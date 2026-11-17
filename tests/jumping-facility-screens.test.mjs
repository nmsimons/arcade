import test from 'node:test'
import assert from 'node:assert/strict'
import { BOARD_FRAME, PLACARD_FRAME, boardLayout, boardRows, drawEvaluationBoard, drawPlacard, placardLamp, screenOf } from '../src/games/jumping/facilityScreens.ts'
import { DIGITAL_GREEN } from '../src/games/jumping/digitalDisplay.ts'
import { wallWear } from '../src/games/jumping/wallWear.ts'

// The facility's screens (facilityScreens.ts): the evaluation board, a cabinet with a screen of rows and a lamp per
// wing, and level doors' placards, small cabinets with one lamp. Both age with their room.
const LINES = ['EVALUATION 14 / 33', 'BOOT CAMP 8/8', 'FREIGHT 5/6', 'CONSTRUCTION 1/4', 'GRAVITY SEALED', 'SECURITY SEALED', 'PUZZLES SEALED', 'ASSESSMENT SEALED']
const BOARD = { id: 'evaluation', x: 770, y: 950, w: 460, h: 250 }
const RUST = ['rgba(104,66,36,.3)', '#6d5039', '#6c6150']

function recorder() {
  const calls = []
  let exposure = null
  const ctx = { fillStyle: '', strokeStyle: '', font: '', textAlign: 'left', textBaseline: 'alphabetic', shadowColor: '', shadowBlur: 0,
    getTransform: () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }) }
  for (const name of ['save', 'restore', 'beginPath', 'moveTo', 'lineTo', 'closePath', 'rect', 'clip', 'translate', 'scale', 'roundRect'])
    ctx[name] = (...args) => calls.push([name, exposure, ...args])
  ctx.fillRect = (x, y, w, h) => calls.push(['fillRect', exposure, ctx.fillStyle, { x, y, w, h }])
  ctx.arc = (x, y, r) => calls.push(['arc', exposure, ctx.fillStyle, { x, y, r }])
  ctx.fill = () => calls.push(['fill', exposure, ctx.fillStyle])
  ctx.fillText = (text, x, y) => calls.push(['fillText', exposure, ctx.fillStyle, text, x, y])
  const paint = (_ctx, level, draw) => { const before = exposure; exposure = level; draw(); exposure = before }
  return { ctx, calls, paint }
}
const draw = (lines = LINES, level = { id: 'Concourse' }, board = BOARD) => {
  const r = recorder(); drawEvaluationBoard(r.ctx, board, lines, wallWear(level), r.paint); return r.calls
}
const colours = calls => new Set(calls.filter(c => c[0] === 'fillRect' || c[0] === 'fill').map(c => c[2]))

test('the board reads the facility\'s lines as a heading, a row per wing with its lamp, and notes', () => {
  assert.deepEqual(boardRows(LINES).slice(0, 5), [
    { kind: 'heading', label: 'EVALUATION', value: '14 / 33' },
    { kind: 'wing', name: 'BOOT CAMP', status: '8/8', lamp: 'complete' },
    { kind: 'wing', name: 'FREIGHT', status: '5/6', lamp: 'open' },
    { kind: 'wing', name: 'CONSTRUCTION', status: '1/4', lamp: 'open' },
    { kind: 'wing', name: 'GRAVITY', status: 'SEALED', lamp: 'sealed' },
  ])
  assert.deepEqual(boardRows(['EVALUATION COMPLETE', 'UNIT RELEASED FOR DISPATCH', 'MOVEMENT WING 2/2']), [
    { kind: 'heading', label: 'EVALUATION', value: 'COMPLETE' },
    { kind: 'note', text: 'UNIT RELEASED FOR DISPATCH' },
    { kind: 'wing', name: 'MOVEMENT WING', status: '2/2', lamp: 'complete' },
  ])
  // The studio shows the board's name alone.
  assert.deepEqual(boardRows(['Evaluation board']), [{ kind: 'note', text: 'Evaluation board' }])
})

test('every row fits on the glass, shrinking to fit a small board, and the lamps sit in the frame beside them', () => {
  for (const board of [BOARD, { ...BOARD, w: 300, h: 150 }]) {
    const rows = boardRows(['EVALUATION COMPLETE', 'UNIT RELEASED FOR DISPATCH', ...LINES.slice(1)]), layout = boardLayout(board, rows), glass = screenOf(board)
    for (const { y } of layout.rows) assert.ok(y >= glass.y && y + layout.size * 1.3 <= glass.y + glass.h + 1e-9, `row at ${y} on ${board.w}x${board.h}`)
    assert.ok(layout.size <= 14)
    assert.ok(glass.x >= BOARD_FRAME.lamps, 'the lamp column is clear of the glass')
  }
  assert.ok(boardLayout({ ...BOARD, h: 150 }, boardRows(LINES)).size < boardLayout(BOARD, boardRows(LINES)).size)
})

test('the screen and lit lamps are emissive; the cabinet and the wall under it take the room\'s light', () => {
  const calls = draw(), lit = calls.filter(c => c[1] === .65)
  assert.deepEqual(lit.filter(c => c[0] === 'fillText').map(c => c[3]),
    ['EVALUATION', '14 / 33', ...LINES.slice(1).flatMap(line => { const at = line.lastIndexOf(' '); return [line.slice(0, at), line.slice(at + 1)] })])
  // Boot Camp is complete, Freight and Construction open; sealed wings have no lit lamp.
  const lamps = lit.filter(c => c[0] === 'arc').map(c => c[2])
  assert.deepEqual(lamps, [DIGITAL_GREEN, '#e3ad48', '#e3ad48'])
  assert.equal(calls.filter(c => c[0] === 'fillText' && c[1] !== .65).length, 0, 'no lettering outside the emissive layer')
  // A board with nothing to show is dark glass.
  assert.equal(draw([]).filter(c => c[1] === .65).length, 0)
})

test('a board ages the same on every visit, differently in each room, and as much as its room is stained', () => {
  assert.deepEqual(draw(), draw())
  assert.notDeepEqual(draw(LINES, { id: 'Concourse' }), draw(LINES, { id: 'Boot Camp wing' }))
  const clean = colours(draw(LINES, { id: 'Concourse', stains: 'none' })), heavy = colours(draw(LINES, { id: 'Concourse' }))
  for (const rust of RUST) assert.ok(!clean.has(rust), `no ${rust} in a spotless room`)
  assert.ok(RUST.some(rust => heavy.has(rust)), 'a stained room rusts its board')
  const marks = level => draw(LINES, level).filter(c => c[0] === 'fillRect' && c[1] === 0).length
  assert.ok(marks({ id: 'Concourse', stains: 'none' }) < marks({ id: 'Concourse', stains: 'light' }))
  assert.ok(marks({ id: 'Concourse', stains: 'light' }) < marks({ id: 'Concourse' }))
})

test('rust and run-off from the board stop at water below it', () => {
  const bottom = BOARD.y + BOARD.h, water = { x: 0, y: bottom + 6, w: 2000, h: 400, effect: 'water' }
  const below = calls => calls.filter(c => c[0] === 'fillRect' && c[3].y >= bottom - 1)
  assert.ok(below(draw(LINES, { id: 'Concourse' })).some(c => c[3].y + c[3].h > bottom + 6), 'it runs further on a dry wall')
  for (const c of below(draw(LINES, { id: 'Concourse', gravityPlates: [water] }))) assert.ok(c[3].y + c[3].h <= water.y + 1e-9)
})

const PLACARD = { id: 'door', x: 382, y: 840, w: 120, h: 66 }
const placard = (lines, passed, level = { id: 'Boot Camp wing' }) => {
  const r = recorder(); drawPlacard(r.ctx, PLACARD, lines, passed, wallWear(level), r.paint); return r.calls
}

test('a placard shows its course\'s lines on its glass, and its lamp is green once passed, amber while open, dark while the door is', () => {
  const lit = calls => calls.filter(c => c[1] === .65)
  const glass = screenOf(PLACARD, PLACARD_FRAME), lamp = placardLamp(PLACARD)
  const open = lit(placard(['NO RECORD', 'D 0:40'], false))
  assert.deepEqual(open.filter(c => c[0] === 'fillText').map(c => c[3]), ['NO RECORD', 'D 0:40'])
  // Text is drawn at the font's pixel size from the cabinet's corner (here at scale 1), within the glass.
  for (const c of open.filter(c => c[0] === 'fillText')) assert.ok(c[5] > glass.y && c[5] <= glass.y + glass.h, `baseline ${c[5]}`)
  assert.deepEqual(open.filter(c => c[0] === 'arc').map(c => [c[2], c[3].x, c[3].y]), [['#e3ad48', lamp.x, lamp.y]])
  assert.deepEqual(lit(placard(['BEST 0:31.20', 'GRADE B'], true)).filter(c => c[0] === 'arc').map(c => c[2]), [DIGITAL_GREEN])
  assert.equal(lit(placard([], false)).length, 0, 'a dark door\'s placard is dark glass and an unlit lamp')
  assert.ok(lamp.y + lamp.r < PLACARD_FRAME.top, 'the lamp sits in the top rail')
})

test('a placard ages with its room as the board does', () => {
  assert.deepEqual(placard([], false), placard([], false))
  const clean = colours(placard([], false, { id: 'Boot Camp wing', stains: 'none' }))
  for (const rust of RUST) assert.ok(!clean.has(rust), `no ${rust} in a spotless room`)
  const rusty = ['a', 'b', 'c', 'd', 'e', 'f'].some(id => RUST.some(rust => colours(placard([], false, { id })).has(rust)))
  assert.ok(rusty, 'a stained room rusts its placards')
})
