import type { GaitPose, Platform, Player } from './model.ts'
import type { Footwork } from './footwork.ts'
import { lineBlocked, moveBody, nearestBoundary, pointInside } from './geometry.ts'

export type Point = [number, number]
export interface Ladder { x: number; top: number; bottom: number; platform: number; side: number }
export interface Rope { x: number; y: number; length: number; segments: number; anchor?: { platform: number; x: number; y: number } }
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
  wall?: { x: number; side: number }
  wallPose?: { x: number; side: number }
  wallBlend?: number
  wallCooldown?: number
  wallContact?: { x: number; side: number; time: number }
  actionHeld?: boolean
  rappelPull?: number
  rappelMotion?: number
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
export function climbContact(distance: number, offset: number, stride = 28) {
  const position = (distance + offset) / stride, step = Math.floor(position), phase = position - step
  const swing = clamp((phase - .55) / .45, 0, 1)
  return { distance: (step + ease(swing)) * stride, lift: Math.sin(swing * Math.PI), planted: phase <= .55 }
}
/** One powerful stroke skips a rung. The body follows the gripping hands and supporting foot. */
export function climbGait(distance: number, handLimit = Infinity, footLimit = Infinity) {
  const hands = [4, 18].map(offset => ({ ...climbContact(distance, offset), distance: Math.min(handLimit, climbContact(distance, offset).distance) }))
  const feet = [46, 60].map(offset => ({ ...climbContact(distance, offset), distance: Math.min(footLimit, climbContact(distance, offset).distance) }))
  const shoulder = (hands[0].distance + hands[1].distance) / 2 + 4.2
  const hip = Math.max(shoulder + 16.6, Math.max(...feet.map(f => f.distance)) - 32.6)
  // Leave enough rope above a resting grip to clear the anchor's platform edge.
  const grip = Math.min(handLimit, Math.max(18, Math.min(...hands.map(hand => hand.distance))))
  return { hands, feet, grip, shoulder, hip, waist: shoulder + (hip - shoulder) * .6, head: shoulder - 7.3, root: hip + 32 }
}

/** Keep the player/camera under the loaded grip, rather than following the rope's loose tail. */
export function climbRoot(climb: Climbing, facing: number): Point {
  const root = freeClimbRoot(climb, facing), weight = rappelWeight(climb)
  if (!weight) return root
  const pose = rappelFrame(climb)
  return [root[0] + (pose.hip[0] - root[0]) * weight, root[1] + (pose.hip[1] + 32 - root[1]) * weight]
}
export function rappelWeight(climb: Climbing) {
  return ease(climb.wallBlend ?? Number(!!climb.wall))
}
function freeClimbRoot(climb: Climbing, facing: number): Point {
  const gait = climbGait(climb.distance, climb.rope?.definition.length, climb.ladder ? climb.ladder.bottom - climb.ladder.top : undefined)
  const root = climbBody(climb, gait.root, 0, facing), hanging = ease(climb.hangBlend)
  if (!climb.rope || !hanging) return root
  const grip = gait.grip
  const hands = gait.hands.map(hand => climbPoint(climb, hand.distance + (grip - hand.distance) * hanging))
  const spread = 3.9 * (1 - ease(Math.abs(climb.lean) / .65)), out = climb.lean * 7
  const pump = ropePump(climb)
  const x = (hands[0][0] + hands[1][0]) / 2 + out + pump.hip[0]
  const y = (hands[0][1] + hands[1][1]) / 2 + Math.sqrt(18.8 ** 2 - (Math.abs(out) + spread) ** 2) - .7 + pump.hip[1] + 32
  return [root[0] + (x - root[0]) * hanging, root[1] + (y - root[1]) * hanging]
}

/** Feed a little rope through the hands when a resting head would catch on the anchor's lip. */
export function settleRopeGrip(climb: Climbing, facing: number, terrain: readonly Platform[], dt: number) {
  if (!climb.rope || climb.direction || climb.wall || rappelWeight(climb) || climb.hangBlend < .99 || Math.abs(climb.lean) > .05) return
  const rope = climb.rope, anchor = rope.definition, root = freeClimbRoot(climb, facing)
  if (climb.distance > 64 || Math.abs(root[0] - anchor.x) > 24) return
  const side = Math.sign(anchor.x - root[0]) || facing, x = anchor.x + side * .25
  const solid = (y: number) => terrain.some(b => pointInside(b, x, y))
  if (!solid(anchor.y + .25)) return // Underside anchors already have headroom.
  let depth = .25
  while (depth < 64 && solid(anchor.y + depth)) depth++
  if (depth >= 64) return // A cliff calls for a supported rappel, not an automatic descent.
  const gait = climbGait(climb.distance, anchor.length), grip = ropePoint(rope, gait.grip)
  const headroom = root[1] - grip[1] - 62
  // Clear the corner along the rope's arc before gravity carries the body under it.
  const needed = Math.hypot(13, Math.max(0, depth - headroom + .5)) + 1
  if (gait.grip < needed) climb.distance = Math.min(anchor.length - 8, climb.distance + 60 * dt)
}

/** Feet carry the outward load while the hands feed rope during a controlled descent. */
export function rappelFrame(climb: Climbing) {
  const wall = (climb.wall ?? climb.wallPose)!, s = wall.side, grip = climbPoint(climb, climb.distance)
  const hands: Point[] = [[grip[0], grip[1]], [grip[0], grip[1] + 5]]
  // With the rope farther out, reach back for it rather than stretching the torso.
  const gap = (wall.x - grip[0]) * s, reach = clamp(28 - gap, -10, 10)
  const shoulder: Point = [grip[0] - s * reach, grip[1] + 16]
  const hip: Point = [wall.x - s * 23, grip[1] + 32]
  const pull = ease(climb.rappelPull ?? 0)
  if (pull) {
    // Short, overlapping pulls keep the wrists between the head and upper chest.
    // One hand holds its material point while the other reaches past it.
    const contacts = [8, 18].map(offset => climbContact(climb.distance, offset, 20))
    const reaching = contacts.map(contact => {
      const hand = climbPoint(climb, clamp(contact.distance, 0, climb.rope!.definition.length))
      hand[0] -= s * contact.lift * 1.25
      return hand
    })
    const handX = (reaching[0][0] + reaching[1][0]) / 2
    const chest: Point = [handX - s * clamp(26 - (wall.x - handX) * s, -8, 8), (reaching[0][1] + reaching[1][1]) / 2 + 6]
    const pelvis: Point = [wall.x - s * 23, chest[1] + 16]
    for (let axis = 0; axis < 2; axis++) {
      shoulder[axis] += (chest[axis] - shoulder[axis]) * pull
      hip[axis] += (pelvis[axis] - hip[axis]) * pull
      for (let i = 0; i < 2; i++) hands[i][axis] += (reaching[i][axis] - hands[i][axis]) * pull
    }
  }
  // Use world height, not rope travel, so the loaded sole stays on its foothold
  // even while the rope stretches. Alternate a full step with a clear knee tuck.
  const steps = [0, 20].map(offset => {
    const contact = climbContact(hip[1], 20 + offset, 40)
    const moving = ease(climb.rappelMotion ?? Math.abs(climb.direction))
    return { ...contact, distance: contact.distance - offset, lift: contact.lift * moving, planted: contact.planted || moving === 0 }
  })
  const feet: Point[] = steps.map(step => [wall.x - s * (3 + step.lift * 7), step.distance])
  const waist: Point = [shoulder[0] + (hip[0] - shoulder[0]) * .6, shoulder[1] + (hip[1] - shoulder[1]) * .6]
  return { shoulder, hip, waist, head: [shoulder[0] - s * 2, shoulder[1] - 7.3] as Point, hands, feet, steps }
}
export function updateRopeWall(climb: Climbing, terrain: readonly Platform[], move = 0) {
  if (!climb.rope) return
  const grip = climbPoint(climb, climb.distance), old = climb.wall
  climb.wall = undefined
  if (climb.wallCooldown) return
  // The swinging feet can touch a cliff before either the rope or the torso does.
  const root = freeClimbRoot(climb, 1), pump = ropePump(climb)
  const swingFeet = [pump.frontFoot, pump.backFoot].map(foot => [root[0] + foot[0], root[1] - 32 + foot[1]])
  for (const b of terrain) {
    const face = nearestBoundary(b, grip[0], grip[1] + 35)
    if (face.distance > 40 || Math.abs(face.ny) > .12) continue
    const side = -Math.sign(face.nx)
    if (move * side < -.1) continue
    const footContact = climb.hangBlend > .5 && climb.lean * side > .1 && swingFeet.some(foot =>
      (face.x - foot[0]) * side < 7 && pointInside(b, face.x + side * .1, foot[1]))
    if (face.distance > (old ? 36 : 16) && !footContact) continue
    // Feet can resist compression, but cannot pull the body toward a wall.
    // An unloaded rope touching the face can establish its first foothold.
    const above = climbPoint(climb, Math.max(0, climb.distance - 120))
    // A supported body's weight acts at the hips, which can be outside the grip.
    const loadX = old || footContact ? face.x - side * 23 : grip[0]
    const inward = (above[0] - loadX) * side
    const previous = ropePoint(climb.rope, climb.distance, true)
    const touching = face.distance <= 14 && (grip[0] - previous[0]) * side > .01
    const pressed = climb.wallContact && climb.wallContact.side === side && Math.abs(climb.wallContact.x - face.x) < .1
    // Keep a climbing foothold through small tension changes, until carried away.
    const stepping = old && climb.direction !== 0 && face.distance < 18
    if (inward < (old ? -.5 : .15) && face.distance > 4 && !touching && !pressed && !stepping) continue
    // A platform's short side near the hands is not a wall beneath the feet.
    const feet = rappelFrame({ ...climb, wall: { x: face.x, side } }).feet
    if (!feet.every(foot => terrain.some(wall => pointInside(wall, face.x + side * .1, foot[1])))) continue
    // Never transfer a caught player through the rope's supporting wall.
    if (!old && (face.x - climb.caught.x) * side < 0) continue
    climb.wall = { x: face.x, side }; break
  }
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
export function stepRope(rope: RopeState, dt: number, platforms: readonly Platform[], load: { distance: number; move: number; wall?: Climbing['wall']; bracing?: number;
  body?: { climb: Climbing; from: Point; facing: number } } | null) {
  const { nodes, definition } = rope, length = definition.length / definition.segments
  const reach = definition.length + 32
  const nearby = platforms.filter(b => b.x < definition.x + reach && b.x + b.w > definition.x - reach
    && b.y < definition.y + reach && b.y + b.h > definition.y - reach)
  const loaded = load ? clamp(Math.round((load.distance + 6) / length), 1, nodes.length - 1) : -1
  const weight = (i: number) => i === 0 ? 0 : i === loaded ? .08 : 1
  const damping = Math.exp(-.4 * dt)
  if (load?.body?.climb.wallContact) {
    const c = load.body.climb
    c.wallContact!.time -= dt
    if (c.wallContact!.time <= 0) c.wallContact = undefined
  }
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
    for (let i = 1; i < nodes.length; i++) for (const b of nearby) {
      const n = nodes[i]
      if (n.x <= b.x - 1.5 || n.x >= b.x + b.w + 1.5 || n.y <= b.y - 1.5 || n.y >= b.y + b.h + 1.5) continue
      const edge = nearestBoundary(b, n.x, n.y)
      if (pointInside(b, n.x, n.y) || edge.distance < 1.5) {
        n.x = edge.x + edge.nx * 1.5; n.y = edge.y + edge.ny * 1.5
      }
    }
    if (loaded > 0 && load?.wall) {
      // Wall-supported feet carry an outward load. Only the grip is displaced;
      // the constraint chain above it transmits the tension back to the anchor.
      const n = nodes[loaded], wall = load.wall
      const gap = 1.5 + (8.5 + Math.sin(load.distance * Math.PI / 22) * 1.5) * (load.bracing ?? 1)
      const target = wall.x - wall.side * gap
      if ((target - n.x) * wall.side < 0) n.x += (target - n.x) * .45
    }
    if (load?.body) constrainRopeBody(load.body.climb, load.body.from, load.body.facing, nearby)
  }
}

/** Resolve the rope points that determine the body position, leaving its tail free. */
export function constrainRopeBody(climb: Climbing, from: Point, facing: number, terrain: readonly Platform[]) {
  const rope = climb.rope!, spacing = rope.definition.length / rope.definition.segments
  const root = climbRoot(climb, facing), blend = ease(climb.time / .16)
  const target: Point = [climb.caught.x + (root[0] - climb.caught.x) * blend, climb.caught.y + (root[1] - climb.caught.y) * blend]
  const safe = moveBody(from, target, terrain), dx = safe.x - target[0], dy = safe.y - target[1]
  if (Math.hypot(dx, dy) < 1e-6 || blend < .01) return safe
  for (const { normal, platform } of safe.contacts) if (Math.abs(normal[0]) > .9) {
    const side = -Math.sign(normal[0]), face = nearestBoundary(platform, safe.x + side * 12, safe.y - 35)
    if (Math.abs(face.ny) < .12) climb.wallContact = { x: face.x, side, time: .12 }
  }
  const gait = climbGait(climb.distance, rope.definition.length)
  const hanging = ease(climb.hangBlend), bracing = rappelWeight(climb), pull = ease(climb.rappelPull ?? 0)
  const weights = rope.nodes.map(() => [0, 0])
  const support = (distance: number, x: number, y = x) => {
    const position = Math.max(0, distance / spacing), index = Math.min(rope.nodes.length - 2, Math.floor(position)), t = position - index
    for (const [i, weight] of [[index, 1 - t], [index + 1, t]]) {
      if (i === 0) continue // The terrain anchor never moves.
      weights[i][0] += x * weight; weights[i][1] += y * weight
    }
  }
  // Match climbRoot's interpolation: climbing follows the lower grip, hanging
  // follows the hands, and a wall brace fixes the hips horizontally.
  support(gait.root, (1 - bracing) * (1 - hanging))
  for (const hand of gait.hands) support(hand.distance + (gait.grip - hand.distance) * hanging, (1 - bracing) * hanging / 2)
  support(climb.distance, 0, bracing * (1 - pull))
  for (const offset of [8, 18]) support(clamp(climbContact(climb.distance, offset, 20).distance, 0, rope.definition.length), 0, bracing * pull / 2)
  const norm = [0, 1].map(axis => weights.reduce((sum, weight) => sum + weight[axis] ** 2, 0))
  for (let i = 1; i < rope.nodes.length; i++) {
    const [wx, wy] = weights[i], weight = Math.min(1, Math.max(Math.abs(wx), Math.abs(wy)))
    if (!weight) continue
    const node = rope.nodes[i]
    let vx = node.x - node.oldX, vy = node.y - node.oldY
    for (const { normal } of safe.contacts) {
      const into = vx * normal[0] + vy * normal[1]
      if (into < 0) { vx -= into * normal[0] * weight; vy -= into * normal[1] * weight }
    }
    node.x += dx * wx / Math.max(norm[0], 1e-8) / blend
    node.y += dy * wy / Math.max(norm[1], 1e-8) / blend
    node.oldX = node.x - vx; node.oldY = node.y - vy
  }
  return safe
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

export function findClimbable(p: Player, world: ClimbableWorld, terrain: readonly Platform[] = []): Climbing | null {
  for (const [index, ladder] of world.ladders.entries()) {
    const center = ladder.x
    const atTop = p.grounded && Math.abs(p.y - ladder.top) < 1 && Math.abs(p.x - ladder.x) < 46
    if (((Math.abs(p.x - center) < 25 && p.y >= ladder.top + 50 && p.y <= ladder.bottom + 5) || atTop)
      && !lineBlocked([p.x, p.y - 44], [center, p.y - 44], terrain)) {
      return { kind: 'ladder', index, distance: clamp(p.y - ladder.top - 56, 18, ladder.bottom - ladder.top - 56),
        time: 0, direction: 0, swing: 0, lean: 0, hangBlend: 0, swingVelocity: 0, ladder, rope: null, caught: caughtPose(p) }
    }
  }
  return findRope(p, terrain)
}

/** Ropes can be caught in flight independently of ladder input. */
export function findRope(p: Player, terrain: readonly Platform[] = []): Climbing | null {
  let nearest: { rope: RopeState; index: number; distance: number; gap: number } | null = null
  for (const [index, rope] of (p.ropes ?? []).entries()) for (let j = 0; j < rope.nodes.length - 1; j++) {
    const a = rope.nodes[j], b = rope.nodes[j + 1], dx = b.x - a.x, dy = b.y - a.y
    const handX = p.x + p.facing * 10, handY = p.y - 56
    const t = clamp(((handX - a.x) * dx + (handY - a.y) * dy) / (dx * dx + dy * dy || 1), 0, 1)
    const gap = Math.hypot(handX - a.x - dx * t, handY - a.y - dy * t)
    if (gap < 25 && (!nearest || gap < nearest.gap) && !lineBlocked([p.x, p.y - 44], [a.x + dx * t, a.y + dy * t], terrain)) nearest = { rope, index, distance: (j + t) * rope.definition.length / rope.definition.segments, gap }
  }
  return nearest ? { kind: 'rope', index: nearest.index, distance: clamp(nearest.distance, 12, nearest.rope.definition.length - 8),
    time: 0, direction: 0, swing: 0, lean: 0, hangBlend: 0, swingVelocity: 0, ladder: null, rope: nearest.rope, caught: caughtPose(p) } : null
}
