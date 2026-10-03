import { mirrorPlayerState, mirrorContactWorld, mirrorContacts } from './gravityFrame.ts'
import type { Prop, RobotState } from './challenge.ts'
import type { JumpInput, Platform, Player } from './model.ts'
import { STEP, TUNING } from './model.ts'
import type { GroundSurface } from './terrain.ts'
import { exposedWallFaces, groundAt } from './terrain.ts'
import { canGrip } from './friction.ts'
import { boxPushFace, propBounds, propPushHands } from './propGeometry.ts'
import type { PushHands } from './propGeometry.ts'
import { bodyContact, bodyIntersects, moveBody } from './geometry.ts'
import type { Vec } from './geometry.ts'
import { climbBodyHeight, climbContactRoot, climbFrame, ledgeEase, LEDGE_CATCH_TIME, LEDGE_CLIMB_TIME, ROPE_LEDGE_CATCH_TIME } from './ledge.ts'
import { ledgeObstacles } from './terrainLedges.ts'

/** A stable identity connects the same solid across successive geometry snapshots. */
export interface PlayerCollider {
  id: string
  platform: Platform
  prop?: Prop
  robot?: RobotState
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

/** Use the existing climb envelope for every solid contact, including props
 * and bots. The locomotion root lies below the feet during a folded hang. */
export function playerContactBody(p: Player): { x: number; y: number; height: number } {
  if (!p.hang && (!p.mantle || p.mantle.step)) return { x: p.x, y: p.y, height: p.crouching ? TUNING.crouchHeight : TUNING.height }
  if (p.inverted) {
    mirrorPlayerState(p); p.inverted = false
    try { const body = playerContactBody(p); return { ...body, y: -body.y } }
    finally { mirrorPlayerState(p); p.inverted = true }
  }
  const m = p.mantle?.step ? null : p.mantle, h = p.hang, grip = m ?? h
  if (!grip) return { x: p.x, y: p.y, height: p.crouching ? TUNING.crouchHeight : TUNING.height }
  const progress = m ? Math.max(0, Math.min(1, (m.time - (m.descending ? LEDGE_CATCH_TIME : 0)) / LEDGE_CLIMB_TIME)) : 0
  const t = m?.descending ? 1 - progress : progress, crouched = !!m?.crouched
  const pose = climbFrame(t, grip.braced, grip.slope, crouched, m?.inset)
  const root = climbContactRoot(t, grip.braced, grip.slope, crouched, m?.inset)
  const blend = h ? ledgeEase(h.time / (h.caught.climbing?.rope ? ROPE_LEDGE_CATCH_TIME : LEDGE_CATCH_TIME))
    : m?.descending ? ledgeEase(m.time / LEDGE_CATCH_TIME) : 1
  return { x: p.x + (root[0] - pose.root[0]) * grip.side * blend,
    y: p.y + (root[1] - pose.root[1]) * blend, height: climbBodyHeight(t, crouched) }
}

/** The climb motor and prop forces use the same next-pose contact. */
export function mantleContact(m: NonNullable<Player['mantle']>, world: ContactWorld, dt = STEP, inset = m.inset ?? 20) {
  const progress = Math.min(1, (m.time + dt) / LEDGE_CLIMB_TIME)
  const before = climbContactRoot(m.time / LEDGE_CLIMB_TIME, m.braced, m.slope, m.crouched, m.inset)
  const next = climbContactRoot(progress, m.braced, m.slope, m.crouched, inset)
  const from: Vec = [m.edgeX + before[0] * m.side, m.edgeY + before[1]]
  const target: Vec = [m.edgeX + next[0] * m.side, m.edgeY + next[1]]
  const sweep = moveBody(from, target, ledgeObstacles(world.colliders.filter(c => c.prop || c.robot).map(c => c.platform), m), climbBodyHeight(progress, m.crouched))
  return { from, target, sweep }
}

/** Follow the authored curve only as far as the obstacle has yielded this tick.
 * Rejecting the entire step makes a slow shove look like low-frame-rate playback. */
export function mantleAdvance(m: NonNullable<Player['mantle']>, world: ContactWorld, dt: number) {
  const clear = (advance: number) => {
    const { target, sweep } = mantleContact(m, world, advance)
    return Math.hypot(sweep.x - target[0], sweep.y - target[1]) < 1e-7
  }
  if (clear(dt)) return dt
  let low = 0, high = dt
  // Search time on the curve, not a linear blend of collision-resolved roots:
  // the torso, head and changing crouch height must all use the same progress.
  for (let i = 0; i < 14; i++) {
    const mid = (low + high) / 2
    if (clear(mid)) low = mid; else high = mid
  }
  return low > 1e-6 ? low : 0
}

/** Reposition a stopped pull along the ledge without changing its progress or grip. */
export function narrowMantle(m: NonNullable<Player['mantle']>, world: ContactWorld, targetInset: number, dt: number) {
  const inset = Math.max(targetInset, (m.inset ?? 20) - dt * 60)
  const { from, target } = mantleContact(m, world, 0, inset)
  const safe = moveBody(from, target, ledgeObstacles(world.platforms, m), climbBodyHeight(m.time / LEDGE_CLIMB_TIME, m.crouched))
  if (Math.hypot(safe.x - target[0], safe.y - target[1]) > 1e-7) return false
  m.inset = inset
  return true
}

/** One policy for the motor, prop forces, support transport and animation.
 * Query before solving, then publish the final contacts after the body sweep.
 * Consumers never independently decide which object the player is pushing. */
export function playerContacts(p: Player, input: JumpInput, world: ContactWorld): PlayerContacts {
  if (p.inverted) {
    const reflected = mirrorContactWorld(world)
    mirrorPlayerState(p); p.inverted = false
    try { return mirrorContacts(playerContacts(p, input, reflected), world) }
    finally { mirrorPlayerState(p); p.inverted = true }
  }
  const free = !p.hang && !p.mantle && !p.climbing
  const ground = p.grounded && free ? groundAt(world.platforms, p.x, p.y, .2, s => canGrip(s.angle)) : null
  const collider = ground && world.colliders.find(c => c.platform === ground.platform)
  const support = ground && collider ? { ...ground, collider } : null
  const direction = Math.sign(input.move), candidates: PushContact[] = []
  // Prop forces run before the player sweep. A pressed/buffered jump is
  // already a departure intent and must not receive one last grounded shove.
  const departing = input.jump && !p.jumpHeld || p.buffer > 0
  if (support && direction && !departing) for (const c of world.colliders) {
    if (c.prop && c === collider) continue
    // Standing hand reach must not turn a ceiling above the crouched body into a wall.
    if (p.crouching && c.platform.y + c.platform.h <= p.y - TUNING.crouchHeight) continue
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
      for (const wallX of exposedWallFaces(world.platforms, c.platform, direction, p.y - 44.1, p.y - 43.9)) {
        const gap = (wallX - p.x) * direction
        if (gap < 11.9 || gap > 38) continue
        candidates.push({ collider: c, direction, effort: Math.min(1, Math.abs(input.move)), wallX, hands: { wallX, slope: 0 } })
      }
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
    const probe = moveBody([p.x, p.y], [p.x + move * .2, p.y + ((p.gravity ?? TUNING.gravity) < 0 ? -.2 : .2)], world.platforms, height)
    for (const hit of probe.contacts) {
      const collider = world.colliders.find(c => c.platform === hit.platform && c.prop)
      if (!collider || collider === support?.collider || body.some(c => c.collider === collider)) continue
      // A gripped foothold balances weight through normal force and traction.
      // Sending only its normal component into a curved support would create
      // a sideways shove every frame, even when the player stands still.
      const gravity = support ? 0 : p.gravity ?? TUNING.gravity
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
  if (!contact?.hands || !p.grounded) return null
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
    // The fading pose owns its source identity. A one-tick contact gap must not
    // restart the hands at rest when that same moving surface is reacquired.
    const previous = p.pushing?.direction === contact.direction && p.pushing.colliderId === contact.collider.id ? p.pushing.amount : 0
    p.pushing = { ...contact.hands, colliderId: contact.collider.id, direction: contact.direction, amount: Math.min(1, previous + dt / .14), effort: contact.effort }
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
  translateFeet(p, dx, dy)
  if (p.hang) { p.hang.edgeX += dx; p.hang.edgeY += dy; p.hang.caught.x += dx; p.hang.caught.y += dy }
  if (p.mantle) { p.mantle.edgeX += dx; p.mantle.edgeY += dy; p.mantle.toX += dx; p.mantle.toY += dy }
}

/** A planted foot follows its support independently of the body's inertia. */
export function translateFeet(p: Player, dx: number, dy: number) {
  if (p.footwork) for (const foot of p.footwork.feet) {
    foot.x += dx; foot.y += dy; foot.anchorX += dx; foot.anchorY += dy; foot.groundY += dy
    if (foot.settle) foot.settle = { ...foot.settle, x: foot.settle.x + dx, y: foot.settle.y + dy }
  }
}
