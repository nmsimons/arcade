// Pose flicker detection for Untitled Jumping Game (scripts/jumping-flicker.mjs).
//
// A drawn frame shows whichever physics step it lands on, so a pose that is wrong for one or two steps
// shows only sometimes: a flicker. These checks look at the presented pose of the player and every robot
// on every step, relative to the body, so travel and turning blends are not mistaken for one:
//
// - a flicker: a joint leaves where it was by more than `flicker` units and returns within six steps;
// - a snap: a joint jumps more than `snap` units in one step, several times further than in the steps
//   either side of it, and does not come back within six steps.
import { readFileSync } from 'node:fs'

const LIMBS = ['frontArm', 'backArm', 'frontLeg', 'backLeg']
export const JOINT_NAMES = ['hip', 'waist', 'shoulder', 'head', ...LIMBS.flatMap(limb => [`${limb}.joint`, `${limb}.end`])]
export const FLICKER_UNITS = 5
export const SNAP_UNITS = 10
/** Steps a flicker can last: 50 ms, three drawn frames. */
const WINDOW = 6

/** Joint positions relative to the body, as drawn: mirrored by facing and by inverted gravity. */
export function poseJoints(p, pose) {
  const flip = p.inverted ? -1 : 1, at = point => [point[0] * p.facing, point[1] * flip]
  return [at(pose.hip), at(pose.waist), at(pose.shoulder), at(pose.head), ...LIMBS.flatMap(limb => [at(pose[limb].joint), at(pose[limb].end)])]
}

const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1])

/** Watches one body's poses step by step and reports flickers and snaps as they complete. */
export class FlickerWatch {
  constructor({ flicker = FLICKER_UNITS, snap = SNAP_UNITS } = {}) {
    this.flicker = flicker; this.snap = snap; this.history = []; this.events = []; this.quiet = new Map(); this.covered = new Map()
  }
  /** A respawn, teleport or new body: nothing before this connects to what follows. */
  reset() { this.history = [] }
  push(tick, joints, context) {
    const history = this.history
    history.push({ tick, joints, context })
    if (history.length > 2 * WINDOW + 3) history.shift()
    const n = history.length - 1
    for (let j = 0; j < joints.length; j++) {
      // Flicker: away and back within WINDOW steps.
      if ((this.quiet.get(j) ?? -Infinity) < tick) for (let k = 1; k <= WINDOW && n - k - 1 >= 0; k++) {
        const start = history[n - k - 1].joints[j], end = joints[j]
        if (distance(start, end) > this.flicker / 3) continue
        let worst = 0, at = -1
        for (let i = n - k; i < n; i++) { const away = distance(history[i].joints[j], start); if (away > worst) { worst = away; at = i } }
        if (worst > this.flicker) {
          this.events.push({ kind: 'flicker', tick: history[at].tick, steps: k, joint: JOINT_NAMES[j], units: +worst.toFixed(1), context: history[at].context })
          this.quiet.set(j, tick + WINDOW); this.covered.set(j, tick)
          break
        }
      }
      // Snap: a step WINDOW steps ago jumped far further than its neighbours, and has not come back since.
      // The way out and back of a flicker already reported is not a snap as well.
      const s = n - WINDOW
      if (s < 2 || history[s].tick <= (this.covered.get(j) ?? -Infinity)) continue
      const step = i => distance(history[i].joints[j], history[i - 1].joints[j])
      const jump = step(s), before = history[s - 1].joints[j]
      if (jump <= this.snap || jump <= 3 * Math.max(step(s - 1), step(s + 1))) continue
      if (history.slice(s, n + 1).some(frame => distance(frame.joints[j], before) <= this.flicker / 3)) continue
      this.events.push({ kind: 'snap', tick: history[s].tick, joint: JOINT_NAMES[j], units: +jump.toFixed(1), context: history[s].context })
    }
  }
}

/** What the body was doing, to make a report readable. */
function context(p) {
  return [p.grounded ? 'grounded' : 'airborne', p.pushing && 'pushing', p.climbing && 'climbing', p.hang && 'hanging', p.mantle && 'mantling',
    p.sliding?.active && 'sliding', p.waterMotion && 'swimming', p.crouching && 'crouching', p.anim.dryTurn && 'turning'].filter(Boolean).join(' ')
}

/** Replay a golden script and collect every flicker and snap of the player and each robot. */
export function scanScript(game, url, script, options = {}) {
  const level = game.parseLevel(JSON.parse(readFileSync(new URL(url), 'utf8')))
  const run = game.createRun(level)
  game.stepRun(run, game.NEUTRAL_INPUT, game.entranceDuration(run.entrance))
  const watches = new Map(), last = new Map()
  const bodies = () => [['player', run.player], ...run.robots.flatMap((robot, i) => robot.actor ? [[`robot ${i}`, robot.actor]] : [])]
  let tick = 0
  for (const { frames, input } of script) {
    const controls = { ...game.NEUTRAL_INPUT, ...input }
    for (let frame = 0; frame < frames && !run.finished; frame++, tick++) {
      game.stepRun(run, controls)
      for (const [name, p] of bodies()) {
        let watch = watches.get(name)
        if (!watch) watches.set(name, watch = new FlickerWatch(options))
        const before = last.get(name)
        if (!before || before.body !== p || Math.hypot(p.x - before.x, p.y - before.y) > 80) watch.reset()
        last.set(name, { body: p, x: p.x, y: p.y })
        watch.push(tick, poseJoints(p, game.presentedAthletePose(p)), `${name}: ${context(p)}`)
      }
    }
  }
  return { ticks: tick, events: [...watches.values()].flatMap(watch => watch.events).sort((a, b) => a.tick - b.tick) }
}

/** Flickers this large or larger count against a route's budget; smaller ones are only reported. */
export const FLICKER_GATE = 12
export const BUDGET = new URL('../fixtures/jumping-flicker-budget.json', import.meta.url)

/** Scan the selected golden routes on worker threads, in the selected order. */
export async function runFlickerScan({ keys, source, thresholds } = {}) {
  const { Worker } = await import('node:worker_threads')
  const { availableParallelism } = await import('node:os')
  const { goldenScripts, loadGame } = await import('./jumping-golden.mjs')
  const game = await loadGame(source)
  const selected = goldenScripts(game).filter(entry => !keys || keys.includes(entry.key))
  const length = entry => entry.script.reduce((sum, segment) => sum + segment.frames, 0)
  const queue = selected.toSorted((a, b) => length(b) - length(a)).map(entry => entry.key), results = new Map()
  await Promise.all(Array.from({ length: Math.max(1, Math.min(availableParallelism() - 1, queue.length)) }, () => new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./jumping-flicker-worker.mjs', import.meta.url), { workerData: { source: source && String(source), thresholds } })
    const next = () => queue.length ? worker.postMessage(queue.shift()) : worker.terminate().then(resolve)
    worker.on('message', ({ key, result, error }) => { if (error) { worker.terminate(); reject(new Error(`${key}: ${error}`)) } else { results.set(key, result); next() } })
    worker.on('error', reject)
    worker.once('online', next)
  })))
  return selected.map(entry => ({ key: entry.key, ...results.get(entry.key) }))
}

/** Each route's count of flickers at or above the gate. */
export const gateCounts = results => Object.fromEntries(results.map(({ key, events }) =>
  [key, events.filter(event => event.kind === 'flicker' && event.units >= FLICKER_GATE).length]))

/** The recorded budget for this math library, or null: routes replay identically only on the library that recorded them. */
export function readFlickerBudget(math) {
  try {
    const budget = JSON.parse(readFileSync(BUDGET, 'utf8'))
    return budget.math === math ? budget : null
  } catch { return null }
}
