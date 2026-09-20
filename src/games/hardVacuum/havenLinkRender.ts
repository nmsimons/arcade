import type { Vector2 } from './types'

/** A telescoping center socket disappears under its closing commissioning hatch. */
export function drawHavenLink(ctx:CanvasRenderingContext2D,pos:Vector2,time:number,deployment:number,connected:boolean) {
  if (deployment<=0) return
  const t=1-Math.min(1,deployment),closed=t*t*(3-2*t)
  const color=connected || t>0 ? '#a0ffd0' : '#7bcfff'
  ctx.save();ctx.translate(pos.x,pos.y)
  ctx.globalAlpha=Math.min(1,deployment*5)
  ctx.lineJoin='round';ctx.lineWidth=1.4;ctx.strokeStyle='#637f7f';ctx.fillStyle='#0a1517'
  ctx.beginPath()
  for(const [i,[x,y]] of [[-15,-21],[15,-21],[21,-15],[21,15],[15,21],[-15,21],[-21,15],[-21,-15]].entries())
    if(i)ctx.lineTo(x,y);else ctx.moveTo(x,y)
  ctx.closePath();ctx.fill();ctx.stroke()
  ctx.save();ctx.beginPath();ctx.rect(-18,-18,36,36);ctx.clip()
  // Lower the socket into the hub before the two cover leaves meet over it.
  ctx.translate(0,closed*8);ctx.scale(1-closed*.35,1-closed*.35)
  ctx.beginPath();ctx.arc(0,0,16,0,Math.PI*2);ctx.fillStyle='#081317';ctx.fill()
  ctx.strokeStyle=color;ctx.lineWidth=1.6;ctx.stroke()
  ctx.shadowColor=color;ctx.shadowBlur=connected ? 7 : 4+Math.sin(time*3)*2
  ctx.lineWidth=2.2;ctx.beginPath();ctx.arc(0,0,7,0,Math.PI*2);ctx.stroke()
  if(connected) {
    ctx.fillStyle='#c4ffe2';ctx.beginPath();ctx.arc(0,0,2.5,0,Math.PI*2);ctx.fill()
    ctx.shadowBlur=0;ctx.lineWidth=1;ctx.beginPath();ctx.arc(0,0,9+(time*1.4%1)*5,0,Math.PI*2);ctx.stroke()
  }
  ctx.restore()
  if(closed>0) {
    const width=18*closed
    ctx.fillStyle='#13221e';ctx.strokeStyle='#839a8d';ctx.lineWidth=1
    for(const x of [-18,18-width]) {ctx.fillRect(x,-18,width,36);ctx.strokeRect(x,-18,width,36)}
  }
  ctx.font='9px monospace';ctx.textAlign='center';ctx.fillStyle=color
  ctx.fillText(t>0 ? 'LINK STOWING' : connected ? 'RECOVERY ONLINE' : 'TETHER LINK',0,-31)
  ctx.restore()
}
