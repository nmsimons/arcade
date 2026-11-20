// Character animation: everything the movement step used to advance for
// presentation. Each player chooses a cadence:
//   'tick'  (default) animate at the end of every fixed physics step, as before;
//   'frame' record the step's inputs and animate once per drawn frame through
//           advanceCharacterAnimation;
//   'off'   no animation at all, for off-screen robots and headless runs.
// Physics never reads animation (docs/jumping-animation.md), so the cadence
// cannot change motion; the golden traces check that for all three.
import { currentWallFrame, inWallFrame } from './wallFrame.ts'
import { advanceDryTurn, advanceImpactRagdoll, advanceMovingRecovery, advanceReturningStepPreparation, advanceSlideEntry,
  advanceSwimAnimation, advanceFloatAnimation, dryTurnDirection, settleFallClearance, settlePresentedWaterClearance } from './athleteAnimation.ts'
import type { DryTurnFrame, SlideEntryFrame } from './athleteAnimation.ts'
import type { CharacterAnimation, JumpInput, Player } from './characterTypes.ts'
import { advanceCrouchStep, advanceFootwork } from './footwork.ts'
import { withTerrainQueries } from './geometry.ts'
import { gaitPose } from './gait.ts'
import { TUNING } from './movementTuning.ts'
import { bodySize } from './sizeFrame.ts'
import { mirrorPlayerState } from './gravityFrame.ts'
import { easeHeldTool } from './gadgets.ts'
import { anticipatePush, updatePushingPose } from './playerContacts.ts'
import type { ContactWorld, PlayerContacts, PushContact } from './playerContacts.ts'

export type AnimationCadence = NonNullable<CharacterAnimation['cadence']>
/** The longest animation step: slower frames animate in substeps. */
const MAX_STEP = 1 / 60 + 1e-9
export const cadence = (p: Player): AnimationCadence => p.anim.cadence ?? 'tick'
export const animates = (p: Player) => cadence(p) !== 'off'

/** One physics step's inputs to animation, captured where the step used to animate. */
export interface AnimationStep {
  input: JumpInput; dt: number; world: ContactWorld; from: readonly [number, number]
  /** The step's contacts, before a passive push is unpublished. */
  contacts: PlayerContacts
  verticalUsed: boolean; frameDirection: number
  turnFrame: DryTurnFrame | null; slideEntryFrame: SlideEntryFrame | null
  /** Push preparation solved before the step published its contacts ('tick' only). */
  preparation?: PushContact | null
}
/** Steps merged since the last drawn frame. */
export interface PendingAnimation extends AnimationStep {
  /** Recorded in a wall's frame (wallFrame.ts). */
  wall?: 'left' | 'right'
  /** Facing before the first merged step, for the fall clearance offset. */
  previousFacing?: number
  /** Time to settle fall clearance and the impact ragdoll, and the presented water clearance. */
  settle: number; water: number
}

/**
 * Switch cadence. Animation resumed after 'off' starts from rest: its state is stale. A larger body (sizeFrame.ts)
 * animates every step instead of once per frame: animation it deferred would hold the scaled frame's references.
 */
export function setAnimationCadence(p: Player, next: AnimationCadence) {
  if (next === 'frame' && bodySize(p) !== 1) next = 'tick'
  const current = cadence(p)
  if (current === next) return
  if (current === 'off') p.anim = { dryTurn: null, slideEntry: null, footwork: null, stride: 0, gait: null, look: 0, ragdoll: null, recovery: null, waterClearance: null }
  p.anim.cadence = next
  p.anim.pending = null
}

/** On ice: standing on slick footing, or sliding on a slick slope. */
const onIce = (p: Player) => p.grounded ? !!p.contacts?.support?.platform.frictionless : !!p.sliding?.active && !!p.sliding.slick
/** On ice with nothing held, the feet glide where they stand rather than stride. */
const iceGlide = (p: Player, input: JumpInput) => p.grounded && onIce(p) && Math.abs(input.move) <= .01
/**
 * On ice with a direction held, the legs keep working however little the body moves: starting off, braking or pushing
 * up a slope, the feet scrabble and slip at a walking pace. Travelling the way it faces faster than that, the legs
 * keep pace with the body, as in an ordinary run. 0 when nothing is held.
 */
const iceEffort = (p: Player, input: JumpInput) => onIce(p) && Math.abs(input.move) > .01
  ? Math.max(TUNING.walkSpeed * Math.min(1, Math.abs(input.move)), p.vx * p.facing) : 0
/** Stride length the slope scrabble steps by: about a running stride. */
const SCRABBLE_STRIDE = 55

/** Sliding across ice with nothing held faster than this, the player glides in a curler's stance. */
const CURL_SPEED = 110
/**
 * Sliding fast across ice with nothing held, from a run or after letting go of a crate, the player glides as a curler
 * follows a stone: front foot under the hips, trailing leg stretched back, both feet sliding, rising out of it only as
 * the slide slows. While a direction is held the legs work instead (iceEffort), pushing or not. Eased in and out, so
 * the stance never pops.
 */
function advanceCurl(p: Player, input: JumpInput, dt: number) {
  const onIceFeet = p.grounded && !!p.contacts?.support?.platform.frictionless
  const following = onIceFeet && Math.abs(input.move) <= .01
  const target = following ? smoothstep((Math.abs(p.vx) - CURL_SPEED * .6) / (CURL_SPEED * .4)) : 0
  const amount = (p.anim.curl ?? 0) + (target - (p.anim.curl ?? 0)) * (1 - Math.exp(-dt / (target < (p.anim.curl ?? 0) ? .2 : .07)))
  if (amount < .005 && !target) delete p.anim.curl; else p.anim.curl = amount
}
const smoothstep = (t: number) => { const x = Math.max(0, Math.min(1, t)); return x * x * (3 - 2 * x) }

/** The slope scrabble's stepping, eased in and out; drawn by poses/slidingPose.ts. */
function advanceScrabble(p: Player, effort: number, dt: number) {
  const sliding = !p.grounded && !!p.sliding?.active && !!p.sliding.slick
  const target = sliding && effort ? 1 : 0, previous = p.anim.scrabble
  if (!previous && !target) return
  const amount = (previous?.amount ?? 0) + (target - (previous?.amount ?? 0)) * (1 - Math.exp(-dt / .08))
  if (!target && amount < .01) { delete p.anim.scrabble; return }
  p.anim.scrabble = { phase: ((previous?.phase ?? 0) + effort * dt / SCRABBLE_STRIDE * Math.PI * 2) % (Math.PI * 2), amount }
}

/** The visible gait blends toward the actual motion; the feet return to rest. */
function settleGait(p: Player, dt: number, gliding = false, effort = 0) {
  // Without weight nothing walks: a body moving along a surface glides on planted feet. So does one sliding on ice
  // with nothing held; with a direction held, the legs work at its pace however slowly the body goes.
  const weightless = p.grounded && Math.abs(p.gravity ?? TUNING.gravity) < TUNING.gravity * .05
  const moving = p.climbing || weightless || gliding ? 0 : p.grounded ? p.contacts?.motion.speed ?? 0 : p.vx
  const speed = effort && p.grounded ? Math.max(Math.abs(moving), effort) : moving
  const target = gaitPose(speed, !p.grounded && !p.hang && !p.mantle && !p.climbing), previous = p.anim.gait ?? gaitPose(0)
  if (p.contacts?.push && !p.contacts.push.passive || p.grounded && p.vx * p.facing < -1) target.run = 0
  const blend = (from: number, to: number, response = to > from ? .045 : .08) => {
    const value = from + (to - from) * (1 - Math.exp(-dt / response))
    return Math.abs(value - to) < .001 ? to : value
  }
  // Lengthen the settled middle pace, rather than imposing a full jogging
  // cycle during the brief acceleration into a sprint. Keep the old sprint
  // and precision-walk contacts and their traversal handoffs.
  const jogging = Math.abs(previous.speed - target.speed) < .02 && !target.air
    ? 16 * target.run ** 2 * (1 - target.run) ** 2 : 0
  const jog = blend(previous.jog ?? 0, jogging, .12)
  // Animation settles independently of physical braking; the feet return to rest.
  p.anim.gait = { speed: blend(previous.speed, target.speed), moving: blend(previous.moving, target.moving), run: blend(previous.run, target.run),
    air: blend(previous.air, target.air, target.air ? .035 : .065), ...(jog > .001 ? { jog } : {}) }
}

/** Push preparation and the presented palms. 'tick' solves the preparation
 * before the step publishes its contacts, exactly as the step always did. */
export function preparePush(p: Player, input: JumpInput, world: ContactWorld, contacts: PlayerContacts) {
  // A physical contact owns its hands. Otherwise an imminent dry ledge grip
  // takes precedence over object preparation; do not combine two targets.
  if (!p.waterMotion && contacts.push?.hands) p.ledgeReach = null
  return contacts.push || !p.waterMotion && p.ledgeReach ? null : anticipatePush(p, input, world)
}
export function presentPush(p: Player, contacts: PlayerContacts, preparation: PushContact | null, dt: number) {
  updatePushingPose(p, contacts.push ?? preparation, dt, contacts.motion.speed, [contacts.motion.x, contacts.motion.y], !!contacts.support?.platform.frictionless)
}

/** The rest of the step's animation, after its contacts are published. */
export function animateStep(p: Player, step: AnimationStep) {
  // Animation only reads the world, so its clearance queries share one terrain scope.
  withTerrainQueries(() => animateStepIn(p, step))
}
function animateStepIn(p: Player, { input, dt, world, from, contacts, verticalUsed, frameDirection, turnFrame, slideEntryFrame }: AnimationStep) {
  advanceReturningStepPreparation(p, input, dt, world)
  advanceCurl(p, input, dt)
  // A curler's feet slide with the body rather than step, until a direction is held: then the legs work at once.
  const gliding = iceGlide(p, input) || (p.anim.curl ?? 0) > .5 && Math.abs(input.move) <= .01, effort = gliding ? 0 : iceEffort(p, input)
  settleGait(p, dt, gliding, effort)
  advanceScrabble(p, effort, dt)
  // Climbing and crouching own the pose; unused Up still gets a quiet glance.
  const look = verticalUsed || p.climbing || p.hang || p.mantle || p.crouching || p.freeFall?.amount ? 0
    : Number(frameDirection > 0 ? input.climb : input.descend)
  p.anim.look += (look - p.anim.look) * (1 - Math.exp(-dt / .1))
  if (Math.abs(p.anim.look - look) < .001) p.anim.look = look
  const visibleDirection = dryTurnDirection(p, input, turnFrame)
  if (visibleDirection === p.facing) advanceFootwork(p, dt, from[0], world.platforms, gliding, effort)
  else {
    // Footwork belongs to presentation. Grips and steering retain mechanical
    // facing; resting/swing shoes turn toward the body's outgoing direction.
    const feetPlayer = { ...p, facing: visibleDirection }
    advanceFootwork(feetPlayer, dt, from[0], world.platforms, gliding, effort)
    p.anim.footwork = feetPlayer.anim.footwork; p.anim.stride = feetPlayer.anim.stride
  }
  advanceCrouchStep(p, dt)
  // Residual flight drift or a contact correction is not a requested step.
  // Only active steering starts the faster get-up after a prone impact.
  advanceMovingRecovery(p, dt, Math.abs(input.move) > .01 && Math.abs(contacts.motion.x) > .05, turnFrame)
  advanceDryTurn(p, input, dt, turnFrame)
  advanceSlideEntry(p, dt, slideEntryFrame, input)
  advanceSwimAnimation(p, input, dt)
  advanceFloatAnimation(p, dt, frameDirection)
}

export function animateSettle(p: Player, dt: number, previousFacing: number) {
  settleFallClearance(p, dt, previousFacing)
  advanceImpactRagdoll(p, dt)
}

/** Called where the step ends: animate now, or merge into the next frame's pass. */
export function animateOrQueue(p: Player, step: AnimationStep, rawFrom: readonly [number, number]) {
  const mode = cadence(p)
  if (mode === 'tick') {
    animateStep(p, step)
    return
  }
  if (mode === 'off') return
  const pending = p.anim.pending, wall = currentWallFrame()
  if (!pending || pending.frameDirection !== step.frameDirection || pending.wall !== wall) {
    p.anim.pending = { ...step, preparation: undefined, settle: 0, water: 0, ...(wall ? { wall } : {}) }
    return
  }
  // Keep the first step's start and captured turns; later steps add their time,
  // carrier transport and latest contacts.
  p.anim.pending = { ...pending, input: step.input, dt: pending.dt + step.dt, world: step.world, contacts: step.contacts,
    from: [pending.from[0] + step.from[0] - rawFrom[0], pending.from[1] + step.from[1] - rawFrom[1]],
    verticalUsed: step.verticalUsed, turnFrame: pending.turnFrame ?? step.turnFrame, slideEntryFrame: pending.slideEntryFrame ?? step.slideEntryFrame }
}
export function settleOrQueue(p: Player, dt: number, previousFacing: number) {
  const mode = cadence(p)
  if (mode === 'tick') animateSettle(p, dt, previousFacing)
  else if (mode === 'frame' && p.anim.pending) {
    p.anim.pending.settle += dt
    p.anim.pending.previousFacing ??= previousFacing
  }
}
export function presentWaterOrQueue(p: Player, dt: number) {
  const mode = cadence(p)
  if (mode === 'tick') settlePresentedWaterClearance(p, dt)
  else if (mode === 'frame' && p.anim.pending) p.anim.pending.water += dt
}

/** One drawn frame of animation for a 'frame' cadence player: everything the
 * physics steps since the last frame recorded, in the gravity frame they used. */
export function advanceCharacterAnimation(p: Player) {
  const pending = p.anim.pending
  if (cadence(p) !== 'frame' || !pending) return
  p.anim.pending = null
  const run = () => {
    // Footwork and the turn blends assume short steps. A slow frame animates in
    // equal substeps of at most MAX_STEP, with the root moving between them.
    const count = Math.max(1, Math.ceil(pending.dt / MAX_STEP - 1e-9)), dt = pending.dt / count
    const end: [number, number] = [p.x, p.y], [fromX, fromY] = pending.from
    const motion = { x: (end[0] - fromX) / count, y: (end[1] - fromY) / count }
    const contacts = { ...pending.contacts, motion: { ...motion, speed: Math.hypot(motion.x, motion.y) / dt } }
    try {
      for (let i = 1; i <= count; i++) {
        p.x = fromX + motion.x * i; p.y = fromY + motion.y * i
        const first = i === 1, from: [number, number] = [fromX + motion.x * (i - 1), fromY + motion.y * (i - 1)]
        presentPush(p, contacts, preparePush(p, pending.input, pending.world, contacts), dt)
        animateStep(p, { ...pending, dt, from, contacts, turnFrame: first ? pending.turnFrame : null, slideEntryFrame: first ? pending.slideEntryFrame : null })
        if (pending.settle) animateSettle(p, pending.settle / count, first ? pending.previousFacing ?? p.facing : p.facing)
        if (pending.water) settlePresentedWaterClearance(p, pending.water / count)
      }
    } finally { p.x = end[0]; p.y = end[1] }
  }
  if (pending.wall || p.wall) {
    // Steps recorded on a wall animate in its frame; a frame changed since then has nothing to replay.
    if (pending.wall === p.wall) inWallFrame(p, run)
  } else if (pending.frameDirection < 0 && p.inverted) {
    mirrorPlayerState(p); p.inverted = false
    try { run() } finally { mirrorPlayerState(p); p.inverted = true }
  } else run()
  easeHeldTool(p, pending.dt)
}
