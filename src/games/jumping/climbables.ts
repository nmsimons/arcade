import type { GaitPose, Platform, Player } from './model.ts'
import type { Footwork } from './footwork.ts'

export type Point = [number, number]
export interface Ladder { x: number; top: number; bottom: number; platform: number; side: number }
export interface Rope { x: number; y: number; length: number; segments: number }
export interface ClimbableWorld { ladders: readonly Ladder[]; ropes: readonly Rope[] }
export const CLIMBABLES: ClimbableWorld = {
  ladders: [{ x: 1134, top: 400, bottom: 620, platform: 4, side: 1 }, { x: 2244, top: 490, bottom: 620, platform: 5, side: 1 }],
  ropes: [{ x: 1535, y: 240, length: 320, segments: 24 }, { x: 1800, y: 190, length: 370, segments: 28 }],
}
export const NO_CLIMBABLES: ClimbableWorld = { ladders: [], ropes: [] }
export interface RopeNode { x: number; y: number; oldX: number; oldY: number }
export interface RopeState { definition: Rope; nodes: RopeNode[]; pumpInput: number }
export interface Climbing {
  kind: 'ladder' | 'rope'; index: number; distance: number; time: number; direction: number; swing: number; lean: number; hangBlend: number; swingVelocity: number
  ladder: Ladder | null; rope: RopeState | null
  caught: { x: number; y: number; vx: number; vy: number; stride: number; grounded: boolean; gait: GaitPose | null; footwork: Footwork | null; hang?: Player['hang'] }
}
const clamp = (v: number, low: number, high: number) => Math.max(low, Math.min(high, v))
export const ease = (v: number) => { const t = clamp(v, 0, 1); return t * t * (3 - 2 * t) }

export function createRope(definition: Rope): RopeState {
  return { definition, pumpInput: 0, nodes: Array.from({ length: definition.segments + 1 }, (_, i) => {
    const y = definition.y + definition.length * i / definition.segments
    return { x: definition.x, y, oldX: definition.x, oldY: y }
  }) }
}

/** Material distance along the rope, including its tangent beyond the free end. */
export function ropePoint(rope: RopeState, distance: number, previous = false): Point {
  const spacing = rope.definition.length / rope.definition.segments, position = Math.max(0, distance / spacing)
  const index = Math.min(rope.nodes.length - 2, Math.floor(position)), t = position - index
  const a = rope.nodes[index], b = rope.nodes[index + 1]
  return previous ? [a.oldX + (b.oldX - a.oldX) * t, a.oldY + (b.oldY - a.oldY) * t]
    : [a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t]
}
export function climbPoint(climb: Climbing, distance: number): Point {
  return climb.rope ? ropePoint(climb.rope, distance) : [climb.ladder!.x, climb.ladder!.top + distance]
}
export function climbNormal(climb: Climbing, distance: number): Point {
  const a = climbPoint(climb, distance - 1), b = climbPoint(climb, distance + 1)
  const dx = b[0] - a[0], dy = b[1] - a[1], length = Math.hypot(dx, dy) || 1
  return [dy / length, -dx / length]
}
export function climbBody(climb: Climbing, distance: number, offset: number, facing: number): Point {
  const point = climbPoint(climb, distance), normal = climbNormal(climb, distance)
  return [point[0] - normal[0] * offset * facing, point[1] - normal[1] * offset * facing]
}
/** A support stays at one rung/material point while the opposite limb takes a step. */
export function climbContact(distance: number, offset: number) {
  const stride = 28, position = (distance + offset) / stride, step = Math.floor(position), phase = position - step
  const swing = clamp((phase - .55) / .45, 0, 1)
  return { distance: (step + ease(swing)) * stride, lift: Math.sin(swing * Math.PI), planted: phase <= .55 }
}
/** One powerful stroke skips a rung. The body follows the gripping hands and supporting foot. */
export function climbGait(distance: number, handLimit = Infinity, footLimit = Infinity) {
  const hands = [4, 18].map(offset => ({ ...climbContact(distance, offset), distance: Math.min(handLimit, climbContact(distance, offset).distance) }))
  const feet = [46, 60].map(offset => ({ ...climbContact(distance, offset), distance: Math.min(footLimit, climbContact(distance, offset).distance) }))
  const shoulder = (hands[0].distance + hands[1].distance) / 2 + 4.2
  const hip = Math.max(shoulder + 16.6, Math.max(...feet.map(f => f.distance)) - 32.6)
  return { hands, feet, shoulder, hip, waist: shoulder + (hip - shoulder) * .6, head: shoulder - 7.3, root: hip + 32 }
}

/** Keep the player/camera under the loaded grip, rather than following the rope's loose tail. */
export function climbRoot(climb: Climbing, facing: number): Point {
  const gait = climbGait(climb.distance, climb.rope?.definition.length, climb.ladder ? climb.ladder.bottom - climb.ladder.top : undefined)
  const root = climbBody(climb, gait.root, 0, facing), hanging = ease(climb.hangBlend)
  if (!climb.rope || !hanging) return root
  const grip = Math.min(...gait.hands.map(hand => hand.distance))
  const hands = gait.hands.map(hand => climbPoint(climb, hand.distance + (grip - hand.distance) * hanging))
  const spread = 3.9 * (1 - ease(Math.abs(climb.lean) / .65)), out = climb.lean * 7
  const pump = ropePump(climb)
  const x = (hands[0][0] + hands[1][0]) / 2 + out + pump.hip[0]
  const y = (hands[0][1] + hands[1][1]) / 2 + Math.sqrt(18.8 ** 2 - (Math.abs(out) + spread) ** 2) - .7 + pump.hip[1] + 32
  return [root[0] + (x - root[0]) * hanging, root[1] + (y - root[1]) * hanging]
}

/** Gather before the swing accelerates in the requested direction, then unfold with its momentum. */
export function ropePump(climb: Climbing) {
  const direction = Math.sign(climb.lean), turn = ease(Math.abs(climb.lean) / .65)
  const gather = Math.abs(climb.lean) * (1 - clamp(climb.lean * climb.swingVelocity, 0, 1))
  const chestAngle = climb.lean * .18 + direction * gather * .28
  const hipAngle = climb.lean * .62 + direction * gather * .6
  const waist: Point = [Math.sin(chestAngle) * 10.1, Math.cos(chestAngle) * 10.1]
  const hip: Point = [waist[0] + Math.sin(hipAngle) * 6.5, waist[1] + Math.cos(hipAngle) * 6.5]
  const frontFoot: Point = [climb.lean * (16 + gather * 8), 29 - turn * 5 - gather * 16]
  const backFoot: Point = [climb.lean * (9 + gather * 8), 28.5 - gather * 14]
  return { waist, hip, frontFoot, backFoot }
}

/** Verlet particles, distance constraints, an anchored top and a heavier loaded grip. */
export function stepRope(rope: RopeState, dt: number, platforms: readonly Platform[], load: { distance: number; move: number } | null) {
  const { nodes, definition } = rope, length = definition.length / definition.segments
  const loaded = load ? clamp(Math.round((load.distance + 6) / length), 1, nodes.length - 1) : -1
  const weight = (i: number) => i === 0 ? 0 : i === loaded ? .08 : 1
  const damping = Math.exp(-.4 * dt)
  const move = clamp(load?.move ?? 0, -1, 1)
  let pumpX = 0, pumpY = 0
  if (loaded > 0) {
    const grip = nodes[loaded], rx = grip.x - definition.x, ry = grip.y - definition.y
    const radius = Math.hypot(rx, ry) || length, tx = ry / radius, ty = -rx / radius
    const velocity = ((grip.x - grip.oldX) * tx + (grip.y - grip.oldY) * ty) / dt
    // Shifting weight gives a finite kick. Holding a direction adds energy only while swinging that way.
    // At a turning point the pump vanishes, so it cannot balance gravity and suspend the rope sideways.
    const shift = Math.sign(move - rope.pumpInput) === Math.sign(move) ? move - rope.pumpInput : 0
    const energy = .5 * velocity * velocity + 1400 * (radius - ry)
    const effort = 1 - ease((energy / (1400 * radius) - .3) / .35)
    const pump = (shift * 100 + move * 950 * clamp(Math.sign(move) * velocity / 120, 0, 1) * dt) * effort
    pumpX = tx * pump * dt; pumpY = ty * pump * dt
  }
  rope.pumpInput = move
  for (let i = 1; i < nodes.length; i++) {
    const n = nodes[i], dx = (n.x - n.oldX) * damping, dy = (n.y - n.oldY) * damping
    n.oldX = n.x; n.oldY = n.y
    n.x += dx + (i === loaded ? pumpX : 0); n.y += dy + 1400 * dt * dt + (i === loaded ? pumpY : 0)
  }
  for (let pass = 0; pass < 32; pass++) {
    nodes[0].x = definition.x; nodes[0].y = definition.y
    for (let j = 1; j < nodes.length; j++) {
      const i = pass % 2 ? nodes.length - j : j, a = nodes[i - 1], b = nodes[i]
      const dx = b.x - a.x, dy = b.y - a.y, actual = Math.hypot(dx, dy) || 1
      const wa = weight(i - 1), wb = weight(i), correction = (actual - length) / actual / (wa + wb)
      a.x += dx * correction * wa; a.y += dy * correction * wa
      b.x -= dx * correction * wb; b.y -= dy * correction * wb
    }
    for (let i = 1; i < nodes.length; i++) for (const b of platforms) {
      const n = nodes[i]
      if (n.x <= b.x - 1.5 || n.x >= b.x + b.w + 1.5 || n.y <= b.y - 1.5 || n.y >= b.y + b.h + 1.5) continue
      const gaps = [n.x - b.x + 1.5, b.x + b.w + 1.5 - n.x, n.y - b.y + 1.5, b.y + b.h + 1.5 - n.y]
      const edge = gaps.indexOf(Math.min(...gaps))
      if (edge === 0) n.x = b.x - 1.5
      else if (edge === 1) n.x = b.x + b.w + 1.5
      else if (edge === 2) n.y = b.y - 1.5
      else n.y = b.y + b.h + 1.5
    }
  }
}

export function ropeImpulse(rope: RopeState, distance: number, vx: number, vy: number, dt: number) {
  const spacing = rope.definition.length / rope.definition.segments, index = clamp(Math.round((distance + 6) / spacing), 1, rope.nodes.length - 1)
  for (let i = Math.max(1, index - 2); i <= Math.min(rope.nodes.length - 1, index + 2); i++) {
    const weight = Math.max(.15, 1 - Math.abs(i - index) * .3), n = rope.nodes[i]
    n.oldX = n.x - clamp(vx, -600, 600) * dt * weight; n.oldY = n.y - clamp(vy, -400, 400) * dt * weight
  }
}

function caughtPose(p: Player): Climbing['caught'] {
  return { x: p.x, y: p.y, vx: p.vx, vy: p.vy, stride: p.stride, grounded: p.grounded, gait: p.gait, footwork: p.footwork }
}

export function findClimbable(p: Player, world: ClimbableWorld): Climbing | null {
  for (const [index, ladder] of world.ladders.entries()) {
    const center = ladder.x
    const atTop = p.grounded && Math.abs(p.y - ladder.top) < 1 && Math.abs(p.x - ladder.x) < 46
    if ((Math.abs(p.x - center) < 25 && p.y >= ladder.top + 50 && p.y <= ladder.bottom + 5) || atTop) {
      return { kind: 'ladder', index, distance: clamp(p.y - ladder.top - 56, 18, ladder.bottom - ladder.top - 56),
        time: 0, direction: 0, swing: 0, lean: 0, hangBlend: 0, swingVelocity: 0, ladder, rope: null, caught: caughtPose(p) }
    }
  }
  return findRope(p)
}

/** Ropes can be caught in flight independently of ladder input. */
export function findRope(p: Player): Climbing | null {
  let nearest: { rope: RopeState; index: number; distance: number; gap: number } | null = null
  for (const [index, rope] of (p.ropes ?? []).entries()) for (let j = 0; j < rope.nodes.length - 1; j++) {
    const a = rope.nodes[j], b = rope.nodes[j + 1], dx = b.x - a.x, dy = b.y - a.y
    const handX = p.x + p.facing * 10, handY = p.y - 56
    const t = clamp(((handX - a.x) * dx + (handY - a.y) * dy) / (dx * dx + dy * dy || 1), 0, 1)
    const gap = Math.hypot(handX - a.x - dx * t, handY - a.y - dy * t)
    if (gap < 25 && (!nearest || gap < nearest.gap)) nearest = { rope, index, distance: (j + t) * rope.definition.length / rope.definition.segments, gap }
  }
  return nearest ? { kind: 'rope', index: nearest.index, distance: clamp(nearest.distance, 12, nearest.rope.definition.length - 8),
    time: 0, direction: 0, swing: 0, lean: 0, hangBlend: 0, swingVelocity: 0, ladder: null, rope: nearest.rope, caught: caughtPose(p) } : null
}
