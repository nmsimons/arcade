import type { Expedition, ExpeditionRuntime } from './expedition'
import { havenPosition, havenReady } from './campaign'

export function drawTeleporter(ctx: CanvasRenderingContext2D, state: Expedition, rt: ExpeditionRuntime, havenAngle=state.campaign.havenAngle) {
  if (!state.teleporterInstalled || !havenReady(state)) return
  const base = havenPosition(state)
  const arrival = rt.teleport ? rt.teleport.time / .6 : 0
  ctx.save(); ctx.translate(base.x, base.y); ctx.rotate(havenAngle)
  ctx.lineCap='round'; ctx.lineJoin='round'; ctx.shadowColor='#8ee5e8'
  // Each coil is symmetric about one paired hull segment. Its housing follows
  // Haven's rotation; only the energy inside it moves.
  for (let i = 0; i < 3; i++) {
    ctx.save(); ctx.rotate(i * Math.PI * 2 / 3)
    const pulse=.5+.5*Math.sin(rt.elapsed*1.7-i*Math.PI*2/3)
    const energy=Math.max(pulse,arrival), halfSpan=.46
    ctx.beginPath(); ctx.arc(0,0,58,-halfSpan,halfSpan)
    ctx.arc(0,0,51,halfSpan,-halfSpan,true); ctx.closePath()
    ctx.fillStyle='#8ee5e8'; ctx.globalAlpha=.055+energy*.045; ctx.fill()
    ctx.globalAlpha=.55; ctx.strokeStyle='#659a9d'; ctx.lineWidth=1; ctx.stroke()

    // A narrow luminous core and end contacts read as installed machinery.
    ctx.globalAlpha=.65+energy*.3; ctx.strokeStyle='#8ee5e8'
    ctx.lineWidth=1.5; ctx.shadowBlur=3+energy*3
    ctx.beginPath(); ctx.arc(0,0,54.5,-halfSpan+.055,halfSpan-.055); ctx.stroke()
    for(const side of [-1,1]) {
      const angle=side*halfSpan
      ctx.beginPath(); ctx.moveTo(Math.cos(angle)*50,Math.sin(angle)*50)
      ctx.lineTo(Math.cos(angle)*59,Math.sin(angle)*59); ctx.stroke()
    }
    // Paired charges travel outward together, preserving the coil's balance.
    const phase=(rt.elapsed*.32)%1, spread=.36*phase
    ctx.globalAlpha=(.2+.65*Math.sin(phase*Math.PI))*(.65+arrival*.35)
    ctx.strokeStyle='#dcffff'; ctx.lineWidth=2
    for(const side of [-1,1]) {
      ctx.beginPath(); ctx.arc(0,0,54.5,side*spread-.035,side*spread+.035); ctx.stroke()
    }

    // An emitter on the centerline connects the field to the inner hull node.
    ctx.shadowBlur=0; ctx.globalAlpha=.7; ctx.strokeStyle='#659a9d'; ctx.lineWidth=1
    ctx.beginPath(); ctx.moveTo(58,0); ctx.lineTo(74,0); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(61,0); ctx.lineTo(65,-3); ctx.lineTo(69,0); ctx.lineTo(65,3); ctx.closePath()
    ctx.fillStyle='#10282b'; ctx.fill(); ctx.strokeStyle='#8ee5e8'; ctx.stroke()
    ctx.globalAlpha=.55+energy*.45; ctx.fillStyle='#d1ffff'; ctx.shadowBlur=3+energy*3
    ctx.beginPath(); ctx.arc(65,0,1.1+arrival*.5,0,Math.PI*2); ctx.fill()
    ctx.restore()
  }
  ctx.restore()
  if (!rt.teleport) return
  const progress = 1 - rt.teleport.time / 0.6
  const turn = rt.elapsed * 0.18
  for (const [pos, incoming] of [[base, true], [rt.teleport.from, false]] as const) {
    ctx.save(); ctx.translate(pos.x, pos.y)
    ctx.strokeStyle = '#adfaff'; ctx.shadowColor = '#8ee5e8'; ctx.shadowBlur = 5
    ctx.globalAlpha = 1 - progress; ctx.lineWidth = 2
    const radius = 18 + (incoming ? 1 - progress : progress) * 62
    ctx.beginPath()
    for (let i = 0; i < 6; i++) {
      const angle = i * Math.PI / 3 + turn, x = Math.cos(angle) * radius, y = Math.sin(angle) * radius
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y)
    }
    ctx.closePath(); ctx.stroke(); ctx.restore()
  }
}
