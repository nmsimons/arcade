import { FIELD } from './types.ts'
import type { Wall } from './types'
import { CITY, buildingEntrance } from './cityPlan.ts'
import type { BuildingKind, CityBuilding } from './cityPlan'
import { drawStreets } from './streets.ts'
import { drawDamagedCover, drawRuinFloors } from './damagedCity.ts'
import { CITY_INK, castShadow, matte, outlineCover, outlineRect } from './cityInk.ts'
import { drawSurroundings } from './perimeterRender.ts'
import { drawCityProps } from './cityProps.ts'
import { drawWarGround, drawRoofDamage } from './warDamage.ts'

type Point = readonly [number, number]
type Palette = { roof: string; side: string; edge: string; detail: string }
const PALETTES: Palette[] = [
  { roof:'#797b6c',side:'#4b5147',edge:'#a2a18b',detail:'#c5bba0' },
  { roof:'#73858b',side:'#414f55',edge:'#a1afb0',detail:'#b6c4c0' },
  { roof:'#858975',side:'#565d4e',edge:'#b3b5a0',detail:'#c4c4aa' },
  { roof:'#8d8169',side:'#5b5545',edge:'#b5a78d',detail:'#d0ba91' },
]
const line = (ctx: CanvasRenderingContext2D, x: number, y: number, x2: number, y2: number) => {
  ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x2,y2);ctx.stroke()
}
function polygon(ctx: CanvasRenderingContext2D, points: readonly Point[], fill: string, stroke?: string) {
  ctx.beginPath();points.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.closePath()
  ctx.fillStyle=fill;ctx.fill()
  if(stroke){ctx.strokeStyle=stroke;ctx.stroke()}
}
// Identity comes from the physical address, so rebuilds and array ordering
// cannot shuffle the neighborhood or consume the combat random sequence.
const plannedBuilding = (wall: Wall) => [...CITY.buildings,...CITY.edgeBuildings].find(b=>b.x===wall.x&&b.y===wall.y&&b.width===wall.width&&b.height===wall.height)
function buildingStyle(wall: Wall) {
  const planned=plannedBuilding(wall)
  const {x,y,width:w,height:h}=wall
  const seed=Math.abs(Math.round(x*3+y*7+w*11+h*13))
  const district=planned?.district ?? Number(x>FIELD.width/2)+Number(y>FIELD.height/2)*2
  const kinds: BuildingKind[][]=[['warehouse','utility','workshop'],['office','comms','office'],
    ['apartments','office','apartments'],['workshop','warehouse','utility']]
  const kind=planned?.kind ?? kinds[district][seed%3]
  return {kind,palette:PALETTES[district],height:kind==='office'?19:kind==='apartments'?15:kind==='comms'?17:9}
}
// Broad, matte roof planes retain at most one quiet feature. The raised parapet
// and shaded facade provide depth without outlining the building.
function drawRoof(ctx:CanvasRenderingContext2D,w:number,h:number,kind:BuildingKind,palette:Palette){
  ctx.fillStyle=matte(ctx,0,0,w,h,palette.roof);ctx.fillRect(0,0,w,h)
  ctx.strokeStyle='#222d282a';ctx.lineWidth=.8
  if(kind==='warehouse'||kind==='workshop'){
    const ridge=kind==='warehouse'?.5:.36
    ctx.fillStyle='#f1e9c512'
    if(w>=h){ctx.fillRect(0,0,w,h*ridge);line(ctx,4,h*ridge,w-4,h*ridge)}
    else{ctx.fillRect(0,0,w*ridge,h);line(ctx,w*ridge,4,w*ridge,h-4)}
  }else if(kind==='apartments'){
    ctx.fillStyle='#29312b50';ctx.fillRect(10,11,13,9)
    ctx.fillStyle='#b0b0a0';ctx.fillRect(8,8,12,9);ctx.fillStyle='#687360';ctx.fillRect(8,15,12,3)
  }else if(kind==='utility'){
    ctx.fillStyle='#3e4b42';ctx.beginPath();ctx.arc(w*.5,h*.45,7,0,Math.PI*2);ctx.fill()
    ctx.fillStyle='#9ca490';ctx.beginPath();ctx.arc(w*.5-1,h*.45-2,5,0,Math.PI*2);ctx.fill()
  }else if(kind==='comms'){
    const x=w*.5,y=h*.45
    line(ctx,x,y-7,x,y+7);line(ctx,x-5,y-3,x+5,y-3)
  }
  // Offices intentionally have a completely untextured flat roof.
}

function drawBuilding(ctx: CanvasRenderingContext2D, wall: Wall) {
  const {x,y,width:w,height:h}=wall,{palette,kind,height:rise}=buildingStyle(wall)
  const planned=plannedBuilding(wall)
  ctx.save();ctx.translate(x,y);ctx.lineWidth=1
  // The outside edge is the actual cover boundary. Depth is inset into it.
  ctx.fillStyle=CITY_INK.face;ctx.fillRect(0,0,w,h)
  const roofX=4,roofY=3,roofW=w-8,roofH=h-rise-5
  polygon(ctx,[[0,0],[w,0],[w-4,3],[4,3]],palette.edge)
  polygon(ctx,[[0,0],[4,3],[4,roofY+roofH],[0,h]],palette.roof)
  polygon(ctx,[[w,0],[w,h],[w-4,roofY+roofH],[w-4,3]],'#343f38')
  polygon(ctx,[[0,h],[w,h],[w-4,roofY+roofH],[4,roofY+roofH]],palette.side)
  // Tiny facade lights establish height without competing with combat signals.
  if(rise>=9){
    for(const fraction of [.25,.5,.75]){
      ctx.fillStyle='#202d27';ctx.fillRect(w*fraction-3,h-7,6,3)
      ctx.fillStyle=palette.detail+'60';ctx.fillRect(w*fraction-3,h-4,6,1)
    }
  }
  ctx.fillStyle=CITY_INK.face;ctx.fillRect(roofX,roofY,roofW,roofH)
  ctx.save();ctx.beginPath();ctx.rect(roofX+1,roofY+1,roofW-2,roofH-2);ctx.clip();ctx.translate(roofX,roofY)
  drawRoof(ctx,roofW,roofH,kind,palette)
  // A narrow parapet casts a soft inset shadow onto an otherwise simple roof.
  const occlusion=ctx.createLinearGradient(0,0,0,7)
  occlusion.addColorStop(0,'#1a271f48');occlusion.addColorStop(1,'#1a271f00')
  ctx.fillStyle=occlusion;ctx.fillRect(0,0,roofW,7)
  if(planned)drawRoofDamage(ctx,planned,roofW,roofH)
  ctx.restore()
  ctx.restore()
  if(planned)drawFrontage(ctx,planned,palette)
  outlineRect(ctx,wall)
}

function drawFrontage(ctx:CanvasRenderingContext2D,building:CityBuilding,palette:Palette){
  const door=buildingEntrance(building)
  const rotation={south:0,north:Math.PI,east:-Math.PI/2,west:Math.PI/2}[building.frontage]
  ctx.save();ctx.translate(door.x,door.y);ctx.rotate(rotation)
  ctx.fillStyle='#0a1212';ctx.fillRect(-10,-3,20,3)
  ctx.strokeStyle=palette.detail+'a0';ctx.lineWidth=1.3;line(ctx,-10,-3,10,-3)
  if(building.kind==='warehouse'||building.kind==='workshop'){
    ctx.strokeStyle='#b6aa7655';ctx.lineWidth=1
    for(let i=0;i<4;i++)line(ctx,-12+i*6,2,-16+i*6,7)
  }else if(building.kind==='apartments'){
    // A shuttered ground-floor shop and folded awning sit entirely within the
    // facade, preserving the simple roof and the street's actual clear space.
    polygon(ctx,[[-18,-8],[18,-8],[16,-3],[-16,-3]],'#52685c70')
    ctx.strokeStyle='#a9b08b65';ctx.lineWidth=.7;line(ctx,-18,-8,18,-8)
    ctx.fillStyle='#0c1914';ctx.fillRect(-9,-3,18,3)
    ctx.strokeStyle='#96846770';line(ctx,-8,-3,8,-1)
  }
  ctx.restore()
}

function civicCenter(ctx: CanvasRenderingContext2D, horizontal: Wall, vertical: Wall) {
  const l=horizontal.x,r=l+horizontal.width,t=vertical.y,b=t+vertical.height
  const vl=vertical.x,vr=vl+vertical.width,ht=horizontal.y,hb=ht+horizontal.height
  const outline:Point[]=[[vl,t],[vr,t],[vr,ht],[r,ht],[r,hb],[vr,hb],[vr,b],[vl,b],[vl,hb],[l,hb],[l,ht],[vl,ht]]
  const roof:Point[]=[[vl+5,t+4],[vr-6,t+4],[vr-6,ht+4],[r-6,ht+4],[r-6,hb-12],[vr-6,hb-12],[vr-6,b-12],[vl+5,b-12],[vl+5,hb-12],[l+5,hb-12],[l+5,ht+4],[vl+5,ht+4]]
  ctx.save();ctx.lineWidth=.7
  polygon(ctx,outline,CITY_INK.face)
  for(let i=0;i<outline.length;i++)polygon(ctx,[outline[i],outline[(i+1)%outline.length],roof[(i+1)%roof.length],roof[i]],i%3===0?'#889188':'#4a5b53')
  polygon(ctx,roof,'#8e9c91')
  const cx=(vl+vr)/2,cy=(ht+hb)/2
  // A single quiet landmark mark on an otherwise flat civic roof.
  ctx.fillStyle='#bfd3a36a';ctx.fillRect(cx-3,cy-17,6,24);ctx.fillRect(cx-12,cy-8,24,6)
  ctx.strokeStyle='#bed1a09a';line(ctx,vl+25,b-1,vr-25,b-1)
  ctx.restore()
  outlineCover(ctx,outline)
}

/** Cached with the battlefield; detailed neighborhoods cost no per-frame work. */
export function drawCity(ctx: CanvasRenderingContext2D, walls: Wall[]) {
  ctx.save();ctx.lineJoin='round';ctx.lineCap='round'
  drawSurroundings(ctx)
  drawStreets(ctx)
  drawRuinFloors(ctx)
  drawWarGround(ctx)
  for(const wall of walls)if(plannedBuilding(wall)){
    const {x,y,width:w,height:h}=wall
    castShadow(ctx,[[x,y],[x+w,y],[x+w,y+h],[x,y+h]],buildingStyle(wall).height)
  }
  const horizontal=walls.find(w=>plannedBuilding(w)?.civicWing==='horizontal')
  const vertical=walls.find(w=>plannedBuilding(w)?.civicWing==='vertical')
  for(const wall of walls)if(plannedBuilding(wall)&&wall!==horizontal&&wall!==vertical)drawBuilding(ctx,wall)
  if(horizontal&&vertical){
    civicCenter(ctx,horizontal,vertical)
    for(const wall of [horizontal,vertical]){const b=plannedBuilding(wall)!;drawFrontage(ctx,b,PALETTES[b.district])}
  }
  drawDamagedCover(ctx)
  drawCityProps(ctx)
  ctx.restore()
}
