// Gravity turns between frames.
import { athletePose } from '../athletePose.ts'
import { FOREARM, MIN_KNEE_OPENING, UPPER_ARM, add, reflectAthletePose, rotatePose, smooth, solveNear, transferPose } from '../athleteRig.ts'
import type { AthletePose, Leg } from '../athleteRig.ts'
import { mirrorPlatform } from '../gravityFrame.ts'
import type { Limb } from '../limbPose.ts'
import { TUNING } from '../movementTuning.ts'
import type { Player } from '../characterTypes.ts'
import { FLOAT_CENTER, bendAtWaist, floatRollLean } from './waterPose.ts'

/** A gravity turn rotates the outgoing rig toward the new frame's falling pose. */
export function releaseTurnPose(p: Player): AthletePose {
  const turn = p.releaseTurn!
  if (turn.float !== undefined && turn.pose) {
    // Weightless: roll the relaxed float feet-first, tucking a little through the middle like a flip turn, and
    // unwind the lean it started with as it goes.
    const same = turn.facing === p.facing, source = same ? turn.pose : reflectAthletePose(turn.pose)
    const progress = turn.progress ?? 1, unwound = (same ? 1 : -1) * (1 - smooth(progress))
    const bent = bendAtWaist(gatherTurn(source, progress, .6), (turn.bend ?? 0) * unwound)
    return rotatePose(rotatePose(bent, floatRollLean(turn, same), 1, FLOAT_CENTER), turn.angle, p.facing)
  }
  let target = athletePose({ ...p, releaseTurn: undefined })
  if (turn.progress !== undefined) {
    // Arrive in the new gravity frame's falling pose. Keeping the outgoing
    // rising pose until inversion would pop the arms and knees at the end.
    const aligned = athletePose({ ...p, releaseTurn: undefined, facing: -p.facing,
      x: p.x + Math.sin(turn.angle) * 31, y: -(p.y - Math.cos(turn.angle) * 31 - 31),
      vy: -p.vy, gravity: -(p.gravity ?? TUNING.gravity), groundAngle: -p.groundAngle,
      terrain: p.terrain?.map(mirrorPlatform), anim: { ...p.anim, footwork: null }, contacts: null })
    target = transferPose(target, aligned, [0, 0], smooth(turn.progress), [0, 0], 0, true, 0,
      { depth: Math.sin(Math.PI * turn.progress) * 8, kneeOpening: MIN_KNEE_OPENING, stableReach: true })
  }
  const source = turn.pose && (turn.facing === p.facing ? turn.pose : reflectAthletePose(turn.pose))
  const sourceBlend = smooth((turn.time ?? 0) / (turn.progress === undefined ? .18 : .1))
  let pose = source ? transferPose(source, target, [0, 0], sourceBlend, [0, 0], 0, turn.progress !== undefined, 0,
    turn.progress === undefined ? undefined : { depth: Math.sin(Math.PI * sourceBlend) * 8, kneeOpening: MIN_KNEE_OPENING, stableReach: true }) : target
  if (turn.progress !== undefined) pose = gatherTurn(pose, turn.progress)
  return rotatePose(pose, turn.angle, p.facing)
}

/** Tuck the limbs toward the trunk through the middle of a turn. */
function gatherTurn(pose: AthletePose, progress: number, amount = 1): AthletePose {
  const gather = Math.sin(Math.PI * progress) ** 2 * amount
  const hip = pose.hip, shoulder = pose.shoulder
  const leg = (part: Leg, back: boolean): Leg => ({ ...part,
    ...solveNear(part, add(hip, [back ? 8 : 12, 9]), 15, 14.5), planted: false })
  const arm = (part: Limb, back: boolean): Limb => {
    const tucked = solveNear(part, add(shoulder, [back ? 4 : 7, 10]), UPPER_ARM, FOREARM)
    return { ...tucked, ...(part.hand ? { hand: add(tucked.end, [part.hand[0] - part.end[0], part.hand[1] - part.end[1]]) } : {}) }
  }
  const tucked = { ...pose, frontLeg: leg(pose.frontLeg, false), backLeg: leg(pose.backLeg, true),
    frontArm: arm(pose.frontArm, false), backArm: arm(pose.backArm, true) }
  return transferPose(pose, tucked, [0, 0], gather, [0, 0], 0, true, 0,
    { depth: Math.sin(Math.PI * progress) * 8, kneeOpening: MIN_KNEE_OPENING, armOpening: Math.PI / 4, stableReach: true })
}
