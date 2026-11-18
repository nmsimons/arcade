import test from 'node:test'
import assert from 'node:assert/strict'
import { blankTrial } from '../src/games/jumping/level.ts'
import { createRun, stepRun } from './helpers/jumping-active-run.mjs'
import { NEUTRAL_INPUT, STEP, TUNING } from '../src/games/jumping/model.ts'
import { athletePose } from '../src/games/jumping/athlete.ts'
import { wallFrameAngle } from '../src/games/jumping/wallFrame.ts'
import { weightlessCoastDistance } from '../src/games/jumping/movementTuning.ts'

const unit = (x, y) => [x / Math.hypot(x, y), y / Math.hypot(x, y)]
// Every kind of surface a weightless body can meet, approached at many speeds and angles of attack, coasting or with
// the boots held toward it. Each surface stands alone in a large weightless room.
//   normal: the surface's outward normal; contact: a point on its face; footing: the frame the body should land in.
const SURFACES = {
  floor: { normal: [0, -1], contact: [1500, 2000], footing: 'floor', platform: { x: 0, y: 2000, w: 3000, h: 400 } },
  ceiling: { normal: [0, 1], contact: [1500, 1000], footing: 'ceiling', platform: { x: 0, y: 600, w: 3000, h: 400 } },
  'wall facing left': { normal: [-1, 0], contact: [1500, 1500], footing: 'right', platform: { x: 1500, y: 0, w: 400, h: 3000 } },
  'wall facing right': { normal: [1, 0], contact: [1500, 1500], footing: 'left', platform: { x: 1100, y: 0, w: 400, h: 3000 } },
  // A 25° ramp rising to the right, and an underside sloping the same way.
  ramp: { normal: unit(-1400, -3000), contact: [1500, 2400], footing: 'floor',
    platform: { x: 0, y: 1700, w: 3000, h: 1400, polygon: [[0, 1400], [3000, 1400], [3000, 0]] } },
  'sloping ceiling': { normal: unit(1400, 3000), contact: [1500, 1300], footing: 'ceiling',
    platform: { x: 0, y: 600, w: 3000, h: 1400, polygon: [[0, 0], [3000, 0], [0, 1400]] } },
  // A steep face leaning back at 75°: a wall, met with its tilt.
  'leaning wall': { normal: unit(-3000, -800), contact: [1900, 1500], footing: 'right',
    platform: { x: 1500, y: 0, w: 800, h: 3000, polygon: [[0, 3000], [800, 0], [800, 3000]] } },
  // Frictionless footing cannot hold a landing's drift: the body stays on it but glides.
  'frictionless floor': { normal: [0, -1], contact: [1500, 2000], footing: 'floor', slick: true, platform: { x: 0, y: 2000, w: 3000, h: 400, frictionless: true } },
}
// Arrival speeds either side of the stick limit, and angles of attack from the surface normal (degrees).
const SPEEDS = [70, 120, 160, 185, 240, 340, 460]
const ANGLES = [-60, -35, 0, 35, 60]

function room(surface) {
  const level = { ...blankTrial(), width: 3000, height: 3000, floor: 3000, entrance: { x: 200, y: 3000 }, goal: { x: 2800, y: 3000 },
    platforms: [surface.platform], gravityPlates: [{ id: 'z', x: 0, y: 0, w: 3000, h: 3000, gravity: 0, power: 'always' }] }
  const run = createRun(level); run.started = true
  return run
}
const footingOf = p => p.wall ?? (p.inverted ? 'ceiling' : 'floor')
/** Drawn joints in the world, as athleteDraw places them. */
function joints(p) {
  const pose = athletePose(p), angle = wallFrameAngle(p.wall), c = Math.cos(angle), s = Math.sin(angle)
  return [pose.head, pose.shoulder, pose.hip, pose.frontArm.end, pose.backArm.end, pose.frontLeg.end, pose.backLeg.end].map(([x, y]) => {
    const lx = x * p.facing, ly = y * (p.inverted ? -1 : 1)
    return [lx * c - ly * s, lx * s + ly * c]
  })
}

/** Send a weightless body at `speed` toward `surface`, `angle` degrees off its normal, and watch what happens. */
function approach(surface, speed, angle, thrust) {
  const run = room(surface), p = run.player
  const [nx, ny] = surface.normal, a = angle * Math.PI / 180
  // Travel is into the surface (against its normal), turned by the angle of attack.
  const dx = -nx * Math.cos(a) - -ny * Math.sin(a), dy = -ny * Math.cos(a) + -nx * Math.sin(a)
  // Start far enough out for a feet-first roll, near enough that a coast still arrives.
  const distance = Math.min(420, .6 * weightlessCoastDistance(speed, 12))
  // The body's middle heads for half its height off the surface: where feet-first it meets it.
  const center = [surface.contact[0] + nx * TUNING.height / 2 - dx * distance, surface.contact[1] + ny * TUNING.height / 2 - dy * distance]
  // Float still at the start point first, so the drawn float has settled, then set off.
  Object.assign(p, { x: center[0], y: center[1] + TUNING.height / 2, vx: 0, vy: 0, grounded: false, coyote: 0, weightless: 1, facing: dx >= 0 ? 1 : -1 })
  for (let i = 0; i < .5 / STEP; i++) { stepRun(run, NEUTRAL_INPUT); Object.assign(p, { x: center[0], y: center[1] + TUNING.height / 2, vx: 0, vy: 0 }) }
  Object.assign(p, { vx: dx * speed, vy: dy * speed })
  const input = thrust ? { ...NEUTRAL_INPUT, move: Math.abs(dx) > .3 ? Math.sign(dx) : 0, climb: dy < -.3, descend: dy > .3 } : NEUTRAL_INPUT
  const result = { arrival: null, footing: null, landedAt: null, leftAt: null, departure: null, deadStop: null, snap: 0, landedX: 0, landedY: 0, rest: [] }
  let before = joints(p), previous = before
  for (let i = 0; i < 6 / STEP; i++) {
    const vx = p.vx, vy = p.vy, was = p.grounded, into = -(vx * nx + vy * ny)
    // Hold the boots on only until the surface is reached; then let go and see whether the body stays.
    stepRun(run, result.landedAt === null ? input : NEUTRAL_INPUT)
    const now = joints(p)
    if (!was && !p.grounded && result.landedAt === null) {
      // Joint motion relative to the root: the second difference of each drawn joint between steps.
      for (let j = 0; j < now.length; j++) {
        const jerk = Math.hypot(now[j][0] - 2 * previous[j][0] + before[j][0], now[j][1] - 2 * previous[j][1] + before[j][1])
        result.snap = Math.max(result.snap, jerk)
      }
      // A body moving into a surface must not stop dead in the air (only a ground contact may take its speed).
      const after = -(p.vx * nx + p.vy * ny)
      if (into > 60 && after < into * .2 && result.deadStop === null) result.deadStop = { step: i, from: into, to: after, footing: footingOf(p), turning: !!p.releaseTurn }
    }
    before = previous; previous = now
    if (!was && p.grounded && result.landedAt === null) {
      result.landedAt = i; result.arrival = into; result.footing = footingOf(p); result.landedX = p.x; result.landedY = p.y
      // Feet that met the surface as the roll finished stop a step before they are grounded there: one arrival.
      if (result.deadStop && i - result.deadStop.step <= .1 / STEP && result.deadStop.from <= TUNING.zeroGravityStick) {
        result.arrival = result.deadStop.from; result.deadStop = null
      }
    }
    if (result.landedAt !== null && was && !p.grounded && result.leftAt === null) {
      result.leftAt = i; result.departure = p.vx * nx + p.vy * ny
    }
    if (result.landedAt !== null && result.leftAt === null && i - result.landedAt > 1 / STEP) result.rest.push([p.x, p.y])
    if (result.leftAt !== null && i - result.leftAt > .3 / STEP) break
    if (result.landedAt !== null && i - result.landedAt > 2 / STEP) break
  }
  return result
}

for (const [name, surface] of Object.entries(SURFACES)) for (const thrust of [false, true]) {
  test(`weightless arrivals on a ${name}, ${thrust ? 'with the boots held toward it' : 'coasting'}, land feet-first and stay or rebound by speed`, () => {
    const problems = []
    for (const speed of SPEEDS) for (const angle of ANGLES) {
      const label = `${speed} px/s at ${angle}°`, r = approach(surface, speed, angle, thrust)
      if (r.deadStop) { problems.push(`${label}: stopped dead in the air (${r.deadStop.from.toFixed(0)} to ${r.deadStop.to.toFixed(0)}, ${r.deadStop.turning ? 'mid-roll' : 'not rolling'}) without landing feet-first`); continue }
      if (r.landedAt === null) { problems.push(`${label}: never landed`); continue }
      if (r.footing !== surface.footing) problems.push(`${label}: landed in the ${r.footing} frame, not feet-first on it`)
      if (r.snap > 3) problems.push(`${label}: drawn pose jerked ${r.snap.toFixed(1)} px in flight`)
      const fast = r.arrival > TUNING.zeroGravityStick
      if (fast) {
        if (r.leftAt === null) { problems.push(`${label}: arrived at ${r.arrival.toFixed(0)} into it and stuck`); continue }
        const expected = r.arrival * TUNING.zeroGravityRebound
        if (Math.abs(r.departure - expected) > Math.max(8, expected * .15)) problems.push(`${label}: left at ${r.departure.toFixed(0)}, expected about ${expected.toFixed(0)}`)
        const absorbed = (r.leftAt - r.landedAt) * STEP
        if (absorbed < TUNING.zeroGravityAbsorbTime - .02) problems.push(`${label}: left after ${absorbed.toFixed(2)} s without absorbing`)
      } else {
        if (r.leftAt !== null) { problems.push(`${label}: arrived at ${r.arrival.toFixed(0)} and drifted off`); continue }
        const [x, y] = r.rest.at(-1) ?? [r.landedX, r.landedY]
        if (!surface.slick && Math.hypot(x - r.landedX, y - r.landedY) > 25) problems.push(`${label}: slid ${Math.hypot(x - r.landedX, y - r.landedY).toFixed(0)} px after landing`)
        if (surface.slick) continue
        const jitter = Math.max(0, ...r.rest.map(([rx, ry]) => Math.hypot(rx - x, ry - y)))
        if (jitter > .05) problems.push(`${label}: resting position wandered ${jitter.toFixed(2)} px`)
      }
    }
    assert.deepEqual(problems, [])
  })
}
