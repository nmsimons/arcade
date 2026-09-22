import { FIELD } from './types.ts'
import { CITY, ROADS } from './cityPlan.ts'
import { CITY_INK, castShadow, matte } from './cityInk.ts'
import { SCENERY_MARGIN } from './perimeter.ts'
import { line, polygon, variation } from './sceneryGeometry.ts'

function railing(ctx:CanvasRenderingContext2D,x:number,from:number,to:number){
  ctx.fillStyle='#111f20';ctx.fillRect(x-2,from,4,to-from)
  ctx.strokeStyle='#7f94847a';ctx.lineWidth=.8;line(ctx,x,from,x,to)
  for(let y=from+8;y<to-3;y+=26){
    ctx.fillStyle='#617564';ctx.fillRect(x-2,y,4,3)
  }
}

function bridge(ctx:CanvasRenderingContext2D,x:number,river:number,broken:boolean){
  const start=FIELD.height,end=river+240
  // Outboard pier noses and hard water shadows establish a supported structure.
  for(const y of [river+29,river+187]){
    polygon(ctx,[[x-53,y-5],[x-47,y-13],[x+48,y-13],[x+56,y],[x+49,y+13],[x-47,y+13]],'#1b3335')
    polygon(ctx,[[x-52,y-8],[x-46,y-15],[x+45,y-15],[x+51,y-8],[x+45,y+8],[x-46,y+8]],'#7c8a77','#6e827366')
  }
  if(!broken){
    castShadow(ctx,[[x-45,start],[x+45,start],[x+45,end],[x-45,end]],12)
    ctx.fillStyle='#7b8b77';ctx.fillRect(x-45,start,90,end-start)
    ctx.fillStyle='#343f44';ctx.fillRect(x-37,start,74,end-start)
    for(const side of [-1,1])railing(ctx,x+side*42,start+3,end-3)
    ctx.strokeStyle='#acac7e70';ctx.lineWidth=1;ctx.setLineDash([14,27]);line(ctx,x,start,x,end);ctx.setLineDash([])
    for(const y of [river-7,river+73,river+146,river+224]){
      ctx.strokeStyle='#7b8b7635';ctx.lineWidth=.8;line(ctx,x-36,y,x+36,y)
    }
    return
  }
  const upper=river+59,lower=river+175
  castShadow(ctx,[[x-45,start],[x+45,start],[x+45,upper-8],[x-45,upper-2]],12)
  castShadow(ctx,[[x-45,lower+5],[x+45,lower+5],[x+45,end],[x-45,end]],12)
  const fracture:readonly (readonly [number,number])[]=[[x-45,upper-2],[x-29,upper+5],[x-21,upper-4],
    [x-4,upper+9],[x+8,upper+3],[x+15,upper-6],[x+29,upper],[x+45,upper-8]]
  // Fracture fascia has real thickness; the gap is unmistakably open water.
  polygon(ctx,[[x-45,start],[x+45,start],...[...fracture].reverse()], '#788470')
  polygon(ctx,[...fracture,...[...fracture].reverse().map(([px,py])=>[px+1,py+7] as const)],'#a8a286','#8b99767a')
  polygon(ctx,[[x-45,end],[x+45,end],[x+45,lower+5],[x+26,lower+9],[x+16,lower-3],
    [x-2,lower+7],[x-15,lower],[x-26,lower+12],[x-45,lower+5]],'#788470')
  ctx.fillStyle='#343f44';ctx.fillRect(x-36,start,72,upper-start-17)
  ctx.fillRect(x-36,lower+18,72,end-lower-18)
  for(const side of [-1,1]){
    railing(ctx,x+side*42,start+3,upper-10)
    railing(ctx,x+side*42,lower+16,end-3)
  }
  ctx.strokeStyle='#acac7e70';ctx.lineWidth=1;ctx.setLineDash([14,27])
  line(ctx,x,start,x,upper-18);line(ctx,x,lower+25,x,end);ctx.setLineDash([])
  // Exposed longitudinal girders end at different lengths beneath the torn deck.
  for(const [i,dx] of [-26,-8,14,29].entries()){
    const length=12+(i*7)%19
    polygon(ctx,[[x+dx-2,upper-3],[x+dx+2,upper-3],[x+dx+3,upper+length],[x+dx-1,upper+length-2]],'#655e42','#aa94776a')
    ctx.strokeStyle='#a4a3837a';ctx.lineWidth=.7
    ctx.beginPath();ctx.moveTo(x+dx+5,upper-6);ctx.lineTo(x+dx+6,upper+13);ctx.lineTo(x+dx+11,upper+20);ctx.stroke()
  }
  // A submerged slab and its ripple provide a focal point within the missing span.
  polygon(ctx,[[x-23,river+113],[x-4,river+99],[x+25,river+108],[x+13,river+129],[x-16,river+132]],'#243c3b','#526c6360')
  polygon(ctx,[[x-23,river+113],[x-4,river+99],[x+25,river+108],[x+2,river+115]],'#3a5048')
  ctx.strokeStyle='#6c9d9845';ctx.lineWidth=.8
  line(ctx,x-29,river+138,x+4,river+138);line(ctx,x+9,river+138,x+29,river+138)
  ctx.strokeStyle='#a2ad8150';line(ctx,x-29,upper-20,x-10,upper-12);line(ctx,x-10,upper-12,x-2,upper-1)
}

export function drawWaterfront(ctx:CanvasRenderingContext2D){
  const {width:w,height:h}=FIELD,m=SCENERY_MARGIN,river=h+116
  ctx.save();ctx.lineWidth=1
  ctx.fillStyle='#4d584b';ctx.fillRect(-m,h,w+m*2,m)
  const water=ctx.createLinearGradient(0,river,0,river+214)
  water.addColorStop(0,'#263f46');water.addColorStop(.45,'#38646a');water.addColorStop(1,'#2c4e54')
  ctx.fillStyle=water;ctx.fillRect(-m,river,w+m*2,214)
  // Broad, quiet bands make water distinct from asphalt without a noisy texture.
  polygon(ctx,[[-m,river+38],[w+m,river+61],[w+m,river+133],[-m,river+108]],'#335b6038')
  ctx.fillStyle='#172e3460';ctx.fillRect(-m,river,w+m*2,9)
  for(let i=0;i<34;i++){
    const x=-m+i*110,y=river+24+variation(75,i)*168
    ctx.strokeStyle='#729c9240';ctx.lineWidth=.7
    line(ctx,x,y,x+19+variation(34,i)*26,y)
    if(i%3===0)line(ctx,x+8,y+4,x+22,y+4)
  }
  // The quay is beyond the extended buildings, at the actual water's edge.
  ctx.fillStyle='#929480';ctx.fillRect(-m,river-12,w+m*2,12)
  ctx.fillStyle='#4e665d';ctx.fillRect(-m,river-3,w+m*2,8)
  ctx.strokeStyle='#a0ad8660';line(ctx,-m,river-11,w+m,river-11)
  ctx.fillStyle='#7b8972';ctx.fillRect(-m,river+214,w+m*2,22)
  ctx.strokeStyle='#91a38860';line(ctx,-m,river+214,w+m,river+214)
  for(let x=-m+30;x<w+m;x+=93){
    if(ROADS.avenues.some(road=>Math.abs(x-road)<64))continue
    ctx.strokeStyle='#142d24';ctx.lineWidth=.8;line(ctx,x,river-11,x,river-4)
    ctx.fillStyle='#091b16';ctx.fillRect(x+14,river-23,7,9)
    ctx.fillStyle='#6e7d61';ctx.fillRect(x+13,river-24,7,3)
    ctx.strokeStyle='#9aab7d60';line(ctx,x+13,river-24,x+19,river-24)
    ctx.fillStyle='#111d1780';ctx.fillRect(x+13,river+224,9,4)
  }
  ctx.fillStyle=CITY_INK.pavement;ctx.fillRect(-m,river+276,w+m*2,78)
  for(const x of ROADS.avenues)ctx.fillRect(x-52,river+236,104,h+m-river-236)
  for(const block of CITY.blocks.filter(b=>b.row===3)){
    const x=block.x+16,y=river+405,width=block.width-32
    castShadow(ctx,[[x,y],[x+width,y],[x+width,y+140],[x,y+140]],12)
    ctx.fillStyle='#435142';ctx.fillRect(x,y,width,140)
    ctx.fillStyle=matte(ctx,x,y,width,140,'#6d7c69');ctx.fillRect(x+2,y+2,width-5,127)
    ctx.strokeStyle='#53685a38';line(ctx,x+5,y+70,x+width-5,y+70)
  }
  ctx.strokeStyle='#b0a47d50';ctx.setLineDash([15,29])
  for(const x of ROADS.avenues)line(ctx,x,river+240,x,h+m)
  ctx.setLineDash([])
  for(const [i,x] of ROADS.avenues.entries())bridge(ctx,x,river,i%2===1)
  ctx.font='10px monospace';ctx.fillStyle='#7ca49a55';ctx.fillText('S O U T H   R I V E R',713,river+119)
  ctx.restore()
}
