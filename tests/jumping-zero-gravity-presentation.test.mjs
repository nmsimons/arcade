import test from 'node:test'
import assert from 'node:assert/strict'
import { blankTrial, parseLevel } from '../src/games/jumping/level.ts'
import { createRun, stepRun } from './helpers/jumping-active-run.mjs'
import { NEUTRAL_INPUT, STEP } from '../src/games/jumping/model.ts'
import { athletePose } from '../src/games/jumping/athlete.ts'
import { footBoosters } from '../src/games/jumping/airBoosters.ts'
import { wallFrameAngle } from '../src/games/jumping/wallFrame.ts'

// How a weightless body is drawn through the moments that used to pop: gliding on its feet, rolling while still fading
// in from a push-off, trimming a drift, turning, and skating along a surface.

/** A weightless room with a block standing on its floor (x 1000-1200, top y 600) and optional extra terrain. */
function room(platforms = []) {
  const level = parseLevel({ ...blankTrial(), entrance: { x: 400, y: 920 }, platforms: [{ x: 1000, y: 600, w: 200, h: 320 }, ...platforms],
    gravityPlates: [{ id: 'z', x: 0, y: 0, w: 1800, h: 920, gravity: 0, power: 'always' }] })
  const run = createRun(level); run.started = true
  return run
}
/** Drawn joints relative to the body's root, in the world's orientation (as athleteDraw places them). */
function joints(p) {
  const pose = athletePose(p), angle = wallFrameAngle(p.wall), c = Math.cos(angle), s = Math.sin(angle)
  return [pose.head, pose.shoulder, pose.hip, pose.frontArm.end, pose.backArm.end, pose.frontLeg.end, pose.backLeg.end].map(([x, y]) => {
    const lx = x * p.facing, ly = y * (p.inverted ? -1 : 1)
    return [lx * c - ly * s, lx * s + ly * c]
  })
}
/** Step with `input` and return the worst frame-to-frame jerk (second difference) of any drawn joint. */
function worstJerk(run, input, steps, each) {
  let before = null, previous = null, worst = 0
  for (let i = 0; i < steps; i++) {
    stepRun(run, { ...NEUTRAL_INPUT, ...input }); each?.(run.player)
    const now = joints(run.player)
    if (before) for (let j = 0; j < now.length; j++)
      worst = Math.max(worst, Math.hypot(now[j][0] - 2 * previous[j][0] + before[j][0], now[j][1] - 2 * previous[j][1] + before[j][1]))
    before = previous; previous = now
  }
  return worst
}

test('a body gliding on frictionless footing without weight carries its planted feet, never stepping', () => {
  const run = room([{ x: 0, y: 880, w: 1000, h: 40, frictionless: true }]), p = run.player
  Object.assign(p, { x: 300, y: 820, vx: 200, vy: 150, grounded: false, weightless: 1 })
  for (let i = 0; i < 120 && !p.grounded; i++) stepRun(run, NEUTRAL_INPUT)
  assert.ok(p.grounded, 'landed on the strip')
  const spreads = []
  const jerk = worstJerk(run, {}, 120, q => spreads.push(q.anim.footwork ? q.anim.footwork.feet[0].x - q.anim.footwork.feet[1].x : 0))
  assert.ok(Math.abs(p.vx) > 50 && p.grounded, `still gliding at ${p.vx.toFixed(0)}`)
  assert.ok(jerk < 1, `no foot shuffle: worst jerk ${jerk.toFixed(2)}`)
  assert.ok(Math.max(...spreads) - Math.min(...spreads) < 1, 'the stance keeps its spread')
})

test('a roll that starts while the float still fades in from a push-off starts from what is drawn', () => {
  // Stand on the block's face, then hold Down along it: the boots lift the body off and it soon rolls toward the floor.
  const run = room(), p = run.player
  Object.assign(p, { x: 800, y: 800, vx: 120, grounded: false, weightless: 1 })
  for (let i = 0; i < 300; i++) stepRun(run, NEUTRAL_INPUT)
  assert.equal(p.wall, 'right', 'standing on the block face')
  let rolled = false
  const jerk = worstJerk(run, { descend: true, drop: true, crouch: true }, 90, q => { rolled ||= q.releaseTurn?.float !== undefined })
  assert.ok(rolled, 'rolled toward the floor')
  assert.ok(jerk < 1, `worst jerk ${jerk.toFixed(2)}`)
})

test('trimming a slow drift, the boots show short distinct puffs; full thrust shows a long plume', () => {
  const run = room(), p = run.player
  Object.assign(p, { x: 400, y: 400, vx: 0, vy: 0, grounded: false, weightless: 1 })
  for (let i = 0; i < 60; i++) stepRun(run, NEUTRAL_INPUT)
  let full = 0
  for (let i = 0; i < 1 / STEP; i++) { stepRun(run, { ...NEUTRAL_INPUT, move: 1 }); for (const jet of footBoosters(p)) full = Math.max(full, jet.length) }
  assert.ok(full >= 10, `full thrust plume ${full.toFixed(1)} long`)
  p.vx = 40; p.vy = 0
  let puff = 0, gaps = 0, lit = false, puffs = 0
  for (let i = 0; i < 3 / STEP; i++) {
    stepRun(run, NEUTRAL_INPUT)
    const jets = footBoosters(p), on = jets.some(jet => jet.alpha > .02)
    for (const jet of jets) if (jet.puff !== undefined && jet.alpha >= .4) puff++
    if (on && !lit) puffs++
    if (!on) gaps++
    lit = on
  }
  assert.ok(puff > 0, "the trim puffs show at opacity 0.4 or more")
  assert.ok(puffs >= 4 && gaps > 0, `separate puffs (${puffs}), with gaps between`)
})

test('turning, the head looks where the body is going: the chin lifts as it tips head-first, never ducking the crown', () => {
  const run = room(), p = run.player
  Object.assign(p, { x: 400, y: 400, vx: 0, vy: 0, grounded: false, weightless: 1 })
  for (let i = 0; i < 60; i++) stepRun(run, NEUTRAL_INPUT)
  let lift = 0, duck = 0
  const jerk = worstJerk(run, { move: 1 }, .8 / STEP, q => { const neck = q.anim.float?.neck ?? 0; lift = Math.max(lift, -neck); duck = Math.max(duck, neck) })
  assert.ok(lift > .15, `the chin lifts ${(lift * 180 / Math.PI).toFixed(0)}° toward the travel`)
  assert.ok(duck < .05, `the crown never ducks into the turn (${(duck * 180 / Math.PI).toFixed(0)}°)`)
  assert.ok(jerk < 1, `worst jerk ${jerk.toFixed(2)}`)
})

test('skating along a surface without weight stands tall; Down alone still crouches', () => {
  const run = room(), p = run.player
  Object.assign(p, { x: 400, y: 920, vx: 0, vy: 0, grounded: true, weightless: 1 })
  for (let i = 0; i < 30; i++) stepRun(run, NEUTRAL_INPUT)
  for (let i = 0; i < 60; i++) stepRun(run, { ...NEUTRAL_INPUT, move: -1, descend: true, drop: true, crouch: true })
  assert.ok(p.grounded && p.vx < -20, `skating left at ${p.vx.toFixed(0)}`)
  assert.equal(p.crouching, false)
  for (let i = 0; i < 60; i++) stepRun(run, { ...NEUTRAL_INPUT, descend: true, drop: true, crouch: true })
  assert.equal(p.crouching, true)
})

test('a feet-first roll takes up the turn the body was already making, with no kink in its turning speed', () => {
  // Boost at the block's face from rest: the body leans into the thrust, then rolls feet-first toward the wall.
  const run = room(), p = run.player
  Object.assign(p, { x: 700, y: 800, vx: 0, vy: 0, grounded: false, weightless: 1 })
  for (let i = 0; i < 10; i++) stepRun(run, NEUTRAL_INPUT)
  const angles = [], wrap = v => Math.atan2(Math.sin(v), Math.cos(v))
  let worst = 0, rolled = false
  for (let i = 0; i < 2 / STEP && !p.grounded; i++) {
    stepRun(run, { ...NEUTRAL_INPUT, move: 1 }); rolled ||= p.releaseTurn?.float !== undefined
    const [[hx, hy], , [px, py]] = joints(p)
    angles.push(Math.atan2(hy - py, hx - px))
    if (angles.length > 2) { const [a, b, c] = angles.slice(-3); worst = Math.max(worst, Math.abs(wrap(c - b) - wrap(b - a)) / STEP / STEP) }
  }
  assert.ok(rolled && p.grounded && p.wall === 'right', 'rolled and landed feet-first on the face')
  assert.ok(worst * 180 / Math.PI < 9000, `turn acceleration up to ${(worst * 180 / Math.PI).toFixed(0)}°/s²`)
})

/** The drawn body's axis, hip to head, in world degrees. */
function bodyAngle(p) {
  const [[hx, hy], , [px, py]] = joints(p)
  return Math.atan2(hy - py, hx - px)
}
/** Hold `input` until the body has landed, returning the drawn body's turn (rad, positive clockwise on screen) from
 * the moment it is turned furthest back to the landing: a forward flip turns on through it, a roll back unwinds it. */
function rollTurn(run, input) {
  const p = run.player, wrap = v => Math.atan2(Math.sin(v), Math.cos(v))
  let turned = 0, least = 0, last = bodyAngle(p)
  for (let i = 0; i < 4 / STEP && !p.grounded; i++) {
    stepRun(run, { ...NEUTRAL_INPUT, ...input })
    const now = bodyAngle(p); turned += wrap(now - last); last = now; least = Math.min(least, turned)
  }
  return turned - least
}

test('diving head-first at a wall, the body tucks and flips forward onto its feet, like a swimmer turning', () => {
  // Boost right from far off: the body leans well over toward the block's face before it rolls.
  const run = room(), p = run.player
  Object.assign(p, { x: 100, y: 800, vx: 0, vy: 0, grounded: false, weightless: 1 })
  for (let i = 0; i < 10; i++) stepRun(run, NEUTRAL_INPUT)
  const turned = rollTurn(run, { move: 1 })
  assert.ok(p.grounded && p.wall === 'right' && p.facing === 1, `landed feet-first on the face (${p.wall}, facing ${p.facing})`)
  // Facing right, forward (the head toward the chest) is clockwise on screen.
  assert.ok(turned > Math.PI / 2, `flipped forward through ${(turned * 180 / Math.PI).toFixed(0)}°`)
})

test('diving head-first at the floor, the body flips all the way round to land on it, still facing the same way', () => {
  const run = room(), p = run.player
  Object.assign(p, { x: 400, y: 200, vx: 0, vy: 0, grounded: false, weightless: 1 })
  for (let i = 0; i < 10; i++) stepRun(run, NEUTRAL_INPUT)
  const turned = rollTurn(run, { descend: true, drop: true, crouch: true })
  assert.ok(p.grounded && !p.wall && !p.inverted && p.facing === 1, 'standing on the floor, facing as before')
  assert.ok(turned > Math.PI, `flipped forward through ${(turned * 180 / Math.PI).toFixed(0)}°`)
})

test('a hard landing without weight bends the knees from the touch, deep and smooth, and pushes off from the bottom', () => {
  // Coast feet-first into the block's face fast enough to rebound.
  const run = room(), p = run.player
  Object.assign(p, { x: 300, y: 800, vx: 0, vy: 0, grounded: false, weightless: 1 })
  for (let i = 0; i < 10; i++) stepRun(run, NEUTRAL_INPUT)
  p.vx = 450
  const knee = leg => { const ax = leg.joint[0] - leg.root[0], ay = leg.joint[1] - leg.root[1], bx = leg.end[0] - leg.joint[0], by = leg.end[1] - leg.joint[1]
    return Math.abs(Math.atan2(ax * by - ay * bx, ax * bx + ay * by)) }
  let touch = null, leave = null, deepest = 0, previous = null, step = 0, before = null, launch = 0
  for (let i = 0; i < 4 / STEP && leave === null; i++) {
    const was = joints(p).map(([x, y]) => [x + p.x, y + p.y])
    stepRun(run, NEUTRAL_INPUT)
    if (touch === null && p.grounded && p.wall === 'right') touch = i
    if (touch !== null && leave === null && !p.grounded) {
      leave = i
      // Leaving, the body carries on from the push: no joint lurches in the world.
      const now = joints(p).map(([x, y]) => [x + p.x, y + p.y])
      launch = Math.max(...now.map((point, j) => Math.hypot(point[0] - 2 * was[j][0] + before[j][0], point[1] - 2 * was[j][1] + before[j][1])))
    }
    before = was
    if (touch !== null && leave === null) {
      const k = knee(athletePose(p).frontLeg)
      if (previous !== null) step = Math.max(step, Math.abs(k - previous))
      previous = k; deepest = Math.max(deepest, p.crouch)
    }
  }
  assert.ok(touch !== null && leave !== null, 'landed and rebounded')
  assert.ok(deepest > .6, `folded to ${deepest.toFixed(2)} of a crouch`)
  assert.ok(step < .4, `the knee turns at most ${(step * 180 / Math.PI).toFixed(0)}° a frame`)
  const time = (leave - touch) * STEP
  assert.ok(time > .12 && time < .22, `pushed off ${time.toFixed(3)} s after the touch`)
  assert.ok(launch < 1.5, `worst joint lurch leaving ${launch.toFixed(2)}`)
})

test('walking onto a weightless plate keeps the legs under the body instead of buckling them', () => {
  // A walking stride's feet have no footing: each one's anchor is where it last left the floor, up to a stride behind.
  // The glide used to plant both feet back at those anchors on the first weightless step, folding the knees and dropping
  // the hips to the floor in one frame. Cover holding the walk across the edge and letting go just before it.
  for (const [direction, releaseBefore] of [[1, -Infinity], [1, 5], [-1, 5], [1, 20]]) {
    const edge = direction > 0 ? 700 : 300
    const plate = direction > 0 ? { x: 700, w: 1100 } : { x: 0, w: 300 }
    const run = createRun(parseLevel({ ...blankTrial(), entrance: { x: direction > 0 ? 300 : 700, y: 920 },
      gravityPlates: [{ id: 'z', ...plate, y: 0, h: 920, gravity: 0, power: 'always' }] }))
    run.started = true
    const p = run.player, label = `walking ${direction > 0 ? 'right' : 'left'}, letting go ${releaseBefore} before the edge`
    for (let i = 0; i < 30; i++) stepRun(run, NEUTRAL_INPUT)
    let lowest = Infinity, worstDrop = 0, before = null, weightless = false
    for (let i = 0; i < 2 / STEP; i++) {
      stepRun(run, { ...NEUTRAL_INPUT, move: (edge - p.x) * direction > releaseBefore ? direction : 0 })
      const hip = -athletePose(p).hip[1]
      weightless ||= (p.weightless ?? 0) > 0
      if ((edge - p.x) * direction < 40) {
        lowest = Math.min(lowest, hip)
        if (before !== null) worstDrop = Math.max(worstDrop, before - hip)
      }
      before = hip
    }
    assert.ok(weightless, `${label}: reached the plate`)
    assert.ok(lowest > 22, `${label}: hips stay up (lowest ${lowest.toFixed(1)})`)
    assert.ok(worstDrop < 3, `${label}: no sudden sag (worst drop ${worstDrop.toFixed(1)} in one frame)`)
  }
})

/** A floor-level weightless plate (x `from` to `to`) with a block standing just past the end the run leaves by, and the
 * entrance outside the other end. Run `direction` (1 right, -1 left) across it. */
function plateRun(direction) {
  const [from, to] = direction > 0 ? [300, 1100] : [700, 1500]
  const block = direction > 0 ? { x: to + 150, y: 600, w: 150, h: 320 } : { x: from - 300, y: 600, w: 150, h: 320 }
  const run = createRun(parseLevel({ ...blankTrial(), entrance: { x: direction > 0 ? 150 : 1650, y: 920 }, platforms: [block],
    gravityPlates: [{ id: 'z', x: from, y: 0, w: to - from, h: 920, gravity: 0, power: 'always' }] }))
  run.started = true
  for (let i = 0; i < 30; i++) stepRun(run, NEUTRAL_INPUT)
  return run
}

test('flying flat out off the end of a weightless plate, the body falls flat, lands sprawled and gets up, never on its head', () => {
  // Running across a plate the boots carry the body off the floor and the float stretches it head-first along its travel.
  // It used to start a feet-first roll for the wall beyond the plate, which it only reaches once weight is back: the
  // weight came back mid-roll, so it landed on its head and was dragged along the floor upside down. Running left
  // rolled it over through a whole turn.
  for (const direction of [1, -1]) {
    const run = plateRun(direction), p = run.player, label = direction > 0 ? 'running right' : 'running left'
    let rolled = false, wasWeightless = false, weightBack = null, landed = null, lowestHead = -Infinity, upright = null
    for (let i = 0; i < 4 / STEP && upright === null; i++) {
      stepRun(run, { ...NEUTRAL_INPUT, move: direction })
      if ((p.weightless ?? 0) > .2) { wasWeightless = true; rolled ||= !!p.releaseTurn }
      if (wasWeightless && weightBack === null && !p.weightless) weightBack = i
      if (weightBack === null) continue
      const [head, , hip] = joints(p)
      lowestHead = Math.max(lowestHead, head[1] - hip[1])
      if (landed === null && p.grounded) landed = { prone: p.freeFall?.recovery === 0 && p.freeFall.amount > .9 }
      if (landed && !p.freeFall && Math.abs(bodyAngle(p) + Math.PI / 2) < .5) upright = i
    }
    assert.ok(wasWeightless && weightBack !== null, `${label}: crossed the plate`)
    assert.ok(!rolled, `${label}: no roll for a wall it only reaches with weight`)
    assert.ok(landed?.prone, `${label}: landed sprawled`)
    assert.ok(lowestHead < 12, `${label}: the head never drops below the hips (${lowestHead.toFixed(1)} below)`)
    assert.ok(upright !== null && (upright - weightBack) * STEP < 1.5, `${label}: back on its feet`)
  }
})

test('a body only just off a weightless floor at the plate\'s edge lands on its feet', () => {
  // Floating close over the floor the float keeps the body upright; it has not been flying flat out long enough to
  // lean over, so weight coming back sets it down on its feet rather than flinging it prone.
  const run = plateRun(1), p = run.player
  Object.assign(p, { x: 1060, vx: 300 })
  let fell = false, landed = false
  for (let i = 0; i < 1 / STEP && !landed; i++) {
    stepRun(run, { ...NEUTRAL_INPUT, move: 1 })
    fell ||= (p.freeFall?.amount ?? 0) > 0
    landed = p.grounded && !p.weightless && p.x > 1110
  }
  assert.ok(landed, 'ran off the plate onto the floor')
  assert.ok(!fell, 'stayed on its feet')
})

test('a sprawl that slides off its support eases out of it instead of snapping upright', () => {
  // A body landing sprawled on the lip of a ledge and sliding off used to drop its fall state at once, the drawn body
  // jumping from flat to upright in one frame.
  const run = createRun(parseLevel({ ...blankTrial(), entrance: { x: 300, y: 600 }, platforms: [{ x: 200, y: 600, w: 200, h: 320 }] }))
  run.started = true
  const p = run.player
  for (let i = 0; i < 30; i++) stepRun(run, NEUTRAL_INPUT)
  Object.assign(p, { x: 396, vx: 410, freeFall: { time: 1.2, amount: 1, recovery: .01 } })
  let previous = null, worst = 0, left = false
  for (let i = 0; i < .5 / STEP; i++) {
    stepRun(run, { ...NEUTRAL_INPUT, move: 1 })
    const now = joints(p)
    left ||= !p.grounded
    if (previous && left) worst = Math.max(worst, ...now.map(([x, y], k) => Math.hypot(x - previous[k][0], y - previous[k][1])))
    previous = now
  }
  assert.ok(left, 'slid off the ledge')
  assert.ok(worst < 10, `worst joint jump ${worst.toFixed(1)} in one frame`)
})

test('a floating body turning round mid-push keeps its palms, and a turn of facing mirrors what is drawn without a jump', () => {
  // Pushing a ball, then steering the other way: the palms are handed over rather than dropped, and the mirrored
  // fade starts from the pose on screen (which may itself still be fading in), so no joint jumps.
  const run = createRun(parseLevel({ ...blankTrial(), entrance: { x: 300, y: 920 }, props: [{ kind: 'ball', x: 380, y: 563, size: 68 }],
    gravityPlates: [{ id: 'z', x: 0, y: 0, w: 1800, h: 920, gravity: 0, power: 'always' }] }))
  run.started = true
  const p = run.player
  Object.assign(p, { x: 320, y: 560, grounded: false, weightless: 1 })
  let previous = null, worst = 0
  for (let i = 0; i < 2 / STEP; i++) {
    stepRun(run, { ...NEUTRAL_INPUT, move: i < 1 / STEP ? 1 : -1 })
    const now = joints(p).map(([x, y]) => [x + p.x, y + p.y])
    if (previous) {
      const moved = order => Math.max(...now.map(([x, y], k) => Math.hypot(x - previous[order[k]][0], y - previous[order[k]][1])))
      worst = Math.max(worst, Math.min(moved([0, 1, 2, 3, 4, 5, 6]), moved([0, 1, 2, 4, 3, 6, 5])) - Math.hypot(p.vx, p.vy) * STEP)
    }
    previous = now
  }
  assert.ok(worst < 6, `worst joint jump ${worst.toFixed(1)} in a frame`)
})

test('the drawn palms keep up with a fast floating push instead of trailing behind the ball', () => {
  const run = createRun(parseLevel({ ...blankTrial(), entrance: { x: 300, y: 920 }, props: [{ kind: 'ball', x: 400, y: 563, size: 68 }],
    gravityPlates: [{ id: 'z', x: 0, y: 0, w: 1800, h: 920, gravity: 0, power: 'always' }] }))
  run.started = true
  const p = run.player, b = run.props[0]
  Object.assign(p, { x: 320, y: 560, grounded: false, weightless: 1 })
  let worst = 0, fast = 0
  for (let i = 0; i < 2.5 / STEP; i++) {
    stepRun(run, { ...NEUTRAL_INPUT, move: 1 })
    const drawn = p.pushing?.palms, real = p.contacts?.push?.hands?.palms
    if (b.vx > 150 && drawn && real && p.pushing.amount > .99) { fast++; worst = Math.max(worst, ...drawn.map((palm, k) => Math.hypot(palm.x - real[k].x, palm.y - real[k].y))) }
  }
  assert.ok(fast > 30, 'pushed the ball past 150')
  assert.ok(worst < 3, `the drawn palms trail the ball by at most ${worst.toFixed(1)}`)
})

test('Rbot floating weightless and turned onto a wall frame keeps its proportions rather than stretching', async () => {
  const { repulsorBotPoint, repulsorBotPresentation } = await import('../src/games/jumping/repulsorBotRig.ts')
  const { robotHeadlightPose } = await import('../src/games/jumping/robotHeadlight.ts')
  // A weightless hall like the user's Billiards: floor and ceiling fields, and side fields that turn a body onto
  // their wall. The robot is flung at the right-hand wall, lands on it and floats home from there to its floor.
  const level = parseLevel({ ...blankTrial(), width: 2000, height: 1200, floor: 1200, entrance: { x: 160, y: 1200 }, goal: { x: 1900, y: 1200 },
    platforms: [{ x: 400, y: 200, w: 40, h: 800 }, { x: 1600, y: 200, w: 40, h: 800 }, { x: 520, y: 80, w: 1000, h: 40 }, { x: 500, y: 1080, w: 1000, h: 40 }],
    robots: [{ x: 1246, y: 1080, left: 530, right: 1470, kind: 'repulsor' }],
    gravityPlates: [{ id: 'c', x: 520, y: 120, w: 1000, h: 480, gravity: 0, ceiling: true, power: 'always' },
      { id: 'f', x: 500, y: 600, w: 1000, h: 480, gravity: 0, power: 'always' },
      { id: 'r', x: 440, y: 200, w: 120, h: 800, gravity: 0, power: 'always', facing: 'right' },
      { id: 'l', x: 1480, y: 200, w: 120, h: 800, gravity: 0, power: 'always', facing: 'left' }] })
  const run = createRun(level), robot = run.robots[0]
  const standingPose = robot.actor
  // Drawn lengths in the world: the torso, and each leg from hip to ankle through the knee.
  const lengths = () => {
    const { actor, pose } = repulsorBotPresentation(robot), at = point => repulsorBotPoint(actor, point)
    const span = (...points) => points.slice(1).reduce((sum, point, i) => sum + Math.hypot(...[0, 1].map(k => at(point)[k] - at(points[i])[k])), 0)
    return { torso: span(pose.hip, pose.shoulder), front: span(pose.frontLeg.root, pose.frontLeg.joint, pose.frontLeg.end),
      back: span(pose.backLeg.root, pose.backLeg.joint, pose.backLeg.end) }
  }
  const standing = lengths()
  // Staggered, it drifts with the fling until it lands on the wall, then floats home from there.
  Object.assign(standingPose, { x: 1300, y: 500, vx: 260, vy: 0, grounded: false, stagger: 3 }); robot.x = standingPose.x; robot.y = standingPose.y
  let floating = 0, walled = 0, worst = { ratio: 0 }, headlight = 0
  for (let t = 0; t < 1600; t++) {
    stepRun(run, NEUTRAL_INPUT)
    const actor = robot.actor
    if ((actor.anim.float?.blend ?? 0) < .99) continue
    floating++; if (actor.wall) walled++
    const now = lengths()
    for (const part of ['torso', 'front', 'back']) if (now[part] / standing[part] > worst.ratio) worst = { ratio: now[part] / standing[part], part, t, wall: actor.wall }
    const { pose } = repulsorBotPresentation(robot), head = repulsorBotPoint(actor, pose.head), light = robotHeadlightPose(robot)
    headlight = Math.max(headlight, Math.hypot(light.x - head[0], light.y - head[1]))
  }
  assert.ok(floating > 300 && walled > 60, `floated ${floating} ticks, ${walled} of them in a wall frame`)
  assert.ok(worst.ratio < 1.12, `a drawn limb grew to ${worst.ratio.toFixed(2)} of its standing length (${JSON.stringify(worst)})`)
  assert.ok(headlight < 25, `the headlight stays at the face (${headlight.toFixed(1)} from the head)`)
})
