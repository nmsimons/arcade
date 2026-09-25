import type { Prop } from './challenge.ts'
import type { JumpInput, Platform, Player } from './model.ts'
import { STEP, TUNING } from './model.ts'
import type { GroundSurface } from './terrain.ts'
import { exposedSide, groundAt } from './terrain.ts'
import { canGrip } from './friction.ts'
import { boxPushFace, propBounds, propPushHands } from './propGeometry.ts'
import type { PushHands } from './propGeometry.ts'
import { bodyContact, bodyIntersects, moveBody } from './geometry.ts'
import type { Vec } from './geometry.ts'
import { climbContactRoot, LEDGE_CLIMB_TIME } from './ledge.ts'
import { ledgeObstacles } from './terrainLedges.ts'

/** A stable identity connects the same solid across successive geometry snapshots. */
export interface PlayerCollider {
  id: string
  platform: Platform
  prop?: Prop
}
export interface ContactWorld {
  platforms: readonly Platform[]
  colliders: readonly PlayerCollider[]
}
export interface SupportContact extends GroundSurface { collider: PlayerCollider }
export interface PushContact {
  collider: PlayerCollider
  direction: number
  effort: number
  wallX: number
  hands: PushHands | null
}
export interface PlayerContacts {
  support: SupportContact | null
  push: PushContact | null
  body: { collider: PlayerCollider; normal: Vec; point: Vec; load: number }[]
  /** Travel after collision resolution, excluding transport by a moving support. */
  motion: { x: number; y: number; speed: number }
}

export function staticContactWorld(platforms: readonly Platform[]): ContactWorld {
  return { platforms, colliders: platforms.map((platform, i) => ({ id: `terrain:${i}`, platform })) }
}

/** The climb motor and prop forces use the same next-pose contact. */
export function mantleContact(m: NonNullable<Player['mantle']>, world: ContactWorld, dt = STEP) {
  const before = climbContactRoot(m.time / LEDGE_CLIMB_TIME, m.braced)
  const next = climbContactRoot(Math.min(1, (m.time + dt) / LEDGE_CLIMB_TIME), m.braced)
  const from: Vec = [m.edgeX + before[0] * m.side, m.edgeY + before[1]]
  const target: Vec = [m.edgeX + next[0] * m.side, m.edgeY + next[1]]
  const sweep = moveBody(from, target, ledgeObstacles(world.colliders.filter(c => c.prop).map(c => c.platform), m))
  return { from, target, sweep }
}

/** One policy for the motor, prop forces, support transport and animation.
 * Query before solving, then publish the final contacts after the body sweep.
 * Consumers never independently decide which object the player is pushing. */
export function playerContacts(p: Player, input: JumpInput, world: ContactWorld): PlayerContacts {
  const free = !p.hang && !p.mantle && !p.climbing
  const ground = p.grounded && free ? groundAt(world.platforms, p.x, p.y, .2, s => canGrip(s.angle)) : null
  const collider = ground && world.colliders.find(c => c.platform === ground.platform)
  const support = ground && collider ? { ...ground, collider } : null
  const direction = Math.sign(input.move), candidates: PushContact[] = []
  // Prop forces run before the player sweep. A released/buffered jump is
  // already a departure intent and must not receive one last grounded shove.
  const departing = !input.jump && (p.charging || p.buffer > 0)
  if (support && direction && !p.knockback && !departing) for (const c of world.colliders) {
    if (c.prop && c === collider) continue
    const b = c.prop
    if (b) {
      const bounds = propBounds(b)
      if (p.y <= bounds.y + 12 || p.y - 42 >= bounds.y + bounds.h || p.y > bounds.y + bounds.h + b.size * .6) continue
      const hands = propPushHands(b, p.x, p.y, direction)
      const face = b.kind === 'box' ? boxPushFace(b, p.x, p.y, direction, Math.min(43, b.size * .6)) : null
      const wallX = face?.wallX ?? hands?.wallX
      if (wallX === undefined || (b.kind === 'box' && !face)) continue
      candidates.push({ collider: c, direction, effort: Math.min(1, Math.abs(input.move)), wallX, hands })
    } else {
      const b = c.platform, wallX = direction === 1 ? b.x : b.x + b.w, gap = (wallX - p.x) * direction
      if (gap < 11.9 || gap > 38 || !exposedSide(world.platforms, b, direction, p.y - 44.1, p.y - 43.9)) continue
      candidates.push({ collider: c, direction, effort: Math.min(1, Math.abs(input.move)), wallX, hands: { wallX, slope: 0 } })
    }
  }
  // The nearest reachable face wins, regardless of object creation order.
  candidates.sort((a, b) => (a.wallX - b.wallX) * direction || a.collider.id.localeCompare(b.collider.id))
  const nearest = candidates[0]
  const push = nearest && (nearest.collider.prop || (nearest.wallX - p.x) * direction <= 26.5) ? nearest : null
  const body: PlayerContacts['body'] = []
  if (p.mantle && !p.mantle.step && !p.mantle.descending && !p.mantle.returning && !input.drop && !input.descend && !input.detach) {
    const { from, target, sweep: probe } = mantleContact(p.mantle, world)
    const dx = target[0] - from[0], dy = target[1] - from[1], distance = Math.hypot(dx, dy)
    for (const hit of probe.contacts) {
      const collider = world.colliders.find(c => c.prop && c.platform === hit.platform)
      if (!collider || body.some(c => c.collider === collider) || distance < 1e-7) continue
      const load = Math.max(0, -(hit.normal[0] * dx + hit.normal[1] * dy) / distance) * 600
      const point = bodyContact(hit.platform, probe.x, probe.y, hit.normal)
      if (load) body.push({ collider, normal: hit.normal, point: [point.x, point.y], load })
    }
  }
  const needsBodyLoad = !support || !push?.collider.prop && Math.abs(input.move) > .01
  if (free && !departing && needsBodyLoad && world.colliders.some(c => c.prop)) {
    // Probe the same body hull used by the player sweep. This includes torso
    // and sloping foot contacts while airborne, where no standing support exists.
    const move = Math.max(-1, Math.min(1, input.move))
    const height = p.crouching ? TUNING.crouchHeight : TUNING.height
    const probe = moveBody([p.x, p.y], [p.x + move * .2, p.y + .2], world.platforms, height)
    for (const hit of probe.contacts) {
      const collider = world.colliders.find(c => c.platform === hit.platform && c.prop)
      if (!collider || collider === support?.collider || body.some(c => c.collider === collider)) continue
      // A gripped foothold balances weight through normal force and traction.
      // Sending only its normal component into a curved support would create
      // a sideways shove every frame, even when the player stands still.
      const gravity = support ? 0 : TUNING.gravity
      // Input away from this contact cannot cancel gravity's load: a wall on
      // the other side may prevent that requested separation altogether.
      const load = Math.max(0, -hit.normal[0] * move * (p.grounded ? TUNING.acceleration : TUNING.airAcceleration))
        + Math.max(0, -hit.normal[1] * gravity)
      const point = bodyContact(hit.platform, p.x, p.y, hit.normal, height)
      if (load) body.push({ collider, normal: hit.normal, point: [point.x, point.y], load })
    }
  }
  return { support, push, body, motion: { x: 0, y: 0, speed: 0 } }
}

/** Constrain the walking motor before integration instead of undoing its work
 * afterward. Solve the hand face and footing together on a tilted box. */
export function pushingVelocity(p: Player, contact: PushContact | null, world: ContactWorld, dt: number): number | null {
  if (!contact?.hands || !p.grounded || p.knockback) return null
  const { hands, direction } = contact
  let target = hands.wallX - direction * 25.5
  for (let i = 0; i < 8; i++) {
    const ground = groundAt(world.platforms, target, p.y, Math.abs(target - p.x) * 2 + 1, s => canGrip(s.angle))
    if (!ground) return null
    target = hands.wallX + (ground.y - p.y) * hands.slope - direction * 25.5
  }
  const limit = (95 + Math.abs(contact.collider.prop?.vx ?? 0)) * dt
  const x = p.x + Math.max(-limit, Math.min(limit, target - p.x))
  const ground = groundAt(world.platforms, x, p.y, Math.abs(x - p.x) * 2 + 1, s => canGrip(s.angle))
  if (!ground || world.platforms.some(b => bodyIntersects(x, ground.y, b, p.crouching ? TUNING.crouchHeight : TUNING.height))) return 0
  return (x - p.x) / dt
}

/** Presentation consumes the solved contact; it never moves the player. */
export function updatePushingPose(p: Player, contact: PushContact | null, dt: number) {
  if (contact?.hands && p.grounded && !p.hang && !p.mantle && !p.climbing) {
    const previous = p.pushing?.direction === contact.direction && p.contacts?.push?.collider.id === contact.collider.id ? p.pushing.amount : 0
    p.pushing = { ...contact.hands, direction: contact.direction, amount: Math.min(1, previous + dt / .14), effort: contact.effort }
  } else if (p.pushing) {
    const amount = Math.max(0, p.pushing.amount - dt / .16)
    p.pushing = amount && p.grounded && !p.hang && !p.mantle && !p.climbing && p.pushing.direction === p.facing
      ? { ...p.pushing, amount, effort: 0 } : null
  }
}

/** Transport the body and its planted anchors before measuring locomotion. */
export function translatePlayer(p: Player, dx: number, dy: number) {
  p.x += dx; p.y += dy
  // An automatic step targets static terrain. A prop pushing the player away
  // interrupts it rather than moving the destination off the real ledge.
  if (p.mantle?.step && Math.hypot(dx, dy) > .001) { p.mantle = null; p.footwork = null; p.grabCooldown = .25 }
  if (p.footwork) for (const foot of p.footwork.feet) {
    foot.x += dx; foot.y += dy; foot.anchorX += dx; foot.anchorY += dy; foot.groundY += dy
    if (foot.settle) foot.settle = { ...foot.settle, x: foot.settle.x + dx, y: foot.settle.y + dy }
  }
  if (p.hang) { p.hang.edgeX += dx; p.hang.edgeY += dy; p.hang.caught.x += dx; p.hang.caught.y += dy }
  if (p.mantle) { p.mantle.edgeX += dx; p.mantle.edgeY += dy; p.mantle.toX += dx; p.mantle.toY += dy }
}
