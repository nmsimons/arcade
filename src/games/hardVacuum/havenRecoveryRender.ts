import { havenPanels, posePoint } from './havenGeometry'
import type { HavenPose } from './havenGeometry'
import { RECOVERY_END, RECOVERY_GRIP, RECOVERY_HAUL, RECOVERY_REACH, RECOVERY_SEAL, recoveryBay, recoveryEase } from './havenRecovery'
import type { HavenRecovery } from './havenRecovery'
import { drawExpeditionObject } from './objectModels'
import type { ObjectKind } from './objectModels'
import type { TetherBody } from './types'

export function drawHavenRecovery(ctx:CanvasRenderingContext2D,pose:HavenPose,recovery:HavenRecovery,body:TetherBody,time:number,kind:ObjectKind,variant=0) {
  const t=recovery.time,reach=recoveryEase(t/RECOVERY_REACH),grip=recoveryEase((t-RECOVERY_REACH)/(RECOVERY_GRIP-RECOVERY_REACH))
  const closing=recoveryEase((t-RECOVERY_HAUL)/(RECOVERY_SEAL-RECOVERY_HAUL))
  const stow=recoveryEase((t-RECOVERY_SEAL)/(RECOVERY_END-RECOVERY_SEAL))
  const angle=pose.angle+recovery.bay,u={x:Math.cos(angle),y:Math.sin(angle)},n={x:-u.y,y:u.x}
  const bay=recoveryBay(pose,recovery.bay),panels=havenPanels(pose),pair=Math.round((recovery.bay-Math.PI/3)/(Math.PI*2/3))*2
  const roots=[panels[pair].hinge,panels[pair+1].hinge]
  const tip=(side:number)=>({x:body.pos.x+n.x*side*(body.radius+4+(1-grip)*15),y:body.pos.y+n.y*side*(body.radius+4+(1-grip)*15)})
  const hands=roots.map((root,i)=>{
    const target=tip(i ? 1 : -1),extension=reach*(1-stow)
    return {x:root.x+(target.x-root.x)*extension,y:root.y+(target.y-root.y)*extension}
  })
  const tray=posePoint({x:Math.cos(recovery.bay)*(78+30*(1-reach+stow)),y:Math.sin(recovery.bay)*(78+30*(1-reach+stow))},pose)
  const trayShape=()=>{ctx.beginPath();ctx.moveTo(-30,-38);ctx.lineTo(30,-38);ctx.lineTo(38,-30);ctx.lineTo(38,30);ctx.lineTo(30,38);ctx.lineTo(-30,38);ctx.lineTo(-38,30);ctx.lineTo(-38,-30);ctx.closePath()}
  ctx.save();ctx.lineJoin='round';ctx.lineCap='round';ctx.shadowBlur=0
  ctx.save();ctx.translate(tray.x,tray.y);ctx.rotate(angle);ctx.globalAlpha=reach*(1-stow)
  trayShape();ctx.fillStyle='#040a08';ctx.fill();ctx.strokeStyle='#577b6a';ctx.lineWidth=1.4;ctx.stroke()
  // Parallel guide rails make the destination a physical cradle.
  ctx.strokeStyle='#304c3e';ctx.lineWidth=2
  for(const side of [-1,1]) {ctx.beginPath();ctx.moveTo(-26,side*32);ctx.lineTo(26,side*32);ctx.stroke()}
  ctx.restore()

  for(let i=0;i<2;i++) {
    const root=roots[i],hand=hands[i],side=i ? 1 : -1
    const dx=hand.x-root.x,dy=hand.y-root.y,len=Math.hypot(dx,dy)||1
    const bend=22+16*Math.sin(reach*Math.PI),elbow={x:(root.x+hand.x)/2-dy/len*bend*side,y:(root.y+hand.y)/2+dx/len*bend*side}
    ctx.beginPath();ctx.moveTo(root.x,root.y);ctx.lineTo(elbow.x,elbow.y);ctx.lineTo(hand.x,hand.y)
    ctx.strokeStyle='#030806';ctx.lineWidth=8;ctx.stroke()
    ctx.strokeStyle='#7f9e8d';ctx.lineWidth=3;ctx.stroke()
    ctx.strokeStyle='#c0d7ca';ctx.lineWidth=1;ctx.stroke()
    for(const p of [root,elbow]) {ctx.beginPath();ctx.arc(p.x,p.y,3.2,0,Math.PI*2);ctx.fillStyle='#15261e';ctx.fill();ctx.strokeStyle='#93b09e';ctx.stroke()}
  }
  if(!recovery.secured) {
    ctx.save()
    if(t>=RECOVERY_HAUL) {
      ctx.translate(bay.x,bay.y);ctx.rotate(angle);ctx.beginPath();ctx.rect(-37,-37,74,74);ctx.clip();ctx.rotate(-angle);ctx.translate(-bay.x,-bay.y)
    }
    drawExpeditionObject(ctx,kind,body.pos,{active:true,variant,time:t<RECOVERY_GRIP ? time : recovery.cargoTime})
    ctx.restore()
  }
  // Opposed wrists close around the unchanged cargo silhouette.
  for(let i=0;i<2;i++) {
    const hand=hands[i],side=i ? 1 : -1
    ctx.beginPath();ctx.moveTo(hand.x-u.x*12-n.x*side*5,hand.y-u.y*12-n.y*side*5)
    ctx.lineTo(hand.x-u.x*12,hand.y-u.y*12);ctx.lineTo(hand.x+u.x*12,hand.y+u.y*12)
    ctx.lineTo(hand.x+u.x*12-n.x*side*5,hand.y+u.y*12-n.y*side*5)
    ctx.strokeStyle='#050b08';ctx.lineWidth=6;ctx.stroke();ctx.strokeStyle=grip>.95 ? '#a5ead0' : '#9cae9f';ctx.lineWidth=2;ctx.stroke()
  }
  if(t>=RECOVERY_HAUL) {
    ctx.save();ctx.translate(tray.x,tray.y);ctx.rotate(angle);ctx.globalAlpha=1-stow
    trayShape();ctx.clip()
    for(const side of [-1,1]) {
      const y=side<0 ? -76+closing*38 : 38-closing*38
      ctx.fillStyle='#14261d';ctx.strokeStyle='#a1b9a8';ctx.lineWidth=1.5
      ctx.fillRect(-38,y,76,38);ctx.strokeRect(-38,y,76,38)
      ctx.strokeStyle='#476952';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(-29,y+19);ctx.lineTo(29,y+19);ctx.stroke()
    }
    if(recovery.secured) {
      ctx.strokeStyle='#a7f9ca';ctx.lineWidth=2
      ctx.beginPath();ctx.moveTo(-17,0);ctx.lineTo(17,0);ctx.stroke()
    }
    ctx.restore()
  }
  ctx.restore()
}
