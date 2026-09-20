import type { HavenPose } from './havenGeometry'
import { havenPanels, havenRescueMarkers, posePoint } from './havenGeometry'
import type { Vector2 } from './types'
import { drawHavenLink } from './havenLinkRender'

export function drawHaven(ctx:CanvasRenderingContext2D,pose:HavenPose,time:number,thrust:number,impact=0,rescued=0,active=true,activation=0,link={deployment:active ? 0 : 1,connected:false}) {
  const panels=havenPanels(pose), fold=1-pose.deployment
  const trace=(points:Vector2[])=>{ctx.beginPath();points.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.closePath()}
  ctx.save();ctx.lineJoin='round';ctx.lineCap='round'
  ctx.globalAlpha=active ? .45+.55*Math.min(1,(10-activation)/1.8) : .45
  if (fold>.02) {
    // Hinges, knuckles and actuators remain attached throughout the sequence.
    for (const panel of panels) {
      const {anchor:a,hinge:b}=panel, elbow={x:(a.x+b.x)/2-7*fold*Math.sin(pose.angle),y:(a.y+b.y)/2+7*fold*Math.cos(pose.angle)}
      ctx.strokeStyle='#070c0b';ctx.lineWidth=6;ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(elbow.x,elbow.y);ctx.lineTo(b.x,b.y);ctx.stroke()
      ctx.strokeStyle='#647b71';ctx.lineWidth=1.4;ctx.stroke()
      ctx.strokeStyle='#b4c6bb';ctx.beginPath();ctx.arc(elbow.x,elbow.y,2,0,Math.PI*2);ctx.stroke()
    }
    const hull=[[-33,-18],[25,-18],[34,-9],[34,9],[25,18],[-33,18]].map(([x,y])=>posePoint({x,y},pose))
    trace(hull);ctx.fillStyle='#080e0c';ctx.fill();ctx.strokeStyle='#91a99c';ctx.lineWidth=1.4;ctx.stroke()
    for (const side of [-1,1]) {
      const jet=[[-34,side*13-4],[-42,side*13-4],[-42,side*13+4],[-34,side*13+4]].map(([x,y])=>posePoint({x,y},pose))
      trace(jet);ctx.fillStyle='#0d1915';ctx.fill();ctx.stroke()
      if (thrust>.01) {
        const flame=[[-42,side*13-3],[-45-(16+5*Math.sin(time*29))*thrust,side*13],[-42,side*13+3]].map(([x,y])=>posePoint({x,y},pose))
        trace(flame);ctx.strokeStyle='#baffdf';ctx.lineWidth=1.7;ctx.stroke();ctx.strokeStyle='#91a99c'
      }
    }
  }
  for (const panel of panels) {
    const vertices=panel.vertices, back=vertices.map(p=>({x:p.x-3,y:p.y+5}))
    trace(back);ctx.fillStyle='#060a08';ctx.fill();ctx.strokeStyle='#50665a';ctx.lineWidth=1;ctx.stroke()
    for (let i=0;i<4;i++) {ctx.beginPath();ctx.moveTo(vertices[i].x,vertices[i].y);ctx.lineTo(back[i].x,back[i].y);ctx.stroke()}
    trace(vertices);ctx.fillStyle='#0b100d';ctx.fill();ctx.strokeStyle=impact>0 ? '#eafff0' : '#bac6bc';ctx.lineWidth=1.8+impact;ctx.stroke()
    const [a,b,c,d]=vertices
    ctx.strokeStyle='#708879';ctx.lineWidth=1
    for (const t of [.35,.72]) {
      ctx.beginPath();ctx.moveTo(a.x+(d.x-a.x)*t,a.y+(d.y-a.y)*t);ctx.lineTo(b.x+(c.x-b.x)*t,b.y+(c.y-b.y)*t);ctx.stroke()
    }
    ctx.beginPath();ctx.arc(panel.hinge.x,panel.hinge.y,2,0,Math.PI*2);ctx.stroke()
  }
  if (active && pose.deployment>.95) {
    ctx.fillStyle='#cdd9d1'
    for(let i=0;i<3;i++){const p=posePoint({x:Math.cos(i*Math.PI*2/3)*74.34,y:Math.sin(i*Math.PI*2/3)*74.34},pose);ctx.beginPath();ctx.arc(p.x,p.y,2.2,0,Math.PI*2);ctx.fill()}
  }
  for (const marker of havenRescueMarkers(pose,rescued)) {
    ctx.beginPath();ctx.arc(marker.pos.x,marker.pos.y,3.2,0,Math.PI*2)
    ctx.fillStyle=marker.lit ? '#a0ffd0' : '#14251e'
    ctx.strokeStyle=marker.lit ? '#c4ffe3' : '#587363';ctx.lineWidth=.9
    ctx.shadowColor='#65efb2';ctx.shadowBlur=marker.lit ? 7 : 0
    ctx.fill();ctx.stroke()
  }
  ctx.restore()
  drawHavenLink(ctx,pose.pos,time,link.deployment,link.connected)
}
