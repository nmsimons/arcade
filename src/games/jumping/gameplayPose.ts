// Gameplay queries that need body geometry (the held tool, a robot's palm, the
// swimming hull and hands) solve the rig from physics state alone. Animation can
// then run on its own schedule, or not at all in headless runs, without changing
// motion. Presentation keeps using the full animated pose.
import { athletePose } from './athletePose.ts'
import type { AthletePose } from './athleteRig.ts'
import type { CharacterAnimation, Player } from './characterTypes.ts'

const NEUTRAL: CharacterAnimation = { dryTurn: null, slideEntry: null, footwork: null, stride: 0, gait: null, look: 0, ragdoll: null, recovery: null, waterClearance: null }
type Hang = NonNullable<Player['hang']>
type Climb = NonNullable<Player['climbing']>

function neutralHang(hang: Hang | null | undefined): Hang | null | undefined {
  return hang && { ...hang, caught: { ...hang.caught, anim: { stride: 0, gait: null }, climbing: neutralClimb(hang.caught.climbing) } }
}
function neutralClimb(climb: Climb | null | undefined): Climb | null | undefined {
  return climb && { ...climb, caught: { ...climb.caught, anim: { stride: 0, gait: null }, hang: neutralHang(climb.caught.hang) } }
}

/** The player with every animation-produced value at rest: animation state,
 * the presented push (replaced by the motor's push rig) and ledge reach, the fall clearance offset, captured turn
 * poses, the water landing pose and the animation kept by catches. */
export function physicsView(p: Player): Player {
  const motion = p.waterMotion, fall = p.freeFall, turn = p.releaseTurn, mantle = p.mantle
  return { ...p, anim: { ...NEUTRAL }, pushing: p.pushRig ?? null, ledgeReach: null,
    freeFall: fall && { time: fall.time, amount: fall.amount, recovery: fall.recovery, ...(fall.impact ? { impact: { ...fall.impact, gait: null } } : {}) },
    ...(turn ? { releaseTurn: { ...turn, pose: undefined } } : {}),
    // The water clearance offset and prop lean are physics: the hull and hands include them.
    ...(motion ? { waterMotion: { ...motion, landing: undefined } } : {}),
    hang: neutralHang(p.hang) ?? null, climbing: neutralClimb(p.climbing) ?? null,
    mantle: mantle && { ...mantle,
      ...(mantle.step ? { step: { ...mantle.step, caught: { ...mantle.step.caught, anim: { stride: 0, gait: null }, hang: neutralHang(mantle.step.caught.hang) } } } : {}),
      ...(mantle.descending ? { descending: { ...mantle.descending, caught: { ...mantle.descending.caught, anim: { stride: 0, gait: null }, hang: neutralHang(mantle.descending.caught.hang) },
        climbable: neutralClimb(mantle.descending.climbable) ?? null } } : {}),
      ...(mantle.ladder ? { ladder: { ...mantle.ladder, climb: neutralClimb(mantle.ladder.climb)! } } : {}) } }
}

/** The rig solved from physics state only. */
export function gameplayPose(p: Player): AthletePose {
  return athletePose(physicsView(p))
}
