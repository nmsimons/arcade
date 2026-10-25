import { presentedAthletePose } from './athlete.ts'
import type { Player } from './model.ts'
import { SHOVE_RECOVERY } from './shove.ts'

export const REPULSOR_BOT_WIDTH_SCALE = 1.45
const smooth = (n: number) => { const t = Math.max(0, Math.min(1, n)); return t * t * (3 - 2 * t) }

/** Screen-horizontal broadening flattens a pitched swimmer and its yaw turn. */
export const repulsorBotWidthScale = (actor: Player) => 1 + (REPULSOR_BOT_WIDTH_SCALE - 1) * (1 - smooth(actor.waterMotion?.amount ?? 0))

/** Broaden the shell and upper limbs without sliding planted feet or palms. */
export function repulsorBotPose(actor: Player, pose = presentedAthletePose(actor)) {
  const scale = repulsorBotWidthScale(actor)
  const point = ([x, y]: readonly [number, number]): [number, number] => [x / scale, y]
  const gripping = !!(actor.climbing || actor.hang || actor.mantle || actor.wallBrace?.active || actor.pushing?.amount || actor.waterMotion)
  // Transfer the broad shell from screen X to each plate's own cross section.
  // A horizontal swimmer keeps its volume without lengthening the solved rig.
  const swimming = smooth(actor.waterMotion?.amount ?? 0)
  const trunk = ([x, y]: readonly [number, number]): [number, number] => [x + (x / scale - x) * swimming, y]
  const leg = (limb: typeof pose.frontLeg) => ({ ...limb, root: trunk(limb.root), joint: point(limb.joint), end: point(limb.end) })
  const shove = actor.shove, amount = gripping ? 1 : shove ? smooth(shove.time / .035)
    * (1 - smooth((shove.time - shove.windup - .04) / (SHOVE_RECOVERY - .04))) : 0
  const armPoint = ([x, y]: readonly [number, number]): [number, number] => [x + (x / scale - x) * amount, y]
  const arm = (limb: typeof pose.frontArm) => {
    if (!amount) return limb
    const angle = limb.handAngle ?? Math.atan2(limb.end[1] - limb.joint[1], limb.end[0] - limb.joint[0])
    const palm = limb.hand ?? [limb.end[0] + Math.cos(angle) * 1.4, limb.end[1] + Math.sin(angle) * 1.4] as const
    return { ...limb, root: trunk(limb.root), joint: armPoint(limb.joint), end: armPoint(limb.end),
      ...(actor.waterMotion ? { hand: armPoint(palm), handAngle: Math.atan2(Math.sin(angle), Math.cos(angle) / scale) }
        : limb.hand ? { hand: armPoint(limb.hand) } : {}) }
  }
  return { ...pose, hip: trunk(pose.hip), waist: trunk(pose.waist), shoulder: trunk(pose.shoulder), head: trunk(pose.head),
    shellWidth: 1 + (REPULSOR_BOT_WIDTH_SCALE - 1) * swimming,
    forearmScale: 2.6, handScale: 2, calfScale: 2.6, footScale: 1.5,
    frontLeg: leg(pose.frontLeg), backLeg: leg(pose.backLeg), frontArm: arm(pose.frontArm), backArm: arm(pose.backArm) }
}
