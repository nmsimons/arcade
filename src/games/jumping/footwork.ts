import type { Platform, Player } from './model.ts'
import { groundAt } from './terrain.ts'
import { platformOutline } from './geometry.ts'
import { canGrip } from './friction.ts'

type Point = [number, number]
export interface FootContact {
  x: number; y: number; anchorX: number; anchorY: number; groundAngle: number; groundY: number
  angle: number; facing: number; planted: boolean; blockedCycle: number
  release: { x: number; y: number; angle: number; time: number; landing?: boolean } | null
  settle: { x: number; y: number; angle: number; facing: number; time: number; duration: number } | null
}
export interface Footwork { feet: [FootContact, FootContact]; moving: boolean; facing: number; terrain: readonly Platform[]; pushBalance?: [Point, Point, Point] }
const TAU = Math.PI * 2
const lerp = (a: number, b: number, t: number) => a + (b - a) * t
const clamp = (n: number) => Math.max(0, Math.min(1, n))
const smooth = (n: number) => { const t = clamp(n); return t * t * (3 - 2 * t) }

// Sample the straight sole too: its endpoints can both clear a convex crown
// while the material between them crosses it. Keep the interval below .5.
export const FOOT_BALL: Point = [2.2, 2.8]
export const FOOT_CONTACT: readonly Point[] = [
  ...Array.from({ length: 8 }, (_, i): Point => [-1.8 + i * .5, 2.8]), FOOT_BALL,
  ...Array.from({ length: 5 }, (_, i): Point => [2.2 + (i + 1) * 2.3 / 5, 2.8]),
  [5.23125, 2.69375], [5.725, 2.375],
  [5.98125, 1.99375], [6, 1.5], [-2.2875, 2.5375], [-2.55, 2.05], [-2.5875, 1.3375], [-2.4, .4], [-1.6, -1.6]]
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

function clearTerrain(foot: FootContact, platforms: readonly Platform[], y: number, bodyX: number) {
  const toe = toeBend(foot.angle - foot.groundAngle * foot.facing)
  // A tall riser is a side contact, not a lower floor beyond the current tread.
  // Keep the whole sole on this side before choosing its supporting surface.
  const sole = FOOT_CONTACT.map(point => footPoint(point, foot.angle, toe)[0] * foot.facing)
  for (const b of platforms) {
    if (Math.max(bodyX, foot.x) + 8 < b.x || Math.min(bodyX, foot.x) - 8 > b.x + b.w) continue
    const points = platformOutline(b), probeY = Math.min(foot.y, y - 2.8)
    for (let i = 0; i < points.length; i++) {
      const a = points[i], end = points[(i + 1) % points.length]
      if (Math.abs(a[0] - end[0]) > 1e-7 || probeY <= Math.min(a[1], end[1]) || probeY >= Math.max(a[1], end[1])) continue
      const normal = Math.sign(end[1] - a[1])
      if ((bodyX - a[0]) * normal < 0) continue
      const intrusion = Math.max(...sole.map(offset => -(foot.x + offset - a[0]) * normal))
      if (intrusion > 0) {
        const shift = (intrusion + .05) * normal
        foot.x += shift
        if (foot.planted) foot.anchorX += shift
      }
    }
  }
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

function plantFoot(foot: FootContact, platforms: readonly Platform[], y: number, bodyX: number) {
  const roll = footRoll(foot.angle - foot.groundAngle * foot.facing)
  const c = Math.cos(foot.groundAngle), s = Math.sin(foot.groundAngle)
  foot.x = foot.anchorX + roll[0] * foot.facing * c - roll[1] * s
  foot.y = foot.anchorY + roll[0] * foot.facing * s + roll[1] * c
  clearTerrain(foot, platforms, y, bodyX)
}

/** Let the pelvis load the planted leg, followed by the chest and head. Resolved
 * short steps drive this balance; a blocked stance relaxes without a free clock. */
function pushBalance(p: Player, previous: Footwork, feet: Footwork['feet'], dt: number): [Point, Point, Point] {
  const swing = feet.find(foot => foot.settle), support = feet.find(foot => foot.planted)
  const phase = p.pushing?.effort && swing?.settle && support ? swing.settle.time / swing.settle.duration : 0
  const wave = (lag: number) => Math.sin(Math.PI * clamp((phase - lag) / (1 - lag))) ** 2
  const transfer = wave(0), chest = wave(.08), head = wave(.14), height = 1.6 * (1 - p.crouch * .5)
  const shift = transfer * Math.max(-1.3, Math.min(1.3, ((support?.x ?? p.x) - p.x) * p.facing * .08))
  const targets: [Point, Point, Point] = [[shift, -transfer * height], [chest * .8, -chest * height], [head * .8, -head * height]]
  return targets.map((target, i): Point => {
    const before = previous.facing === p.facing ? previous.pushBalance?.[i] ?? [0, 0] : [0, 0]
    const delta = target.map((v, j) => (v - before[j]) * (1 - Math.exp(-dt / .05)))
    const rate = Math.min(1, 8 * dt / (Math.hypot(...delta) || 1))
    return delta.map((v, j) => Math.abs(target[j] - before[j]) < .001 ? target[j] : before[j] + v * rate) as Point
  }) as [Point, Point, Point]
}

function settleFeet(p: Player, previous: Footwork, dt: number, platforms: readonly Platform[], advancing = false): Footwork {
  // Bring the stance under the body, keeping both targets on the current platform.
  const surface = p.contacts?.support?.platform ?? groundAt(platforms, p.x, p.y, .15)?.platform
  const margin = Math.min(3, (surface?.w ?? 6) / 2)
  const withinSupport = (x: number) => surface ? Math.max(surface.x + margin, Math.min(surface.x + surface.w - margin, x)) : x
  const center = withinSupport(p.x)
  // Keep the established base while hand contact fades. Retargeting the rear
  // foot with every fraction of that fade lifted it on each brief release.
  const brace = p.pushing?.effort || (p.pushing?.amount ?? 0) > 0 ? 1 : 0
  const shortSteps = p.crouch > 0 || !!p.pushing?.effort
  const stepDistance = 14
  const steppingForward = shortSteps && advancing
  // During a crouch walk or moving push either foot steps ahead of the hips. Keeping one
  // foot permanently behind them stretched that leg on an uphill slope and
  // forced the whole torso to drop abruptly as the other foot took a step.
  const lead = lerp(8, 4, p.crouch)
  const targets = (steppingForward ? [center + lead * p.facing, center + lead * p.facing]
    : [center + 2 * p.facing, center - (2 + brace * 8) * p.facing]).map(target => {
    if (groundAt(platforms, target, p.y)) return target
    const inset = withinSupport(target)
    if (groundAt(platforms, inset, p.y)) return inset
    // A concave support's bounding edge can lie beyond its actual tread. Find
    // the nearby exposed tread toward the supported root, then inset the sole.
    let outside = inset, inside = p.x
    for (let i = 0; i < 12; i++) {
      const middle = (outside + inside) / 2
      if (groundAt(platforms, middle, p.y)) inside = middle
      else outside = middle
    }
    const safe = inside + Math.sign(p.x - inside) * Math.min(3, Math.abs(p.x - inside))
    return groundAt(platforms, safe, p.y) ? safe : inside
  })
  const corrections = previous.feet.map((foot, i) => Math.abs(foot.anchorX - targets[i]) + (foot.facing !== p.facing ? 4 : 0))
  // A braced foot stays planted until the body has actually moved far enough
  // to need another step. Retargeting every fraction of a pixel caused a fast
  // shuffle even when a heavy box was barely moving.
  const needsBrace = !!p.pushing?.effort && Math.abs(previous.feet[0].anchorX - previous.feet[1].anchorX) < 8
  const threshold = steppingForward ? stepDistance : p.pushing?.effort && !needsBrace ? 12 : .15
  // Finish airborne feet first, then reposition the remaining support foot with a small step.
  const adjusting = previous.feet.some(foot => !foot.planted) ? -1
    : corrections[0] >= corrections[1] && corrections[0] > threshold ? 0 : corrections[1] > threshold ? 1 : -1
  const feet = previous.feet.map((before, i): FootContact => {
    const foot = { ...before, release: null }
    if (foot.planted && i !== adjusting) {
      const rest = foot.groundAngle * foot.facing || 0
      foot.angle = lerp(foot.angle, rest, 1 - Math.exp(-dt / .035))
      if (Math.abs(foot.angle - rest) < .001) foot.angle = rest
      plantFoot(foot, platforms, p.y, p.x)
      foot.settle = null
      return foot
    }
    const start = foot.settle ?? { x: foot.x, y: foot.y, angle: foot.angle, facing: foot.facing, time: 0,
      duration: shortSteps ? .24 : .12 + Math.min(.08, Math.abs(foot.x - targets[i]) * .003) }
    // A rolling ball can travel much faster than a heavy box. Complete each
    // step within fourteen units of travel so the planted leg does not drag
    // behind the hips. Crouch walking shares the same cadence as pushing.
    const speed = p.contacts?.motion.speed ?? Math.abs(p.vx)
    const rate = shortSteps ? Math.max(1, speed * start.duration / stepDistance) : 1
    const time = Math.min(start.duration, start.time + dt * rate), t = time / start.duration, blend = smooth(t)
    const lift = .9 + Math.min(2.1, Math.abs(start.x - targets[i]) * .09)
    const target = groundAt(platforms, targets[i], p.y)
    const angle = target?.angle ?? 0, groundY = target?.y ?? p.y
    foot.planted = false; foot.settle = { ...start, time }
    foot.x = lerp(start.x, targets[i], blend)
    foot.angle = lerp(start.angle, angle * p.facing, blend); foot.facing = lerp(start.facing, p.facing, blend)
    foot.groundAngle = angle
    foot.y = lerp(start.y, groundY - 2.8 * Math.cos(angle), blend) - Math.sin(t * Math.PI) ** 2 * lift
    clearTerrain(foot, platforms, p.y, p.x)
    if (t === 1 && target) {
      foot.planted = true; foot.anchorX = targets[i]; foot.anchorY = groundY; foot.angle = angle * p.facing || 0
      foot.facing = p.facing; foot.settle = null; plantFoot(foot, platforms, p.y, p.x)
    }
    return foot
  }) as [FootContact, FootContact]
  return { feet, moving: false, facing: p.facing, terrain: platforms, pushBalance: pushBalance(p, previous, feet, dt) }
}

/** Persistent world-space contacts survive changes in speed and body pose. */
export function advanceFootwork(p: Player, dt: number, oldX: number, platforms: readonly Platform[]) {
  if (!p.grounded || p.hang || p.mantle) { p.footwork = null; return }
  const run = p.gait?.run ?? 0, moving = p.gait?.moving ?? 0
  const profile = strideProfile(run, moving), traveling = Math.abs(p.x - oldX) > .0001
  const makeFoot = (offset: number): FootContact => {
    const x = oldX + offset * p.facing, ground = groundAt(platforms, x, p.y)
    const foot = { x, anchorX: x, anchorY: ground?.y ?? p.y, y: p.y - 2.8, groundAngle: ground?.angle ?? 0, groundY: ground?.y ?? p.y,
      angle: (ground?.angle ?? 0) * p.facing, facing: p.facing, planted: !!ground, blockedCycle: -Infinity, release: null, settle: null }
    plantFoot(foot, platforms, p.y, p.x)
    return foot
  }
  const previous: Footwork = p.footwork ?? { feet: [makeFoot(2), makeFoot(-2)], moving: false, facing: p.facing, terrain: platforms }
  if (!traveling || p.crouch > 0 || p.pushing?.effort) { p.footwork = settleFeet(p, previous, dt, platforms, (p.x - oldX) * p.facing > .0001); return }
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
      plantFoot(foot, platforms, p.y, p.x)
      return foot
    }
    if (foot.settle || rephased) {
      foot.release = { x: foot.x - targetX, y: foot.y - targetY, angle: foot.angle - targetAngle, time: 0 }
    }
    // A changing curved support can expose a much lower walkable floor under
    // the next stride. Carry the actual swing into that landing instead of
    // loading the pelvis in a single tick. A slipping face uses slide entry's
    // own contact handoff, rather than a walking foot trying to land on it.
    // Start this transfer once. On a downhill stride the target keeps getting
    // lower; restarting every tick leaves the shoe behind the moving hips.
    if (!foot.release?.landing && targetGround && canGrip(targetGround.angle) && targetGround.y - foot.groundY > 6) {
      foot.release = { x: foot.x - targetX, y: foot.y - targetY, angle: foot.angle - targetAngle, time: 0, landing: true }
    }
    foot.settle = null
    const release = foot.release, time = (release?.time ?? 0) + dt, weight = 1 - smooth(time / .08)
    foot.x = targetX + (release?.x ?? 0) * weight; foot.y = targetY + (release?.y ?? 0) * weight
    foot.angle = targetAngle + (release?.angle ?? 0) * weight; foot.facing = p.facing
    foot.groundAngle = targetGround?.angle ?? 0
    foot.release = release && weight > 0 ? { ...release, time } : null
    const surface = groundAt(platforms, foot.x, p.y)
    let landingReached = true
    if (release?.landing && surface) {
      const toe = toeBend(foot.angle - foot.groundAngle * foot.facing)
      const bottom = Math.max(...FOOT_CONTACT.map(point => footPoint(point, foot.angle, toe)[1]))
      landingReached = foot.y + bottom >= surface.y - .15
    }
    if (step.planted && lap > foot.blockedCycle && surface && landingReached) {
      foot.planted = true; foot.groundAngle = surface.angle; foot.angle = step.angle + surface.angle * p.facing; foot.release = null
      const roll = footRoll(step.angle), c = Math.cos(surface.angle), s = Math.sin(surface.angle)
      foot.anchorX = foot.x - roll[0] * foot.facing * c + roll[1] * s
      foot.anchorY = groundAt(platforms, foot.anchorX, p.y)?.y ?? surface.y
      plantFoot(foot, platforms, p.y, p.x)
    }
    else clearTerrain(foot, platforms, p.y, p.x)
    return foot
  }) as [FootContact, FootContact]
  p.footwork = { feet, moving: traveling, facing: p.facing, terrain: platforms, pushBalance: pushBalance(p, previous, feet, dt) }
}
