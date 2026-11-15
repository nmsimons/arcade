import type { RobotState } from './challenge.ts'
import type { WorldPaint } from './worldPaint.ts'
import { REPULSOR_BOT_WINDUP, repulsorBotHand } from './repulsorBot.ts'
import { repulsorBotPresentation, repulsorBotWidthScale } from './repulsorBotRig.ts'
import { robotHeadlightPose } from './robotHeadlight.ts'
import { ROBOT_PALETTE } from './equipmentPalette.ts'
import { drawAthlete } from './athleteDraw.ts'
import { bodySize } from './sizeFrame.ts'

/** The visor slit across Rbot's face, in its head's own units, and its repulsor's amber. */
const VISOR = { x: 1.2, y: -2.2, w: 4.6, h: 1.9, color: '#ffd27a' }

/** The player's solved walk, feet, grips and arm animation with stockier proportions, at Rbot's size. */
export function drawRepulsorBot(ctx: CanvasRenderingContext2D, robot: RobotState, powered: boolean, paint: WorldPaint, headlightFade = 0) {
  const { actor, pose, opacity } = repulsorBotPresentation(robot)
  if (opacity <= 0) return
  paint(ctx, 0, () => {
    ctx.save(); ctx.globalAlpha *= opacity; ctx.translate(actor.x, actor.y); ctx.scale(repulsorBotWidthScale(actor), 1)
    drawAthlete(ctx, { ...actor, x: 0, y: 0 }, ROBOT_PALETTE.body, pose)
    ctx.restore()
  })
  // A lit visor, so the robot reads at night, as long as it has power and its face is turned toward us.
  if (powered && !actor.climbing && (pose.backView ?? 0) < .5) paint(ctx, 1, () => {
    const size = bodySize(actor)
    ctx.save(); ctx.globalAlpha *= opacity; ctx.translate(actor.x, actor.y); ctx.scale(repulsorBotWidthScale(actor), 1)
    ctx.scale(actor.facing * size, (actor.inverted ? -1 : 1) * size); ctx.translate(...pose.head); ctx.rotate(pose.headTilt ?? 0)
    ctx.scale(pose.headScale ?? 1, pose.headScale ?? 1); ctx.scale(pose.shellWidth ?? 1, 1); ctx.fillStyle = VISOR.color
    ctx.beginPath(); ctx.roundRect(VISOR.x, VISOR.y, VISOR.w, VISOR.h, VISOR.h / 2); ctx.fill()
    ctx.restore()
  })
  if (robot.entrance) return
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
