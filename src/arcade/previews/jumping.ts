import { createPlayer } from '../../games/jumping/model'
import { drawAthlete } from '../../games/jumping/render'

export function drawPreview(ctx: CanvasRenderingContext2D, width: number, height: number) {
  ctx.fillStyle = '#eeeee5'; ctx.fillRect(0, 0, width, height)
  ctx.save(); ctx.scale(width / 360, height / 230)
  ctx.strokeStyle = '#2536380a'; ctx.lineWidth = 1
  for (let x = 0; x < 360; x += 40) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 230); ctx.stroke() }
  ctx.fillStyle = '#c7cfc4'; ctx.fillRect(0, 185, 120, 45); ctx.fillRect(175, 135, 185, 95)
  ctx.fillStyle = '#697d72'; ctx.fillRect(0, 185, 120, 3); ctx.fillRect(175, 135, 185, 3)
  ctx.fillStyle = '#df633f'; ctx.fillRect(175, 135, 28, 4)
  const player = createPlayer(); Object.assign(player, { x: 139, y: 133, grounded: false, vx: 270, vy: -150, stride: 1.8 })
  drawAthlete(ctx, player)
  ctx.restore()
}
