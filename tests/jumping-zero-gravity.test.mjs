import test from 'node:test'
import assert from 'node:assert/strict'
import { airBoostStrength, createPlayer, NEUTRAL_INPUT, STEP, stepPlayer, TUNING } from '../src/games/jumping/model.ts'
import { athletePose } from '../src/games/jumping/athlete.ts'
import { blankTrial } from '../src/games/jumping/level.ts'
import { weightlessArrivalTime } from '../src/games/jumping/movementTuning.ts'
import { createRun, stepRun } from './helpers/jumping-active-run.mjs'
import { bodyIntersects } from '../src/games/jumping/geometry.ts'
import { ballShape, boxShape } from '../src/games/jumping/propGeometry.ts'

/** The weightless air's drag rate at speed `v`: linear, growing with speed, and the slow settle (no thrust). */
const airDrag = v => TUNING.zeroGravityDrag + TUNING.zeroGravityAirDrag * Math.abs(v)
  + TUNING.zeroGravityRestDrag * Math.max(0, 1 - Math.abs(v) / TUNING.zeroGravityRestSpeed)
const close = (actual, expected, tolerance = 1e-6) => assert.ok(Math.abs(actual - expected) < tolerance, `${actual} ≠ ${expected}`)
const float = (p, input = NEUTRAL_INPUT, dt = STEP, gravity = 0) =>
  stepPlayer(p, input, dt, [], undefined, undefined, undefined, undefined, gravity)
function fixture(kind, overrides = {}) {
  const level = { ...blankTrial(), width: 1800, height: 1400, floor: 1400,
    entrance: { x: 300, y: 838 }, goal: { x: 1600, y: 1400 },
    gravityPlates: [{ id: 'zero-g', x: 20, y: 20, w: 1760, h: 1360, gravity: 0, power: 'always' }],
    props: [{ kind, x: 300, y: 900, size: 60 }], ...overrides }
  // Already weightless for a while: zero-g handling has settled in (TUNING.zeroGravitySettle).
  const run = createRun(level); run.started = true; run.player.grounded = false; run.player.weightless = 1
  return run
}

test('a weightless body floats upright, leans into its travel, and its boots keep accelerating it against the air', () => {
  const p = createPlayer({ x: 300, y: 500 }); p.grounded = false
  for (let i = 0; i < 160; i++) float(p)
  assert.equal(p.freeFall, null, 'no prone falling pose without weight')
  assert.ok(p.anim.float && p.anim.float.blend === 1 && Math.abs(p.anim.float.lean) < .05)
  let pose = athletePose(p)
  assert.ok(pose.hip[1] - pose.shoulder[1] > 12, 'upright at rest')
  close(p.x, 300); close(p.y, 500)
  for (let i = 0; i < 120; i++) float(p, { ...NEUTRAL_INPUT, move: -1 })
  const second = -p.vx
  assert.equal(p.facing, -1); assert.ok(second > 200, `boosting at ${p.vx}`)
  for (let i = 0; i < 120; i++) float(p, { ...NEUTRAL_INPUT, move: -1 })
  // Thrust is constant; only the air holds the speed back, more as it rises.
  const terminal = (-TUNING.zeroGravityDrag + Math.sqrt(TUNING.zeroGravityDrag ** 2 + 4 * TUNING.zeroGravityAirDrag * TUNING.zeroGravityThrust)) / (2 * TUNING.zeroGravityAirDrag)
  assert.ok(-p.vx > second + 40 && -p.vx < terminal, `still accelerating at ${p.vx}, below ${terminal}`)
  assert.ok(p.anim.float.lean > .9, 'head leading into its travel')
  const leaning = athletePose(p)
  assert.ok(leaning.shoulder[0] - leaning.hip[0] > 8 && leaning.hip[1] - leaning.shoulder[1] < pose.hip[1] - pose.shoulder[1] - 4,
    'leaning forward into the travel rather than standing')
  // Up and Down thrust too, in screen directions.
  const sideways = -p.vx
  for (let i = 0; i < 240; i++) float(p, { ...NEUTRAL_INPUT, climb: true })
  assert.ok(p.vy < -200 && -p.vx < sideways / 2, `rising at ${p.vy}, the sideways drift fading at ${p.vx}`)
})

test('weight returns the ordinary airborne pose', () => {
  const p = createPlayer({ x: 300, y: 500 }); p.grounded = false
  for (let i = 0; i < 60; i++) float(p, { ...NEUTRAL_INPUT, move: 1 })
  assert.ok(p.anim.float)
  float(p, NEUTRAL_INPUT, STEP, TUNING.gravity)
  assert.ok(p.anim.float.blend < 1, 'the float posture starts fading at once')
  for (let i = 0; i < 30; i++) float(p, NEUTRAL_INPUT, STEP, TUNING.gravity)
  assert.equal(p.anim.float, null)
})

test('zero-g air resistance slows both drift axes gradually and independently of timestep', () => {
  for (const dt of [STEP, 1 / 60, 1 / 30]) {
    const p = createPlayer({ x: 300, y: 500 }); Object.assign(p, { grounded: false, vx: 200, vy: -100, weightless: 1 })
    float(p, NEUTRAL_INPUT, dt)
    assert.ok(p.vx > 190 && p.vx < 200, 'release causes gentle drag, not an immediate stop')
    close(p.vx / p.vy, -2)
    for (let i = 1; i < Math.round(2 / dt); i++) float(p, NEUTRAL_INPUT, dt)
    // ds/dt = -(a + b s) s: linear drag plus air resistance growing with speed (above the slow settle).
    const a = TUNING.zeroGravityDrag, b = TUNING.zeroGravityAirDrag, s0 = Math.hypot(200, 100), e = Math.exp(-a * 2)
    close(Math.hypot(p.vx, p.vy), a * s0 * e / (a + b * s0 * (1 - e)), 1)
    close(p.vx / p.vy, -2)
    for (let i = 0; i < Math.round(10 / dt); i++) float(p, NEUTRAL_INPUT, dt)
    assert.ok(Math.hypot(p.vx, p.vy) < 5, "the drift has died away after 12 s")
    assert.equal(p.freeFall, null, 'drifting without weight is floating, not falling')
  }
})

/** Speed after `t` seconds of the zero-g air from `s0`: ds/dt = -(a + b s + settle) s, the settle fading in below the
 * rest speed. */
const coasted = (s0, t) => {
  let s = s0
  for (let i = 0; i < t * 1e4; i++) s -= (TUNING.zeroGravityDrag + TUNING.zeroGravityAirDrag * s
    + TUNING.zeroGravityRestDrag * Math.max(0, 1 - s / TUNING.zeroGravityRestSpeed)) * s * 1e-4
  return s
}

for (const kind of ['box', 'ball']) test(`a neutral drifting player bumping a floating ${kind} side-on transfers momentum once across solver substeps`, () => {
  for (const dt of [STEP, 1 / 30]) {
    // The prop floats level with the body's middle, just ahead of its hull.
    const run = fixture(kind, { props: [{ kind, x: 344, y: 838, size: 60 }] }), p = run.player, b = run.props[0]
    p.vx = 300
    stepRun(run, NEUTRAL_INPUT, dt)
    assert.ok(b.vx > 50, 'a bump works without any steering force')
    assert.ok(p.vx > 0 && p.vx < 200, 'the collision slows the player without an extra bounce')
    // Momentum is conserved with the prop solver's masses. The hull's face is centred a little above the box's middle,
    // so the box also takes some spin.
    const mass = kind === 'box' ? .002 * 60 * 60 : .001 * 2829.8
    close((2.5 * p.vx + mass * b.vx) / (2.5 * 300), 1, .03)
    assert.ok(Math.abs(b.angularVelocity) < 2, 'no more than the lever of that offset gives')
    assert.equal(bodyIntersects(p.x, p.y, kind === 'box' ? boxShape(b) : ballShape(b)), false)
    // Afterwards both feel the same air: the pair's momentum dies away gently (the player may catch the prop and bump
    // it again on the way, sharing a little more), rather than the prop keeping its speed forever.
    const momentum = () => 2.5 * p.vx + mass * b.vx, before = momentum()
    for (let i = 0; i < Math.round(1 / dt); i++) stepRun(run, NEUTRAL_INPUT, dt)
    assert.ok(momentum() < before * .92 && momentum() > before * .75, `the air took ${(100 - momentum() / before * 100).toFixed(0)}% of the momentum in a second`)
  }
})

for (const kind of ['box', 'ball']) test(`a weightless body drifting feet-first onto a floating ${kind} lands on it and rides it on, sharing its momentum`, () => {
  for (const dt of [STEP, 1 / 30]) {
    const run = fixture(kind), p = run.player, b = run.props[0]
    p.vy = 120
    for (let i = 0; i < Math.round(.5 / dt); i++) stepRun(run, NEUTRAL_INPUT, dt)
    assert.equal(p.contacts?.support?.collider.prop, b, 'standing on the prop')
    // The pair moves on together at the speed momentum gives them (the prop solver's masses), less the air.
    const mass = kind === 'box' ? .002 * 60 * 60 : .001 * 2829.8, shared = 120 * 2.5 / (2.5 + mass)
    assert.ok(b.vy > shared * .8 && b.vy < shared * 1.02, `the prop moves on at ${b.vy.toFixed(1)}, sharing ${shared.toFixed(1)}`)
    assert.ok(p.y < b.y - (kind === 'box' ? 59 : 59.5), 'the feet stay on its top')
  }
})

test('an off-center floating box bump transfers angular momentum as well as drift', () => {
  const run = fixture('box', { entrance: { x: 336, y: 780 }, props: [{ kind: 'box', x: 380, y: 800, size: 60 }] })
  run.player.vx = 300
  stepRun(run, NEUTRAL_INPUT)
  assert.ok(run.props[0].vx > 30)
  assert.ok(Math.abs(run.props[0].angularVelocity) > .1)
  assert.ok(run.player.vx < 300)
})

test('an incoming weightless object also shares its momentum with a stationary player', () => {
  const run = fixture('ball', { entrance: { x: 300, y: 800 }, props: [{ kind: 'ball', x: 300, y: 862, size: 60 }] })
  run.props[0].vy = -300
  stepRun(run, NEUTRAL_INPUT)
  assert.ok(run.player.vy < -100)
  assert.ok(run.props[0].vy > -300 && run.props[0].vy < 0)
  // Both then feel the same air, so they leave together.
  close(run.player.vy, run.props[0].vy, .5)
})

test('neutral player impacts also move unsupported objects in a 0.1 gravity field', () => {
  const run = fixture('ball', { gravityPlates: [{ id: 'weak', x: 20, y: 20, w: 1760, h: 1360, gravity: .1, power: 'always' }] })
  run.player.vy = 300; run.props[0].grounded = false
  stepRun(run, NEUTRAL_INPUT)
  assert.ok(run.props[0].vy > 100, 'weak gravity cannot disable the collision impulse')
  assert.ok(run.player.vy > 0 && run.player.vy < 200)
})

test('a separating prop or one beyond a solid wall receives no player impact', () => {
  for (const blocked of [false, true]) {
    const run = fixture('box', { entrance: { x: 300, y: 800 }, props: [{ kind: 'box', x: 345, y: 800, size: 60 }],
      platforms: blocked ? [{ x: 313, y: 650, w: 2, h: 200 }] : [] })
    Object.assign(run.player, { vx: blocked ? 900 : -300 })
    stepRun(run, NEUTRAL_INPUT)
    close(run.props[0].vx, 0); close(run.props[0].vy, 0); close(run.props[0].angularVelocity, 0)
  }
})

/** A room with no gravity anywhere, a block in it to push from, and the player standing at `x`. */
function weightless(x = 400) {
  const level = { ...blankTrial(), entrance: { x, y: 920 }, platforms: [{ x: 1000, y: 600, w: 200, h: 320 }],
    gravityPlates: [{ id: 'z', x: 0, y: 0, w: 1800, h: 920, gravity: 0, power: 'always' }] }
  const run = createRun(level); run.started = true
  return run
}
const steps = (run, frames, input = NEUTRAL_INPUT) => { for (let i = 0; i < frames; i++) stepRun(run, { ...NEUTRAL_INPUT, ...input }) }

test('without weight, jumping pushes off the floor, a wall corner, or a ceiling the body has landed on', () => {
  let run = weightless(), p = run.player
  steps(run, 10); assert.equal(p.grounded, true)
  steps(run, 2, { jump: true }); steps(run, 1)
  assert.ok(p.vy < -TUNING.zeroGravityPushOff * .95 && Math.abs(p.vx) < 1, `straight up off the floor: ${p.vx}, ${p.vy}`)
  run = weightless(988); p = run.player
  steps(run, 10)
  steps(run, 2, { jump: true, move: -1 }); steps(run, 1)
  assert.ok(p.vx < -300 && p.vy < -100, `off the floor and the block's wall together, leaning left: ${p.vx}, ${p.vy}`)
  // Boots carry the body up, held to a gentle approach; it turns feet-first, lands on the ceiling and stays; a jump
  // pushes it back down.
  run = weightless(); p = run.player
  steps(run, 10)
  for (let i = 0; i < 1500 && !(p.inverted && p.grounded); i++)
    stepRun(run, { ...NEUTRAL_INPUT, ...(p.vy < -150 ? { descend: true } : p.vy > -120 ? { climb: true } : {}) })
  assert.ok(p.inverted && p.grounded, `landed feet-first on the ceiling (inverted=${p.inverted}, y=${p.y})`)
  steps(run, 60)
  assert.ok(p.inverted && p.grounded && Math.abs(p.vy) < 1, 'and stays there')
  steps(run, 2, { jump: true }); steps(run, 1)
  assert.ok(p.vy > TUNING.zeroGravityPushOff * .95, `pushed back down: ${p.vy}`)
})

test('a fast drift turns feet-first before a surface, absorbs the hit in a crouch, and pushes off slower than it came', () => {
  const run = weightless(), p = run.player
  steps(run, 10)
  steps(run, 2, { jump: true }); steps(run, 1)
  p.y = 500; p.vy = -420
  let turned = false, arrival = 0, crouched = false, leaving = 0
  for (let i = 0; i < 600 && !leaving; i++) {
    const vy = p.vy, was = p.grounded
    steps(run, 1)
    turned ||= !!p.inverted
    if (!was && p.grounded) arrival = Math.abs(vy)
    crouched ||= p.grounded && p.crouching
    if (was && !p.grounded && arrival) leaving = Math.abs(p.vy)
  }
  assert.ok(turned, 'turned to meet the ceiling with its feet')
  assert.ok(crouched, 'the legs flexed into a crouch to absorb the hit')
  assert.ok(arrival > TUNING.zeroGravityStick && Math.abs(leaving - arrival * TUNING.zeroGravityRebound) < 5, `arrived at ${arrival}, left at ${leaving}`)
  assert.equal(p.grounded, false)
})

test('without weight nothing walks: a held direction lifts the body off its surface on its boots', () => {
  const run = weightless(), p = run.player
  steps(run, 10)
  steps(run, 30, { move: 1 })
  assert.equal(p.grounded, false)
  assert.ok(p.vx > 20 && p.vx < 120 && Math.abs(p.vy) < 20, `drifting off gently at ${p.vx}, ${p.vy}`)
})

test('a moment of weightlessness, crossing a flipping field, keeps ordinary flight until it settles', () => {
  const p = createPlayer({ x: 300, y: 500 }); Object.assign(p, { grounded: false, vx: 200, vy: -100 })
  float(p, { ...NEUTRAL_INPUT, climb: true })
  close(p.vx, 200); assert.ok(p.vy > -101, `no drag and no boots on the first weightless step: ${p.vx}, ${p.vy}`)
  for (let i = 0; i < Math.ceil(TUNING.zeroGravitySettle / STEP); i++) float(p, { ...NEUTRAL_INPUT, climb: true })
  assert.ok(p.vx < 200 && p.vy < -100, `then the drag and the boots take over: ${p.vx}, ${p.vy}`)
})

test('a body launched by a reversed lift into a weightless room finishes its gravity turn and floats', () => {
  // The lift flips the body toward its ceiling; the room above is weightless before the flip completes.
  const level = { ...blankTrial(), entrance: { x: 400, y: 920 },
    gravityPlates: [{ id: 'lift', x: 300, y: 600, w: 200, h: 320, gravity: -1, power: 'always' },
      { id: 'room', x: 0, y: 0, w: 900, h: 560, gravity: 0, power: 'always' }] }
  for (const x of [330, 400, 470]) {
    const run = createRun(level); run.started = true; run.player.x = x
    let frozen = 0, floating = false
    for (let i = 0; i < 360 && !floating; i++) {
      stepRun(run, NEUTRAL_INPUT)
      const p = run.player
      frozen = p.releaseTurn && p.releaseTurn.float === undefined && p.weightless > .3 ? frozen + 1 : 0
      assert.ok(frozen < 60, `x ${x}: the flip froze halfway at ${p.releaseTurn?.angle}`)
      floating = p.anim.float?.blend === 1
    }
    assert.ok(floating, `x ${x}: drawn floating in the room`)
  }
})

test('thrust against the drift brakes hard, and a slow drift with no thrust settles to rest', () => {
  const p = createPlayer({ x: 300, y: 500 }); Object.assign(p, { grounded: false, vx: 300, vy: 0, weightless: 1 })
  let time = 0
  while (p.vx > 0 && time < 2) { float(p, { ...NEUTRAL_INPUT, move: -1 }); time += STEP }
  assert.ok(time < .5 && p.vx > -10, `stopped from 300 in ${time.toFixed(2)} s without shooting back: ${p.vx}`)
  // A slow nudge still carries the body a good way, to a nearby surface, before the boots trim it to rest.
  Object.assign(p, { x: 300, vx: 60, vy: 0 })
  let puffed = false
  for (let i = 0; i < 8 / STEP; i++) { float(p); puffed ||= p.airBoost.trim && airBoostStrength(p) > .1 }
  assert.ok(p.x - 300 > 150, `a 60 px/s coast travels ${(p.x - 300).toFixed(0)} px`)
  assert.ok(Math.abs(p.vx) < 2, `and comes to rest within 8 s: ${p.vx}`)
  assert.ok(puffed, 'the boots are seen puffing as they trim it')
})

test('the feet-first roll finishes shortly before a coasting body arrives, and turns back if it steers away', () => {
  let run = weightless(), p = run.player
  Object.assign(p, { x: 400, y: 700, grounded: false, vx: 0, vy: -260, weightless: 1 })
  let rolled = null, landed = null
  for (let i = 0; i < 600 && landed === null; i++) {
    steps(run, 1)
    if (rolled === null && p.inverted) rolled = i
    if (p.grounded) landed = i
  }
  assert.ok(rolled !== null && landed !== null, 'rolled and landed on the ceiling')
  const lead = (landed - rolled) / 120
  assert.ok(lead > .05 && lead < .6, `roll finished ${lead.toFixed(2)} s before landing`)
  run = weightless(); p = run.player
  Object.assign(p, { x: 400, y: 500, grounded: false, vx: 0, vy: -300, weightless: 1 })
  for (let i = 0; i < 200 && !p.releaseTurn; i++) steps(run, 1)
  assert.ok(p.releaseTurn, 'a roll toward the ceiling began')
  // Steering away turns the ceiling roll back (a dive at the floor may then flip toward it, keeping the floor).
  for (let i = 0; i < 240 && p.releaseTurn?.toWall === 'ceiling'; i++) steps(run, 1, { descend: true })
  assert.notEqual(p.releaseTurn?.toWall, 'ceiling'); assert.equal(p.inverted, false, 'steering away turned the roll back')
})

test('a slow landing holds the surface instead of sliding, a diagonal into it skates along it, and nothing walks', () => {
  const run = weightless(), p = run.player
  Object.assign(p, { x: 300, y: 820, grounded: false, vx: 130, vy: 70, weightless: 1 })
  for (let i = 0; i < 240 && !p.grounded; i++) steps(run, 1)
  assert.ok(p.grounded); const x = p.x
  steps(run, 120)
  assert.ok(Math.abs(p.x - x) < 15 && p.grounded, `held where it landed: slid ${p.x - x}`)
  assert.ok((p.anim.gait?.moving ?? 0) < .05, 'no walk cycle')
  steps(run, 60, { move: 1, descend: true })
  assert.ok(p.grounded && p.x - x > 20, `Down+Right skates along the floor: ${p.x - x}`)
  assert.ok((p.anim.gait?.moving ?? 0) < .05, 'skating, not walking')
})

test('a fast arrival rebounds however the last step meets the surface', () => {
  for (let k = 0; k < 40; k++) {
    const run = weightless(), p = run.player
    Object.assign(p, { x: 400, y: 670 - k * .05, grounded: false, vx: 0, vy: 380, weightless: 1 })
    let left = false, contact = false
    for (let i = 0; i < 240; i++) { steps(run, 1); contact ||= p.grounded; left ||= contact && !p.grounded }
    assert.ok(left, `offset ${(k * .05).toFixed(2)}: rebounded`)
  }
})

test('lighter gravity gives walking less traction to start and stop with', () => {
  const speedAfter = gravity => {
    const p = createPlayer({ x: 300, y: 920 })
    for (let i = 0; i < 12; i++) stepPlayer(p, { ...NEUTRAL_INPUT, move: 1 }, STEP, [{ x: 0, y: 920, w: 2000, h: 40 }], undefined, undefined, undefined, undefined, gravity)
    return p.vx
  }
  const full = speedAfter(TUNING.gravity), half = speedAfter(TUNING.gravity / 2)
  assert.ok(half < full * .7 && half > full * .3, `half gravity reaches ${half} where full reaches ${full}`)
})

test('boots pushing a body from rest predict its arrival, so one rebounding off a wall comes back feet-first', () => {
  assert.ok(Number.isFinite(weightlessArrivalTime(100, 0, TUNING.zeroGravityThrust)), 'thrust from rest arrives')
  // Hold Right into a wall: a fast arrival rebounds, and the boots bring the body back onto it. It must not lean
  // head-first into the wall it is about to land on again.
  const level = { ...blankTrial(), width: 3000, height: 3000, floor: 3000, entrance: { x: 200, y: 3000 }, goal: { x: 2800, y: 3000 },
    platforms: [{ x: 1500, y: 0, w: 400, h: 3000 }], gravityPlates: [{ id: 'z', x: 0, y: 0, w: 3000, h: 3000, gravity: 0, power: 'always' }] }
  const run = createRun(level), p = run.player; run.started = true
  Object.assign(p, { x: 1200, y: 1500, vx: 0, vy: 0, grounded: false, weightless: 1 })
  let landings = 0, rebounded = false, worstLean = 0
  for (let i = 0; i < 4 / STEP && landings < 2; i++) {
    const was = p.grounded
    stepRun(run, { ...NEUTRAL_INPUT, move: 1 })
    if (!was && p.grounded) landings++
    if (was && !p.grounded && landings) rebounded = true
    if (rebounded && !p.grounded && p.anim.float) worstLean = Math.max(worstLean, Math.abs(p.anim.float.lean))
  }
  assert.ok(rebounded && landings === 2, `rebounded and landed again (${landings} landings)`)
  assert.equal(p.wall, 'right')
  assert.ok(worstLean < .3, `stayed feet-first on the way back (lean up to ${worstLean.toFixed(2)})`)
})

test('a floating body keeps moving its limbs at any speed, kicks as the boots switch, and its lean never steps', () => {
  const p = createPlayer({ x: 300, y: 500 }); Object.assign(p, { grounded: false, weightless: 1 })
  for (let i = 0; i < 60; i++) float(p)
  Object.assign(p, { vx: 300, vy: 0 })
  // Coasting fast, the hands and feet still drift about the body.
  const reach = joint => { const spots = []; for (let i = 0; i < 3 / STEP; i++) { float(p); const pose = athletePose(p); spots.push(joint(pose).map((v, k) => v - pose.hip[k])) }
    return Math.max(...spots.map(a => Math.max(...spots.map(b => Math.hypot(a[0] - b[0], a[1] - b[1]))))) }
  assert.ok(reach(pose => pose.frontArm.end) > 5, 'the hands drift while coasting')
  assert.ok(reach(pose => pose.frontLeg.end) > 5, 'the feet drift while coasting')
  // Switching the boots on and off flexes the knees, and the drawn body turns without a step in its acceleration.
  let kick = 0, worst = 0, angles = []
  for (const input of [{ ...NEUTRAL_INPUT, climb: true }, NEUTRAL_INPUT, { ...NEUTRAL_INPUT, move: -1 }, NEUTRAL_INPUT]) for (let i = 0; i < .6 / STEP; i++) {
    float(p, input); kick = Math.max(kick, Math.abs(p.anim.float.kick ?? 0))
    const pose = athletePose(p); angles.push(Math.atan2(pose.head[1] - pose.hip[1], (pose.head[0] - pose.hip[0]) * p.facing))
    if (angles.length > 2) { const [a, b, c] = angles.slice(-3), wrap = v => Math.atan2(Math.sin(v), Math.cos(v))
      worst = Math.max(worst, Math.abs(wrap(c - b) - wrap(b - a)) / STEP / STEP) }
  }
  assert.ok(kick > .3, `the legs kick as the boots switch (${kick.toFixed(2)})`)
  assert.ok(worst * 180 / Math.PI < 8000, `turn acceleration up to ${(worst * 180 / Math.PI).toFixed(0)}°/s²`)
})

/** A weightless room (the fixture's) with a wall standing in it at x 1500, and these props, set moving; the player
 * parked far away. */
function drifting(props, gravity = 0) {
  const run = fixture('ball', { entrance: { x: 100, y: 1300 }, props: props.map(({ vx, vy, ...prop }) => prop), platforms: [{ x: 1500, y: 100, w: 40, h: 1200 }],
    gravityPlates: [{ id: 'zero-g', x: 20, y: 20, w: 1760, h: 1360, gravity, power: 'always' }] })
  props.forEach(({ vx = 0, vy = 0 }, i) => Object.assign(run.props[i], { vx, vy }))
  return run
}
const until = (run, done, seconds = 4) => { for (let i = 0; i < seconds / STEP && !done(); i++) stepRun(run, NEUTRAL_INPUT) }

test('without weight a fast prop rebounds off a wall, a ball more than a box, and a slow one stays against it', () => {
  for (const [kind, share] of [['ball', .5], ['box', .3]]) {
    const run = drifting([{ kind, x: 1300, y: 700, size: 60, vx: 300 }]), b = run.props[0]
    let before = 0
    until(run, () => { if (b.vx > 1) before = b.vx; return b.vx < -1 })
    close(-b.vx / before, share, .05)
    const room = drifting([{ kind, x: 1440, y: 700, size: 60, vx: 20 }]), slow = room.props[0]
    until(room, () => slow.x > 1469.9, 3)
    for (let i = 0; i < 12; i++) stepRun(room, NEUTRAL_INPUT)
    assert.ok(slow.vx > -1, `a slow ${kind} stays against the wall (${slow.vx.toFixed(2)})`)
  }
})

test('under gravity a prop still lands dead, without bouncing', () => {
  const run = drifting([{ kind: 'ball', x: 900, y: 1000, size: 60, vy: 0 }], 1), b = run.props[0]
  until(run, () => b.grounded, 3)
  for (let i = 0; i < 24; i++) { stepRun(run, NEUTRAL_INPUT); assert.ok(b.vy >= -1e-6, 'no rebound off the floor') }
})

test('without weight a ball striking a resting ball leaves it the faster, and they part', () => {
  const run = drifting([{ kind: 'ball', x: 600, y: 700, size: 60, vx: 250 }, { kind: 'ball', x: 900, y: 700, size: 60 }]), [a, b] = run.props
  until(run, () => b.vx > 1)
  for (let i = 0; i < 12; i++) stepRun(run, NEUTRAL_INPUT)
  close(a.vx / b.vx, 1 / 3, .05)
  for (let i = 0; i < 60; i++) stepRun(run, NEUTRAL_INPUT)
  assert.ok(b.x - a.x > 70, 'they have parted')
})

test('a slow weightless drift settles away in the air instead of stopping dead', () => {
  const run = drifting([{ kind: 'ball', x: 600, y: 700, size: 60, vx: 8 }]), b = run.props[0]
  for (let i = 0; i < 2 / STEP; i++) stepRun(run, NEUTRAL_INPUT)
  close(b.vx, coasted(8, 2), .2)
})

for (const kind of ['box', 'ball']) test(`pushing off a floating ${kind} sends it back, splitting the push by mass`, () => {
  const run = fixture(kind), p = run.player, b = run.props[0]
  p.vy = 30
  for (let i = 0; i < 60; i++) stepRun(run, NEUTRAL_INPUT)
  assert.equal(p.contacts?.support?.collider.prop, b, 'standing on it')
  const before = { player: p.vy, prop: b.vy }
  for (let i = 0; i < 3; i++) stepRun(run, { ...NEUTRAL_INPUT, jump: true })
  const mass = kind === 'box' ? .002 * 60 * 60 : .001 * 2829.8
  // Momentum is conserved: what the player gains upward the prop takes downward.
  close(2.5 * (p.vy - before.player) + mass * (b.vy - before.prop), 0, 25)
  assert.ok(b.vy - before.prop > 20, 'the prop goes the other way')
  assert.ok(-(p.vy - before.player) < TUNING.zeroGravityPushOff, 'a loose prop gives less than a wall')
})

test('boots held at a floating ball push it steadily with the palms on it, not in bumps', () => {
  const run = fixture('ball', { entrance: { x: 300, y: 838 }, props: [{ kind: 'ball', x: 380, y: 838, size: 60 }] }), p = run.player, b = run.props[0]
  let episodes = 0, touching = false, palms = 0, ticks = 0
  for (let i = 0; i < 2.5 / STEP; i++) {
    stepRun(run, { ...NEUTRAL_INPUT, move: 1 })
    const now = !!p.contacts?.body?.some(c => c.collider.prop === b)
    if (now && !touching) episodes++
    touching = now
    if (i > 1 / STEP) { ticks++; if (p.contacts?.push?.floating && p.contacts.push.hands?.palms) palms++ }
  }
  assert.ok(episodes <= 2, `one push, not a string of bumps (${episodes} contacts)`)
  assert.equal(palms, ticks, 'the palms stay on the ball')
  assert.ok(b.vx > 100 && Math.abs(p.vx - b.vx) < 5, 'they travel together')
})

test('coasting at a floating box, the body rolls its feet to it and lands', () => {
  const run = fixture('box', { entrance: { x: 300, y: 838 }, props: [{ kind: 'box', x: 300, y: 600, size: 80 }] }), p = run.player, b = run.props[0]
  p.vy = -160
  let rolled = false
  until(run, () => { rolled ||= !!p.releaseTurn; return p.contacts?.support?.collider.prop === b }, 3)
  assert.ok(rolled, 'rolled feet-first')
  assert.equal(p.contacts?.support?.collider.prop, b, 'landed on the box')
})

for (const kind of ['box', 'ball']) test(`let go after pushing a ${kind} overhead, the body keeps its hands on it, and a jump pushes it away`, () => {
  const run = fixture(kind, { entrance: { x: 300, y: 838 }, props: [{ kind, x: 300, y: 740, size: kind === 'box' ? 80 : 68 }] }), p = run.player, b = run.props[0]
  for (let i = 0; i < 120; i++) stepRun(run, { ...NEUTRAL_INPUT, climb: true })
  assert.ok(b.vy < -40, `Up pushed the ${kind} up`)
  let palms = 0, touching = 0
  for (let i = 0; i < 240; i++) {
    stepRun(run, NEUTRAL_INPUT)
    if (p.contacts?.body?.some(c => c.collider.prop === b)) { touching++; if (p.contacts.push?.floating && p.contacts.push.hands?.palms) palms++ }
  }
  assert.equal(palms, touching, `whenever the body is against the ${kind} its palms are on it`)
  const before = { player: p.vy, prop: b.vy }
  for (let i = 0; i < 6; i++) stepRun(run, { ...NEUTRAL_INPUT, jump: true })
  assert.ok(p.vy - before.player > 50, `the jump pushes the body away from the ${kind}`)
  assert.ok(b.vy - before.prop < -20, `and sends the ${kind} the other way`)
})

for (const kind of ['box', 'ball']) test(`without weight a ${kind} held against a ceiling plate presses it, as contact presses a wall plate`, () => {
  // Up held into the prop pushes it to the plate; then let go, it rests against it.
  const size = kind === 'box' ? 80 : 68
  const run = fixture(kind, { entrance: { x: 300, y: 838 }, props: [{ kind, x: 300, y: 740, size }],
    // A slab's underside inside the weightless field, with the plate on it.
    platforms: [{ x: 0, y: 400, w: 1800, h: 40 }], triggers: [{ x: 250, y: 440, w: 100, targets: [], mode: 'touch', ceiling: true }] }), plate = run.triggers[0]
  let pressed = false
  for (let i = 0; i < 6 / STEP && !pressed; i++) { stepRun(run, { ...NEUTRAL_INPUT, climb: true }); pressed = plate.active }
  assert.ok(pressed, `the ${kind} pressed the plate`)
})

test('under weight a ceiling plate still needs a prop pressed up against it from below, not merely brushing it', () => {
  const level = { ...blankTrial(), entrance: { x: 100, y: 920 }, props: [{ kind: 'ball', x: 300, y: 600, size: 68 }],
    triggers: [{ x: 250, y: 400, w: 100, targets: [], mode: 'touch', ceiling: true }], platforms: [{ x: 200, y: 380, w: 200, h: 20 }] }
  const run = createRun(level); run.started = true
  for (let i = 0; i < 2 / STEP; i++) stepRun(run, NEUTRAL_INPUT)
  assert.equal(run.triggers[0].active, false, 'a ball that fell away from the plate leaves it off')
})
