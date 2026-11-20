// Ice lab: curling with a crate on slick terrain, measured headlessly. Evidence for docs/jumping-ice.md.
//
//   node scripts/ice-lab.mjs                    every scene, one line each
//   node scripts/ice-lab.mjs --json out.json    also write the measurements as JSON
//   node scripts/ice-lab.mjs --only deliver     scenes whose name contains "deliver"
//   node scripts/ice-lab.mjs --trace deliver    print the scene's state every 6 ticks
//
// The rink: a grippy pad (x 100-500, top y 880), then ice to x 3500. A crate (size 40) sits at the pad's far end with
// the player behind it, so a held Right pushes it off the pad onto the ice. Polishing Bay scenes use the level as
// committed (git HEAD), so a level being edited does not move the evidence. Step costs are wall-clock for this
// process: compare runs made together on one machine.
import { execFileSync } from 'node:child_process'
import { writeFile } from 'node:fs/promises'
import { performance } from 'node:perf_hooks'
import { createRun, stepRun } from '../tests/helpers/jumping-active-run.mjs'
import { blankTrial, parseLevel } from '../src/games/jumping/level.ts'
import { NEUTRAL_INPUT, STEP, TUNING } from '../src/games/jumping/model.ts'
import { athletePose } from '../src/games/jumping/athlete.ts'
import { SLICK } from '../src/games/jumping/friction.ts'

const args = process.argv.slice(2)
const option = name => { const at = args.indexOf(name); return at < 0 ? undefined : args[at + 1] }
const only = option('--only'), traced = option('--trace'), jsonOut = option('--json')
const RIGHT = { move: 1 }, LEFT = { move: -1 }, second = s => Math.round(s / STEP)

/** The rink: a grippy pad, then ice; a crate at the pad's end and the player just behind it. */
export function rink({ crateX = 470, playerX = 420, padEnd = 500 } = {}) {
  const level = { ...blankTrial(), width: 3600, entrance: { x: playerX, y: 880 }, goal: { x: 3500, y: 880 },
    platforms: [{ x: 0, y: 880, w: padEnd, h: 40 }, { x: padEnd, y: 880, w: 3600 - padEnd, h: 40, frictionless: true }],
    props: [{ kind: 'box', x: crateX, y: 880, size: 40 }] }
  const run = createRun(parseLevel(level)); run.started = true
  return run
}
const committedBay = () => JSON.parse(execFileSync('git', ['show', 'HEAD:public/levels/jumping/polishingbay.jump-level.json'], { encoding: 'utf8' }))

/** Drawn joints in the world: head, shoulder, hip, hands, feet. */
function joints(p) {
  const pose = athletePose(p)
  return [pose.head, pose.shoulder, pose.hip, pose.frontArm.end, pose.backArm.end, pose.frontLeg.end, pose.backLeg.end]
    .map(([x, y]) => [p.x + x * p.facing, p.y + y * (p.inverted ? -1 : 1)])
}
const onIce = p => p.grounded ? !!p.contacts?.support?.platform.frictionless : !!p.sliding?.slick
/** The push contact on the crate, if the hands are working on it. */
const pushing = (p, crate) => { const push = p.contacts?.push; return !!push && push.collider.prop === crate && !push.passive && push.effort > 0 }
/** Gap between the player's leading hand and the crate's near face, along x. */
function palmGap(p, crate) {
  const pose = athletePose(p), hand = (p.facing > 0 ? Math.max : Math.min)(p.x + pose.frontArm.end[0] * p.facing, p.x + pose.backArm.end[0] * p.facing)
  const face = crate.x - p.facing * crate.size / 2
  return (face - hand) * p.facing
}

/** Step `run` through `phases` ([seconds, input]...) and measure. */
function play(name, run, phases) {
  const p = run.player, crate = run.props[0], times = []
  let previous = null, worstJump = 0, worstTick = 0, axis = null, fastestTurn = 0, tick = 0, turns = []
  const m = { heldOnIce: 0, pushOnIce: 0, gapWhilePushing: [], partingDuringHold: 0, crossJolt: 0, lurch: 0, crateKick: 0, release: null, crateStop: null,
    playerStop: null, playerAtCrateStop: null, brakeContactTicks: 0, brakeTicks: 0 }
  let held = false, lastV = null, lastCrateV = null, wasOnIce = false, releasedAt = null, lastGap = null
  // Settle a few ticks first: the pose before any animation has run is not a frame anyone sees. Then the first
  // frame of the scene counts, so a snap as a push starts is measured.
  for (let i = 0; i < 10; i++) stepRun(run, NEUTRAL_INPUT)
  previous = joints(p).map(([x, y]) => [x - p.x, y - p.y])
  for (const [seconds, input] of phases) for (let f = 0; f < second(seconds); f++, tick++) {
    const start = performance.now()
    stepRun(run, { ...NEUTRAL_INPUT, ...input })
    times.push(performance.now() - start)
    const holding = !!input.move && input.move > 0, ice = onIce(p), push = pushing(p, crate)
    if (holding && ice) { m.heldOnIce++; if (push) m.pushOnIce++ }
    if (push) { const gap = palmGap(p, crate); m.gapWhilePushing.push(gap); if (lastGap !== null && Math.abs(gap - lastGap) > 1.5) m.partingDuringHold++; lastGap = gap } else lastGap = null
    if (input.move < 0) { m.brakeTicks++; if (push) m.brakeContactTicks++ }
    if (ice && !wasOnIce && lastV !== null) m.crossJolt = Math.max(m.crossJolt, Math.abs(p.vx - lastV), Math.abs(crate.vx - lastCrateV))
    // Anywhere in the scene: the largest one-tick change in the player's speed and in the crate's.
    if (lastV !== null) { m.lurch = Math.max(m.lurch, Math.abs(p.vx - lastV)); m.crateKick = Math.max(m.crateKick, Math.abs(crate.vx - lastCrateV)) }
    wasOnIce = ice
    if (held && !holding && releasedAt === null) { releasedAt = tick; m.release = { player: +p.vx.toFixed(1), crate: +crate.vx.toFixed(1), x: +crate.x.toFixed(1) } }
    if (releasedAt !== null && m.crateStop === null && Math.abs(crate.vx) < .5 && tick > releasedAt + 5) { m.crateStop = +crate.x.toFixed(1); m.playerAtCrateStop = +(crate.x - p.x).toFixed(1) }
    if (releasedAt !== null && m.playerStop === null && Math.abs(p.vx) < .5 && tick > releasedAt + 5) m.playerStop = +p.x.toFixed(1)
    held = holding; lastV = p.vx; lastCrateV = crate.vx
    const now = joints(p).map(([x, y]) => [x - p.x, y - p.y])
    const moved = order => Math.max(...now.map(([x, y], k) => Math.hypot(x - previous[order[k]][0], y - previous[order[k]][1])))
    const jump = previous ? Math.min(moved([0, 1, 2, 3, 4, 5, 6]), moved([0, 1, 2, 4, 3, 6, 5])) : 0
    if (jump > worstJump) { worstJump = jump; worstTick = tick }
    const [head, , hip] = now, angle = Math.atan2(head[1] - hip[1], head[0] - hip[0])
    if (axis !== null) turns.push(Math.atan2(Math.sin(angle - axis), Math.cos(angle - axis)))
    axis = angle
    if (turns.length >= 12) fastestTurn = Math.max(fastestTurn, Math.abs(turns.slice(-12).reduce((a, b) => a + b, 0)) / (12 * STEP) * 180 / Math.PI)
    previous = now
    if (traced && name.includes(traced) && tick % 6 === 0) console.log(`${name} t${tick} p(${p.x.toFixed(1)} v${p.vx.toFixed(0)}${ice ? ' ice' : ''}${push ? ' PUSH' : ''}) crate(${crate.x.toFixed(1)} v${crate.vx.toFixed(0)}) gap${push ? palmGap(p, crate).toFixed(1) : '-'} gait${(p.anim.gait?.moving ?? 0).toFixed(2)}`)
  }
  times.sort((a, b) => a - b)
  const gaps = m.gapWhilePushing
  return { ...m, gapWhilePushing: gaps.length ? { min: +Math.min(...gaps).toFixed(1), max: +Math.max(...gaps).toFixed(1) } : null,
    pushShareOnIce: m.heldOnIce ? +(m.pushOnIce / m.heldOnIce).toFixed(2) : null, crossJolt: +m.crossJolt.toFixed(1), lurch: +m.lurch.toFixed(1), crateKick: +m.crateKick.toFixed(1),
    finalCrate: +crate.x.toFixed(1), finalPlayer: +p.x.toFixed(1), worstJointJump: +worstJump.toFixed(1), worstJumpTick: worstTick,
    fastestTurnDegPerS: Math.round(fastestTurn), stepMedianMs: +times[times.length >> 1].toFixed(3), stepP95Ms: +times[Math.floor(times.length * .95)].toFixed(3) }
}

const scenes = [
  // Curling deliveries: push off the pad for this long, then let go and watch.
  ...[.8, 1.2, 1.6, 2.4].map(hold => ({ name: `deliver-${hold}s`, run: () => rink(), phases: [[hold, RIGHT], [6, {}]] })),
  // The same delivery again: identical inputs, identical stop.
  { name: 'deliver-1.2s-again', run: () => rink(), phases: [[1.2, RIGHT], [6, {}]] },
  // A long hold: how fast can a pusher on ice drive the pair?
  { name: 'drive-on-ice', run: () => rink(), phases: [[4, RIGHT], [6, {}]] },
  // Both at rest on the ice, hands on the crate: push off from nothing.
  { name: 'start-on-ice', run: () => rink({ crateX: 1050, playerX: 1000 }), phases: [[2, RIGHT], [5, {}]] },
  // Deliver, then hold back against the glide: the hands should come off, the feet brake by friction.
  { name: 'brake-after-delivery', run: () => rink(), phases: [[1.2, RIGHT], [2, LEFT], [4, {}]] },
]

const results = {}
for (const scene of scenes) {
  if (only && !scene.name.includes(only)) continue
  results[scene.name] = play(scene.name, scene.run(), scene.phases)
}
// Polishing Bay as committed: from behind the crate, push it off the loading floor down the ramp for each hold.
if (!only || 'bay'.includes(only) || only.includes('bay')) {
  for (const hold of [.6, 1, 1.4, 2]) {
    const level = committedBay(), plate = level.triggers.find(t => t.facing)
    const run = createRun(parseLevel({ ...level, entrance: { x: 200, y: 600 } })); run.started = true
    const crate = run.props[0]
    let pressed = false
    const phases = [[hold, RIGHT], [10, {}]]
    for (const [s, input] of phases) for (let f = 0; f < second(s); f++) { stepRun(run, { ...NEUTRAL_INPUT, ...input }); pressed ||= !!run.triggers?.some(t => t.active) }
    results[`bay-${hold}s`] = { crateStop: +crate.x.toFixed(1), plateX: plate?.x, platePressed: pressed }
  }
}
const iceSlowing = SLICK.sliding * TUNING.gravity
console.log(`ice friction ${SLICK.sliding} (slows a slide by ${iceSlowing.toFixed(0)} per second each second)`)
for (const [name, r] of Object.entries(results)) console.log(name.padEnd(22), JSON.stringify(r))
if (jsonOut) await writeFile(jsonOut, JSON.stringify({ iceFriction: SLICK.sliding, results }, null, 2))
