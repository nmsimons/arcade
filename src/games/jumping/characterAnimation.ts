// Character animation: everything the movement step used to advance for
// presentation. Each player chooses a cadence:
//   'tick'  (default) animate at the end of every fixed physics step, as before;
//   'frame' record the step's inputs and animate once per drawn frame through
//           advanceCharacterAnimation;
//   'off'   no animation at all, for off-screen robots and headless runs.
// Physics never reads animation (docs/jumping-animation.md), so the cadence
// cannot change motion; the golden traces check that for all three.
import { advanceDryTurn, advanceImpactRagdoll, advanceMovingRecovery, advanceReturningStepPreparation, advanceSlideEntry,
  advanceSwimAnimation, dryTurnDirection, settleFallClearance, settlePresentedWaterClearance } from './athleteAnimation.ts'
import type { DryTurnFrame, SlideEntryFrame } from './athleteAnimation.ts'
import type { CharacterAnimation, JumpInput, Player } from './characterTypes.ts'
import { advanceFootwork } from './footwork.ts'
import { withTerrainQueries } from './geometry.ts'
import { gaitPose } from './gait.ts'
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
  /** Facing before the first merged step, for the fall clearance offset. */
  previousFacing?: number
  /** Time to settle fall clearance and the impact ragdoll, and the presented water clearance. */
  settle: number; water: number
}

/** Switch cadence. Animation resumed after 'off' starts from rest: its state is stale. */
export function setAnimationCadence(p: Player, next: AnimationCadence) {
  const current = cadence(p)
  if (current === next) return
  if (current === 'off') p.anim = { dryTurn: null, slideEntry: null, footwork: null, stride: 0, gait: null, look: 0, ragdoll: null, recovery: null, waterClearance: null }
  p.anim.cadence = next
  p.anim.pending = null
}

/** The visible gait blends toward the actual motion; the feet return to rest. */
function settleGait(p: Player, dt: number) {
  const speed = p.climbing ? 0 : p.grounded ? p.contacts?.motion.speed ?? 0 : p.vx
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
  updatePushingPose(p, contacts.push ?? preparation, dt, contacts.motion.speed, [contacts.motion.x, contacts.motion.y])
}

/** The rest of the step's animation, after its contacts are published. */
export function animateStep(p: Player, step: AnimationStep) {
  // Animation only reads the world, so its clearance queries share one terrain scope.
  withTerrainQueries(() => animateStepIn(p, step))
}
function animateStepIn(p: Player, { input, dt, world, from, contacts, verticalUsed, frameDirection, turnFrame, slideEntryFrame }: AnimationStep) {
  advanceReturningStepPreparation(p, input, dt, world)
  settleGait(p, dt)
  // Climbing and crouching own the pose; unused Up still gets a quiet glance.
  const look = verticalUsed || p.climbing || p.hang || p.mantle || p.crouching || p.freeFall?.amount ? 0
    : Number(frameDirection > 0 ? input.climb : input.descend)
  p.anim.look += (look - p.anim.look) * (1 - Math.exp(-dt / .1))
  if (Math.abs(p.anim.look - look) < .001) p.anim.look = look
  const visibleDirection = dryTurnDirection(p, input, turnFrame)
  if (visibleDirection === p.facing) advanceFootwork(p, dt, from[0], world.platforms)
  else {
    // Footwork belongs to presentation. Grips and steering retain mechanical
    // facing; resting/swing shoes turn toward the body's outgoing direction.
    const feetPlayer = { ...p, facing: visibleDirection }
    advanceFootwork(feetPlayer, dt, from[0], world.platforms)
    p.anim.footwork = feetPlayer.anim.footwork; p.anim.stride = feetPlayer.anim.stride
  }
  // Residual flight drift or a contact correction is not a requested step.
  // Only active steering starts the faster get-up after a prone impact.
  advanceMovingRecovery(p, dt, Math.abs(input.move) > .01 && Math.abs(contacts.motion.x) > .05, turnFrame)
  advanceDryTurn(p, input, dt, turnFrame)
  advanceSlideEntry(p, dt, slideEntryFrame, input)
  advanceSwimAnimation(p, input, dt)
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
  const pending = p.anim.pending
  if (!pending || pending.frameDirection !== step.frameDirection) {
    p.anim.pending = { ...step, preparation: undefined, settle: 0, water: 0 }
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
  if (pending.frameDirection < 0 && p.inverted) {
    mirrorPlayerState(p); p.inverted = false
    try { run() } finally { mirrorPlayerState(p); p.inverted = true }
  } else run()
  easeHeldTool(p, pending.dt)
}
