import type { RobotState } from './challenge.ts'
import { bodySize } from './sizeFrame.ts'
import { AWAKENING_SECONDS, awakeningProgress, entranceVisibility } from './goal.ts'
import type { Player } from './model.ts'
import { SHOVE_RECOVERY } from './shove.ts'
import { awakeningPose, collapsedPose, presentedAthletePose } from './athletePose.ts'
import { wallFrameAngle } from './wallFrame.ts'

/** Rbot is this many times the player's size: its body, reach and rig, stepped and posed in a scaled frame (sizeFrame.ts). */
export const REPULSOR_BOT_SIZE = 1.35
/** And broader again than its size: a heavy machine, not a large player. */
export const REPULSOR_BOT_WIDTH_SCALE = 1.62
/** Its head is smaller than its size would make it, so the body carries the mass. */
const HEAD_SCALE = .8
/** The height Rbot sights and aims from, above its feet, at the player's size. */
const CHEST = 42
export const repulsorBotChestY = (robot: Pick<RobotState, 'y' | 'actor'>) => robot.y - CHEST * (robot.actor ? bodySize(robot.actor) : 1)
const smooth = (n: number) => { const t = Math.max(0, Math.min(1, n)); return t * t * (3 - 2 * t) }

/**
 * How far Rbot's broad build has moved from its frame's horizontal into its shell's own cross section. A swimmer and a
 * weightless floater lie along any direction, so broadening along the frame's horizontal would lengthen the body
 * instead. The physics view has no float, so the muzzle and aim never read it.
 */
const crossSection = (actor: Player) => smooth(Math.max(actor.waterMotion?.amount ?? 0, actor.anim.float?.blend ?? 0))

/** Broadening along the frame's horizontal, eased away while Rbot swims or floats (crossSection). */
export const repulsorBotWidthScale = (actor: Player) => 1 + (REPULSOR_BOT_WIDTH_SCALE - 1) * (1 - crossSection(actor))

/**
 * Where a point in Rbot's own pose units lands in the world: its width, size, facing and flip, turned into its wall
 * frame as the artwork is.
 */
export function repulsorBotPoint(actor: Player, [x, y]: readonly [number, number], width = repulsorBotWidthScale(actor)): [number, number] {
  const size = bodySize(actor), [dx, dy] = repulsorBotTurn(actor, [x * width * actor.facing * size, y * (actor.inverted ? -1 : 1) * size])
  return [actor.x + dx, actor.y + dy]
}
/** A world-axis vector of Rbot's standing frame, turned into its wall frame. */
export function repulsorBotTurn(actor: Pick<Player, 'wall'>, [x, y]: readonly [number, number]): [number, number] {
  const angle = wallFrameAngle(actor.wall), c = Math.cos(angle), s = Math.sin(angle)
  return [x * c - y * s, x * s + y * c]
}

/** Artwork and shadow geometry must use the same entrance or waking actor. */
export function repulsorBotPresentation(robot: RobotState) {
  const actor = robot.entrance?.player ?? robot.actor!
  const base = robot.awakening && robot.awakening.elapsed < AWAKENING_SECONDS ? awakeningPose(actor, awakeningProgress(robot.awakening.elapsed))
    : robot.collapse ? collapsedPose(presentedAthletePose(actor), smooth(robot.collapse)) : undefined
  return { actor, opacity: robot.entrance ? entranceVisibility(robot.entrance.elapsed) : 1, pose: repulsorBotPose(actor, base) }
}



/** Broaden the shell and upper limbs without sliding planted feet or palms. */
export function repulsorBotPose(actor: Player, pose = presentedAthletePose(actor)) {
  const scale = repulsorBotWidthScale(actor)
  const point = ([x, y]: readonly [number, number]): [number, number] => [x / scale, y]
  const gripping = !!(actor.climbing || actor.hang || actor.mantle || actor.wallBrace?.active || actor.pushing?.amount || actor.waterMotion)
  // Transfer the broad shell from the frame's horizontal to each plate's own cross section.
  // A horizontal swimmer or floater keeps its volume without lengthening the solved rig.
  const lying = crossSection(actor)
  const trunk = ([x, y]: readonly [number, number]): [number, number] => [x + (x / scale - x) * lying, y]
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
    shellWidth: 1 + (REPULSOR_BOT_WIDTH_SCALE - 1) * lying, headScale: HEAD_SCALE,
    // Keep the soles compact beneath the widened leg armor.
    forearmScale: 2.6, handScale: 2, calfScale: 2.6, footScale: 1, chestScale: 1,
    frontLeg: leg(pose.frontLeg), backLeg: leg(pose.backLeg), frontArm: arm(pose.frontArm), backArm: arm(pose.backArm) }
}
