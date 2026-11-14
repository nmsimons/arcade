import test from 'node:test'
import assert from 'node:assert/strict'
import { blankTrial } from '../src/games/jumping/level.ts'
import { NEUTRAL_INPUT, STEP } from '../src/games/jumping/model.ts'
import { presentedAthletePose } from '../src/games/jumping/athletePose.ts'
import { MAX_NECK_ANGLE, neckTurnLimit } from '../src/games/jumping/athleteLimits.ts'
import { groundAt, groundUnder, solidTopAt } from '../src/games/jumping/terrain.ts'
import { createRun, stepRun } from './helpers/jumping-active-run.mjs'
import { mathFingerprint } from './helpers/jumping-golden.mjs'
import { FlickerWatch, FLICKER_GATE, gateCounts, poseJoints, readFlickerBudget, runFlickerScan } from './helpers/jumping-flicker.mjs'

// A drawn frame shows whichever physics step it lands on, so a pose wrong for a step or two flickers only
// sometimes. These scenarios watch the presented pose on every step (tests/helpers/jumping-flicker.mjs);
// `node scripts/jumping-flicker.mjs` scans every golden route the same way.

const FLOOR = blankTrial().entrance.y

/** Every flicker and snap of the player's drawn pose while holding `input`. */
function watch(change, input, seconds, settle = .3) {
  const level = blankTrial(); change(level)
  const run = createRun(level), p = run.player, flickers = new FlickerWatch()
  for (let n = 0; n * STEP < seconds; n++) {
    stepRun(run, input)
    if (n * STEP >= settle) flickers.push(n, poseJoints(p, presentedAthletePose(p)), JSON.stringify({ grounded: p.grounded, mantle: !!p.mantle }))
  }
  return { run, events: flickers.events }
}

test('the watch finds a joint away for a step or for three frames, and a snap, but not steady motion', () => {
  const pose = (x, y = 0) => Array.from({ length: 12 }, (_, j) => j === 5 ? [x, y] : [0, j])
  const scan = xs => { const w = new FlickerWatch(); xs.forEach((x, tick) => w.push(tick, pose(x), '')); return w.events }
  assert.deepEqual(scan(Array.from({ length: 40 }, (_, i) => i * 1.5)), [], 'a joint swinging steadily')
  assert.deepEqual(scan([0, 0, 0, 24, 0, 0, 0]).map(e => [e.kind, e.steps, e.units]), [['flicker', 1, 24]])
  assert.deepEqual(scan([0, 0, 0, 12, 12, 12, 12, 12, 12, 0, 0, 0]).map(e => [e.kind, e.steps]), [['flicker', 6]], 'three drawn frames')
  assert.deepEqual(scan([0, 0, 0, 0, 20, 20, 20, 20, 20, 20, 20, 20]).map(e => [e.kind, e.units]), [['snap', 20]])
})

test('a foot stands on what is under it, never on a tipping crate\'s corner leaning over it', () => {
  // A 50-unit crate tipped 0.54 rad onto one corner, its other low corner 25.6 units off the floor.
  const crate = { x: 889.8, y: 931.4, w: 68.6, h: 68.6, polygon: [[0, 43], [25.6, 0], [68.6, 25.7], [43, 68.6]] }
  const floor = { x: 0, y: 1000, w: 2000, h: 100 }, terrain = [crate, floor]
  assert.ok(Math.abs(groundAt(terrain, 890, 1000).y - 974.4) < .5, 'groundAt finds the corner, within reach of the body')
  assert.equal(groundUnder(terrain, 890, 998, 1000).y, 1000, 'a sole just above the floor stands on the floor')
  assert.equal(solidTopAt(terrain, 890, 998, 1000), null, 'and is not inside anything')
  assert.equal(solidTopAt(terrain, 890, 1002, 1000), 1000, 'a sole sunk into the floor rises to its top')
  const inside = groundUnder(terrain, 935, 990, 950)
  assert.ok(Math.abs(inside.y - 943.1) < .5, `a point inside the crate stands on the crate's top, ${inside.y}`)
})

test('the neck limit opens smoothly as the torso foreshortens', () => {
  const torso = length => ({ waist: [0, 0], shoulder: [0, -length] })
  assert.equal(neckTurnLimit(torso(10)), MAX_NECK_ANGLE)
  assert.equal(neckTurnLimit(torso(5)), MAX_NECK_ANGLE)
  assert.equal(neckTurnLimit(torso(0)), Math.PI)
  for (let length = 0; length < 5; length += .05) assert.ok(Math.abs(neckTurnLimit(torso(length + .05)) - neckTurnLimit(torso(length))) < .06, `continuous at ${length}`)
})

test('pushing a crate until it tumbles over, again and again, keeps the feet steady', () => {
  // Crates up to 50 units tip over when pushed; larger ones slide.
  for (const size of [40, 50]) {
    const { run, events } = watch(level => { level.entrance = { x: 600, y: FLOOR }; level.props = [{ kind: 'box', x: 700, y: FLOOR, size }] },
      { ...NEUTRAL_INPUT, move: 1 }, 12)
    assert.ok(run.props[0].x > 1000 && Math.abs(run.props[0].angle) > Math.PI, `the ${size} crate tumbled along, at ${run.props[0].x}`)
    assert.deepEqual(events, [], `a ${size} crate`)
  }
})

test('climbing off the top of a ladder keeps the head on its neck', () => {
  const deck = FLOOR - 320
  const { run, events } = watch(level => {
    level.platforms = [{ x: 300, y: deck, w: 600, h: 25 }]
    level.climbables.ladders = [{ x: 500, top: deck, bottom: FLOOR, side: 1, platform: -1 }]
    level.entrance = { x: 500, y: FLOOR }
  }, { ...NEUTRAL_INPUT, climb: true }, 6)
  assert.equal(run.player.y, deck, 'it climbed out onto the deck')
  assert.deepEqual(events, [])
})

// Routes replay identically only on the math library that recorded the budget (Apple Silicon); CI's unit
// jobs set SKIP_UJG_GOLDEN.
const budget = readFlickerBudget(mathFingerprint())
const skipped = process.env.SKIP_UJG_GOLDEN ? 'CI replays golden routes in its own job'
  : !budget && 'No flicker budget is recorded for this math library; it is checked on Apple Silicon.'
test(`no golden route flickers more than its budget, at ${FLICKER_GATE} units or more`, { skip: skipped }, async () => {
  const results = await runFlickerScan(), counts = gateCounts(results), over = []
  for (const { key, events } of results) {
    const allowed = budget.routes[key] ?? 0
    if (counts[key] > allowed) over.push(`${key}: ${counts[key]} (budget ${allowed}): ${events.filter(e => e.kind === 'flicker' && e.units >= FLICKER_GATE)
      .map(e => `tick ${e.tick} ${e.joint} ${e.units}`).join(', ')}`)
  }
  assert.deepEqual(over, [], 'run node scripts/jumping-flicker.mjs --gate --only <route> to see them')
})
