import { mirrorPlayerState, mirrorContactWorld, mirrorContacts, mirrorPlatform } from './gravityFrame.ts'
import { contactsToWorld, inWallFrame, turnContactWorld, wallInput } from './wallFrame.ts'
import { bodySize, inSizeFrame, scaledContactWorld } from './sizeFrame.ts'
import type { Prop, RobotState } from './challenge.ts'
import type { JumpInput, Platform, Player } from './model.ts'
import { cancelJumpInput, STEP, TUNING } from './model.ts'
import type { GroundSurface } from './terrain.ts'
import { exposedWallFaces, groundAt } from './terrain.ts'
import { canGrip } from './friction.ts'
import { boxPushFace, propBounds, propPushHands, PROP_APPROACH_GAP, smallSubmergedProp } from './propGeometry.ts'
import type { PushHands, PushPalm } from './propGeometry.ts'
import { bodyContact, bodyIntersects, bodyPolygon, lineBlocked, moveBody, nearestBoundary } from './geometry.ts'
import type { Vec } from './geometry.ts'
import { climbBodyHeight, climbContactRoot, climbFrame, ladderMantleProgress, ledgeBodyOutline, ledgeLean, ledgeEase, LEDGE_CATCH_TIME, LEDGE_CLIMB_TIME, ROPE_LEDGE_CATCH_TIME } from './ledge.ts'
import { ledgeObstacles, platformLedges } from './terrainLedges.ts'
import { playerTurnAngle } from './ropeGravity.ts'
import { isWeightless, playerWaterCenterOffset } from './gravity.ts'
import { dryPreparationFacesForward } from './athletePose.ts'
import { retainInterruptedStepPose } from './athleteAnimation.ts'
import { swimmingBodyOutline, swimmingPushHands, swimmingTerrainOutline } from './poses/waterPose.ts'

/** A stable identity connects the same solid across successive geometry snapshots. */
/** The pace hands roll a ball at. A crouched body shuffles slower than the standing pace and rolls a ball no
 * faster than it can follow: driven at the standing pace, the ball leaves a crouched pusher's reach and has to
 * be caught again, several times a second. A box's own drag already holds it under either pace. */
export const ballPushPace = (p: Pick<Player, 'crouching'>) => p.crouching ? Math.min(90, TUNING.crouchSpeed) : 90

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
  /** Rope obstacles include red fields and exclude blue fields; player contacts do the reverse. */
  ropePlatforms?: readonly Platform[]
}
export interface SupportContact extends GroundSurface { collider: PlayerCollider }
/** A weightless body starts reaching for a prop this far ahead of its hull, and has its palms fully on it from this. */
const FLOAT_REACH = 34, FLOAT_FULL_REACH = 14
/** Without the boots driving at it, a prop and the body closing on each other this fast (px/s) still bring the hands up. */
const FLOAT_FEND = 30
/** ...and a prop within this of the hull (units) that the body rests against keeps them on it. */
const FLOAT_REST_GAP = 3
/** Palms found further than this (units) from where they were drawn last step come across rather than jump there. */
const FLOAT_PALM_JUMP = 6
/** Without weight the hands meet a prop the body is about to touch (a floating push), so the hands, not the head, meet
 * it, and they stay on it while a push lasts. The reach looks along the way the boots drive, then the way the body is
 * going, then to either side and overhead for a prop closing on it. A face beside the body takes the palms at the
 * standing push's height; an underside overhead takes them pressed up under it; a top below is the feet's (a landing).
 * Boots driving at the prop push it; otherwise the hands only fend it off (the bump is still the body's). */
function floatingHands(p: Player, input: JumpInput, world: ContactWorld, hull: ReturnType<typeof playerContactBody>): PushContact | null {
  // Most of the time no prop is anywhere near: skip the sweeps.
  const near = FLOAT_REACH + TUNING.height
  if (!world.colliders.some(c => c.prop && c.platform.x < p.x + near && c.platform.x + c.platform.w > p.x - near
    && c.platform.y < p.y + near && c.platform.y + c.platform.h > p.y - TUNING.height - near)) return null
  const outline = playerCollisionOutline(p, world, hull)
  const reaching = (gap: number) => Math.max(0, Math.min(1, (FLOAT_REACH - gap) / (FLOAT_REACH - FLOAT_FULL_REACH)))
  const lift = Number(!!(input.descend ?? (input.drop && !input.detach))) - Number(input.climb)
  const move = Math.max(-1, Math.min(1, input.move)), driveLength = Math.hypot(move, lift)
  const drive: Vec = driveLength > .01 ? [move / driveLength, lift / driveLength] : [0, 0]
  const speed = Math.hypot(p.vx, p.vy)
  const probes: Vec[] = [...driveLength > .01 ? [drive] : [], ...speed > FLOAT_FEND ? [[p.vx / speed, p.vy / speed] as Vec] : [],
    [p.facing, 0], [-p.facing, 0], [0, -1]]
  for (const [dx, dy] of probes) {
    const ahead = moveBody([hull.x, hull.y], [hull.x + dx * FLOAT_REACH, hull.y + dy * FLOAT_REACH], world.platforms, hull.height, 1, playerTurnAngle(p), outline)
    const hit = ahead.contacts.find(c => c.normal[0] * dx + c.normal[1] * dy < -.55)
    const collider = hit && world.colliders.find(c => c.platform === hit.platform && c.prop), prop = collider?.prop
    // The feet are taking this one (the body's plan for it, model.ts orientInFlight): the hands leave it to them.
    if (!hit || !collider || !prop || p.propPlan?.meet === 'feet' && p.propPlan.id === collider.id) continue
    const [nx, ny] = hit.normal, driven = -(drive[0] * nx + drive[1] * ny) > .3
    // Not driven at nor closing, the hands still rest on a prop the body is up against (drifting along with it).
    const closingSpeed = -((p.vx - prop.vx) * nx + (p.vy - prop.vy) * ny)
    if (!driven && closingSpeed <= -FLOAT_FEND) continue // drifting apart: let it go
    const resting = !driven && closingSpeed < FLOAT_FEND
    const effort = driven ? Math.min(1, driveLength) : 0
    if (Math.abs(nx) >= Math.abs(ny) * .8) {
      const direction = -Math.sign(nx), hands = propPushHands(prop, p.x, p.y, direction, undefined, FLOAT_REACH + TUNING.width / 2)
      if (!hands?.palms || resting && (hands.wallX - p.x) * direction - TUNING.width / 2 > FLOAT_REST_GAP) continue
      return { collider, direction, effort, wallX: hands.wallX, hands, swimming: true, floating: true,
        reach: reaching((hands.wallX - p.x) * direction - TUNING.width / 2) }
    }
    if (ny < 0) continue
    const top = hull.y - hull.height
    const palm = (side: number): PushPalm => {
      const face = nearestBoundary(collider.platform, p.x + side * 6 * p.facing, top - FLOAT_REACH / 2, [0, 1])
      return { x: face.x, y: face.y, nx: face.nx, ny: face.ny }
    }
    const palms: [PushPalm, PushPalm] = [palm(1), palm(-1)]
    if (palms.some(palm => palm.ny < .3 || top - palm.y > (resting ? FLOAT_REST_GAP : FLOAT_REACH))) continue
    return { collider, direction: p.facing, effort, wallX: p.x, hands: { wallX: p.x, slope: 0, palms }, swimming: true, floating: true,
      reach: reaching(top - Math.max(palms[0].y, palms[1].y)) }
  }
  return null
}
export interface PushContact {
  collider: PlayerCollider
  direction: number
  effort: number
  wallX: number
  hands: PushHands | null
  /** A swimmer keeps the kicking pose and uses water pushing controls. */
  swimming?: boolean
  /** Without weight: palms on a floating prop the boots drive the body at, drawn by the float (poses/waterPose.ts).
   * Like a swimmer's push it works through the body's load, not a hand motor. */
  floating?: boolean
  /** Reachable palms working a small supported prop near the submerged floor. */
  lowSwimming?: boolean
  /** A swimming palm eases into its comfortable reach without stretching the trunk. */
  reach?: number
  /** A visible approach reach; never consumed by the motor or prop solver. */
  anticipation?: number
  /** A self-moving ball still blocks travel, but supplies no voluntary shove. */
  passive?: boolean
}
export interface PlayerContacts {
  support: SupportContact | null
  push: PushContact | null
  /** `kick`: the player's change of velocity pushing off this prop without weight, all of it as if the prop were fixed;
   * the prop solver splits it by mass (propPhysics.ts). */
  body: { collider: PlayerCollider; normal: Vec; point: Vec; load: number; impactSpeed?: number; kick?: Vec; riding?: boolean }[]
  /** Travel after collision resolution, excluding transport by a moving support. */
  motion: { x: number; y: number; speed: number }
}

/** A contact query for a larger body: solved in its frame against the scaled world, then returned in the world's units. */
function sizedContacts(p: Player, world: ContactWorld, query: (scaled: ContactWorld) => PlayerContacts): PlayerContacts {
  const size = bodySize(p), scaled = scaledContactWorld(world, size), byId = new Map(world.colliders.map(c => [c.id, c]))
  const contacts = inSizeFrame(p, () => query(scaled), true)
  const collider = (c: PlayerCollider) => byId.get(c.id) ?? c
  const hands = (value: PushHands | null): PushHands | null => value && ({ ...value, wallX: value.wallX * size,
    ...(value.height !== undefined ? { height: value.height * size } : {}),
    ...(value.palms ? { palms: value.palms.map(palm => ({ ...palm, x: palm.x * size, y: palm.y * size })) as NonNullable<PushHands['palms']> } : {}) })
  return {
    support: contacts.support && { ...contacts.support, y: contacts.support.y * size, collider: collider(contacts.support.collider), platform: collider(contacts.support.collider).platform },
    push: contacts.push && { ...contacts.push, wallX: contacts.push.wallX * size, collider: collider(contacts.push.collider), hands: hands(contacts.push.hands) },
    body: contacts.body.map(c => ({ ...c, collider: collider(c.collider), point: [c.point[0] * size, c.point[1] * size] as Vec,
      ...(c.impactSpeed !== undefined ? { impactSpeed: c.impactSpeed * size } : {}), ...(c.kick ? { kick: [c.kick[0] * size, c.kick[1] * size] as Vec } : {}) })),
    motion: { x: contacts.motion.x * size, y: contacts.motion.y * size, speed: contacts.motion.speed * size },
  }
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
export function playerContactBody(p: Player, swimmingOutline = false): { x: number; y: number; height: number; outline?: Vec[] } {
  const size = bodySize(p)
  if (size !== 1) {
    // A larger body's envelope is the player's, solved in its frame and scaled back into the world. Its outline is
    // always explicit: the default hull's width is the player's, and would not grow with the body.
    const body = inSizeFrame(p, () => {
      const local = playerContactBody(p, swimmingOutline)
      return { ...local, outline: local.outline ?? bodyPolygon(0, 0, local.height, p.inverted ? -1 : 1, playerTurnAngle(p)) }
    })
    return { x: body.x * size, y: body.y * size, height: body.height * size, outline: body.outline.map(([x, y]) => [x * size, y * size] as Vec) }
  }
  if (p.wall) {
    // A wall offers no grips or water, so the body is its plain hull, turned with the frame and any turn under way.
    // The explicit outline carries that turn to every caller.
    const height = p.crouching ? TUNING.crouchHeight : TUNING.height
    return { x: p.x, y: p.y, height, outline: bodyPolygon(0, 0, height, 1, playerTurnAngle(p)) }
  }
  if (p.inverted) {
    mirrorPlayerState(p); p.inverted = false
    try { const body = playerContactBody(p, swimmingOutline); return { ...body, y: -body.y,
      ...(body.outline ? { outline: body.outline.map(([x, y]) => [x, -y] as Vec).reverse() } : {}) } }
    finally { mirrorPlayerState(p); p.inverted = true }
  }
  const swimming = swimmingOutline && p.waterMotion && p.waterMotion.amount > 0 && !p.jumpLift && !p.waterJump && !p.grounded && !p.climbing && !p.releaseTurn && !p.waterMotion.landing
  if (!p.hang && (!p.mantle || p.mantle.step)) return { x: p.x, y: p.y, height: p.crouching ? TUNING.crouchHeight : TUNING.height,
    outline: swimming ? swimmingBodyOutline(p) : undefined }
  const m = p.mantle?.step ? null : p.mantle, h = p.hang, grip = m ?? h
  if (!grip) return { x: p.x, y: p.y, height: p.crouching ? TUNING.crouchHeight : TUNING.height }
  const progress = m ? Math.max(0, Math.min(1, (m.time - (m.descending ? LEDGE_CATCH_TIME : 0)) / LEDGE_CLIMB_TIME)) : 0
  const t = m?.ladder ? ladderMantleProgress(m.time, m.ladder.entry) : m?.descending ? 1 - progress : progress, crouched = !!m?.crouched
  const pose = climbFrame(t, grip.braced, grip.slope, crouched, m?.inset, grip.outwardSlope)
  const root = climbContactRoot(t, grip.braced, grip.slope, crouched, m?.inset, grip.outwardSlope, pose)
  if (m?.ladder) return { x: p.x, y: p.y + (root[1] - pose.root[1]) * ledgeEase((m.time + LEDGE_CATCH_TIME) / LEDGE_CATCH_TIME),
    height: climbBodyHeight(t) }
  const blend = h ? ledgeEase(h.time / (h.caught.climbing?.rope ? ROPE_LEDGE_CATCH_TIME : LEDGE_CATCH_TIME))
    : m?.descending ? ledgeEase(m.time / LEDGE_CATCH_TIME) : 1
  const x = p.x + (root[0] - pose.root[0]) * grip.side * blend
  const y = p.y + (root[1] - pose.root[1]) * blend, height = climbBodyHeight(t, crouched)
  return { x, y, height, outline: ledgeBodyOutline(y - grip.edgeY, height, grip.side, ledgeLean(t, grip.outwardSlope) * blend) }
}

/** Submerged terrain and loose objects meet the swimming body. Surface banks
 * retain their upright catch envelope; terrain keeps the foot-root floor contact. */
export function playerCollisionOutline(p: Player, world: ContactWorld, body?: ReturnType<typeof playerContactBody>) {
  if (p.hang?.outwardSlope || p.mantle?.outwardSlope) {
    const outline = (body ?? playerContactBody(p)).outline
    if (outline) return () => outline
  }
  if (!p.waterMotion?.amount || p.grounded) return undefined
  const submerged = p.waterMotion.underwater
  const props = new Set(world.colliders.filter(c => c.prop).map(c => c.platform))
  if (!submerged && !props.size) return undefined
  const outline = (body ?? playerContactBody(p, true)).outline
  if (!outline) return undefined
  const terrain = submerged ? swimmingTerrainOutline(outline, p.waterMotion.ceiling) : undefined
  return (solid: Platform) => props.has(solid) ? outline : terrain
}

/** A swimmer may gather toward an upright rest only as far as the tunnel
 * permits. Limit the pose at a fixed displaced center instead of letting a
 * growing standing hull shove the player through a roof or floor. */
export function constrainWaterPosture(p: Player, previous: Player['waterMotion'], center: number, world: ContactWorld) {
  const motion = p.waterMotion
  if (!motion?.underwater || !previous?.underwater || !previous.amount || p.grounded
    || p.jumpLift || p.waterJump || motion.landing || motion.amount >= previous.amount) return
  const terrain = world.colliders.filter(c => !c.prop && !c.platform.looseProp).map(c => c.platform)
    .filter(b => p.x + 80 >= b.x && p.x - 80 <= b.x + b.w && p.y + 80 >= b.y && p.y - 80 <= b.y + b.h)
  if (!terrain.length) return
  const sample = (t: number) => {
    const pose = { ...motion }
    for (const key of ['amount', 'dive', 'gather', 'bend', 'leadHeading'] as const) {
      const from = previous[key] ?? 0, to = motion[key] ?? 0
      pose[key] = from + (to - from) * t
    }
    const candidate = { ...p, waterMotion: pose, freeFall: { time: 0, amount: pose.amount, recovery: null } }
    candidate.y += center - playerWaterCenterOffset(candidate)
    const outline = swimmingTerrainOutline(swimmingBodyOutline(candidate), pose.ceiling)
    if (!terrain.some(b => bodyIntersects(candidate.x, candidate.y, b, TUNING.height, 1, 0, outline))) return { pose, clear: true }
    // Curling beside a wall can need a little lateral retreat. The ordinary
    // sweep supplies that separation without changing the held water depth.
    const safe = moveBody([candidate.x, candidate.y], [candidate.x, candidate.y], terrain, TUNING.height, 1, 0, outline)
    return { pose, clear: Math.abs(safe.y - candidate.y) < 1e-7
      && !terrain.some(b => bodyIntersects(safe.x, safe.y, b, TUNING.height, 1, 0, outline)) }
  }
  if (sample(1).clear) return
  let low = 0, high = 1
  for (let i = 0; i < 8; i++) {
    const mid = (low + high) / 2
    if (sample(mid).clear) low = mid; else high = mid
  }
  Object.assign(motion, sample(low).pose)
  p.freeFall = { time: p.freeFall?.time ?? 0, amount: motion.amount, recovery: null }
}

/** The climb motor and prop forces use the same next-pose contact. */
export function mantleContact(m: NonNullable<Player['mantle']>, world: ContactWorld, dt = STEP, inset = m.inset ?? 20) {
  const progress = Math.min(1, (m.time + dt) / LEDGE_CLIMB_TIME)
  const before = climbContactRoot(m.time / LEDGE_CLIMB_TIME, m.braced, m.slope, m.crouched, m.inset, m.outwardSlope)
  const next = climbContactRoot(progress, m.braced, m.slope, m.crouched, inset, m.outwardSlope)
  const from: Vec = [m.edgeX + before[0] * m.side, m.edgeY + before[1]]
  const target: Vec = [m.edgeX + next[0] * m.side, m.edgeY + next[1]]
  const height = climbBodyHeight(progress, m.crouched)
  const outline = ledgeBodyOutline(next[1], height, m.side, ledgeLean(progress, m.outwardSlope))
  const sweep = moveBody(from, target, ledgeObstacles(world.colliders.filter(c => c.prop || c.robot).map(c => c.platform), m), height, 1, 0, outline)
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
  const size = bodySize(p)
  if (size !== 1) return sizedContacts(p, world, scaled => playerContacts(p, input, scaled, dt)) as PlayerContacts
  if (p.wall) return inWallFrame(p, wall => contactsToWorld(playerContacts(p, wallInput(input, wall), turnContactWorld(world, wall), dt), world, wall))
  if (p.inverted) {
    const reflected = mirrorContactWorld(world)
    mirrorPlayerState(p); p.inverted = false
    try { return mirrorContacts(playerContacts(p, input, reflected, dt), world) }
    finally { mirrorPlayerState(p); p.inverted = true }
  }
  const hasProps = world.colliders.some(c => c.prop)
  let cachedBody: ReturnType<typeof playerContactBody> | undefined
  const propBody = () => cachedBody ??= playerContactBody(p, hasProps)
  const free = !p.hang && !p.mantle && !p.climbing && !p.releaseTurn
  const ground = p.grounded && free ? groundAt(world.platforms, p.x, p.y, .2, s => canGrip(s.angle)) : null
  const collider = ground && world.colliders.find(c => c.platform === ground.platform)
  const support = ground && collider ? { ...ground, collider } : null
  const direction = Math.sign(input.move), candidates: PushContact[] = []
  // Prop forces run before the player sweep. A pressed/buffered jump is
  // already a departure intent and must not receive one last grounded shove.
  const departing = input.jump && !p.jumpHeld || p.buffer > 0
  // Feet on ice push too, only as hard as the ice grips them (propPhysics.ts, the push on a crate that is sliding).
  const drive = Math.min(1, Math.abs(input.move))
  if (support && direction && !departing) for (const c of world.colliders) {
    if (c.prop && c === collider) continue
    // Standing hand reach must not turn a ceiling above the crouched body into a wall.
    if (p.crouching && c.platform.y + c.platform.h <= p.y - TUNING.crouchHeight) continue
    const b = c.prop
    if (b) {
      const bounds = propBounds(b)
      if (p.y <= bounds.y + 12 || p.y - 42 >= bounds.y + bounds.h || p.y > bounds.y + bounds.h + b.size * .6) continue
      const hands = dryPropPushHands(p, b, direction)
      const face = b.kind === 'box' ? boxPushFace(b, p.x, p.y, direction, Math.min(43, b.size * .6)) : null
      const wallX = face?.wallX ?? hands?.wallX
      if (wallX === undefined || (b.kind === 'box' && !face)) continue
      // Keep the unilateral travel obstruction while the ball rolls itself.
      // It cannot supply either a pulling motor or a zero-force working pose.
      const passive = b.kind === 'ball' && b.vx * direction > Math.abs(input.move) * 90 + .1
      candidates.push({ collider: c, direction, effort: passive ? 0 : drive, wallX, hands, ...(passive ? { passive: true } : {}) })
    } else {
      for (const wallX of exposedWallFaces(world.platforms, c.platform, direction, p.y - 44.1, p.y - 43.9)) {
        const gap = (wallX - p.x) * direction
        if (gap < 11.9 || gap > 38) continue
        candidates.push({ collider: c, direction, effort: drive, wallX, hands: { wallX, slope: 0 } })
      }
    }
  }
  // The nearest reachable face wins, regardless of object creation order.
  candidates.sort((a, b) => (a.wallX - b.wallX) * direction || a.collider.id.localeCompare(b.collider.id))
  const nearest = candidates[0]
  let push = nearest && (nearest.collider.prop || (nearest.wallX - p.x) * direction <= 26.5) ? nearest : null
  // A push already working this crate keeps it to BLOCKED_PUSH_REACH; a new one
  // starts only at the ordinary gap, so a blocked push cannot flicker on and off.
  const working = p.contacts?.push?.collider.id === push?.collider.id
  if (push?.collider.prop && (push.wallX - p.x) * direction > (working ? BLOCKED_PUSH_REACH : 26.5)) {
    // Something else can stop the body while the hands still work a crate: a
    // crate on top slipping back against the chest, a low ceiling. A blocked
    // body cannot follow a receding face. Past the push stride's ordinary
    // working gap (about 25 to 27) the push ends, rather than stretching the
    // trunk out after it (#106). A crate riding along against the chest still
    // reads as blocked, so the margin must clear the whole stride.
    const hull = propBody(), pushed = push.collider.platform
    const step = moveBody([hull.x, hull.y], [hull.x + direction * .5, hull.y], world.platforms.filter(b => b !== pushed), hull.height, 1,
      playerTurnAngle(p), playerCollisionOutline(p, world, hull))
    if (step.contacts.some(c => c.normal[0] * direction < -.5)) push = null
  }
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
  if (free && !departing && needsBodyLoad && hasProps) {
    // Probe the same body hull used by the player sweep. This includes torso
    // and sloping foot contacts while airborne, where no standing support exists.
    const move = Math.max(-1, Math.min(1, input.move))
    const hull = propBody(), { height } = hull
    const accelerationY = (p.gravity ?? TUNING.gravity) + (p.swimAcceleration ?? 0)
    // Without weight the boots drive up and down as well: Up or Down held into a prop loads it as a sideways push does.
    const lift = (p.weightless ?? 0) >= TUNING.zeroGravitySettle - 1e-9 && !p.waterMotion
      ? Number(!!(input.descend ?? (input.drop && !input.detach))) - Number(input.climb) : 0
    const probe = moveBody([hull.x, hull.y], [hull.x + move * .2, hull.y + (lift ? lift * .2 : accelerationY < 0 ? -.2 : .2)], world.platforms, height, 1, playerTurnAngle(p), playerCollisionOutline(p, world, hull))
    for (const hit of probe.contacts) {
      const collider = world.colliders.find(c => c.platform === hit.platform && c.prop)
      if (!collider || collider === support?.collider || body.some(c => c.collider === collider)) continue
      // A gripped foothold balances weight through normal force and traction.
      // Sending only its normal component into a curved support would create
      // a sideways shove every frame, even when the player stands still.
      const gravity = support ? 0 : accelerationY
      // Input away from this contact cannot cancel gravity's load: a wall on
      // the other side may prevent that requested separation altogether.
      const point = bodyContact(hit.platform, hull.x, hull.y, hit.normal, height, hull.outline)
      const normal = propContactNormal(p, collider, hit.normal, point)
      const load = Math.max(0, -normal[0] * move * (p.grounded ? TUNING.acceleration : TUNING.airAcceleration))
        + Math.max(0, -normal[1] * gravity) + Math.max(0, -normal[1] * lift) * TUNING.zeroGravityThrust
      if (load) body.push({ collider, normal, point: [point.x, point.y], load })
    }
  }
  // Feet on frictionless terrain glide like a free body, so a glide into a prop is a collision too.
  const gliding = support ? !!support.platform.frictionless : !!p.sliding?.active && !!p.sliding.slick
  if (free && (!support || gliding) && hasProps) {
    // Drift is a physical collision even without steering or gravitational load.
    // Sweep relative to each nearby prop; include the other solids so a wall
    // cannot transmit an impact into an object hidden behind it.
    const hull = propBody()
    for (const collider of world.colliders) {
      const prop = collider.prop
      if (!prop || prop === support?.collider.prop) continue
      if (!gliding && prop.grounded && !isWeightless(p.gravity ?? TUNING.gravity)) continue
      if (!gliding && Math.abs(p.gravity ?? TUNING.gravity) >= TUNING.gravity - 1e-7
        && (prop.gravity ?? TUNING.gravity) >= TUNING.gravity - 1e-7 && !p.swimAcceleration) continue
      const vx = p.vx - prop.vx, vy = p.vy - prop.vy, b = collider.platform
      const extent = hull.outline ? TUNING.height : TUNING.width / 2
      if (Math.hypot(vx, vy) < .01 || hull.x + extent + Math.abs(vx * dt) < b.x
        || hull.x - extent - Math.abs(vx * dt) > b.x + b.w
        || hull.y + (hull.outline ? extent : 0) + Math.abs(vy * dt) < b.y || hull.y - hull.height - Math.abs(vy * dt) > b.y + b.h) continue
      const probe = moveBody([hull.x, hull.y], [hull.x + vx * dt, hull.y + vy * dt], world.platforms, hull.height, 1, playerTurnAngle(p), playerCollisionOutline(p, world, hull))
      const hit = probe.contacts.find(hit => hit.platform === b)
      if (!hit) continue
      const point = bodyContact(b, probe.x, probe.y, hit.normal, hull.height, hull.outline)
      const normal = propContactNormal(p, collider, hit.normal, point)
      const rx = point.x - prop.x, ry = point.y - prop.y + prop.size / 2
      const closing = -(normal[0] * (vx + prop.angularVelocity * ry) + normal[1] * (vy - prop.angularVelocity * rx))
      if (closing <= .01) continue
      // Without weight a body coming down feet-first onto a prop lands on it (model.ts kickProp shares the momentum)
      // rather than bumping it away a step early and drifting on behind it, never touching. A prop that is the one
      // arriving, rising into the feet, still bumps the body.
      if (isWeightless(p.gravity ?? TUNING.gravity) && normal[1] < -.7
        && -(normal[0] * p.vx + normal[1] * p.vy) >= normal[0] * prop.vx + normal[1] * prop.vy) continue
      const existing = body.find(contact => contact.collider === collider)
      if (existing) { existing.impactSpeed = closing; existing.normal = normal; existing.point = [point.x, point.y] }
      else body.push({ collider, normal, point: [point.x, point.y], load: 0, impactSpeed: closing })
    }
  }
  if (!support && !p.waterMotion && free && !departing && hasProps && (p.weightless ?? 0) >= TUNING.zeroGravitySettle - 1e-9) push = floatingHands(p, input, world, propBody())
  if (!support && p.waterMotion && free && direction && !departing && hasProps) {
    // Reach toward the first side face in the same solid sweep, so palms lead
    // the head and remain on a slowly moving float between body contacts.
    // Free floats use the actual body load above. Small supported props may
    // also receive a short, reachable palm contact near the pool floor.
    const horizontal = !input.jump && !input.climb && !input.descend && !input.drop && Math.abs(input.swimVertical ?? 0) < .01
    let collider: PlayerCollider | undefined
    if (p.waterMotion.underwater) {
      // Overhead and freely floating props still require a real side bump.
      collider = body.find(c => c.normal[0] * direction < -.7)?.collider
      if (!collider && horizontal) {
        // A low settled prop can remain inside actual palm reach as the
        // torso becomes prone. Its working palms carry a slower water push.
        const candidates = world.colliders.filter(c => c.prop && smallSubmergedProp(c.prop)
          && (c.prop.x - p.x) * direction > 0 && Math.abs(c.prop.x - p.x) < 70)
          .sort((a, b) => (a.prop!.x - b.prop!.x) * direction)
        for (const c of candidates) {
          const grip = swimmingPushHands(p, c.prop!, direction)
          const palms = grip?.hands.palms
          if (!palms || palms.some((palm, i) => lineBlocked(grip!.shoulders[i], [palm.x, palm.y], world.platforms.filter(b => b !== c.platform)))) continue
          collider = c
          if (!body.some(contact => contact.collider === c)) {
            const nx = (palms[0].nx + palms[1].nx) / 2, ny = (palms[0].ny + palms[1].ny) / 2, length = Math.hypot(nx, ny)
            const normal: Vec = [nx / length, ny / length]
            const amount = p.pushRig?.colliderId === c.id ? p.pushRig.amount : 0
            const load = Math.max(0, -normal[0] * input.move * TUNING.airAcceleration) * Math.min(1, amount + dt / .14)
            body.push({ collider: c, normal, point: [palms[0].x, palms[0].y], load })
          }
          break
        }
      }
    } else {
      const hull = propBody()
      const reach = moveBody([hull.x, hull.y], [hull.x + direction * 38, hull.y], world.platforms, hull.height, 1, playerTurnAngle(p), playerCollisionOutline(p, world, hull))
      const hit = reach.contacts.find(c => c.normal[0] * direction < -.55)
      collider = hit && world.colliders.find(c => c.platform === hit.platform && c.prop)
    }
    if (collider?.prop) {
      const grip = swimmingPushHands({ ...p, terrain: world.platforms }, collider.prop, direction)
      const lowSwimming = smallSubmergedProp(collider.prop) && horizontal
      const blocked = lowSwimming && grip?.hands.palms?.some((palm, i) =>
        lineBlocked(grip.shoulders[i], [palm.x, palm.y], world.platforms.filter(b => b !== collider!.platform)))
      if (grip && !blocked) push = { collider, direction, effort: Math.min(1, Math.abs(input.move)), wallX: grip.hands.wallX, hands: grip.hands,
        swimming: true, reach: grip.reach, lowSwimming }
    }
  }
  return { support, push, body, motion: { x: 0, y: 0, speed: 0 } }
}

/** Constrain a working stroke or walking motor before integration. Walking
 * solves the hand face and footing together on a tilted box. */
export function pushingVelocity(p: Player, contact: PushContact | null, world: ContactWorld, dt: number, requestedVelocity = p.vx): number | null {
  if (contact?.lowSwimming && contact.collider.prop) {
    // A working palm blocks the forward stroke just like the torso would.
    // A departing/faster prop is free to leave; the hands never pull it back.
    const approach = (1 - (contact.reach ?? 1)) * 20
    return contact.direction * Math.min(requestedVelocity * contact.direction, Math.max(0, contact.collider.prop.vx * contact.direction) + approach)
  }
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
  // Feet on ice cannot walk the body to its stance, forward or back, any faster than they can push it there: it goes
  // no quicker and no slower than its own steering or the prop it follows. Too close, the arms bend instead.
  if (p.contacts?.support?.platform.frictionless && contact.collider.prop) {
    const own = requestedVelocity * direction, prop = contact.collider.prop.vx * direction
    return direction * Math.max(Math.min(own, prop), Math.min(constrained * direction, Math.max(own, prop)))
  }
  const workingApproach = !contact.passive
    && (requestedVelocity * direction < 0 || (p.contacts?.support?.angle ?? 0) * direction < 0)
  if (contact.collider.prop?.kind !== 'ball' || workingApproach) return constrained
  // Working hands keep the voluntary shove pace while a faster prop escapes.
  // The face can constrain travel or displace an incoming body, but it cannot
  // make a flat or downhill pusher sprint after an outgoing prop. Free steering resumes once
  // that surface leaves hand reach; the prop itself is never speed-clamped.
  return direction * Math.min(requestedVelocity * direction, constrained * direction)
}

/** The farthest a working push may hold a crate face while something else blocks the body. */
const BLOCKED_PUSH_REACH = 30
/** Preparation and working contact follow the same motor face and nearest
 * usable crouched height. A curved/rotating face cannot change those owners
 * simply because unloaded hands used a different maximum approach gap. */
function dryPropPushHands(p: Player, prop: Prop, direction: number, maxGap = 38): PushHands | null {
  const motorHands = propPushHands(prop, p.x, p.y, direction, 43, maxGap)
  // Preview the grip available at the start of working contact. On a ball a
  // low palm is farther away than the motor face; using the longer approach
  // range for that palm would suddenly lift it on the first loaded frame.
  const arrivalGap = 38 - Math.min(2, Math.max(0, (p.vx - (prop.vx ?? 0)) * direction) * STEP)
  const gripX = motorHands && maxGap > 38
    ? p.x + direction * Math.max(0, (motorHands.wallX - p.x) * direction - arrivalGap) : p.x
  const gripGap = Math.min(38, maxGap)
  let lowerHands = p.crouch ? propPushHands(prop, gripX, p.y, direction, 43 - p.crouch * 15, gripGap) : motorHands
  if (!lowerHands && motorHands && p.crouch) {
    let low = 43 - p.crouch * 15, high = 43
    for (let pass = 0; pass < 12; pass++) {
      const height = (low + high) / 2, candidate = propPushHands(prop, gripX, p.y, direction, height, gripGap)
      if (candidate) { high = height; lowerHands = candidate }
      else low = height
    }
  }
  // Palm height can adapt while motor spacing retains its established face.
  return lowerHands && motorHands ? { ...lowerHands, wallX: motorHands.wallX, slope: motorHands.slope } : motorHands
}

/** Lead a shove with a reach toward the first exposed prop. This deliberately
 * lives outside the force-contact query: preparation cannot move an object. */
export function anticipatePush(p: Player, input: JumpInput, world: ContactWorld): PushContact | null {
  const size = bodySize(p)
  if (size !== 1) return sizedContacts(p, world, scaled => ({ support: null, push: anticipatePush(p, input, scaled), body: [], motion: { x: 0, y: 0, speed: 0 } })).push
  if (p.wall) return null
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
    && (p.anim.dryTurn?.step || !p.sliding?.amount && !p.wallBrace?.amount && !p.anim.slideEntry)
  // A returning step explicitly turns its captured rig toward incoming palms;
  // ordinary preparation waits until the visible body faces the target.
  const forward = p.anim.dryTurn?.step || dryPreparationFacesForward(p, direction)
  if (!direction || !forward || !(p.grounded || falling) || p.hang || p.mantle || p.climbing || p.freeFall?.amount
    || input.jump && !p.jumpHeld || p.buffer > 0) return null
  const candidates = world.colliders.flatMap(collider => {
    if (!collider.prop || collider.id === p.contacts?.support?.collider.id) return []
    const bounds = propBounds(collider.prop)
    if (p.y <= bounds.y + 12 || p.y - 42 >= bounds.y + bounds.h || p.y > bounds.y + bounds.h + collider.prop.size * .6) return []
    if (collider.prop.kind === 'ball' && collider.prop.vx * direction > Math.abs(input.move) * 90 + .1) return []
    // Reach ahead only while closing on the surface. Chasing an escaping prop
    // keeps the unloaded palms stretched forward and delays the gait release.
    if ((collider.prop.vx - p.vx) * direction > 0) return []
    // Budget roughly a quarter second to gather the arms at any approach
    // speed. A fixed twelve-unit lead gives a runner only three physics ticks.
    // Use relative travel so a moving prop does not attract an early reach.
    const closingSpeed = Math.max(0, (p.vx - (collider.prop.vx ?? 0)) * direction)
    const approachGap = Math.max(PROP_APPROACH_GAP, 38 + closingSpeed * .24)
    const hands = dryPropPushHands(p, collider.prop, direction, approachGap)
    // Higher footing can put a neighboring prop's grip below the feet. Such
    // a reach cannot become a working push; leave walking/stepping in control
    // rather than folding the whole body toward an unreachable low surface.
    if (!hands || (hands.height ?? 43) < 12) return []
    const gap = (hands.wallX - p.x) * direction
    if (gap >= approachGap) return []
    const sweep = moveBody([p.x, p.y], [p.x + direction * gap, p.y], world.platforms,
      p.crouching ? TUNING.crouchHeight : TUNING.height)
    const first = sweep.contacts.find(contact => contact.normal[0] * direction < -.4)
    if (first?.platform !== collider.platform) return []
    const proximity = Math.max(0, Math.min(1, (approachGap - gap) / (approachGap - 38)))
    return [{ collider, direction, effort: 0, wallX: hands.wallX, hands,
      anticipation: proximity * proximity * (3 - 2 * proximity) }]
  })
  candidates.sort((a, b) => (a.wallX - b.wallX) * direction || a.collider.id.localeCompare(b.collider.id))
  return candidates[0] ?? null
}

/** The next push rig for one step: hands on the contact, easing in and out. */
function nextPushPose(p: Player, current: Player['pushing'], contact: PushContact | null, dt: number, speed: number, motion: readonly [number, number],
  slick = !!p.contacts?.support?.platform.frictionless, presented = false): Player['pushing'] {
  if (contact?.passive) contact = null
  if (contact?.hands && (p.grounded || contact.anticipation !== undefined || contact.swimming && (p.waterMotion || contact.floating)) && !p.hang && !p.mantle && !p.climbing) {
    // The fading pose owns its source identity. A one-tick contact gap must not
    // restart the hands at rest when that same moving surface is reacquired.
    const same = current?.direction === contact.direction && current.colliderId === contact.collider.id
    // A floating body turning its hands from one prop to the next carries the press over and eases the palms across,
    // rather than dropping its arms and starting again.
    // A change of facing mid-push (a floating body has no footing to turn on) hands the palms over the same way.
    const handover = !same && contact.floating && current?.palms && contact.hands.palms
    const previous = same || handover ? current : null
    let hands = contact.hands
    // The palms keep the handover's offset from their new places, dying away, so they travel across with the props.
    const keep = Math.exp(-dt / .08)
    // Palms re-found on the same prop far from where they are drawn (a fading release taken up again) come across too.
    // Measured against where they were drawn carried on with the body (a moving push keeps them in step), and not while an
    // earlier handover is still coming across.
    // A release on ice fades slowly enough to be taken up again while the crate has slid on from the palms.
    const jumped = same && (contact.floating || slick && !current?.effort && current?.amount) && current?.palms && !current.shift && contact.hands.palms
      && contact.hands.palms.some((palm, i) => Math.hypot(palm.x - current.palms![i].x - motion[0], palm.y - current.palms![i].y - motion[1]) > FLOAT_PALM_JUMP)
    // These are the motor rig's rules; the drawn push takes its own offset below (drawnPalmShift).
    let shift = presented ? undefined
      : handover || jumped ? contact.hands.palms!.map((palm, i) => [(current!.palms![i].x - palm.x) * keep, (current!.palms![i].y - palm.y) * keep] as [number, number])
      : same && contact.floating && current?.shift ? current.shift.map(([x, y]) => [x * keep, y * keep] as [number, number]) : undefined
    let shifting = shift?.some(([x, y]) => Math.hypot(x, y) > .05)
    if (shifting && hands.palms) hands = { ...hands, palms: hands.palms.map((palm, i) => ({ ...palm, x: palm.x + shift![i][0], y: palm.y + shift![i][1] })) as PushHands['palms'] }
    if (contact.anticipation !== undefined && contact.collider.prop && previous?.height !== undefined && hands.height !== undefined) {
      // Losing force contact must not teleport a crouched palm to a lower
      // approach grip. Ease the unloaded height, querying the actual surface
      // each step; force-bearing palms still use their exact current contact.
      const height = previous.height + (hands.height - previous.height) * (1 - Math.exp(-dt / .08))
      const palms = propPushHands(contact.collider.prop, p.x, p.y, contact.direction, height,
        Math.max(PROP_APPROACH_GAP, (hands.wallX - p.x) * contact.direction + 1))
      if (palms) hands = { ...palms, wallX: hands.wallX, slope: hands.slope }
    }
    // The drawn push offsets the palms it will draw, after any easing of their height.
    if (presented) {
      const prop = contact.collider.prop
      shift = drawnPalmShift(p, current, hands.palms, same, !!contact.floating, contact.anticipation === undefined, prop ? [prop.vx * dt, prop.vy * dt] : [0, 0], keep, dt)
      shifting = shift?.some(([x, y]) => Math.hypot(x, y) > .05)
      if (shifting && hands.palms) hands = { ...hands, palms: hands.palms.map((palm, i) => ({ ...palm, x: palm.x + shift![i][0], y: palm.y + shift![i][1] })) as PushHands['palms'] }
    }
    // Opposition is the requested motion that the contact solver could not
    // deliver. Ease its presentation independently of the hand-contact blend.
    const targetLoad = Math.max(0, contact.effort - speed / TUNING.runSpeed)
    const load = (previous?.load ?? 0) + (targetLoad - (previous?.load ?? 0)) * (1 - Math.exp(-dt / .08))
    const pose = { ...hands, ...(shifting ? { shift } : {}), colliderId: contact.collider.id, direction: contact.direction,
      // A prop has already received this tick's force. Its working palms must
      // be established now; resistance still loads the body gradually above.
      amount: contact.anticipation === undefined
        ? (previous?.amount ?? 0) + Math.max(-dt / .16, Math.min(dt / .14, (contact.reach ?? 1) - (previous?.amount ?? 0)))
        : Math.max(0, Math.max(previous?.amount ?? 0, previous?.effort ? previous.ready ?? 0 : 0) - dt / .16),
      // An unloaded target can appear nearby on a turn or after a prop moves.
      // Ease toward it; retaining old load here would freeze a released brace.
      // The drawn stance forms from the pose actually drawn, on every footing: a body that meets a crate without
      // having reached for it takes a tenth of a second to drop into the stance rather than snapping from standing
      // to a full crouch, palms on the face, in one frame. The motor's rig (updatePushRig) keeps its own timing,
      // which gameplay reads: its palms that take the first force are established at once, except on ice.
      ready: contact.anticipation === undefined ? (contact.collider.prop && !contact.swimming
        ? slick || presented ? Math.min(1, (previous?.ready ?? 0) + dt / .1) : 1 : 0)
        // A returning step already owns and budgets its whole incoming rig.
        // Keep its target current rather than adding a second handoff delay.
        : p.anim.dryTurn?.step ? contact.anticipation
          : (previous?.ready ?? 0) + (contact.anticipation - (previous?.ready ?? 0)) * (1 - Math.exp(-dt / .045)),
      effort: contact.effort, load }
    return presented ? { ...pose, stance: nextStance(p, previous, pose, dt) } : pose
  } else if (current) {
    // Force-bearing prop palms used the full ready stance, even when the
    // timed contact blend was young. Release that actual outgoing weight.
    // Letting go of a crate on ice, the body is still gliding with it: the stance unwinds more slowly.
    const release = p.grounded && slick ? .4 : .16
    const amount = Math.max(0, Math.max(current.amount, current.effort ? current.ready ?? 0 : 0) - dt / release)
    const ready = Math.max(0, (current.ready ?? 0) - dt / release)
    // A floating body's palms let go the same way (a floating push), whichever frame its facing is read in.
    const floating = (p.weightless ?? 0) >= TUNING.zeroGravitySettle - 1e-9
    const stance = presented ? nextStance(p, current, { amount, ready }, dt) : 0
    return (amount || ready || stance) && (p.grounded || p.waterMotion || floating) && !p.hang && !p.mantle && !p.climbing && (current.direction === p.facing || floating)
      // Released palms relax with the outgoing body. Keeping their old world
      // coordinates pins the arms behind a running player and can fold the
      // trunk or flip an elbow as the shoulders pass the abandoned contact.
      ? { ...current, wallX: current.wallX + motion[0],
        palms: current.palms?.map(palm => ({ ...palm, x: palm.x + motion[0], y: palm.y + motion[1] })) as PushHands['palms'],
        amount, ready, effort: 0, load: (current.load ?? 0) * Math.exp(-dt / .08), ...(presented ? { stance } : {}) } : null
  }
  return null
}

/** The drawn push's palms come across from where they were drawn whenever their contact jumps: a handover between
 * floating props, a press taken up again, or a reach that becomes a working push (touching down beside a crate, the
 * reach's palms sit lower on the face than the stance's). It measures and keeps the wrists, where the arm meets the
 * hand: palms re-found at a crate's corner can turn their faces most of a right angle while barely moving, which swung
 * the wrist and the whole reach in a frame. A further jump adds to an offset still coming across. Returns the offset,
 * dying away, to add to the contact's palms. */
function drawnPalmShift(p: Player, current: Player['pushing'], palms: PushHands['palms'], same: boolean, floating: boolean, loaded: boolean, carried: readonly [number, number], keep: number, dt: number) {
  const before = current?.palms
  if (!palms || !before || !(same || floating)) return undefined
  const wrist = (palm: PushPalm) => [palm.x + palm.nx * 2.8 + palm.ny * .7 * p.facing, palm.y + palm.ny * 2.8 - palm.nx * p.facing * .7]
  const old = current!.shift
  // How far the contact itself moved beyond the surface it is on (`carried`, the prop's own travel this step), from
  // where the drawn palms were less any offset they still carried. A reach's palms stay put on a crate as the body
  // runs at it, and a moving push's palms travel with the crate.
  const jumps = palms.map((palm, i) => wrist(palm).map((v, axis) => v - wrist(before[i])[axis] + (old?.[i][axis] ?? 0) - carried[axis]))
  // A working palm re-found a little way along its face snaps there, as it does while its height adapts; one that jumps
  // farther, or whose face turns, comes across. Free palms, which bear nothing, come across from any jump of note.
  const jumped = !same || jumps.some(([x, y]) => Math.hypot(x, y) > (loaded ? FLOAT_PALM_JUMP : 3))
    || palms.some((palm, i) => palm.nx * before[i].nx + palm.ny * before[i].ny < Math.cos(Math.PI / 6))
  if (!jumped && !old) return undefined
  // Floating palms glide across with the props, and a reach's free palms glide too; working palms on footing close the gap
  // two units a step faster, so a tumbling crate's next face is taken in a frame or two rather than leaving loaded
  // hands hovering off it.
  return palms.map((_, i) => {
    const x = (old?.[i][0] ?? 0) - (jumped ? jumps[i][0] : 0), y = (old?.[i][1] ?? 0) - (jumped ? jumps[i][1] : 0), length = Math.hypot(x, y)
    const scale = floating || !loaded ? keep : length ? Math.max(0, length * keep - 240 * dt) / length : 0
    return [x * scale, y * scale] as [number, number]
  })
}

/** How far the drawn body has joined the push stance. Standing, it follows the hands' readiness; in the air only a
 * working push takes it, while the arms may already reach. It moves no faster than the stance forms (a tenth of a
 * second), so touching down mid-reach does not throw the trunk into the stance in a single frame. Only the drawn
 * push carries it; the motor's rig keeps the stance its state implies (poses/locomotionPose.ts). */
function nextStance(p: Player, previous: Player['pushing'], next: { amount: number; ready?: number }, dt: number) {
  const target = p.grounded ? Math.max(next.amount, next.ready ?? 0) : next.amount
  const from = previous?.stance ?? (previous ? p.grounded ? Math.max(previous.amount, previous.ready ?? 0) : previous.amount : 0)
  return from + Math.max(-dt / .1, Math.min(dt / .1, target - from))
}

/** Presentation consumes the solved contact and anticipation; it never moves the player. */
export function updatePushingPose(p: Player, contact: PushContact | null, dt: number, speed = 0, motion: readonly [number, number] = [0, 0], slick?: boolean) {
  p.pushing = nextPushPose(p, p.pushing, contact, dt, speed, motion, slick, true)
}

/** The motor's push rig: the same hands and easing from real contacts only,
 * without anticipation, so animation can never change it. Gameplay reads this. */
export function updatePushRig(p: Player, contact: PushContact | null, dt: number, speed = 0, motion: readonly [number, number] = [0, 0], slick?: boolean) {
  p.pushRig = nextPushPose(p, p.pushRig ?? null, contact?.anticipation === undefined ? contact : null, dt, speed, motion, slick)
}

/** Transport the body and its planted anchors before measuring locomotion. */
export function translatePlayer(p: Player, dx: number, dy: number) {
  const interruptedStep = !!p.mantle?.step && Math.hypot(dx,dy) > .001
  if (interruptedStep) retainInterruptedStepPose(p)
  p.x += dx; p.y += dy
  // An automatic step targets static terrain. A prop pushing the player away
  // interrupts it rather than moving the destination off the real ledge.
  if (interruptedStep) { p.mantle = null; p.anim.footwork = null; p.grabCooldown = .25 }
  translateFeet(p, dx, dy)
  if (p.hang) { p.hang.edgeX += dx; p.hang.edgeY += dy; p.hang.caught.x += dx; p.hang.caught.y += dy }
  if (p.mantle) { p.mantle.edgeX += dx; p.mantle.edgeY += dy; p.mantle.toX += dx; p.mantle.toY += dy }
}

/** Both controlled actors follow the current lip of a settling held prop.
 * Keeping yesterday's edge makes an otherwise clear pull-up hit its own box. */
export function followPropGrip(p: Player, world: ContactWorld) {
  const grip = p.hang ?? (p.mantle?.step ? null : p.mantle)
  const held = grip?.platform === undefined ? undefined : world.colliders[grip.platform]
  if (!held?.prop || !grip) return
  const edge = platformLedges(p.inverted ? mirrorPlatform(held.platform) : held.platform).find(e => e.side === grip.side)
  if (!edge) {
    p.hang = null; p.mantle = null; p.grounded = false; p.grabCooldown = .25; cancelJumpInput(p)
    return
  }
  translatePlayer(p, edge.edgeX - grip.edgeX, (p.inverted ? -edge.edgeY : edge.edgeY) - grip.edgeY)
  grip.slope = edge.slope === undefined ? undefined : p.inverted ? -edge.slope : edge.slope
  grip.outwardSlope = edge.outwardSlope
  if (p.mantle === grip) p.mantle.toY = grip.edgeY + (p.mantle.toX - grip.edgeX) * grip.side * (grip.slope ?? 0)
}

/** A planted foot follows its support independently of the body's inertia. */
export function translateFeet(p: Player, dx: number, dy: number) {
  if (p.anim.footwork) for (const foot of p.anim.footwork.feet) {
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
  if (p.anim.footwork) for (const foot of p.anim.footwork.feet) {
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
