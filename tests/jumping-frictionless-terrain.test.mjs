import test from 'node:test'
import assert from 'node:assert/strict'
import { blankTrial, parseLevel } from '../src/games/jumping/level.ts'
import { createRun, stepRun } from './helpers/jumping-active-run.mjs'
import { NEUTRAL_INPUT } from '../src/games/jumping/model.ts'
import { canGrip, FRICTIONLESS, groundVelocity, SLICK, slipRests, slidingVelocity } from '../src/games/jumping/friction.ts'

const steps = (run, frames, input = NEUTRAL_INPUT) => { for (let i = 0; i < frames; i++) stepRun(run, input) }
const RIGHT = { ...NEUTRAL_INPUT, move: 1 }

/** A slab 40 high on the floor, its top at y 880, and a ramp rising 220 over 400 to the right of it. */
function rink({ slab = true, ramp = true, frictionless = true, props = [] } = {}) {
  const level = blankTrial()
  level.entrance = { x: 400, y: 880 }
  level.platforms = [
    ...slab ? [{ x: 200, y: 880, w: 700, h: 40, ...frictionless ? { frictionless: true } : {} }] : [],
    ...ramp ? [{ x: 1000, y: 700, w: 400, h: 220, polygon: [[0, 220], [400, 0], [400, 220]], ...frictionless ? { frictionless: true } : {} }] : [],
  ]
  level.props = props
  return parseLevel(level)
}

test('frictionless files accept only `frictionless: true`', () => {
  const level = blankTrial()
  level.platforms = [{ x: 200, y: 880, w: 400, h: 40, frictionless: true }]
  assert.equal(parseLevel(level).platforms[0].frictionless, true)
  for (const value of [false, 'yes', 1]) {
    level.platforms[0].frictionless = value
    assert.throws(() => parseLevel(level))
  }
})

test('zero grip neither drives nor brakes, and only exact level ground holds still', () => {
  assert.equal(groundVelocity(0, 200, 0, 2000, 1 / 60, FRICTIONLESS), 0)
  assert.equal(groundVelocity(150, 0, 0, 2000, 1 / 60, FRICTIONLESS), 150)
  assert.equal(canGrip(0, FRICTIONLESS), true)
  assert.equal(canGrip(.05, FRICTIONLESS), false)
  assert.equal(canGrip(.05), true)
  // Gravity alone acts along a slick slope.
  const g = 2000, angle = .3
  assert.ok(Math.abs(slidingVelocity(100, angle, g, .01, FRICTIONLESS) - (100 + g * Math.sin(angle) * .01)) < 1e-9)
})

test('ice holds level feet and slides any real slope, and a slide comes to rest on the level', () => {
  assert.equal(canGrip(0, SLICK), true)
  assert.equal(canGrip(.05, SLICK), true, 'a hair of a slope still holds')
  assert.equal(canGrip(.2, SLICK), false)
  assert.equal(slipRests(0, SLICK), true, 'a slide ends on level ice')
  assert.equal(slipRests(.2, SLICK), false)
})

test('on ice the player walks off a standstill slowly', () => {
  const run = createRun(rink({ ramp: false })); run.started = true
  const start = run.player.x
  steps(run, 30, RIGHT) // a quarter second
  assert.equal(run.player.grounded, true)
  const moved = run.player.x - start, speed = run.player.vx
  assert.ok(moved > 2, `it moves off (${moved.toFixed(1)})`)
  assert.ok(speed > 20 && speed < 80, `and builds speed slowly (${speed.toFixed(0)} after 0.25 s)`)
  const grippy = createRun(rink({ ramp: false, frictionless: false })); grippy.started = true
  steps(grippy, 30, RIGHT)
  assert.ok(grippy.player.vx > speed * 3, 'ordinary ground gets going far sooner')
})

test('on ice getting moving is as hard as stopping, whether the player brakes or lets go', () => {
  // From a standstill, the speed a held direction builds in half a second...
  const start = createRun(rink({ ramp: false })); start.started = true
  steps(start, 5); steps(start, 60, RIGHT)
  const gained = start.player.vx
  // ...is the speed that half a second takes off a glide, let go or braking against it.
  for (const input of [NEUTRAL_INPUT, { ...NEUTRAL_INPUT, move: -1 }]) {
    const run = createRun(rink({ ramp: false })); run.started = true
    steps(run, 5); run.player.vx = 200
    steps(run, 60, input)
    assert.equal(run.player.grounded, true)
    const lost = 200 - run.player.vx
    assert.ok(Math.abs(lost - gained) < 3, `${input.move ? 'braking' : 'letting go'} took off ${lost.toFixed(0)}; starting gained ${gained.toFixed(0)}`)
  }
  assert.ok(gained > 40 && gained < 160, `both are slow (${gained.toFixed(0)} in half a second)`)
  const brake = createRun(rink({ ramp: false })); brake.started = true
  steps(brake, 5); brake.player.vx = 100
  steps(brake, 120, { ...NEUTRAL_INPUT, move: -1 })
  assert.ok(brake.player.vx < 0, 'held against the glide, it stops and then walks back')
  // Ordinary ground stops the same glide almost at once.
  const grippy = createRun(rink({ ramp: false, frictionless: false })); grippy.started = true
  steps(grippy, 5); grippy.player.vx = 120; steps(grippy, 60)
  assert.equal(grippy.player.vx, 0)
})

test('a slope that holds ordinary feet slides the player down when it is frictionless', () => {
  for (const frictionless of [false, true]) {
    const level = rink({ slab: false, frictionless })
    level.entrance = { x: 1250, y: 920 - 220 * 250 / 400 }
    const run = createRun(level); run.started = true
    const start = run.player.x
    steps(run, 90)
    if (frictionless) assert.ok(start - run.player.x > 60, `slid ${start - run.player.x}`)
    else assert.ok(Math.abs(run.player.x - start) < 1, `held ${run.player.x - start}`)
  }
})

test('a box rests on an ordinary slope and glides down a frictionless one', () => {
  for (const frictionless of [false, true]) {
    const x = 1250, y = 920 - 220 * 250 / 400
    const run = createRun(rink({ slab: false, frictionless, props: [{ kind: 'box', x, y: y - 20, size: 40 }] })); run.started = true
    run.player.x = 100
    steps(run, 120)
    const moved = x - run.props[0].x
    if (frictionless) assert.ok(moved > 80, `slid ${moved}`)
    else assert.ok(Math.abs(moved) < 25, `settled in place ${moved}`)
  }
})

test('a player on ice pushes a box with its hands on it, the pair gathering speed only as fast as the ice grips the feet', () => {
  const run = createRun(rink({ ramp: false, props: [{ kind: 'box', x: 442, y: 880, size: 40 }] })); run.started = true
  let stance = 0
  for (let i = 0; i < 120; i++) { stepRun(run, RIGHT); if (run.player.contacts?.push && !run.player.contacts.push.passive) stance++ }
  assert.ok(stance > 90, `the hands work on the box (${stance} of 120 ticks)`)
  const box = run.props[0]
  assert.ok(box.vx > 20, `the box gets going (${box.vx.toFixed(0)})`)
  assert.ok(box.vx < SLICK.sliding * 1550 * 1.1, `but no faster than feet on ice can push it in a second (${box.vx.toFixed(0)})`)
  assert.ok(Math.abs(run.player.vx - box.vx) < 15, 'and the pusher keeps pace with it')
})

test('stepping onto frictionless ground behind a pushed box lets it glide on', () => {
  const level = blankTrial()
  level.entrance = { x: 420, y: 880 }
  level.platforms = [{ x: 300, y: 880, w: 300, h: 40 }, { x: 600, y: 880, w: 900, h: 40, frictionless: true }]
  level.props = [{ kind: 'box', x: 540, y: 880, size: 40 }]
  const run = createRun(parseLevel(level)); run.started = true
  // Push from the grippy pad and keep holding the direction past its edge.
  steps(run, 230, RIGHT)
  const box = run.props[0]
  assert.ok(run.player.x > 600, 'the pusher has stepped onto the slick floor')
  assert.ok(box.vx > 40, `the box keeps gliding at ${box.vx}`)
  const x = box.x; steps(run, 60)
  assert.ok(box.x - x > 20 && box.vx > 0, 'and keeps sliding once the push ends, slowed only by the ice')
})

test('a body gliding into a slower box shares momentum with it instead of stopping dead', () => {
  const level = blankTrial()
  level.entrance = { x: 300, y: 880 }
  level.platforms = [{ x: 200, y: 880, w: 1400, h: 40, frictionless: true }]
  level.props = [{ kind: 'box', x: 600, y: 880, size: 40 }]
  const run = createRun(parseLevel(level)); run.started = true
  const p = run.player, box = run.props[0]
  p.vx = 400; box.vx = 100
  // Ice slows the glider, so it starts close behind the box; the speeds are read just after the hit.
  p.x = 520
  for (let i = 0; i < 160 && box.vx < 150; i++) stepRun(run, NEUTRAL_INPUT)
  steps(run, 3)
  assert.ok(box.vx > 150, `the box was struck on to ${box.vx}`)
  assert.ok(p.vx > 100 && p.vx <= box.vx + 1, `the glider follows at ${p.vx}`)
})

test('on ice, letting go stops the stride and the player glides on planted feet; any held direction moves the legs', () => {
  const run = createRun(rink({ ramp: false })); run.started = true
  const p = run.player
  steps(run, 5); p.vx = 300
  steps(run, 40, RIGHT)
  assert.ok((p.anim.gait?.moving ?? 0) > .8, 'holding the way it moves, it runs')
  steps(run, 40)
  assert.ok(p.vx > 150, `let go, it is still gliding at ${p.vx.toFixed(0)}`)
  assert.ok((p.anim.gait?.moving ?? 1) < .05, `but no longer strides (moving ${p.anim.gait?.moving?.toFixed(2)})`)
  assert.equal(p.anim.footwork?.moving, false, 'its feet are carried along, not stepping')
  steps(run, 30, { ...NEUTRAL_INPUT, move: -1 })
  assert.ok(p.vx > 0, 'braking against the glide, it is still sliding the other way')
  assert.ok((p.anim.gait?.moving ?? 0) > .5, `but its legs work against it (moving ${p.anim.gait?.moving?.toFixed(2)})`)
})

test('on ice, a held direction moves the legs at once, however slowly the body gets going, and on a slick slope too', () => {
  const run = createRun(rink({ ramp: false })); run.started = true
  const p = run.player
  steps(run, 5); steps(run, 24, RIGHT) // a fifth of a second
  assert.ok(Math.abs(p.vx) < 60, `the body is barely moving (${p.vx.toFixed(0)})`)
  assert.ok((p.anim.gait?.moving ?? 0) > .8, 'but the legs are already stepping')
  assert.ok((p.anim.gait?.run ?? 1) < .2, 'at a walking pace, not a sprint')
  // On a slick slope it slides, and a held direction keeps the feet stepping.
  const level = rink({ slab: false })
  level.entrance = { x: 1250, y: 920 - 220 * 250 / 400 }
  const slope = createRun(level); slope.started = true
  const q = slope.player
  steps(slope, 30)
  assert.ok(q.sliding?.active && !q.anim.scrabble, 'let go, it slides without stepping')
  const phases = []
  for (let i = 0; i < 30; i++) { stepRun(slope, RIGHT); phases.push(q.anim.scrabble?.phase ?? 0) }
  assert.ok(q.sliding?.active, 'holding up the slope, it still slides')
  assert.ok((q.anim.scrabble?.amount ?? 0) > .9, 'with its feet scrabbling')
  assert.ok(new Set(phases.map(phase => phase.toFixed(2))).size > 20, 'stepping all the while')
})

test('on ice, momentum carries the player partway up a slope its feet cannot climb, then it slides back down', () => {
  // Polishing Bay's shape: a grippy landing, then one slick piece that ramps down 60 over 120 and runs on level.
  const level = blankTrial()
  level.entrance = { x: 100, y: 820 }
  level.platforms = [{ x: 0, y: 820, w: 200, h: 100 },
    { x: 200, y: 820, w: 1000, h: 100, frictionless: true, polygon: [[0, 0], [120, 60], [1000, 60], [1000, 100], [0, 100]] }]
  const run = createRun(parseLevel(level)); run.started = true
  const p = run.player
  Object.assign(p, { x: 400, y: 880, vx: -400, vy: 0, facing: -1 }); stepRun(run, NEUTRAL_INPUT)
  let highest = Infinity, stoppedAtFoot = 0, cameBack = false
  for (let i = 0; i < 240; i++) {
    stepRun(run, NEUTRAL_INPUT)
    highest = Math.min(highest, p.y)
    if (p.grounded && Math.abs(p.x - 320) < 3 && Math.abs(p.vx) < 1) stoppedAtFoot++
    if (highest < 866 && p.vx > 20) cameBack = true
  }
  assert.ok(highest < 866, `it coasts up the slick slope (highest feet ${highest.toFixed(0)}, the floor is at 880)`)
  assert.ok(highest > 820, 'but cannot reach its top')
  assert.equal(stoppedAtFoot, 0, 'it never stops dead at the foot of the slope')
  assert.ok(cameBack, 'and slides back down')
})

test('on ice, boxes and balls slide with real but low friction: a long glide that slows steadily to rest', async () => {
  const { TUNING } = await import('../src/games/jumping/model.ts')
  // The same friction the player's feet meet on ice.
  const slowing = SLICK.sliding * TUNING.gravity
  for (const kind of ['box', 'ball']) {
    const level = blankTrial()
    level.width = 4000; level.entrance = { x: 100, y: 880 }
    level.platforms = [{ x: 200, y: 880, w: 3600, h: 40, frictionless: true }]
    level.props = [{ kind, x: 400, y: 880, size: 40 }]
    const run = createRun(parseLevel(level)); run.started = true
    steps(run, 30)
    const prop = run.props[0]; prop.vx = 300
    steps(run, 120) // a second
    assert.ok(Math.abs(300 - prop.vx - slowing) < 4, `${kind}: lost ${(300 - prop.vx).toFixed(0)} in a second; friction takes ${slowing.toFixed(0)}`)
    steps(run, 120 * 4)
    assert.ok(Math.abs(prop.vx) < 1, `${kind}: and it does stop (${prop.vx.toFixed(1)})`)
  }
})

/** Drawn joints relative to the body: head, shoulder, hip, hands, feet. */
const drawnJoints = async p => {
  const { athletePose } = await import('../src/games/jumping/athlete.ts')
  const q = athletePose(p)
  return [q.head, q.shoulder, q.hip, q.frontArm.end, q.backArm.end, q.frontLeg.end, q.backLeg.end]
}

test('on ice, pushing a crate from a standstill eases into the stance rather than snapping, and the legs keep stepping', async () => {
  const run = createRun(rink({ ramp: false, props: [{ kind: 'box', x: 442, y: 880, size: 40 }] })); run.started = true
  const p = run.player
  steps(run, 10)
  let previous = await drawnJoints(p), worst = 0, stepping = 0, pushing = 0
  for (let i = 0; i < 120; i++) {
    stepRun(run, RIGHT)
    const now = await drawnJoints(p)
    worst = Math.max(worst, ...now.map((q, k) => Math.hypot(q[0] - previous[k][0], q[1] - previous[k][1])))
    previous = now
    if (p.contacts?.push && !p.contacts.push.passive) { pushing++; if ((p.anim.gait?.moving ?? 0) > .5) stepping++ }
  }
  assert.ok(worst < 8, `no joint jumps more than 8 in a frame (worst ${worst.toFixed(1)})`)
  assert.ok(pushing > 90 && stepping / pushing > .8, `pushing on ice, the legs step (${stepping} of ${pushing} ticks)`)
})

test('let go of a crate on ice at speed, the player follows it in a low gliding crouch on sliding feet, rising as it slows', () => {
  const run = createRun(rink({ ramp: false, props: [{ kind: 'box', x: 442, y: 880, size: 40 }] })); run.started = true
  const p = run.player
  steps(run, 10)
  p.vx = 250; run.props[0].vx = 250
  steps(run, 30, RIGHT)
  steps(run, 30)
  assert.ok(p.vx > 150, `still sliding at ${p.vx.toFixed(0)}`)
  assert.ok((p.anim.curl ?? 0) > .8, `in the curler's glide (${(p.anim.curl ?? 0).toFixed(2)})`)
  assert.equal(p.anim.footwork?.moving, false, 'on sliding feet, not stepping')
  steps(run, 240)
  assert.ok(Math.abs(p.vx) < 1 && !(p.anim.curl > .05), 'and up out of it once the slide has stopped')
})

/** A grippy pad to x 500, then ice: a run off the pad reaches the ice at speed. */
function padRink(props = []) {
  const level = blankTrial()
  level.width = 3600
  level.entrance = { x: 300, y: 880 }
  level.goal = { x: 3500, y: 880 }
  level.platforms = [{ x: 0, y: 880, w: 500, h: 40 }, { x: 500, y: 880, w: 3100, h: 40, frictionless: true }]
  level.props = props
  const run = createRun(parseLevel(level)); run.started = true
  return run
}

test('sliding fast on ice with nothing held, from a plain run, glides in a curler stance; a held direction moves the legs at once', () => {
  const run = padRink(), p = run.player
  steps(run, 10)
  steps(run, 90, RIGHT)
  steps(run, 30)
  assert.ok(p.vx > 200 && p.contacts?.support?.platform.frictionless, `gliding on the ice at ${p.vx.toFixed(0)}`)
  assert.ok((p.anim.curl ?? 0) > .8, `in the curler's glide without a crate (${(p.anim.curl ?? 0).toFixed(2)})`)
  stepRun(run, RIGHT); stepRun(run, RIGHT)
  assert.notEqual(p.anim.footwork?.moving, false, 'pressing a direction takes the legs out of the glide on the next tick')
})

test('on ice, pressing again while the hands are still letting go picks up the pose as drawn, without a snap', async () => {
  for (const after of [3, 9, 15, 21, 24]) {
    const run = createRun(rink({ ramp: false, props: [{ kind: 'box', x: 450, y: 880, size: 40 }] })); run.started = true
    const p = run.player
    steps(run, 10)
    steps(run, 18, RIGHT)
    steps(run, after)
    let previous = await drawnJoints(p), worst = 0
    for (let i = 0; i < 30; i++) {
      stepRun(run, RIGHT)
      const now = await drawnJoints(p)
      worst = Math.max(worst, ...now.map((q, k) => Math.hypot(q[0] - previous[k][0], q[1] - previous[k][1])))
      previous = now
    }
    assert.ok(worst < 8, `re-pressing ${after} ticks into the release, no joint jumps more than 8 (worst ${worst.toFixed(1)})`)
  }
})

test('on ice, a body closer to a crate than its push stance is not drawn backwards: the arms bend instead', () => {
  for (const gap of [35, 41]) {
    const run = createRun(rink({ ramp: false, props: [{ kind: 'box', x: 400 + gap, y: 880, size: 40 }] })); run.started = true
    const p = run.player
    steps(run, 10)
    let slowest = 0
    for (let i = 0; i < 40; i++) { stepRun(run, RIGHT); slowest = Math.min(slowest, p.vx) }
    assert.ok(slowest > -1, `a crate ${gap} ahead: the feet on ice never walk the body back (slowest ${slowest.toFixed(0)})`)
  }
})

test('on ice, a longer run-up into a resting crate always sends it faster: a slow arrival shares its momentum too', () => {
  let last = 0, standing = null
  for (let d = 50; d <= 90; d += 4) {
    const run = createRun(rink({ ramp: false, props: [{ kind: 'box', x: 400 + d, y: 880, size: 40 }] })); run.started = true
    steps(run, 10)
    let contact = -1, i = 0
    for (; i < 300 && (contact < 0 || i < contact + 15); i++) {
      stepRun(run, RIGHT)
      if (contact < 0 && run.player.contacts?.push && !run.player.contacts.push.passive) contact = i
    }
    const speed = run.props[0].vx
    // Hands already on it, the push starts from a standstill; any run-up at all arrives with momentum to share.
    if (contact === 0) standing = speed
    else assert.ok(speed > standing + 5, `a run-up of ${d} sends the crate faster (${speed.toFixed(1)}) than a push from a standstill (${standing.toFixed(1)})`)
    assert.ok(speed >= last - 1, `a run-up of ${d} sends the crate at ${speed.toFixed(1)}, no slower than a shorter one (${last.toFixed(1)})`)
    last = Math.max(last, speed)
  }
})

/** The drawn trunk's lean from upright, in degrees, and the worst joint jump over a run of ticks. */
async function sprintAt(frictionless) {
  const level = blankTrial()
  level.width = 3600
  level.entrance = { x: 300, y: 880 }
  level.goal = { x: 3500, y: 880 }
  level.platforms = [{ x: 0, y: 880, w: 3600, h: 40, ...frictionless ? { frictionless: true } : {} }]
  level.props = [{ kind: 'box', x: 1000, y: 880, size: 40 }]
  const run = createRun(parseLevel(level)); run.started = true
  const p = run.player
  steps(run, 10)
  let previous = await drawnJoints(p), worst = 0, lean = 0
  for (let i = 0; i < 360 && !(p.contacts?.push && !p.contacts.push.passive); i++) {
    stepRun(run, RIGHT)
    const now = await drawnJoints(p)
    worst = Math.max(worst, ...now.map((q, k) => Math.hypot(q[0] - previous[k][0], q[1] - previous[k][1])))
    lean = Math.max(lean, Math.atan2(now[1][0] - now[2][0], now[2][1] - now[1][1]) * 180 / Math.PI)
    previous = now
  }
  return { worst, lean }
}

test('running at a resting crate on ice, the body leans into it no further than on ordinary ground, without a snap', async () => {
  const ice = await sprintAt(true), grip = await sprintAt(false)
  assert.ok(Math.abs(ice.lean - grip.lean) < 5, `leans ${ice.lean.toFixed(0)} degrees on ice, ${grip.lean.toFixed(0)} on grip`)
  assert.ok(ice.worst < 8, `no joint jumps more than 8 in a frame (worst ${ice.worst.toFixed(1)})`)
})

test('gliding off ice onto ordinary ground with nothing held, the trailing foot comes in without a snap at the seam', async () => {
  for (const ice of [200, 450]) {
    const level = blankTrial()
    level.width = 3600
    level.entrance = { x: 300, y: 880 }
    level.goal = { x: 3500, y: 880 }
    level.platforms = [{ x: 0, y: 880, w: 500, h: 40 }, { x: 500, y: 880, w: ice, h: 40, frictionless: true }, { x: 500 + ice, y: 880, w: 2600, h: 40 }]
    const run = createRun(parseLevel(level)); run.started = true
    const p = run.player
    steps(run, 96, RIGHT)
    let previous = await drawnJoints(p), worst = 0, crossed = false
    for (let i = 0; i < 240; i++) {
      stepRun(run, NEUTRAL_INPUT)
      const now = await drawnJoints(p)
      worst = Math.max(worst, ...now.map((q, k) => Math.hypot(q[0] - previous[k][0], q[1] - previous[k][1])))
      previous = now
      crossed ||= p.x > 500 + ice && (p.anim.curl ?? 0) > .5
    }
    assert.ok(crossed, `reached the ordinary ground still in the glide (ice ${ice} long)`)
    assert.ok(worst < 8, `no joint jumps more than 8 in a frame (worst ${worst.toFixed(1)}, ice ${ice} long)`)
  }
})

/** Drawn joints relative to the body, knees and elbows too, mirrored so either direction reads alike. */
const allJoints = async p => {
  const { athletePose } = await import('../src/games/jumping/athlete.ts')
  const q = athletePose(p)
  return [q.head, q.shoulder, q.hip, q.frontArm.end, q.backArm.end, q.frontLeg.end, q.backLeg.end,
    q.frontArm.joint, q.backArm.joint, q.frontLeg.joint, q.backLeg.joint].map(([x, y]) => [x * p.facing, y])
}

/** A grippy pad, 300 of ice to x 800, then more ice `rise` higher (a lip) or lower (a step down); mirrored for `direction` -1. */
function stepRink(rise, direction, offset = 0) {
  const width = 3600, at = x => direction > 0 ? x : width - x
  const piece = (x, y, w, h, frictionless) => ({ x: direction > 0 ? x : width - x - w, y, w, h, ...frictionless ? { frictionless: true } : {} })
  const level = blankTrial()
  level.width = width
  level.entrance = { x: at(300 + offset), y: 880 }
  level.goal = { x: at(3500), y: 880 }
  level.platforms = [piece(0, 880, 500, 40), piece(500, 880, 300, 40, true), piece(800, 880 - rise, 2800, 40 + rise, true)]
  const run = createRun(parseLevel(level)); run.started = true
  steps(run, 10)
  return { run, along: x => direction > 0 ? x : width - x }
}

test('gliding off a step down in the curler stance, the trailing foot leaves the ledge without a snap', async () => {
  for (const drop of [2, 10, 20]) for (const direction of [1, -1]) {
    const { run, along } = stepRink(-drop, direction), p = run.player
    steps(run, 96, { ...NEUTRAL_INPUT, move: direction })
    let previous = await allJoints(p), worst = 0, crossed = -1, curl = 0
    for (let i = 0; i < 180 && (crossed < 0 || i - crossed <= 40); i++) {
      stepRun(run, NEUTRAL_INPUT)
      const now = await allJoints(p)
      if (crossed < 0 && along(p.x) > 800) { crossed = i; curl = p.anim.curl ?? 0 }
      if (crossed >= 0) worst = Math.max(worst, ...now.map((q, k) => Math.hypot(q[0] - previous[k][0], q[1] - previous[k][1])))
      previous = now
    }
    const label = `${drop} down, ${direction > 0 ? 'right' : 'left'}`
    assert.ok(crossed >= 0 && curl > .8, `went off the step in the glide (${label}, curl ${curl.toFixed(2)})`)
    assert.ok(worst < 8, `no joint jumps more than 8 in a frame off the step (worst ${worst.toFixed(1)}, ${label})`)
  }
})

test('a glide rides over a lip of a unit or two in the ice, paying the climb from its speed; a real step still stops it', async () => {
  for (const lip of [.5, 1, 2]) for (const held of [false, true]) for (const [offset, direction] of [[0, 1], [1.3, -1], [2.4, 1]]) {
    const { run, along } = stepRink(lip, direction, offset), p = run.player
    const move = { ...NEUTRAL_INPUT, move: direction }
    steps(run, 96, move)
    let previous = await allJoints(p), worst = 0, before = 0, after = 0
    for (let i = 0; i < 150; i++) {
      const speed = Math.abs(p.vx)
      stepRun(run, held ? move : NEUTRAL_INPUT)
      const now = await allJoints(p)
      if (along(p.x) > 760 && along(p.x) < 860) worst = Math.max(worst, ...now.map((q, k) => Math.hypot(q[0] - previous[k][0], q[1] - previous[k][1])))
      if (!after && along(p.x) > 800) { before = speed; after = Math.abs(p.vx) }
      previous = now
    }
    const label = `${lip} lip, ${held ? 'held' : 'let go'}, ${direction > 0 ? 'right' : 'left'}, offset ${offset}`
    assert.ok(along(p.x) > 900 && p.grounded && Math.abs(p.y - (880 - lip)) < .01, `rode up onto the lip and on along it (${label}, at ${along(p.x).toFixed(0)})`)
    assert.ok(after > before - 20, `kept nearly all its speed (${before.toFixed(0)} to ${after.toFixed(0)}, ${label})`)
    if (!held) assert.ok(after < before, `paid for the climb (${before.toFixed(1)} to ${after.toFixed(1)}, ${label})`)
    assert.ok(worst < 8, `no joint jumps more than 8 in a frame over the lip (worst ${worst.toFixed(1)}, ${label})`)
  }
  // A step taller than a lip is still a step, which slick footing cannot climb.
  const { run, along } = stepRink(4, 1), p = run.player
  steps(run, 96, RIGHT)
  steps(run, 90)
  assert.ok(along(p.x) < 800 && Math.abs(p.vx) < 1, `a 4-unit step stops the glide (at ${along(p.x).toFixed(1)})`)
})
