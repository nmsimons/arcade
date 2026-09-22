import { drawPlayerShip, freshShipAppearance } from '../../games/hardVacuum/shipRender'
import { drawHaven } from '../../games/hardVacuum/havenRender'

export function drawPreview(ctx: CanvasRenderingContext2D, width: number, height: number) {
  ctx.fillStyle = '#050808'; ctx.fillRect(0, 0, width, height)
  ctx.save(); ctx.translate(width / 2, height / 2)
  const scale = Math.min(width / 400, height / 250)
  ctx.scale(scale, scale)
  drawHaven(ctx, { pos: { x: 64, y: -7 }, angle: -.15, deployment: 1 }, 0, 0, 0, 4)
  const appearance = freshShipAppearance(); appearance.thrust = .65
  drawPlayerShip(ctx, { pos: { x: -112, y: 35 }, vel: { x: 0, y: 0 }, angle: -.3, radius: 15 }, appearance,
    { time: 0, shields: 2, maxShields: 2, hitAge: -1, rechargeAge: -1, recharging: false, rechargeProgress: 0, laser: false })
  ctx.restore()
}
