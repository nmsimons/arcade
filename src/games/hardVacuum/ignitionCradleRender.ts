import { IGNITION_CRADLE, IGNITION_CRADLE_ANGLE } from './campaignWorld'
import { IGNITION_SEAT_SECONDS, IGNITION_START_SECONDS } from './ignitionCradle'
import type { Expedition, ExpeditionRuntime } from './expedition'
import { box, drawModel, prism } from './objectModels'
import { drawCargo } from './cargoRender'

const AMBER='#c8a66b',LIVE='#9df1c7'
const side=[[-10,-44],[10,-37],[10,37],[-10,44]] as const
const frame=[prism(side,20,AMBER,[-68,0,0]),prism(side.map(([x,y])=>[-x,-y] as const),20,AMBER,[68,0,0])]

export function drawIgnitionCradle(ctx: CanvasRenderingContext2D,s: Expedition,rt: ExpeditionRuntime) {
  const latch=rt.coreLatch,progress=s.core ? 1 : Math.min(1,(latch?.time ?? 0)/IGNITION_START_SECONDS)
  const grip=s.core ? 1 : Math.min(1,(latch?.time ?? 0)/IGNITION_SEAT_SECONDS)
  const live=s.core || progress>.3,time=rt.elapsed
  ctx.save();ctx.translate(IGNITION_CRADLE.x,IGNITION_CRADLE.y)
  ctx.rotate(IGNITION_CRADLE_ANGLE)
  // A matching empty core seat is etched into the deck, not an invisible wall.
  ctx.strokeStyle=live ? '#9df1c770' : '#c8a66b65';ctx.lineWidth=1.3
  ctx.beginPath()
  for(let i=0;i<8;i++){const a=i*Math.PI/4,x=Math.cos(a)*40,y=Math.sin(a)*40;if(i)ctx.lineTo(x,y);else ctx.moveTo(x,y)}
  ctx.closePath();ctx.stroke()
  ctx.strokeStyle=live ? '#9df1c7' : '#c8a66b';ctx.lineWidth=2
  for(const sign of [-1,1]) {
    ctx.beginPath();ctx.moveTo(sign*58,-19);ctx.lineTo(sign*(52-grip*12),-19);ctx.lineTo(sign*(47-grip*12),-13);ctx.stroke()
    ctx.beginPath();ctx.moveTo(sign*58,19);ctx.lineTo(sign*(52-grip*12),19);ctx.lineTo(sign*(47-grip*12),13);ctx.stroke()
  }
  ctx.restore()
  ctx.save();ctx.font='10px monospace';ctx.textAlign='center';ctx.fillStyle=live ? '#a8e2c7' : '#b6a074'
  ctx.fillText(s.core ? 'ORISON / ONLINE' : 'ORISON / IGNITION CRADLE',IGNITION_CRADLE.x,IGNITION_CRADLE.y+105);ctx.restore()
  const parts=frame.map(part=>({...part,color:live ? LIVE : AMBER}))
  // Both contact banks charge in sequence while the central towing lane stays open.
  for(const sign of [-1,1]) for(let i=0;i<5;i++) parts.push(box(5,7,2,[sign*68,-28+i*14,-11],i/5<progress ? LIVE : '#665944',i/5<progress))
  drawModel(ctx,IGNITION_CRADLE,parts,[.12,-.05,IGNITION_CRADLE_ANGLE],time)
  if (s.core) drawCargo(ctx,'core',IGNITION_CRADLE,{active:true,time:latch?.cargoTime ?? 0})
  if (live) {
    ctx.save();ctx.translate(IGNITION_CRADLE.x,IGNITION_CRADLE.y);ctx.rotate(IGNITION_CRADLE_ANGLE);ctx.strokeStyle='#baffde';ctx.lineWidth=1
    for(const sign of [-1,1]) {
      ctx.beginPath()
      for(let i=0;i<=8;i++) {
        const x=sign*(29+i*3.5),y=Math.sin(i*Math.PI/8)*Math.sin(time*19+i*2)*2
        if(i)ctx.lineTo(x,y);else ctx.moveTo(x,y)
      }
      ctx.stroke()
    }
    ctx.restore()
  }
}
