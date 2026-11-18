import type { Player, Platform } from './characterTypes.ts'
import type { ContactWorld, PlayerCollider, PlayerContacts } from './playerContacts.ts'
import type { Footwork } from './footwork.ts'
import type { Climbing, Ladder, Rope, RopeState } from './climbables.ts'
import type { PushHands } from './propGeometry.ts'
import type { GravityField } from './gravity.ts'
import type { WaterLevels } from './waterLevel.ts'
import { disablePlatformLedges, platformLedgesDisabled } from './terrainLedges.ts'

/**
 * A body larger than the player (`Player.size`) runs the player's own controller, animation and poses in a
 * frame scaled down by its size, as gravityFrame.ts reflects an inverted body: before a step or a query, its
 * state and the world it touches are divided by its size about the world origin; after, multiplied back. In
 * that frame it is exactly the player's size, so every tuned reach, catch window and rig length holds for it,
 * and a contact it makes there is the same contact in the world. Its poses stay in its own body units, as an
 * inverted body's stay reflected: drawing scales them by its size, and gameplay that takes a world point from
 * one multiplies it in (`bodySize`).
 *
 * Time is not scaled, so the body's gravity and speeds are its size times the player's. Callers that want a
 * large body to keep the player's pace scale its steering instead (repulsorBot.ts).
 */
export const bodySize = (p: { size?: number }) => p.size ?? 1
/** The standing hull bodyPolygon draws for the player (geometry.ts), at a larger body's size, for clearance checks. */
const outlines = new Map<number, readonly (readonly [number, number])[]>()
export function sizedBodyOutline(size: number, height = 62, orientation = 1) {
  const key = (size * 4096 + height) * orientation
  let outline = outlines.get(key)
  if (!outline) {
    const hull = ([[-12, -height], [12, -height], [12, -18], [0, 0], [-12, -18]] as const).map(([x, y]) => [x * size, y * size * orientation] as const)
    outline = orientation < 0 ? hull.reverse() : hull
    outlines.set(key, outline)
  }
  return outline
}

// Scaled copies of the world, cached per object and size. Shapes that move are rebuilt when their place changes.
const platformCopies = new WeakMap<Platform, { size: number; x: number; y: number; w: number; h: number; copy: Platform }>()
const platformSources = new WeakMap<Platform, Platform>()
export function scaledPlatform(b: Platform, size: number): Platform {
  const cached = platformCopies.get(b)
  if (cached && cached.size === size && cached.x === b.x && cached.y === b.y && cached.w === b.w && cached.h === b.h) {
    if (platformLedgesDisabled(b)) disablePlatformLedges(cached.copy)
    return cached.copy
  }
  const point = ([x, y]: readonly [number, number]) => [x / size, y / size] as const
  const copy: Platform = { ...b, x: b.x / size, y: b.y / size, w: b.w / size, h: b.h / size,
    ...(b.polygon ? { polygon: b.polygon.map(point) } : {}), ...(b.profile ? { profile: b.profile.map(point) } : {}),
    ...(b.bezier ? { bezier: b.bezier.map(handle => handle && ({ ...handle,
      ...(handle.in ? { in: point(handle.in) } : {}), ...(handle.out ? { out: point(handle.out) } : {}) })) } : {}) }
  if (platformLedgesDisabled(b)) disablePlatformLedges(copy)
  platformCopies.set(b, { size, x: b.x, y: b.y, w: b.w, h: b.h, copy }); platformSources.set(copy, b)
  return copy
}
/** The world shape a scaled copy was made from; anything else is already a world shape. */
export const worldPlatform = (b: Platform) => platformSources.get(b) ?? b

const ladderCopies = new WeakMap<Ladder, { size: number; copy: Ladder }>(), ladderSources = new WeakMap<Ladder, Ladder>()
export function scaledLadder(ladder: Ladder, size: number): Ladder {
  const cached = ladderCopies.get(ladder)
  if (cached?.size === size) return cached.copy
  const copy = { ...ladder, x: ladder.x / size, top: ladder.top / size, bottom: ladder.bottom / size }
  ladderCopies.set(ladder, { size, copy }); ladderSources.set(copy, ladder)
  return copy
}
const worldLadder = (ladder: Ladder) => ladderSources.get(ladder) ?? ladder

const ropeCopies = new WeakMap<Rope, { size: number; copy: Rope }>(), ropeSources = new WeakMap<Rope, Rope>()
function scaledRope(rope: Rope, size: number): Rope {
  const cached = ropeCopies.get(rope)
  if (cached?.size === size) return cached.copy
  const k = (n: number) => n / size
  const copy: Rope = { ...rope, x: k(rope.x), y: k(rope.y), length: k(rope.length), frame: (rope.frame ?? 1) * size,
    ...(rope.anchor ? { anchor: { ...rope.anchor, x: k(rope.anchor.x), y: k(rope.anchor.y) } } : {}),
    ...(rope.end ? { end: { ...rope.end, x: k(rope.end.x), y: k(rope.end.y),
      ...(rope.end.anchor ? { anchor: { ...rope.end.anchor, x: k(rope.end.anchor.x), y: k(rope.end.anchor.y) } } : {}) } } : {}) }
  // Live nodes carry the path; the authored rest layout is never used in the frame.
  delete copy.rest
  ropeCopies.set(rope, { size, copy }); ropeSources.set(copy, rope)
  return copy
}
const worldRope = (rope: Rope) => ropeSources.get(rope) ?? rope

export function scaledContactWorld(world: ContactWorld, size: number): ContactWorld {
  const colliders: PlayerCollider[] = world.colliders.map(c => ({ ...c, platform: scaledPlatform(c.platform, size),
    ...(c.prop ? { prop: { ...c.prop, x: c.prop.x / size, y: c.prop.y / size, vx: c.prop.vx / size, vy: c.prop.vy / size, size: c.prop.size / size } } : {}),
    ...(c.robot ? { robot: { ...c.robot, x: c.robot.x / size, y: c.robot.y / size } } : {}) }))
  return { platforms: colliders.map(c => c.platform), colliders,
    ...(world.ropePlatforms ? { ropePlatforms: world.ropePlatforms.map(b => scaledPlatform(b, size)) } : {}) }
}

const fieldCopies = new WeakMap<GravityField, { size: number; revision: number; copy: GravityField }>()
export function scaledGravityField(field: GravityField, size: number): GravityField {
  const cached = fieldCopies.get(field)
  if (cached?.size === size && cached.revision === field.revision) return cached.copy
  const copy = { ...field, strips: field.strips.map(strip => ({ left: strip.left / size, right: strip.right / size,
    spans: strip.spans.map(span => ({ ...span, top: span.top / size, bottom: span.bottom / size })) })) }
  fieldCopies.set(field, { size, revision: field.revision, copy })
  return copy
}

export function scaledWater(water: WaterLevels, size: number): WaterLevels {
  const rect = <T extends { x: number; y: number; w: number; h: number }>(r: T): T => ({ ...r, x: r.x / size, y: r.y / size, w: r.w / size, h: r.h / size })
  const plates = water.plates.map(rect)
  return { ...water, plates, pools: water.pools.map(pool => ({ ...pool, definition: rect(pool.definition),
    region: plates[water.plates.indexOf(pool.region)] ?? rect(pool.region), level: pool.level / size, previousY: pool.previousY / size, rise: pool.rise / size })) }
}

/**
 * Every value of a body's state with a size, and every reference to a world object, found by walking its
 * state as gravityFrame.ts does. Angles, times and amounts are left alone, and so are poses and other offsets
 * in the body's own units, which only the controller and poses read, in the frame.
 */
type Visit = {
  length: (target: object, key: string) => void
  reference: (target: object, key: string, map: (value: never) => unknown) => void
  /** A rope's particles: their x, y, oldX and oldY are lengths, handled together (see NodeRecord). */
  nodes: (nodes: RopeState['nodes']) => void
}
function walk(p: Player, visit: Visit, allRopes: boolean, mapContacts: boolean, maps: { platform: (b: Platform) => Platform; ladder: (l: Ladder) => Ladder; rope: (r: Rope) => Rope; collider?: (c: PlayerCollider) => PlayerCollider }) {
  const seen = new Set<object>(), measured = new Map<object, Set<string>>()
  const once = (value: object | null | undefined) => !!value && !seen.has(value) && !!seen.add(value)
  // One object can hang from two places (a rope grip's wall is also its wall pose): each value scales once.
  const lengths = (target: object | null | undefined, ...keys: string[]) => {
    if (!target) return
    const done = measured.get(target) ?? new Set<string>()
    measured.set(target, done)
    for (const key of keys) if (typeof (target as Record<string, unknown>)[key] === 'number' && !done.has(key)) { done.add(key); visit.length(target, key) }
  }
  const points = (list: readonly (readonly number[] | null)[] | undefined) => {
    for (const point of list ?? []) if (point && once(point)) { visit.length(point, '0'); visit.length(point, '1') }
  }
  const rope = (value: RopeState | null | undefined) => {
    if (!value || !once(value)) return
    visit.reference(value, 'definition', maps.rope as (value: never) => unknown)
    visit.nodes(value.nodes)
    points(value.bends)
  }
  const hands = (value: PushHands | Player['pushing'] | undefined) => {
    if (!value || !once(value)) return
    lengths(value, 'wallX', 'height')
    for (const palm of value.palms ?? []) if (once(palm)) lengths(palm, 'x', 'y')
  }
  const footwork = (value: Footwork | null | undefined) => {
    if (!value || !once(value)) return
    visit.reference(value, 'terrain', ((list: readonly Platform[]) => list.map(maps.platform)) as (value: never) => unknown)
    lengths(value, 'shortStepTravel', 'shortStepSpeed')
    for (const foot of value.feet) {
      lengths(foot, 'x', 'y', 'anchorX', 'anchorY', 'groundY')
      lengths(foot.release, 'x', 'y'); lengths(foot.settle, 'x', 'y')
    }
  }
  const water = (value: Player['waterMotion']) => {
    if (!value || !once(value)) return
    lengths(value.wall, 'x'); lengths(value.floor, 'y', 'reach')
    for (const hand of value.ceiling?.hands ?? []) lengths(hand, 'x', 'y')
    if (value.landing) { lengths(value.landing, 'y'); lengths(value.landing.hand, 'x', 'y') }
  }
  const freeFall = (value: Player['freeFall']) => { if (value && once(value)) lengths(value.impact, 'vx', 'vy') }
  type Caught = Climbing['caught'] & { pushing?: Player['pushing']; pushRig?: Player['pushing']; ledgeReach?: Player['ledgeReach']; climbing?: Climbing | null; waterMotion?: Player['waterMotion'] }
  const caught = (value: Caught | null | undefined) => {
    if (!value || !once(value)) return
    lengths(value, 'x', 'y', 'vx', 'vy')
    footwork(value.anim?.footwork); hands(value.pushing); hands(value.pushRig)
    if (once(value.ledgeReach)) lengths(value.ledgeReach, 'x', 'y')
    if (value.climbing) climb(value.climbing)
    water(value.waterMotion); hang(value.hang ?? null); freeFall(value.freeFall ?? null)
  }
  const hang = (value: Player['hang']) => {
    if (!value || !once(value)) return
    lengths(value, 'edgeX', 'edgeY'); caught(value.caught as Caught)
  }
  const climb = (value: Climbing) => {
    if (!once(value)) return
    lengths(value, 'distance', 'rappelStepHeight', 'setback', 'travelSpeed')
    if (value.ladder) visit.reference(value, 'ladder', maps.ladder as (value: never) => unknown)
    rope(value.rope)
    lengths(value.wall, 'x'); lengths(value.wallPose, 'x'); lengths(value.wallContact, 'x')
    for (const hold of value.holds ?? []) lengths(hold, 'at', 'from', 'reach', 'toward', 'span')
    lengths(value.sway, 'x', 'y', 'vx', 'vy')
    lengths(value.bodyMotion, 'gripVx', 'gripVy', 'acceleration')
    caught(value.caught as Caught)
  }
  const contacts = (value: PlayerContacts | null) => {
    if (!value || !once(value)) return
    if (value.support) {
      lengths(value.support, 'y')
      if (mapContacts) { visit.reference(value.support, 'collider', maps.collider! as (value: never) => unknown); visit.reference(value.support, 'platform', maps.platform as (value: never) => unknown) }
    }
    if (value.push) {
      lengths(value.push, 'wallX'); hands(value.push.hands)
      if (mapContacts) visit.reference(value.push, 'collider', maps.collider! as (value: never) => unknown)
    }
    for (const body of value.body) {
      if (once(body.point)) { visit.length(body.point, '0'); visit.length(body.point, '1') }
      lengths(body, 'impactSpeed')
      if (mapContacts) visit.reference(body, 'collider', maps.collider! as (value: never) => unknown)
    }
    lengths(value.motion, 'x', 'y', 'speed')
  }

  lengths(p, 'x', 'y', 'vx', 'vy', 'spawnX', 'spawnY', 'jumpStart', 'jumpHeight', 'bestHeight')
  for (const palm of p.shove?.contact ?? []) if (once(palm)) lengths(palm, 'x', 'y')
  lengths(p.sliding, 'x', 'y', 'balanceSpeed')
  lengths(p.jumpLift, 'entrySpeed', 'extraSpeed')
  lengths(p.rebound, 'speed')
  lengths(p.wallBrace, 'wallX', 'wallY')
  if (p.climbing) climb(p.climbing)
  if (allRopes) for (const value of p.ropes ?? []) rope(value)
  hands(p.pushing); hands(p.pushRig)
  if (once(p.ledgeReach)) lengths(p.ledgeReach, 'x', 'y')
  lengths(p.stepIntent, 'edgeX', 'edgeY')
  hang(p.hang)
  if (p.mantle && once(p.mantle)) {
    const m = p.mantle
    lengths(m, 'edgeX', 'edgeY', 'toX', 'toY', 'inset')
    lengths(m.sway, 'vx')
    if (m.step) {
      lengths(m.step, 'rise'); caught(m.step.caught as Caught)
      hands(m.step.returnPreparation?.hands)
      if (m.step.climbing) climb(m.step.climbing)
    }
    if (m.ladder) { lengths(m.ladder, 'x', 'y'); climb(m.ladder.climb) }
    if (m.descending) { caught(m.descending.caught as Caught); if (m.descending.climbable) climb(m.descending.climbable) }
  }
  freeFall(p.freeFall)
  contacts(p.contacts)
  footwork(p.anim.footwork)
  water(p.waterMotion)
  lengths(p.waterCamera, 'y')
  if (p.terrain) visit.reference(p, 'terrain', ((list: readonly Platform[]) => list.map(maps.platform)) as (value: never) => unknown)
}

/**
 * A rope's particles as they entered: the particle objects, then each one's x, y, oldX and oldY before and after
 * scaling, four to a particle. A held rope enters the frame on every pass of the rope solver, so its particles
 * are kept in flat arrays rather than one record per value; the rule for leaving is the same.
 */
interface NodeRecord { nodes: RopeState['nodes'][number][]; original: Float64Array; entered: Float64Array }
const NODE_KEYS = ['x', 'y', 'oldX', 'oldY'] as const

/** What entering changed, so leaving restores every value the frame did not change exactly. */
export interface SizeFrame { size: number; entered: Map<object, Map<string, { original: unknown; entered: unknown }>>; nodes: Map<RopeState['nodes'], NodeRecord> }

/** Scale a body's state into its frame: divided by its size, its references swapped for the frame's copies. */
export function enterSizeFrame(p: Player, size: number, allRopes = false, world?: ContactWorld): SizeFrame {
  const frame: SizeFrame = { size, entered: new Map(), nodes: new Map() }
  const record = (target: object, key: string, value: unknown) => {
    const values = frame.entered.get(target) ?? new Map()
    frame.entered.set(target, values)
    const record = target as Record<string, unknown>
    values.set(key, { original: record[key], entered: value }); record[key] = value
  }
  const byId = world && new Map(world.colliders.map(c => [c.id, c]))
  walk(p, {
    length: (target, key) => record(target, key, (target as Record<string, number>)[key] / size),
    reference: (target, key, map) => { const value = (target as Record<string, unknown>)[key]; if (value) record(target, key, map(value as never)) },
    nodes: list => {
      const original = new Float64Array(list.length * 4), entered = new Float64Array(list.length * 4)
      for (let i = 0; i < list.length; i++) {
        const node = list[i] as unknown as Record<string, number>
        for (let k = 0; k < 4; k++) { const key = NODE_KEYS[k], value = node[key]; original[i * 4 + k] = value; entered[i * 4 + k] = node[key] = value / size }
      }
      frame.nodes.set(list, { nodes: list.slice(), original, entered })
    },
  }, allRopes, !!world, { platform: b => scaledPlatform(b, size), ladder: l => scaledLadder(l, size), rope: r => scaledRope(r, size),
    collider: c => byId?.get(c.id) ?? c })
  if (p.anim.pending) throw new Error('A sized body animates every step; its deferred animation would hold world references.')
  return frame
}

/** Undo a query's frame: every value and reference returns exactly as it was. */
export function restoreSizeFrame(frame: SizeFrame) {
  for (const [target, values] of frame.entered) for (const [key, { original }] of values) (target as Record<string, unknown>)[key] = original
  for (const { nodes, original } of frame.nodes.values()) for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i] as unknown as Record<string, number>
    for (let k = 0; k < 4; k++) node[NODE_KEYS[k]] = original[i * 4 + k]
  }
}

/**
 * Leave the frame after a step: what the step left alone returns exactly; what it changed or made is
 * multiplied back into the world, and its references return to the world's own objects.
 */
export function leaveSizeFrame(p: Player, frame: SizeFrame, allRopes = false, world?: ContactWorld) {
  const { size } = frame
  const byId = world && new Map(world.colliders.map(c => [c.id, c]))
  const restore = (target: object, key: string, convert: (value: unknown) => unknown) => {
    const record = target as Record<string, unknown>, before = frame.entered.get(target)?.get(key)
    record[key] = before && before.entered === record[key] ? before.original : convert(record[key])
  }
  walk(p, {
    length: (target, key) => restore(target, key, value => (value as number) * size),
    reference: (target, key, map) => restore(target, key, value => value && map(value as never)),
    nodes: list => {
      // A particle that entered and still holds its entered value returns exactly; any other value is the step's.
      // Particles are matched by identity, as every other value is, in case a step rearranged the list.
      const entered = frame.nodes.get(list)
      let moved: Map<object, number> | undefined
      for (let i = 0; i < list.length; i++) {
        const node = list[i] as unknown as Record<string, number>
        let at = entered?.nodes[i] === list[i] ? i : -1
        if (at < 0 && entered) at = (moved ??= new Map(entered.nodes.map((n, j) => [n, j]))).get(list[i]) ?? -1
        for (let k = 0; k < 4; k++) {
          const key = NODE_KEYS[k], value = node[key]
          node[key] = at >= 0 && entered!.entered[at * 4 + k] === value ? entered!.original[at * 4 + k] : value * size
        }
      }
    },
  }, allRopes, !!world, { platform: worldPlatform, ladder: worldLadder, rope: worldRope, collider: c => byId?.get(c.id) ?? c })
}

/** Run a read-only query on a sized body in its frame; its state is untouched afterward. */
export function inSizeFrame<T>(p: Player, query: () => T, allRopes = false): T {
  const size = bodySize(p), frame = enterSizeFrame(p, size, allRopes)
  p.size = 1
  try { return query() } finally { p.size = size; restoreSizeFrame(frame) }
}
