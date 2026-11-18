import type { JumpInput, Platform, Player } from './model.ts'
import type { ContactWorld, PlayerContacts } from './playerContacts.ts'
import type { Footwork } from './footwork.ts'
import { polygonPoints } from './geometry.ts'
import { propHeight } from './propGeometry.ts'
import { disablePlatformLedges, platformLedgesDisabled } from './terrainLedges.ts'

/**
 * Footing on a wall. A sideways gravity field (gravity.ts) can turn the player until a wall is underfoot: `p.wall`
 * names the side gravity pulls toward. The ordinary controller then runs in a frame turned a quarter so that wall
 * is its floor, exactly as the reflected frame (gravityFrame.ts) serves a ceiling. Controls stay screen-relative, as
 * they are on a ceiling (`wallInput`): Up and Down walk up and down the wall, the direction toward the wall crouches
 * into it, and the direction away stands and looks out.
 *
 * The frame is a rotation, not a reflection, so it is not its own inverse. `toLocal` enters it and `toWorld` leaves:
 * a right-hand wall enters with (x, y) → (−y, x), a left-hand wall with (x, y) → (y, −x). Point pairs, vectors,
 * angles and slopes turn exactly. A value that stands alone, such as a wall's x or a floor's y, is a line, and a
 * quarter turn makes a vertical line horizontal: stored in the world, such a field holds the turned line's value
 * in the same slot, which is one sign change either way. Nothing outside the frame reads those lines meaningfully,
 * so anything carrying them across a change of frame is reset when the frame changes (`enterWallFrame`).
 *
 * Climbing, ledge grips, ladders, swimming and pushing are not offered on a wall: the frame keeps only free and
 * grounded movement, so the state that crosses it is the state listed here.
 */
export type Wall = 'left' | 'right'
type Vec = [number, number]

/** The body's rotation in the world when standing upright on that wall: its head points away from it. */
export const wallFrameAngle = (wall: Wall | undefined) => wall === 'left' ? Math.PI / 2 : wall === 'right' ? -Math.PI / 2 : 0
/** +1 turns (x, y) → (−y, x); −1 turns (x, y) → (y, −x). */
const enterSign = (wall: Wall) => wall === 'right' ? 1 : -1
const turn = (x: number, y: number, s: number): Vec => s > 0 ? [-y, x] : [y, -x]
const turnAngle = (angle: number, s: number) => angle + s * Math.PI / 2
const turnSlope = (slope: number) => -1 / slope

const platforms = [new WeakMap<Platform, Platform>(), new WeakMap<Platform, Platform>()]
/** A platform turned a quarter, cached per direction. Rectangles stay rectangles; outlines keep their winding. */
export function turnPlatform(b: Platform, s: number): Platform {
  const cache = platforms[s > 0 ? 0 : 1], cached = cache.get(b)
  if (cached) { if (platformLedgesDisabled(b)) disablePlatformLedges(cached); return cached }
  let turned: Platform
  if (!b.polygon && !b.profile) {
    turned = s > 0 ? { ...b, x: -b.y - b.h, y: b.x, w: b.h, h: b.w } : { ...b, x: b.y, y: -b.x - b.w, w: b.h, h: b.w }
  } else {
    const source = b.bezier ? b.polygon!.map(([x, y]) => [b.x + x, b.y + y] as Vec) : polygonPoints(b) as Vec[]
    const points = source.map(([x, y]) => turn(x, y, s))
    const left = Math.min(...points.map(p => p[0])), top = Math.min(...points.map(p => p[1]))
    const right = Math.max(...points.map(p => p[0])), bottom = Math.max(...points.map(p => p[1]))
    turned = { ...b, x: left, y: top, w: right - left, h: bottom - top, polygon: points.map(([x, y]) => [x - left, y - top] as const) }
    delete turned.profile
    if (b.bezier) turned.bezier = b.bezier.map(handle => handle && ({ ...handle,
      ...(handle.in ? { in: turn(handle.in[0], handle.in[1], s) } : {}),
      ...(handle.out ? { out: turn(handle.out[0], handle.out[1], s) } : {}) }))
  }
  if (platformLedgesDisabled(b)) disablePlatformLedges(turned)
  cache.set(b, turned); platforms[s > 0 ? 1 : 0].set(turned, b)
  return turned
}

/** The contact world as seen from the wall: shapes and moving bodies turned into the frame. */
export function turnContactWorld(world: ContactWorld, wall: Wall): ContactWorld {
  const s = enterSign(wall)
  const colliders = world.colliders.map(c => {
    const platform = turnPlatform(c.platform, s)
    if (c.prop) {
      const h = propHeight(c.prop), [x, cy] = turn(c.prop.x, c.prop.y - h / 2, s), [vx, vy] = turn(c.prop.vx, c.prop.vy, s)
      return { ...c, platform, prop: { ...c.prop, x, y: cy + h / 2, vx, vy, angle: turnAngle(c.prop.angle, s) } }
    }
    if (c.robot) {
      const [x, y] = turn(c.robot.x, c.robot.y, s)
      return { ...c, platform, robot: { ...c.robot, x, y, angle: turnAngle(c.robot.angle, s) } }
    }
    return { ...c, platform }
  })
  return { platforms: colliders.map(c => c.platform), colliders, ...(world.ropePlatforms ? { ropePlatforms: world.ropePlatforms.map(b => turnPlatform(b, s)) } : {}) }
}

/** Contacts found in the frame, returned to the world and its own colliders. A push is not carried out: the prop
 * solver drives pushes horizontally, so on a wall the hands do not work props. */
export function contactsToWorld(contacts: PlayerContacts, world: ContactWorld, wall: Wall): PlayerContacts {
  const s = -enterSign(wall), collider = (id: string) => world.colliders.find(c => c.id === id)!
  const support = contacts.support && collider(contacts.support.collider.id)
  const [mx, my] = turn(contacts.motion.x, contacts.motion.y, s)
  return {
    support: contacts.support && support ? { ...contacts.support, y: line(contacts.support.y, 'y', wall), angle: turnAngle(contacts.support.angle, s), platform: support.platform, collider: support } : null,
    push: null,
    body: contacts.body.map(c => ({ ...c, collider: collider(c.collider.id), normal: turn(c.normal[0], c.normal[1], s), point: turn(c.point[0], c.point[1], s) })),
    motion: { ...contacts.motion, x: mx, y: my },
  }
}

/** A lone line value crossing the frame in either direction: on a right-hand wall x-lines change sign, on a
 * left-hand wall y-lines do. */
const line = (value: number, axis: 'x' | 'y', wall: Wall) => (axis === 'x') === (wall === 'right') ? -value : value

/**
 * Turn the player's state into the wall's frame (`enter`) or back into the world. Pairs and directions turn with the
 * frame; lone lines change slot meaning as described above. References to world shapes follow the turned shapes.
 */
export function turnPlayerState(p: Player, wall: Wall, enter: boolean) {
  const s = enter ? enterSign(wall) : -enterSign(wall)
  const seen = new Set<object>()
  const once = (value: object | null | undefined): value is object => !!value && !seen.has(value) && !!seen.add(value)
  const pair = (target: Record<string, number>, kx: string, ky: string) => {
    if (typeof target[kx] !== 'number' || typeof target[ky] !== 'number') return
    const [x, y] = turn(target[kx], target[ky], s); target[kx] = x; target[ky] = y
  }
  const lone = (target: Record<string, number | undefined>, key: string, axis: 'x' | 'y') => {
    if (typeof target[key] === 'number') target[key] = line(target[key], axis, wall)
  }
  const angle = (target: Record<string, number | undefined>, key: string) => { if (typeof target[key] === 'number') target[key] = turnAngle(target[key], s) }
  const slope = (target: Record<string, number | undefined>, key: string) => { if (typeof target[key] === 'number') target[key] = turnSlope(target[key]) }
  const point = (value: number[] | undefined) => { if (value && once(value)) { const [x, y] = turn(value[0], value[1], s); value[0] = x; value[1] = y } }
  const shapes = (list: readonly Platform[]) => list.map(b => turnPlatform(b, s))
  const footwork = (value: Footwork | null) => {
    if (!once(value)) return
    value.terrain = shapes(value.terrain)
    for (const foot of value.feet) {
      const f = foot as unknown as Record<string, number>
      pair(f, 'x', 'y'); pair(f, 'anchorX', 'anchorY'); lone(f, 'groundY', 'y'); angle(f, 'groundAngle'); angle(f, 'angle')
      for (const state of [foot.release, foot.settle]) if (state && once(state)) { pair(state as unknown as Record<string, number>, 'x', 'y'); angle(state as unknown as Record<string, number>, 'angle') }
    }
    for (const balance of value.pushBalance ?? []) point(balance as unknown as number[])
  }
  const record = p as unknown as Record<string, number>
  pair(record, 'x', 'y'); pair(record, 'vx', 'vy'); pair(record, 'spawnX', 'spawnY'); lone(record, 'jumpStart', 'y'); angle(record, 'groundAngle')
  if (p.sliding) { pair(p.sliding as unknown as Record<string, number>, 'x', 'y'); angle(p.sliding as unknown as Record<string, number>, 'angle') }
  if (p.wallBrace && once(p.wallBrace)) {
    const brace = p.wallBrace as unknown as Record<string, number>
    if (p.wallBrace.wallY !== undefined) pair(brace, 'wallX', 'wallY'); else lone(brace, 'wallX', 'x')
    point(p.wallBrace.normal)
  }
  if (p.ledgeReach && once(p.ledgeReach)) pair(p.ledgeReach as unknown as Record<string, number>, 'x', 'y')
  if (p.stepIntent) { const step = p.stepIntent as unknown as Record<string, number>; pair(step, 'edgeX', 'edgeY'); slope(step, 'slope'); slope(step, 'outwardSlope') }
  if (p.freeFall) { point(p.freeFall.bodyOffset); if (p.freeFall.impact) pair(p.freeFall.impact as unknown as Record<string, number>, 'vx', 'vy') }
  for (const palm of p.shove?.contact ?? []) if (once(palm)) { pair(palm as unknown as Record<string, number>, 'x', 'y'); pair(palm as unknown as Record<string, number>, 'nx', 'ny') }
  footwork(p.anim.footwork)
  if (p.terrain) p.terrain = shapes(p.terrain)
}

/**
 * The frame changes only in free flight, at the end of a body turn. State that carries lone lines, or that belongs to
 * the old footing, starts afresh; position, velocity and the turn's own outcome are kept.
 */
export function changeWallFrame(p: Player, wall: Wall | undefined) {
  if (wall) p.wall = wall; else delete p.wall
  p.anim.footwork = null; p.pushing = null; p.pushRig = null; p.contacts = null; p.wallBrace = null
  p.sliding = null; p.stepIntent = null; p.ledgeReach = null; p.wallJump = null
  p.anim.dryTurn = null; p.anim.slideEntry = null
  p.groundAngle = wallFrameAngle(wall)
  // The height a jump is measured from is a line across the new floor: the feet's height above it.
  p.jumpStart = wall ? p.x : p.y
}

/**
 * Screen controls for a body on a wall, in the wall frame's terms. Up and Down walk along the wall; pressing toward the
 * wall is the frame's Down (crouch, as Up crouches toward a ceiling) and pressing away from it is the frame's Up.
 * Jump, detach and every other control pass through unchanged.
 */
export function wallInput(input: JumpInput, wall: Wall): JumpInput {
  const up = !!input.climb, down = !!(input.descend ?? (input.drop && !input.detach))
  const along = (up ? 1 : 0) - (down ? 1 : 0), toward = wall === 'right' ? 1 : -1
  const into = input.move * toward > .5, out = input.move * toward < -.5
  // On a right-hand wall the frame's +x runs up the screen; on a left-hand wall, down it.
  return { ...input, move: along * toward, climb: out, crouch: into, descend: into, drop: into || !!input.detach && !!input.drop }
}

let active: Wall | undefined
/** The wall frame a query is running in, for animation deferred to the drawn frame (characterAnimation.ts). */
export const currentWallFrame = () => active

/** Run `query` with the player's state in the wall's frame, then return it to the world. */
export function inWallFrame<T>(p: Player, query: (wall: Wall) => T): T {
  const wall = p.wall!, outer = active
  turnPlayerState(p, wall, true); delete p.wall; active = wall
  try { return query(wall) } finally { active = outer; turnPlayerState(p, wall, false); p.wall = wall }
}

/** A world vector seen from the wall. */
export const vectorToWall = (wall: Wall, x: number, y: number) => turn(x, y, enterSign(wall))

/** Which wall, if any, a gravity vector stands the body on. A sideways pull must clearly win; the current footing
 * holds through a near tie, so a body at a field's corner does not turn back and forth. */
export function wallForGravity(gx: number, gy: number, current: Wall | undefined, deadband: number): Wall | undefined | null {
  if (Math.hypot(gx, gy) <= deadband) return null
  const sideways = current ? Math.abs(gx) * 1.25 >= Math.abs(gy) : Math.abs(gx) > Math.abs(gy) * 1.25
  return sideways ? gx > 0 ? 'right' : 'left' : undefined
}
