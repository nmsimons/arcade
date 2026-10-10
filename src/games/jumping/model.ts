import type { NamedObject } from './objectNames.ts'
import { advanceFootwork } from './footwork.ts'
import type { Footwork } from './footwork.ts'
import { climbBodyHeight, climbContactRoot, climbFrame, LEDGE_CATCH_TIME, LEDGE_CLIMB_TIME, ROPE_LEDGE_CATCH_TIME, ledgeEase, ropeCatchRoot } from './ledge.ts'
import { NO_CLIMBABLES, climbGait, climbRoot, constrainRopeBody, createRope, ease, findClimbable, findRope, ropeGripDistance, ropeImpulse, ropePoint, ropeSlopeSupport, settleRopeGrip, stepRope, updateRopeWall } from './climbables.ts'
import type { ClimbableWorld, Climbing, Ladder, RopeState } from './climbables.ts'
import { exposedSide, exposedWallFaces, followGround, groundAt, platformSurface } from './terrain.ts'
import type { GroundSurface } from './terrain.ts'
import { ledgeExposed, ledgeObstacles, platformLedges, sameLedge } from './terrainLedges.ts'
import type { TerrainLedge } from './terrainLedges.ts'
import { bodyContact, bodyIntersects, moveBody, nearestBoundary, pointInside } from './geometry.ts'
import type { TerrainContact } from './geometry.ts'
import { canGrip, groundVelocity, slidingVelocity } from './friction.ts'
import { anticipatePush, mantleAdvance, narrowMantle, playerContactBody, playerContacts, pushingVelocity, staticContactWorld, translateFeet, updatePushingPose } from './playerContacts.ts'
import type { ContactWorld, PlayerContacts } from './playerContacts.ts'
import { findRopeStepUp, findStepUp, finishStepFeet, stepUpCommitted, stepUpRoot } from './stepUp.ts'
import type { StepUp } from './stepUp.ts'
import type { PushHands } from './propGeometry.ts'
import type { TerrainMaterial } from './terrainMaterials.ts'
import { TUNING } from './movementTuning.ts'
import { advanceReturningStepPreparation, advanceDryTurn, advanceMovingRecovery, advanceSlideEntry, advanceWaterCeiling, advanceWaterLanding, captureDryTurn, captureSlideEntry, dryTurnDirection, settleFallClearance, settleWaterClearance } from './athlete.ts'
import type { DryTurnFrame, SlideEntryFrame } from './athlete.ts'
import type { AthletePose } from './athlete.ts'
import { advanceWaterBob, advanceWaterCamera, waterBobAcceleration } from './waterBob.ts'
import type { WaterBob, WaterCamera } from './waterBob.ts'
import { mirrorPlayerState, mirrorContactWorld, mirrorContacts, mirrorPlatform, mirrorLadder } from './gravityFrame.ts'
import { isWeightless, playerFieldCoverage, playerFloatDrag, playerGravity, playerOrientationGravity, playerSwimStrength, playerSwimDepth, playerWaterCenterOffset, setPlayerGravity, swimmingAcceleration, swimmingDirection, underwaterSwimming } from './gravity.ts'
import type { GravityField } from './gravity.ts'
import { finishGravityTurn, keepRopeGrip, playerTurnAngle, ropeScreenDirection, ropeWantsTurn, stepReleasedTurn, stepRopeTurn } from './ropeGravity.ts'
export { TUNING } from './movementTuning.ts'

export interface Platform extends NamedObject { x: number; y: number; w: number; h: number; profile?: readonly (readonly [number, number])[]; polygon?: readonly (readonly [number, number])[]; material?: TerrainMaterial; zIndex?: number }
export const STEP = 1 / 120
export interface Checkpoint extends NamedObject { x: number; y: number; radius?: number }
export interface LevelRules { checkpoints: readonly Checkpoint[]; fallY: number }
export interface JumpInput { move: number; jump: boolean; jumpStrength?: number; climb: boolean; drop: boolean; crouch: boolean; reach: boolean; descend?: boolean; detach?: boolean; swimVertical?: number }
export const NEUTRAL_INPUT: JumpInput = { move: 0, jump: false, climb: false, drop: false, crouch: false, reach: false, descend: false, detach: false }
export interface GaitPose { speed: number; moving: number; run: number; air: number }
export function gaitPose(vx: number, airborne = false): GaitPose {
  const smooth = (value: number) => { const t = Math.max(0, Math.min(1, value)); return t * t * (3 - 2 * t) }
  const speed = Math.min(1, Math.abs(vx) / TUNING.runSpeed)
  // Keep precision walking below the selected walk speed, then introduce a
  // jog promptly instead of retaining a walking stride through most of the
  // analog range. The motor speed itself is unchanged.
  return { speed, moving: smooth(speed * 6), run: smooth((speed - TUNING.walkSpeed / TUNING.runSpeed) / .4), air: Number(airborne) }
}
export interface Player {
  x: number; y: number; vx: number; vy: number; facing: number; grounded: boolean; groundAngle: number
  sliding: { angle: number; amount: number; time: number; active: boolean; x: number; y: number; balanceSpeed?: number } | null
  coyote: number; buffer: number; jumpStrength: number | undefined; jumpHeld: boolean
  jumpLift: { elapsed: number; strength: number; entrySpeed: number; extraSpeed: number; fresh: boolean } | null
  grabCooldown: number
  wallJumpBuffer: number; wallJump: { direction: number; time: number } | null
  wallBrace: { wallX: number; wallY?: number; normal?: [number, number]; direction: number; active: boolean; amount?: number; hands: [number, number]; feet: [number, number] } | null
  climbing: Climbing | null; ropes: RopeState[] | null
  pushing: (Omit<PushHands, 'slope'> & { direction: number; amount: number; ready?: number; effort: number; load?: number; slope?: number; colliderId?: string }) | null
  ledgeReach: { x: number; y: number; amount: number } | null
  stepIntent: (TerrainLedge & { time: number }) | null
  hang: { platform: number; side: number; edgeX: number; edgeY: number; slope?: number; time: number; queued: boolean; braced: boolean; dropLocked?: boolean; upLocked?: boolean;
    caught: { x: number; y: number; vx: number; vy: number; stride: number; gait: GaitPose | null; ledgeReach: Player['ledgeReach']; climbing?: Climbing | null; freeFall?: Player['freeFall']; waterMotion?: Player['waterMotion']; dryTurn?: Player['dryTurn'] } } | null
  mantle: { edgeX: number; edgeY: number; side: number; slope?: number; toX: number; toY: number; time: number; braced: boolean;
    platform?: number; returning?: boolean; crouched?: boolean; inset?: number; blockedTime?: number;
    step?: StepUp;
    descending?: { platform: number; caught: Climbing['caught']; climbable: Climbing | null } } | null
  stride: number; landing: number; landingImpact: number; spawnX: number; spawnY: number; checkpoint: number
  freeFall: { time: number; amount: number; recovery: number | null; bodyOffset?: [number, number]; impact?: { vx: number; vy: number; gait: GaitPose | null }; moving?: { pose: AthletePose; time: number; facing: number } } | null
  dryTurn: { pose: AthletePose; facing: number; target: number; time: number; departure: boolean; slide?: boolean; pushing?: boolean; reaching?: boolean; step?: boolean } | null
  slideEntry: { pose: AthletePose; facing: number; time: number; landing?: boolean } | null
  jumpStart: number; jumpHeight: number; bestHeight: number
  crouching: boolean; crouch: number; reach: number
  look: number // Presentation only: positive looks up, negative looks down.
  gait: GaitPose | null
  airBoost: { x: number; lift: number; time: number } // Presentation of applied air-control forces.
  footwork: Footwork | null
  contacts: PlayerContacts | null
  swimAcceleration?: number
  waterJump?: boolean
  waterPushOff?: boolean
  waterBob?: WaterBob
  waterCamera?: WaterCamera
  waterMotion?: { amount: number; dive: number; phase: number; effort?: number; underwater?: boolean; steering?: number; bend?: number; leadHeading?: number; scull?: number; bottom?: number; gather?: number; floatCurl?: number; heading?: number; bodyOffset?: [number, number]; wall?: { x: number; amount: number };
    ceiling?: { collider: string; amount: number; load: number; nx: number; ny: number; hands: { x: number; y: number; nx: number; ny: number }[] };
    floor?: { y: number; angle: number; reach: number };
    landing?: { pose: AthletePose; y: number; facing: number; time: number; load: number; hand: { x: number; y: number; angle: number }; leaving?: boolean } }
  terrain?: readonly Platform[]
  gravity?: number
  inverted?: boolean
  releaseTurn?: { angle: number; target: number }
}
export function createPlayer(spawn = { x: 0, y: 0 }): Player {
  return { x: spawn.x, y: spawn.y, vx: 0, vy: 0, facing: 1, grounded: true, groundAngle: 0, sliding: null,
    coyote: TUNING.coyoteTime, buffer: 0, jumpStrength: undefined, jumpHeld: false, jumpLift: null,
    grabCooldown: 0, wallJumpBuffer: 0, wallJump: null, wallBrace: null, climbing: null, ropes: null, pushing: null, ledgeReach: null, hang: null, mantle: null, stride: 0, landing: 0, landingImpact: 0,
    freeFall: null, dryTurn: null, slideEntry: null, stepIntent: null, spawnX: spawn.x, spawnY: spawn.y, checkpoint: 0, jumpStart: spawn.y, jumpHeight: 0, bestHeight: 0, waterPushOff: false,
    crouching: false, crouch: 0, reach: 0, look: 0, gait: null, airBoost: { x: 0, lift: 0, time: 0 }, footwork: null, contacts: null, gravity: TUNING.gravity, inverted: false, waterJump: false, swimAcceleration: 0 }
}
export function airBoostStrength(p: Player) {
  if (p.grounded || p.hang || p.mantle || p.climbing || p.waterMotion || p.wallBrace?.active || p.sliding?.active) return 0
  return Math.min(1, Math.hypot(p.airBoost.x, p.airBoost.lift))
}
function settleGait(p: Player, dt: number) {
  const speed = p.climbing ? 0 : p.grounded ? p.contacts?.motion.speed ?? 0 : p.vx
  const target = gaitPose(speed, !p.grounded && !p.hang && !p.mantle && !p.climbing), previous = p.gait ?? gaitPose(0)
  if (p.contacts?.push && !p.contacts.push.passive || p.grounded && p.vx * p.facing < -1) target.run = 0
  const blend = (from: number, to: number, response = to > from ? .045 : .08) => {
    const value = from + (to - from) * (1 - Math.exp(-dt / response))
    return Math.abs(value - to) < .001 ? to : value
  }
  // Animation settles independently of physical braking; the feet return to rest.
  p.gait = { speed: blend(previous.speed, target.speed), moving: blend(previous.moving, target.moving), run: blend(previous.run, target.run),
    air: blend(previous.air, target.air, target.air ? .035 : .065) }
}
export function cancelJumpInput(p: Player) {
  p.slideEntry = null
  p.waterJump = false
  p.waterPushOff = false
  delete p.waterMotion
  p.jumpStrength = undefined; p.jumpHeld = false; p.jumpLift = null; p.buffer = 0; p.wallJumpBuffer = 0
  p.airBoost.x = 0; p.airBoost.lift = 0
  if (p.mantle?.step) p.mantle.step.jumpQueued = false
  p.stepIntent = null
}
export function respawn(p: Player) {
  const { spawnX, spawnY, checkpoint, bestHeight } = p
  const ropes = p.ropes?.map(r => createRope(r.definition)) ?? null
  Object.assign(p, createPlayer(), { x: spawnX, y: spawnY, spawnX, spawnY, checkpoint, bestHeight, ropes })
  delete p.releaseTurn
  delete p.waterBob
  delete p.waterCamera
}
const approach = (value: number, target: number, delta: number) => value + Math.max(-delta, Math.min(delta, target - value))
const overlaps = (x: number, y: number, b: Platform, height: number = TUNING.height) => bodyIntersects(x, y, b, height)
function launch(p: Player, baseSpeed: number = TUNING.jumpSpeed, maxSpeed: number = TUNING.directedJumpSpeed) {
  p.freeFall = null
  const extraSpeed = maxSpeed - baseSpeed
  p.jumpLift = p.jumpStrength === undefined
    ? { elapsed: 0, strength: 0, entrySpeed: 0, extraSpeed, fresh: true } : null
  p.vy = -(baseSpeed + extraSpeed * (p.jumpStrength ?? 0))
  p.grounded = false; p.coyote = 0; p.buffer = 0; p.jumpStrength = undefined; p.wallJumpBuffer = 0
  p.jumpStart = p.y; p.jumpHeight = 0
  if (p.sliding) p.sliding.active = false
}
function sustainJump(p: Player, dt: number) {
  const lift = p.jumpLift
  if (!lift) return
  // Capture actual release momentum, including ropes, before the first gravity
  // step. Takeoff itself always gets the immediate base impulse.
  if (lift.fresh) { lift.entrySpeed = -p.vy; lift.fresh = false; return }
  const extraSpeed = lift.extraSpeed
  const before = lift.entrySpeed + extraSpeed * lift.strength
  lift.elapsed = Math.min(TUNING.jumpHoldTime, lift.elapsed + dt)
  lift.strength = lift.elapsed / TUNING.jumpHoldTime
  const after = lift.entrySpeed + extraSpeed * lift.strength
  // Spend only the energy difference between the base and full jump. Adding
  // lift later cannot exceed the selected full jump, or discard inherited momentum.
  const beforeLift = p.vy
  p.vy = -Math.sqrt(p.vy * p.vy + after * after - before * before)
  p.airBoost.lift = Math.min(1, (beforeLift - p.vy) / (dt * (TUNING.directedJumpSpeed - TUNING.jumpSpeed) / TUNING.jumpHoldTime))
  if (lift.elapsed >= TUNING.jumpHoldTime) p.jumpLift = null
}
/** Wall contact follows the exposed outline, including faces inset in a polygon. */
function touchesWallFace(platforms: readonly Platform[], wallX: number, direction: number, top: number, bottom: number) {
  return platforms.some(wall => wallX >= wall.x - .15 && wallX <= wall.x + wall.w + .15
    && exposedWallFaces(platforms, wall, direction, top, bottom).some(x => Math.abs(x - wallX) < .15))
}
type WallBraceContact = Omit<NonNullable<Player['wallBrace']>, 'active'>
function settleWallBrace(p: Player, contact: WallBraceContact | null, dt: number) {
  if (contact) {
    p.freeFall = null
    const previous = p.wallBrace?.direction === contact.direction ? p.wallBrace : null
    p.wallBrace = { ...contact, active: true,
      // Hands and feet find contact promptly; body balance follows more slowly
      // so reacquiring a low face while falling cannot jerk the whole torso.
      amount: approach(previous?.amount ?? Math.max(0, ...(previous?.hands ?? []), ...(previous?.feet ?? [])), 1, dt / .1),
      hands: contact.hands.map((value, i) => approach(previous?.hands[i] ?? 0, value, dt / .08)) as [number, number],
      feet: contact.feet.map((value, i) => approach(previous?.feet[i] ?? 0, value, dt / .08)) as [number, number] }
    p.facing = contact.direction
  } else if (p.wallBrace) {
    const brace = p.wallBrace
    brace.active = false
    brace.amount = approach(brace.amount ?? Math.max(...brace.hands, ...brace.feet), 0, dt / .12)
    brace.hands = brace.hands.map(value => approach(value, 0, dt / .12)) as [number, number]
    brace.feet = brace.feet.map(value => approach(value, 0, dt / .12)) as [number, number]
    if (p.facing !== brace.direction || p.hang || p.mantle || p.climbing || ![brace.amount, ...brace.hands, ...brace.feet].some(Boolean)) p.wallBrace = null
  }
}
function updateWallBrace(p: Player, move: number, dt: number, platforms: readonly Platform[]) {
  let contact: WallBraceContact | null = null
  if (!p.grounded && !p.hang && !p.mantle && !p.climbing) {
    for (const direction of [p.facing, -p.facing]) {
      if (move * direction < -.01) continue
      const wallX = p.x + direction * TUNING.width / 2
      const touches = (offset: number) => touchesWallFace(platforms, wallX, direction, p.y + offset - .1, p.y + offset + .1)
      const hands: [number, number] = [Number(touches(-43)), Number(touches(-46))]
      const feet: [number, number] = [Number(touches(-16)), Number(touches(-20))]
      if (![...hands, ...feet].some(Boolean)) continue
      contact = { wallX, direction, hands, feet }
      break
    }
  }
  // Canted faces are checked after the full body sweep has resolved them.
  if (!contact && p.wallBrace?.normal) return
  settleWallBrace(p, contact, dt)
}
function cantedWallFace(p: Player, platforms: readonly Platform[], wall: Platform, normal?: readonly [number, number]) {
  const height = p.crouching ? TUNING.crouchHeight : TUNING.height
  if (!wall.polygon && !wall.profile || p.x + TUNING.width / 2 + .15 < wall.x || p.x - TUNING.width / 2 - .15 > wall.x + wall.w
    || p.y < wall.y || p.y - height > wall.y + wall.h) return null
  if (!normal) {
    const hint = nearestBoundary(wall, p.x, p.y - height / 2)
    normal = [hint.nx, hint.ny]
  }
  const face = bodyContact(wall, p.x, p.y, normal, height)
  if (face.distance > .15 || Math.abs(face.ny) < 1e-7 || Math.abs(face.ny) > Math.sin(TUNING.wallJumpMaxCant) + 1e-7
    || platforms.some(other => other !== wall && pointInside(other, face.x + face.nx * .01, face.y + face.ny * .01))) return null
  return face
}
function updateCantedWallBrace(p: Player, move: number, dt: number, platforms: readonly Platform[], contacts: readonly TerrainContact[]) {
  let contact: WallBraceContact | null = null
  if (!p.grounded && !p.hang && !p.mantle && !p.climbing && !p.releaseTurn && !(p.wallBrace?.active && !p.wallBrace.normal)) {
    for (const wall of platforms) {
      const hit = contacts.find(c => c.platform === wall)
      // A tangent or slightly separating step can have no new sweep hit. Keep
      // the same tiny contact tolerance as a vertical wall, using its real face.
      const face = cantedWallFace(p, platforms, wall, hit?.normal)
      if (!face) continue
      const direction = -Math.sign(face.nx)
      if (move * direction < -.01) continue
      const slope = -face.ny / face.nx
      const touches = (offset: number) => {
        const y = p.y + offset, x = face.x + (y - face.y) * slope, gap = (x - p.x) * direction
        const limbFace = nearestBoundary(wall, x, y, [face.nx, face.ny])
        return Number(gap >= 0 && gap <= 26 && limbFace.distance < .15
          && limbFace.nx * face.nx + limbFace.ny * face.ny > .999)
      }
      const hands: [number, number] = [touches(-43), touches(-46)], feet: [number, number] = [touches(-16), touches(-20)]
      if (![...hands, ...feet].some(Boolean)) continue
      contact = { wallX: face.x, wallY: face.y, normal: [face.nx, face.ny], direction, hands, feet }
      break
    }
  }
  if (contact || p.wallBrace?.normal) settleWallBrace(p, contact, dt)
}
function tryWallJump(p: Player, platforms: readonly Platform[]) {
  const brace = p.wallBrace
  if (!brace?.active || p.grounded || p.wallJumpBuffer === 0) return
  // Recheck the actual face in case a moving object or the player's movement
  // has removed the contact since the last frame.
  const touching = brace.normal ? platforms.some(wall => {
    const face = cantedWallFace(p, platforms, wall, brace.normal)
    return face && face.nx * brace.direction < 0
  }) || touchesWallFace(platforms, p.x + brace.direction * TUNING.width / 2, brace.direction, p.y - TUNING.height + 8, p.y - 8)
    : Math.abs((brace.wallX - p.x) * brace.direction - TUNING.width / 2) <= .15
    && touchesWallFace(platforms, brace.wallX, brace.direction, p.y - TUNING.height + 8, p.y - 8)
  if (!touching) return
  launch(p, TUNING.wallJumpSpeed, TUNING.wallJumpHeldSpeed)
  p.vx = -brace.direction * TUNING.wallJumpPush; p.facing = -brace.direction
  p.wallJump = { direction: -brace.direction, time: 0 }; p.wallJumpBuffer = 0
  p.grabCooldown = .22; p.wallBrace = null; p.pushing = null; p.ledgeReach = null; p.footwork = null
}
function absorbLanding(p: Player, downwardSpeed: number) {
  // Capture the impact before the collision removes vertical velocity.
  p.landingImpact = ease((downwardSpeed - 150) / 850)
  p.landing = 1
  if (p.freeFall && p.freeFall.amount > 0 && p.freeFall.recovery === null) {
    p.freeFall.recovery = 0
    p.freeFall.impact = { vx: p.vx, vy: downwardSpeed, gait: p.gait }
  }
}
/** Count sustained unsupported travel with gravity or weightless floating.
 * An ordinary jump rises against gravity and keeps its existing pose. */
function advanceFreeFall(p: Player, dt: number, floating = false, swimming = false, swimStroke = false) {
  const gravity = p.gravity ?? TUNING.gravity
  if (p.hang || p.mantle || p.climbing || !floating && (p.wallBrace?.active || p.sliding?.active) || p.releaseTurn) {
    p.freeFall = null
  } else if (p.freeFall && p.freeFall.recovery !== null && p.grounded) {
    p.freeFall.recovery += dt
    if (p.freeFall.recovery >= TUNING.fallRecoveryTime && !p.freeFall.moving) { p.freeFall = null; p.landing = 0 }
  } else if (!p.grounded && floating) {
    // Steering and gliding retain the extended rig. A quiet rest unwinds into
    // upright floating while submerged neutral control still holds the depth.
    if (swimStroke) {
      p.freeFall ??= { time: 0, amount: 0, recovery: null }
      p.freeFall.recovery = null
      p.freeFall.amount = Math.min(1, p.freeFall.amount + dt / TUNING.swimBlendTime)
    } else if (p.freeFall) {
      p.freeFall.amount = Math.max(0, p.freeFall.amount - dt / TUNING.swimBlendTime)
      if (!p.freeFall.amount) p.freeFall = null
    }
  } else if (!p.grounded && !swimming && (isWeightless(gravity) || p.vy * Math.sign(gravity) > 80)) {
    // A support disappearing during recovery starts a fresh fall.
    if (p.freeFall && p.freeFall.recovery !== null) p.freeFall = null
    p.freeFall ??= { time: 0, amount: 0, recovery: null }
    p.freeFall.time += dt
    p.freeFall.amount = Math.max(p.freeFall.amount, ease((p.freeFall.time - TUNING.freeFallTime) / TUNING.freeFallBlendTime))
  } else if (!p.grounded && p.freeFall && p.freeFall.recovery === null && p.freeFall.amount > 0) {
    p.freeFall.time = 0
    p.freeFall.amount = Math.max(0, p.freeFall.amount - dt / TUNING.freeFallBlendTime)
    if (!p.freeFall.amount) p.freeFall = null
  } else p.freeFall = null
}
/** The floor carries the weight where it meets an incline without enough grip.
 * Resolve both contacts together; projecting onto the incline alone lifts the
 * feet off the floor and repeatedly restarts the walking/sliding cycle. */
function settleSlopeBase(p: Player, ground: GroundSurface, downhill: number, platforms: readonly Platform[]) {
  const point = (offset: number) => {
    const x = p.x + downhill * offset, surface = platformSurface(ground.platform, x, ground.y)
    return { x, y: surface.y, surface, valid: x >= ground.platform.x && x <= ground.platform.x + ground.platform.w && canGrip(surface.angle) }
  }
  const clear = (offset: number) => {
    const q = point(offset)
    return q.valid && !platforms.some(b => overlaps(q.x, q.y, b, p.crouching ? TUNING.crouchHeight : TUNING.height))
  }
  let low = 0, high: number = TUNING.width
  if (clear(0)) high = 0
  else {
    if (!clear(high)) return null
    for (let i = 0; i < 20; i++) {
      const mid = (low + high) / 2
      if (clear(mid)) high = mid; else low = mid
    }
  }
  // Leave a tiny separation so a rounded-off zero-time contact cannot be missed
  // by the next sweep and let the walking motor advance into the face again.
  const q = point(clear(high + 1e-4) ? high + 1e-4 : high)
  p.x = q.x; p.y = q.y; p.vx = 0; p.vy = 0; p.grounded = true; p.gait = gaitPose(0)
  return q.surface
}
function ledgeBraced(platforms: readonly Platform[], edgeX: number, edgeY: number, side: number) {
  return [55, 58].every(offset => platforms.some(wall => pointInside(wall, edgeX + side * .1, edgeY + offset)
    && !pointInside(wall, edgeX - side * .1, edgeY + offset)))
}
function ledgePathClear(platforms: readonly Platform[], edge: TerrainLedge, braced: boolean, obstacles = platforms, crouched = false, inset = 20,
  blockers = ledgeObstacles(obstacles, edge)) {
  const { edgeX, edgeY, side } = edge
  const toY = edgeY + inset * (edge.slope ?? 0)
  if (!groundAt(platforms, edgeX + inset * side, toY, .01, s => canGrip(s.angle))) return false
  const height = crouched ? TUNING.crouchHeight : TUNING.height
  if (obstacles.some(b => overlaps(edgeX + inset * side, toY, b, height))) return false
  if (blockers.some(other => overlaps(edgeX + inset * side, toY, other, height) || overlaps(edgeX - 14 * side, edgeY, other, height))) return false
  // Sample each frame once across all obstacles, stopping as soon as the path
  // is blocked. Held Down retries against moving objects every physics tick.
  for (let i = 0; i <= 24 && blockers.length; i++) {
    const pose = climbFrame(i / 24, braced, edge.slope, crouched, inset)
    const root = climbContactRoot(i / 24, braced, edge.slope, crouched, inset, pose)
    if (blockers.some(other => overlaps(edgeX + root[0] * side, edgeY + root[1], other, climbBodyHeight(i / 24, crouched))
      || crouched && (pointInside(other, edgeX + pose.head[0] * side, edgeY + pose.head[1])
        || nearestBoundary(other, edgeX + pose.head[0] * side, edgeY + pose.head[1]).distance < 6.2 - 1e-7))) return false
  }
  return true
}
/** Keep the usual landing when it fits, then try a supported stance nearer the lip. */
export function ledgeLanding(platforms: readonly Platform[], edge: TerrainLedge, braced: boolean, obstacles = platforms, crouchedOnly = false) {
  const blockers = ledgeObstacles(obstacles, edge), root = climbContactRoot(0, braced, edge.slope)
  // Every landing shares the same initial hang. A blocked hang cannot be
  // rescued by thirteen different landing insets or by ending in a crouch.
  if (blockers.some(other => overlaps(edge.edgeX + root[0] * edge.side, edge.edgeY + root[1], other, climbBodyHeight(0)))) return null
  for (const crouched of crouchedOnly ? [true] : [false, true]) for (let inset = 20; inset >= 8; inset--) {
    if (ledgePathClear(platforms, edge, braced, obstacles, crouched, inset, blockers)) return { crouched, inset }
  }
  return null
}
/** Free ladders meet nearby terrain by position, including the builder's 20-unit grid spacing. */
function ladderLedge(ladder: Ladder, platforms: readonly Platform[]) {
  const candidates = platforms.flatMap((b, platform) => platformLedges(b).flatMap(edge => {
    const { edgeX, edgeY, side } = edge, gap = (edgeX - ladder.x) * side
    return gap >= TUNING.width / 2 && gap <= 32 && Math.abs(edgeY - ladder.top) < 1 && ledgeExposed(platforms, edge)
      ? [{ platform, ...edge, braced: ledgeBraced(platforms, edgeX, edgeY, side), gap }] : []
  })).sort((a, b) => Number(b.platform === ladder.platform && b.side === ladder.side) - Number(a.platform === ladder.platform && a.side === ladder.side)
    || a.gap - b.gap || Number(b.side === ladder.side) - Number(a.side === ladder.side))
  return candidates.find(edge => {
    if (!ledgePathClear(platforms, edge, edge.braced)) return false
    const target: [number, number] = [edge.edgeX - edge.side * 14, edge.edgeY + TUNING.hangReach]
    const safe = moveBody([ladder.x, ladder.top + climbGait(18).root], target, platforms)
    return Math.hypot(safe.x - target[0], safe.y - target[1]) < .01
  })
}
/** A rope grip can reach a lip even when the platform has no wall below the feet. */
function ropeLedge(p: Player, climb: Climbing, platforms: readonly Platform[], world: ContactWorld) {
  const grip = ropePoint(climb.rope!, climb.distance)
  const fixed = world.colliders.filter(c => !c.prop).map(c => c.platform)
  // A two-tile lip can stop the hands below its top. The swept catch path below
  // first moves the body out from under it, then lifts into the corner grip.
  const candidates = platforms.flatMap((b, platform) => platformLedges(b).flatMap(edge => {
    const { edgeX, edgeY, side } = edge, gap = (edgeX - p.x) * side
    return gap >= -TUNING.width / 2 && gap <= 48 && Math.abs(edgeX - grip[0]) <= 28
      && grip[1] >= edgeY - 24 && grip[1] <= edgeY + 56 && ledgeExposed(fixed, edge)
      ? [{ platform, ...edge, braced: ledgeBraced(platforms, edgeX, edgeY, side) }] : []
  })).sort((a, b) => Math.hypot(a.edgeX - grip[0], a.edgeY - grip[1]) - Math.hypot(b.edgeX - grip[0], b.edgeY - grip[1]))
  return candidates.find(edge => {
    if (!ledgePathClear(platforms, edge, edge.braced, fixed) || platforms.some(b => overlaps(p.x, p.y, b))) return false
    const from: [number, number] = [(p.x - edge.edgeX) * edge.side, p.y - edge.edgeY]
    let previous: [number, number] = [p.x, p.y]
    for (let i = 1; i <= 16; i++) {
      const root = ropeCatchRoot(from, i / 16), target: [number, number] = [edge.edgeX + root[0] * edge.side, edge.edgeY + root[1]]
      const safe = moveBody(previous, target, platforms)
      if (Math.hypot(safe.x - target[0], safe.y - target[1]) > .01) return false
      previous = target
    }
    return true
  })
}
export function playerState(p: Player) {
  if (p.waterMotion && !p.grounded && !p.hang && !p.mantle && !p.climbing && !p.jumpLift && !p.waterJump) {
    return p.waterMotion.underwater && p.vy > 8 ? 'Diving' : p.waterMotion.underwater && p.vy < -8 ? 'Swimming up'
      : Math.abs(p.vx) > 8 ? 'Swimming' : 'Floating'
  }
  if (p.mantle?.returning) return 'Lowering'
  if (p.grounded && p.freeFall?.recovery !== null && p.freeFall?.amount) return 'Recovering'
  const climbDirection = p.climbing?.screenDirection ?? p.climbing?.direction ?? 0
  return p.climbing ? `${p.climbing.kind === 'rope' ? 'Rope' : 'Ladder'} · ${climbDirection > 0 ? 'ascending' : climbDirection < 0 ? 'descending' : 'holding'}`
    : p.mantle ? p.mantle.descending ? 'Lowering' : 'Climbing' : p.hang ? 'Hanging' : p.sliding?.active ? 'Sliding' : p.wallBrace?.active ? 'Bracing' : p.wallJump ? 'Wall jump' : p.pushing && p.pushing.effort > 0 ? 'Pushing' : p.crouching ? 'Crouching' : p.reach > .5 ? 'Reaching' : !p.grounded ? p.vy < 0 ? 'Rising' : 'Falling'
    : Math.abs(p.vx) > 180 ? 'Running' : Math.abs(p.vx) > 10 ? 'Walking' : 'Ready'
}

/** Fixed-step, world-space movement. Rendering and input devices never change physics. */
export function stepPlayer(p: Player, input: JumpInput, dt = STEP, platforms: readonly Platform[] = [],
  climbables: ClimbableWorld = NO_CLIMBABLES,
  rules: LevelRules = { checkpoints: [], fallY: Infinity }, world: ContactWorld = staticContactWorld(platforms), gravityField?: GravityField, gravityOverride?: number, frameDirection = 1,
  fieldMotionOverride?: { floatDrag: number; swimStrength: number; swimDepth: number; swimAcceleration: number; orientationGravity: number }) {
  const swimStrength = fieldMotionOverride?.swimStrength ?? (gravityField ? playerSwimStrength(gravityField, p) : 0)
  const swimDepth = fieldMotionOverride?.swimDepth ?? (gravityField ? playerSwimDepth(gravityField, p) : 0)
  const floatDrag = fieldMotionOverride?.floatDrag ?? (gravityField ? playerFloatDrag(gravityField, p) : 0)
  if (!swimStrength || p.hang || p.mantle || p.climbing) p.waterPushOff = false
  if (frameDirection === 1) {
    const resting = swimStrength > .2 && swimStrength < .95 && floatDrag > 0
      && !p.grounded && !p.hang && !p.mantle && !p.climbing && !p.releaseTurn && !p.jumpLift && !p.waterJump
      && !input.jump && !input.descend && !input.drop && Math.abs(input.move) < .01
      && (p.waterMotion?.amount ?? 0) < .05 && !p.pushing?.amount && Math.hypot(p.vx, p.vy) < 12
    p.waterBob = advanceWaterBob(p.waterBob, dt, resting, p.x)
  }
  const gravity = gravityOverride ?? (gravityField ? playerGravity(gravityField, p) + (swimStrength ? waterBobAcceleration(p.waterBob, floatDrag) : 0) : TUNING.gravity)
  p.gravity = gravity
  p.swimAcceleration = fieldMotionOverride?.swimAcceleration ?? swimmingAcceleration(p, input, swimStrength, gravityField ? playerFieldCoverage(gravityField, p) : 0, swimDepth)
  setPlayerGravity(p, gravity, gravity + p.swimAcceleration)
  const orientationGravity = fieldMotionOverride?.orientationGravity ?? (gravityField?.hasWater ? playerOrientationGravity(gravityField, p) : gravity)
  if (p.inverted) {
    // Reflect live rope state with the controller, solve once, then restore it.
    // Field samples remain in world space and the authored anchor is untouched.
    if (climbables.ropes.length) p.ropes ??= climbables.ropes.map(createRope)
    const reflected = mirrorContactWorld(world)
    const reflectedMotion = { floatDrag, swimStrength, swimDepth, swimAcceleration: -(p.swimAcceleration ?? 0), orientationGravity: -orientationGravity }
    mirrorPlayerState(p, true); p.inverted = false
    try {
      stepPlayer(p, input, dt, reflected.platforms, { ladders: climbables.ladders.map(mirrorLadder), ropes: p.ropes?.map(r => r.definition) ?? [] },
        { checkpoints: [], fallY: Infinity }, reflected, gravityField, -gravity, -1, reflectedMotion)
    } finally { mirrorPlayerState(p, true); p.inverted = true }
    if (p.contacts) p.contacts = mirrorContacts(p.contacts, world)
    finishGravityTurn(p)
    turnToGravity(p, orientationGravity, world)
    return
  }
  p.terrain = platforms
  // The ready unsupported pose already uses an airborne gait. Preserve that
  // starting frame instead of first easing back from an imaginary ground gait.
  p.gait ??= gaitPose(p.vx, !p.grounded && !p.hang && !p.mantle && !p.climbing)
  const inWater = swimStrength > 0 && !p.jumpLift && !p.waterJump
  const from: [number, number] = [p.x, p.y], oldVy = p.vy, oldMantle = p.mantle
  const beforeBody = playerContactBody(p)
  const previousFacing = p.facing
  const turnFrame = captureDryTurn(p, input)
  const slideEntryFrame = captureSlideEntry(p)
  const previousWaterCenter = inWater ? playerWaterCenterOffset(p) : 0
  const swimDirection = swimmingDirection(input)
  const diving = swimDirection.y > .01
  const underwater = underwaterSwimming(p, input, swimStrength, swimDepth)
  const bottomSurface = inWater && diving && (p.vy >= 0 || gravity + (p.swimAcceleration ?? 0) >= 0)
    ? groundAt(platforms, p.x, p.y, 16, s => s.y >= p.y - .2 && canGrip(s.angle)) : null
  const reversing = Math.abs(input.move) > .1 && p.vx * input.move < -1
  let waterWall: { x: number; amount: number } | undefined
  if (inWater && !diving && !underwater && !p.grounded && input.move * p.facing > .1) {
    const uprightCenter = playerWaterCenterOffset({ ...p, freeFall: null, waterMotion: undefined })
    const previewY = beforeBody.y + previousWaterCenter - uprightCenter
    const banks = world.colliders.filter(c => !c.prop).map(c => c.platform)
    const sweep = moveBody([beforeBody.x, previewY], [beforeBody.x + p.facing * 80, previewY], banks, beforeBody.height)
    if (sweep.contacts.some(c => c.normal[0] * p.facing < -.9)) {
      const gap = (sweep.x - beforeBody.x) * p.facing + TUNING.width / 2
      waterWall = { x: sweep.x + p.facing * TUNING.width / 2, amount: ease((80 - gap) / 50) }
    }
  }
  advanceFreeFall(p, dt, inWater, inWater && !!(input.climb || diving),
    !p.grounded && (underwater > .5
      ? Math.hypot(swimDirection.x, swimDirection.y) > .01 || Math.hypot(p.vx, p.vy) > 20
      : !reversing && !input.climb && (diving || Math.abs(input.move) > .1)))
  if (inWater && reversing && p.freeFall) p.freeFall.amount = Math.max(Math.min(.45, p.waterMotion?.amount ?? 0), p.freeFall.amount)
  if (inWater && !p.hang && !p.mantle && !p.climbing && !p.releaseTurn) {
    p.waterMotion ??= { amount: 0, dive: 0, phase: 0 }
    p.waterMotion.underwater = underwater > .5
    if (p.waterMotion.underwater) p.waterPushOff = false
    p.waterMotion.steering = approach(p.waterMotion.steering ?? 0, underwater, dt / .2)
    p.waterMotion.heading ??= p.facing
    const previousAmount = p.waterMotion.amount
    const postureFloor = Math.max(0, (p.waterMotion.amount ?? 0) - dt / .12)
    if (p.freeFall && waterWall) p.freeFall.amount = Math.min(p.freeFall.amount, Math.max(postureFloor, 1 - waterWall.amount))
    if (p.grounded) p.freeFall = null
    p.waterMotion.amount = p.freeFall?.amount ?? 0
    const floating = Math.hypot(swimDirection.x, swimDirection.y) < .01 || !underwater && input.climb
    // Remember the angular change at the beginning of the rest: an ascending
    // body is already nearly upright, while a head-first dive needs a full tuck.
    if (floating && !p.grounded && p.waterMotion.amount < previousAmount && p.waterMotion.floatCurl === undefined) {
      p.waterMotion.floatCurl = Math.max(0, Math.min(1, (1 + p.waterMotion.dive) / 2))
    }
    if (!floating || p.grounded || !p.waterMotion.amount) delete p.waterMotion.floatCurl
    const floatGather = Math.sin(Math.PI * p.waterMotion.amount) ** 2 * .9 * (p.waterMotion.floatCurl ?? 0) ** .8
    const steeringGather = underwater > .5 ? reversing ? .65 : 0
      : !input.climb && (diving || Math.abs(input.move) > .1) ? Math.sin(Math.PI * p.waterMotion.amount) ** 2 : 0
    const gather = Math.max(steeringGather, floatGather)
    const gathered = p.waterMotion.gather ?? 0
    const gatherTime = underwater > .5 ? gather < gathered ? .26 : .2 : .12
    p.waterMotion.gather = approach(gathered, gather, dt / gatherTime)
    p.waterMotion.bottom = p.waterMotion.landing ? 0
      : approach(p.waterMotion.bottom ?? 0, Number(p.grounded), dt / .25)
    p.waterMotion.floor = bottomSurface && !p.waterMotion.landing
      ? { y: bottomSurface.y, angle: bottomSurface.angle, reach: ease((16 - (bottomSurface.y - p.y)) / 12) } : undefined
    p.waterMotion.wall = waterWall
    const verticalTravel = p.vy * frameDirection
    const speed = Math.hypot(p.vx, verticalTravel)
    const diveDirection = underwater > .5 ? Math.atan2(verticalTravel, Math.abs(p.vx)) / (Math.PI / 2)
      : diving ? Math.atan2(Math.max(0, verticalTravel), Math.abs(p.vx)) / (Math.PI / 2) : 0
    const diveTarget = speed < 8 ? (diving ? 1 : underwater && swimDirection.y < -.01 ? -1 : 0) : diveDirection
    p.waterMotion.dive = approach(p.waterMotion.dive, diveTarget * frameDirection, dt / TUNING.swimPitchTime)
    // The chest starts the turn while the pelvis still follows the travel.
    // Release unwinds that steering curve rather than straightening in a frame.
    const steeringPitch = Math.hypot(swimDirection.x, swimDirection.y) > .01
      ? Math.atan2(swimDirection.y, Math.abs(swimDirection.x)) / (Math.PI / 2) : diveTarget
    // A sideways reversal also curls through the chest while the hips still
    // follow the old heading. Pure yaw projection makes that turn look rigid.
    const yaw = Math.acos(Math.max(-1, Math.min(1, p.waterMotion.heading)))
    const requestedYaw = Math.abs(input.move) > .1 ? input.move > 0 ? 0 : Math.PI : yaw
    const turnCurl = Math.abs(requestedYaw - yaw) / Math.PI * .7 * (1 - Math.abs(steeringPitch))
    const bend = underwater > .5 ? Math.max(-.85, Math.min(.85,
      (steeringPitch * frameDirection - p.waterMotion.dive) * Math.PI / 2 + turnCurl * frameDirection)) : 0
    p.waterMotion.bend = (p.waterMotion.bend ?? 0) + (bend - (p.waterMotion.bend ?? 0)) * (1 - Math.exp(-dt / .2))
    const leadHeading = underwater > .5 && Math.abs(input.move) > .1 ? Math.sign(input.move) : p.waterMotion.heading
    const leadAngle = Math.acos(Math.max(-1, Math.min(1, p.waterMotion.leadHeading ?? p.waterMotion.heading)))
    const targetLeadAngle = Math.acos(Math.max(-1, Math.min(1, leadHeading)))
    p.waterMotion.leadHeading = Math.cos(leadAngle + (targetLeadAngle - leadAngle) * (1 - Math.exp(-dt / .12)))
    p.waterMotion.scull = ((p.waterMotion.scull ?? 0) + dt * Math.PI * 2 * .18) % (Math.PI * 2)
    if (!p.grounded) p.y += previousWaterCenter - playerWaterCenterOffset(p)
  } else delete p.waterMotion
  const verticalUsed = !!(p.climbing || p.hang || p.mantle)
  const initialContacts = playerContacts(p, input, world, dt), previousGround = initialContacts.support
  if (stepMotion(p, input, dt, platforms, climbables, rules, world, initialContacts, gravityField, frameDirection, floatDrag, swimStrength, swimDepth, orientationGravity)) return
  const leavingGround = previousGround && !p.grounded
    && p.vx * Math.sin(previousGround.angle) - p.vy * Math.cos(previousGround.angle) > .1
  // The hanging climb clears its own ledge; low steps use the full solid hull.
  const mantle = p.mantle ?? oldMantle
  const obstacles = mantle && !mantle.step ? ledgeObstacles(platforms, mantle) : platforms
  const afterBody = playerContactBody(p), offsetX = afterBody.x - p.x, offsetY = afterBody.y - p.y
  const result = moveBody([beforeBody.x, beforeBody.y], [afterBody.x, afterBody.y], obstacles, afterBody.height, 1, playerTurnAngle(p))
  result.x -= offsetX; result.y -= offsetY
  // Following a curved ground profile may cross a crest between two samples.
  // Keep the supported endpoint only for tiny corrections with a clear body.
  if (p.grounded && Math.hypot(result.x - p.x, result.y - p.y) < Math.abs(p.x - from[0]) + .1 && !obstacles.some(b => overlaps(p.x, p.y, b))) {
    result.x = p.x; result.y = p.y
  }
  const corrected = Math.hypot(result.x - p.x, result.y - p.y) > .01
  p.x = result.x; p.y = result.y
  if (corrected) {
    if (p.mantle || p.hang) { p.mantle = null; p.hang = null; p.grabCooldown = .25 }
    p.footwork = null
    for (const { normal, platform: b } of result.contacts) {
      // A glancing foot/corner contact must not turn downward speed into a
      // sideways launch. The vertical face arrests lateral movement only.
      const n = !b.polygon && !b.profile && p.y > b.y && p.y - TUNING.height < b.y + b.h && (p.x < b.x || p.x > b.x + b.w)
        ? [p.x < b.x ? -1 : 1, 0] : normal
      const into = p.vx * n[0] + p.vy * n[1]
      if (into < 0) { p.vx -= into * n[0]; p.vy -= into * n[1] }
    }
  }
  if (!p.climbing && !p.hang && !p.mantle && !p.releaseTurn) {
    const supportAcceleration = (p.gravity ?? TUNING.gravity) + (p.swimAcceleration ?? 0)
    let ground = supportAcceleration >= 0 ? groundAt(platforms, p.x, p.y, .2) : null
    let slope = result.contacts.map(c => ({ ...c, face: bodyContact(c.platform, p.x, p.y, c.normal,
      p.crouching ? TUNING.crouchHeight : TUNING.height) })).find(c => {
      // A nearly vertical face is a wall contact. Solver-sized box tilts can
      // give it a tiny upward normal without making it a place to plant feet.
      if (c.face.ny >= -.01) return false
      const angle = Math.atan2(c.face.nx, -c.face.ny), speed = p.vx * Math.cos(angle) + p.vy * Math.sin(angle)
      return !canGrip(angle) || p.sliding?.active && Math.abs(speed) > 1e-5
    })
    const base = slope && !canGrip(Math.atan2(slope.face.nx, -slope.face.ny))
      ? groundAt(platforms, p.x, p.y, .3, s => canGrip(s.angle)) ?? (!leavingGround ? previousGround : null) : null
    if (supportAcceleration >= 0 && slope && base && !leavingGround && (p.vx * slope.face.nx <= 0 || input.move * slope.face.nx < 0)
      && (p.grounded || previousGround || p.vx * Math.sin(base.angle) - p.vy * Math.cos(base.angle) <= .1)
    ) {
      const support = settleSlopeBase(p, base, Math.sign(slope.face.nx), platforms)
      if (support) { slope = undefined; ground = support }
    }
    if (slope && supportAcceleration >= 0) {
      const angle = Math.atan2(slope.face.nx, -slope.face.ny), tangent = [Math.cos(angle), Math.sin(angle)]
      let speed = p.vx * tangent[0] + p.vy * tangent[1]
      if (!p.sliding?.active) speed = slidingVelocity(speed - supportAcceleration * tangent[1] * dt, angle, supportAcceleration, dt)
      const contact = nearestBoundary(slope.platform, p.x, p.y)
      p.vx = tangent[0] * speed; p.vy = tangent[1] * speed
      // Presentation follows resolved slip, including abrupt braking at a
      // landing corner. It never feeds the friction or jump motor.
      const previousSpeed = p.sliding?.balanceSpeed ?? speed
      const balanceSpeed = previousSpeed + (speed - previousSpeed) * (1 - Math.exp(-dt / .08))
      p.sliding = { angle, amount: approach(p.sliding?.amount ?? 0, 1, dt / .12), time: (p.sliding?.time ?? 0) + dt, active: true, x: contact.x, y: contact.y, balanceSpeed }
      // A separate wall contact still owns its brace and release blend when a
      // moving slope briefly catches the feet in a narrow gap.
      p.grounded = false; p.coyote = 0; p.footwork = null
    } else {
      if (p.sliding) { p.sliding.active = false; p.sliding.amount = Math.max(0, p.sliding.amount - dt / .12); if (!p.sliding.amount) p.sliding = null }
      // An uphill landing can have upward world velocity after the collision.
      // Support depends on separating from the surface, not on falling in world Y.
      if (ground && canGrip(ground.angle) && (p.grounded || p.vx * Math.sin(ground.angle) - p.vy * Math.cos(ground.angle) <= .1)) {
        if (!p.grounded && oldVy > 0) absorbLanding(p, oldVy)
        p.grounded = true; p.vy = 0; p.groundAngle = ground.angle
        if (!platforms.some(b => overlaps(p.x, ground.y, b))) p.y = ground.y
      }
    }
  }
  if (p.waterMotion) p.wallBrace = null
  else updateCantedWallBrace(p, input.move, dt, platforms, result.contacts)
  if (p.wallBrace?.normal) tryWallJump(p, platforms)
  stepReleasedTurn(p, platforms, dt, orientationGravity)
  finishPlayerStep(p, input, dt, world, from, verticalUsed, turnFrame, slideEntryFrame)
  settleFallClearance(p, dt, previousFacing)
  if (p.waterMotion) {
    if (p.facing !== previousFacing && p.waterMotion.bodyOffset) p.waterMotion.bodyOffset[0] *= -1
    if (p.waterMotion.underwater) {
      // Ease the turn angle, not its projection: a linear cosine makes knees
      // jerk out of their bend plane at the beginning and end of a reversal.
      const angle = Math.acos(Math.max(-1, Math.min(1, p.waterMotion.heading ?? p.facing)))
      p.waterMotion.heading = Math.cos(angle + ((p.facing > 0 ? 0 : Math.PI) - angle) * (1 - Math.exp(-dt / .18)))
    } else p.waterMotion.heading = approach(p.waterMotion.heading ?? p.facing, p.facing, dt * 2 / .18)
    // Strokes cover actual traveled distance, excluding the foot-root change
    // that keeps the displaced center fixed while changing posture.
    const distance = Math.hypot(p.x - from[0], p.y + playerWaterCenterOffset(p) - from[1] - previousWaterCenter)
    if (p.waterMotion.amount > 0) {
      // Kicks also supply effort against a contacted prop, including when it
      // cannot move. Ordinary strokes still advance only with resolved travel.
      const effort = !p.grounded && p.contacts?.push?.swimming ? p.contacts.push.effort : 0
      const travel = Math.max(distance, dt * TUNING.swimStrokeDistance * .55 * effort)
      p.waterMotion.phase = (p.waterMotion.phase + travel * Math.PI * 2 / TUNING.swimStrokeDistance) % (Math.PI * 2)
    }
    advanceWaterLanding(p, input, dt, oldVy)
    advanceWaterCeiling(p, input, dt, world)
    const effort = Math.max(Math.hypot(p.vx, p.vy) / 70, p.contacts?.push?.swimming ? p.contacts.push.effort : 0)
    p.waterMotion.effort = approach(p.waterMotion.effort ?? Math.min(1, effort), Math.min(1, effort), dt / .16)
    if (p.grounded) {
      p.freeFall = null; p.waterMotion.amount = 0; p.waterMotion.underwater = false
      if (!p.waterMotion.landing) p.waterMotion.bottom = 1
    }
    settleWaterClearance(p, dt)
  }
  if (gravityOverride === undefined) { finishGravityTurn(p); turnToGravity(p, orientationGravity, world) }
}

/** Turn on actual gravity-facing contact. On slopes, the head's wide edge
 * touches before its center; the new foot root meets the same exposed face. */
function turnToGravity(p: Player, gravity: number, world: ContactWorld) {
  if (!gravity || p.hang || p.mantle || p.climbing || p.releaseTurn || (gravity < 0) === !!p.inverted) return
  const height = p.crouching ? TUNING.crouchHeight : TUNING.height
  const inverted = gravity < 0, direction = inverted ? -1 : 1, head = p.y + direction * height
  const probe = moveBody([p.x, p.y], [p.x, p.y + direction * .2], world.platforms, height, p.inverted ? -1 : 1)
  const surfaces = probe.contacts.flatMap(c => {
    if (c.normal[1] * direction >= -.01) return []
    const angle = Math.atan2(c.normal[0], -c.normal[1] * direction)
    const reach = TUNING.width / 2 * Math.abs(Math.tan(angle)) + .2
    const surface = groundAt([inverted ? mirrorPlatform(c.platform) : c.platform], p.x, inverted ? -head : head,
      reach, s => Math.abs(s.angle - angle) < 1e-4)
    return surface ? [surface] : []
  })
  const support = surfaces.sort((a, b) => Math.abs(a.y - head * direction) - Math.abs(b.y - head * direction))[0]
  if (!support) return
  const y = inverted ? -support.y : support.y
  const safe = moveBody([p.x, y], [p.x, y], world.platforms, height, direction)
  if (Math.hypot(safe.x - p.x, safe.y - y) > TUNING.width || world.platforms.some(b => bodyIntersects(safe.x, safe.y, b, height, direction))) return
  p.x = safe.x; p.y = safe.y; p.inverted = inverted; p.grounded = canGrip(support.angle)
  if (p.grounded) p.vy = 0
  p.coyote = p.grounded ? TUNING.coyoteTime : 0
  p.groundAngle = inverted ? -support.angle : support.angle
  p.footwork = null; p.wallBrace = null; p.sliding = null; p.pushing = null; p.ledgeReach = null
  p.freeFall = null; p.dryTurn = null; p.slideEntry = null
  p.contacts = playerContacts(p, NEUTRAL_INPUT, world)
}

/** All movement modes publish contacts and advance presentation once, after
 * their final world position is known, including an authored level exit. */
export function finishPlayerStep(p: Player, input: JumpInput, dt: number, world: ContactWorld, from: readonly [number, number], verticalUsed = false, turnFrame?: DryTurnFrame | null, slideEntryFrame?: SlideEntryFrame | null) {
  const contacts = playerContacts(p, input, world, dt)
  const carrier = contacts.support?.collider.robot
  if (carrier) {
    const dx = carrier.vx * dt, dy = dx * Math.tan(contacts.support!.angle)
    translateFeet(p, dx, dy)
    from = [from[0] + dx, from[1] + dy]
  }
  contacts.motion = { x: p.x - from[0], y: p.y - from[1], speed: Math.hypot(p.x - from[0], p.y - from[1]) / dt }
  updatePushingPose(p, contacts.push ?? anticipatePush(p, input, world), dt, contacts.motion.speed, [contacts.motion.x, contacts.motion.y])
  // A rolling ball remains an obstruction for the motor, but the published
  // working contacts and rig must release once the shove supplies no force.
  p.contacts = contacts.push?.passive ? { ...contacts, push: null } : contacts
  advanceReturningStepPreparation(p, input, dt, world)
  advanceWaterCamera(p, input, dt)
  settleGait(p, dt)
  // Climbing and crouching own the pose; unused Up still gets a quiet glance.
  const look = verticalUsed || p.climbing || p.hang || p.mantle || p.crouching || p.freeFall?.amount ? 0 : Number(input.climb)
  p.look += (look - p.look) * (1 - Math.exp(-dt / .1))
  if (Math.abs(p.look - look) < .001) p.look = look
  const visibleDirection = dryTurnDirection(p, input, turnFrame)
  if (visibleDirection === p.facing) advanceFootwork(p, dt, from[0], world.platforms)
  else {
    // Footwork belongs to presentation. Grips and steering retain mechanical
    // facing; resting/swing shoes turn toward the body's outgoing direction.
    const feetPlayer = { ...p, facing: visibleDirection }
    advanceFootwork(feetPlayer, dt, from[0], world.platforms)
    p.footwork = feetPlayer.footwork; p.stride = feetPlayer.stride
  }
  advanceMovingRecovery(p, dt, Math.abs(contacts.motion.x) > .05, turnFrame)
  advanceDryTurn(p, input, dt, turnFrame)
  advanceSlideEntry(p, dt, slideEntryFrame, input)
}

/** Read-only lowering availability in the motor's gravity-normalized frame.
 * Feedback uses this same exposed-edge and full-path clearance predicate. */
export function loweringOption(p: Player, platforms: readonly Platform[] = p.terrain ?? []) {
  if (!p.grounded || p.hang || p.mantle || p.climbing || p.grabCooldown !== 0) return null
  const edges = platforms.flatMap((b, platform) => platformLedges(b).flatMap(edge => {
    return Math.abs(p.y - edge.edgeY - (p.x - edge.edgeX) * edge.side * (edge.slope ?? 0)) < .1 && (p.x - edge.edgeX) * edge.side >= 0
      ? [{ platform, ...edge }] : []
  })).filter(edge => Math.abs(edge.edgeX - p.x) <= 32 && ledgeExposed(platforms, edge))
    .sort((a, b) => Math.abs(a.edgeX - p.x) - Math.abs(b.edgeX - p.x))
  for (const edge of edges) {
    const braced = ledgeBraced(platforms, edge.edgeX, edge.edgeY, edge.side)
    const landing = ledgeLanding(platforms, edge, braced, platforms, p.crouching)
    if (landing) return { ...edge, braced, ...landing }
  }
  return null
}
export function verticalClimbOption(p: Player, climbables: ClimbableWorld, platforms: readonly Platform[], vertical: number, frameDirection = 1) {
  if (p.hang || p.climbing || p.mantle || p.releaseTurn || p.grabCooldown !== 0 || !vertical) return null
  const found = findClimbable(p, climbables, platforms)
  return found && !(found.rope && p.grounded && vertical * frameDirection < 0)
    && !(found.ladder && p.grounded && (Math.abs(p.y - found.ladder.top) < 1 || (Math.abs(p.y - found.ladder.bottom) < 1 && vertical < 0))) ? found : null
}
function stepMotion(p: Player, input: JumpInput, dt: number, platforms: readonly Platform[], climbables: ClimbableWorld, rules: LevelRules,
  world: ContactWorld, contacts: PlayerContacts, gravityField?: GravityField, frameDirection = 1, floatDrag = 0, swimStrength = 0, swimDepth = 0, orientationGravity = p.gravity ?? TUNING.gravity) {
  const gravity = p.gravity ?? TUNING.gravity
  p.airBoost.x = 0; p.airBoost.lift = 0; p.airBoost.time += dt
  const stepIntent = p.stepIntent; p.stepIntent = null
  const pressed = input.jump && !p.jumpHeld
  if (pressed) p.jumpStrength = input.jumpStrength === undefined ? undefined : Math.max(0, Math.min(1, input.jumpStrength))
  p.jumpHeld = input.jump
  // A release, catch, landing or interrupted ascent permanently ends this
  // jump's lift. A later airborne press cannot restart it.
  if (!input.jump || p.grounded || p.hang || p.mantle || p.climbing || p.vy >= 0) p.jumpLift = null
  p.grabCooldown = Math.max(0, p.grabCooldown - dt)
  p.landing = Math.max(0, p.landing - dt / (p.grounded ? .2 + p.landingImpact * .22 : .12))
  p.buffer = pressed ? TUNING.jumpBuffer : Math.max(0, p.buffer - dt)
  p.wallJumpBuffer = pressed && !p.grounded && p.coyote === 0 && !p.hang && !p.mantle && !p.climbing
    ? TUNING.jumpBuffer : Math.max(0, p.wallJumpBuffer - dt)
  if (p.wallJump) {
    p.wallJump.time += dt
    if (p.wallJump.time >= .24 || p.grounded || p.hang || p.mantle || p.climbing) p.wallJump = null
  }
  // Freeze the supported entry pose before this frame moves the rope.
  const towardLedge = frameDirection === 1 ? input.climb && !input.descend : input.descend && !input.climb
  const surfaceExit = towardLedge && !input.jump && !input.detach ? findRopeStepUp(p, world) : null
  if (climbables.ropes.length) {
    p.ropes ??= climbables.ropes.map(createRope)
    for (const [i, rope] of p.ropes.entries()) stepRope(rope, dt, world.ropePlatforms ?? platforms,
      p.climbing?.kind === 'rope' && p.climbing.index === i ? { distance: p.climbing.distance, move: p.climbing.wall ? 0 : p.climbing.swing,
        wall: p.climbing.wall, bracing: ease(p.climbing.time / .25),
        body: { climb: p.climbing, from: [p.x, p.y], facing: p.facing },
        gravity: gravity * 1400 / TUNING.gravity } : null, gravityField, frameDirection)
  }
  if (p.hang || p.mantle || p.climbing) { p.wallBrace = null; p.pushing = null; p.crouching = !!p.mantle?.crouched; p.crouch = Number(p.crouching); p.reach = 0; p.footwork = null; p.ledgeReach = null; p.landing = 0 }
  if (p.mantle) {
    const m = p.mantle
    if (!m.step && !m.descending && (input.drop || input.descend || input.detach)) m.returning = true
    if (m.step && !m.step.climbing && m.step.rise > 20.01 && !stepUpCommitted(m, world)
      && (input.move * m.side < -.1 || input.drop || input.descend || input.detach)) m.returning = true
    let advance = dt
    if (!m.step && !m.descending && !m.returning) {
      const targetInset = (m.toX - m.edgeX) * m.side
      if ((m.inset ?? 20) > targetInset + 1e-7) {
        advance = 0
        if (!narrowMantle(m, world, targetInset, dt)) {
          // A moving object can invalidate the planned reposition. Keep the
          // current clear pose and let the normal motor/retry policy take over.
          m.toX = m.edgeX + (m.inset ?? 20) * m.side; m.toY = m.edgeY + (m.inset ?? 20) * (m.slope ?? 0)
          advance = mantleAdvance(m, world, dt)
        }
      } else {
        advance = mantleAdvance(m, world, dt)
        m.blockedTime = advance < dt * .5 ? (m.blockedTime ?? 0) + dt : 0
        if (m.blockedTime >= .15) {
          m.blockedTime = 0
          // A yielding prop may open a standing pocket before the usual reach
          // fits. Take that clear route instead of prolonging a slow shove from
          // the ledge. Pinned obstacles use the same full-path clearance check.
          for (let inset = Math.floor((m.inset ?? 20) - 1); inset >= 8; inset--) {
            if (!ledgePathClear(platforms, m, m.braced, platforms, !!m.crouched, inset)) continue
            m.toX = m.edgeX + inset * m.side; m.toY = m.edgeY + inset * (m.slope ?? 0)
            narrowMantle(m, world, inset, dt); advance = 0; break
          }
        }
      }
    }
    m.time = Math.max(0, m.time + (m.returning ? -dt : advance))
    if (m.step) {
      if (m.step.climbing && input.detach) { p.mantle = null; p.grabCooldown = .35; p.vy = 40; cancelJumpInput(p); return }
      m.step.jumpQueued ||= pressed
      const progress = Math.min(1, m.time / m.step.duration), root = stepUpRoot(m, progress)
      p.x = root[0]; p.y = root[1]
      p.vx = 0; p.vy = 0; p.facing = m.side
      if (m.returning && progress === 0) {
        const source = m.step.caught, ground = groundAt(platforms, p.x, p.y, .2, surface => canGrip(surface.angle))
        p.mantle = null; p.grounded = !!ground; p.coyote = ground ? TUNING.coyoteTime : 0
        p.groundAngle = ground?.angle ?? 0; p.stride = source.stride; p.gait = source.gait; p.footwork = source.footwork ?? null
        p.pushing = source.pushing ?? null; p.dryTurn = source.dryTurn ?? null
        p.grabCooldown = .25; p.stepIntent = null
        if (m.step.jumpQueued && ground) launch(p)
        return
      }
      if (progress === 1) {
        p.mantle = null; p.grounded = true; p.coyote = TUNING.coyoteTime; p.groundAngle = m.step.landingAngle ?? 0; p.stride = 0; p.gait = gaitPose(0)
        if (m.step.climbing) p.grabCooldown = .35
        p.vx = input.move * m.side > .1 ? m.step.caught.vx : 0
        finishStepFeet(p, m.step)
        if (m.step.jumpQueued) launch(p)
      }
      return
    }
    const progress = Math.min(1, Math.max(0, (m.time - (m.descending ? LEDGE_CATCH_TIME : 0)) / LEDGE_CLIMB_TIME))
    const t = m.descending ? 1 - progress : progress, pose = climbFrame(t, m.braced, m.slope, m.crouched, m.inset)
    p.x = m.edgeX + pose.root[0] * m.side; p.y = m.edgeY + pose.root[1]; p.vx = 0; p.vy = 0; p.facing = m.side
    if (m.descending && m.time < LEDGE_CATCH_TIME) {
      const blend = ease(m.time / LEDGE_CATCH_TIME)
      p.x = m.descending.caught.x + (p.x - m.descending.caught.x) * blend
      p.y = m.descending.caught.y + (p.y - m.descending.caught.y) * blend
    }
    if (m.returning && m.time === 0) {
      p.hang = { platform: m.platform ?? -1, edgeX: m.edgeX, edgeY: m.edgeY, side: m.side, slope: m.slope, time: 1, queued: false, braced: m.braced, dropLocked: true,
        caught: { x: p.x, y: p.y, vx: 0, vy: 0, stride: 0, gait: p.gait, ledgeReach: null } }
      p.mantle = null; return
    }
    if (progress === 1 && m.descending) {
      const c = m.descending.climbable
      const hang: NonNullable<Player['hang']> = { platform: m.descending.platform, side: m.side, edgeX: m.edgeX, edgeY: m.edgeY, slope: m.slope, time: 1, queued: false, braced: m.braced, dropLocked: true,
        upLocked:frameDirection<0, caught: { x: p.x, y: p.y, vx: 0, vy: 0, stride: 0, gait: p.gait, ledgeReach: null } }
      if (c) {
        c.caught = { x: p.x, y: p.y, vx: 0, vy: 0, stride: 0, grounded: false, gait: p.gait, footwork: null, hang }
        c.time = 0; if (c.ladder) c.distance = 18; updateRopeWall(c, platforms); p.climbing = c
      } else p.hang = hang
      p.mantle = null
    } else if (progress === 1) {
      p.x = m.toX; p.y = m.toY; p.mantle = null; p.grounded = true; p.coyote = TUNING.coyoteTime; p.stride = 0
      p.groundAngle = Math.atan((m.slope ?? 0) * m.side)
      p.gait = gaitPose(0)
    }
    return
  }
  const vertical = input.jump ? 0 : Number(input.climb) - Number(input.descend ?? (input.drop && !input.detach))
  const bodyVertical = vertical * frameDirection
  const requestedClimb = vertical !== 0 && !input.jump
  if (p.grounded && !p.hang && !p.climbing && bodyVertical < 0 && !input.jump && !input.detach && p.grabCooldown === 0) {
    // Lower over the edge first, then transfer to a nearby ladder or rope.
    const edge = loweringOption(p,platforms)
    if (edge) {
      const { crouched, inset, braced } = edge
      const caught = { x: p.x, y: p.y, vx: p.vx, vy: p.vy, stride: p.stride, grounded: p.grounded, gait: p.gait, footwork: p.footwork, crouching: p.crouching, crouch: p.crouch, facing: p.facing, freeFall: p.freeFall, dryTurn: p.dryTurn }
      const ladderIndex = climbables.ladders.findIndex(ladder => {
        const exit = ladderLedge(ladder, platforms)
        return exit?.platform === edge.platform && sameLedge(exit, edge)
      })
      const ladder = climbables.ladders[ladderIndex]
      const transfer = ladder ? findClimbable({ ...p, x: ladder.x, y: ladder.top + TUNING.hangReach, grounded: false }, { ladders: [ladder], ropes: [] }, platforms) : null
      if (transfer) transfer.index = ladderIndex
      const climbable = transfer ?? findRope({ ...p, x: edge.edgeX - edge.side * 14, y: edge.edgeY + TUNING.hangReach, facing: edge.side }, platforms)
      p.mantle = { ...edge, toX: edge.edgeX + inset * edge.side, toY: edge.edgeY + inset * (edge.slope ?? 0), time: 0, braced, crouched, inset,
        descending: { platform: edge.platform, caught, climbable } }
      p.facing = edge.side; p.grounded = false; p.vx = 0; p.vy = 0; p.coyote = 0; p.footwork = null; p.pushing = null
      cancelJumpInput(p); return
    }
  }
  if (!p.hang && !p.climbing && !p.releaseTurn && p.grabCooldown === 0 && !input.detach && (requestedClimb || !p.grounded)) {
    const found = requestedClimb ? verticalClimbOption(p,climbables,platforms,vertical,frameDirection) : findRope(p, platforms)
    if (found) {
      p.climbing = found
      updateRopeWall(found, platforms)
      if (found.wall) p.facing = found.wall.side
      if (found.ladder) p.facing = ladderLedge(found.ladder, platforms)?.side ?? found.ladder.side
      if (found.rope) ropeImpulse(found.rope, found.distance, p.vx, p.vy, dt)
      p.grounded = false; p.footwork = null; p.ledgeReach = null; p.coyote = 0; cancelJumpInput(p)
      // Catching consumes the current jump press; release and press again to jump off.
      p.jumpHeld = input.jump
      return
    }
  }
  if (p.climbing) {
    const c = p.climbing, oldX = p.x, oldY = p.y
    const jumping = pressed
    const previousClimb = { ...c, ...(c.turn ? { turn: { ...c.turn } } : {}) }
    c.time += dt
    const screenVertical = c.rope ? vertical * frameDirection : vertical
    const materialVertical = c.rope ? ropeScreenDirection(c, vertical, frameDirection) : vertical
    const turning = !!c.rope && ropeWantsTurn(c, orientationGravity)
    if (c.rope) c.screenDirection = vertical
    c.direction = turning ? 0 : materialVertical
    c.wallCooldown = Math.max(0, (c.wallCooldown ?? 0) - dt)
    const wall = c.wall
    if (wall && c.rope && !input.jump && !jumping && !input.detach && input.move * wall.side < -.1) {
      // A single leg push starts the swing; holding away cannot pin the rope out.
      const grip = ropePoint(c.rope, c.distance), previous = ropePoint(c.rope, c.distance, true)
      ropeImpulse(c.rope, c.distance, (grip[0] - previous[0]) / dt - wall.side * 180 * Math.abs(input.move), (grip[1] - previous[1]) / dt, dt)
      c.wallCooldown = .35
    }
    if (turning) c.wall = undefined
    else updateRopeWall(c, platforms, input.move, [p.x, p.y])
    c.wallPose = c.wall ?? wall ?? c.wallPose
    // Unbrace gradually where a wall becomes a slope, without jerking the grip upward.
    c.wallBlend = approach(c.wallBlend ?? Number(!!wall), Number(!!c.wall), dt / (c.surfaceSupport ? .4 : .22))
    if (!c.wallBlend) c.wallPose = undefined
    c.rappelPull = approach(c.rappelPull ?? 0, Number(!!c.wall && c.direction > 0), dt / .18)
    c.rappelMotion = approach(c.rappelMotion ?? 0, Number(!!c.wall && vertical !== 0), dt / .16)
    if (c.wall) { p.facing = c.wall.side; c.swing = 0 }
    c.swing += ((c.rope && !c.wall ? input.move : 0) - c.swing) * (1 - Math.exp(-dt / .2))
    c.lean += ((c.rope && !c.wall && !c.direction ? input.move : 0) - c.lean) * (1 - Math.exp(-dt / (c.direction ? .14 : .24)))
    // As the feet run out of rope, keep the body hanging below its hands instead
    // of extrapolating the last tiny segment into a long, whipping body support.
    const endHang = c.rope ? ease((c.distance - c.rope.definition.length + 80) / 48) : 0
    c.surfaceSupport = ropeSlopeSupport(c, platforms)
    const heldGrip = c.rope && turning ? ropeGripDistance(c) : 0
    c.hangBlend = approach(c.hangBlend, Math.max(Number(!!c.rope && (!c.direction || (c.screenAxis ?? 1) < 0)), endHang, c.surfaceSupport), dt / .22)
    if (c.rope && turning && !c.turn) keepRopeGrip(c, heldGrip)
    let ropeVelocity: [number, number] | null = null
    if (c.rope) {
      const grip = ropeGripDistance(previousClimb)
      const current = ropePoint(c.rope, grip), previous = ropePoint(c.rope, grip, true)
      const velocity: [number, number] = [(current[0] - previous[0]) / dt, (current[1] - previous[1]) / dt]
      c.swingVelocity += (Math.max(-1, Math.min(1, velocity[0] / 240)) - c.swingVelocity) * (1 - Math.exp(-dt / .08))
      // Catch blends, hand-over-hand poses and weight-shift poses do not add
      // physical momentum. Sample the same loaded material point at both times.
      ropeVelocity = velocity
    }
    p.crouch = 0; p.crouching = false; p.reach = 0; p.landing = 0; p.buffer = 0
    if (jumping || input.detach) {
      if (ropeVelocity && (previousClimb.time < .16 || turning)) [p.vx, p.vy] = ropeVelocity
      if (c.turn) p.releaseTurn = { angle: c.turn.angle, target: c.turn.target }
      p.climbing = null; p.grabCooldown = .35; p.grounded = false
      const launchMove = c.rope && wall ? -wall.side : input.move
      if (jumping && !input.detach) {
        const direction = orientationGravity < -TUNING.gravity * .05 ? -1 : 1
        const momentum = Math.min(p.vy * direction, 0)
        launch(p); p.vy = (p.vy + momentum) * direction
        p.vx = Math.max(-600, Math.min(600, p.vx + launchMove * 180))
      } else { if (!c.rope) p.vy = Math.max(0, p.vy) + 40; cancelJumpInput(p) }
      p.jumpStart = p.y; p.jumpHeight = 0; return
    }
    if (surfaceExit && !turning) {
      p.mantle = surfaceExit; p.climbing = null; p.vx = 0; p.vy = 0; p.grabCooldown = .35; cancelJumpInput(p)
      return
    }
    const bottom = c.ladder ? c.ladder.bottom - c.ladder.top - 56 : c.rope!.definition.length - 8
    const oldDistance = c.distance
    const climbSpeed = (c.rope ? vertical : materialVertical) > 0 ? 85 : 105
    c.distance = Math.max(c.ladder ? 18 : 12, Math.min(bottom, c.distance - materialVertical * climbSpeed * dt))
    if (c.turn) c.turn.grip = Math.max(18, Math.min(c.rope!.definition.length, c.turn.grip + c.distance - oldDistance))
    if (c.rope && turning && c.hangBlend === 1 && !(c.wallBlend ?? 0) && c.time >= .16) {
      c.swing = 0; c.lean = 0
      stepRopeTurn(c, orientationGravity, p.facing, platforms, dt)
    }
    if (c.rope && c.time >= .16 && Math.abs(input.move) < .1) settleRopeGrip(c, p.facing, platforms, dt)
    const target = climbRoot(c, p.facing), blend = ease(c.time / .16)
    p.x = c.caught.x + (target[0] - c.caught.x) * blend; p.y = c.caught.y + (target[1] - c.caught.y) * blend
    p.vx = (p.x - oldX) / dt; p.vy = (p.y - oldY) / dt; p.grounded = false
    if (c.rope && screenVertical > 0 && !turning && c.time >= .16) {
      const edge = ropeLedge({ ...p, x: oldX, y: oldY }, c, platforms, world)
      if (edge) {
        // The unloaded rope keeps moving; the pose we are leaving must stay fixed.
        previousClimb.rope = { ...c.rope, nodes: c.rope.nodes.map(node => ({ ...node })), bends: c.rope.bends.map(bend => bend ? [...bend] : null) }
        p.hang = { ...edge, time: 0, queued: true,
          caught: { x: oldX, y: oldY, vx: 0, vy: 0, stride: p.stride, gait: p.gait, ledgeReach: null, climbing: previousClimb } }
        p.x = oldX; p.y = oldY
        p.climbing = null; p.facing = edge.side; p.vx = 0; p.vy = 0; p.grabCooldown = .35
        return
      }
    }
    if (c.ladder && c.distance === 18 && vertical > 0 && c.time >= .16) {
      const edge = ladderLedge(c.ladder, platforms)
      if (edge) {
        p.hang = { ...edge, time: 0, queued: true,
          caught: { x: p.x, y: p.y, vx: 0, vy: 0, stride: p.stride, gait: p.gait, ledgeReach: null, climbing: { ...c } } }
        p.climbing = null; p.facing = edge.side; p.vx = 0; p.vy = 0
      }
    } else if (c.ladder && c.distance === bottom && vertical < 0 && c.time >= .16) {
      p.climbing = null; p.grabCooldown = .25; p.y = c.ladder.bottom; p.vx = 0; p.vy = 0; p.grounded = !!groundAt(platforms, p.x, p.y, .2)
      p.gait = gaitPose(0)
    }
    // Sweep even the first catch frame. Blocked grips cannot pull the player through terrain.
    let safe = moveBody([oldX, oldY], [p.x, p.y], platforms, TUNING.height, 1, c.turn?.angle)
    const blocked = Math.hypot(safe.x - p.x, safe.y - p.y)
    p.x = safe.x; p.y = safe.y
    // Up can finish a scramble on a walkable slope, just as Down steps off onto a floor.
    const footing = c.rope && !turning && gravity >= 0 && (screenVertical < 0 || screenVertical > 0 && c.surfaceSupport) ? groundAt(platforms, p.x, p.y, .2) : null
    if (footing && canGrip(footing.angle)) {
      p.climbing = null; p.grabCooldown = .35; p.grounded = true
      p.y = footing.y; p.vx = 0; p.vy = 0; p.groundAngle = footing.angle
      p.gait = gaitPose(0)
    } else if (blocked > .1) {
      if (c.rope) {
        // Stop only a climbing step into an obstruction, never the rope simulation.
        if (screenVertical && safe.contacts.some(({ normal }) => normal[1] * screenVertical > .5)) {
          c.distance = previousClimb.distance; c.direction = 0
          if (c.rope) c.screenDirection = 0
          if (c.turn && previousClimb.turn) c.turn.grip = previousClimb.turn.grip
        }
        for (let i = 0; i < 4; i++) safe = constrainRopeBody(c, [oldX, oldY], p.facing, platforms)
        p.x = safe.x; p.y = safe.y
        p.vx = (p.x - oldX) / dt; p.vy = (p.y - oldY) / dt
      } else { p.climbing = null; p.grabCooldown = .3; p.vx = 0; p.vy = 0 }
    }
    if (ropeVelocity && p.climbing === c) {
      const before = ropePoint(c.rope!, previousClimb.distance), after = ropePoint(c.rope!, c.distance)
      p.vx = ropeVelocity[0] + (after[0] - before[0]) / dt
      p.vy = ropeVelocity[1] + (after[1] - before[1]) / dt
    }
    if (c.rope && p.climbing && c.distance === bottom && materialVertical < 0 && c.time >= .16) {
      // Descending off the last handhold is a natural exit, not a jump.
      if (c.turn) p.releaseTurn = { angle: c.turn.angle, target: c.turn.target }
      p.climbing = null; p.grabCooldown = .35
    }
    return
  }
  if (p.hang) {
    const h = p.hang; h.time += dt
    const jumping = pressed
    if (pressed) h.queued = false
    const catchTime = h.caught.climbing?.rope ? ROPE_LEDGE_CATCH_TIME : LEDGE_CATCH_TIME
    const { side } = h, caught = ledgeEase(h.time / catchTime)
    p.x = h.caught.x + (h.edgeX - side * 14 - h.caught.x) * caught
    p.y = h.caught.y + (h.edgeY + TUNING.hangReach - h.caught.y) * caught
    if (h.caught.climbing?.rope) {
      const root = ropeCatchRoot([(h.caught.x - h.edgeX) * side, h.caught.y - h.edgeY], h.time / catchTime)
      p.x = h.edgeX + root[0] * side; p.y = h.edgeY + root[1]
    }
    p.vx = 0; p.vy = 0; p.facing = side
    const dropping = input.drop || input.descend
    if (!dropping) h.dropLocked = false
    // Under reverse gravity Up performed the deliberate lowering. Consume
    // that held intent until release, just as Down holds the ordinary hang.
    if (!input.climb) h.upLocked = false
    if (input.detach || (dropping && !h.dropLocked)) {
      p.hang = null; p.grabCooldown = .35; p.vy = 80; p.vx = -side * 60; cancelJumpInput(p)
    } else if (jumping) {
      p.hang = null; p.grabCooldown = .25; launch(p); p.vx = -side * 260
    } else if (!input.jump) {
      h.queued ||= input.climb && !h.upLocked
      if (h.queued && h.time >= catchTime) {
        // Use the space that is already available before shoving a loose prop.
        // A compact pull can finish at its normal pace, then the grounded push
        // has proper footing instead of stretching the whole climb in time.
        const fixed = world.colliders.filter(c => !c.prop).map(c => c.platform)
        const landing = ledgeLanding(platforms, h, h.braced) ?? ledgeLanding(platforms, h, h.braced, fixed)
        if (landing) {
          const { crouched, inset } = landing, toX = h.edgeX + inset * side, toY = h.edgeY + inset * (h.slope ?? 0)
          p.mantle = { platform: h.platform, edgeX: h.edgeX, edgeY: h.edgeY, slope: h.slope, side, toX, toY, time: 0, braced: h.braced, crouched, inset }; p.hang = null; cancelJumpInput(p)
        }
      }
    }
    return
  }
  // Feet stay planted when ducking. Do not stand up through a low ceiling.
  p.crouching = ((input.crouch || input.descend) && p.grounded) || (p.crouching && platforms.some(b => overlaps(p.x, p.y, b)))
  p.crouch = approach(p.crouch, Number(p.crouching), dt * 10)
  p.reach = approach(p.reach, Number(input.reach && !p.crouching), dt * 10)
  const height = p.crouching ? TUNING.crouchHeight : TUNING.height
  const wasGrounded = p.grounded
  tryWallJump(p, platforms)
  p.coyote = wasGrounded ? TUNING.coyoteTime : Math.max(0, p.coyote - dt)
  if (p.coyote > 0 && p.buffer > 0) {
    launch(p)
    // Held lift temporarily releases the swimming rig. Remember submerged
    // support so that neutral sculling resumes when that lift ends.
    p.waterPushOff = swimStrength > 0 && swimDepth > .98
  }
  // The water surface supplies a jump opportunity without becoming solid ground.
  if (!p.grounded && swimStrength > 0 && floatDrag > 0 && isWeightless(gravity) && p.buffer > 0) { launch(p); p.waterJump = true }
  if (p.waterJump && (swimStrength === 0 || p.vy >= 0 || p.grounded)) p.waterJump = false

  const move = Math.max(-1, Math.min(1, input.move)), waterControl = Math.min(1, swimStrength / .2)
  const drySpeed = p.crouching ? TUNING.walkSpeed : TUNING.runSpeed
  const swimMove = p.grounded ? move : swimmingDirection(input).x
  const target = move * drySpeed * (1 - waterControl) + swimMove * Math.min(drySpeed, TUNING.swimHorizontalSpeed) * waterControl
  // Release carries a damped glide; intentional reversals still steer firmly.
  const coasting = waterControl > 0 && !p.grounded && !move
  if (waterControl && (coasting || move * p.vx < 0 || Math.abs(p.vx) > Math.abs(target))) {
    p.vx *= Math.exp(-(coasting ? TUNING.swimCoastResponse : TUNING.waterMomentumDrag) * waterControl * dt)
  }
  const groundSteering = (move ? TUNING.acceleration : TUNING.braking) * (1 - waterControl) + TUNING.swimHorizontalAcceleration * waterControl
  if (p.wallJump && p.wallJump.time < TUNING.wallJumpControlTime) {
    // A short outward push survives holding toward the wall; ordinary steering follows.
    p.vx = p.wallJump.direction * TUNING.wallJumpPush; p.facing = p.wallJump.direction
  } else if (p.sliding?.active && !p.grounded) {
    const angle = p.sliding.angle, tangent = [Math.cos(angle), Math.sin(angle)]
    const speed = slidingVelocity(p.vx * tangent[0] + p.vy * tangent[1], angle, gravity, dt)
    // The ordinary gravity step below supplies the normal load for the sweep.
    // Subtract its tangent contribution here so gravity is integrated only once.
    const beforeGravity = speed - gravity * tangent[1] * dt
    p.vx = tangent[0] * beforeGravity; p.vy = tangent[1] * beforeGravity
    if (p.buffer > 0) { p.vx = tangent[0] * speed; launch(p) }
  } else {
    if (Math.abs(move) > .01) {
      if (!waterControl || p.grounded || move * p.facing < 0 && p.vx * p.facing <= 5) p.facing = Math.sign(move)
    }
    const ground = p.grounded ? contacts.support : null
    const carrier = ground?.collider.robot
    const beforeSteering = p.vx
    // Velocity stays in world space. Limited shoe traction can follow a slow
    // bot, but cannot instantly match a charge or erase momentum on departure.
    const steered = ground && canGrip(ground.angle)
      ? groundVelocity(p.vx - (carrier?.vx ?? 0), target, ground.angle, carrier ? Math.max(0, gravity + (p.swimAcceleration ?? 0)) * .8 : groundSteering, dt) + (carrier?.vx ?? 0)
      : coasting || !p.grounded && isWeightless(gravity) && !move ? p.vx
      : approach(p.vx, target, (p.grounded ? groundSteering : TUNING.airAcceleration + (TUNING.swimHorizontalAcceleration - TUNING.airAcceleration) * waterControl) * dt)
    const constrained = pushingVelocity(p, contacts.push, world, dt, steered)
    p.vx = constrained ?? steered
    if (!p.grounded && constrained === null) p.airBoost.x = (p.vx - beforeSteering) / (TUNING.airAcceleration * dt)
  }
  if (p.grounded && contacts.support && !p.crouching && !input.jump && !input.drop && !input.descend
    && !p.sliding?.active && p.grabCooldown === 0) {
    const step = findStepUp(p, move, dt, world, stepIntent)
    if (step) {
      p.mantle = step; p.grounded = false; p.vy = 0; p.pushing = null; p.ledgeReach = null; p.wallBrace = null
      p.landing = 0; p.coyote = 0; p.buffer = 0
      return
    }
  }
  const oldX = p.x, oldY = p.y
  const following = p.grounded
  const drag = !following && isWeightless(gravity) ? Math.exp(-TUNING.zeroGravityDrag * dt) : 1
  p.vx *= drag
  // Internal terrain ends are ledges; structural outer terrain encloses the room.
  p.x += p.vx * dt
  for (const b of platforms) if (overlaps(p.x, p.y, b, height)) {
    if (p.vx > 0 && oldX + 12 <= b.x + .1 && exposedSide(platforms, b, 1, p.y - height, p.y)) { p.x = b.x - 12; p.vx = 0 }
    else if (p.vx < 0 && oldX - 12 >= b.x + b.w - .1 && exposedSide(platforms, b, -1, p.y - height, p.y)) { p.x = b.x + b.w + 12; p.vx = 0 }
  }
  let support = following ? followGround(platforms, oldX, p.x, oldY) : null
  if (following && !support) {
    const before = groundAt(platforms, oldX, oldY, .2)
    const ahead = before && p.x >= before.platform.x && p.x <= before.platform.x + before.platform.w
      ? platformSurface(before.platform, p.x, oldY) : null
    if (ahead && !canGrip(ahead.angle) && ahead.y < oldY) {
      // Walk as far as the supporting face permits. Applying a free-fall step
      // before reaching this crease can push the player back down the old face,
      // repeating a tiny uphill/downhill cycle without ever hitting the new one.
      const dx = p.x - oldX
      let low = 0, high = 1
      for (let i = 0; i < 20; i++) {
        const mid = (low + high) / 2
        if (followGround(platforms, oldX, oldX + dx * mid, oldY)) low = mid; else high = mid
      }
      p.x = oldX + dx * low; p.vx = 0
      support = followGround(platforms, oldX, p.x, oldY)
    }
  }
  if (support && platforms.some(b => b !== support!.platform && oldY - height >= b.y + b.h - .1 && overlaps(p.x, support!.y, b, height))) {
    // A ramp must not lift the body through a ceiling.
    p.x = oldX; p.vx = 0; support = followGround(platforms, oldX, oldX, oldY)
  }
  if (following && !support) {
    // Carry the actual surface velocity over a crest or onto a steeper face.
    const before = groundAt(platforms, oldX, oldY, .2)
    if (before) p.vy = p.vx * Math.tan(before.angle)
  }
  sustainJump(p, dt)
  p.vy = Math.max(-1100, Math.min(1100, p.vy + (gravity + (p.swimAcceleration ?? 0)) * dt))
  // Propulsion replaces drag at ordinary swimming speeds. A push-off still
  // meets water resistance during its held lift and its subsequent glide.
  const passiveDrag = Math.max(floatDrag, TUNING.waterRiseDrag * waterControl)
  const verticalControl = swimmingDirection(input).y > 0 ? 1 : underwaterSwimming(p, input, swimStrength, swimDepth)
  const powered = !p.jumpLift && !p.waterJump && p.swimAcceleration ? verticalControl : 0
  const launchResistance = passiveDrag * ease((swimDepth - .8) / .18)
  const waterDrag = p.jumpLift || p.waterJump ? launchResistance : passiveDrag * (1 - powered)
  p.vy *= drag * Math.exp(-waterDrag * dt)
  const excessTravel = Math.max(0, Math.abs(p.vy) - TUNING.diveSpeed)
  p.vy -= Math.sign(p.vy) * excessTravel * (1 - Math.exp(-passiveDrag * powered * dt))
  p.y += p.vy * dt; p.grounded = false
  if (support) { p.y = support.y; p.vy = 0; p.grounded = true }
  for (const b of platforms) {
    if (p.x + 12 <= b.x || p.x - 12 >= b.x + b.w) continue
    if (b.polygon) continue // Polygon faces are resolved by the continuous body sweep.
    const surface = platformSurface(b, p.x), before = platformSurface(b, oldX)
    if (!canGrip(surface.angle) || p.sliding?.active) continue
    if ((p.vy >= 0 || b.profile && p.y - surface.y >= oldY - before.y) && oldY <= before.y + .1 && p.y >= surface.y) {
      if (p.x >= b.x && p.x <= b.x + b.w) {
        if (!wasGrounded) {
          absorbLanding(p, p.vy)
          const cos = Math.cos(surface.angle), sin = Math.sin(surface.angle)
          p.vx = (p.vx * cos + p.vy * sin) * cos
        }
        p.y = surface.y; p.vy = 0; p.grounded = true; support = surface
      } else if (!support && !b.profile && ((p.x < b.x && p.vx > 0) || (p.x > b.x + b.w && p.vx < 0))) {
        // A missed corner is a side contact, not support under empty space.
        p.x = p.x < b.x ? b.x - 12 : b.x + b.w + 12; p.vx = 0
      }
    } else if (p.vy < 0 && oldY - height >= b.y + b.h - .1 && p.y - height <= b.y + b.h) {
      p.y = b.y + b.h + height; p.vy = 0
    }
  }
  let reach: Player['ledgeReach'] = null
  if (!p.grounded && !p.crouching && p.grabCooldown === 0 && !input.drop && p.vy > -500) {
    let catchPosition: ReturnType<typeof moveBody> | undefined
    ledges: for (let index = 0; index < platforms.length; index++) for (const ledge of platformLedges(platforms[index])) {
      // Sideways swimming pushes loose objects; Up deliberately reaches for
      // their ledge. Automatic pool-bank catches remain terrain contacts.
      if (p.waterMotion && !input.climb && world.colliders.some(c => c.platform === platforms[index] && c.prop)) continue
      const side = p.facing
      if (ledge.side !== side || !ledgeExposed(platforms, ledge)) continue
      const edge = ledge.edgeX, edgeY = ledge.edgeY
      const handY = p.y - TUNING.hangReach
      // A swimmer can reach forward from neck depth as well as overhead.
      // Retain the ordinary exposed-ledge, body sweep and pull-up clearance rules.
      const waterReach = swimStrength > 0 && (input.climb || move * side > .1) && frameDirection === 1
      const reachable = (rootY: number) => waterReach ? rootY - edgeY >= 8 && rootY - edgeY < TUNING.hangReach + 16
        : Math.abs(rootY - TUNING.hangReach - edgeY) < 16
      const outside = side === 1 ? p.x <= edge - 10 : p.x >= edge + 10
      const gap = (edge - p.x) * side
      if (outside && gap < 55 && (waterReach && reachable(p.y) || Math.abs(handY - edgeY) < 48)) {
        const heightReach = waterReach && reachable(p.y) ? 1 : ledgeEase((48 - Math.abs(handY - edgeY)) / 28)
        const target = Math.min(ledgeEase((55 - gap) / 27), heightReach)
        const previous = p.ledgeReach?.x === edge && p.ledgeReach.y === edgeY ? p.ledgeReach.amount : 0
        if (!reach || target > reach.amount) reach = { x: edge, y: edgeY, amount: previous + (target - previous) * (1 - Math.exp(-dt / .045)) }
      }
      // Leave room for the last few units of an approaching hand reach. A
      // falling wall-jump can leave the vertical window before a body-near
      // catch opens; the existing catch blend settles that small separation.
      // Passive floating uses the original bank window too: without Up or
      // forward swimming it must not acquire the wider dry reach by default.
      const catchGap = waterReach ? 7 : swimStrength > 0 ? 13 : 19
      if (p.vy > (waterReach ? -TUNING.swimSpeed - 1 : -180) && outside && Math.abs(p.x + side * 14 - edge) < catchGap && reachable(p.y)) {
        const braced = ledgeBraced(platforms, edge, edgeY, side)
        const gripRoot = climbContactRoot(0, braced, ledge.slope)
        if (platforms.some(other => overlaps(edge + side * gripRoot[0], edgeY + gripRoot[1], other))) continue
        // Inset faces are resolved by the sweep, not the bounds-based side stop above.
        // Catch from that resolved position so the same contact cannot cancel the new grip.
        catchPosition ??= moveBody([oldX, oldY], [p.x, p.y], platforms, height)
        if ((edge - catchPosition.x) * side < 10 || Math.abs(catchPosition.x + side * 14 - edge) >= catchGap
          || !reachable(catchPosition.y)) continue
        p.x = catchPosition.x; p.y = catchPosition.y
        const caught = { x: p.x, y: p.y, vx: p.vx, vy: p.vy, stride: p.stride, gait: p.gait, ledgeReach: reach, freeFall: p.freeFall, dryTurn: p.dryTurn,
          ...(p.waterMotion ? { waterMotion: { ...p.waterMotion } } : {}) }
        p.vx = 0; p.vy = 0; p.hang = { platform: index, side, edgeX: edge, edgeY, slope: ledge.slope, time: 0, queued: false, braced, caught }
        cancelJumpInput(p); p.jumpHeld = input.jump; break ledges
      }
    }
  }
  p.ledgeReach = p.hang ? null : reach
  if (p.waterMotion) p.wallBrace = null
  else updateWallBrace(p, move, dt, platforms)
  if (!p.hang) tryWallJump(p, platforms)
  if (p.hang || p.climbing || !p.waterMotion && (p.wallBrace?.active || p.sliding?.active)) p.freeFall = null
  if (p.grounded) p.wallJump = null
  if (p.grounded) {
    rules.checkpoints.forEach((point, index) => {
      if (Math.abs(p.x - point.x) < (point.radius ?? 100) && Math.abs(p.y - point.y) < 1 && p.checkpoint < index + 1) {
        p.spawnX = point.x; p.spawnY = point.y; p.checkpoint = index + 1
      }
    })
  } else {
    p.jumpHeight = Math.max(p.jumpHeight, p.jumpStart - p.y)
    p.bestHeight = Math.max(p.bestHeight, p.jumpHeight)
  }
  p.groundAngle += ((p.grounded ? support?.angle ?? 0 : 0) - p.groundAngle) * (1 - Math.exp(-dt / .08))
  if (p.y > rules.fallY) { respawn(p); return true }
}
