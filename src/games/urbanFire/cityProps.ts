import { CITY } from './cityPlan.ts'
import type { CityProp } from './cityLifePlan'
import { isMovableProp } from './cityLifePlan.ts'
import { castShadow, outlineCover, outlineTerrain } from './cityInk.ts'
import { line, polygon } from './sceneryGeometry.ts'
import type { Point } from './sceneryGeometry'

function civilianVehicle(ctx:CanvasRenderingContext2D,p:CityProp,l:number,b:number){
  const burned=p.condition==='burned',aid=p.condition==='aid'
  const paint=burned?'#57584b':aid?'#a2a589':['#69858a','#93916c','#8d7565'][p.tone]
  const shape:Point[]=[[0,3],[4,0],[l-4,0],[l,3],[l,b-3],[l-4,b],[4,b],[0,b-3]]
  polygon(ctx,shape,'#101c19')
  for(const x of [5,l-10])for(const y of [0,b-3]){
    ctx.fillStyle='#080f10';ctx.fillRect(x,y,6,3)
    ctx.strokeStyle='#687b6570';ctx.lineWidth=.7;line(ctx,x+1,y+1,x+5,y+1)
  }
  polygon(ctx,[[1,4],[4,2],[l-4,2],[l-1,4],[l-1,b-4],[l-4,b-2],[4,b-2],[1,b-4]],paint)
  ctx.lineWidth=.7;ctx.strokeStyle='#adba9370';line(ctx,5,2,l-5,2)
  if(p.kind==='bus'){
    // Long civic bus: paired wheel arches, roof escape hatches and a charred saloon.
    ctx.fillStyle=burned?'#101c18':'#44564b';ctx.fillRect(9,4,l-15,b-8)
    for(let x=10;x<l-9;x+=8){
      ctx.fillStyle='#576f6355';ctx.fillRect(x,2,5,2);ctx.fillRect(x,b-4,5,2)
    }
    ctx.strokeStyle='#929b7780';ctx.strokeRect(l*.38,6,7,b-12);ctx.strokeRect(l*.69,6,7,b-12)
    ctx.fillStyle='#b0a57860';ctx.fillRect(3,6,3,b-12)
  }else if(p.kind==='truck'){
    const cab=Math.min(13,l*.32)
    polygon(ctx,[[2,4],[cab-3,3],[cab+1,5],[cab+1,b-4],[3,b-3]],aid?'#939984':paint)
    ctx.fillStyle=burned?'#081510':'#294741';ctx.fillRect(3,4,3,b-8)
    ctx.fillStyle='#172a20';ctx.fillRect(cab+3,3,l-cab-6,b-6)
    ctx.strokeStyle='#7c8d6e';ctx.strokeRect(cab+3,3,l-cab-6,b-6)
    if(aid){
      ctx.fillStyle='#7b826a';ctx.fillRect(cab+4,4,l-cab-8,b-8)
      ctx.fillStyle='#c4c7a78a';ctx.fillRect(l*.65-1,6,3,b-12);ctx.fillRect(l*.65-4,b/2-1,9,3)
    }else{
      ctx.strokeStyle='#5b674b';line(ctx,cab+4,7,l-5,b-6);line(ctx,cab+7,b-5,l-6,5)
      polygon(ctx,[[l*.56,5],[l*.81,7],[l*.72,b-5],[l*.49,b-6]],'#434735')
    }
  }else{
    const cabin:Point[]=[[l*.3,4],[l*.57,3],[l*.74,5],[l*.72,b-4],[l*.32,b-4],[l*.26,b-6]]
    polygon(ctx,cabin,burned?'#111d18':paint,'#84937d7a')
    polygon(ctx,[[l*.29,4],[l*.38,4],[l*.37,b-4],[l*.27,b-5]],burned?'#0a1511':'#304c49')
    polygon(ctx,[[l*.62,4],[l*.72,5],[l*.71,b-4],[l*.63,b-4]],'#20362f')
    ctx.strokeStyle='#96a38b60';line(ctx,l*.38,5,l*.37,b-5)
    ctx.strokeStyle='#192c24';line(ctx,l*.17,3,l*.17,b-3)
  }
  if(burned){
    // Buckled sheet metal and an open engine bay replace intact glass and paint.
    polygon(ctx,[[2,5],[l*.2,4],[l*.26,b*.43],[l*.17,b-3],[4,b-4]],'#0b1510')
    ctx.strokeStyle='#857b5b';ctx.lineWidth=.7
    for(const x of [4,7,10])line(ctx,x,5,x+2,b-5)
    ctx.strokeStyle='#586f5870';line(ctx,l*.41,4,l*.5,b*.55);line(ctx,l*.5,b*.55,l*.66,b-4)
    ctx.fillStyle='#a58c5740';ctx.fillRect(l*.45,b-4,5,2)
  }else{
    ctx.fillStyle='#c6c5a070';ctx.fillRect(1,4,2,2);ctx.fillRect(1,b-6,2,2)
    ctx.fillStyle='#9c69545c';ctx.fillRect(l-3,4,2,2);ctx.fillRect(l-3,b-6,2,2)
  }
  if(burned)outlineTerrain(ctx,shape)
  else outlineCover(ctx,shape)
}

function tent(ctx:CanvasRenderingContext2D,l:number,b:number){
  const shape:Point[]=[[0,3],[3,0],[l-3,0],[l,3],[l,b-3],[l-3,b],[3,b],[0,b-3]]
  polygon(ctx,shape,'#6f7860')
  polygon(ctx,[[3,2],[l-3,2],[l-1,b/2],[2,b/2]],'#afb08a')
  polygon(ctx,[[2,b/2],[l-1,b/2],[l-3,b-2],[3,b-2]],'#879271')
  ctx.strokeStyle='#c4c4a17a';ctx.lineWidth=.8;line(ctx,3,b/2,l-3,b/2)
  polygon(ctx,[[l-1,4],[l-1,b-3],[l-9,b/2]],'#1c3024')
  ctx.fillStyle='#c4c8a98a';ctx.fillRect(l*.36-1,3,3,8);ctx.fillRect(l*.36-4,6,9,3)
  outlineCover(ctx,shape)
}

function sandbags(ctx:CanvasRenderingContext2D,l:number,b:number){
  const count=Math.ceil(l/10),step=l/count
  ctx.fillStyle='#5a644d';ctx.fillRect(0,0,l,b)
  for(let row=0;row<2;row++)for(let i=0;i<count;i++){
    const x=i*step+(row?2:0),w=Math.min(step-1,l-x)
    if(w<1)continue
    ctx.fillStyle=row?'#929375':'#b0ac83';ctx.strokeStyle='#283a28';ctx.lineWidth=.7
    ctx.beginPath();ctx.roundRect(x,row*b/2,w,b/2,2);ctx.fill();ctx.stroke()
    ctx.strokeStyle='#b3b28b45';line(ctx,x+2,row*b/2+1,x+w-2,row*b/2+1)
  }
  outlineCover(ctx,[[0,2],[2,0],[l-2,0],[l,2],[l,b-2],[l-2,b],[2,b],[0,b-2]])
}

function supplies(ctx:CanvasRenderingContext2D,l:number,b:number,aid:boolean){
  polygon(ctx,[[0,2],[2,0],[l,0],[l,b],[0,b]],'#828265')
  ctx.fillStyle='#a7a078';ctx.fillRect(1,1,l-3,b-4)
  ctx.strokeStyle='#b8b18a80';ctx.lineWidth=.7;line(ctx,1,1,l-2,1)
  ctx.strokeStyle='#303e2d';ctx.lineWidth=1.5
  line(ctx,l*.33,1,l*.33,b-1);line(ctx,l*.7,1,l*.7,b-1)
  if(aid){ctx.fillStyle='#b5bc9780';ctx.fillRect(l*.5-1,b*.5-3,2,6);ctx.fillRect(l*.5-3,b*.5-1,6,2)}
  outlineCover(ctx,[[0,2],[2,0],[l,0],[l,b],[0,b]])
}

function tree(ctx:CanvasRenderingContext2D,l:number,b:number){
  ctx.fillStyle='#493f2e';ctx.fillRect(l*.43,b*.55,l*.16,b*.43)
  const crown=ctx.createRadialGradient(l*.32,b*.29,1,l*.5,b*.5,Math.max(l,b)*.62)
  crown.addColorStop(0,'#94a168');crown.addColorStop(.45,'#667d48');crown.addColorStop(1,'#2f4a32')
  ctx.fillStyle=crown;ctx.beginPath();ctx.ellipse(l*.5,b*.47,l*.49,b*.46,0,0,Math.PI*2);ctx.fill()
  for(const [x,y,r] of [[.3,.3,.27],[.66,.32,.26],[.38,.63,.3],[.68,.65,.27]]){
    const radius=Math.min(l,b)*r
    const lobe=ctx.createRadialGradient(l*x-radius*.3,b*y-radius*.4,0,l*x,b*y,radius)
    lobe.addColorStop(0,'#a2ad753c');lobe.addColorStop(.7,'#8393590c');lobe.addColorStop(1,'#203d261c')
    ctx.fillStyle=lobe;ctx.beginPath();ctx.arc(l*x,b*y,radius,0,Math.PI*2);ctx.fill()
  }
}

function bench(ctx:CanvasRenderingContext2D,l:number,b:number,burned:boolean){
  ctx.fillStyle='#172d20';ctx.fillRect(0,0,l,b)
  for(const y of [1,3]){
    ctx.fillStyle=burned?'#454733':'#697457';ctx.fillRect(1,y,l-2,1.5)
  }
  ctx.fillStyle='#8994797a';ctx.fillRect(2,0,2,b);ctx.fillRect(l-4,0,2,b)
  const shape:Point[]=[[0,1],[1,0],[l-1,0],[l,1],[l,b],[0,b]]
  if(burned)outlineTerrain(ctx,shape)
  else outlineCover(ctx,shape)
}

export function drawCityProps(ctx:CanvasRenderingContext2D){
  for(const p of CITY.props){
    if(isMovableProp(p))continue
    ctx.save()
    const shadow:Point[]=p.kind==='tree'?Array.from({length:16},(_,i)=>[
      p.x+p.width*(.5+Math.cos(i*Math.PI/8)*.48),p.y+p.height*(.5+Math.sin(i*Math.PI/8)*.47)
    ]):[[p.x,p.y],[p.x+p.width,p.y],[p.x+p.width,p.y+p.height],[p.x,p.y+p.height]]
    castShadow(ctx,shadow,p.kind==='tree'?10:p.condition==='burned'?2:5)
    ctx.translate(p.x+p.width/2,p.y+p.height/2)
    ctx.rotate(p.kind==='tree'?0:{north:Math.PI/2,south:-Math.PI/2,east:Math.PI,west:0}[p.direction])
    const vertical=p.kind!=='tree'&&(p.direction==='north'||p.direction==='south')
    const l=vertical?p.height:p.width,b=vertical?p.width:p.height
    ctx.translate(-l/2,-b/2);ctx.lineWidth=.8
    if(p.kind==='tent')tent(ctx,l,b)
    else if(p.kind==='sandbags')sandbags(ctx,l,b)
    else if(p.kind==='supplies')supplies(ctx,l,b,p.condition==='aid')
    else if(p.kind==='tree')tree(ctx,l,b)
    else if(p.kind==='bench')bench(ctx,l,b,p.condition==='burned')
    else civilianVehicle(ctx,p,l,b)
    ctx.restore()
  }
}
