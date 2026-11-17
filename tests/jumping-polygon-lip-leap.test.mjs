import test from 'node:test'
import assert from 'node:assert/strict'
import { createRun, stepRun } from './helpers/jumping-active-run.mjs'
import { blankTrial, parseLevel } from '../src/games/jumping/level.ts'
import { NEUTRAL_INPUT } from '../src/games/jumping/model.ts'

// A 380-wide, 244-deep pit between an apron and a bank. The bank's lip is the same corner in
// every encoding; only the terrain piece that owns it changes. A full running leap from the
// apron arrives falling fast, so its toes can meet the corner before its hands reach the lip.
const W = 1634, H = 834, TOP = 590, LIP = 800
const banks = {
  'a rectangle beside a separate ramp piece': [{ x: LIP, y: TOP, w: 120, h: 244 },
    { x: 920, y: TOP, w: 714, h: 244, polygon: [[0, 0], [40, 0], [64, 24], [714, 24], [714, 244], [0, 244]] }],
  'one polygon with a ramp further along its top': [{ x: LIP, y: TOP, w: 834, h: 244, polygon: [[0, 0], [160, 0], [184, 24], [834, 24], [834, 244], [0, 244]] }],
  'a ramp that descends from the lip': [{ x: LIP, y: TOP, w: 834, h: 244, polygon: [[0, 0], [24, 24], [834, 24], [834, 244], [0, 244]] }],
  'a ramp that climbs from the lip': [{ x: LIP, y: TOP - 24, w: 834, h: 268, polygon: [[0, 24], [24, 0], [834, 0], [834, 268], [0, 268]] }],
}
function pit(bank, mirrored) {
  const level = blankTrial(); Object.assign(level, { width: W, height: H, floor: H })
  level.platforms = [{ x: 0, y: TOP, w: 420, h: 244 }, ...banks[bank]].map(b => !mirrored ? b
    : { ...b, x: W - b.x - b.w, ...(b.polygon ? { polygon: b.polygon.map(([x, y]) => [b.w - x, y]) } : {}) })
  level.entrance = { x: mirrored ? W - 120 : 120, y: TOP }
  return parseLevel(JSON.parse(JSON.stringify(level)))
}
/** Run to the takeoff, hold a full jump with Up and the direction held, and report how the leap ends. */
function leap(level, mirrored, takeoff) {
  const run = createRun(level), p = run.player, toward = mirrored ? -1 : 1; run.started = true
  const along = () => mirrored ? W - p.x : p.x
  for (let f = 0; f < 30; f++) stepRun(run, NEUTRAL_INPUT)
  for (let f = 0; f < 400 && along() < takeoff; f++) stepRun(run, { ...NEUTRAL_INPUT, move: toward })
  for (let f = 0; f < 24; f++) stepRun(run, { ...NEUTRAL_INPUT, move: toward, jump: true, climb: true })
  let caught = false, thrownBack = false
  for (let f = 0; f < 400 && !p.grounded; f++) {
    stepRun(run, { ...NEUTRAL_INPUT, move: toward, climb: true })
    caught ||= !!(p.hang || p.mantle)
    thrownBack ||= !p.grounded && !caught && p.vx * toward < -20
  }
  return { result: p.y > TOP + 100 ? 'falls' : caught ? 'catches' : 'lands', thrownBack, x: along(), y: p.y }
}

for (const mirrored of [false, true]) {
  // Takeoffs from the first one that reaches a rectangular lip to the last footing on the apron.
  const takeoffs = []
  for (let x = 286; x <= 420; x += 2) takeoffs.push(x)
  const plain = pit('a rectangle beside a separate ramp piece', mirrored)
  const expected = takeoffs.map(x => leap(plain, mirrored, x))

  test(`a full running leap reaches a rectangular lip from every takeoff in the band (${mirrored ? 'leftward' : 'rightward'})`, () => {
    for (const [i, outcome] of expected.entries()) assert.notEqual(outcome.result, 'falls', `takeoff ${takeoffs[i]}`)
    assert.ok(expected.some(o => o.result === 'catches') && expected.some(o => o.result === 'lands'), 'the band spans catches and clean landings')
  })

  for (const bank of Object.keys(banks).slice(1)) {
    test(`the same leap is not thrown back when the lip is ${bank} (${mirrored ? 'leftward' : 'rightward'})`, () => {
      const level = pit(bank, mirrored)
      for (const takeoff of takeoffs) {
        const outcome = leap(level, mirrored, takeoff)
        assert.ok(!outcome.thrownBack, `takeoff ${takeoff}: the corner does not send the body back out`)
        assert.notEqual(outcome.result, 'falls', `takeoff ${takeoff}: ends at ${outcome.x.toFixed(0)}, ${outcome.y.toFixed(0)}`)
      }
    })
  }
}

// The same bank drawn twice: once as a rectangle, once as a polygon with the rectangle's
// outline. Whatever the player does at its lip, both must give the same motion on every
// frame: the same stop at the wall, the same landing, the same fall and the same catch.
const twins = {
  rectangle: { x: LIP, y: TOP, w: 834, h: 244 },
  polygon: { x: LIP, y: TOP, w: 834, h: 244, polygon: [[0, 0], [834, 0], [834, 244], [0, 244]] },
}
function twinPit(twin, mirrored, gap, start) {
  const level = blankTrial(); Object.assign(level, { width: W, height: H, floor: H })
  level.platforms = [{ x: 0, y: TOP, w: LIP - gap, h: 244 }, twins[twin]].map(b => !mirrored ? b
    : { ...b, x: W - b.x - b.w, ...(b.polygon ? { polygon: b.polygon.map(([x, y]) => [b.w - x, y]) } : {}) })
  level.entrance = { x: mirrored ? W - start : start, y: TOP }
  return parseLevel(JSON.parse(JSON.stringify(level)))
}
function motion(twin, mirrored, gap, start, script) {
  const run = createRun(twinPit(twin, mirrored, gap, start)), p = run.player, toward = mirrored ? -1 : 1; run.started = true
  const along = () => mirrored ? W - p.x : p.x, frames = []
  const step = (input, count, until) => {
    for (let f = 0; f < count && !until?.(along()); f++) {
      stepRun(run, { ...NEUTRAL_INPUT, ...input, move: (input.move ?? 0) * toward })
      frames.push([along(), p.y, p.vx * toward, p.vy, p.hang ? 1 : p.mantle ? 2 : p.grounded ? 3 : 0])
    }
  }
  step({}, 30); script(step)
  return frames
}
function sameMotion(label, mirrored, gap, start, script) {
  const [a, b] = ['rectangle', 'polygon'].map(twin => motion(twin, mirrored, gap, start, script))
  assert.equal(a.length, b.length, label)
  for (const [f, frame] of a.entries()) for (const [k, value] of frame.entries())
    assert.ok(Math.abs(value - b[f][k]) < 1e-6, `${label}, frame ${f}: rectangle ${frame.map(v => v.toFixed(2))}, polygon ${b[f].map(v => v.toFixed(2))}`)
}
const flights = {
  'holding toward the lip with Up': { move: 1, climb: true },
  'holding toward the lip': { move: 1 },
  'holding nothing': {},
  'holding away': { move: -1 },
  'holding toward the lip with Down': { move: 1, drop: true },
  'crouching': { move: 1, crouch: true },
}
for (const mirrored of [false, true]) for (const [flight, input] of Object.entries(flights)) {
  test(`a polygon lip and a rectangular lip answer a leap alike, ${flight} (${mirrored ? 'leftward' : 'rightward'})`, () => {
    // A full leap over a wide pit arrives falling fast; a hop over a narrow one arrives slowly.
    for (const [gap, hold] of [[380, 24], [200, 2]]) for (let takeoff = LIP - gap - 100; takeoff <= LIP - gap + 2; takeoff += 3)
      sameMotion(`gap ${gap}, takeoff ${takeoff}`, mirrored, gap, LIP - gap - 300, step => {
        step({ move: 1 }, 400, x => x >= takeoff)
        step({ move: 1, jump: true }, hold); step(input, 200)
      })
  })
}
for (const mirrored of [false, true]) {
  test(`a polygon lip and a rectangular lip answer stepping off and steering back alike (${mirrored ? 'leftward' : 'rightward'})`, () => {
    for (const hop of [0, 6]) for (let away = 1; away <= 40; away += 3)
      sameMotion(`${away} frames out${hop ? ' with a hop' : ''}`, mirrored, 380, LIP + 60, step => {
        step({ move: -1 }, 200, x => x <= LIP + 2)
        step({ move: -1, jump: true }, hop); step({ move: -1 }, away - Math.min(hop, away)); step({ move: 1 }, 160)
      })
  })
}

// Ground is often built from pieces that meet flush. The far piece's corner is buried in
// its neighbour there: a hop that lands just short of the seam must keep its run, whichever
// piece the level lists first and however the far piece is drawn.
for (const [far, shape] of Object.entries(twins)) for (const farFirst of [false, true]) {
  test(`a hop that lands just short of a flush seam keeps its run (far piece a ${far}, listed ${farFirst ? 'first' : 'second'})`, () => {
    for (const hold of [2, 8]) for (let takeoff = 500; takeoff < 760; takeoff += 3) {
      const level = blankTrial(); Object.assign(level, { width: W, height: H, floor: H })
      const near = { x: 0, y: TOP, w: LIP, h: 244 }
      level.platforms = farFirst ? [shape, near] : [near, shape]
      level.entrance = { x: 200, y: TOP }
      const run = createRun(parseLevel(JSON.parse(JSON.stringify(level)))), p = run.player; run.started = true
      for (let f = 0; f < 30; f++) stepRun(run, NEUTRAL_INPUT)
      for (let f = 0; f < 400 && p.x < takeoff; f++) stepRun(run, { ...NEUTRAL_INPUT, move: 1 })
      for (let f = 0; f < hold; f++) stepRun(run, { ...NEUTRAL_INPUT, move: 1, jump: true })
      let slowest = Infinity
      for (let f = 0; f < 120; f++) { stepRun(run, { ...NEUTRAL_INPUT, move: 1 }); slowest = Math.min(slowest, p.vx) }
      assert.ok(slowest > 300, `takeoff ${takeoff}, jump held ${hold} frames: the run dropped to ${slowest.toFixed(0)}`)
      assert.ok(p.grounded && Math.abs(p.y - TOP) < .01, `takeoff ${takeoff}: the player runs on across the seam`)
    }
  })
}
