import test from 'node:test'
import assert from 'node:assert/strict'
import { blankTrial, parseLevel } from '../src/games/jumping/level.ts'
import { createRun, stepRun } from './helpers/jumping-active-run.mjs'
import { NEUTRAL_INPUT, STEP } from '../src/games/jumping/model.ts'
import { presentedAthletePose } from '../src/games/jumping/athlete.ts'

// Pushing and turning out of a push are drawn without single-frame joint jumps, on grip and on ice
// (docs/jumping-physics.md, "Every drawn push starts from the pose actually drawn"). Normal inputs only.

const RIGHT = { ...NEUTRAL_INPUT, move: 1 }, LEFT = { ...NEUTRAL_INPUT, move: -1 }
const LIMIT = 8
const NAMES = ['head', 'shoulder', 'hip', 'front hand', 'back hand', 'front foot', 'back foot', 'front elbow', 'back elbow', 'front knee', 'back knee']

/** A floor of grip, of ice, or grip to `padEnd` and ice after it; one crate (size 40) at `crateX`. */
function course({ ice = false, padEnd, playerX, playerY = 880, crateX }) {
  const level = { ...blankTrial(), width: 3600, entrance: { x: playerX, y: playerY }, goal: { x: 3500, y: 880 },
    platforms: padEnd === undefined ? [{ x: 0, y: 880, w: 3600, h: 40, ...(ice ? { frictionless: true } : {}) }]
      : [{ x: 0, y: 880, w: padEnd, h: 40 }, { x: padEnd, y: 880, w: 3600 - padEnd, h: 40, frictionless: true }],
    props: crateX === undefined ? [] : [{ kind: 'box', x: crateX, y: 880, size: 40 }] }
  const run = createRun(parseLevel(level)); run.started = true
  return run
}

/** Drawn joints in the body's own frame (so travel does not count). */
function joints(p) {
  const pose = presentedAthletePose(p)
  return [pose.head, pose.shoulder, pose.hip, pose.frontArm.end, pose.backArm.end, pose.frontLeg.end, pose.backLeg.end,
    pose.frontArm.joint, pose.backArm.joint, pose.frontLeg.joint, pose.backLeg.joint].map(([x, y]) => [x * p.facing, y])
}

/** The largest one-frame move of any joint, letting the near and far limbs swap (they cross in profile). */
function largestMove(a, b) {
  const swapped = [0, 1, 2, 4, 3, 6, 5, 8, 7, 10, 9]
  let best = { distance: Infinity, joint: '' }
  for (const order of [[...a.keys()], swapped]) {
    let worst = { distance: 0, joint: '' }
    b.forEach(([x, y], k) => {
      const distance = Math.hypot(x - a[order[k]][0], y - a[order[k]][1])
      if (distance > worst.distance) worst = { distance, joint: NAMES[k] }
    })
    if (worst.distance < best.distance) best = worst
  }
  return best
}

/** Play `phases` ([seconds, input]) and return the worst joint move from `from` seconds on. */
function worstMove(run, phases, from = 0) {
  let previous = joints(run.player), tick = 0, worst = { distance: 0, joint: '', tick: -1 }
  for (const [seconds, input] of phases) for (let i = 0; i < Math.round(seconds / STEP); i++, tick++) {
    stepRun(run, input)
    const now = joints(run.player), move = largestMove(previous, now)
    previous = now
    if (tick >= Math.round(from / STEP) && move.distance > worst.distance) worst = { ...move, tick }
  }
  return worst
}

const assertSmooth = (worst, label) => assert.ok(worst.distance <= LIMIT,
  `${label}: the ${worst.joint} jumped ${worst.distance.toFixed(1)} in one frame at tick ${worst.tick}`)

for (const ice of [false, true]) {
  const footing = ice ? 'ice' : 'grip'

  test(`pressing into a crate from a standstill eases into the stance on ${footing}`, () => {
    // Palms already within reach at the first step: the hands used to land on the face in one frame (28.5 on grip).
    for (const crateX of [1032, 1040, 1060]) {
      const run = course({ ice, playerX: 1000, crateX })
      assertSmooth(worstMove(run, [[.1, NEUTRAL_INPUT], [1, RIGHT]]), `crate at ${crateX}`)
    }
  })

  test(`landing beside a crate while holding toward it eases into the push on ${footing}`, () => {
    // The reach while falling meets the face lower than the stance does, and the body joins the stance only on the
    // ground; both used to land in one frame (13 to 20). Sliding down the crate's face flickered the landing arms (17.5).
    for (const crateX of [1040, 1048, 1060]) {
      const run = course({ ice, playerX: 1000, playerY: 820, crateX })
      assertSmooth(worstMove(run, [[1, RIGHT]]), `crate at ${crateX}`)
    }
  })

  test(`turning straight out of a push hands the feet over to the stride without a jump on ${footing}`, () => {
    // Pushing off a grip pad (onto ice past x 500 for the ice case), then reversing. About ten ticks into the turn the
    // stride set a foot down a dozen units from where the turn drew it, and the turn's last frame closed what was left.
    for (const hold of [1.05, 1.25, 1.6, 1.8, 2.3, 2.85]) {
      const run = course({ padEnd: ice ? 500 : 3590, playerX: 420, crateX: 470 })
      assertSmooth(worstMove(run, [[.1, NEUTRAL_INPUT], [hold, RIGHT], [1, LEFT]], .1 + hold), `reversing after ${hold} s`)
    }
  })
}

test('reversing out of a run sets the landing foot down without a jump', () => {
  // A foot set down while the turn still drew it high in its swing dropped ten units in one frame.
  for (const ticks of [24, 30, 32, 38]) {
    const run = course({ playerX: 1800 })
    assertSmooth(worstMove(run, [[.1, NEUTRAL_INPUT], [ticks * STEP, LEFT], [1, RIGHT]], .1 + ticks * STEP), `reversing after ${ticks} ticks`)
  }
})
