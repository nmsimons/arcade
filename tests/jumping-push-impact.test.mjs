import test from 'node:test'
import assert from 'node:assert/strict'
import { blankTrial, parseLevel } from '../src/games/jumping/level.ts'
import { createRun, stepRun } from './helpers/jumping-active-run.mjs'
import { NEUTRAL_INPUT, TUNING } from '../src/games/jumping/model.ts'
import { presentedAthletePose } from '../src/games/jumping/athlete.ts'
import { handGeometry } from '../src/games/jumping/androidHand.ts'
import { propBounds } from '../src/games/jumping/propGeometry.ts'
import { readBuiltinLevel } from './helpers/jumping-builtin-levels.mjs'

const RIGHT = { ...NEUTRAL_INPUT, move: 1 }

/** Ordinary dry floor, the player at `from` and one prop at x 900. */
function floor(prop, from) {
  const level = blankTrial()
  level.width = 2400
  level.entrance = { x: from, y: level.floor }
  level.props = [{ ...prop, x: 900, y: level.floor }]
  const run = createRun(parseLevel(level)); run.started = true
  return run
}

/** The farthest either drawn palm sits from its wrist. */
function palmGap(p) {
  const pose = presentedAthletePose(p)
  return Math.max(...[pose.frontArm, pose.backArm].map(arm => {
    const palm = handGeometry(arm).palm
    return Math.hypot(palm[0] - arm.end[0], palm[1] - arm.end[1])
  }))
}

/** Hold right until the hands take the prop, then `after` ticks more; the prop's fastest speed after contact. */
function pushInto(run, after, input = RIGHT, each = () => {}) {
  let contact = -1, fastest = 0
  for (let i = 0; i < 600 && (contact < 0 || i < contact + after); i++) {
    stepRun(run, input)
    const working = run.player.contacts?.push && !run.player.contacts.push.passive && run.player.contacts.push.anticipation === undefined
    if (contact < 0 && working) contact = i
    if (contact >= 0) { fastest = Math.max(fastest, run.props[0].vx); each(run, i - contact) }
  }
  assert.ok(contact >= 0, 'the hands reach the prop')
  return fastest
}

test('running into a crate on ordinary ground shares momentum by mass: it starts faster than a walking push, the palms on its face', () => {
  const crate = { kind: 'box', size: 80 }
  // A push from a standstill, its hands already at the face, and a run from far back.
  const walked = pushInto(floor(crate, 820), 40)
  const run = floor(crate, 160)
  let speed = 0, drift = 0
  const ran = pushInto(run, 40, RIGHT, ({ player: p, props: [box] }, tick) => {
    if (tick === 0) speed = Math.abs(p.vx)
    // While the stance follows the struck crate, its working palms stay on the face it is pushing.
    if (p.pushing?.palms && p.contacts?.push) for (const palm of p.pushing.palms) drift = Math.max(drift, Math.abs(palm.x - propBounds(box).x))
  })
  assert.ok(speed > TUNING.runSpeed * .9, `the player arrives running (${speed.toFixed(0)})`)
  assert.ok(ran > walked + 10, `struck at a run the crate moves at ${ran.toFixed(0)}, faster than the ${walked.toFixed(0)} a walking push gives it`)
  assert.ok(ran < speed / 2, `but a heavy crate takes only its share of the runner's speed (${ran.toFixed(0)})`)
  assert.ok(drift < 1.5, `the palms stay on the moving face (${drift.toFixed(2)} off)`)
})

test('a light ball struck at a run leaves ahead of the hands, which let go with the body rather than snapping after it', () => {
  const run = floor({ kind: 'ball', size: 60 }, 160)
  let widest = 0, released = false
  const fastest = pushInto(run, 60, RIGHT, ({ player: p }) => {
    if (!p.contacts?.push) released = true
    if (p.pushing) widest = Math.max(widest, palmGap(p))
  })
  assert.ok(fastest > TUNING.runSpeed / 3, `the ball takes a large share of the run (${fastest.toFixed(0)})`)
  assert.ok(released, 'the ball leaves the hands')
  assert.ok(widest < 3.6, `each drawn palm stays beside its wrist (${widest.toFixed(2)})`)
})

test('the stance catching up with a crate it pushes down a ramp is the push, not another collision', () => {
  // Boxes' entry ramp falls 40 over 460 to the left. Crouched and pushing its small crate downhill, the working stance
  // walks the body to its push distance faster than the crate: about 170 against the crate's 100. Counting that
  // catch-up speed as a fresh impact struck the crate every other step, about 30 times, sending it off at 180 with
  // the pusher chasing at 240.
  const level = structuredClone(readBuiltinLevel('06b6058e-4448-4c6a-81a2-e936a70fda0a'))
  const rampY = x => 920 - 40 * (x - 140) / 460
  level.entrance = { ...level.entrance, x: 560, y: rampY(560) }
  level.props = [{ kind: 'box', x: 480, y: rampY(480), size: 30 }]
  const run = createRun(parseLevel(level)); run.started = true
  let body = 0, crate = 0
  for (let i = 0; i < 240; i++) {
    stepRun(run, { ...NEUTRAL_INPUT, move: -1, crouch: true })
    if (run.player.contacts?.push) { body = Math.max(body, -run.player.vx); crate = Math.max(crate, -run.props[0].vx) }
  }
  assert.ok(crate > 60, `the crate is pushed downhill (${crate.toFixed(0)})`)
  assert.ok(crate < 130, `at the push's own pace, not struck again and again (${crate.toFixed(0)})`)
  assert.ok(body < 200, `and the pusher follows it at the stance's pace (${body.toFixed(0)})`)
})
