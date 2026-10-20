import type { GadgetKind } from './gadgets.ts'

export function drawSleeve(ctx: CanvasRenderingContext2D, kind: GadgetKind, size: number, blocked = false) {
  ctx.save(); ctx.scale(size / 40, size / 40)
  ctx.fillStyle = '#52665f'; ctx.strokeStyle = '#354b43'; ctx.lineWidth = 1
  // A hollow cuff with a directional emitter; nothing projects as a handle.
  ctx.beginPath(); ctx.roundRect(-8, -4, 16, 8, 2); ctx.fill(); ctx.stroke()
  ctx.fillStyle = '#a3b1a8'; ctx.fillRect(-7, -3.5, 2, 7)
  ctx.fillStyle = blocked ? '#a66c55' : '#d6b86e'
  if (kind === 'emp') {
    ctx.beginPath(); ctx.moveTo(1, -3); ctx.lineTo(-2, .5); ctx.lineTo(.5, .5)
    ctx.lineTo(-.5, 3); ctx.lineTo(3, -.5); ctx.lineTo(.5, -.5); ctx.closePath(); ctx.fill()
    ctx.fillStyle = '#8f9e98'; ctx.fillRect(5, -3, 2, 6)
  } else {
    ctx.fillRect(-2, -2.5, 5, 1.5)
    ctx.fillStyle = '#8f9e98'; ctx.fillRect(4, -3.5, 3, 7)
    ctx.fillStyle = '#354b43'; ctx.fillRect(7, -2.5, 1, 5)
  }
  ctx.restore()
}
