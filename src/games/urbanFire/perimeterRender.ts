import { FIELD } from './types.ts'
import { CITY, ROADS } from './cityPlan.ts'
import { CITY_INK, castShadow, matte } from './cityInk.ts'
import { SCENERY_MARGIN } from './perimeter.ts'
import { line, polygon } from './sceneryGeometry.ts'
import { drawRailway } from './railRender.ts'
import { drawWaterfront } from './waterfrontRender.ts'

function backgroundRoof(ctx:CanvasRenderingContext2D,x:number,y:number,w:number,h:number){
  castShadow(ctx,[[x,y],[x+w,y],[x+w,y+h],[x,y+h]],12)
  ctx.fillStyle='#424e43';ctx.fillRect(x,y,w,h)
  ctx.fillStyle=matte(ctx,x,y,w,h,'#727c68');ctx.fillRect(x+2,y+2,w-5,h-12)
  ctx.strokeStyle='#48594338';line(ctx,x+5,y+h/2,x+w-5,y+h/2)
}

function loadingYard(ctx:CanvasRenderingContext2D,x:number,y:number,h:number){
  ctx.fillStyle='#252f29';ctx.fillRect(x,y,85,h)
  // A compact, parked container stack sits well outside the playable district.
  for(const [i,dy] of [12,49].entries()){
    if(dy+27>h)continue
    polygon(ctx,[[x+9,y+dy],[x+70,y+dy],[x+73,y+dy+4],[x+73,y+dy+26],[x+9,y+dy+26]],i?'#414735':'#354b3b','#71806370')
    ctx.fillStyle='#182f2390';ctx.fillRect(x+10,y+dy+20,63,6)
    ctx.strokeStyle='#9ba77f55';ctx.lineWidth=.7;line(ctx,x+11,y+dy+2,x+68,y+dy+2)
    ctx.strokeStyle='#1a30268a';for(const dx of [20,32,44,56])line(ctx,x+dx,y+dy+5,x+dx,y+dy+17)
  }
  ctx.strokeStyle='#ada27a45';ctx.lineWidth=.8;line(ctx,x+5,y+h-12,x+72,y+h-12)
}

/** Quiet scenery beyond physical cover makes the district part of a larger city. */
export function drawSurroundings(ctx:CanvasRenderingContext2D){
  const {width:w,height:h}=FIELD,m=SCENERY_MARGIN
  ctx.save();ctx.lineCap='butt';ctx.lineWidth=1
  ctx.fillStyle=CITY_INK.ground;ctx.fillRect(-m,-m,w+m*2,h+m*2)
  ctx.fillStyle='#414b3e';ctx.fillRect(-m,-m,w+m*2,m)
  ctx.fillStyle=CITY_INK.pavement
  for(const x of ROADS.avenues)ctx.fillRect(x-ROADS.avenueWidth/2,-m,ROADS.avenueWidth,m)
  for(const y of [-350,-760])ctx.fillRect(-m,y-44,w+m*2,88)
  for(const block of CITY.blocks.filter(b=>b.row===0)){
    backgroundRoof(ctx,block.x+16,-600,block.width-32,142)
    backgroundRoof(ctx,block.x+24,-980,block.width-48,140)
  }
  ctx.strokeStyle='#b0a47d50';ctx.setLineDash([15,29])
  for(const x of ROADS.avenues)line(ctx,x,-m,x,-25)
  ctx.setLineDash([])
  drawRailway(ctx)
  ctx.font='10px monospace';ctx.fillStyle='#78927b70';ctx.fillText('F R E I G H T   S I D I N G S',674,-322)

  // Neighboring factory backs and their enclosed loading courts.
  ctx.fillStyle='#454d40';ctx.fillRect(-m,0,m,h)
  for(const block of CITY.blocks.filter(b=>b.column===0)){
    const height=Math.min(170,block.height-32)
    backgroundRoof(ctx,-660,block.y+16,240,height)
    loadingYard(ctx,-270,block.y+18,height-4)
  }
  ctx.fillStyle=CITY_INK.pavement
  for(const x of [-330,-770])ctx.fillRect(x-52,0,104,h)
  for(const y of ROADS.streets){
    ctx.fillStyle=CITY_INK.pavement;ctx.fillRect(-m,y-44,m,88)
    ctx.strokeStyle='#b0a47d50';ctx.lineWidth=1;ctx.setLineDash([15,29]);line(ctx,-m,y,-25,y);ctx.setLineDash([])
  }

  // The eastern industrial district continues beyond the damaged service yards.
  ctx.fillStyle='#535642';ctx.fillRect(w,-30,m,h+m+30)
  ctx.fillStyle=CITY_INK.pavement
  for(const x of [w+330,w+770])ctx.fillRect(x-52,0,104,h)
  for(const block of CITY.blocks.filter(b=>b.column===4)){
    loadingYard(ctx,w+185,block.y+18,Math.min(166,block.height-36))
    backgroundRoof(ctx,w+430,block.y+16,245,Math.min(170,block.height-32))
  }
  for(const y of ROADS.streets){
    ctx.fillStyle=CITY_INK.pavement;ctx.fillRect(w,y-44,m,88)
    ctx.strokeStyle='#b0a47d50';ctx.setLineDash([15,29]);line(ctx,w+25,y,w+m,y);ctx.setLineDash([])
  }
  drawWaterfront(ctx)
  ctx.restore()
}
