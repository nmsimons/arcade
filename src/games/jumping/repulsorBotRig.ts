import { presentedAthletePose } from './athlete.ts'
import type { Player } from './model.ts'
import { SHOVE_RECOVERY } from './shove.ts'

export const REPULSOR_BOT_WIDTH_SCALE = 1.45

/** Broaden the shell and upper limbs without sliding planted feet or palms. */
export function repulsorBotPose(actor: Player, pose = presentedAthletePose(actor)) {
  const scale = REPULSOR_BOT_WIDTH_SCALE
  const point = ([x, y]: readonly [number, number]): [number, number] => [x / scale, y]
  const leg = (limb: typeof pose.frontLeg) => ({ ...limb, joint: point(limb.joint), end: point(limb.end) })
  const gripping = !!(actor.climbing || actor.hang || actor.mantle || actor.wallBrace?.active || actor.pushing?.amount)
  const smooth = (n: number) => { const t = Math.max(0, Math.min(1, n)); return t * t * (3 - 2 * t) }
  const shove = actor.shove, amount = gripping ? 1 : shove ? smooth(shove.time / .035)
    * (1 - smooth((shove.time - shove.windup - .04) / (SHOVE_RECOVERY - .04))) : 0
  const armPoint = ([x, y]: readonly [number, number]): [number, number] => [x + (x / scale - x) * amount, y]
  const arm = (limb: typeof pose.frontArm) => amount ? { ...limb, joint: armPoint(limb.joint), end: armPoint(limb.end),
    ...(limb.hand ? { hand: armPoint(limb.hand) } : {}) } : limb
  return { ...pose, forearmScale: 2.6, handScale: 2, calfScale: 2.6, footScale: 1.5,
    frontLeg: leg(pose.frontLeg), backLeg: leg(pose.backLeg), frontArm: arm(pose.frontArm), backArm: arm(pose.backArm) }
}
