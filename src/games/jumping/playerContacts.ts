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
import { playerTurnAngle } from './ropeGravity.ts'
import { isWeightless } from './gravity.ts'
import { retainInterruptedStepPose } from './athlete.ts'

/** A stable identity connects the same solid across successive geometry snapshots. */
export interface PlayerCollider {
  id: string
  platform: Platform
  prop?: Prop
  robot?: RobotState
  playerOnly?: boolean
}
export interface ContactWorld {
  platforms: readonly Platform[]
  colliders: readonly PlayerCollider[]
  /** Physical rope obstacles exclude player-only barriers. */
  ropePlatforms?: readonly Platform[]
}
export interface SupportContact extends GroundSurface { collider: PlayerCollider }
export interface PushContact {
  collider: PlayerCollider
  direction: number
  effort: number
  wallX: number
  hands: PushHands | null
  /** A swimmer supplies the existing body load rather than a grounded shove. */
  swimming?: boolean
  /** A visible approach reach; never consumed by the motor or prop solver. */
  anticipation?: number
  /** A self-moving ball still blocks travel, but supplies no voluntary shove. */
  passive?: boolean
}
export interface PlayerContacts {
  support: SupportContact | null
  push: PushContact | null
  body: { collider: PlayerCollider; normal: Vec; point: Vec; load: number; impactSpeed?: number }[]
  /** Travel after collision resolution, excluding transport by a moving support. */
  motion: { x: number; y: number; speed: number }
}

export function staticContactWorld(platforms: readonly Platform[]): ContactWorld {
  return { platforms, colliders: platforms.map((platform, i) => ({ id: `terrain:${i}`, platform })) }
}

/** An overhead ball meets the swimmer on its curved underside. The broad
 * protective hull's flat cap must not turn that into a head-balancing shelf. */
function propContactNormal(p: Player, collider: PlayerCollider, normal: Vec, point: { nx: number; ny: number }): Vec {
  return p.waterMotion && collider.prop?.kind === 'ball' && normal[1] > .5 && point.ny > .5
    ? [point.nx, point.ny] : normal
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
export function playerContacts(p: Player, input: JumpInput, world: ContactWorld, dt = STEP): PlayerContacts {
  if (p.inverted) {
    const reflected = mirrorContactWorld(world)
    mirrorPlayerState(p); p.inverted = false
    try { return mirrorContacts(playerContacts(p, input, reflected, dt), world) }
    finally { mirrorPlayerState(p); p.inverted = true }
  }
  const free = !p.hang && !p.mantle && !p.climbing && !p.releaseTurn
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
      const motorHands = propPushHands(b, p.x, p.y, direction)
      let lowerHands = p.crouch ? propPushHands(b, p.x, p.y, direction, 43 - p.crouch * 15) : motorHands
      if (!lowerHands && motorHands && p.crouch) {
        // A rotating face can move the low grip just outside the existing
        // reach. Follow its nearest reachable height instead of jumping all
        // the way back to standing hands when that boundary is crossed.
        let low = 43 - p.crouch * 15, high = 43
        for (let pass = 0; pass < 12; pass++) {
          const height = (low + high) / 2, candidate = propPushHands(b, p.x, p.y, direction, height)
          if (candidate) { high = height; lowerHands = candidate }
          else low = height
        }
      }
      // Working height changes the visible palms, while the existing motor
      // spacing continues to follow its established face on tilted objects.
      const hands = lowerHands && motorHands ? { ...lowerHands, wallX: motorHands.wallX, slope: motorHands.slope } : motorHands
      const face = b.kind === 'box' ? boxPushFace(b, p.x, p.y, direction, Math.min(43, b.size * .6)) : null
      const wallX = face?.wallX ?? hands?.wallX
      if (wallX === undefined || (b.kind === 'box' && !face)) continue
      // Keep the unilateral travel obstruction while the ball rolls itself.
      // It cannot supply either a pulling motor or a zero-force working pose.
      const passive = b.kind === 'ball' && b.vx * direction > Math.abs(input.move) * 90 + .1
      candidates.push({ collider: c, direction, effort: passive ? 0 : Math.min(1, Math.abs(input.move)), wallX, hands, ...(passive ? { passive: true } : {}) })
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
  let push = nearest && (nearest.collider.prop || (nearest.wallX - p.x) * direction <= 26.5) ? nearest : null
  const body: PlayerContacts['body'] = []
  // A floating foothold must carry the rider's weight through the prop solver.
  // Keep the reaction vertical so curved supports do not invent a sideways shove.
  if (support?.collider.prop && !support.collider.prop.grounded && free && !departing && (p.gravity ?? TUNING.gravity) > 0) {
    body.push({ collider: support.collider, normal: [0, -1], point: [p.x, p.y], load: p.gravity ?? TUNING.gravity })
  }
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
    const accelerationY = (p.gravity ?? TUNING.gravity) + (p.swimAcceleration ?? 0)
    const probe = moveBody([p.x, p.y], [p.x + move * .2, p.y + (accelerationY < 0 ? -.2 : .2)], world.platforms, height, 1, playerTurnAngle(p))
    for (const hit of probe.contacts) {
      const collider = world.colliders.find(c => c.platform === hit.platform && c.prop)
      if (!collider || collider === support?.collider || body.some(c => c.collider === collider)) continue
      // A gripped foothold balances weight through normal force and traction.
      // Sending only its normal component into a curved support would create
      // a sideways shove every frame, even when the player stands still.
      const gravity = support ? 0 : accelerationY
      // Input away from this contact cannot cancel gravity's load: a wall on
      // the other side may prevent that requested separation altogether.
      const point = bodyContact(hit.platform, p.x, p.y, hit.normal, height)
      const normal = propContactNormal(p, collider, hit.normal, point)
      const load = Math.max(0, -normal[0] * move * (p.grounded ? TUNING.acceleration : TUNING.airAcceleration))
        + Math.max(0, -normal[1] * gravity)
      if (load) body.push({ collider, normal, point: [point.x, point.y], load })
    }
  }
  if (free && !support) {
    // Drift is a physical collision even without steering or gravitational load.
    // Sweep relative to each nearby prop; include the other solids so a wall
    // cannot transmit an impact into an object hidden behind it.
    const hull = playerContactBody(p)
    for (const collider of world.colliders) {
      const prop = collider.prop
      if (!prop || prop.grounded && !isWeightless(p.gravity ?? TUNING.gravity)) continue
      if (Math.abs(p.gravity ?? TUNING.gravity) >= TUNING.gravity - 1e-7
        && (prop.gravity ?? TUNING.gravity) >= TUNING.gravity - 1e-7 && !p.swimAcceleration) continue
      const vx = p.vx - prop.vx, vy = p.vy - prop.vy, b = collider.platform
      if (Math.hypot(vx, vy) < .01 || hull.x + TUNING.width / 2 + Math.abs(vx * dt) < b.x
        || hull.x - TUNING.width / 2 - Math.abs(vx * dt) > b.x + b.w
        || hull.y + Math.abs(vy * dt) < b.y || hull.y - hull.height - Math.abs(vy * dt) > b.y + b.h) continue
      const probe = moveBody([hull.x, hull.y], [hull.x + vx * dt, hull.y + vy * dt], world.platforms, hull.height, 1, playerTurnAngle(p))
      const hit = probe.contacts.find(hit => hit.platform === b)
      if (!hit) continue
      const point = bodyContact(b, probe.x, probe.y, hit.normal, hull.height)
      const normal = propContactNormal(p, collider, hit.normal, point)
      const rx = point.x - prop.x, ry = point.y - prop.y + prop.size / 2
      const closing = -(normal[0] * (vx + prop.angularVelocity * ry) + normal[1] * (vy - prop.angularVelocity * rx))
      if (closing <= .01) continue
      const existing = body.find(contact => contact.collider === collider)
      if (existing) { existing.impactSpeed = closing; existing.normal = normal; existing.point = [point.x, point.y] }
      else body.push({ collider, normal, point: [point.x, point.y], load: 0, impactSpeed: closing })
    }
  }
  if (!support && p.waterMotion && free && direction && !departing) {
    // Reach toward the first side face in the same solid sweep, so palms lead
    // the head and remain on a slowly moving float between body contacts.
    // Only the actual body load above drives the prop and supplies torque.
    const hull = playerContactBody(p)
    const reach = moveBody([hull.x, hull.y], [hull.x + direction * 38, hull.y], world.platforms, hull.height)
    const hit = reach.contacts.find(c => c.normal[0] * direction < -.55)
    const collider = hit && world.colliders.find(c => c.platform === hit.platform && c.prop)
    if (collider?.prop) {
      const hands = propPushHands(collider.prop, p.x, p.y, direction, 12 + 31 * (1 - p.waterMotion.amount))
      if (hands) push = { collider, direction, effort: Math.min(1, Math.abs(input.move)), wallX: hands.wallX, hands, swimming: true }
    }
  }
  return { support, push, body, motion: { x: 0, y: 0, speed: 0 } }
}

/** Constrain the walking motor before integration instead of undoing its work
 * afterward. Solve the hand face and footing together on a tilted box. */
export function pushingVelocity(p: Player, contact: PushContact | null, world: ContactWorld, dt: number, requestedVelocity = p.vx): number | null {
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
  const constrained = (x - p.x) / dt
  const workingApproach = !contact.passive
    && (requestedVelocity * direction < 0 || (p.contacts?.support?.angle ?? 0) * direction <= 0)
  if (contact.collider.prop?.kind !== 'ball' || workingApproach) return constrained
  // Working hands keep the voluntary shove pace while a faster prop escapes.
  // The face can constrain travel or displace an incoming body, but it cannot
  // make the pusher sprint after an outgoing prop. Free steering resumes once
  // that surface leaves hand reach; the prop itself is never speed-clamped.
  return direction * Math.min(requestedVelocity * direction, constrained * direction)
}

/** Lead a shove with a reach toward the first exposed prop. This deliberately
 * lives outside the force-contact query: preparation cannot move an object. */
export function anticipatePush(p: Player, input: JumpInput, world: ContactWorld): PushContact | null {
  if (p.inverted) {
    mirrorPlayerState(p); p.inverted = false
    try {
      const contact = anticipatePush(p, input, mirrorContactWorld(world))
      return contact && mirrorContacts({ support: null, push: contact, body: [], motion: { x: 0, y: 0, speed: 0 } }, world).push
    } finally { mirrorPlayerState(p); p.inverted = true }
  }
  const direction = Math.sign(input.move)
  // A brief slip retains its real slide/brace balance. An interrupted step
  // already owns a continuous outgoing rig and can prepare its incoming hands;
  // an ordinary free reach cannot take over another contact's torso.
  const falling = !p.grounded && p.vy >= 0 && !p.jumpLift && !p.waterMotion
    && (p.dryTurn?.step || !p.sliding?.amount && !p.wallBrace?.amount && !p.slideEntry)
  if (!direction || !(p.grounded || falling) || p.hang || p.mantle || p.climbing || p.freeFall?.amount
    || input.jump && !p.jumpHeld || p.buffer > 0) return null
  const candidates = world.colliders.flatMap(collider => {
    if (!collider.prop || collider.id === p.contacts?.support?.collider.id) return []
    if (collider.prop.kind === 'ball' && collider.prop.vx * direction > Math.abs(input.move) * 90 + .1) return []
    // Reach ahead only while closing on the surface. Chasing an escaping prop
    // keeps the unloaded palms stretched forward and delays the gait release.
    if ((collider.prop.vx - p.vx) * direction > 0) return []
    const hands = propPushHands(collider.prop, p.x, p.y, direction, 43 - p.crouch * 15, 72)
    // Higher footing can put a neighboring prop's grip below the feet. Such
    // a reach cannot become a working push; leave walking/stepping in control
    // rather than folding the whole body toward an unreachable low surface.
    if (!hands || (hands.height ?? 43) < 12) return []
    const gap = (hands.wallX - p.x) * direction
    if (gap >= 72) return []
    const sweep = moveBody([p.x, p.y], [p.x + direction * gap, p.y], world.platforms,
      p.crouching ? TUNING.crouchHeight : TUNING.height)
    const first = sweep.contacts.find(contact => contact.normal[0] * direction < -.4)
    if (first?.platform !== collider.platform) return []
    const proximity = Math.max(0, Math.min(1, (72 - gap) / 34))
    return [{ collider, direction, effort: 0, wallX: hands.wallX, hands,
      anticipation: proximity * proximity * (3 - 2 * proximity) }]
  })
  candidates.sort((a, b) => (a.wallX - b.wallX) * direction)
  return candidates[0] ?? null
}

/** Presentation consumes the solved contact; it never moves the player. */
export function updatePushingPose(p: Player, contact: PushContact | null, dt: number, speed = 0, motion: readonly [number, number] = [0, 0]) {
  if (contact?.passive) contact = null
  if (contact?.hands && (p.grounded || contact.anticipation !== undefined || contact.swimming && p.waterMotion) && !p.hang && !p.mantle && !p.climbing) {
    // The fading pose owns its source identity. A one-tick contact gap must not
    // restart the hands at rest when that same moving surface is reacquired.
    const previous = p.pushing?.direction === contact.direction && p.pushing.colliderId === contact.collider.id ? p.pushing : null
    let hands = contact.hands
    if (contact.anticipation !== undefined && contact.collider.prop && previous?.height !== undefined && hands.height !== undefined) {
      // Losing force contact must not teleport a crouched palm to a lower
      // approach grip. Ease the unloaded height, querying the actual surface
      // each step; force-bearing palms still use their exact current contact.
      const height = previous.height + (hands.height - previous.height) * (1 - Math.exp(-dt / .08))
      hands = propPushHands(contact.collider.prop, p.x, p.y, contact.direction, height, 72) ?? hands
    }
    // Opposition is the requested motion that the contact solver could not
    // deliver. Ease its presentation independently of the hand-contact blend.
    const targetLoad = Math.max(0, contact.effort - speed / TUNING.runSpeed)
    const load = (previous?.load ?? 0) + (targetLoad - (previous?.load ?? 0)) * (1 - Math.exp(-dt / .08))
    p.pushing = { ...hands, colliderId: contact.collider.id, direction: contact.direction,
      // A prop has already received this tick's force. Its working palms must
      // be established now; resistance still loads the body gradually above.
      amount: contact.anticipation === undefined ? Math.min(1, (previous?.amount ?? 0) + dt / .14) : previous?.amount ?? 0,
      ready: contact.anticipation ?? (contact.collider.prop && !contact.swimming ? 1 : 0), effort: contact.effort, load }
  } else if (p.pushing) {
    const amount = Math.max(0, p.pushing.amount - dt / .16)
    const ready = Math.max(0, (p.pushing.ready ?? 0) - dt / .16)
    p.pushing = (amount || ready) && (p.grounded || p.waterMotion) && !p.hang && !p.mantle && !p.climbing && p.pushing.direction === p.facing
      // Released palms relax with the outgoing body. Keeping their old world
      // coordinates pins the arms behind a running player and can fold the
      // trunk or flip an elbow as the shoulders pass the abandoned contact.
      ? { ...p.pushing, wallX: p.pushing.wallX + motion[0],
        palms: p.pushing.palms?.map(palm => ({ ...palm, x: palm.x + motion[0], y: palm.y + motion[1] })) as PushHands['palms'],
        amount, ready, effort: 0, load: (p.pushing.load ?? 0) * Math.exp(-dt / .08) } : null
  }
}

/** Transport the body and its planted anchors before measuring locomotion. */
export function translatePlayer(p: Player, dx: number, dy: number) {
  const interruptedStep = !!p.mantle?.step && Math.hypot(dx,dy) > .001
  if (interruptedStep) retainInterruptedStepPose(p)
  p.x += dx; p.y += dy
  // An automatic step targets static terrain. A prop pushing the player away
  // interrupts it rather than moving the destination off the real ledge.
  if (interruptedStep) { p.mantle = null; p.footwork = null; p.grabCooldown = .25 }
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

/** Carried feet and their planted anchors turn with a rotating support. The
 * body stays upright; its normal foot rig can balance on the new slope. */
export function rotateFeet(p: Player, angle: number) {
  const cos = Math.cos(angle), sin = Math.sin(angle)
  const point = (x: number, y: number) => {
    const dx = x - p.x, dy = y - p.y
    return { x: p.x + dx * cos - dy * sin, y: p.y + dx * sin + dy * cos }
  }
  if (p.footwork) for (const foot of p.footwork.feet) {
    const ankle = point(foot.x, foot.y), anchor = point(foot.anchorX, foot.anchorY), ground = point(foot.x, foot.groundY)
    Object.assign(foot, ankle, { anchorX: anchor.x, anchorY: anchor.y, groundY: ground.y,
      angle: foot.angle + angle * foot.facing, groundAngle: foot.groundAngle + angle })
    if (foot.release) {
      const { x, y } = foot.release
      foot.release.x = x * cos - y * sin; foot.release.y = x * sin + y * cos
    }
    if (foot.settle) Object.assign(foot.settle, point(foot.settle.x, foot.settle.y), { angle: foot.settle.angle + angle * foot.settle.facing })
  }
  p.groundAngle += angle
}
