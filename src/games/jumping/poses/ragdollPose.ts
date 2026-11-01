// Impact ragdoll joints applied to the captured source pose.
import { resolveAthletePose } from '../athletePose.ts'
import { add, rotatePose, smooth, transferPose } from '../athleteRig.ts'
import type { AthletePose, Leg } from '../athleteRig.ts'
import type { ImpactJoint } from '../impactRagdoll.ts'
import { limitLimbBend } from '../limbPose.ts'
import type { Limb, Point } from '../limbPose.ts'
import { clearLoosePose } from './fallPose.ts'
import type { Player } from '../characterTypes.ts'

export function impactRagdollPose(p: Player): AthletePose {
  const motion = p.ragdoll!
  const blend = motion.kind === 'landing' ? smooth(motion.time / .08) : smooth((motion.time - .1) / .4)
  // The repulsor's initial hold has no target contribution. A falling target
  // also defers its loose clearance until after the joint springs are applied.
  let pose = blend === 0 ? motion.source
    : transferPose(motion.source, resolveAthletePose({ ...p, ragdoll: null }, true), [0, 0], blend, [0, 0], 0, true)
  const release = Math.min(.16, motion.duration * .3)
  const weight = 1 - smooth((motion.time - release) / (motion.duration - release))
  const angle = (name: ImpactJoint) => motion.joints[name].angle * weight
  pose = rotatePose(pose, angle('body'), 1, pose.hip)
  // Neck and each two-bone chain retain their exact projected and depth
  // lengths. The springs rotate the joints, rather than stretching endpoints.
  const turn = (point: Point, pivot: Point, a: number): Point => {
    const x = point[0] - pivot[0], y = point[1] - pivot[1]
    return [pivot[0] + x * Math.cos(a) - y * Math.sin(a), pivot[1] + x * Math.sin(a) + y * Math.cos(a)]
  }
  pose.head = turn(pose.head, pose.shoulder, angle('neck'))
  pose.headTilt = (pose.headTilt ?? 0) + angle('neck')
  const limb = <T extends Limb>(part: T, a: number, lower: number): T => {
    const b = a + lower
    const joint = turn(part.joint, part.root, a)
    const end = add(joint, turn([part.end[0] - part.joint[0], part.end[1] - part.joint[1]], [0, 0], b))
    const hand = part.hand && add(end, turn([part.hand[0] - part.end[0], part.hand[1] - part.end[1]], [0, 0], b))
    return { ...part, joint, end, hand, handAngle: part.handAngle === undefined ? undefined : part.handAngle + b }
  }
  pose.frontArm = limb(pose.frontArm, angle('frontShoulder'), angle('frontElbow'))
  pose.backArm = limb(pose.backArm, angle('backShoulder'), angle('backElbow'))
  const leg = (part: Leg, upper: ImpactJoint, lower: ImpactJoint): Leg => {
    const hip = angle(upper), knee = limitLimbBend(part, angle(lower))
    return { ...limb(part, hip, knee), footAngle: part.footAngle + (hip + knee) / part.footFacing, planted: false }
  }
  pose.frontLeg = leg(pose.frontLeg, 'frontHip', 'frontKnee')
  pose.backLeg = leg(pose.backLeg, 'backHip', 'backKnee')
  return clearLoosePose(p, pose)
}
