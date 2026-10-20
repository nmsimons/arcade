import type { RobotState } from './challenge.ts'
import { drawAthlete } from './athlete.ts'
import type { WorldPaint } from './worldPaint.ts'
import { REPULSOR_BOT_WIDTH_SCALE, REPULSOR_BOT_WINDUP, repulsorBotHand } from './repulsorBot.ts'
import { repulsorBotPose } from './repulsorBotRig.ts'
import { robotHeadlightPose } from './robotHeadlight.ts'

/** The player's solved walk, feet, grips and arm animation with stockier proportions. */
export function drawRepulsorBot(ctx: CanvasRenderingContext2D, robot: RobotState, powered: boolean, paint: WorldPaint, headlightFade = 0) {
  const actor = robot.actor!
  const pose = repulsorBotPose(actor)
  paint(ctx, 0, () => {
    ctx.save(); ctx.translate(actor.x, actor.y); ctx.scale(REPULSOR_BOT_WIDTH_SCALE, 1)
    drawAthlete(ctx, { ...actor, x: 0, y: 0 }, '#b66d65', pose)
    ctx.restore()
  })
  if (headlightFade > 0) {
    const light = robotHeadlightPose(robot)
    paint(ctx, 1, () => {
      ctx.save(); ctx.globalAlpha *= headlightFade; ctx.fillStyle = '#f4f2e9'
      ctx.beginPath(); ctx.arc(light.x, light.y, 1.7, 0, Math.PI * 2); ctx.fill(); ctx.restore()
    })
  }
  if (!powered || robot.phase !== 'windup') return
  const { from, direction } = repulsorBotHand(robot), charge = Math.min(1, robot.time / REPULSOR_BOT_WINDUP)
  paint(ctx, 1, () => {
    ctx.save(); ctx.translate(...from); ctx.rotate(Math.atan2(direction[1], direction[0]))
    ctx.fillStyle = '#e5bf77'
    for (let i = 0; i < 3; i++) {
      ctx.globalAlpha = .25 + .75 * Math.max(0, Math.min(1, charge * 3 - i))
      ctx.fillRect(-4 - i * 5, -5, 2.5, 10)
    }
    ctx.globalAlpha = .5 + .5 * charge; ctx.fillStyle = '#fff2c7'
    ctx.beginPath(); ctx.arc(0, 0, 1.5 + charge * 2, 0, Math.PI * 2); ctx.fill(); ctx.restore()
  })
}
