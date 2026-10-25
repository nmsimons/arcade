import { createRun, stepRun } from './jumping-active-run.mjs'
import { createPlayer, NEUTRAL_INPUT, STEP } from '../../src/games/jumping/model.ts'
import { createRepulsorActor } from '../../src/games/jumping/repulsorBot.ts'
import { repulsorBotPose, REPULSOR_BOT_WIDTH_SCALE } from '../../src/games/jumping/repulsorBotRig.ts'

/** Recreate the observed approach in the actual Quarantine II geometry. The
 * trap starts open; the player's ordinary plate press closes it during flight. */
export function createRbotFieldApproach(level) {
  const run = createRun(level), bot = run.robots[0]
  bot.actor = createRepulsorActor(500, 610); bot.x = 500; bot.y = 610; bot.facing = 1
  run.player = createPlayer({ x: 580, y: 375 })
  run.triggers.at(-1).active = false
  return { run, bot, pressing: false }
}

export function stepRbotFieldApproach(scene, dt = STEP) {
  const { run, bot } = scene
  if (!scene.pressing && bot.actor.vy < -100 && bot.y < 570) {
    // Move the test driver onto the lower approach once a real AI jump has
    // begun. From here the field changes solely through walking and wiring.
    run.player = createPlayer({ x: 400, y: 610 }); scene.pressing = true
  }
  stepRun(run, { ...NEUTRAL_INPUT, move: scene.pressing ? Math.max(-1, Math.min(1, (345 - run.player.x) / 45)) : 0 }, dt)
}

/** Visible material points in the body frame, including widened shells and
 * explicit/implicit palms. Root travel cannot mask a pose discontinuity. */
export function rbotFieldRigPoints(actor) {
  const pose = repulsorBotPose(actor), arms = [pose.frontArm, pose.backArm]
  const points = [pose.hip, pose.waist, pose.shoulder, pose.head,
    ...[...arms, pose.frontLeg, pose.backLeg].flatMap(limb => [limb.root, limb.joint, limb.end]),
    ...arms.map(arm => {
      const angle = arm.handAngle ?? Math.atan2(arm.end[1] - arm.joint[1], arm.end[0] - arm.joint[0])
      return arm.hand ?? [arm.end[0] + Math.cos(angle) * 1.4, arm.end[1] + Math.sin(angle) * 1.4]
    })]
  return points.map(([x, y]) => [x * actor.facing * REPULSOR_BOT_WIDTH_SCALE, y * (actor.inverted ? -1 : 1)])
}
