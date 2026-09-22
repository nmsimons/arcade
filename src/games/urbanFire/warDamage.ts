import { CITY } from './cityPlan.ts'
import type { CityBuilding } from './cityPlan'
import { CITY_IMPACTS } from './cityLifePlan.ts'
import { line, polygon, variation } from './sceneryGeometry.ts'
import type { Point } from './sceneryGeometry'

// The east side and the freight approach took the shelling. The civic core
// retains more intact streets; damage is composed into places, never tiled.

function brokenRing(x:number,y:number,r:number,seed:number):Point[]{
  return Array.from({length:13},(_,i)=>{
    const angle=i/13*Math.PI*2,reach=r*(.8+variation(seed,i)*.3)
    return [x+Math.cos(angle)*reach,y+Math.sin(angle)*reach*.79] as const
  })
}

function impact(ctx:CanvasRenderingContext2D,x:number,y:number,r:number,seed:number){
  // Drivable crater depressions have no hard-cover contour or raised shadow.
  const dust=ctx.createRadialGradient(x,y,r*.6,x,y,r*1.6)
  dust.addColorStop(0,'#a7956642');dust.addColorStop(1,'#a7956600')
  ctx.fillStyle=dust;ctx.fillRect(x-r*1.6,y-r*1.6,r*3.2,r*3.2)
  polygon(ctx,brokenRing(x,y,r,seed+4),'#726f59')
  ctx.save()
  const shape=brokenRing(x+1,y+2,r*.83,seed+4)
  ctx.beginPath();shape.forEach(([px,py],i)=>i?ctx.lineTo(px,py):ctx.moveTo(px,py));ctx.closePath();ctx.clip()
  const bowl=ctx.createRadialGradient(x-r*.14,y-r*.18,1,x,y,r)
  bowl.addColorStop(0,'#222c29');bowl.addColorStop(.55,'#353d31');bowl.addColorStop(1,'#6a6d54')
  ctx.fillStyle=bowl;ctx.fillRect(x-r,y-r,r*2,r*2);ctx.restore()
  polygon(ctx,[[x-r*.55,y+r*.2],[x-r*.2,y+r*.64],[x+r*.48,y+r*.37],
    [x+r*.29,y+r*.14],[x-r*.1,y+r*.36]],'#aaa17a60')
  ctx.lineWidth=.8;ctx.strokeStyle='#82856945'
  for(let i=0;i<5;i++){
    const a=variation(seed,i+7)*Math.PI*2,c=Math.cos(a),s=Math.sin(a)*.79
    ctx.beginPath();ctx.moveTo(x+c*r*.92,y+s*r*.92)
    ctx.lineTo(x+c*r*1.24+2,y+s*r*1.24-1);ctx.lineTo(x+c*r*1.65,y+s*r*1.65);ctx.stroke()
    const px=x+c*r*1.2,py=y+s*r*1.2
    polygon(ctx,[[px-2,py],[px+1,py-1],[px+3,py+2]],'#7d7b5655')
  }
}

function wreckScorch(ctx:CanvasRenderingContext2D,x:number,y:number,w:number,h:number){
  const r=Math.max(w,h)*.63
  polygon(ctx,brokenRing(x,y,r*1.24,x+y),'#65503828')
  polygon(ctx,brokenRing(x,y,r,x-y),'#040e0dd9')
  // Burn streaks run away from the hull, rather than a circular decal on every car.
  polygon(ctx,[[x-w*.3,y],[x+w*.4,y-4],[x+w*.8+13,y-22],[x+w*.3+8,y-35],[x-w*.2,y-22]],'#0a14129a')
}

function tireTrail(ctx:CanvasRenderingContext2D,points:readonly Point[],burned=false){
  ctx.save();ctx.strokeStyle=burned?'#050f0f90':'#75705926';ctx.lineWidth=2.1
  for(const offset of [-4,4]){
    ctx.beginPath();ctx.moveTo(points[0][0]+offset,points[0][1])
    ctx.bezierCurveTo(points[1][0]+offset,points[1][1],points[2][0]+offset,points[2][1],points[3][0]+offset,points[3][1]);ctx.stroke()
  }
  ctx.restore()
}

function fallenLamp(ctx:CanvasRenderingContext2D,x:number,y:number,angle:number){
  // Flattened infrastructure has quiet broken lines, not a solid-cover outline.
  ctx.save();ctx.translate(x,y);ctx.rotate(angle)
  ctx.strokeStyle='#101d18';ctx.lineWidth=3;line(ctx,1,2,29,2)
  ctx.strokeStyle='#84917b66';ctx.lineWidth=1.2
  ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(18,0);ctx.lineTo(28,-5);ctx.lineTo(35,-5);ctx.stroke()
  polygon(ctx,[[32,-7],[39,-7],[41,-5],[37,-3],[32,-3]],'#4c5c484f')
  ctx.strokeStyle='#7b856d35';ctx.lineWidth=.7
  ctx.beginPath();ctx.moveTo(4,2);ctx.quadraticCurveTo(13,9,22,3);ctx.quadraticCurveTo(27,-1,31,3);ctx.stroke()
  ctx.restore()
}

export function drawWarGround(ctx:CanvasRenderingContext2D){
  ctx.save();ctx.lineCap='butt'
  for(const {site,entrance,interior} of CITY.ruins){
    const court=site.streetFootprint??site,north=entrance.y<interior.y
    const y=north?court.y:court.y+court.height,d=north?-1:1
    // A breach throws a fan of dust and flat fragments out into its actual approach.
    polygon(ctx,[[court.x+8,y-d*9],[court.x+court.width*.74,y-d*4],
      [court.x+court.width*.86,y+d*18],[court.x+court.width*.6,y+d*31],
      [court.x+court.width*.23,y+d*22],[court.x+2,y+d*12]],'#96815b1d')
    for(let i=0;i<8;i++){
      const px=court.x+8+variation(site.x,i)*(court.width-16),py=y+d*(4+variation(site.y,i)*20)
      polygon(ctx,[[px-1,py],[px+2,py-2],[px+4,py+1],[px,py+2]],i%3?'#757c6045':'#8b72554a')
    }
  }
  for(const p of CITY.props)if(p.condition==='burned')wreckScorch(ctx,p.x+p.width/2,p.y+p.height/2,p.width,p.height)
  for(const crater of CITY_IMPACTS)impact(ctx,crater.x,crater.y,crater.r,crater.seed)
  // Broken curbs connect the street impacts to the adjacent damaged properties.
  polygon(ctx,[[1359,418],[1371,422],[1379,436],[1366,450],[1357,443]],'#26352c')
  polygon(ctx,[[1150,854],[1163,847],[1183,855],[1189,864],[1174,868],[1157,863]],'#29362b')
  ctx.strokeStyle='#8d937365';ctx.lineWidth=.8
  line(ctx,1362,422,1366,428);line(ctx,1371,440,1365,446)
  line(ctx,1155,856,1164,853);line(ctx,1176,861,1183,862)
  tireTrail(ctx,[[288,296],[269,324],[256,345],[246,380]],true)
  tireTrail(ctx,[[1294,268],[1285,300],[1270,316],[1270,357]],true)
  tireTrail(ctx,[[998,1005],[997,875],[1106,918],[1107,785]])
  tireTrail(ctx,[[610,717],[608,675],[512,697],[494,642]])
  fallenLamp(ctx,1284,412,-.7);fallenLamp(ctx,1505,578,2.8);fallenLamp(ctx,521,814,-2.2)

  // Evidence of civic use remains visible underneath the emergency occupation.
  ctx.font='7px monospace';ctx.fillStyle='#bcc4a05c';ctx.fillText('AID',685,311)
  ctx.strokeStyle='#b5bea055';ctx.lineWidth=1
  line(ctx,719,306,738,306);line(ctx,735,303,738,306);line(ctx,735,309,738,306)
  ctx.font='6px monospace';ctx.fillStyle='#adad855a';ctx.fillText('EVAC',484,669)
  // A few dropped papers beside the abandoned bus and aid post, not global noise.
  for(const [x,y] of [[117,458],[126,450],[731,313],[904,470],[486,652]]){
    polygon(ctx,[[x,y],[x+3,y-1],[x+4,y+2],[x+1,y+3]],'#a3a58942')
  }
  ctx.restore()
}

/** Localized roof damage supports the surrounding impact sites. Intact roofs stay
 * quiet; a wound is a localized dark breach rather than a repeated texture. */
export function drawRoofDamage(ctx:CanvasRenderingContext2D,building:CityBuilding,w:number,h:number){
  const damaged=building.blockId==='4:2'||building.blockId==='3:2'&&building.kind==='warehouse'||
    building.blockId==='1:1'&&building.kind==='workshop'&&building.frontage==='north'
  if(!damaged)return
  if(building.blockId==='1:1'){
    // A raking impact scored this roof without removing its whole surface.
    polygon(ctx,[[w*.65,h*.3],[w*.94,h*.37],[w*.94,h*.57],[w*.68,h*.46]],'#080f0d88')
    ctx.strokeStyle='#8d795140';ctx.lineWidth=.8
    for(const d of [0,5,11])line(ctx,w*.66,h*.3+d,w*.92,h*.36+d)
    return
  }
  const x=w*.77,y=h*.3,r=Math.min(15,w*.17,h*.2)
  polygon(ctx,brokenRing(x,y,r*1.65,building.x),'#74563228')
  polygon(ctx,brokenRing(x,y,r,building.y),'#080f0d')
  ctx.strokeStyle='#89734f60';ctx.lineWidth=.7
  ctx.beginPath();ctx.moveTo(x-r*.7,y+r*.5);ctx.lineTo(x-1,y+r*.65);ctx.lineTo(x+r*.6,y+r*.2);ctx.stroke()
  ctx.strokeStyle='#6c795850';line(ctx,x+r*.8,y-2,x+r*1.5,y-8);line(ctx,x+r*1.5,y-8,x+r*1.7,y-15)
}

const SMOKE=CITY.props.filter(p=>p.condition==='burned'&&(p.kind==='truck'||p.blockId==='4:2'))

/** The presentation clock freezes with combat. Smoke is translucent and drawn
 * below actors and projectiles, so it cannot obscure aiming or change rules. */
export function drawWarAtmosphere(ctx:CanvasRenderingContext2D,time:number){
  ctx.save()
  for(const [index,p] of SMOKE.entries()){
    const x=p.x+p.width*.5,y=p.y+p.height*.25
    // Tiny banked embers, not combat-sized flashes.
    ctx.globalAlpha=.28+Math.sin(time*3+index)*.07
    polygon(ctx,[[x-2,y+3],[x-1,y-2],[x+1,y],[x+3,y-3],[x+2,y+4]],'#b18b51')
    for(let i=0;i<5;i++){
      const phase=(time*.13+i/5+index*.27)%1
      const px=x+phase*26+Math.sin(phase*7+index)*4,py=y-phase*61
      const r=3+phase*16
      ctx.globalAlpha=Math.sin(phase*Math.PI)*.21
      const smoke=ctx.createRadialGradient(px-r*.2,py-r*.2,0,px,py,r)
      smoke.addColorStop(0,'#c2bda5b0');smoke.addColorStop(.45,'#93958275');smoke.addColorStop(1,'#777e7200')
      ctx.fillStyle=smoke;ctx.fillRect(px-r,py-r,r*2,r*2)
    }
  }
  ctx.restore()
}
