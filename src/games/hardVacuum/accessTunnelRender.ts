import { OUTER_LOCK, outerLockProgress } from './campaignWorld'
import { drawGateObject } from './gateRender'
import { BREACH_ANCHORAGE_SIGN, drawWayfindingSign } from './stationWayfinding'

/** A plain sealed lock, opened only for Haven's final departure. */
export function drawAccessTunnel(ctx: CanvasRenderingContext2D, departing: boolean) {
  ctx.save()
  for(const y of [2826,2974]) {
    ctx.strokeStyle='#3b564c';ctx.lineWidth=2
    ctx.beginPath();ctx.moveTo(8790,y);ctx.lineTo(9340,y);ctx.stroke()
    for(let x=8810;x<9350;x+=80) {
      ctx.fillStyle=departing ? '#83c9ac' : '#95aca0'
      ctx.fillRect(x,y-2,12,4)
    }
  }
  drawWayfindingSign(ctx,BREACH_ANCHORAGE_SIGN)
  ctx.font='10px monospace';ctx.textAlign='center'
  ctx.fillStyle=departing ? '#83c9ac' : '#b3a17e'
  ctx.fillText(departing ? 'LAUNCH AUTHORIZED' : 'OUTER LOCK / SEALED',9180,2947)
  drawGateObject(ctx,OUTER_LOCK,outerLockProgress(departing))
  ctx.restore()
}
