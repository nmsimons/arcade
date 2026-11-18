import test from 'node:test'
import assert from 'node:assert/strict'
import { createRun, stepRun } from './helpers/jumping-active-run.mjs'
import { slideLevel } from './helpers/jumping-slide.mjs'
import { blankTrial, parseLevel } from '../src/games/jumping/level.ts'
import { NEUTRAL_INPUT } from '../src/games/jumping/model.ts'
import { bodyIntersects } from '../src/games/jumping/geometry.ts'

// A bank whose top steps down to a lower floor over a ramp. Collision cuts a drawn outline
// into convex pieces, and where it cuts depends on how the outline is drawn. Feet that come
// down the ramp reach its foot exactly where those pieces meet. The ramp and the floor are
// the only surfaces there: a cut between two pieces is not one, so it must never push.
const W = 2400, H = 1200, FLOOR = 900, FOOT = 1100
const drawings = (run, rise) => {
  const top = FLOOR - rise, crest = FOOT - run, bank = (x, lead) => ({ x, y: top, w: W - x, h: H - top,
    polygon: [[0, 0], [lead, 0], [lead + run, rise], [W - x, rise], [W - x, H - top], [0, H - top]] })
  return {
    'one outline with a short flat before the ramp': [bank(crest - 40, 40)],
    'one outline with a long flat before the ramp': [bank(crest - 600, 600)],
    'a rectangle beside the ramp piece': [{ x: crest - 600, y: top, w: 560, h: H - top }, bank(crest - 40, 40)],
  }
}
function level(pieces, mirrored) {
  const L = blankTrial(); Object.assign(L, { width: W, height: H, floor: H })
  L.platforms = [{ x: 0, y: 200, w: 120, h: 40 }, ...pieces].map(b => !mirrored ? b
    : { ...b, x: W - b.x - b.w, ...(b.polygon ? { polygon: b.polygon.map(([x, y]) => [b.w - x, y]) } : {}) })
  L.entrance = { x: mirrored ? W - 60 : 60, y: 200 }
  return parseLevel(JSON.parse(JSON.stringify(L)))
}
/** Set the body falling so its feet meet the surface `offset` units past the ramp's foot, and
 * record its motion. A start that would overlap the bank is no landing: it returns null. */
function landing(pieces, mirrored, run, rise, offset, vx, vy, move) {
  const r = createRun(level(pieces, mirrored)), p = r.player, toward = mirrored ? -1 : 1; r.started = true
  stepRun(r, NEUTRAL_INPUT)
  const surface = FLOOR - Math.max(0, Math.min(1, -offset / run)) * rise
  const x = FOOT + offset - vx * 40 / vy
  Object.assign(p, { x: mirrored ? W - x : x, y: surface - 40, vx: vx * toward, vy, grounded: false, coyote: 0 })
  if (r.terrain.some(b => bodyIntersects(p.x, p.y, b))) return null
  const frames = []
  for (let f = 0; f < 120; f++) {
    stepRun(r, { ...NEUTRAL_INPUT, move: move * toward })
    frames.push([mirrored ? W - p.x : p.x, p.y, p.vx * toward, p.vy, p.grounded ? 1 : 0])
  }
  return frames
}
const ramps = [[24, 24], [96, 96], [96, 48], [48, 96]]
// A dropped body, a hop, a running leap, a long fall with and without a run.
const falls = [[0, 300, 0], [150, 600, 1], [410, 934, 1], [410, 1100, 0], [0, 1100, 0]]

for (const mirrored of [false, true]) for (const [run, rise] of ramps) {
  const side = mirrored ? 'leftward' : 'rightward', shapes = drawings(run, rise), [first, ...others] = Object.keys(shapes)
  // Every landing from well up the ramp to just past its foot.
  const offsets = []
  for (let offset = -Math.min(run, 40); offset <= 8; offset += 1) offsets.push(offset)

  test(`feet that come down a ${run} by ${rise} ramp to its foot are never thrown up, sent back or stopped (${side})`, () => {
    let landings = 0
    for (const shape of Object.keys(shapes)) for (const [vx, vy, move] of falls) for (const offset of offsets) {
      const frames = landing(shapes[shape], mirrored, run, rise, offset, vx, vy, move)
      if (!frames) continue
      landings++
      const label = `${shape}, ${offset} past the foot at ${vx}, ${vy}`
      for (const [f, [x, y, fvx, fvy]] of frames.entries()) {
        assert.ok(fvy > -1, `${label}, frame ${f}: thrown up at ${fvy.toFixed(0)}`)
        assert.ok(y <= FLOOR + .01, `${label}, frame ${f}: below the floor at ${x.toFixed(1)}, ${y.toFixed(1)}`)
        // A walkable ramp carries a fall forward and a steep one slides: neither sends the body back.
        assert.ok(fvx > -1, `${label}, frame ${f}: sent back at ${fvx.toFixed(0)}`)
      }
      const [, y, speed, , grounded] = frames.at(-1)
      assert.ok(grounded, `${label}: ends standing`)
      if (move) assert.ok(Math.abs(y - FLOOR) < .01 && speed > 400, `${label}: runs on across the floor (${speed.toFixed(0)} at height ${y.toFixed(1)})`)
    }
    assert.ok(landings > offsets.length * 6, `enough landings were tried (${landings})`)
  })

  for (const other of others) test(`a ${run} by ${rise} ramp's foot answers alike drawn as ${other} (${side})`, () => {
    for (const [vx, vy, move] of falls) for (const offset of offsets) {
      const [a, b] = [first, other].map(shape => landing(shapes[shape], mirrored, run, rise, offset, vx, vy, move))
      assert.equal(!a, !b, `${offset} past the foot at ${vx}, ${vy}: both drawings give the same clear start`)
      if (a) for (const [f, frame] of a.entries()) for (const [k, value] of frame.entries())
        assert.ok(Math.abs(value - b[f][k]) < 1e-6, `${offset} past the foot at ${vx}, ${vy}, frame ${f}: ${frame.map(v => v.toFixed(2))} against ${b[f].map(v => v.toFixed(2))}`)
    }
  })
}

// A slide ends where its ramp meets ground that would bring a slip to rest. The body lands
// there in one piece with the forward part of the speed it slid at, the same way in either
// direction. That holds past the 56 degrees of the toe bevel, where the bevel's upper corner
// rides the face instead of the feet: the face cannot take back the speed of a body leaving it.
/** Run onto the slide, let go, and report the slide's speed and how the body meets the flat. */
function slideOut(degrees, direction) {
  const lv = slideLevel(degrees, direction), run = createRun(lv), p = run.player
  const along = () => direction > 0 ? p.x : lv.width - p.x
  let slid = false, speed = 0, hopped = false, landed = null
  for (let i = 0; i < 900 && !landed; i++) {
    stepRun(run, { ...NEUTRAL_INPUT, move: slid ? 0 : direction, climb: i === 0 })
    slid ||= !!p.sliding?.active
    // The ramp's foot is 900 units along; the body's feet reach the flat a little before its hull does.
    if (p.sliding?.active && along() < 995) speed = Math.hypot(p.vx, p.vy)
    if (along() >= 995 && !p.grounded && !p.sliding?.active) hopped = true
    if (along() >= 995 && p.grounded) landed = { speed: p.vx * direction, frame: i, x: along(), y: p.y }
  }
  return { speed, hopped, landed }
}
for (const degrees of [46.5, 50, 55, 56, 57, 60, 65, 70, 75]) {
  test(`a ${degrees}° slide lands on the flat at its foot with its forward speed, alike in both directions`, () => {
    const [right, left] = [1, -1].map(direction => slideOut(degrees, direction))
    for (const [side, out] of [['rightward', right], ['leftward', left]]) {
      assert.ok(out.speed > 900, `${side}: the body slid (${out.speed.toFixed(0)})`)
      assert.ok(out.landed, `${side}: the slide ends standing on the flat`)
      assert.ok(!out.hopped, `${side}: the feet do not leave the ground between the slide and the landing`)
      const forward = out.speed * Math.cos(degrees * Math.PI / 180)
      assert.ok(Math.abs(out.landed.speed / forward - 1) < .03, `${side}: lands at ${out.landed.speed.toFixed(0)}, sliding ${forward.toFixed(0)} forward`)
    }
    assert.equal(right.landed.frame, left.landed.frame, 'both directions land on the same frame')
    for (const key of ['speed', 'x', 'y']) assert.ok(Math.abs(right.landed[key] - left.landed[key]) < 1e-6,
      `landing ${key}: ${right.landed[key].toFixed(3)} rightward, ${left.landed[key].toFixed(3)} leftward`)
  })
}

// Ground built from pieces: a slab whose far end leans, lying against an outcrop whose top
// begins at the slab's corner and whose own face falls away beneath it. The slab's end is
// buried in the outcrop. A runner who steps from one top to the other is leaving that end
// face with feet on ground that grips, so it cannot be taken for a slope to slide down.
for (const mirrored of [false, true]) for (const lean of [-40, -20, 20, 40]) {
  test(`a run keeps its speed across a flush seam where the first piece ends leaning ${lean > 0 ? 'forward' : 'back'} by ${Math.abs(lean)} (${mirrored ? 'leftward' : 'rightward'})`, () => {
    const top = 500, edge = 100 + (lean > 0 ? 700 : 700 - lean), width = W - edge + 110
    const slab = { x: 100, y: top, w: 700 + Math.abs(lean), h: 50, polygon: lean > 0 ? [[0, 0], [700, 0], [700 + lean, 50], [0, 50]] : [[0, 0], [700 - lean, 0], [700, 50], [0, 50]] }
    const outcrop = { x: edge - 110, y: top, w: width, h: H - top, polygon: [[0, 110], [110, 0], [width, 0], [width, H - top], [0, H - top]] }
    const under = { x: 0, y: top + 50, w: edge - 110, h: H - top - 50 }
    // Different starts reach the seam at different points of a step.
    for (const start of [200, 203, 207, 211, 215, 219, 222, 226]) {
      const L = blankTrial(); Object.assign(L, { width: W, height: H, floor: H })
      L.platforms = [slab, outcrop, under].map(b => !mirrored ? b
        : { ...b, x: W - b.x - b.w, ...(b.polygon ? { polygon: b.polygon.map(([x, y]) => [b.w - x, y]) } : {}) })
      L.entrance = { x: mirrored ? W - start : start, y: top }
      const run = createRun(parseLevel(JSON.parse(JSON.stringify(L)))), p = run.player, toward = mirrored ? -1 : 1; run.started = true
      for (let f = 0; f < 30; f++) stepRun(run, NEUTRAL_INPUT)
      let slowest = Infinity
      for (let f = 0; f < 320; f++) {
        stepRun(run, { ...NEUTRAL_INPUT, move: toward })
        if (f > 60) slowest = Math.min(slowest, p.vx * toward)
      }
      assert.ok(slowest > 400, `start ${start}: the run dropped to ${slowest.toFixed(0)}`)
      assert.ok(p.grounded && Math.abs(p.y - top) < .01 && (mirrored ? W - p.x : p.x) > edge + 200, `start ${start}: the runner is well past the seam`)
    }
  })
}

// A low riser that tops out onto a walkable slope, as where a flat landing is cut into a ramp a little below its
// surface. Steps only land on flat tops, so nothing steps the body up it: walking on, the toe bevel rides up over
// its corner onto the slope. It is not a wall (a rectangle cannot draw this corner), whichever way the slope runs.
for (const direction of [1, -1]) for (const rise of [4, 8, 14]) test(`walking ${direction > 0 ? 'right' : 'left'} onto a gentle slope over a ${rise}-unit riser carries on up it`, () => {
  // Floor at 900; a flat 100 wide, then the riser, then a 22 degree slope up 120 to a shelf.
  const outline = [[0, 300], [100, 300], [100, 300 - rise], [400, 180], [600, 180], [600, 400], [0, 400]]
  const piece = { x: direction > 0 ? 600 : W - 1200, y: 600, w: 600, h: 400, polygon: direction > 0 ? outline : outline.map(([x, y]) => [600 - x, y]) }
  const L = blankTrial(); Object.assign(L, { width: W, height: H, floor: H })
  L.platforms = [{ x: 0, y: 900, w: W, h: 300 }, piece]
  L.entrance = { x: direction > 0 ? 450 : W - 450, y: 900 }
  const run = createRun(parseLevel(JSON.parse(JSON.stringify(L)))); run.started = true
  const p = run.player
  for (let i = 0; i < 240; i++) stepRun(run, { ...NEUTRAL_INPUT, move: direction })
  const shelf = direction > 0 ? p.x > 1000 : p.x < W - 1000
  assert.ok(shelf && Math.abs(p.y - 780) < 1, `reached the shelf: x ${p.x.toFixed(1)}, y ${p.y.toFixed(1)}`)
})
