// Zero g object lab: scripted interactions between a weightless player and floating props, measured headlessly.
// Evidence for reviewing how props and the player behave together without weight (docs/jumping-zero-g-objects.md).
//
//   node scripts/zero-g-lab.mjs                 every scenario, a table of measurements
//   node scripts/zero-g-lab.mjs --json out.json  also write the measurements as JSON
//   node scripts/zero-g-lab.mjs --only push      scenarios whose name contains "push"
//   node scripts/zero-g-lab.mjs --trace bump     print the scenario's state every 6 ticks
//
// Scenarios place the player directly (weightless, mid-air) so each interaction starts the same way every time;
// scripts/zero-g-filmstrip.mjs draws comparable scenes from fresh starts with ordinary inputs. Step costs are
// wall-clock times for this process: compare runs made together on one machine, not figures from different days.
import { readFile, writeFile } from 'node:fs/promises'
import { performance } from 'node:perf_hooks'
import { createRun, stepRun } from '../tests/helpers/jumping-active-run.mjs'
import { blankTrial, parseLevel } from '../src/games/jumping/level.ts'
import { NEUTRAL_INPUT, STEP } from '../src/games/jumping/model.ts'
import { athletePose } from '../src/games/jumping/athlete.ts'
import { wallFrameAngle } from '../src/games/jumping/wallFrame.ts'
import { boxShape } from '../src/games/jumping/propGeometry.ts'
import { polygonPoints, pointInside } from '../src/games/jumping/geometry.ts'
import { HEAD_RADIUS } from '../src/games/jumping/athleteRig.ts'

const args = process.argv.slice(2)
const option = name => { const at = args.indexOf(name); return at < 0 ? undefined : args[at + 1] }
const only = option('--only'), traced = option('--trace'), jsonOut = option('--json')

/** A weightless room 1800 x 920 with the given props; a prop's `vx`/`vy` set it moving (levels cannot). */
function room(props, gravity = 0) {
  const run = createRun(parseLevel({ ...blankTrial(), entrance: { x: 160, y: 920 }, props: props.map(({ vx, vy, ...rest }) => rest),
    gravityPlates: [{ id: 'z', x: 0, y: 0, w: 1800, h: 920, gravity, power: 'always' }] }))
  run.started = true
  props.forEach(({ vx = 0, vy = 0 }, i) => Object.assign(run.props[i], { vx, vy }))
  return run
}
const SIZE = { ball: 68, box: 80 }
/** A prop centred on (x, y). */
const prop = (kind, x, y, extra = {}) => ({ kind, x, y: y + SIZE[kind] / 2, size: SIZE[kind], ...extra })
/** The player's middle sits this far above its feet. */
const MIDDLE = 31
/** Place the player weightless in mid-air, settled. */
function float(run, x, y, vx = 0, vy = 0) {
  Object.assign(run.player, { x, y, vx, vy, grounded: false, weightless: 1 })
}
/** Drawn joints in the world: head, shoulder, hip, both hands, both feet. */
function joints(p) {
  const pose = athletePose(p), angle = wallFrameAngle(p.wall), c = Math.cos(angle), s = Math.sin(angle)
  return [pose.head, pose.shoulder, pose.hip, pose.frontArm.end, pose.backArm.end, pose.frontLeg.end, pose.backLeg.end].map(([x, y]) => {
    const lx = x * p.facing, ly = y * (p.inverted ? -1 : 1)
    return [p.x + lx * c - ly * s, p.y + lx * s + ly * c]
  })
}
/** Distance from a point to a prop's surface: positive outside, negative inside. */
function surfaceGap(b, [x, y]) {
  if (b.kind === 'ball') return Math.hypot(x - b.x, y - (b.y - b.size / 2)) - b.size / 2
  const points = polygonPoints(boxShape(b))
  let best = Infinity
  for (let i = 0; i < points.length; i++) {
    const [ax, ay] = points[i], [bx, by] = points[(i + 1) % points.length], dx = bx - ax, dy = by - ay
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy)))
    best = Math.min(best, Math.hypot(x - ax - dx * t, y - ay - dy * t))
  }
  return pointInside(boxShape(b), x, y) ? -best : best
}
const speed = o => Math.hypot(o.vx, o.vy)
/** The body itself against the prop (a body contact or footing on it), not hands reaching for it. */
const touching = (p, b) => !!p.contacts?.body?.some(c => c.collider.prop === b && !c.kick) || p.contacts?.support?.collider.prop === b

/** Step `run` through `phases` ([frames, input]...), recording step times, the worst one-frame joint jump and, each tick,
 * `each(tick, run)`. */
function play(name, run, phases, each) {
  const times = [], p = run.player
  // The drawn body's axis (hip to head) turning: its fastest turn (deg/s, over a tenth of a second) and when.
  let previous = null, worstJump = 0, worstTick = 0, tick = 0, axis = null, fastestTurn = 0, fastestTurnTick = 0
  const turns = []
  for (const [frames, input] of phases) for (let f = 0; f < frames; f++, tick++) {
    const start = performance.now()
    stepRun(run, { ...NEUTRAL_INPUT, ...input })
    times.push(performance.now() - start)
    const now = joints(p).map(([x, y]) => [x - p.x, y - p.y])
    // A change of facing swaps which arm and leg are drawn in front without moving anything: compare limbs either way round.
    const moved = (order) => Math.max(...now.map(([x, y], k) => Math.hypot(x - previous[order[k]][0], y - previous[order[k]][1])))
    const jump = previous ? Math.min(moved([0, 1, 2, 3, 4, 5, 6]), moved([0, 1, 2, 4, 3, 6, 5])) : 0
    if (jump > worstJump) { worstJump = jump; worstTick = tick }
    const [head, , hip] = now, angle = Math.atan2(head[1] - hip[1], head[0] - hip[0])
    if (axis !== null) turns.push(Math.atan2(Math.sin(angle - axis), Math.cos(angle - axis)))
    axis = angle
    if (turns.length >= 12) {
      const rate = Math.abs(turns.slice(-12).reduce((a, b) => a + b, 0)) / (12 * STEP) * 180 / Math.PI
      if (rate > fastestTurn) { fastestTurn = rate; fastestTurnTick = tick }
    }
    previous = now
    each?.(tick, run)
    if (traced && name.includes(traced) && tick % 6 === 0) console.log(`${name} t${tick} p(${p.x.toFixed(1)},${p.y.toFixed(1)} v${p.vx.toFixed(0)},${p.vy.toFixed(0)}${p.grounded ? ' G' : ''}${p.wall ? ' ' + p.wall : ''}) `
      + run.props.map(b => `${b.kind}(${b.x.toFixed(1)},${b.y.toFixed(1)} v${b.vx.toFixed(0)},${b.vy.toFixed(0)}${b.grounded ? ' G' : ''})`).join(' '))
  }
  times.sort((a, b) => a - b)
  return { stepMedianMs: +times[times.length >> 1].toFixed(3), stepP95Ms: +times[Math.floor(times.length * .95)].toFixed(3), worstJointJump: +worstJump.toFixed(1), worstJumpTick: worstTick, fastestTurnDegPerS: Math.round(fastestTurn), fastestTurnTick }
}

/** The drawn part nearest a prop's surface, and the gaps of the head (its skull's edge), hands and feet. */
function nearestPart(p, b) {
  const [head, , hip, front, back, frontFoot, backFoot] = joints(p)
  const gaps = { head: surfaceGap(b, head) - HEAD_RADIUS, hands: Math.min(surfaceGap(b, front), surfaceGap(b, back)),
    feet: Math.min(surfaceGap(b, frontFoot), surfaceGap(b, backFoot)), hips: surfaceGap(b, hip) }
  return { part: Object.entries(gaps).sort((a, c) => a[1] - c[1])[0][0], gaps }
}
/** Contact episodes, the part that leads each one (nearest the prop as it starts), the hands' and head's distance
 * from the prop while the body touches it (negative: drawn inside it). */
function contactWatch(run, b) {
  const p = run.player, gaps = [], leads = {}
  let episodes = 0, was = false, ticks = 0, headDeepest = Infinity
  return {
    each() {
      const now = touching(p, b)
      if (now) {
        const near = nearestPart(p, b)
        if (!was) { episodes++; leads[near.part] = (leads[near.part] ?? 0) + 1 }
        ticks++; gaps.push(near.gaps.hands); headDeepest = Math.min(headDeepest, near.gaps.head)
      }
      was = now
    },
    result: () => ({ contactEpisodes: episodes, contactTicks: ticks, leadingParts: leads,
      handGapMean: gaps.length ? +(gaps.reduce((a, g) => a + g, 0) / gaps.length).toFixed(1) : null,
      handGapWorst: gaps.length ? +Math.max(...gaps).toFixed(1) : null,
      headGapLeast: Number.isFinite(headDeepest) ? +headDeepest.toFixed(1) : null }),
  }
}

const scenarios = {
  /** Thrust into a resting ball for half a second, then coast: the bump, what each body keeps, and how far the ball runs. */
  'bump ball'() {
    const run = room([prop('ball', 700, 560 - MIDDLE)]), b = run.props[0], p = run.player
    float(run, 560, 560)
    let hit = null, after = null
    const watch = contactWatch(run, b)
    const stats = play('bump ball', run, [[110, { move: 1 }], [360, {}]], tick => {
      watch.each()
      if (hit === null && touching(p, b)) hit = tick
      if (hit !== null && tick === hit + 12) after = { player: +speed(p).toFixed(0), prop: +speed(b).toFixed(0) }
    })
    return { ...stats, ...watch.result(), contactTick: hit, after, propSpeedAtEnd: +speed(b).toFixed(1), playerSpeedAtEnd: +speed(p).toFixed(1) }
  },
  /** Hold thrust into a ball for three seconds: one sustained push or a string of bumps, and where the hands are. */
  'push ball'() {
    const run = room([prop('ball', 700, 560 - MIDDLE)]), b = run.props[0], p = run.player
    float(run, 560, 560)
    const watch = contactWatch(run, b), gaps = []
    const stats = play('push ball', run, [[360, { move: 1 }]], tick => { watch.each(); if (tick > 120) gaps.push(b.x - b.size / 2 - p.x) })
    const mean = gaps.reduce((a, g) => a + g, 0) / gaps.length
    return { ...stats, ...watch.result(), propSpeedAtEnd: +speed(b).toFixed(0), playerSpeedAtEnd: +speed(p).toFixed(0),
      separationSpread: +Math.sqrt(gaps.reduce((a, g) => a + (g - mean) ** 2, 0) / gaps.length).toFixed(1) }
  },
  /** The same push against a box. */
  'push box'() {
    const run = room([prop('box', 700, 560 - MIDDLE)]), b = run.props[0], p = run.player
    float(run, 560, 560)
    const watch = contactWatch(run, b)
    const stats = play('push box', run, [[360, { move: 1 }]], watch.each)
    return { ...stats, ...watch.result(), propSpeedAtEnd: +speed(b).toFixed(0), playerSpeedAtEnd: +speed(p).toFixed(0), boxSpin: +b.angularVelocity.toFixed(2) }
  },
  /** Up held into a box floating overhead, and a diagonal thrust (right and up) into a ball: one push with the palms on
   * it, or bumps with the head? */
  ...Object.fromEntries([['push box overhead', 'box', 560, 560 - 62 - 60, { climb: true }], ['push ball diagonal', 'ball', 660, 560 - MIDDLE - 70, { move: 1, climb: true }]]
    .map(([name, kind, x, y, input]) => [name, () => {
      const run = room([prop(kind, x, y)]), b = run.props[0], p = run.player
      float(run, 560, 560)
      const watch = contactWatch(run, b)
      const stats = play(name, run, [[360, input]], watch.each)
      return { ...stats, ...watch.result(), propSpeedAtEnd: +speed(b).toFixed(0), playerSpeedAtEnd: +speed(p).toFixed(0) }
    }])),
  /** Up into a box overhead for a second, then let go and coast, then jump: does the body drift clear on its hands or ride
   * under the box on its head, and does the jump push the box away? */
  'overhead release'() {
    const run = room([prop('box', 560, 560 - 62 - 60)]), b = run.props[0], p = run.player
    float(run, 560, 560)
    const watch = contactWatch(run, b)
    let headLeastAfter = Infinity, before = null
    const stats = play('overhead release', run, [[120, { climb: true }], [240, {}], [6, { jump: true }], [60, {}]], tick => {
      watch.each()
      if (tick >= 140 && tick < 360 && touching(p, b)) headLeastAfter = Math.min(headLeastAfter, nearestPart(p, b).gaps.head)
      if (tick === 359) before = { player: p.vy, prop: b.vy }
    })
    return { ...stats, ...watch.result(), headLeastAfterRelease: Number.isFinite(headLeastAfter) ? +headLeastAfter.toFixed(1) : null,
      jumpPlayerDeltaV: +(p.vy - before.player).toFixed(0), jumpPropDeltaV: +(b.vy - before.prop).toFixed(0) }
  },
  /** A ball thrown at a wall at 300: what comes back, whether it slides on, and when it is still. */
  'ball at wall'() {
    const run = room([prop('ball', 1500, 400, { vx: 300, vy: -40 })]), b = run.props[0]
    float(run, 300, 600)
    let hit = null, rebound = null, rest = null
    const stats = play('ball at wall', run, [[600, {}]], tick => {
      if (hit === null && b.x > 1800 - b.size / 2 - 1) hit = tick
      if (hit !== null && tick === hit + 12) rebound = { vx: +b.vx.toFixed(0), vy: +b.vy.toFixed(0) }
      if (rest === null && hit !== null && speed(b) < 3) rest = +((tick - hit) * STEP).toFixed(2)
    })
    return { ...stats, rebound, secondsToRestAfterHit: rest, speedAtEnd: +speed(b).toFixed(1) }
  },
  /** A box thrown at a wall at 300. */
  'box at wall'() {
    const run = room([prop('box', 1500, 400, { vx: 300, vy: -40 })]), b = run.props[0]
    float(run, 300, 600)
    let hit = null, rebound = null
    const stats = play('box at wall', run, [[600, {}]], tick => {
      if (hit === null && b.x > 1800 - b.size * .75) hit = tick
      if (hit !== null && tick === hit + 12) rebound = { vx: +b.vx.toFixed(0), vy: +b.vy.toFixed(0), spin: +b.angularVelocity.toFixed(2) }
    })
    return { ...stats, rebound, speedAtEnd: +speed(b).toFixed(1) }
  },
  /** A ball at 250 into a resting ball. */
  'ball into ball'() {
    const run = room([prop('ball', 600, 500, { vx: 250 }), prop('ball', 900, 500)]), [a, b] = run.props
    float(run, 300, 800)
    let hit = null, after = null
    const stats = play('ball into ball', run, [[300, {}]], tick => {
      if (hit === null && b.vx > 1) hit = tick
      if (hit !== null && tick === hit + 12) after = { mover: +a.vx.toFixed(0), struck: +b.vx.toFixed(0) }
    })
    return { ...stats, after }
  },
  /** A slow ball drifting at 8 across the room: does it carry on, slow, or stop dead? */
  'slow drift'() {
    const run = room([prop('ball', 600, 500, { vx: 8 })]), b = run.props[0]
    float(run, 300, 800)
    let stopped = null
    const stats = play('slow drift', run, [[600, {}]], tick => { if (stopped === null && speed(b) < .01) stopped = +(tick * STEP).toFixed(2) })
    return { ...stats, stoppedAt: stopped, travelled: +(b.x - 600).toFixed(1) }
  },
  ...Object.fromEntries(['box', 'ball'].flatMap(kind => [60, 250].map(arrival => [`land ${arrival} on ${kind}`, () => {
    // Drift feet-first down onto a floating prop; stand for a second.
    const run = room([prop(kind, 900, 600)]), b = run.props[0], p = run.player
    float(run, 900, 600 - SIZE[kind] / 2 - 60, 0, arrival)
    let landed = null, deepest = 0
    const stats = play(`land ${arrival} on ${kind}`, run, [[240, {}]], tick => {
      if (landed === null && p.grounded && p.contacts?.support?.collider.prop === b) landed = tick
      deepest = Math.max(deepest, p.crouch)
    })
    return { ...stats, landedTick: landed, standingAtEnd: p.grounded && p.contacts?.support?.collider.prop === b, deepestCrouch: +deepest.toFixed(2),
      playerVy: +p.vy.toFixed(0), propVy: +b.vy.toFixed(0), separation: +(b.y - SIZE[kind] - p.y).toFixed(1) }
  }]))),
  ...Object.fromEntries(['box', 'ball'].map(kind => [`push off ${kind}`, () => {
    // Settle standing on a floating prop, then jump: what the prop gets back.
    const run = room([prop(kind, 900, 600)]), b = run.props[0], p = run.player
    float(run, 900, 600 - SIZE[kind] / 2 - 4, 0, 20)
    play(`push off ${kind}`, run, [[120, {}]])
    const before = { player: p.vy, prop: b.vy }, standing = p.grounded
    const stats = play(`push off ${kind}`, run, [[6, { jump: true }], [60, {}]])
    return { ...stats, wasStanding: standing, playerDeltaV: +(p.vy - before.player).toFixed(0), propDeltaV: +(b.vy - before.prop).toFixed(0) }
  }])),
}

/** The scenario level from the user (Untitled level 2), flown through with thrust, in zero g and with the plate turned to
 * negative g, for step costs side by side. */
async function levelCost() {
  const source = JSON.parse(await readFile(new URL('../public/levels/jumping/Untitled level 2.jump-level.json', import.meta.url), 'utf8'))
  const result = {}
  for (const [label, gravity] of [['zero g', 0], ['negative g', -1]]) {
    const level = structuredClone(source); level.gravityPlates[0].gravity = gravity
    const run = createRun(parseLevel(level))
    result[label] = play(`level ${label}`, run, [[240, { move: 1, climb: true }], [600, { move: 1 }], [360, { move: -1, descend: true }], [600, {}]])
  }
  return result
}

const results = {}
for (const [name, scenario] of Object.entries(scenarios)) if (!only || name.includes(only)) results[name] = scenario()
if (!only || 'level cost'.includes(only)) results['level cost'] = await levelCost()
for (const [name, result] of Object.entries(results)) console.log(`${name.padEnd(18)} ${JSON.stringify(result)}`)
if (jsonOut) await writeFile(jsonOut, JSON.stringify(results, null, 2))
