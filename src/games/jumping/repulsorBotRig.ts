import { presentedAthletePose } from './athlete.ts'
import type { Player } from './model.ts'

export const REPULSOR_BOT_WIDTH_SCALE = 1.45

/** Broaden the shell and upper limbs without sliding planted feet or palms. */
export function repulsorBotPose(actor: Player) {
  const pose = presentedAthletePose(actor), scale = REPULSOR_BOT_WIDTH_SCALE
  const point = ([x, y]: readonly [number, number]): [number, number] => [x / scale, y]
  const leg = (limb: typeof pose.frontLeg) => ({ ...limb, joint: point(limb.joint), end: point(limb.end) })
  const gripping = !!(actor.climbing || actor.hang || actor.mantle || actor.wallBrace?.active || actor.pushing?.amount)
  const arm = (limb: typeof pose.frontArm) => gripping ? { ...limb, joint: point(limb.joint), end: point(limb.end),
    ...(limb.hand ? { hand: point(limb.hand) } : {}) } : limb
  return { ...pose, forearmScale: 2.6, calfScale: 2.6, footScale: 1.5,
    frontLeg: leg(pose.frontLeg), backLeg: leg(pose.backLeg), frontArm: arm(pose.frontArm), backArm: arm(pose.backArm) }
}
