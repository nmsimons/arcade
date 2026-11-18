import type { NamedObject } from './objectNames.ts'
import { climbBodyHeight, climbContactRoot, climbFrame, ladderMantleProgress, ledgeBodyOutline, ledgeLean, LEDGE_CATCH_TIME, LEDGE_CLIMB_TIME, ROPE_LEDGE_CATCH_TIME, ledgeEase, ropeCatchRoot } from './ledge.ts'
import { NO_CLIMBABLES, climbGait, climbRoot, constrainRopeBody, createRope, ease, findClimbable, findRope, ladderDistance, rappelFrame, ROPE_TOP_GRIP, ropeGripDistance, ropeGripLimit, ropeImpulse, ropePendulumPace, ropeTravelSpeed, stepArmHolds, stepRopeStroke, stepRopeSway, ropePoint, ropeSlopeSupport, settleRopeGrip, stepRope, updateRopeWall } from './climbables.ts'
import type { ClimbableWorld, Climbing, Ladder } from './climbables.ts'
import { ladderExitGround, ladderLanding, ladderMantleEntry } from './ladderGeometry.ts'
import { exposedSide, exposedWallFaces, followGround, groundAt, platformSurface } from './terrain.ts'
import type { GroundSurface } from './terrain.ts'
import { canGrabLedge, ledgeExposed, ledgeObstacles, platformLedges, sameLedge } from './terrainLedges.ts'
import type { TerrainLedge } from './terrainLedges.ts'
import { bodyContact, bodyIntersects, bodyPolygon, lipCrossing, moveBody, nearestBoundary, pointInside, toeCornerWall } from './geometry.ts'
import type { TerrainContact } from './geometry.ts'
import { canGrip, FRICTIONLESS, groundVelocity, slidingVelocity, slipRests, surfaceFriction, TERRAIN_FRICTION } from './friction.ts'
import { constrainWaterPosture, mantleAdvance, narrowMantle, playerContactBody, playerContacts, playerCollisionOutline, pushingVelocity, staticContactWorld, translateFeet, updatePushRig } from './playerContacts.ts'
import type { ContactWorld, PlayerContacts } from './playerContacts.ts'
import { findRopeStepUp, findStepUp, finishStepFeet, stepUpCommitted, stepUpRoot } from './stepUp.ts'
import { TUNING, weightlessArrivalTime } from './movementTuning.ts'
import { carryWithRisingWater } from './waterTransport.ts'
import type { WaterLevels } from './waterLevel.ts'
import { advanceWaterBob, advanceWaterCamera, waterBobAcceleration } from './waterBob.ts'
import { mirrorPlayerState, mirrorContactWorld, mirrorContacts, mirrorLadder } from './gravityFrame.ts'
import { contactsToWorld, inWallFrame, turnContactWorld, vectorToWall, wallForGravity, wallFrameAngle, wallInput } from './wallFrame.ts'
import { bodySize, enterSizeFrame, leaveSizeFrame, scaledContactWorld, scaledGravityField, scaledLadder, scaledWater, worldPlatform } from './sizeFrame.ts'
import { isWeightless, playerFieldCoverage, playerFloatDrag, playerGravity, playerOrientationGravity, playerSideGravity, playerSwimStrength, playerSwimDepth, playerWaterCenterOffset, setPlayerGravity, swimmingAcceleration, swimmingDirection, underwaterSwimming } from './gravity.ts'
import type { GravityField } from './gravity.ts'
import { finishGravityTurn, keepRopeGrip, playerTurnAngle, ropeClimbable, ropeShimmyDirection, ropeTravelFacing, ropeTurnHasSupport, ropeVerticality, ropeScreenDirection, ropeWantsTurn, stepReleasedTurn, stepRopeTurn, updateRopeShimmy } from './ropeGravity.ts'
import { stepRopeBodyMotion, stepRopeSetback } from './ropeBodyMotion.ts'
export { TUNING } from './movementTuning.ts'
export type { JumpInput, Platform, Player } from './characterTypes.ts'
import type { JumpInput, Platform, Player } from './characterTypes.ts'
export { gaitPose } from './gait.ts'
export type { GaitPose } from './gait.ts'
import { gaitPose } from './gait.ts'
import { advanceWaterCeiling, advanceWaterLanding, advanceWaterPropReach, captureDryTurn, captureFloatEntry, captureFloatTurn, captureRopeTurnRelease, captureSlideEntry, settleWaterClearance, startImpactRagdoll } from './athleteAnimation.ts'
import { athletePose, dryLedgeReach, dryLedgeReachPose } from './athletePose.ts'
import { gameplayPose } from './gameplayPose.ts'
import { swimmingLedgeReach } from './poses/waterPose.ts'
import type { DryTurnFrame, SlideEntryFrame } from './athleteAnimation.ts'
import { animateOrQueue, animates, cadence, preparePush, presentPush, presentWaterOrQueue, settleOrQueue } from './characterAnimation.ts'
import type { AthletePose } from './athleteRig.ts'

export const STEP = 1 / 120
/** A steered get-up from a prone recovery takes this long. */
const STEERED_GET_UP = .1
/** How hard a rope climber brakes on stopping or turning back, in material units per second squared. */
const ROPE_BRAKE = 420
/** How long a climber takes to turn from side-on to its back to the camera, or back, while it climbs on. */
const ROPE_PIVOT = .14
/**
 * Turning about on a rope, the body pivots beneath hands that stay where they
 * hold, so the hand on each side keeps its shoulder and the arms never cross.
 */
function faceAlongRope(p: Player, c: Climbing, facing: number) {
  if (facing !== p.facing) c.holds?.reverse()
  p.facing = facing
}
export interface Checkpoint extends NamedObject { x: number; y: number; radius?: number }
export interface LevelRules { checkpoints: readonly Checkpoint[]; fallY: number }
interface PlayerStepOptions {
  /** The body stands in a doorway it could enter: Up there belongs to the door, so weightless boots do not lift it off. */
  doorway?: boolean
  advanceRopes?: boolean; ropeRiders?: readonly Player[]; ropeMates?: readonly RopeMate[]; airSpeedScale?: number; airFacing?: 'travel'; water?: WaterLevels
  /** A sideways field's pull across the controller's own gravity: a body is weightless only when both are slight. */
  lateralGravity?: number }
/** Another body holding a rope: its grip, and the stretch of rope below the grip its body hangs along. */
interface RopeMate { index: number; distance: number; span: number }
/** How far below its grip a body's stretch of rope runs, in body units: to its feet, where the next body's hands can hold. */
const ROPE_MATE_SPAN = 66
const ropeMates = (riders: readonly Player[] = []): RopeMate[] => riders.flatMap(r => r.climbing?.rope
  ? [{ index: r.climbing.index, distance: r.climbing.distance, span: ROPE_MATE_SPAN * bodySize(r) }] : [])
/** The shapes of other moving bodies in a world: the player's, and robots'. */
const movingBodies = (world: ContactWorld) => new Set(world.colliders.filter(c => c.robot || c.id === 'player').map(c => c.platform))
/** What holds a body hanging on a rope: terrain, not other moving bodies, which only stop its climbing. */
function ropeBodyTerrain(platforms: readonly Platform[], world: ContactWorld) {
  const bodies = movingBodies(world)
  return bodies.size ? platforms.filter(b => !bodies.has(b)) : platforms
}
/** The moving bodies among each body's last terrain, so a rope it rides is held off only the rest. */
const terrainBodies = new WeakMap<Player, ReadonlySet<Platform>>()
/** Two bodies holding one rope share it: each keeps to its own stretch, and neither's body blocks the other's. */
export const sharesRope = (a: Player, b: Player) => !!a.climbing?.rope && !!b.climbing?.rope && a.climbing.index === b.climbing.index
// Bodies that shared a rope pass through each other until they come apart, so one letting go is not shoved.
const ropePartners = new WeakMap<Player, WeakSet<Player>>()
const bodyBounds = (p: Player) => {
  const body = playerContactBody(p), points = bodyPolygon(body.x, body.y, body.height, p.inverted ? -1 : 1, 0, body.outline)
  const xs = points.map(point => point[0]), ys = points.map(point => point[1])
  return { left: Math.min(...xs), right: Math.max(...xs), top: Math.min(...ys), bottom: Math.max(...ys) }
}
/** Whether two bodies ignore each other: while they share a rope, and after, until they no longer overlap. */
export function passesThrough(a: Player, b: Player) {
  const mark = (on: boolean) => {
    for (const [x, y] of [[a, b], [b, a]]) {
      const partners = ropePartners.get(x) ?? new WeakSet<Player>()
      ropePartners.set(x, partners)
      if (on) partners.add(y); else partners.delete(y)
    }
  }
  if (sharesRope(a, b)) { mark(true); return true }
  if (!ropePartners.get(a)?.has(b)) return false
  const one = bodyBounds(a), other = bodyBounds(b)
  if (one.left < other.right && other.left < one.right && one.top < other.bottom && other.top < one.bottom) return true
  mark(false)
  return false
}
export const NEUTRAL_INPUT: JumpInput = { move: 0, jump: false, climb: false, drop: false, crouch: false, reach: false, descend: false, detach: false }
export function wantsCrouch(input: JumpInput, inverted = false) {
  const down = !!(input.descend ?? (input.drop && !input.detach))
  return inverted ? input.climb || input.crouch && !down && !input.drop : input.crouch || down
}
export function createPlayer(spawn = { x: 0, y: 0 }): Player {
  return { x: spawn.x, y: spawn.y, vx: 0, vy: 0, facing: 1, grounded: true, groundAngle: 0, sliding: null,
    shove: undefined, stagger: 0, shoves: 0, shoveDrift: false,
    coyote: TUNING.coyoteTime, buffer: 0, jumpStrength: undefined, jumpHeld: false, jumpLift: null,
    grabCooldown: 0, ladderJumpGrace: 0, wallJumpBuffer: 0, wallJump: null, wallBrace: null, climbing: null, ropes: null, pushing: null, ledgeReach: null, hang: null, mantle: null, landing: 0, landingImpact: 0,
    freeFall: null, stepIntent: null, spawnX: spawn.x, spawnY: spawn.y, checkpoint: 0, jumpStart: spawn.y, jumpHeight: 0, bestHeight: 0, waterPushOff: false,
    crouching: false, crouch: 0, reach: 0, airBoost: { x: 0, lift: 0, time: 0 }, contacts: null,
    anim: { dryTurn: null, slideEntry: null, footwork: null, stride: 0, gait: null, look: 0, ragdoll: null, recovery: null, waterClearance: null }, gravity: TUNING.gravity, inverted: false, waterJump: false, swimAcceleration: 0 }
}
export function airBoostStrength(p: Player) {
  if (p.grounded || p.hang || p.mantle || p.climbing || p.waterMotion || p.wallBrace?.active || p.sliding?.active) return 0
  return Math.min(1, Math.hypot(p.airBoost.x, p.airBoost.lift))
}
export function cancelJumpInput(p: Player) {
  p.anim.slideEntry = null
  p.waterJump = false
  p.waterPushOff = false
  delete p.waterMotion
  p.jumpStrength = undefined; p.jumpHeld = false; p.jumpLift = null; p.buffer = 0; p.wallJumpBuffer = 0
  p.airBoost.x = 0; p.airBoost.lift = 0
  if (p.mantle?.step) p.mantle.step.jumpQueued = false
  p.stepIntent = null
  p.ladderJumpGrace = 0
}
export function respawn(p: Player) {
  const { spawnX, spawnY, checkpoint, bestHeight } = p, mode = p.anim.cadence
  const ropes = p.ropes?.map(r => createRope(r.definition)) ?? null
  Object.assign(p, createPlayer(), { x: spawnX, y: spawnY, spawnX, spawnY, checkpoint, bestHeight, ropes })
  if (mode) p.anim.cadence = mode
  delete p.releaseTurn
  delete p.wall
  delete p.rebound; delete p.weightless
  delete p.waterBob
  delete p.waterCamera
}
const approach = (value: number, target: number, delta: number) => value + Math.max(-delta, Math.min(delta, target - value))
const overlaps = (x: number, y: number, b: Platform, height: number = TUNING.height) => bodyIntersects(x, y, b, height)
function launch(p: Player, baseSpeed: number = TUNING.jumpSpeed, maxSpeed: number = TUNING.directedJumpSpeed) {
  p.freeFall = null
  p.anim.ragdoll = null
  const extraSpeed = maxSpeed - baseSpeed
  p.jumpLift = p.jumpStrength === undefined
    ? { elapsed: 0, strength: 0, entrySpeed: 0, extraSpeed, fresh: true } : null
  p.vy = -(baseSpeed + extraSpeed * (p.jumpStrength ?? 0))
  p.grounded = false; p.coyote = 0; p.buffer = 0; p.jumpStrength = undefined; p.wallJumpBuffer = 0
  p.ladderJumpGrace = 0
  p.jumpStart = p.y; p.jumpHeight = 0
  if (p.sliding) p.sliding.active = false
}
function launchFromClimb(p: Player, move: number, gravity: number) {
  const direction = gravity < -TUNING.gravity * .05 ? -1 : 1
  const momentum = Math.min(p.vy * direction, 0)
  launch(p); p.vy = (p.vy + momentum) * direction
  p.vx = Math.max(-600, Math.min(600, p.vx + move * 180))
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
  p.grabCooldown = .22; p.wallBrace = null; p.pushing = null; p.pushRig = null; p.ledgeReach = null; p.anim.footwork = null
}
function absorbLanding(p: Player, downwardSpeed: number) {
  // Capture the impact before the collision removes vertical velocity.
  p.landingImpact = ease((downwardSpeed - 150) / 850)
  p.landing = 1
  if (p.freeFall && p.freeFall.amount > 0 && p.freeFall.recovery === null) {
    p.freeFall.recovery = 0
    p.freeFall.impact = { vx: p.vx, vy: downwardSpeed, gait: p.anim.gait }
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
    if (p.freeFall.getUp !== undefined) p.freeFall.getUp += dt
    // Steering gets up faster. The motor ends the fall on its own clock; the
    // presented get-up blends on in the animation.
    if (p.freeFall.recovery >= TUNING.fallRecoveryTime || (p.freeFall.getUp ?? 0) >= STEERED_GET_UP - 1e-9) { p.freeFall = null; p.landing = 0 }
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
  } else if (!p.grounded && !swimming && !settledWeightless(p) && (isWeightless(gravity) || p.vy * Math.sign(gravity) > 80)) {
    // Settled weightlessness floats (athleteAnimation.ts) rather than falls; a passing moment of it still counts.
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
  // Search no further than the footing reaches: near the end of a box or ledge
  // the clear stance lies between here and that end, not a full body width away.
  const reach = downhill > 0 ? ground.platform.x + ground.platform.w - p.x : p.x - ground.platform.x
  let low = 0, high = Math.max(0, Math.min(TUNING.width, reach))
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
  p.x = q.x; p.y = q.y; p.vx = 0; p.vy = 0; p.grounded = true; p.anim.gait = gaitPose(0)
  return q.surface
}
function ledgeBraced(platforms: readonly Platform[], edgeX: number, edgeY: number, side: number, outwardSlope = 0) {
  return [55, 58].every(offset => {
    const faceX = edgeX - side * offset * outwardSlope
    return platforms.some(wall => pointInside(wall, faceX + side * .1, edgeY + offset)
      && !pointInside(wall, faceX - side * .1, edgeY + offset))
  })
}
function ledgePathClear(platforms: readonly Platform[], edge: TerrainLedge, braced: boolean, obstacles = platforms, crouched = false, inset = 20,
  blockers = ledgeObstacles(obstacles, edge)) {
  const { edgeX, edgeY, side } = edge
  const toY = edgeY + inset * (edge.slope ?? 0)
  // A downhill landing can immediately slide; it need not provide standing traction.
  if (!groundAt(platforms, edgeX + inset * side, toY, .01, s => canGrabLedge(Math.tan(s.angle) * side))) return false
  const height = crouched ? TUNING.crouchHeight : TUNING.height
  if (obstacles.some(b => overlaps(edgeX + inset * side, toY, b, height))) return false
  if (blockers.some(other => overlaps(edgeX + inset * side, toY, other, height) || overlaps(edgeX - 14 * side, edgeY, other, height))) return false
  // Sample each frame once across all obstacles, stopping as soon as the path
  // is blocked. Held Down retries against moving objects every physics tick.
  for (let i = 0; i <= 24 && blockers.length; i++) {
    const pose = climbFrame(i / 24, braced, edge.slope, crouched, inset, edge.outwardSlope)
    const root = climbContactRoot(i / 24, braced, edge.slope, crouched, inset, edge.outwardSlope, pose)
    const bodyHeight = climbBodyHeight(i / 24, crouched), outline = ledgeBodyOutline(root[1], bodyHeight, side, ledgeLean(i / 24, edge.outwardSlope))
    if (blockers.some(other => bodyIntersects(edgeX + root[0] * side, edgeY + root[1], other, bodyHeight, 1, 0, outline)
      || crouched && (pointInside(other, edgeX + pose.head[0] * side, edgeY + pose.head[1])
        || nearestBoundary(other, edgeX + pose.head[0] * side, edgeY + pose.head[1]).distance < 6.2 - 1e-7))) return false
  }
  return true
}
/** Keep the usual landing when it fits, then try a supported stance nearer the lip. */
export function ledgeLanding(platforms: readonly Platform[], edge: TerrainLedge, braced: boolean, obstacles = platforms, crouchedOnly = false) {
  const blockers = ledgeObstacles(obstacles, edge), root = climbContactRoot(0, braced, edge.slope, false, 20, edge.outwardSlope)
  // Every landing shares the same initial hang. A blocked hang cannot be
  // rescued by thirteen different landing insets or by ending in a crouch.
  const outline = ledgeBodyOutline(root[1], climbBodyHeight(0), edge.side, edge.outwardSlope ?? 0)
  if (blockers.some(other => bodyIntersects(edge.edgeX + root[0] * edge.side, edge.edgeY + root[1], other, climbBodyHeight(0), 1, 0, outline))) return null
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
      ? [{ platform, ...edge, braced: ledgeBraced(platforms, edgeX, edgeY, side, edge.outwardSlope), gap }] : []
  })).sort((a, b) => Number(b.platform === ladder.platform && b.side === ladder.side) - Number(a.platform === ladder.platform && a.side === ladder.side)
    || a.gap - b.gap || Number(b.side === ladder.side) - Number(a.side === ladder.side))
  return candidates.find(edge => {
    if (!ledgePathClear(platforms, edge, edge.braced)) return false
    const root = climbFrame(0, edge.braced, edge.slope, false, 20, edge.outwardSlope).root
    const target: [number, number] = [edge.edgeX + edge.side * root[0], edge.edgeY + root[1]]
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
      ? [{ platform, ...edge, braced: ledgeBraced(platforms, edgeX, edgeY, side, edge.outwardSlope) }] : []
  })).sort((a, b) => Math.hypot(a.edgeX - grip[0], a.edgeY - grip[1]) - Math.hypot(b.edgeX - grip[0], b.edgeY - grip[1]))
  return candidates.find(edge => {
    // The same landings as a catch from a jump: nearer the lip, or crouched, when the usual one does not clear.
    if (!ledgeLanding(platforms, edge, edge.braced, fixed) || platforms.some(b => overlaps(p.x, p.y, b))) return false
    const from: [number, number] = [(p.x - edge.edgeX) * edge.side, p.y - edge.edgeY]
    const hangRoot = climbFrame(0, edge.braced, edge.slope, false, 20, edge.outwardSlope).root
    let previous: [number, number] = [p.x, p.y]
    for (let i = 1; i <= 16; i++) {
      const root = ropeCatchRoot(from, i / 16, hangRoot), target: [number, number] = [edge.edgeX + root[0] * edge.side, edge.edgeY + root[1]]
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
  fieldMotionOverride?: { floatDrag: number; swimStrength: number; swimDepth: number; swimAcceleration: number; orientationGravity: number },
  options: PlayerStepOptions = {}) {
  const size = bodySize(p)
  if (size !== 1) {
    // A larger body steps as the player does, in a frame scaled down by its size (sizeFrame.ts).
    if (climbables.ropes.length) p.ropes ??= climbables.ropes.map(createRope)
    const scaled = scaledContactWorld(world, size), frame = enterSizeFrame(p, size, true, scaled)
    p.size = 1
    try {
      stepPlayer(p, input, dt, scaled.platforms, { ladders: climbables.ladders.map(ladder => scaledLadder(ladder, size)), ropes: p.ropes?.map(r => r.definition) ?? [] },
        { checkpoints: rules.checkpoints.map(c => ({ ...c, x: c.x / size, y: c.y / size, ...(c.radius ? { radius: c.radius / size } : {}) })), fallY: rules.fallY / size }, scaled,
        gravityField && scaledGravityField(gravityField, size), gravityOverride, frameDirection,
        fieldMotionOverride && { ...fieldMotionOverride, swimDepth: fieldMotionOverride.swimDepth / size },
        { ...options, ropeRiders: undefined, ropeMates: (options.ropeMates ?? ropeMates(options.ropeRiders)).map(m => ({ ...m, distance: m.distance / size, span: m.span / size })),
          ...(options.water ? { water: scaledWater(options.water, size) } : {}) })
    } finally { p.size = size; leaveSizeFrame(p, frame, true, world) }
    return
  }
  if (frameDirection === 1 && gravityField && options.water) carryWithRisingWater(p, options.water, gravityField, world)
  const swimStrength = fieldMotionOverride?.swimStrength ?? (gravityField ? playerSwimStrength(gravityField, p) : 0)
  const swimDepth = fieldMotionOverride?.swimDepth ?? (gravityField ? playerSwimDepth(gravityField, p) : 0)
  const floatDrag = fieldMotionOverride?.floatDrag ?? (gravityField ? playerFloatDrag(gravityField, p) : 0)
  if (!swimStrength || p.hang || p.mantle || p.climbing) p.waterPushOff = false
  if (frameDirection === 1) {
    const resting = swimStrength > .2 && swimStrength < .95 && floatDrag > 0
      && !p.grounded && !p.hang && !p.mantle && !p.climbing && !p.releaseTurn && !p.jumpLift && !p.waterJump
      && !input.jump && !input.descend && !input.drop && Math.abs(input.move) < .01
      && (p.waterMotion?.amount ?? 0) < .05 && !p.pushRig?.amount && Math.hypot(p.vx, p.vy) < 12
    p.waterBob = advanceWaterBob(p.waterBob, dt, resting, p.x)
  }
  const gravity = gravityOverride ?? (gravityField ? playerGravity(gravityField, p) + (swimStrength ? waterBobAcceleration(p.waterBob, floatDrag) : 0) : TUNING.gravity)
  p.gravity = gravity
  p.swimAcceleration = fieldMotionOverride?.swimAcceleration ?? swimmingAcceleration(p, input, swimStrength, gravityField ? playerFieldCoverage(gravityField, p) : 0, swimDepth)
  setPlayerGravity(p, gravity, gravity + p.swimAcceleration)
  const orientationGravity = fieldMotionOverride?.orientationGravity ?? (gravityField?.hasWater ? playerOrientationGravity(gravityField, p) : gravity)
  // Sideways fields (wallFrame.ts): a body on a wall steps in that wall's frame; elsewhere the pull acts on a free body.
  let side = 0
  if (gravityOverride === undefined && frameDirection === 1 && (p.wall || gravityField?.sideways)) {
    side = gravityField ? playerSideGravity(gravityField, p) : 0
    if (p.wall) { stepOnWall(p, input, dt, climbables, world, gravityField, side, gravity, options); return }
    if (!p.grounded && !p.hang && !p.mantle && !p.climbing) p.vx += side * dt
    if (side) options = { ...options, lateralGravity: side }
  }
  if (p.inverted) {
    // Reflect live rope state with the controller, solve once, then restore it.
    // Field samples remain in world space and the authored anchor is untouched.
    if (climbables.ropes.length) p.ropes ??= climbables.ropes.map(createRope)
    const reflected = mirrorContactWorld(world)
    const reflectedMotion = { floatDrag, swimStrength, swimDepth, swimAcceleration: -(p.swimAcceleration ?? 0), orientationGravity: -orientationGravity }
    mirrorPlayerState(p, true); p.inverted = false
    try {
      stepPlayer(p, input, dt, reflected.platforms, { ladders: climbables.ladders.map(mirrorLadder), ropes: p.ropes?.map(r => r.definition) ?? [] },
        { checkpoints: [], fallY: Infinity }, reflected, gravityField, -gravity, -1, reflectedMotion, options)
    } finally { mirrorPlayerState(p, true); p.inverted = true }
    if (p.contacts) p.contacts = mirrorContacts(p.contacts, world)
    finishGravityTurn(p)
    turnToGravity(p, orientationGravity)
    if (side || p.releaseTurn?.toWall !== undefined) turnToWall(p, side, gravity)
    if (settledWeightless(p)) orientInFlight(p, world, input)
    return
  }
  p.terrain = platforms
  terrainBodies.set(p, new Set([...movingBodies(world)].map(worldPlatform)))
  // The ready unsupported pose already uses an airborne gait. Preserve that
  // starting frame instead of first easing back from an imaginary ground gait.
  p.anim.gait ??= gaitPose(p.vx, !p.grounded && !p.hang && !p.mantle && !p.climbing)
  const inWater = swimStrength > 0 && !p.jumpLift && !p.waterJump
  const from: [number, number] = [p.x, p.y], oldVx = p.vx, oldVy = p.vy, oldMantle = p.mantle, oldLadder = p.climbing?.ladder
  const beforeBody = playerContactBody(p)
  const previousFacing = p.facing
  const flightFacing = options.airFacing === 'travel' && !p.releaseTurn ? previousFacing : undefined
  // Turn and slide-entry blends start from the rig before this step; only animated
  // players capture it, once per drawn frame for the 'frame' cadence.
  const animating = animates(p)
  const turnFrame = animating && !p.anim.pending?.turnFrame ? captureDryTurn(p, input, frameDirection) : null
  const slideEntryFrame = animating && !p.anim.pending?.slideEntryFrame ? captureSlideEntry(p) : null
  if (animating) captureFloatEntry(p, frameDirection)
  const previousWaterCenter = inWater ? playerWaterCenterOffset(p) : 0
  const previousWaterMotion = p.waterMotion ? { ...p.waterMotion } : undefined
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
    // A head-first dive from an upright float needs the same tuck on either
    // side of the surface/underwater handoff. Fold before extending down,
    // rather than rotating the long floating legs as one rigid silhouette.
    const diveGather = diving && p.waterMotion.amount > previousAmount
      ? Math.sin(Math.PI * p.waterMotion.amount) ** 2 : 0
    const steeringGather = underwater > .5 ? reversing ? .65 : 0
      : !input.climb && (diving || Math.abs(input.move) > .1) ? Math.sin(Math.PI * p.waterMotion.amount) ** 2 : 0
    const gather = Math.max(steeringGather, floatGather, diveGather)
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
    // A near-vertical swimmer can gain a tiny steering velocity as the body
    // flexes beside a wall. Do not rock the pitch back and forth every tick.
    const lateralTravel = Math.abs(p.vx) < 8 && Math.abs(p.waterMotion.dive) > .9 ? 0 : Math.abs(p.vx)
    const diveDirection = underwater > .5 ? Math.atan2(verticalTravel, lateralTravel) / (Math.PI / 2)
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
    if (!p.grounded) {
      constrainWaterPosture(p, previousWaterMotion, previousWaterCenter, world)
      p.y += previousWaterCenter - playerWaterCenterOffset(p)
    }
    advanceWaterPropReach(p, input, dt, world)
  } else delete p.waterMotion
  const verticalUsed = !!(p.climbing || p.hang || p.mantle)
  const initialContacts = playerContacts(p, input, world, dt), previousGround = initialContacts.support
  if (stepMotion(p, input, dt, platforms, climbables, rules, world, initialContacts, gravityField, frameDirection, floatDrag, swimStrength, swimDepth, orientationGravity, options)) return
  const leavingGround = previousGround && !p.grounded
    && p.vx * Math.sin(previousGround.angle) - p.vy * Math.cos(previousGround.angle) > .1
  // The hanging climb clears its own ledge; low steps use the full solid hull.
  const mantle = p.mantle ?? oldMantle
  const obstacles = p.climbing?.ladder || oldLadder || mantle?.ladder ? ladderObstacles(world)
    : mantle && !mantle.step ? ledgeObstacles(platforms, mantle) : p.climbing?.rope ? ropeBodyTerrain(platforms, world) : platforms
  const afterBody = playerContactBody(p), offsetX = afterBody.x - p.x, offsetY = afterBody.y - p.y
  const collisionOutline = playerCollisionOutline(p, world)
  const result = moveBody([beforeBody.x, beforeBody.y], [afterBody.x, afterBody.y], obstacles, afterBody.height, 1, playerTurnAngle(p), collisionOutline)
  result.x -= offsetX; result.y -= offsetY
  // A changing hang hull can overlap yesterday's wall contact at the sweep's
  // start even though this frame's complete target hull clears it. Accept only
  // a clear endpoint and a correction smaller than this tick's body travel.
  const catchingLean = p.hang?.outwardSlope && p.hang.time > 0
    && p.hang.time < (p.hang.caught.climbing?.rope ? ROPE_LEDGE_CATCH_TIME : LEDGE_CATCH_TIME)
  if (catchingLean && Math.hypot(result.x - p.x, result.y - p.y) < Math.hypot(afterBody.x - beforeBody.x, afterBody.y - beforeBody.y) + .1
    && !obstacles.some(b => bodyIntersects(afterBody.x, afterBody.y, b, afterBody.height, 1, playerTurnAngle(p), collisionOutline?.(b)))) {
    result.x = p.x; result.y = p.y
  }
  // Following a curved ground profile may cross a crest between two samples.
  // Keep the supported endpoint only for tiny corrections with a clear body.
  if (p.grounded && Math.hypot(result.x - p.x, result.y - p.y) < Math.abs(p.x - from[0]) + .1 && !obstacles.some(b => overlaps(p.x, p.y, b))) {
    result.x = p.x; result.y = p.y
  }
  const floating = settledWeightless(p)
  const corrected = Math.hypot(result.x - p.x, result.y - p.y) > (collisionOutline ? 1e-7 : .01)
  p.x = result.x; p.y = result.y
  if (corrected) {
    if (p.mantle || p.hang) { p.mantle = null; p.hang = null; p.grabCooldown = .25 }
    p.anim.footwork = null
    for (const { normal, platform: b } of result.contacts) {
      // A glancing foot/corner contact must not turn downward speed into a
      // sideways launch. The vertical face arrests lateral movement only.
      // Every terrain encoding answers alike: a polygon's corner pushes the toe
      // bevel diagonally, so its wall is found from the corner on that bevel.
      const wall = collisionOutline?.(b) ? 0
        : !b.polygon && !b.profile ? p.y > b.y && p.y - TUNING.height < b.y + b.h ? p.x < b.x ? -1 : p.x > b.x + b.w ? 1 : 0 : 0
        : !b.looseProp ? toeCornerWall(b, from, p.x, p.y, normal, angle => canGrip(angle, surfaceFriction(b))) : 0
      const n = wall ? [wall, 0] : normal
      const into = p.vx * n[0] + p.vy * n[1]
      // A gliding body keeps pace with a prop moving away from it, rather than stopping as at a wall.
      const prop = b.looseProp && slickFooting(p) ? world.colliders.find(c => c.platform === b)?.prop : undefined
      const away = prop ? Math.min(0, prop.vx * n[0] + prop.vy * n[1]) : 0
      // Without weight a body that meets a surface too fast rebounds, slower than it came; a slow one stays against it.
      // Ground under the feet is a landing instead, which absorbs the hit in a crouch before the rebound (land()).
      const rebound = floating && away - into > TUNING.zeroGravityStick && n[1] > -.5 ? TUNING.zeroGravityRebound : 0
      if (into < away) { p.vx -= (into - away) * (1 + rebound) * n[0]; p.vy -= (into - away) * (1 + rebound) * n[1] }
    }
  }
  if (!p.climbing && !p.hang && !p.mantle && !p.releaseTurn) {
    const supportAcceleration = (p.gravity ?? TUNING.gravity) + (p.swimAcceleration ?? 0)
    let ground = supportAcceleration >= 0 ? groundAt(platforms, p.x, p.y, .2) : null
    const footing = !!ground && slipRests(ground.angle, surfaceFriction(ground.platform))
    let slope = result.contacts.map(c => ({ ...c, face: bodyContact(c.platform, p.x, p.y, c.normal,
      p.crouching ? TUNING.crouchHeight : TUNING.height, collisionOutline?.(c.platform)) })).find(c => {
      // A nearly vertical face is a wall contact. Solver-sized box tilts can
      // give it a tiny upward normal without making it a place to plant feet.
      if (c.face.ny >= -.01) return false
      // Gliding on frictionless footing, a prop's tilted face is something met, never a slope to slide on.
      if (c.platform.looseProp && slickFooting(p)) return false
      // A trailing foot can brush the bank while running off its lip. A
      // separating contact cannot capture the body into a downhill slide.
      if (p.coyote > 0 && !p.sliding?.active && !c.platform.looseProp && p.vx * c.face.nx + p.vy * c.face.ny > .1
        && platformLedges(c.platform).some(edge => edge.outwardSlope && c.face.nx * edge.side < 0
          && (edge.edgeX - p.x) * edge.side >= 0 && (edge.edgeX - p.x) * edge.side <= TUNING.width
          && p.y >= edge.edgeY && p.y < edge.edgeY + TUNING.height)) return false
      const angle = Math.atan2(c.face.nx, -c.face.ny), speed = p.vx * Math.cos(angle) + p.vy * Math.sin(angle)
      // Ground where a slip would come to rest ends it at once: the feet take hold and the
      // body lands with the speed it brought, as a fall onto that ground would. A steep face
      // the body is leaving cannot take that speed back, however much of the hull still
      // touches it. A face that would hold a standing body but cannot stop a moving one
      // carries the slip on.
      if (!canGrip(angle, surfaceFriction(c.platform))) return !(footing && p.vx * c.face.nx + p.vy * c.face.ny > .1)
      return !!p.sliding?.active && Math.abs(speed) > 1e-5 && !footing
    })
    const base = slope && !canGrip(Math.atan2(slope.face.nx, -slope.face.ny), surfaceFriction(slope.platform))
      ? groundAt(platforms, p.x, p.y, .3, s => canGrip(s.angle, surfaceFriction(s.platform))) ?? (!leavingGround ? previousGround : null) : null
    if (supportAcceleration >= 0 && slope && base && !leavingGround && (p.vx * slope.face.nx <= 0 || input.move * slope.face.nx < 0)
      && (p.grounded || previousGround || p.vx * Math.sin(base.angle) - p.vy * Math.cos(base.angle) <= .1)
    ) {
      const support = settleSlopeBase(p, base, Math.sign(slope.face.nx), platforms)
      if (support) { slope = undefined; ground = support }
    }
    if (slope && supportAcceleration >= 0) {
      const angle = Math.atan2(slope.face.nx, -slope.face.ny), tangent = [Math.cos(angle), Math.sin(angle)]
      let speed = p.vx * tangent[0] + p.vy * tangent[1]
      if (!p.sliding?.active) speed = slidingVelocity(speed - supportAcceleration * tangent[1] * dt, angle, supportAcceleration, dt, surfaceFriction(slope.platform))
      const contact = nearestBoundary(slope.platform, p.x, p.y)
      p.vx = tangent[0] * speed; p.vy = tangent[1] * speed
      // Presentation follows resolved slip, including abrupt braking at a
      // landing corner. It never feeds the friction or jump motor.
      const previousSpeed = p.sliding?.balanceSpeed ?? speed
      const balanceSpeed = previousSpeed + (speed - previousSpeed) * (1 - Math.exp(-dt / .08))
      p.sliding = { angle, amount: approach(p.sliding?.amount ?? 0, 1, dt / .12), time: (p.sliding?.time ?? 0) + dt, active: true, x: contact.x, y: contact.y, balanceSpeed,
        ...(slope.platform.frictionless ? { slick: true } : {}) }
      // A separate wall contact still owns its brace and release blend when a
      // moving slope briefly catches the feet in a narrow gap.
      p.grounded = false; p.coyote = 0; p.anim.footwork = null
    } else {
      if (p.sliding) { p.sliding.active = false; p.sliding.amount = Math.max(0, p.sliding.amount - dt / .12); if (!p.sliding.amount) p.sliding = null }
      // An uphill landing can have upward world velocity after the collision.
      // Support depends on separating from the surface, not on falling in world Y.
      if (ground && (!collisionOutline || !platforms.some(b => overlaps(p.x, ground!.y, b))) && canGrip(ground.angle, surfaceFriction(ground.platform)) && (p.grounded || p.vx * Math.sin(ground.angle) - p.vy * Math.cos(ground.angle) <= .1)) {
        if (!p.grounded && oldVy > 0) absorbLanding(p, oldVy)
        // Settling the last fraction onto a surface is still an arrival: a fast one without weight rebounds.
        if (!p.grounded && floating) absorbWeightlessArrival(p, oldVx, oldVy, ground.angle)
        p.grounded = true; p.vy = 0; p.groundAngle = ground.angle
        if (!platforms.some(b => overlaps(p.x, ground.y, b))) p.y = ground.y
      }
    }
  }
  if (p.waterMotion) p.wallBrace = null
  else updateCantedWallBrace(p, input.move, dt, platforms, result.contacts)
  if (p.wallBrace?.normal) tryWallJump(p, platforms)
  stepReleasedTurn(p, platforms, dt, orientationGravity)
  // Navigation's air brake is a velocity request, not a body turn. Contacts
  // still receive the full steering intent; resolve free-flight heading once
  // before the shared presentation observes the final orientation.
  if (flightFacing !== undefined && !p.grounded && !p.hang && !p.mantle && !p.climbing
    && !p.waterMotion && !p.releaseTurn && !p.wallBrace?.active && !p.wallJump && !p.shove) {
    p.facing = Math.abs(p.vx) > 60 ? Math.sign(p.vx) : flightFacing
  }
  const impact = p.freeFall?.recovery === 0 ? p.freeFall.impact : undefined
  if (impact && impact.vy > 1000 && p.freeFall!.amount > .35 && !p.waterMotion) {
    startImpactRagdoll(p, [impact.vx, impact.vy], 'landing')
  }
  finishPlayerStep(p, input, dt, world, from, verticalUsed, turnFrame, slideEntryFrame, frameDirection)
  settleOrQueue(p, dt, previousFacing)
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
    presentWaterOrQueue(p, dt)
  }
  if (gravityOverride === undefined) {
    finishGravityTurn(p); turnToGravity(p, orientationGravity); if (side || p.releaseTurn?.toWall !== undefined) turnToWall(p, side, gravity)
    if (settledWeightless(p)) orientInFlight(p, world, input)
  }
}

/** One step standing on, walking along or leaping from a wall: the ordinary controller in the wall's frame, with
 * the pull across the wall as its gravity and the pull along it acting on a free body. Ropes keep swinging in the
 * world meanwhile; ledges, ladders and ropes are not offered from a wall. */
function stepOnWall(p: Player, input: JumpInput, dt: number, climbables: ClimbableWorld, world: ContactWorld,
  gravityField: GravityField | undefined, side: number, gravity: number, options: PlayerStepOptions) {
  const wall = p.wall!
  if (climbables.ropes.length && options.advanceRopes !== false) {
    p.ropes ??= climbables.ropes.map(createRope)
    for (const rope of p.ropes) if (!options.ropeRiders?.some(r => r.climbing?.kind === 'rope' && r.climbing.rope === rope))
      stepRope(rope, dt, world.ropePlatforms ?? world.platforms, null, gravityField, 1, 1)
  }
  const [lateral, down] = vectorToWall(wall, side, gravity), local = turnContactWorld(world, wall)
  p.grabCooldown = Math.max(p.grabCooldown, dt * 1.5)
  inWallFrame(p, () => {
    if (!p.grounded) p.vx += lateral * dt
    stepPlayer(p, wallInput(input, wall), dt, local.platforms, NO_CLIMBABLES, { checkpoints: [], fallY: Infinity }, local, undefined, down, 1, undefined,
      { ...options, ropeRiders: undefined, ropeMates: undefined, water: undefined, advanceRopes: false, lateralGravity: lateral })
  })
  if (p.contacts) p.contacts = contactsToWorld(p.contacts, world, wall)
  finishGravityTurn(p)
  turnToWall(p, side, gravity)
  if (settledWeightless(p)) orientInFlight(p, world, input)
}

/** Turn a free body toward the footing a sideways pull calls for: onto a wall from the floor or a ceiling, off a wall
 * onto either, or to the opposite wall. A body the pull overpowers on its footing lifts off to turn; a hanging or
 * climbing body keeps its grip. Floor and ceiling hand over to each other through the ordinary turn (turnToGravity).
 * Turn angles are kept in the frame the turn starts in: a ceiling's reflected frame stores them negated. */
function turnToWall(p: Player, side: number, gravity: number) {
  const pull = wallForGravity(side, gravity, p.wall, TUNING.gravity * .05)
  if (pull === null) return
  const current: Footing = p.wall ?? (p.inverted ? 'ceiling' : 'floor')
  const wanted: Footing = pull ?? (gravity < 0 ? 'ceiling' : 'floor')
  const turn = p.releaseTurn
  if (turn?.toWall !== undefined) {
    // A turn under way follows the pull: if the pull that started it goes, the body turns back to its old footing,
    // and resumes if the pull returns. The frame changes only at the far end.
    const to: Footing = turn.toWall ?? 'floor'
    if (wanted === current) turn.target = 0
    else if (wanted === to) turn.target = footingTurn(current, to, p.facing)
    return
  }
  if (p.hang || p.mantle || p.climbing || p.waterMotion || wanted === current || current !== 'left' && current !== 'right' && wanted !== 'left' && wanted !== 'right') return
  const target = footingTurn(current, wanted, p.facing)
  if (turn) {
    // An ordinary half-turn caught by a sideways pull, which may leave no vertical pull to finish it: it becomes a turn
    // onto the wall from where it stands, at the solver's steady turning rate.
    Object.assign(turn, { target, toWall: wanted, span: Math.abs(target) }); delete turn.progress
    return
  }
  p.releaseTurn = { angle: 0, target, pose: animates(p) ? athletePose(p) : undefined, facing: p.facing, time: 0, progress: 0, toWall: wanted === 'floor' ? null : wanted, span: Math.abs(target) }
  p.anim.ragdoll = null
  p.grounded = false; p.coyote = 0
  p.anim.footwork = null; p.wallBrace = null; p.sliding = null; p.pushing = null; p.pushRig = null; p.ledgeReach = null
  p.freeFall = null; p.anim.dryTurn = null; p.anim.slideEntry = null
  p.contacts = null
}
/** Without weight, a body drifting toward a surface it will reach soon swings feet-first to meet it: onto that floor,
 * wall or ceiling as its footing, by the same released turn a pull would start, pivoting about the body's middle. */
/** A slow weightless drift with no thrust settles to rest instead of creeping on for seconds. */
function restDrag(p: Player, input: JumpInput, frameDirection: number) {
  if (!settledWeightless(p)) return 0
  const [dx, dy] = floatDirection(input, frameDirection)
  return dx || dy ? 0 : TUNING.zeroGravityRestDrag * Math.max(0, 1 - Math.hypot(p.vx, p.vy) / TUNING.zeroGravityRestSpeed)
}
/** Weightless legs are a critically damped spring: this stiff (rad/s) for a crouch asked for or let go, folding most
 * of the way in 0.2 s; an absorbing hit uses 1/zeroGravityAbsorbTime, so the fold bottoms out at that time. */
const WEIGHTLESS_CROUCH_SPRING = 20
/** How far a full crouch lowers the hip toward the feet (locomotionPose.ts), and the seconds the legs push for. */
const CROUCH_DIP = 13.4, REBOUND_PUSH_TIME = .05
/** A weightless hit at this speed (px/s) into a surface folds the legs to ABSORB_DEEPEST of a full crouch. */
const ABSORB_FULL_SPEED = 240, ABSORB_DEEPEST = .97
function springCrouch(p: Player, dt: number) {
  const absorbing = !!p.rebound && p.grounded, spring = absorbing ? 1 / TUNING.zeroGravityAbsorbTime : WEIGHTLESS_CROUCH_SPRING
  const target = absorbing ? 0 : Number(p.crouching)
  let rate = p.crouchRate ?? 0
  // Pushing off, the legs straighten against the surface, driving the hip away ever faster until it leaves at the
  // rebound's speed (stepPlayer).
  if (absorbing && p.rebound!.push !== undefined) rate = -p.rebound!.speed / CROUCH_DIP * Math.min(1, (p.rebound!.push + dt) / REBOUND_PUSH_TIME)
  else rate += (spring * spring * (target - p.crouch) - 2 * spring * rate) * dt
  p.crouch += rate * dt
  if (p.crouch >= 1 && rate > 0 || p.crouch <= 0 && rate < 0) { p.crouch = Math.max(0, Math.min(1, p.crouch)); rate = 0 }
  p.crouchRate = rate
}
/** How strongly the boots are drawn puffing while they trim a slow drift, against 1 for full thrust. */
const TRIM_PUFF = .35
/** Feet within this reach of a surface, and not leaving it, drift onto it at this speed. */
const FEET_SETTLE_REACH = 3, FEET_SETTLE_SPEED = 25
/** Too fast to stay without weight: the legs flex into a crouch to absorb the arrival, then push back off, slower. */
/** `late`: the seconds of this step the legs' spring has already been stepped for (a landing found after it), which
 * the fold makes up at once. */
function absorbWeightlessArrival(p: Player, vx: number, vy: number, angle: number, late = 0) {
  // Measured across the surface, which may slope; the push back off leaves straight out from it.
  const into = vy * Math.cos(angle) - vx * Math.sin(angle)
  if (into > TUNING.zeroGravityStick) {
    // The knees give at once, carrying the arrival on into the fold rather than locking as the feet touch.
    p.rebound = { speed: into * TUNING.zeroGravityRebound, time: 0, angle }; p.crouching = true
    // The fold's depth grows with the hit, to nearly a full crouch from ABSORB_FULL_SPEED; the spring, struck at the
    // rate that reaches it, gets there in zeroGravityAbsorbTime whatever the depth.
    const depth = Math.min(ABSORB_DEEPEST, into / ABSORB_FULL_SPEED)
    p.crouchRate = Math.max(p.crouchRate ?? 0, depth * Math.E / TUNING.zeroGravityAbsorbTime)
    // The fold starts in the step the feet touch, so the body never stops dead for a frame before it sinks.
    p.crouch = Math.min(1, p.crouch + p.crouchRate * late)
  }
}
/** Weightless long enough for zero-g handling (TUNING.zeroGravitySettle), as of this step's motion. */
const settledWeightless = (p: Player) => (p.weightless ?? 0) >= TUNING.zeroGravitySettle - 1e-9
function orientInFlight(p: Player, world: ContactWorld, input: JumpInput) {
  if (p.grounded || p.hang || p.mantle || p.climbing || p.waterMotion) return
  const roll = p.releaseTurn
  if (roll && roll.float === undefined) return
  const speed = Math.hypot(p.vx, p.vy)
  if (speed < 20) return
  // Held boots push the body along its travel (or brake it), so it arrives sooner (or later) than a coast would.
  const [tx, ty] = floatDirection(input, 1), along = (tx * p.vx + ty * p.vy) / speed
  const push = TUNING.zeroGravityThrust * along * (along < 0 ? TUNING.zeroGravityBrake : 1)
  const wanted = surfaceAhead(p, world, speed)
  const arrival = wanted && weightlessArrivalTime(wanted.travel, speed, push)
  if (roll) {
    // A roll toward a surface the body no longer reaches (steered away, or slowed by the air) turns back; one that
    // has met it carries on, pivoting onto the feet against it.
    if (roll.target && (!wanted || arrival === Infinity)) { if (!touching(p, world, roll.toward)) roll.target = 0; return }
    // One the body will reach sooner than planned hurries to finish first, rather than meeting it mid-roll.
    const left = 1 - (roll.progress ?? 1), time = (arrival ?? Infinity) - FLOAT_ROLL_MARGIN
    if (roll.target && left > 0 && roll.duration && left * roll.duration > time) roll.duration = Math.max(FLOAT_ROLL_FASTEST, time / left)
    return
  }
  const current: Footing = p.wall ?? (p.inverted ? 'ceiling' : 'floor')
  if (!wanted || arrival === null || wanted.footing === current) return
  // Time the roll to finish with a little travel left to land on.
  const duration = arrival - TUNING.zeroGravityRollLead
  if (duration > TUNING.zeroGravityRollMax) return
  const target = footingTurn(current, wanted.footing, p.facing)
  // The roll starts from the drawn lean and keeps the float posture: one smooth turn, not a turn plus a straightening.
  // The body's hull turns the short way; a body drawn head-first for the surface flips forward instead (`over`).
  const { pose, lean, bend, spin, over } = captureFloatTurn(p, target)
  p.releaseTurn = { angle: 0, target, pose, facing: p.facing, time: 0, progress: 0,
    duration: Math.max(Math.min(TUNING.zeroGravityRollMin, arrival - FLOAT_ROLL_MARGIN), FLOAT_ROLL_FASTEST, duration),
    toWall: wanted.footing === 'floor' ? null : wanted.footing, span: Math.abs(target), float: lean, bend, spin, over, toward: wanted.normal }
  p.anim.ragdoll = null; p.wallBrace = null; p.anim.dryTurn = null; p.anim.slideEntry = null; p.contacts = null
}
/** A late roll still finishes this long before contact, and none is quicker than FLOAT_ROLL_FASTEST seconds. */
const FLOAT_ROLL_MARGIN = .06, FLOAT_ROLL_FASTEST = .18
/** The surface a coasting weightless body is heading for, the footing it gives, and how far the body travels until
 * it would meet it feet-first: its body axis across the surface, half its height from its middle. */
function surfaceAhead(p: Player, world: ContactWorld, speed: number): { footing: Footing; travel: number; normal: [number, number] } | null {
  const horizon = TUNING.zeroGravityRollMax + TUNING.zeroGravityRollLead
  const reach = speed * horizon + TUNING.height + 40, ux = p.vx / speed, uy = p.vy / speed
  const body = playerContactBody(p), orientation = p.inverted ? -1 : 1, angle = playerTurnAngle(p)
  const probe = moveBody([body.x, body.y], [body.x + ux * reach, body.y + uy * reach], world.platforms, body.height,
    orientation, angle, body.outline)
  let ahead: readonly [number, number] | null = null
  for (const contact of probe.contacts) if (contact.normal[0] * ux + contact.normal[1] * uy < -.3 && !contact.platform.looseProp
    && (!ahead || contact.normal[0] * ux + contact.normal[1] * uy < ahead[0] * ux + ahead[1] * uy)) ahead = contact.normal as [number, number]
  if (!ahead) return null
  const [nx, ny] = ahead, square = -(ux * nx + uy * ny)
  // The sweep slides on along the surface after meeting it; the gap across the surface is exact.
  const gap = (body.x - probe.x) * nx + (body.y - probe.y) * ny
  // The hull as it is now reaches `extent` toward the surface from the body's middle; feet-first it reaches half its
  // height, so the feet-first meeting comes that much sooner or later than this hull's.
  const hull = bodyPolygon(body.x, body.y, body.height, orientation, angle, body.outline)
  const middle = hull.reduce((sum, [x, y]) => [sum[0] + x / hull.length, sum[1] + y / hull.length], [0, 0])
  const extent = Math.max(...hull.map(([x, y]) => -((x - middle[0]) * nx + (y - middle[1]) * ny)))
  return { footing: Math.abs(ny) >= Math.abs(nx) ? ny < 0 ? 'floor' : 'ceiling' : nx > 0 ? 'left' : 'right',
    travel: Math.max(0, gap + extent - TUNING.height / 2) / square, normal: [nx, ny] }
}
/** Whether the body, as it is turned now, is against a surface facing `normal`. */
function touching(p: Player, world: ContactWorld, normal: readonly [number, number] | undefined) {
  if (!normal) return false
  const body = playerContactBody(p)
  const probe = moveBody([body.x, body.y], [body.x - normal[0] * 4, body.y - normal[1] * 4], world.platforms, body.height,
    p.inverted ? -1 : 1, playerTurnAngle(p), body.outline)
  return probe.contacts.some(contact => contact.normal[0] * normal[0] + contact.normal[1] * normal[1] > .7)
}
type Footing = 'floor' | 'ceiling' | 'left' | 'right'
/** The released-turn target from one footing to another, in the starting frame's stored convention. */
function footingTurn(from: Footing, to: Footing, facing: number) {
  const wallAngle = (w: Footing) => wallFrameAngle(w === 'left' || w === 'right' ? w : undefined)
  if (from === 'floor' && to === 'ceiling' || from === 'ceiling' && to === 'floor') return facing * Math.PI
  if (from === 'floor') return wallAngle(to)
  if (from === 'ceiling') return -wallAngle(to)
  if (to === 'floor') return -wallAngle(from)
  if (to === 'ceiling') return wallAngle(from)
  return facing * Math.PI
}

/** The screen direction held while weightless, as a unit vector in the controller's frame (zero when none). */
function floatDirection(input: JumpInput, frameDirection: number) {
  const down = !!(input.descend ?? (input.drop && !input.detach))
  const x = Math.max(-1, Math.min(1, input.move)), y = ((down ? 1 : 0) - (input.climb ? 1 : 0)) * frameDirection
  const length = Math.hypot(x, y)
  return length > .01 ? [x / Math.max(1, length), y / Math.max(1, length)] as const : [0, 0] as const
}
/** Without weight, jumping pushes off every surface the body touches: floor, wall, ceiling or a corner between them.
 * The push leaves along their combined normal, leaning toward a held direction that does not point into them, and keeps
 * the drift along the surface. Returns whether there was anything to push from. */
function pushOff(p: Player, input: JumpInput, platforms: readonly Platform[], height: number, frameDirection: number, speed: number = TUNING.zeroGravityPushOff) {
  let nx = 0, ny = 0
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
    const probe = moveBody([p.x, p.y], [p.x + dx * 1.5, p.y + dy * 1.5], platforms, height, 1, playerTurnAngle(p))
    for (const contact of probe.contacts) if (contact.normal[0] * dx + contact.normal[1] * dy < -.5) { nx += contact.normal[0]; ny += contact.normal[1] }
  }
  const length = Math.hypot(nx, ny)
  if (length < .5) return false
  nx /= length; ny /= length
  const [hx, hy] = floatDirection(input, frameDirection)
  if ((hx || hy) && hx * nx + hy * ny > -.01) { const bx = nx + hx, by = ny + hy, b = Math.hypot(bx, by); nx = bx / b; ny = by / b }
  const along = p.vx * -ny + p.vy * nx
  p.vx = nx * speed - ny * along; p.vy = ny * speed + nx * along
  p.grounded = false; p.coyote = 0; p.buffer = 0; p.wallJumpBuffer = 0; p.jumpStrength = undefined; p.jumpLift = null
  p.wallJump = null; p.wallBrace = null; p.pushing = null; p.pushRig = null; p.ledgeReach = null; p.anim.footwork = null
  if (p.sliding) p.sliding.active = false
  delete p.rebound; p.crouching = false
  p.freeFall = null; p.anim.ragdoll = null; p.grabCooldown = Math.max(p.grabCooldown, .2)
  p.jumpStart = p.y; p.jumpHeight = 0
  return true
}
/** Feet on frictionless terrain, standing or sliding: a collision there is a glide meeting something, not a walk into it. */
const slickFooting = (p: Player) => p.grounded ? !!p.contacts?.support?.platform.frictionless : !!p.sliding?.active && !!p.sliding.slick
/** The speed a gliding body keeps when it catches a loose prop sliding the same way: the prop's own. */
function glidingBehind(p: Player, world: ContactWorld, b: Platform, direction: number) {
  if (!b.looseProp || !slickFooting(p)) return 0
  const prop = world.colliders.find(c => c.platform === b)?.prop
  return prop && prop.vx * direction > 0 ? prop.vx : 0
}

/** Free bodies prepare gravity-facing feet in the air. The shared released-turn
 * solver checks the rotated arc and waits wherever solid geometry blocks it. */
function turnToGravity(p: Player, gravity: number, pose?: AthletePose) {
  if (Math.abs(gravity) <= TUNING.gravity * .05 || p.grounded || p.hang || p.mantle || p.climbing || p.releaseTurn || p.waterMotion || p.wallBrace?.active
    || (gravity < 0) === !!p.inverted) return
  p.releaseTurn = { angle: 0, target: p.facing * Math.PI, pose: pose ?? (animates(p) ? athletePose(p) : undefined), facing: p.facing, time: 0, progress: 0 }
  // The turn now owns the outgoing rig, including any loose impact joints.
  // Do not apply recoil again before the next controller tick releases it.
  p.anim.ragdoll = null
  p.grounded = false; p.coyote = 0
  p.anim.footwork = null; p.wallBrace = null; p.sliding = null; p.pushing = null; p.pushRig = null; p.ledgeReach = null
  p.freeFall = null; p.anim.dryTurn = null; p.anim.slideEntry = null
  p.contacts = null
}

/** All movement modes publish contacts and advance presentation once, after
 * their final world position is known, including an authored level exit. */
export function finishPlayerStep(p: Player, input: JumpInput, dt: number, world: ContactWorld, from: readonly [number, number], verticalUsed = false, turnFrame?: DryTurnFrame | null, slideEntryFrame?: SlideEntryFrame | null, frameDirection = 1) {
  const size = bodySize(p)
  if (size !== 1) {
    // A larger body animates in its frame, as it steps (sizeFrame.ts).
    const scaled = scaledContactWorld(world, size), frame = enterSizeFrame(p, size, true, scaled)
    p.size = 1
    try { finishPlayerStep(p, input, dt, scaled, [from[0] / size, from[1] / size], verticalUsed, turnFrame, slideEntryFrame, frameDirection) }
    finally { p.size = size; leaveSizeFrame(p, frame, true, world) }
    return
  }
  const rawFrom = from
  const contacts = playerContacts(p, input, world, dt)
  const carrier = contacts.support?.collider.robot
  if (carrier) {
    const dx = carrier.vx * dt, dy = dx * Math.tan(contacts.support!.angle)
    translateFeet(p, dx, dy)
    from = [from[0] + dx, from[1] + dy]
  }
  contacts.motion = { x: p.x - from[0], y: p.y - from[1], speed: Math.hypot(p.x - from[0], p.y - from[1]) / dt }
  // Presented push preparation is solved before the contacts are published,
  // as it always was, when animating every step.
  const preparation = cadence(p) === 'tick' ? preparePush(p, input, world, contacts) : undefined
  updatePushRig(p, contacts.push ?? null, dt, contacts.motion.speed, [contacts.motion.x, contacts.motion.y])
  if (preparation !== undefined) presentPush(p, contacts, preparation, dt)
  // A rolling ball remains an obstruction for the motor, but the published
  // working contacts and rig must release once the shove supplies no force.
  p.contacts = contacts.push?.passive ? { ...contacts, push: null } : contacts
  advanceWaterCamera(p, input, dt)
  // Residual drift is not steering; only an actual step starts the faster get-up.
  if (Math.abs(input.move) > .01 && Math.abs(contacts.motion.x) > .05 && p.grounded && p.freeFall && p.freeFall.recovery !== null) p.freeFall.getUp ??= 0
  animateOrQueue(p, { input, dt, world, from, contacts, verticalUsed, frameDirection, turnFrame: turnFrame ?? null, slideEntryFrame: slideEntryFrame ?? null }, rawFrom)
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
    const braced = ledgeBraced(platforms, edge.edgeX, edge.edgeY, edge.side, edge.outwardSlope)
    const landing = ledgeLanding(platforms, edge, braced, platforms, p.crouching)
    if (landing) return { ...edge, braced, ...landing }
  }
  return null
}
export function verticalClimbOption(p: Player, climbables: ClimbableWorld, platforms: readonly Platform[], vertical: number, frameDirection = 1, decks = platforms) {
  if (p.hang || p.climbing || p.mantle || p.releaseTurn || p.grabCooldown !== 0 || !vertical) return null
  const found = findClimbable(p, climbables, platforms)
  if (!found || found.rope && p.grounded && vertical * frameDirection < 0) return null
  if (found.ladder && p.grounded) {
    const localVertical = vertical * frameDirection
    const top = ladderFooting(found.ladder, platforms, decks)?.y ?? found.ladder.top
    if (localVertical > 0 && p.y <= top + 1 || localVertical < 0 && p.y >= found.ladder.bottom - 1) return null
    const floor = localVertical < 0 ? groundAt(platforms, found.ladder.x, p.y, 1) : null
    // Do not lower into a dead end inside the floor we are already standing on.
    // A rider arriving from above can still stop at a buried end and retreat.
    if (floor && overlaps(found.ladder.x, found.ladder.bottom, floor.platform, TUNING.crouchHeight)) return null
  }
  if (found.ladder && !p.grounded && p.y < (ladderFooting(found.ladder, platforms, decks)?.y ?? -Infinity)) return null
  return found
}

/** Ladders are foreground passages through terrain, never through mechanisms or actors. */
function ladderObstacles(world: ContactWorld) {
  return world.colliders.filter(c => !c.id.startsWith('terrain:')).map(c => c.platform)
}

function ladderFooting(ladder: Ladder, platforms: readonly Platform[], decks = platforms) {
  return ladderLanding(ladder, decks, platforms)
}
/** The platforms a ladder can lead to. A robot or person on the ladder is a
 * body to stop against (ladderObstacles), never its top deck: counting a
 * robot's head as the landing pulled a climber above it down onto the robot.
 * A body standing on the deck still takes its room (ladderFooting). */
function ladderDecks(platforms: readonly Platform[], world: ContactWorld) {
  const bodies = new Set(world.colliders.flatMap(c => c.robot || c.id === 'player' ? [c.platform] : []))
  return bodies.size ? platforms.filter(platform => !bodies.has(platform)) : platforms
}

function leaveLadder(p: Player, ground: GroundSurface | null, crouching = false) {
  p.climbing = null; p.grabCooldown = .25; p.grounded = !!ground
  p.crouching = crouching; p.crouch = Number(crouching)
  if (ground) p.y = ground.y
  p.vx = 0; p.vy = 0; p.groundAngle = ground?.angle ?? 0; p.coyote = ground ? TUNING.coyoteTime : 0
  p.anim.gait = gaitPose(0); cancelJumpInput(p)
}
function stepMotion(p: Player, input: JumpInput, dt: number, platforms: readonly Platform[], climbables: ClimbableWorld, rules: LevelRules,
  world: ContactWorld, contacts: PlayerContacts, gravityField?: GravityField, frameDirection = 1, floatDrag = 0, swimStrength = 0, swimDepth = 0, orientationGravity = p.gravity ?? TUNING.gravity, options: PlayerStepOptions = {}) {
  const gravity = p.gravity ?? TUNING.gravity
  const weightFree = isWeightless(Math.hypot(gravity, options.lateralGravity ?? 0)) && !swimStrength
  p.weightless = weightFree ? (p.weightless ?? 0) + dt : 0
  // Device directions remain screen-relative; posture and ledge motions run
  // in this controller's gravity frame. Ropes and swimming retain screen input.
  const screenDown = !!(input.descend ?? (input.drop && !input.detach))
  const bodyClimb = frameDirection > 0 ? input.climb : screenDown
  const bodyDescend = frameDirection > 0 ? screenDown : input.climb
  const bodyDrop = bodyDescend || input.detach || input.drop && !screenDown
  const bodyCrouch = wantsCrouch(input, frameDirection < 0)
  p.ladderJumpGrace = p.grounded || p.hang || p.mantle || p.climbing || input.detach
    ? 0 : Math.max(0, p.ladderJumpGrace - dt)
  p.airBoost.x = 0; p.airBoost.lift = 0; p.airBoost.time += dt; p.airBoost.trim = false
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
  const towardLedge = bodyClimb && !bodyDescend
  const surfaceExit = towardLedge && !input.jump && !input.detach ? findRopeStepUp(p, world) : null
  if (climbables.ropes.length) {
    p.ropes ??= climbables.ropes.map(createRope)
    // A rider's body is held off terrain, not off other moving bodies, which only stop its climbing.
    const ropeRiderTerrain = ropeBodyTerrain(platforms, world)
    if (options.advanceRopes !== false) for (const [i, rope] of p.ropes.entries()) {
      const rider = p.climbing?.kind === 'rope' && p.climbing.index === i ? p
        : options.ropeRiders?.find(r => r.climbing?.kind === 'rope' && r.climbing.index === i && !!r.inverted === !!p.inverted)
      const grip = rider?.climbing
      // A larger rider's rope swings as it would in that rider's frame: its gravity is the rider's size times (sizeFrame.ts).
      const scale = grip && rider ? bodySize(rider) : 1
      stepRope(rope, dt, world.ropePlatforms ?? platforms, grip && rider ? { distance: grip.distance, move: grip.wall ? 0 : grip.swing,
        wall: grip.wall, bracing: ease(grip.time / .25),
        body: { climb: grip, from: [rider.x, rider.y], facing: rider.facing, rider, ...(world.ropePlatforms ? { platforms: rider === p ? ropeRiderTerrain : rider.terrain?.filter(b => !terrainBodies.get(rider)?.has(b)) ?? ropeRiderTerrain } : {}) },
        gravity: (rider.gravity ?? gravity) * 1400 / TUNING.gravity * scale } : null, gravityField, frameDirection, scale)
    }
  }
  if (p.hang || p.mantle || p.climbing) { p.wallBrace = null; p.pushing = null; p.pushRig = null; p.crouching = !!p.mantle?.crouched; p.crouch = Number(p.crouching); p.reach = 0; p.anim.footwork = null; p.ledgeReach = null; p.landing = 0 }
  if (p.mantle) {
    const m = p.mantle
    if (m.ladder) {
      const oldTime = m.time, oldX = p.x, oldY = p.y, before = playerContactBody(p)
      if (bodyDrop) m.returning = true
      else if (bodyClimb) m.returning = false
      m.time = Math.max(-LEDGE_CATCH_TIME, Math.min(LEDGE_CLIMB_TIME, m.time + (m.returning ? -dt : dt)))
      const progress = ladderMantleProgress(m.time, m.ladder.entry), frame = climbFrame(progress)
      const catchBlend = ease((m.time + LEDGE_CATCH_TIME) / LEDGE_CATCH_TIME)
      p.x = m.edgeX; p.y = m.ladder.y + (m.edgeY + frame.root[1] - m.ladder.y) * catchBlend
      const after = playerContactBody(p)
      const safe = moveBody([before.x, before.y], [after.x, after.y], ladderObstacles(world), after.height)
      if (Math.hypot(safe.x - after.x, safe.y - after.y) > .01) {
        m.time = oldTime; p.x = oldX; p.y = oldY
      }
      p.vx = 0; p.vy = 0
      if (m.time === -LEDGE_CATCH_TIME && m.returning) {
        p.climbing = m.ladder.climb; p.climbing.time = Math.max(.16, p.climbing.time)
        p.x = m.ladder.x; p.y = m.ladder.y; p.mantle = null
      } else if (m.time === LEDGE_CLIMB_TIME) {
        p.mantle = null; leaveLadder(p, groundAt(platforms, p.x, m.toY, .2))
      }
      return
    }
    if (!m.step && !m.descending && bodyDrop) m.returning = true
    if (m.step && !m.step.climbing && m.step.rise > 20.01 && !stepUpCommitted(m, world)
      && (input.move * m.side < -.1 || bodyDrop)) m.returning = true
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
        p.groundAngle = ground?.angle ?? 0; p.anim.stride = source.anim.stride; p.anim.gait = source.anim.gait; p.anim.footwork = source.anim.footwork ?? null
        p.pushing = source.pushing ?? null; p.pushRig = source.pushRig ?? null; p.anim.dryTurn = source.anim.dryTurn ?? null
        p.grabCooldown = .25; p.stepIntent = null
        if (m.step.jumpQueued && ground) launch(p)
        return
      }
      if (progress === 1) {
        p.mantle = null; p.grounded = true; p.coyote = TUNING.coyoteTime; p.groundAngle = m.step.landingAngle ?? 0; p.anim.stride = 0; p.anim.gait = gaitPose(0)
        if (m.step.climbing) p.grabCooldown = .35
        p.vx = input.move * m.side > .1 ? m.step.caught.vx : 0
        finishStepFeet(p, m.step)
        if (m.step.jumpQueued) launch(p)
      }
      return
    }
    const progress = Math.min(1, Math.max(0, (m.time - (m.descending ? LEDGE_CATCH_TIME : 0)) / LEDGE_CLIMB_TIME))
    const t = m.descending ? 1 - progress : progress, pose = climbFrame(t, m.braced, m.slope, m.crouched, m.inset, m.outwardSlope)
    p.x = m.edgeX + pose.root[0] * m.side; p.y = m.edgeY + pose.root[1]; p.vx = 0; p.vy = 0; p.facing = m.side
    if (m.descending && m.time < LEDGE_CATCH_TIME) {
      const blend = ease(m.time / LEDGE_CATCH_TIME)
      p.x = m.descending.caught.x + (p.x - m.descending.caught.x) * blend
      p.y = m.descending.caught.y + (p.y - m.descending.caught.y) * blend
    }
    if (m.returning && m.time === 0) {
      p.hang = { platform: m.platform ?? -1, edgeX: m.edgeX, edgeY: m.edgeY, side: m.side, slope: m.slope, outwardSlope: m.outwardSlope, time: 1, swayFrom: 1, queued: false, braced: m.braced, dropLocked: true,
        caught: { x: p.x, y: p.y, vx: 0, vy: 0, anim: { stride: 0, gait: p.anim.gait }, ledgeReach: null } }
      p.mantle = null; return
    }
    if (progress === 1 && m.descending) {
      const c = m.descending.climbable
      const hang: NonNullable<Player['hang']> = { platform: m.descending.platform, side: m.side, edgeX: m.edgeX, edgeY: m.edgeY, slope: m.slope, outwardSlope: m.outwardSlope, time: 1, swayFrom: 1, queued: false, braced: m.braced, dropLocked: true,
        caught: { x: p.x, y: p.y, vx: 0, vy: 0, anim: { stride: 0, gait: p.anim.gait }, ledgeReach: null } }
      if (c) {
        c.caught = { x: p.x, y: p.y, vx: 0, vy: 0, anim: { stride: 0, gait: p.anim.gait, footwork: null }, grounded: false, hang }
        c.time = 0; if (c.ladder) c.distance = 18; updateRopeWall(c, platforms); p.climbing = c
      } else p.hang = hang
      p.mantle = null
    } else if (progress === 1) {
      p.x = m.toX; p.y = m.toY; p.mantle = null; p.grounded = true; p.coyote = TUNING.coyoteTime; p.anim.stride = 0
      p.groundAngle = Math.atan((m.slope ?? 0) * m.side)
      p.anim.gait = gaitPose(0)
    }
    return
  }
  const verticalIntent = Number(input.climb) - Number(input.descend ?? (input.drop && !input.detach))
  const vertical = input.jump ? 0 : verticalIntent
  const bodyVertical = vertical * frameDirection
  const requestedClimb = verticalIntent !== 0 && (!input.jump || !p.grounded)
  const climbOption = requestedClimb ? verticalClimbOption(p, climbables, platforms, verticalIntent, frameDirection, ladderDecks(platforms, world)) : null
  if (!climbOption?.ladder && p.grounded && !p.hang && !p.climbing && bodyVertical < 0 && !input.jump && !input.detach && p.grabCooldown === 0) {
    // Lower over the edge first, then transfer to a nearby ladder or rope.
    const edge = loweringOption(p,platforms)
    if (edge) {
      const { crouched, inset, braced } = edge
      const caught = { x: p.x, y: p.y, vx: p.vx, vy: p.vy, anim: { stride: p.anim.stride, gait: p.anim.gait, footwork: p.anim.footwork, ragdoll: p.anim.ragdoll, dryTurn: p.anim.dryTurn }, grounded: p.grounded, crouching: p.crouching, crouch: p.crouch, facing: p.facing, freeFall: p.freeFall,
        ...(p.heldTool ? { heldTool: structuredClone(p.heldTool) } : {}) }
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
      p.facing = edge.side; p.grounded = false; p.vx = 0; p.vy = 0; p.coyote = 0; p.anim.footwork = null; p.pushing = null; p.pushRig = null
      cancelJumpInput(p); return
    }
  }
  if (!p.hang && !p.climbing && p.grabCooldown === 0 && !input.detach && (requestedClimb || !p.grounded)) {
    const pose = p.releaseTurn ? gameplayPose(p) : null
    const point = ([x, y]: readonly [number, number]): [number, number] => [p.x + x * p.facing, p.y + y]
    const found = pose ? findRope(p, platforms, { hands: [pose.frontArm.end, pose.backArm.end].map(point), shoulder: point(pose.shoulder) })
      : requestedClimb ? climbOption : findRope(p, platforms)
    if (found) {
      if (p.releaseTurn && found.rope) {
        found.turn = { angle: p.releaseTurn.angle, target: p.releaseTurn.target, grip: found.distance }
        found.hangBlend = 1
        delete p.releaseTurn
      }
      p.climbing = found
      updateRopeWall(found, platforms)
      if (found.wall) p.facing = found.wall.side
      if (found.ladder) {
        p.facing = ladderLedge(found.ladder, platforms)?.side ?? found.ladder.side
      }
      if (found.rope) ropeImpulse(found.rope, found.distance, p.vx, p.vy, dt)
      p.grounded = false; p.anim.footwork = null; p.ledgeReach = null; p.coyote = 0; cancelJumpInput(p)
      // Catching consumes the current jump press; release and press again to jump off.
      p.jumpHeld = input.jump
      return
    }
  }
  if (p.climbing) {
    const c = p.climbing, oldX = p.x, oldY = p.y
    const jumping = pressed
    const previousClimb = { ...c, ...(c.turn ? { turn: { ...c.turn } } : {}), ...(c.holds ? { holds: c.holds.map(h => ({ ...h })) } : {}) }
    c.time += dt
    const screenVertical = c.rope ? vertical * frameDirection : vertical
    const turning = !!c.rope && ropeWantsTurn(c, orientationGravity)
    // On a tied rope, Left/Right carries the robot along the flatter spans and Up/Down climbs the steeper ones.
    const tied = !!c.rope?.definition.end && !turning && !c.wall
    const shimmy = tied && updateRopeShimmy(c), traversing = shimmy && Math.abs(input.move) > .1
    let materialVertical = c.rope ? traversing ? ropeShimmyDirection(c, input.move)
      : tied && !ropeClimbable(c) ? 0 : ropeScreenDirection(c, vertical, frameDirection) : bodyVertical
    // A super-strong robot travels every rope by its arms alone. It hangs below its hands, seen side-on, its
    // hands going hand over hand while the body glides, and faces the way it goes across the screen; climbing
    // a rope that runs straight up and down, it keeps its facing. To shimmy back the other way it first brakes
    // to a stop and turns about beneath its hands, its back to the camera midway, then sets off. Climbing on
    // where the rope leans the other way, it turns about on the rope as it climbs, without stopping.
    // Braking to a stop, it still faces the way it is carried.
    const travelDirection = materialVertical || (c.rope ? -Math.sign(c.travelSpeed ?? 0) : 0)
    const heading = !c.rope || !travelDirection || turning || c.wall ? 0
      : traversing ? Math.sign(input.move) : ropeTravelFacing(c, travelDirection, p.facing)
    const reversing = !!heading && heading !== p.facing, settled = (c.shimmyBlend ?? 0) <= .08
    if (c.rope) c.pivot = approach(c.pivot ?? 1, reversing && !traversing ? 0 : 1, dt / ROPE_PIVOT)
    if (c.rope) c.turningBack = reversing && traversing && !settled
    if (reversing && traversing && !settled) materialVertical = 0
    else if (heading && (!reversing || traversing || settled || (c.pivot ?? 1) <= 0)) faceAlongRope(p, c, heading)
    const handOverHand = !!c.rope && !!materialVertical
    if (c.rope) {
      c.shimmyBlend = approach(c.shimmyBlend ?? 0, Number(handOverHand), dt / .2); stepRopeSetback(c, p.facing, dt)
      // Holding Left or Right fully, the robot builds into a swinging run over about a second; easing off,
      // stopping or turning back drops it to the careful pace.
      const running = traversing && Math.abs(input.move) > .9 && !!materialVertical
      // A short or gentle shimmy keeps the careful gait: the run only starts after half a second of travel.
      c.runFor = running ? (c.runFor ?? 0) + dt : 0
      c.pace = approach(c.pace ?? 0, Number(c.runFor > .5), dt / (running ? .9 : .3))
      // Shimmying hangs the body as on a level rope, so the head stays clear below the rope even on a slope.
      const vertical = traversing ? 0 : ropeVerticality(c)
      c.ropeVertical = (c.ropeVertical ?? vertical) + (vertical - (c.ropeVertical ?? vertical)) * (1 - Math.exp(-dt / .15))
    }
    c.screenDirection = vertical
    c.direction = turning ? 0 : materialVertical
    c.wallCooldown = Math.max(0, (c.wallCooldown ?? 0) - dt)
    const wall = c.wall
    if (wall && c.rope && !traversing && !input.jump && !jumping && !input.detach && input.move * wall.side < -.1) {
      // A single leg push starts the swing; holding away cannot pin the rope out.
      const grip = ropePoint(c.rope, c.distance), previous = ropePoint(c.rope, c.distance, true)
      ropeImpulse(c.rope, c.distance, (grip[0] - previous[0]) / dt - wall.side * 180 * Math.abs(input.move), (grip[1] - previous[1]) / dt, dt)
      c.wallCooldown = .35
    }
    if (turning) c.wall = undefined
    // The feet brace on terrain, never on another moving body.
    else updateRopeWall(c, c.rope ? ropeBodyTerrain(platforms, world) : platforms, traversing ? 0 : input.move, [p.x, p.y])
    c.wallPose = c.wall ?? wall ?? c.wallPose
    // Unbrace gradually where a wall becomes a slope, without jerking the grip upward.
    c.wallBlend = approach(c.wallBlend ?? Number(!!wall), Number(!!c.wall), dt / (c.surfaceSupport ? .4 : .22))
    if (!c.wallBlend) c.wallPose = undefined
    c.rappelPull = approach(c.rappelPull ?? 0, Number(!!c.wall && c.direction > 0), dt / .18)
    c.rappelMotion = approach(c.rappelMotion ?? 0, Number(!!c.wall && vertical !== 0), dt / .16)
    if (c.wall) { faceAlongRope(p, c, c.wall.side); c.swing = 0 }
    // Shimmying spends Left/Right on travel, so it neither pumps a swing nor leans.
    c.swing += ((c.rope && !c.wall && !traversing ? input.move : 0) - c.swing) * (1 - Math.exp(-dt / .2))
    c.lean += ((c.rope && !c.wall && !c.direction && !turning && !traversing ? input.move : 0) - c.lean) * (1 - Math.exp(-dt / (c.direction ? .14 : .24)))
    c.surfaceSupport = ropeSlopeSupport(c, c.rope ? ropeBodyTerrain(platforms, world) : platforms)
    const heldGrip = c.rope && turning ? ropeGripDistance(c) : 0
    // Every rope is climbed by the arms alone, so the body always hangs below the hands.
    c.hangBlend = approach(c.hangBlend, Number(!!c.rope), dt / .22)
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
      // Traveling hand over hand also moves the grip: its starts, stops and pulls swing the hips and legs.
      const travel = c.travelSpeed ?? 0, ahead = ropePoint(c.rope, Math.min(c.rope.definition.length, grip + 1)), back = ropePoint(c.rope, Math.max(0, grip - 1))
      const along = travel ? [(ahead[0] - back[0]) / 2 * travel, (ahead[1] - back[1]) / 2 * travel] : [0, 0]
      // The body's swing beneath the holding hand swings the hips and legs further still.
      const sway = c.sway ?? { vx: 0, vy: 0 }
      stepRopeBodyMotion(c, velocity[0] + along[0] + sway.vx * 2.5, velocity[1] + along[1] + sway.vy * 2, orientationGravity, dt)
    }
    p.crouch = 0; p.crouching = false; p.reach = 0; p.landing = 0; p.buffer = 0
    const sideExit = !verticalIntent && Math.abs(input.move) > .1 && c.time >= .16
    const exitGround = c.ladder && (jumping || input.detach || sideExit)
      ? ladderExitGround(p.x, p.y, world.colliders.filter(b => b.id.startsWith('terrain:')).map(b => b.platform), platforms) : null
    const releaseClear = !c.ladder || !!exitGround || !platforms.some(b => overlaps(p.x, p.y, b))
    if ((jumping || input.detach) && releaseClear) {
      if (exitGround) p.y = exitGround.y
      if (ropeVelocity && (previousClimb.time < .16 || turning)) [p.vx, p.vy] = ropeVelocity
      if (c.turn) p.releaseTurn = captureRopeTurnRelease(p)
      p.climbing = null; p.grabCooldown = .35; p.grounded = false
      const launchMove = c.rope && wall ? -wall.side : input.move
      if (jumping && !input.detach) {
        launchFromClimb(p, launchMove, orientationGravity)
      } else { if (!c.rope) p.vy = Math.max(0, p.vy) + 40; cancelJumpInput(p) }
      p.jumpStart = p.y; p.jumpHeight = 0; return
    }
    if (surfaceExit && !turning) {
      p.mantle = surfaceExit; p.climbing = null; p.vx = 0; p.vy = 0; p.grabCooldown = .35; cancelJumpInput(p)
      return
    }
    if (c.ladder && sideExit && releaseClear) {
      const ground = exitGround ?? groundAt(platforms, p.x, p.y, 5, s => canGrip(s.angle))
      // Stepping onto a floor must fit at its actual height, including headroom.
      if (!ground || !platforms.some(b => overlaps(p.x, ground.y, b))) {
        leaveLadder(p, ground); p.vx = input.move * TUNING.walkSpeed
        // Direction often arrives a few frames before Jump. Keep the immediate
        // step-off, but let a fresh press turn that clear departure into a jump.
        p.ladderJumpGrace = ground ? 0 : TUNING.coyoteTime
        p.jumpHeld = input.jump
        return
      }
    }
    const topFooting = c.ladder ? ladderFooting(c.ladder, platforms, ladderDecks(platforms, world)) : null
    const minimum = c.ladder ? topFooting ? ladderDistance(c.ladder, topFooting.y) : 18 : ROPE_TOP_GRIP
    const bottom = c.ladder ? ladderDistance(c.ladder, c.ladder.bottom) : ropeGripLimit(c.rope!.definition)
    const oldDistance = c.distance
    // The hands keep a steady rhythm; the robot goes faster by reaching further.
    const climbSpeed = c.rope ? ropeTravelSpeed(c, traversing || vertical > 0) : materialVertical > 0 ? 85 : 105
    // Hand over hand, the body eases while a hand reaches and surges as it takes hold; the average is unchanged.
    const reaching = c.rope ? Math.max(0, ...(c.holds ?? []).map(h => h.reach < 1 ? Math.sin(h.reach * Math.PI) : 0)) : 0
    // Setting off or turning back, the body eases up to speed instead of reversing at full pace.
    if (c.rope) {
      // A positive climb input shortens the distance along the rope, so travel runs the other way.
      const heading = Math.sign(materialVertical), was = -Math.sign(c.travelSpeed ?? 0)
      c.travelRamp = !heading ? 0 : heading !== was && was ? 0 : Math.min(1, (c.travelRamp ?? 0) + dt / .15)
    }
    // Along a level rope the body eases up to speed and brakes over about a sixth of a second, swinging
    // beneath its hands. Climbing a steep rope it answers at once: each pull starts and stops the body.
    const steep = c.rope ? c.ropeVertical ?? 1 : 1
    // Running, the body swings like a pendulum from the hand it hangs by: fastest as it passes beneath
    // that hand, slowest out at either end of the swing, where the next hand takes hold.
    const swing = c.rope ? ropePendulumPace(c) : 1
    // Climbing a steep rope, each pull lifts the body: quickest mid-pull while the free hand reaches on,
    // briefly slower as it takes hold.
    const pull = (1.05 - .15 * reaching) * (1 - steep) + (.82 + .35 * reaching) * steep
    const surge = c.rope ? pull * swing * (.3 + .7 * steep + (.7 - .7 * steep) * ease(c.travelRamp ?? 1)) : 1
    let speed = -materialVertical * climbSpeed * surge
    // Braced on a wall, the feet stop the descent at once.
    const was = c.rope && !c.wall ? c.travelSpeed ?? 0 : 0
    if (was && (Math.sign(speed) !== Math.sign(was) || Math.abs(speed) < Math.abs(was)))
      speed = approach(was, Math.sign(speed) === Math.sign(was) ? speed : 0, ROPE_BRAKE / Math.max(.01, (1 - steep) ** 2) * dt)
    // Another body on the rope keeps its stretch of it: a grip climbs up to that body's feet, or down to its
    // hands, and no further. One already too close is never pushed away, only kept from closing in.
    let top = minimum, end = bottom
    if (c.rope) for (const mate of options.ropeMates ?? ropeMates(options.ropeRiders)) if (mate.index === c.index) {
      if (mate.distance < oldDistance) top = Math.max(top, Math.min(oldDistance, mate.distance + mate.span))
      else end = Math.min(end, Math.max(oldDistance, mate.distance - ROPE_MATE_SPAN * bodySize(p)))
    }
    c.distance = Math.max(top, Math.min(end, c.distance + speed * dt))
    // A grip pushed into its limits is not travel: it carries no speed to brake from.
    if (c.rope) c.travelSpeed = Math.max(-Math.abs(speed), Math.min(Math.abs(speed), (c.distance - oldDistance) / dt))
    if (c.ladder && topFooting && materialVertical > 0) {
      const catchDistance = ladderDistance(c.ladder, topFooting.y + TUNING.hangReach)
      if (oldDistance >= catchDistance) c.distance = Math.max(c.distance, catchDistance)
    }
    if (c.turn) c.turn.grip = Math.max(18, Math.min(c.rope!.definition.length, c.turn.grip + c.distance - oldDistance))
    let turnBlocked = false
    if (c.rope && turning && c.hangBlend === 1 && !(c.wallBlend ?? 0) && c.time >= .16) {
      const angle = c.turn?.angle ?? 0
      stepRopeTurn(c, orientationGravity, p.facing, platforms, dt)
      turnBlocked = !!c.turn && c.turn.angle === angle && Math.abs(c.turn.target - angle) > 1e-6
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
          caught: { x: oldX, y: oldY, vx: 0, vy: 0, anim: { stride: p.anim.stride, gait: p.anim.gait }, ledgeReach: null, climbing: previousClimb } }
        p.x = oldX; p.y = oldY
        p.climbing = null; p.facing = edge.side; p.vx = 0; p.vy = 0; p.grabCooldown = .35
        return
      }
    }
    if (c.ladder && topFooting && p.y <= topFooting.y + TUNING.hangReach + .01 && bodyVertical > 0 && c.time >= .16) {
      p.mantle = { edgeX: c.ladder.x, edgeY: topFooting.y, side: p.facing, toX: c.ladder.x, toY: topFooting.y,
        time: -LEDGE_CATCH_TIME, braced: false,
        ladder: { climb: { ...c }, x: p.x, y: p.y, entry: ladderMantleEntry(p.y - topFooting.y) } }
      p.climbing = null; p.vx = 0; p.vy = 0
    } else if (c.ladder && c.distance === 18 && bodyVertical > 0 && c.time >= .16) {
      const edge = ladderLedge(c.ladder, platforms)
      if (edge) {
        p.hang = { ...edge, time: 0, queued: true,
          caught: { x: p.x, y: p.y, vx: 0, vy: 0, anim: { stride: p.anim.stride, gait: p.anim.gait }, ledgeReach: null, climbing: { ...c } } }
        p.climbing = null; p.facing = edge.side; p.vx = 0; p.vy = 0
      }
    } else if (c.ladder && c.distance === bottom && bodyVertical < 0 && c.time >= .16
      && !platforms.some(b => overlaps(p.x, c.ladder!.bottom, b, bodyCrouch ? TUNING.crouchHeight : TUNING.height))) {
      leaveLadder(p, groundAt(platforms, p.x, c.ladder.bottom, .2), bodyCrouch); p.y = c.ladder.bottom
    }
    // Another body (the player, a robot) stops a rope grip climbing into it, but never shoves a body hanging on a
    // rope: the rope would only swing it back. Terrain keeps the full swept-body rules.
    const bodies = c.rope ? movingBodies(world) : null, terrain = c.rope ? ropeBodyTerrain(platforms, world) : platforms
    if (bodies?.size && c.distance !== previousClimb.distance) {
      const into = (x: number, y: number) => [...bodies].some(b => bodyIntersects(x, y, b, TUNING.height, 1, c.turn?.angle ?? 0))
      if (into(p.x, p.y) && !into(oldX, oldY)) {
        c.distance = previousClimb.distance; c.direction = 0; c.screenDirection = 0; c.travelSpeed = 0
        if (c.turn && previousClimb.turn) c.turn.grip = previousClimb.turn.grip
        const held = climbRoot(c, p.facing)
        p.x = c.caught.x + (held[0] - c.caught.x) * blend; p.y = c.caught.y + (held[1] - c.caught.y) * blend
      }
    }
    // Foreground ladders cross terrain. Ropes retain their full swept-body rules.
    let safe = moveBody([oldX, oldY], [p.x, p.y], c.ladder ? ladderObstacles(world) : terrain, TUNING.height, 1, c.turn?.angle)
    const blocked = Math.hypot(safe.x - p.x, safe.y - p.y)
    p.x = safe.x; p.y = safe.y
    // Up can finish a scramble on a walkable slope, just as Down steps off onto a floor.
    const footing = c.rope && !turning && gravity >= 0 && (screenVertical < 0 || screenVertical > 0 && c.surfaceSupport) ? groundAt(terrain, p.x, p.y, .2) : null
    if (footing && canGrip(footing.angle)) {
      p.climbing = null; p.grabCooldown = .35; p.grounded = true
      p.y = footing.y; p.vx = 0; p.vy = 0; p.groundAngle = footing.angle
      p.anim.gait = gaitPose(0)
    } else if (blocked > .1) {
      if (c.rope) {
        // Stop only a climbing step into an obstruction, never the rope simulation.
        if (screenVertical && safe.contacts.some(({ normal }) => normal[1] * screenVertical > .5)
          || traversing && materialVertical && safe.contacts.some(({ normal }) => normal[0] * input.move < -.5)) {
          c.distance = previousClimb.distance; c.direction = 0
          if (c.rope) { c.screenDirection = 0; c.travelSpeed = 0 }
          if (c.turn && previousClimb.turn) c.turn.grip = previousClimb.turn.grip
        }
        for (let i = 0; i < 4; i++) safe = constrainRopeBody(c, [oldX, oldY], p.facing, terrain, world.ropePlatforms ?? terrain)
        p.x = safe.x; p.y = safe.y
        p.vx = (p.x - oldX) / dt; p.vy = (p.y - oldY) / dt
      } else {
        // A gate/prop/field stops the grip without dropping it inside terrain.
        Object.assign(c, previousClimb); c.time = Math.max(c.time, .16); c.direction = 0
        p.climbing = c; p.x = oldX; p.y = oldY; p.vx = 0; p.vy = 0
      }
    }
    if (c.rope) { stepArmHolds(c, (c.travelSpeed ?? 0) * dt, dt); stepRopeSway(c, dt); stepRopeStroke(c, dt) }
    if (c.wallBlend) {
      // A rebounding grip can travel faster than a deliberate wall step. Advance
      // the foothold gait in simulation so it cannot whip through a whole stride.
      const height = rappelFrame(c).hip[1]
      // Resting braced, the footholds stay put while the rope bounces a little under the body.
      if (c.rappelStepHeight === undefined || c.rappelMotion) c.rappelStepHeight = approach(c.rappelStepHeight ?? height, height, 120 * dt)
    } else c.rappelStepHeight = undefined
    if (ropeVelocity && p.climbing === c) {
      const before = ropePoint(c.rope!, previousClimb.distance), after = ropePoint(c.rope!, c.distance)
      p.vx = ropeVelocity[0] + (after[0] - before[0]) / dt
      p.vy = ropeVelocity[1] + (after[1] - before[1]) / dt
    }
    if (p.climbing === c && turnBlocked && ropeTurnHasSupport(p, orientationGravity, platforms)) {
      p.releaseTurn = captureRopeTurnRelease(p)
      p.climbing = null; p.grabCooldown = .35; p.grounded = false
    }
    if (c.rope && !c.rope.definition.end && p.climbing && c.distance === bottom && materialVertical < 0 && c.time >= .16) {
      // Descending off the last handhold is a natural exit, not a jump.
      if (c.turn) p.releaseTurn = captureRopeTurnRelease(p)
      p.climbing = null; p.grabCooldown = .35
    }
    return
  }
  if (p.hang) {
    // A ledge grip only hangs against its current load. Carry the actual held
    // pose into free turning when gravity reverses, including at a field edge.
    if (orientationGravity < -TUNING.gravity * .05) {
      const pose = animates(p) ? athletePose(p) : undefined
      p.hang = null; p.grabCooldown = .35
      turnToGravity(p, orientationGravity, pose)
      return
    }
    const h = p.hang; h.time += dt
    const jumping = pressed
    if (pressed) h.queued = false
    const catchTime = h.caught.climbing?.rope ? ROPE_LEDGE_CATCH_TIME : LEDGE_CATCH_TIME
    const { side } = h, caught = ledgeEase(h.time / catchTime)
    const target = climbFrame(0, h.braced, h.slope, false, 20, h.outwardSlope).root
    p.x = h.caught.x + (h.edgeX + side * target[0] - h.caught.x) * caught
    p.y = h.caught.y + (h.edgeY + target[1] - h.caught.y) * caught
    if (h.caught.climbing?.rope) {
      const root = ropeCatchRoot([(h.caught.x - h.edgeX) * side, h.caught.y - h.edgeY], h.time / catchTime, target)
      p.x = h.edgeX + root[0] * side; p.y = h.edgeY + root[1]
    }
    p.vx = 0; p.vy = 0; p.facing = side
    const dropping = bodyDrop
    if (!dropping) h.dropLocked = false
    if (!bodyClimb) h.upLocked = false
    if (input.detach || (dropping && !h.dropLocked)) {
      p.hang = null; p.grabCooldown = .35; p.vy = 80; p.vx = -side * 60; cancelJumpInput(p)
    } else if (jumping) {
      p.hang = null; p.grabCooldown = .25; launch(p); p.vx = -side * 260
    } else if (!input.jump) {
      h.queued ||= bodyClimb && !h.upLocked
      if (h.queued && h.time >= catchTime) {
        // Use the space that is already available before shoving a loose prop.
        // A compact pull can finish at its normal pace, then the grounded push
        // has proper footing instead of stretching the whole climb in time.
        const fixed = world.colliders.filter(c => !c.prop).map(c => c.platform)
        const landing = ledgeLanding(platforms, h, h.braced) ?? ledgeLanding(platforms, h, h.braced, fixed)
        if (landing) {
          const { crouched, inset } = landing, toX = h.edgeX + inset * side, toY = h.edgeY + inset * (h.slope ?? 0)
          p.mantle = { platform: h.platform, edgeX: h.edgeX, edgeY: h.edgeY, slope: h.slope, outwardSlope: h.outwardSlope, side, toX, toY, time: 0, braced: h.braced, crouched, inset,
            sway: { time: h.time - (h.swayFrom ?? catchTime), vx: h.caught.vx * side } }; p.hang = null; cancelJumpInput(p)
        }
      }
    }
    return
  }
  // Feet stay planted when ducking. Do not stand up through a low ceiling.
  // A weightless hit absorbed by the legs holds its crouch until they push off (`p.rebound`).
  // Skating along a surface without weight (a direction held with the press into it) stands tall on the boots; Down
  // alone still crouches.
  const skating = settledWeightless(p) && p.grounded && floatDirection(input, frameDirection)[0] !== 0
  p.crouching = (bodyCrouch && p.grounded && !skating) || !!p.rebound && p.grounded || (p.crouching && (!!p.releaseTurn || platforms.some(b => overlaps(p.x, p.y, b))))
  // Weightless legs are a spring that a hit drives and that eases into and out of a crouch (springCrouch).
  if (settledWeightless(p)) springCrouch(p, dt)
  else { p.crouch = approach(p.crouch, Number(p.crouching), dt * 10); delete p.crouchRate }
  p.reach = approach(p.reach, Number(input.reach && !p.crouching), dt * 10)
  const height = p.crouching ? TUNING.crouchHeight : TUNING.height
  const wasGrounded = p.grounded
  if (p.ladderJumpGrace > 0 && p.buffer > 0) launchFromClimb(p, input.move, orientationGravity)
  // Without weight a jump pushes off whatever the body touches, instead of an ordinary jump or wall jump.
  const weightless = settledWeightless(p)
  if (weightless && p.buffer > 0) pushOff(p, input, platforms, height, frameDirection)
  // Feet carry no weight, so nothing walks: the boots lift a standing body off its surface when a direction is held
  // that does not press into it, and then fly it as they do any floating body. In a doorway Up enters the door instead.
  else if (weightless && p.grounded && !p.releaseTurn && !(options.doorway && input.climb) && floatDirection(input, frameDirection)[1] < .5
    && (floatDirection(input, frameDirection)[0] || floatDirection(input, frameDirection)[1])) {
    // The boots ease the feet clear of the surface first, so they fly rather than drag along it.
    p.grounded = false; p.coyote = 0; p.anim.footwork = null; p.vy = Math.min(p.vy, -15); delete p.rebound
  } else if (p.rebound && (!weightless || !p.grounded)) delete p.rebound
  else if (p.rebound) {
    // The legs start to push off as their fold bottoms out (or, held short of it, once the fold has had its time).
    // The feet leave when the push has the body moving at the rebound's speed; the legs finish straightening in the air.
    const r = p.rebound
    r.time += dt
    if (r.push === undefined && (r.time >= TUNING.zeroGravityAbsorbTime * 2 || r.time > dt * 1.5 && (p.crouchRate ?? 0) <= 0)) r.push = 0
    else if (r.push !== undefined && (r.push += dt) >= REBOUND_PUSH_TIME - 1e-9) {
      const angle = r.angle ?? 0
      p.vx = Math.sin(angle) * r.speed; p.vy = -Math.cos(angle) * r.speed
      p.grounded = false; p.coyote = 0; p.crouching = false; p.anim.footwork = null; delete p.rebound
    }
  }
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
  const drySpeed = p.crouching ? TUNING.crouchSpeed : TUNING.runSpeed
  const airSpeedScale = !p.grounded && !isWeightless(gravity) ? options.airSpeedScale ?? 1 : 1
  const swimMove = p.grounded ? move : swimmingDirection(input).x
  const target = move * drySpeed * airSpeedScale * (1 - waterControl) + swimMove * Math.min(drySpeed, TUNING.swimHorizontalSpeed) * waterControl
  // Release carries a damped glide; intentional reversals still steer firmly.
  const coasting = waterControl > 0 && !p.grounded && !move
  if (waterControl && (coasting || move * p.vx < 0 || Math.abs(p.vx) > Math.abs(target))) {
    p.vx *= Math.exp(-(coasting ? TUNING.swimCoastResponse : TUNING.waterMomentumDrag) * waterControl * dt)
  }
  // Feet grip by the body's weight: lighter gravity gives walking and crawling less to push and brake with.
  const traction = Math.min(1, Math.abs(gravity) / TUNING.gravity)
  const groundSteering = (move ? TUNING.acceleration : TUNING.braking) * traction * (1 - waterControl) + TUNING.swimHorizontalAcceleration * waterControl
  if (p.wallJump && p.wallJump.time < TUNING.wallJumpControlTime) {
    // A short outward push survives holding toward the wall; ordinary steering follows.
    p.vx = p.wallJump.direction * TUNING.wallJumpPush; p.facing = p.wallJump.direction
  } else if (weightless && !p.grounded) {
    // Booster boots: a steady thrust toward the held screen direction. Air resistance alone limits the speed it
    // reaches; holding the opposite way slows a drift. Without input the drift carries on, slowly losing speed.
    if (Math.abs(move) > .01 && !p.releaseTurn) p.facing = Math.sign(move)
    const [dx, dy] = floatDirection(input, frameDirection), thrust = TUNING.zeroGravityThrust * dt
    // Thrust against the drift brakes harder, never past a stop, so a player can stop where they mean to.
    const speed = Math.hypot(p.vx, p.vy), against = speed > 1e-6 ? -(dx * p.vx + dy * p.vy) / speed : 0
    const brake = against > 0 ? Math.min(speed, (TUNING.zeroGravityBrake - 1) * against * thrust) / speed : 0
    p.vx += dx * thrust - p.vx * brake; p.vy += dy * thrust - p.vy * brake
    p.airBoost.x = dx; p.airBoost.lift = -dy
    // With nothing held, the boots puff against a slow drift as they trim it (restDrag), hardest where it slows most.
    const trim = restDrag(p, input, frameDirection) * speed / (TUNING.zeroGravityRestDrag * TUNING.zeroGravityRestSpeed / 4)
    if (!dx && !dy && trim > .01) { p.airBoost.x = -p.vx / speed * TRIM_PUFF * trim; p.airBoost.lift = p.vy / speed * TRIM_PUFF * trim; p.airBoost.trim = true }
  } else if (p.sliding?.active && !p.grounded) {
    const angle = p.sliding.angle, tangent = [Math.cos(angle), Math.sin(angle)]
    const speed = slidingVelocity(p.vx * tangent[0] + p.vy * tangent[1], angle, gravity, dt, p.sliding.slick ? FRICTIONLESS : TERRAIN_FRICTION)
    // The ordinary gravity step below supplies the normal load for the sweep.
    // Subtract its tangent contribution here so gravity is integrated only once.
    const beforeGravity = speed - gravity * tangent[1] * dt
    p.vx = tangent[0] * beforeGravity; p.vy = tangent[1] * beforeGravity
    if (p.buffer > 0) { p.vx = tangent[0] * speed; launch(p) }
  } else {
    if (Math.abs(move) > .01) {
      if (!p.releaseTurn && (!waterControl || p.grounded || move * p.facing < 0 && p.vx * p.facing <= 5)) p.facing = Math.sign(move)
    }
    const ground = p.grounded ? contacts.support : null
    const carrier = ground?.collider.robot
    const beforeSteering = p.vx
    // Velocity stays in world space. Limited shoe traction can follow a slow
    // bot, but cannot instantly match a charge or erase momentum on departure.
    const steered = ground?.platform.frictionless ? p.vx
      : ground && canGrip(ground.angle)
      ? groundVelocity(p.vx - (carrier?.vx ?? 0), target, ground.angle, carrier ? Math.max(0, gravity + (p.swimAcceleration ?? 0)) * .8 : groundSteering, dt) + (carrier?.vx ?? 0)
      : coasting || !p.grounded && isWeightless(gravity) && !move ? p.vx
      : approach(p.vx, target, (p.grounded ? groundSteering : TUNING.airAcceleration + (TUNING.swimHorizontalAcceleration - TUNING.airAcceleration) * waterControl) * dt)
    // The working stance walks the body to its push distance, which needs traction.
    const constrained = ground?.platform.frictionless ? null : pushingVelocity(p, contacts.push, world, dt, steered)
    p.vx = constrained ?? steered
    if (!p.grounded && constrained === null) p.airBoost.x = (p.vx - beforeSteering) / (TUNING.airAcceleration * dt)
  }
  // Feet a hair from a surface, after a roll pivoted onto them against it, settle onto it rather than hover there.
  if (weightless && !p.grounded && !p.releaseTurn && p.vy > -5 && p.vy < FEET_SETTLE_SPEED && groundAt(platforms, p.x, p.y, FEET_SETTLE_REACH))
    p.vy = FEET_SETTLE_SPEED
  if (weightless && p.grounded && !p.releaseTurn) {
    // Feet carry no weight, so nothing walks. A direction held into the surface skates the body along it on the
    // boots, against the air; otherwise the feet take hold and the drift a landing brought dies away, unless the
    // surface is frictionless.
    const [dx] = floatDirection(input, frameDirection)
    if (dx) {
      p.vx += dx * TUNING.zeroGravityThrust * dt
      p.vx *= Math.exp(-(TUNING.zeroGravityDrag + TUNING.zeroGravityAirDrag * Math.abs(p.vx)) * dt)
    } else if (!contacts.support?.platform.frictionless) p.vx *= Math.exp(-dt / TUNING.zeroGravityGrip)
  }
  // Stepping up needs a foothold to push from, which frictionless terrain cannot give.
  if (p.grounded && contacts.support && !contacts.support.platform.frictionless && !p.crouching && !input.jump && !bodyDrop
    && !p.sliding?.active && p.grabCooldown === 0) {
    const step = findStepUp(p, move, dt, world, stepIntent)
    if (step) {
      p.mantle = step; p.grounded = false; p.vy = 0; p.pushing = null; p.pushRig = null; p.ledgeReach = null; p.wallBrace = null
      p.landing = 0; p.coyote = 0; p.buffer = 0
      return
    }
  }
  const oldX = p.x, oldY = p.y
  const following = p.grounded
  // Air resistance in lasting weightlessness; in water it also slows a weightless moment of the swim, as it always has.
  const drag = !following && (settledWeightless(p) || swimStrength > 0 && isWeightless(Math.hypot(gravity, options.lateralGravity ?? 0)))
    ? Math.exp(-(TUNING.zeroGravityDrag + TUNING.zeroGravityAirDrag * Math.hypot(p.vx, p.vy) + restDrag(p, input, frameDirection)) * dt) : 1
  p.vx *= drag
  // Internal terrain ends are ledges; structural outer terrain encloses the room.
  p.x += p.vx * dt
  const collisionOutline = playerCollisionOutline(p, world)
  // Swimming contacts belong to the continuous sweep below. Applying the
  // standing axis stops first creates invisible walls inside flooded tunnels.
  // So do a weightless roll's: its turned hull is not a standing body's (see `rolling` below).
  const rolling = p.releaseTurn?.float !== undefined
  for (const b of platforms) if (!rolling && !collisionOutline?.(b) && overlaps(p.x, p.y, b, height)) {
    if (p.vx > 0 && oldX + 12 <= b.x + .1 && exposedSide(platforms, b, 1, p.y - height, p.y)) { p.x = b.x - 12; p.vx = glidingBehind(p, world, b, 1) }
    else if (p.vx < 0 && oldX - 12 >= b.x + b.w - .1 && exposedSide(platforms, b, -1, p.y - height, p.y)) { p.x = b.x + b.w + 12; p.vx = glidingBehind(p, world, b, -1) }
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
  // A weightless roll turns the body over its middle, so a standing head's headroom does not apply: the feet swinging
  // up toward a ceiling are not the head meeting it. The turned hull's sweep (stepPlayer) meets surfaces instead.
  // A corner buried in a neighbouring piece is a seam in the ground, not a wall to miss.
  const bareCorner = (b: Platform, x: number, y: number, side: number) =>
    !platforms.some(other => other !== b && pointInside(other, x + side * .5, y + .5))
  const land = (surface: GroundSurface) => {
    if (!wasGrounded && weightless) absorbWeightlessArrival(p, p.vx, p.vy, surface.angle, dt)
    if (!wasGrounded) {
      absorbLanding(p, p.vy)
      const cos = Math.cos(surface.angle), sin = Math.sin(surface.angle)
      p.vx = (p.vx * cos + p.vy * sin) * cos
    }
    p.y = surface.y; p.vy = 0; p.grounded = true; support = surface
  }
  for (const b of platforms) {
    if (p.x + 12 <= b.x || p.x - 12 >= b.x + b.w) continue
    if (collisionOutline?.(b)) continue
    if (b.polygon) {
      // These faces use the continuous body sweep. Only a lip crossed within this step is
      // settled here, exactly as a rectangle's is: feet carried over it land, and a missed
      // corner is a side contact.
      const lip = !b.looseProp && p.vy >= 0 && !p.sliding?.active ? lipCrossing(b, oldX, oldY, p.x, p.y) : null
      if (!lip || !canGrip(lip.angle, surfaceFriction(b))) continue
      if (lip.over) land({ platform: b, y: lip.y, angle: lip.angle })
      else if (!support && p.vx * lip.side < 0 && bareCorner(b, lip.x, lip.y, lip.side)) { p.x = lip.x + 12 * lip.side; p.vx = 0 }
      continue
    }
    const surface = platformSurface(b, p.x), before = platformSurface(b, oldX)
    if (!canGrip(surface.angle, surfaceFriction(b)) || p.sliding?.active) continue
    if ((p.vy >= 0 || b.profile && p.y - surface.y >= oldY - before.y) && oldY <= before.y + .1 && p.y >= surface.y) {
      if (p.x >= b.x && p.x <= b.x + b.w) land(surface)
      else if (!support && !b.profile && ((p.x < b.x && p.vx > 0) || (p.x > b.x + b.w && p.vx < 0))
        && bareCorner(b, p.x < b.x ? b.x : b.x + b.w, b.y, p.x < b.x ? -1 : 1)) {
        // A missed corner is a side contact, not support under empty space.
        p.x = p.x < b.x ? b.x - 12 : b.x + b.w + 12; p.vx = 0
      }
    } else if (!rolling && p.vy < 0 && oldY - height >= b.y + b.h - .1 && p.y - height <= b.y + b.h) {
      p.y = b.y + b.h + height; p.vy = 0
    }
  }
  let reach: Player['ledgeReach'] = null
  let reachScore = -1, dryReachPose: AthletePose | null | undefined
  const suppressLedgeGrab = frameDirection > 0 ? input.drop : input.climb || input.drop && !screenDown
  if (!p.grounded && !p.crouching && !p.releaseTurn && p.grabCooldown === 0 && !suppressLedgeGrab && p.vy > -500) {
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
      const swimmingReach = outside && gap < 55 && p.waterMotion && !p.jumpLift && !p.waterJump
        ? swimmingLedgeReach(p, edge, edgeY) : undefined
      // The presented ledge reach; only animated players solve it.
      if (animates(p) && outside && gap < 55 && (waterReach && reachable(p.y) || Math.abs(handY - edgeY) < 48)) {
        const heightReach = waterReach && reachable(p.y) ? 1 : ledgeEase((48 - Math.abs(handY - edgeY)) / 28)
        if (swimmingReach === undefined && dryReachPose === undefined) dryReachPose = dryLedgeReachPose(p)
        const target = swimmingReach ?? Math.min(ledgeEase((55 - gap) / 27), heightReach,
          dryLedgeReach(p, edge, edgeY, dryReachPose ?? null))
        const previous = p.ledgeReach?.x === edge && p.ledgeReach.y === edgeY ? p.ledgeReach.amount : 0
        // Compare candidate strengths, not one candidate's already eased
        // amount. Keep a usable target through small score ties, then use
        // coordinates to make selection independent of platform order.
        const score = target + (previous > 0 ? .05 : 0)
        if (target > 0 && (score > reachScore || score === reachScore && reach
          && (edge < reach.x || edge === reach.x && edgeY < reach.y))) {
          reachScore = score
          reach = { x: edge, y: edgeY, amount: previous + (target - previous) * (1 - Math.exp(-dt / .045)) }
        }
      }
      // Leave room for the last few units of an approaching hand reach. A
      // falling wall-jump can leave the vertical window before a body-near
      // catch opens; the existing catch blend settles that small separation.
      // Passive floating uses the original bank window too: without Up or
      // forward swimming it must not acquire the wider dry reach by default.
      const catchGap = waterReach ? 7 : swimStrength > 0 ? 13 : 19
      if (p.vy > (waterReach ? -TUNING.swimSpeed - 1 : -180) && outside && Math.abs(p.x + side * 14 - edge) < catchGap && reachable(p.y)) {
        const braced = ledgeBraced(platforms, edge, edgeY, side, ledge.outwardSlope)
        const gripRoot = climbContactRoot(0, braced, ledge.slope, false, 20, ledge.outwardSlope)
        const gripOutline = ledgeBodyOutline(gripRoot[1], TUNING.height, side, ledge.outwardSlope ?? 0)
        if (platforms.some(other => bodyIntersects(edge + side * gripRoot[0], edgeY + gripRoot[1], other, TUNING.height, 1, 0, gripOutline))) continue
        // Inset faces are resolved by the sweep, not the bounds-based side stop above.
        // Catch from that resolved position so the same contact cannot cancel the new grip.
        catchPosition ??= moveBody([oldX, oldY], [p.x, p.y], platforms, height, 1, playerTurnAngle(p), collisionOutline)
        if ((edge - catchPosition.x) * side < 10 || Math.abs(catchPosition.x + side * 14 - edge) >= catchGap
          || !reachable(catchPosition.y)) continue
        p.x = catchPosition.x; p.y = catchPosition.y
        const caught = { x: p.x, y: p.y, vx: p.vx, vy: p.vy, anim: { stride: p.anim.stride, gait: p.anim.gait, ragdoll: p.anim.ragdoll, dryTurn: p.anim.dryTurn }, ledgeReach: reach, freeFall: p.freeFall,
          ...(p.waterMotion ? { waterMotion: { ...p.waterMotion } } : {}),
          ...(p.heldTool ? { heldTool: structuredClone(p.heldTool) } : {}) }
        p.vx = 0; p.vy = 0; p.hang = { platform: index, side, edgeX: edge, edgeY, slope: ledge.slope, outwardSlope: ledge.outwardSlope, time: 0, queued: false, braced, caught }
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
