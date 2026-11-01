import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { pathToFileURL } from 'node:url'

// Golden traces replay fixed input scripts on every built-in level and hash the
// simulation each tick. The simulation is deterministic, so a refactor that
// claims to preserve behaviour must reproduce every checkpoint bit for bit.
//
//   physics  kinematics, motor modes and timers of the player, props, ropes,
//            robots, mechanisms and run counters. Presentation blends excluded.
//   state    every mutable field of the run, including presentation state.
//            Moving or renaming fields changes it on purpose.
//   pose     presentedAthletePose for the player and every robot actor,
//            sampled every second tick.
//
// Checkpoints store a running hash every CHECKPOINT ticks, so a divergence is
// located to within one second of gameplay. `scripts/jumping-golden.mjs`
// records and checks them, and prints per-tick values for finding the tick.

export const CHECKPOINT = 120
export const POSE_EVERY = 2
export const KINDS = ['physics', 'state', 'pose']
export const FIXTURE = new URL('../fixtures/jumping-golden-traces.json', import.meta.url)
const repository = new URL('../../', import.meta.url)

/** Game modules from this checkout or another one, for side-by-side traces. */
export async function loadGame(root = repository) {
  const base = root instanceof URL ? root : pathToFileURL(root.endsWith('/') ? root : `${root}/`)
  const jumping = new URL('src/games/jumping/', base)
  const [challenge, level, model, athlete, goal] = await Promise.all(['challenge.ts', 'level.ts', 'model.ts', 'athlete.ts', 'goal.ts']
    .map(file => import(new URL(file, jumping).href)))
  return { ...challenge, ...level, ...model, ...athlete, ...goal, levelsRoot: new URL('public/levels/jumping/', base) }
}

/** Mulberry32: a small, well-mixed generator with a 32-bit state. */
function generator(seed) {
  return () => {
    seed = seed + 0x6D2B79F5 | 0
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed)
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t
    return ((t ^ t >>> 14) >>> 0) / 4294967296
  }
}
const seedFor = text => createHash('sha256').update(text).digest().readUInt32LE(0)

// Two input profiles. The runner travels and jumps; the climber favours
// Up, Down, crouching, reaching and reversals over shorter holds.
const PROFILES = {
  runner: { hold: [6, 60], move: [[.4, 1], [.65, -1], [.75, .5], [.82, -.5]], jump: .4, climb: .12, crouch: .06, drop: .03, descend: .04, reach: .05, use: .03 },
  climber: { hold: [4, 36], move: [[.3, 1], [.6, -1], [.7, .5], [.8, -.5]], jump: .3, climb: .4, crouch: .12, drop: .08, descend: .14, reach: .12, use: .05 },
}
export const EXPLORE_TICKS = 960

/** Seeded inputs held for random durations, as { frames, input } segments. */
export function exploreScript(file, profile, ticks = EXPLORE_TICKS) {
  const settings = PROFILES[profile], random = generator(seedFor(`${file}|${profile}`)), segments = []
  for (let left = ticks; left > 0;) {
    const [min, max] = settings.hold, frames = Math.min(left, min + Math.floor(random() * (max - min)))
    left -= frames
    const roll = random(), move = settings.move.find(([below]) => roll < below)?.[1] ?? 0
    const pick = name => random() < settings[name]
    segments.push({ frames, input: { move, jump: pick('jump'), climb: pick('climb'), crouch: pick('crouch'), drop: pick('drop'),
      descend: pick('descend'), reach: pick('reach'), use: pick('use') } })
  }
  return segments
}

/** Every built-in level gets both explore profiles; recorded medal routes are added
 * for levels that have one. Routes traverse ropes, water, props and mechanisms. */
export function goldenScripts(game) {
  const catalog = JSON.parse(readFileSync(new URL('index.json', game.levelsRoot), 'utf8'))
  const medals = JSON.parse(readFileSync(new URL('../fixtures/jumping-builtin-medal-runs.json', import.meta.url), 'utf8'))
  const routes = new Map(medals.runs.map(run => [run.file, run.trace]))
  return catalog.levels.flatMap(file => [
    ...Object.keys(PROFILES).map(profile => ({ key: `${file}|${profile}`, file, script: exploreScript(file, profile) })),
    ...routes.has(file) ? [{ key: `${file}|medal-route`, file, script: routes.get(file) }] : [],
  ])
}

const optional = value => value ?? null
function actor(p) {
  if (!p) return null
  const { jumpLift: lift, wallJump, sliding, wallBrace: brace, hang, mantle, climbing: climb } = p
  return [p.x, p.y, p.vx, p.vy, p.facing, p.grounded, p.groundAngle, p.coyote, p.buffer, optional(p.jumpStrength), p.jumpHeld,
    lift && [lift.elapsed, lift.strength, lift.entrySpeed, lift.extraSpeed, lift.fresh],
    p.grabCooldown, p.ladderJumpGrace, p.wallJumpBuffer, wallJump && [wallJump.direction, wallJump.time],
    p.crouching, p.crouch, p.reach, !!p.inverted, optional(p.gravity), optional(p.swimAcceleration), !!p.waterJump, !!p.waterPushOff,
    sliding && [sliding.active, sliding.angle, sliding.time],
    brace && [brace.active, brace.wallX, optional(brace.wallY), brace.direction],
    hang && [hang.platform, hang.side, hang.edgeX, hang.edgeY, hang.time, hang.queued, hang.braced, !!hang.dropLocked, !!hang.upLocked],
    mantle && [mantle.edgeX, mantle.edgeY, mantle.side, mantle.toX, mantle.toY, mantle.time, mantle.braced, optional(mantle.platform), !!mantle.returning, !!mantle.crouched],
    climb && [climb.kind, climb.index, climb.distance, climb.time, climb.direction, climb.swing, climb.swingVelocity],
    p.pushing && [p.pushing.direction, optional(p.pushing.colliderId)],
    p.shove && [p.shove.time, p.shove.windup, p.shove.direction, p.shove.struck], optional(p.stagger),
    p.heldTool && [p.heldTool.kind, p.heldTool.angle, p.heldTool.aiming],
    p.releaseTurn && [p.releaseTurn.angle, p.releaseTurn.target],
    p.spawnX, p.spawnY, p.checkpoint,
    (p.ropes ?? []).map(rope => [rope.pumpInput, rope.nodes.map(n => [n.x, n.y, n.oldX, n.oldY])])]
}

/** The state that determines future motion. Presentation blends are excluded so
 * that moving animation out of the fixed step cannot change this hash. */
export function physicsProjection(run) {
  const g = run.gadgets
  return [actor(run.player),
    run.props.map(b => [b.x, b.y, b.vx, b.vy, b.angle, b.angularVelocity, b.grounded, optional(b.gravity), optional(b.waterImmersion), optional(b.gadgetCooldown)]),
    run.robots.map(r => [r.x, r.y, r.vx, r.angle, r.facing, r.phase, r.time, r.seesPlayer, optional(r.recoilVx), optional(r.fallVelocity),
      !!r.deactivated, optional(r.aim), optional(r.shots), optional(r.rams), actor(r.actor)]),
    run.mechanisms.map(m => [m.x, m.y, m.direction, m.wait, m.active, m.safetyHold]),
    run.triggers.map(t => [t.held, t.pressed, t.active]),
    run.forceFields.map(f => [f.active, f.pending]), run.floatSwitches.map(f => [f.raised, f.active]),
    run.water.pools.map(pool => [pool.level, pool.pending, pool.rise]),
    [g.held ? run.props.indexOf(g.held) : -1, g.aiming, g.angle, g.blocked, g.shots, g.serial, g.bolts.map(b => [...b.position, ...b.direction, b.remaining])],
    run.pickups.map(pickup => pickup.collectedAge),
    [run.elapsed, run.activeTime, run.pickupTime, run.coinsCollected, run.timeStopRemaining, run.timeFastRemaining, run.empRemaining,
      run.goalLit, run.goalElapsed, run.exit && [run.exit.elapsed, run.exit.fromX, run.exit.toX], run.finished, run.grade, run.failed, run.started]]
}

// Authored and derived geometry never changes during a run; it is replaced by
// a marker instead of being serialized every tick.
const SKIPPED = new Set(['level', 'terrain', 'platforms', 'waterSpaces', 'gravityField'])
/** Every mutable value reachable from the run, with shared references numbered. */
export function stateProjection(run, statics) {
  const seen = new Map()
  return JSON.stringify(run, function (key, value) {
    if (SKIPPED.has(key) || typeof value === 'function') return undefined
    if (!value || typeof value !== 'object') return value
    if (statics.has(value)) return '§'
    if (seen.has(value)) return `^${seen.get(value)}`
    seen.set(value, seen.size)
    if (value instanceof Map) return { map: [...value].map(([k, v]) => [k && typeof k === 'object' ? (statics.has(k) ? '§' : '^object') : k, v]) }
    if (value instanceof Set) return { set: value.size }
    if (ArrayBuffer.isView(value)) return { typed: Array.from(value) }
    return value
  })
}
function staticObjects(run) {
  const statics = new WeakSet()
  const mark = value => {
    if (!value || typeof value !== 'object' || statics.has(value)) return
    statics.add(value)
    for (const key in value) mark(value[key])
  }
  mark(run.level); mark(run.terrain)
  return statics
}

/** Replay one script, returning checkpoint hashes for the requested kinds.
 * `onTick` receives the projections for printing per-tick values. */
export function traceScript(game, file, script, { kinds = KINDS, onTick } = {}) {
  const level = game.parseLevel(JSON.parse(readFileSync(new URL(file, game.levelsRoot), 'utf8')))
  const run = game.createRun(level)
  game.stepRun(run, game.NEUTRAL_INPUT, game.entranceDuration(run.entrance))
  const statics = staticObjects(run)
  const hashes = Object.fromEntries(kinds.map(kind => [kind, createHash('sha256')]))
  const checkpoints = Object.fromEntries(kinds.map(kind => [kind, []]))
  let tick = 0
  const checkpoint = () => { for (const kind of kinds) checkpoints[kind].push(hashes[kind].copy().digest('hex').slice(0, 16)) }
  for (const { frames, input } of script) {
    const controls = { ...game.NEUTRAL_INPUT, ...input }
    for (let frame = 0; frame < frames && !run.finished; frame++) {
      game.stepRun(run, controls)
      const values = {}
      if (hashes.physics) values.physics = JSON.stringify(physicsProjection(run))
      if (hashes.state) values.state = stateProjection(run, statics)
      if (hashes.pose && tick % POSE_EVERY === 0) {
        values.pose = JSON.stringify([game.presentedAthletePose(run.player), ...run.robots.map(r => r.actor ? game.presentedAthletePose(r.actor) : null)])
      }
      for (const kind of kinds) if (values[kind] !== undefined) hashes[kind].update(`${tick}:${values[kind]}\n`)
      onTick?.(tick, values)
      if (++tick % CHECKPOINT === 0) checkpoint()
    }
  }
  if (tick % CHECKPOINT) checkpoint()
  return { ticks: tick, finished: run.finished, ...checkpoints }
}

export function readGolden() {
  return JSON.parse(readFileSync(FIXTURE, 'utf8'))
}

/** First differing checkpoint per kind, in seconds of gameplay, or null when equal. */
export function compareTrace(expected, actual, kinds = KINDS) {
  const problems = []
  if (expected.ticks !== actual.ticks) problems.push(`ran ${actual.ticks} ticks instead of ${expected.ticks}`)
  for (const kind of kinds) {
    const index = expected[kind].findIndex((hash, i) => hash !== actual[kind][i])
    if (index >= 0) problems.push(`${kind} diverged by ${(Math.min(expected.ticks, (index + 1) * CHECKPOINT) / 120).toFixed(1)} s`)
  }
  return problems.length ? problems.join('; ') : null
}

/** Replay the selected traces on worker threads, preserving the selected order. */
export async function runTraces({ keys, kinds = KINDS, source, jobs } = {}) {
  const { Worker } = await import('node:worker_threads')
  const { availableParallelism } = await import('node:os')
  const game = await loadGame(source)
  const selected = goldenScripts(game).filter(entry => !keys || keys.includes(entry.key))
  // Longest scripts first keeps the workers evenly loaded.
  const length = entry => entry.script.reduce((sum, segment) => sum + segment.frames, 0)
  const queue = selected.toSorted((a, b) => length(b) - length(a)).map(entry => entry.key)
  const results = new Map(), count = Math.max(1, Math.min(jobs ?? availableParallelism() - 1, queue.length))
  await Promise.all(Array.from({ length: count }, () => new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./jumping-golden-worker.mjs', import.meta.url), { workerData: { kinds, source: source && String(source) } })
    const next = () => queue.length ? worker.postMessage(queue.shift()) : worker.terminate().then(resolve)
    worker.on('message', ({ key, result, error }) => {
      if (error) { worker.terminate(); reject(new Error(`${key}: ${error}`)); return }
      results.set(key, result); next()
    })
    worker.on('error', reject)
    worker.once('online', next)
  })))
  return selected.map(entry => ({ key: entry.key, ...results.get(entry.key) }))
}
