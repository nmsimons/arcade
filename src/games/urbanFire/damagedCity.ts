import { CITY } from './cityPlan.ts'
import type { CityRuin, RoadClosure } from './cityPlan'
import { CITY_INK, castShadow, matte, outlineRect } from './cityInk.ts'
import { drawRubble, drawRuinWalls, groundDamage } from './debrisRender.ts'
import { line, polygon } from './sceneryGeometry.ts'

function ruinFloor(ctx:CanvasRenderingContext2D,{site}:CityRuin){
  const {x,y,width:w,height:h}=site
  ctx.save();ctx.translate(x,y)
  // The destroyed floor has an eroded edge and an open, unoutlined entrance.
  polygon(ctx,[[0,0],[w*.8,0],[w*.89,7],[w,5],[w,h],[w*.7,h],
      [w*.62,h-5],[w*.35,h-2],[w*.25,h],[0,h]],'#5d5f53')
  ctx.fillStyle='#b4ac8430';ctx.fillRect(8,8,w*.33,Math.max(16,h*.38))
  ctx.fillStyle='#171f1d';ctx.fillRect(9,9,Math.max(12,w*.3),10)
  // A localized soot fan and exposed foundation scars suggest what failed.
  polygon(ctx,[[w*.44,8],[w*.67,4],[w*.84,h*.2],[w*.7,h*.32],[w*.53,h*.23]],'#111c1999')
  ctx.strokeStyle='#8f957945';ctx.lineWidth=.8
  ctx.beginPath();ctx.moveTo(w*.43,9);ctx.lineTo(w*.38,h*.27)
  ctx.lineTo(w*.5,h*.43);ctx.lineTo(w*.46,h*.69);ctx.stroke()
  line(ctx,w*.5,h*.43,w*.72,h*.5)
  ctx.strokeStyle='#64736340'
  line(ctx,12,h-12,w*.27,h-12);line(ctx,w*.7,h-12,w-12,h-12)
  if(site.kind==='office'){
    // Pale room slabs remain flat floor, not navigational obstructions.
    ctx.fillStyle='#73807a12';ctx.fillRect(w*.45,20,w*.2,h*.24)
    ctx.fillRect(w*.68,20,w*.23,h*.24)
  }else{
    ctx.strokeStyle='#aaa17b25'
    line(ctx,12,h*.5,24,h*.5);line(ctx,12,h*.5,12,h*.5+14)
  }
  groundDamage(ctx,{x:8,y:8,width:w-16,height:h-16},x+y)
  ctx.restore()
}

export function drawRuinFloors(ctx:CanvasRenderingContext2D){
  for(const ruin of CITY.ruins)ruinFloor(ctx,ruin)
}

export function drawDamagedCover(ctx:CanvasRenderingContext2D){
  for(const ruin of CITY.ruins){
    drawRuinWalls(ctx,ruin.walls,ruin.roofRemnants,ruin.entrance.y<ruin.interior.y)
    drawRubble(ctx,ruin.rubble,false,false)
  }
  drawRubble(ctx,CITY.edgeRubble)
  for(const closure of CITY.closures)drawClosure(ctx,closure)
}

function concreteCordon(ctx:CanvasRenderingContext2D,w:number,h:number){
  const count=Math.round(w/30),step=w/count
  ctx.fillStyle='#4e574d';ctx.fillRect(0,0,w,h)
  for(let i=0;i<count;i++){
    const x=i*step,r=x+step
    // Broad feet, sloping shoulders, and a narrow crown read as Jersey barriers.
    polygon(ctx,[[x,1],[r,1],[r-2,7],[x+2,7]],'#b6b29d')
    ctx.fillStyle=matte(ctx,x+2,7,step-4,h-15,'#969b87');ctx.fillRect(x+2,7,step-4,h-15)
    polygon(ctx,[[x+2,h-8],[r-2,h-8],[r,h-2],[x,h-2]],'#747d6a')
    ctx.fillStyle='#19281f';ctx.fillRect(x,h-3,step,3)
    ctx.strokeStyle='#1c2a21';ctx.lineWidth=1;line(ctx,x,0,x,h)
    ctx.strokeStyle='#c0c6a58c';ctx.lineWidth=.7;line(ctx,x+2,1,r-2,1)
    // One yellow-black inset panel per segment, subordinate to the concrete form.
    ctx.save();ctx.beginPath();ctx.rect(x+5,8,step-10,7);ctx.clip()
    ctx.fillStyle='#26332a';ctx.fillRect(x+5,8,step-10,7)
    ctx.strokeStyle='#b8a36b';ctx.lineWidth=3
    for(let dx=x+3;dx<r+5;dx+=9)line(ctx,dx,7,dx-5,16)
    ctx.restore()
    ctx.fillStyle='#d4caa1';ctx.fillRect(x+3,4,3,2)
    ctx.fillStyle='#c18c65';ctx.fillRect(r-6,4,3,2)
    ctx.fillStyle='#23372d';ctx.fillRect(x+step/2-2,3,4,2)
  }
}

function razorWire(ctx:CanvasRenderingContext2D,w:number){
  ctx.fillStyle='#4b5549';ctx.fillRect(0,0,w,7)
  ctx.strokeStyle='#718873';ctx.lineWidth=.65;line(ctx,2,4,w-2,4)
  // Overlapping concertina coils are attached to the concrete crowns, not a
  // separate fence across an otherwise open road. Tiny opposing blades catch light.
  for(let x=5;x<w-2;x+=7){
    ctx.strokeStyle='#a1ae898c';ctx.lineWidth=.7
    ctx.beginPath();ctx.ellipse(x,4,4.2,3.3,-.4,0,Math.PI*2);ctx.stroke()
    if(Math.round(x/7)%2===0){
      ctx.strokeStyle='#bbc1a2a0';line(ctx,x-1,1,x+1,3);line(ctx,x+1,1,x-1,3)
      line(ctx,x+2,5,x+4,7);line(ctx,x+4,5,x+2,7)
    }
  }
  ctx.strokeStyle='#b4ba9670';ctx.lineWidth=1
  for(const x of [2,w/2,w-2])line(ctx,x,0,x,8)
}

function drawClosure(ctx:CanvasRenderingContext2D,closure:RoadClosure){
  const {x,y,width,height,edge,kind}=closure,vertical=height>width
  const w=Math.max(width,height),h=Math.min(width,height)
  castShadow(ctx,[[x,y],[x+width,y],[x+width,y+height],[x,y+height]],6)
  ctx.save();ctx.translate(x+width/2,y+height/2);if(vertical)ctx.rotate(Math.PI/2)
  ctx.translate(-w/2,-h/2)
  ctx.save();ctx.translate(0,7);ctx.scale(1,(h-7)/h);concreteCordon(ctx,w,h);ctx.restore()
  razorWire(ctx,w)
  outlineRect(ctx,{x:0,y:0,width:w,height:h})
  ctx.restore()
  const angle={north:0,south:Math.PI,west:-Math.PI/2,east:Math.PI/2}[edge]
  ctx.save();ctx.translate(x+width/2,y+height/2);ctx.rotate(angle)
  ctx.strokeStyle=CITY_INK.roadPaint+'b5';ctx.lineWidth=2.5
  line(ctx,-w/2+12,23,w/2-12,23)
  ctx.strokeStyle=CITY_INK.lanePaint+'70';ctx.lineWidth=1
  for(const sx of [-w*.3,w*.3]){
    ctx.beginPath();ctx.moveTo(sx-3,34);ctx.lineTo(sx,30);ctx.lineTo(sx+3,34);ctx.stroke()
  }
  ctx.font='7px monospace';ctx.textAlign='center';ctx.fillStyle='#b7b08b85'
  ctx.fillText(kind==='bridge'?'SPAN OUT':edge==='north'?'RAIL ACCESS':'CLOSED',0,35)
  ctx.restore()
}
