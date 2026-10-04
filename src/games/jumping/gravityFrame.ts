import type { Player, Platform } from './model.ts'
import type { ContactWorld, PlayerContacts } from './playerContacts.ts'
import type { Footwork } from './footwork.ts'
import type { Climbing, Ladder, Rope, RopeState } from './climbables.ts'
import type { PushHands } from './propGeometry.ts'
import { polygonPoints } from './geometry.ts'
import { disablePlatformLedges, platformLedgesDisabled } from './terrainLedges.ts'

const platforms = new WeakMap<Platform, Platform>()
const outlines = new WeakMap<object, Platform['polygon']>()
/** Reflection is a coordinate frame for the existing controller, not a second
 * set of movement rules. Static shapes and translated local outlines are cached. */
export function mirrorPlatform(b: Platform): Platform {
  const cached = platforms.get(b)
  if (cached) { if (platformLedgesDisabled(b)) disablePlatformLedges(cached); return cached }
  let polygon: Platform['polygon']
  if (b.polygon || b.profile) {
    const source = (b.polygon ?? b.profile)!
    polygon = outlines.get(source)
    if (!polygon) {
      polygon = polygonPoints({ ...b, x: 0, y: 0 }).map(([x, y]) => [x, b.h - y] as const).reverse()
      outlines.set(source, polygon)
    }
  }
  const reflected: Platform = { ...b, y: -b.y - b.h, ...(polygon ? { polygon } : {}) }
  delete reflected.profile
  if (platformLedgesDisabled(b)) disablePlatformLedges(reflected)
  platforms.set(b, reflected); platforms.set(reflected, b)
  return reflected
}
export const mirrorPlatforms = (shapes: readonly Platform[]) => shapes.map(mirrorPlatform)
const ladders = new WeakMap<Ladder, Ladder>()
export function mirrorLadder(ladder: Ladder): Ladder {
  const cached = ladders.get(ladder)
  if (cached) return cached
  const reflected = { ...ladder, top: -ladder.bottom, bottom: -ladder.top }
  ladders.set(ladder, reflected); ladders.set(reflected, ladder)
  return reflected
}
const ropeDefinitions = new WeakMap<Rope, Rope>()
function mirrorRope(rope: RopeState) {
  let definition = ropeDefinitions.get(rope.definition)
  if (!definition) {
    definition = { ...rope.definition, y: -rope.definition.y }
    // Live nodes carry the path; the authored rest layout is never mutated.
    delete definition.rest
    ropeDefinitions.set(rope.definition, definition); ropeDefinitions.set(definition, rope.definition)
  }
  rope.definition = definition
  for (const n of rope.nodes) { n.y = -n.y; n.oldY = -n.oldY }
  for (const bend of rope.bends) if (bend) bend[1] = -bend[1]
}
export function mirrorContactWorld(world: ContactWorld): ContactWorld {
  const colliders = world.colliders.map(c => ({ ...c, platform: mirrorPlatform(c.platform),
    ...(c.prop ? { prop: { ...c.prop, y: c.prop.size - c.prop.y, vy: -c.prop.vy, angle: -c.prop.angle, angularVelocity: -c.prop.angularVelocity } } : {}),
    ...(c.robot ? { robot: { ...c.robot, y: -c.robot.y, angle: -c.robot.angle } } : {}) }))
  return { platforms: colliders.map(c => c.platform), colliders, ...(world.ropePlatforms ? { ropePlatforms: mirrorPlatforms(world.ropePlatforms) } : {}) }
}
export function mirrorContacts(contacts: PlayerContacts, world: ContactWorld): PlayerContacts {
  const collider = (id: string) => world.colliders.find(c => c.id === id)!
  const hands = (value: PushHands | null): PushHands | null => value && ({ ...value, slope: -value.slope,
    ...(value.palms ? { palms: value.palms.map(p => ({ ...p, y: -p.y, ny: -p.ny })) as NonNullable<PushHands['palms']> } : {}) })
  const support = contacts.support && collider(contacts.support.collider.id)
  return {
    support: contacts.support && support ? { ...contacts.support, y: -contacts.support.y, angle: -contacts.support.angle, platform: support.platform, collider: support } : null,
    push: contacts.push ? { ...contacts.push, collider: collider(contacts.push.collider.id), hands: hands(contacts.push.hands) } : null,
    body: contacts.body.map(c => ({ ...c, collider: collider(c.collider.id), normal: [c.normal[0], -c.normal[1]], point: [c.point[0], -c.point[1]] })),
    motion: { ...contacts.motion, y: -contacts.motion.y },
  }
}

/** Involution: reflect before a controller/pose query and restore in finally.
 * World positions remain world positions for props, mechanisms and rendering. */
export function mirrorPlayerState(p: Player, allRopes = false) {
  const seen = new Set<object>()
  const rope = (value: RopeState) => { if (!seen.has(value)) { seen.add(value); mirrorRope(value) } }
  const hands = (value: PushHands | Player['pushing']) => {
    if (!value || seen.has(value)) return
    seen.add(value)
    if (value.slope !== undefined) value.slope = -value.slope
    for (const palm of value.palms ?? []) { palm.y = -palm.y; palm.ny = -palm.ny }
  }
  const footwork = (value: Footwork | null) => {
    if (!value || seen.has(value)) return
    seen.add(value); value.terrain = mirrorPlatforms(value.terrain)
    for (const foot of value.feet) {
      foot.y = -foot.y; foot.anchorY = -foot.anchorY; foot.groundY = -foot.groundY
      foot.groundAngle = -foot.groundAngle; foot.angle = -foot.angle
      for (const state of [foot.release, foot.settle]) if (state) { state.y = -state.y; state.angle = -state.angle }
    }
  }
  const caught = (value: { y: number; vy: number; footwork?: Footwork | null; pushing?: Player['pushing']; ledgeReach?: Player['ledgeReach']; climbing?: Climbing | null }) => {
    if (seen.has(value)) return
    seen.add(value); value.y = -value.y; value.vy = -value.vy
    if (value.footwork) footwork(value.footwork)
    if (value.pushing) hands(value.pushing)
    if (value.ledgeReach && !seen.has(value.ledgeReach)) { seen.add(value.ledgeReach); value.ledgeReach.y = -value.ledgeReach.y }
    if (value.climbing) climb(value.climbing)
  }
  const hang = (value: Player['hang']) => {
    if (!value || seen.has(value)) return
    seen.add(value); value.edgeY = -value.edgeY
    if (value.slope !== undefined) value.slope = -value.slope
    caught(value.caught)
  }
  const climb = (value: Climbing) => {
    if (seen.has(value)) return
    seen.add(value); caught(value.caught); hang(value.caught.hang ?? null)
    if (value.ladder) value.ladder = mirrorLadder(value.ladder)
    if (value.rope) rope(value.rope)
    if (value.screenAxis) value.screenAxis = -value.screenAxis
    if (value.turn) { value.turn.angle = -value.turn.angle; value.turn.target = -value.turn.target }
  }
  p.y = -p.y; p.vy = -p.vy; p.spawnY = -p.spawnY; p.jumpStart = -p.jumpStart; p.groundAngle = -p.groundAngle
  if (p.gravity !== undefined) p.gravity = -p.gravity
  if (p.terrain) p.terrain = mirrorPlatforms(p.terrain)
  footwork(p.footwork); hands(p.pushing); hang(p.hang)
  if (p.climbing) climb(p.climbing)
  if (allRopes) for (const value of p.ropes ?? []) rope(value)
  if (p.releaseTurn) { p.releaseTurn.angle = -p.releaseTurn.angle; p.releaseTurn.target = -p.releaseTurn.target }
  if (p.mantle) {
    const m = p.mantle
    m.edgeY = -m.edgeY; m.toY = -m.toY
    if (m.slope !== undefined) m.slope = -m.slope
    if (m.step) { caught(m.step.caught); if (m.step.landingAngle !== undefined) m.step.landingAngle = -m.step.landingAngle }
    if (m.descending) { caught(m.descending.caught); if (m.descending.climbable) climb(m.descending.climbable) }
  }
  if (p.ledgeReach && !seen.has(p.ledgeReach)) { seen.add(p.ledgeReach); p.ledgeReach.y = -p.ledgeReach.y }
  if (p.stepIntent) { p.stepIntent.edgeY = -p.stepIntent.edgeY; if (p.stepIntent.slope !== undefined) p.stepIntent.slope = -p.stepIntent.slope }
  if (p.sliding) { p.sliding.y = -p.sliding.y; p.sliding.angle = -p.sliding.angle }
}
