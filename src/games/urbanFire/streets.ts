import { FIELD } from './types.ts'
import type { Wall } from './types'
import { CITY, ROADS, buildingEntrance } from './cityPlan.ts'
import type { CityLot } from './cityPlan'
import { CITY_INK, matte } from './cityInk.ts'

const line=(ctx:CanvasRenderingContext2D,x:number,y:number,x2:number,y2:number)=>{
  ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x2,y2);ctx.stroke()
}

function parking(ctx:CanvasRenderingContext2D,{x,y,width:w,height:h}:Wall){
  ctx.fillStyle=CITY_INK.pavement;ctx.fillRect(x,y,w,h)
  ctx.strokeStyle=CITY_INK.roadPaint+'65';ctx.lineWidth=.8
  // Open-ended bays and a clear central aisle read as painted asphalt.
  const spaces=Math.max(2,Math.floor((w-12)/24)),step=(w-12)/spaces
  for(let i=0;i<=spaces;i++){
    const px=x+6+i*step
    line(ctx,px,y+5,px,y+23);line(ctx,px,y+h-5,px,y+h-23)
  }
  ctx.font='8px monospace';ctx.fillStyle=CITY_INK.roadPaint+'80';ctx.fillText('P',x+w/2-3,y+h/2+3)
}

function grass(ctx:CanvasRenderingContext2D,{x,y,width:w,height:h}:Wall){
  // Flat lawn shapes carry the material identity; no outline suggests a wall.
  ctx.fillStyle=matte(ctx,x,y,w,h,CITY_INK.grass);ctx.fillRect(x,y,w,h)
  for(const [u,v,r] of [[.22,.23,.3],[.76,.78,.25],[.8,.2,.2]]){
    const px=x+w*u,py=y+h*v,radius=Math.min(w,h)*r
    const patch=ctx.createRadialGradient(px,py,0,px,py,radius)
    patch.addColorStop(0,'#a3a06e23');patch.addColorStop(1,'#a3a06e00')
    ctx.fillStyle=patch;ctx.fillRect(px-radius,py-radius,radius*2,radius*2)
  }
  if(h>55){ctx.fillStyle=CITY_INK.sidewalkFill;ctx.fillRect(x,y+h*.5-6,w,12)}
}

function drawLot(ctx:CanvasRenderingContext2D,lot:CityLot){
  if(lot.kind==='parking'){parking(ctx,lot);return}
  if(lot.kind==='grass'){grass(ctx,lot);return}
  const {x,y,width:w,height:h,kind}=lot
  ctx.save();ctx.beginPath();ctx.rect(x,y,w,h);ctx.clip()
  ctx.fillStyle=kind==='plaza'?CITY_INK.plaza:kind==='vacant'?CITY_INK.earth:CITY_INK.court
  ctx.fillRect(x,y,w,h)
  if(kind==='plaza'){
    // Large paving slabs, not a competing grid of small bright squares.
    ctx.strokeStyle='#7e91932c';ctx.lineWidth=.7
    line(ctx,x+w/2,y+3,x+w/2,y+h-3)
  }else if(kind==='yard'){
    ctx.strokeStyle=CITY_INK.lanePaint+'65';ctx.lineWidth=.8
    // One loading-bay bracket replaces rows of decorative hazard stripes.
    line(ctx,x+8,y+12,x+8,y+5);line(ctx,x+8,y+5,x+Math.min(w-8,42),y+5)
    if(h>45){ctx.font='8px monospace';ctx.fillStyle=CITY_INK.marking+'95';ctx.fillText('LOADING',x+8,y+h/2+5)}
  }else{
    ctx.fillStyle='#79705538';ctx.beginPath()
    ctx.moveTo(x+w*.15,y+h*.22);ctx.lineTo(x+w*.55,y+h*.12)
    ctx.lineTo(x+w*.76,y+h*.38);ctx.lineTo(x+w*.3,y+h*.46);ctx.closePath();ctx.fill()
    // A pair of tire impressions makes it clear that this is usable bare ground.
    ctx.strokeStyle='#8d886342';ctx.lineWidth=1
    for(const dy of [0,7]){
      ctx.beginPath();ctx.moveTo(x+w,y+h*.66+dy)
      ctx.bezierCurveTo(x+w*.65,y+h*.66+dy,x+w*.58,y+h*.75+dy,x+w*.53,y+h);ctx.stroke()
    }
  }
  ctx.restore()
}

function drawBlocks(ctx:CanvasRenderingContext2D){
  const {sidewalk}=ROADS
  for(const {x,y,width:w,height:h} of CITY.blocks){
    // A continuous material ribbon and one curb contour establish the sidewalk.
    // Expansion ticks, inner outlines and double alley edges are unnecessary.
    ctx.fillStyle=matte(ctx,x,y,w,h,CITY_INK.sidewalkFill)
    ctx.save();ctx.shadowColor='#17221e65';ctx.shadowBlur=2;ctx.shadowOffsetY=1
    ctx.beginPath();ctx.roundRect(x,y,w,h,5);ctx.fill()
    ctx.restore()
    ctx.fillStyle=CITY_INK.court;ctx.fillRect(x+sidewalk,y+sidewalk,w-sidewalk*2,h-sidewalk*2)
  }
  for(const drive of CITY.driveways){
    ctx.fillStyle=CITY_INK.pavement;ctx.fillRect(drive.x,drive.y,drive.width,drive.height)
  }
  for(const lot of CITY.lots)drawLot(ctx,lot)
  for(const alley of CITY.alleys){
    ctx.fillStyle=CITY_INK.pavement;ctx.fillRect(alley.x,alley.y,alley.width,alley.height)
  }
  // Short, unoutlined paths connect actual doors to the public paving.
  ctx.strokeStyle=CITY_INK.sidewalkFill;ctx.lineWidth=12;ctx.lineCap='butt'
  for(const building of CITY.buildings){
    const door=buildingEntrance(building)
    line(ctx,door.x,door.y,building.access.x,building.access.y)
  }
}

function drawLaneMarkings(ctx:CanvasRenderingContext2D){
  const {avenues,streets,avenueWidth,streetWidth}=ROADS,av=avenueWidth/2,st=streetWidth/2
  ctx.strokeStyle=CITY_INK.lanePaint+'ac';ctx.lineWidth=1.2;ctx.lineCap='butt';ctx.setLineDash([15,29])
  for(const x of avenues){
    let start=70
    for(const y of [...streets,FIELD.height+st-54]){line(ctx,x,start,x,y-st-16);start=y+st+16}
  }
  for(const y of streets){
    let start=70
    for(const x of [...avenues,FIELD.width+av-54]){line(ctx,start,y,x-av-16,y);start=x+av+16}
  }
  ctx.setLineDash([])
  for(const x of avenues)for(const y of streets){
    const central=y===streets[1]
    ctx.fillStyle=CITY_INK.roadPaint+'9a'
    if(central){
      // The central boulevard has the district's prominent pedestrian crossings.
      for(let dx=-av+14;dx<av-9;dx+=14){
        ctx.fillRect(x+dx-2.5,y-st-17,5,10);ctx.fillRect(x+dx-2.5,y+st+7,5,10)
      }
      for(let dy=-st+14;dy<st-9;dy+=14){
        ctx.fillRect(x-av-17,y+dy-2.5,10,5);ctx.fillRect(x+av+7,y+dy-2.5,10,5)
      }
    }
    // Stop bars span the entire approaching lane, from centerline to curb.
    ctx.strokeStyle=CITY_INK.roadPaint+'b5';ctx.lineWidth=2.5
    line(ctx,x-av-(central?23:10),y,x-av-(central?23:10),y+st)
    line(ctx,x+av+(central?23:10),y-st,x+av+(central?23:10),y)
    if(central){
      line(ctx,x,y+st+23,x+av,y+st+23)
      line(ctx,x-av,y-st-23,x,y-st-23)
    }
  }
}

export function drawStreets(ctx:CanvasRenderingContext2D){
  ctx.save()
  ctx.fillStyle=CITY_INK.ground;ctx.fillRect(0,0,FIELD.width,FIELD.height)
  ctx.fillStyle=CITY_INK.pavement
  for(const x of ROADS.avenues)ctx.fillRect(x-ROADS.avenueWidth/2,0,ROADS.avenueWidth,FIELD.height)
  for(const y of ROADS.streets)ctx.fillRect(0,y-ROADS.streetWidth/2,FIELD.width,ROADS.streetWidth)
  drawBlocks(ctx);drawLaneMarkings(ctx)
  // A few utility covers supply scale without adding random boxed road patches.
  ctx.strokeStyle=CITY_INK.marking+'60';ctx.lineWidth=.7
  for(const [i,x] of ROADS.avenues.entries())for(const y of [360,730]){
    ctx.beginPath();ctx.arc(x+(i%2?22:-22),y,3,0,Math.PI*2);ctx.stroke()
  }
  ctx.font='9px monospace';ctx.fillStyle=CITY_INK.marking+'80'
  for(const [label,x,y] of [['FREIGHT',370,ROADS.streets[0]+29],['CIVIC',1080,ROADS.streets[0]+29],
    ['GARDENS',365,ROADS.streets[2]+29],['WORKS',1080,ROADS.streets[2]+29]] as const)ctx.fillText(label,x,y)
  ctx.restore()
}
