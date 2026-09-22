import { BALL_RADIUS, createArena } from '../../games/bumperBall/physics'
import { drawBall, drawBumper, drawCourt, drawGoal, drawGoalFrame, drawVehicle } from '../../games/bumperBall/render'
import { createVehicleAppearance } from '../../games/bumperBall/appearance'

export function drawPreview(ctx: CanvasRenderingContext2D, width: number, height: number, compact: boolean) {
  const arena = createArena()
  ctx.fillStyle = '#243e43'; ctx.fillRect(0, 0, width, height)
  ctx.save()
  ctx.translate(width / 2, height / 2)
  const scale = width / (compact ? 290 : 245)
  ctx.scale(scale, scale); ctx.translate(-658, -460)
  drawCourt(ctx, arena.goals)
  arena.goals.forEach(goal => drawGoal(ctx, goal))
  arena.bumpers.forEach(bumper => drawBumper(ctx, bumper))
  const appearance = createVehicleAppearance()
  drawVehicle(ctx, { pos: { x: 610, y: compact ? 450 : 415 }, vel: { x: 0, y: 0 }, angle: .55, wheelAngle: 1, side: 'left' }, 0, appearance)
  drawVehicle(ctx, { pos: { x: 725, y: compact ? 469 : 510 }, vel: { x: 0, y: 0 }, angle: -2.5, wheelAngle: 1, side: 'right' }, 0, appearance)
  drawBall(ctx, { pos: { x: 665, y: 462 }, vel: { x: 0, y: 0 }, radius: BALL_RADIUS }, { x: 1, y: .4, z: .7 }, .8)
  arena.goals.forEach(goal => drawGoalFrame(ctx, goal, 0, false))
  ctx.restore()
}
