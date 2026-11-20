import type { GadgetKind } from './gadgets.ts'
import { EMP_PALETTE, ROBOT_PALETTE, TRACTOR_PALETTE } from './equipmentPalette.ts'

export function drawSleeve(ctx: CanvasRenderingContext2D, kind: GadgetKind, size: number, blocked = false) {
  const colors = kind === 'emp' ? EMP_PALETTE : kind === 'tractor' ? TRACTOR_PALETTE : ROBOT_PALETTE
  ctx.save(); ctx.scale(size / 40, size / 40)
  ctx.fillStyle = colors.body
  // A hollow cuff with a directional emitter; nothing projects as a handle.
  ctx.beginPath(); ctx.roundRect(-8, -4, 16, 8, 2); ctx.fill()
  // Broad lit and shaded surfaces suggest a curved shell without an ink border.
  ctx.save(); ctx.clip()
  ctx.fillStyle = '#ffffff'; ctx.globalAlpha *= .13; ctx.fillRect(-8, -4, 16, 2)
  ctx.restore()
  ctx.save(); ctx.clip()
  ctx.fillStyle = '#000000'; ctx.globalAlpha *= .12; ctx.fillRect(-8, 1.5, 16, 2.5)
  ctx.restore()
  ctx.fillStyle = colors.metal; ctx.fillRect(-7, -3, 2, 6)
  ctx.fillStyle = colors.trim; ctx.fillRect(-7, -3, 2, 1)
  ctx.fillStyle = blocked ? '#a66c55' : colors.light
  if (kind === 'emp') {
    ctx.beginPath(); ctx.moveTo(1, -3); ctx.lineTo(-2, .5); ctx.lineTo(.5, .5)
    ctx.lineTo(-.5, 3); ctx.lineTo(3, -.5); ctx.lineTo(.5, -.5); ctx.closePath(); ctx.fill()
    ctx.fillStyle = colors.metal; ctx.fillRect(5, -3, 2, 6)
  } else if (kind === 'tractor') {
    // An inward chevron and a forked emitter: two prongs around an open mouth.
    ctx.beginPath(); ctx.moveTo(2, -2.5); ctx.lineTo(-1.5, 0); ctx.lineTo(2, 2.5); ctx.lineTo(2, 1)
    ctx.lineTo(.5, 0); ctx.lineTo(2, -1); ctx.closePath(); ctx.fill()
    ctx.fillStyle = colors.metal; ctx.fillRect(4, -4, 4, 2.5); ctx.fillRect(4, 1.5, 4, 2.5)
    ctx.save(); ctx.globalAlpha *= .18
    ctx.fillStyle = '#000000'; ctx.fillRect(4, -1.5, 2, 3); ctx.restore()
  } else {
    ctx.fillRect(-2, -2.5, 5, 1.5)
    ctx.fillStyle = colors.metal; ctx.fillRect(4, -3.5, 3, 7)
    ctx.save(); ctx.globalAlpha *= .18
    ctx.fillStyle = '#000000'; ctx.fillRect(6, -2.5, 1, 5); ctx.restore()
  }
  ctx.restore()
}
