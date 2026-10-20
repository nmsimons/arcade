import { drawSleeve } from './sleeveArtwork.ts'
import type { Prop, Run } from './challenge.ts'
import { propHeight } from './propGeometry.ts'
import { REPULSOR_BEAM_SECONDS, REPULSOR_IMPACT_SECONDS } from './gadgets.ts'

export function drawLooseGadget(ctx: CanvasRenderingContext2D, prop: Prop) {
  ctx.save(); ctx.translate(prop.x, prop.y - propHeight(prop) / 2); ctx.rotate(prop.angle)
  drawSleeve(ctx, prop.gadget!, prop.size); ctx.restore()
}
export function drawGadgets(ctx: CanvasRenderingContext2D, run: Run) {
  if (run.gadgets.feedback === 'EMP · power off' && run.gadgets.feedbackTime > .55) {
    const age = 1.1 - run.gadgets.feedbackTime
    ctx.save(); ctx.globalAlpha *= 1 - age / .55; ctx.strokeStyle = '#d6b86e'; ctx.lineWidth = 2
    ctx.beginPath(); ctx.arc(run.player.x, run.player.y - 30, 20 + age * 220, 0, Math.PI * 2); ctx.stroke(); ctx.restore()
  }
  if (run.gadgets.nearby && !run.gadgets.held) {
    const prop = run.gadgets.nearby
    ctx.strokeStyle = '#9a8654'; ctx.lineWidth = 1.5
    const x = prop.x, y = prop.y - propHeight(prop) - 9
    ctx.beginPath(); ctx.moveTo(x - 4, y - 3); ctx.lineTo(x, y); ctx.lineTo(x + 4, y - 3); ctx.stroke()
  }
  for (const pulse of run.gadgets.pulses) {
    if (pulse.age < REPULSOR_BEAM_SECONDS) {
      ctx.save(); ctx.globalAlpha *= Math.max(0, 1 - pulse.age / REPULSOR_BEAM_SECONDS)
      ctx.strokeStyle = '#d6b86e'; ctx.lineWidth = 3
      ctx.beginPath(); ctx.moveTo(...pulse.from); ctx.lineTo(...pulse.to); ctx.stroke(); ctx.restore()
    }
    ctx.save(); ctx.globalAlpha *= Math.max(0, 1 - pulse.age / REPULSOR_IMPACT_SECONDS)
    ctx.strokeStyle = '#d6b86e'; ctx.lineWidth = 2
    ctx.beginPath(); ctx.arc(pulse.to[0], pulse.to[1], 4 + pulse.age * 45, 0, Math.PI * 2); ctx.stroke(); ctx.restore()
  }
}
