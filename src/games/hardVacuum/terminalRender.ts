import type { Expedition, ExpeditionRuntime } from './expedition'
import type { Ship } from './types'
import { TERMINALS, TERMINAL_OUTLINE } from './terminals'
import { recordAvailable } from './campaign'
import { inRenderView } from './renderView'
import type { RenderView } from './renderView'

export function drawTerminals(ctx: CanvasRenderingContext2D, s: Expedition, rt: Pick<ExpeditionRuntime,'connectedTerminal'|'elapsed'>, ship: Pick<Ship,'pos'>, terminals=TERMINALS, view?:RenderView) {
  for (const terminal of terminals) {
    if(!inRenderView(terminal.pos,100,view))continue
    const connected = rt.connectedTerminal === terminal.terminalId
    const heard = s.campaign.records.includes(terminal.terminalId!)
    const color = connected ? '#65efb2' : '#6bcaff'
    ctx.save(); ctx.translate(terminal.pos.x,terminal.pos.y)
    ctx.beginPath()
    TERMINAL_OUTLINE.forEach(([x,y],i)=>i ? ctx.lineTo(x,y) : ctx.moveTo(x,y))
    // A translucent inset and broken floor seam replace the raised, solid housing.
    // Keep the deck visible beneath it, with no wall-like rim, bevel or bolts.
    ctx.closePath(); ctx.fillStyle='#193d392e'; ctx.fill()
    ctx.strokeStyle='#365950'; ctx.lineWidth=.7
    ctx.setLineDash([3,4]); ctx.stroke(); ctx.setLineDash([])
    // Fine traces lie in the deck; the blue socket remains the interactive focus.
    ctx.strokeStyle='#294b48'; ctx.lineWidth=.8
    for (const side of [-1,1]) {
      ctx.beginPath(); ctx.moveTo(side*14,7); ctx.lineTo(side*21,14)
      ctx.lineTo(side*21,34); ctx.lineTo(side*30,43); ctx.stroke()
    }
    ctx.fillStyle='#061e2499'; ctx.fillRect(-16,-25,32,12)
    ctx.strokeStyle='#29464d'; ctx.strokeRect(-16,-25,32,12)
    const scroll = Math.floor(rt.elapsed*(connected ? 5 : 1.5))
    for (let row=0;row<3;row++) {
      ctx.fillStyle=connected ? '#8ceac1' : '#83bdcf'
      ctx.fillRect(-13,-23+row*3,5+(row+scroll)%3*4,1)
      ctx.fillStyle='#426e7c'; ctx.fillRect(4,-23+row*3,8-(row+scroll)%3*2,1)
    }
    // Stored recordings remain visibly online after download.
    ctx.fillStyle=heard ? '#83c7ac' : '#8bafb6'
    ctx.font='6px monospace'; ctx.textAlign='center'; ctx.fillText('LOG',0,23)
    ctx.strokeStyle=color; ctx.lineWidth=1.3
    ctx.beginPath(); ctx.arc(0,0,9,0,Math.PI*2); ctx.stroke()
    for (let i=0;i<3;i++) {
      const angle=i*Math.PI*2/3-Math.PI/2
      ctx.beginPath(); ctx.arc(0,0,13,angle-.3,angle+.3); ctx.stroke()
      ctx.beginPath(); ctx.moveTo(Math.cos(angle)*9,Math.sin(angle)*9)
      ctx.lineTo(Math.cos(angle)*13,Math.sin(angle)*13); ctx.stroke()
    }
    if (connected) {
      const angle=Math.atan2(ship.pos.y-terminal.pos.y,ship.pos.x-terminal.pos.x)
      const x=Math.cos(angle),y=Math.sin(angle)
      const edge=Math.min(24/Math.abs(x),30/Math.abs(y),47/(Math.abs(x)+Math.abs(y)))
      ctx.strokeStyle='#9dffcf'; ctx.lineWidth=1.2
      ctx.beginPath(); ctx.moveTo(x*3,y*3); ctx.lineTo(x*edge,y*edge); ctx.stroke()
      ctx.fillStyle='#c4ffe2'; ctx.beginPath(); ctx.arc(0,0,3,0,Math.PI*2); ctx.fill()
      const pulse=(rt.elapsed*1.4)%1
      ctx.globalAlpha=(1-pulse)*.5
      ctx.beginPath(); ctx.arc(0,0,9+pulse*7,0,Math.PI*2); ctx.stroke()
    } else {
      ctx.globalAlpha=.35+.2*Math.sin(rt.elapsed*2.4)
      ctx.fillStyle=color; ctx.beginPath(); ctx.arc(0,0,3,0,Math.PI*2); ctx.fill()
    }
    ctx.restore()
    // Availability is useful equipment status; tether controls belong in training.
    if(terminal.terminalId!=='training-log' && !recordAvailable(s,terminal.terminalId!)) {
      ctx.save();ctx.font='10px monospace';ctx.textAlign='center';ctx.fillStyle='#7b9eab'
      ctx.fillText('OFFLINE',terminal.pos.x,terminal.pos.y+49)
      ctx.restore()
    }
  }
}
