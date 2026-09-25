import type { Platform, Player } from './model.ts'
import { groundAt } from './terrain.ts'

type Point = [number, number]
export interface FootContact {
  x: number; y: number; anchorX: number; anchorY: number; groundAngle: number; groundY: number
  angle: number; facing: number; planted: boolean; blockedCycle: number
  release: { x: number; y: number; angle: number; time: number } | null
  settle: { x: number; y: number; angle: number; facing: number; time: number; duration: number } | null
}
export interface Footwork { feet: [FootContact, FootContact]; moving: boolean; facing: number; terrain: readonly Platform[] }
const TAU = Math.PI * 2
const lerp = (a: number, b: number, t: number) => a + (b - a) * t
const clamp = (n: number) => Math.max(0, Math.min(1, n))
const smooth = (n: number) => { const t = clamp(n); return t * t * (3 - 2 * t) }

// The curved heel and sole are shared with the renderer's ground-clearance check.
export const FOOT_BALL: Point = [2.2, 2.8]
export const FOOT_CONTACT: readonly Point[] = [[-1.8, 2.8], FOOT_BALL, [4.5, 2.8], [5.23125, 2.69375], [5.725, 2.375],
  [5.98125, 1.99375], [6, 1.5], [-2.55, 2.05], [-2.5875, 1.3375], [-2.4, .4], [-1.6, -1.6]]
export function toeBend(angle: number, load = 1) {
  const pitch = Math.atan2(Math.sin(angle), Math.cos(angle))
  return -Math.max(0, Math.min(1.05, pitch)) * lerp(.15, 1, clamp(load))
}
/** The forefoot rotates independently around the ball; the heel stays with the ankle. */
export function footPoint(point: Point, angle: number, toeAngle: number, toe = point[0] > FOOT_BALL[0]): Point {
  let [x, y] = point
  if (toe) {
    const dx = x - FOOT_BALL[0], dy = y - FOOT_BALL[1], c = Math.cos(toeAngle), s = Math.sin(toeAngle)
    x = FOOT_BALL[0] + dx * c - dy * s; y = FOOT_BALL[1] + dx * s + dy * c
  }
  const c = Math.cos(angle), s = Math.sin(angle)
  return [x * c - y * s, x * s + y * c]
}
export function soleContact(angle: number, toeAngle = toeBend(angle)): Point {
  return FOOT_CONTACT.map(point => footPoint(point, angle, toeAngle)).reduce((a, b) => a[1] > b[1] ? a : b)
}
export function footRoll(angle: number): Point {
  if (angle >= 0) {
    // The ball and toes stay put while the heel rises around their shared hinge.
    const ball = footPoint(FOOT_BALL, angle, 0)
    return [FOOT_BALL[0] - ball[0], -ball[1]]
  }
  // Integrating the contact radius lets the heel/forefoot roll without sliding.
  const steps = 12, h = angle / steps
  let x = 0
  for (let i = 0; i <= steps; i++) x += soleContact(i * h)[1] * (i === 0 || i === steps ? 1 : i % 2 ? 4 : 2)
  return [x * h / 3, -soleContact(angle)[1]]
}
function stanceAngle(phase: number, run: number) {
  return -lerp(.12, .1, run) * (1 - smooth(phase / .18)) + lerp(.48, .65, run) * smooth((phase - .58) / .42)
}

export function strideProfile(run: number, moving = 1) {
  const scale = lerp(.25, 1, moving), duty = lerp(.55, .3, run)
  const lead = lerp(10, 18, run) * scale, trail = lerp(12, 13, run) * scale
  return { duty, lead, trail, scale, length: (lead + trail) / duty }
}

/** The stance moves backward exactly one world unit per unit of body travel. */
export function sampleStride(cycle: number, run: number, moving = 1) {
  const phase = ((cycle / TAU) % 1 + 1) % 1
  const { duty, lead, trail, scale, length } = strideProfile(run, moving)
  if (phase < duty) {
    const angle = stanceAngle(phase / duty, run), roll = footRoll(angle)
    return { ankle: [lead - phase * length + roll[0], roll[1]] as Point, angle, planted: true }
  }
  const t = (phase - duty) / (1 - duty)
  const toeAngle = stanceAngle(1, run), heelAngle = stanceAngle(0, run), toe = footRoll(toeAngle), heel = footRoll(heelAngle)
  const keys = [
    [0, -trail + toe[0], toe[1], toeAngle],
    [.2, lerp(-15, -20, run) * scale, -2.8 - lerp(3.2, 10.2, run) * scale, lerp(.35, .8, run)],
    [.42, lerp(-6, -14, run) * scale, -2.8 - lerp(7.2, 16.2, run) * scale, lerp(.4, .9, run)],
    [.62, lerp(6, 1, run) * scale, -2.8 - lerp(5.2, 11.7, run) * scale, lerp(-.15, -.25, run)],
    [.82, lead, -2.8 - lerp(2.2, 9.2, run) * scale, lerp(-.1, -.35, run)],
    [1, lead + heel[0], heel[1], heelAngle],
  ]
  const index = keys.findIndex((key, i) => i > 0 && key[0] >= t)
  const a = keys[index - 1], b = keys[index], span = b[0] - a[0], u = (t - a[0]) / span
  const tangent = (i: number, axis: number) => {
    if (i === 0 || i === keys.length - 1) return axis === 1 ? -length * (1 - duty) : 0
    const before = keys[i - 1], key = keys[i], after = keys[i + 1]
    const incoming = (key[axis] - before[axis]) / (key[0] - before[0])
    const outgoing = (after[axis] - key[axis]) / (after[0] - key[0])
    return incoming * outgoing <= 0 ? 0 : 2 * incoming * outgoing / (incoming + outgoing)
  }
  const sample = (axis: number) => (2 * u ** 3 - 3 * u ** 2 + 1) * a[axis]
    + (u ** 3 - 2 * u ** 2 + u) * span * tangent(index - 1, axis)
    + (-2 * u ** 3 + 3 * u ** 2) * b[axis] + (u ** 3 - u ** 2) * span * tangent(index, axis)
  return { ankle: [sample(1), sample(2)] as Point, angle: sample(3), planted: false }
}

function clearTerrain(foot: FootContact, platforms: readonly Platform[], y: number) {
  const toe = toeBend(foot.angle - foot.groundAngle * foot.facing)
  // A planted sole follows the actual surface even when its roll crosses a
  // crease below the anchor's tangent plane. Swinging feet only move upward.
  let penetration = foot.planted ? -Infinity : 0
  for (const point of FOOT_CONTACT) {
    const sole = footPoint(point, foot.angle, toe)
    const surface = groundAt(platforms, foot.x + sole[0] * foot.facing, y)
    if (surface) penetration = Math.max(penetration, foot.y + sole[1] - surface.y)
  }
  if (Number.isFinite(penetration)) foot.y -= penetration
  foot.groundY = groundAt(platforms, foot.x, y)?.y ?? y
}

function plantFoot(foot: FootContact, platforms: readonly Platform[], y: number) {
  const roll = footRoll(foot.angle - foot.groundAngle * foot.facing)
  const c = Math.cos(foot.groundAngle), s = Math.sin(foot.groundAngle)
  foot.x = foot.anchorX + roll[0] * foot.facing * c - roll[1] * s
  foot.y = foot.anchorY + roll[0] * foot.facing * s + roll[1] * c
  clearTerrain(foot, platforms, y)
}

function settleFeet(p: Player, previous: Footwork, dt: number, platforms: readonly Platform[], advancing = false): Footwork {
  // Bring the stance under the body, keeping both targets on the current platform.
  const surface = p.contacts?.support?.platform ?? groundAt(platforms, p.x, p.y, .15)?.platform
  const center = surface ? Math.max(surface.x + 3, Math.min(surface.x + surface.w - 3, p.x)) : p.x
  const brace = p.pushing?.amount ?? 0
  const pushingForward = !!p.pushing?.effort && advancing
  // During a moving push either foot steps ahead of the hips. Keeping one
  // foot permanently behind them stretched that leg on an uphill slope and
  // forced the whole torso to drop abruptly as the other foot took a step.
  const targets = pushingForward ? [center + 8 * p.facing, center + 8 * p.facing]
    : [center + 2 * p.facing, center - (2 + brace * 8) * p.facing]
  const corrections = previous.feet.map((foot, i) => Math.abs(foot.anchorX - targets[i]) + (foot.facing !== p.facing ? 4 : 0))
  // A braced foot stays planted until the body has actually moved far enough
  // to need another step. Retargeting every fraction of a pixel caused a fast
  // shuffle even when a heavy box was barely moving.
  const threshold = pushingForward ? 14 : p.pushing?.effort ? 12 : .15
  // Finish airborne feet first, then reposition the remaining support foot with a small step.
  const adjusting = previous.feet.some(foot => !foot.planted) ? -1
    : corrections[0] >= corrections[1] && corrections[0] > threshold ? 0 : corrections[1] > threshold ? 1 : -1
  const feet = previous.feet.map((before, i): FootContact => {
    const foot = { ...before, release: null }
    if (foot.planted && i !== adjusting) {
      const rest = foot.groundAngle * foot.facing || 0
      foot.angle = lerp(foot.angle, rest, 1 - Math.exp(-dt / .035))
      if (Math.abs(foot.angle - rest) < .001) foot.angle = rest
      plantFoot(foot, platforms, p.y)
      foot.settle = null
      return foot
    }
    const start = foot.settle ?? { x: foot.x, y: foot.y, angle: foot.angle, facing: foot.facing, time: 0,
      duration: p.pushing?.effort ? .24 : .12 + Math.min(.08, Math.abs(foot.x - targets[i]) * .003) }
    // A rolling ball can travel much faster than a heavy box. Complete each
    // step within fourteen units of body travel so the planted leg does not
    // get dragged behind and pull the whole torso toward the floor.
    const speed = p.contacts?.motion.speed ?? Math.abs(p.vx)
    const rate = p.pushing?.effort ? Math.max(1, speed * start.duration / 14) : 1
    const time = Math.min(start.duration, start.time + dt * rate), t = time / start.duration, blend = smooth(t)
    const lift = .9 + Math.min(2.1, Math.abs(start.x - targets[i]) * .09)
    const target = groundAt(platforms, targets[i], p.y)
    const angle = target?.angle ?? 0, groundY = target?.y ?? p.y
    foot.planted = false; foot.settle = { ...start, time }
    foot.x = lerp(start.x, targets[i], blend)
    foot.angle = lerp(start.angle, angle * p.facing, blend); foot.facing = lerp(start.facing, p.facing, blend)
    foot.groundAngle = angle
    foot.y = lerp(start.y, groundY - 2.8 * Math.cos(angle), blend) - Math.sin(t * Math.PI) ** 2 * lift
    clearTerrain(foot, platforms, p.y)
    if (t === 1 && target) {
      foot.planted = true; foot.anchorX = targets[i]; foot.anchorY = groundY; foot.angle = angle * p.facing || 0
      foot.facing = p.facing; foot.settle = null; plantFoot(foot, platforms, p.y)
    }
    return foot
  }) as [FootContact, FootContact]
  return { feet, moving: false, facing: p.facing, terrain: platforms }
}

/** Persistent world-space contacts survive changes in speed, charge and body pose. */
export function advanceFootwork(p: Player, dt: number, oldX: number, platforms: readonly Platform[]) {
  if (!p.grounded || p.hang || p.mantle) { p.footwork = null; return }
  const run = p.gait?.run ?? 0, moving = p.gait?.moving ?? 0
  const profile = strideProfile(run, moving), traveling = Math.abs(p.x - oldX) > .0001
  const makeFoot = (offset: number): FootContact => {
    const x = oldX + offset * p.facing, ground = groundAt(platforms, x, p.y)
    const foot = { x, anchorX: x, anchorY: ground?.y ?? p.y, y: p.y - 2.8, groundAngle: ground?.angle ?? 0, groundY: ground?.y ?? p.y,
      angle: (ground?.angle ?? 0) * p.facing, facing: p.facing, planted: !!ground, blockedCycle: -Infinity, release: null, settle: null }
    plantFoot(foot, platforms, p.y)
    return foot
  }
  const previous: Footwork = p.footwork ?? { feet: [makeFoot(2), makeFoot(-2)], moving: false, facing: p.facing, terrain: platforms }
  if (!traveling || p.pushing?.effort) { p.footwork = settleFeet(p, previous, dt, platforms, (p.x - oldX) * p.facing > .0001); return }
  const rephased = traveling && (!previous.moving || previous.facing !== p.facing)
  if (rephased) {
    const support = previous.feet[0].planted !== previous.feet[1].planted ? (previous.feet[0].planted ? 0 : 1)
      : (previous.feet[0].x - previous.feet[1].x) * p.facing >= 0 ? 0 : 1
    const relativeX = (previous.feet[support].x - p.x) * p.facing
    const phase = Math.max(.02, Math.min(profile.duty - .02, (profile.lead - relativeX) / profile.length))
    p.stride = (phase + (support ? .5 : 0)) * TAU * p.facing
  } else if (traveling) p.stride += Math.abs(p.x - oldX) / profile.length * TAU * p.facing
  const feet = previous.feet.map((before, index): FootContact => {
    const foot = { ...before }, cycle = p.stride * p.facing + index * Math.PI
    if (rephased) foot.blockedCycle = -1
    const lap = Math.floor(cycle / TAU), step = sampleStride(cycle, run, moving)
    const targetX = p.x + step.ankle[0] * p.facing
    const targetGround = groundAt(platforms, targetX, p.y)
    const targetY = (targetGround?.y ?? p.y) + step.ankle[1], targetAngle = step.angle + (targetGround?.angle ?? 0) * p.facing
    if (foot.planted && traveling && (!step.planted || Math.abs(foot.x - p.x) > 21)) {
      foot.planted = false; foot.blockedCycle = lap
      foot.release = { x: foot.x - targetX, y: foot.y - targetY, angle: foot.angle - targetAngle, time: 0 }
    }
    if (foot.planted) {
      foot.angle = lerp(foot.angle, step.angle + foot.groundAngle * foot.facing, 1 - Math.exp(-dt / .02))
      plantFoot(foot, platforms, p.y)
      return foot
    }
    if (foot.settle || rephased) {
      foot.release = { x: foot.x - targetX, y: foot.y - targetY, angle: foot.angle - targetAngle, time: 0 }
    }
    foot.settle = null
    const release = foot.release, time = (release?.time ?? 0) + dt, weight = 1 - smooth(time / .08)
    foot.x = targetX + (release?.x ?? 0) * weight; foot.y = targetY + (release?.y ?? 0) * weight
    foot.angle = targetAngle + (release?.angle ?? 0) * weight; foot.facing = p.facing
    foot.groundAngle = targetGround?.angle ?? 0
    foot.release = release && weight > 0 ? { ...release, time } : null
    const surface = groundAt(platforms, foot.x, p.y)
    if (step.planted && lap > foot.blockedCycle && surface) {
      foot.planted = true; foot.groundAngle = surface.angle; foot.angle = step.angle + surface.angle * p.facing; foot.release = null
      const roll = footRoll(step.angle), c = Math.cos(surface.angle), s = Math.sin(surface.angle)
      foot.anchorX = foot.x - roll[0] * foot.facing * c + roll[1] * s
      foot.anchorY = groundAt(platforms, foot.anchorX, p.y)?.y ?? surface.y
      plantFoot(foot, platforms, p.y)
    }
    else clearTerrain(foot, platforms, p.y)
    return foot
  }) as [FootContact, FootContact]
  p.footwork = { feet, moving: traveling, facing: p.facing, terrain: platforms }
}
