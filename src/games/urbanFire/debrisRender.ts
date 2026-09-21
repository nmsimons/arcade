import type { Wall } from './types'
import { coverContours, fillFootprint, line, path, polygon, strokeContours, variation } from './sceneryGeometry.ts'
import type { Point } from './sceneryGeometry'
import { castShadow, outlineTerrain } from './cityInk.ts'

// Sunlit fractured concrete over dark cut faces and tight contact shadows.
const CONCRETE=['#92917d','#747f70','#a19a81','#858b73']

function chippedContour(points:readonly Point[]):Point[]{
  // Only clip a few units off convex corners. The silhouette still reaches
  // every collision extent; large corners no longer look like storage crates.
  return points.flatMap((p,i):Point[]=>{
    const a=points[(i+points.length-1)%points.length],b=points[(i+1)%points.length]
    const before=Math.hypot(p[0]-a[0],p[1]-a[1]),after=Math.hypot(b[0]-p[0],b[1]-p[1])
    const cross=(p[0]-a[0])*(b[1]-p[1])-(p[1]-a[1])*(b[0]-p[0])
    if(cross<=0)return [p]
    const cut=Math.min(3.5,before*.24,after*.24)
    return [[p[0]+(a[0]-p[0])*cut/before,p[1]+(a[1]-p[1])*cut/before],
      [p[0]+(b[0]-p[0])*cut/after,p[1]+(b[1]-p[1])*cut/after]]
  })
}

function fragment(ctx:CanvasRenderingContext2D,x:number,y:number,w:number,h:number,angle:number,seed:number,solid:boolean){
  ctx.save();ctx.translate(x,y);ctx.rotate(angle);ctx.lineWidth=.7
  const top:readonly (readonly [number,number])[]=[[-w*.5,-h*.22],[-w*.28,-h*.52],[w*.34,-h*.4],
    [w*.5,-h*.08],[w*.26,h*.25],[-w*.38,h*.2]]
  const depth=solid?h*.25:h*.06
  polygon(ctx,[top[5],top[4],top[3],[w*.5,-h*.08+depth],[w*.26,h*.25+depth],[-w*.38,h*.2+depth]], '#454e42')
  polygon(ctx,top,CONCRETE[seed%CONCRETE.length])
  ctx.strokeStyle='#d2c9ac50'
  line(ctx,-w*.5,-h*.22,-w*.28,-h*.52);line(ctx,-w*.28,-h*.52,w*.34,-h*.4)
  if(w>26){
    ctx.strokeStyle='#293b31';ctx.lineWidth=.8
    ctx.beginPath();ctx.moveTo(-w*.12,-h*.43);ctx.lineTo(w*.04,-h*.08)
    ctx.lineTo(-w*.06,h*.22);ctx.stroke()
  }
  ctx.restore()
}

/** Every substantial fragment stays inside the same solid footprint used by
 * driving and bullets. Small ground chips are painted separately, without a rim. */
export function drawRubble(ctx:CanvasRenderingContext2D,rects:readonly Wall[],steel=false,solid=true){
  if(!rects.length)return
  const contours=coverContours(rects).map(chippedContour)
  ctx.save()
  for(const contour of contours)castShadow(ctx,contour,solid?7:1.5)
  for(const contour of contours)polygon(ctx,contour,solid?'#4c5547':'#665f4e')
  ctx.beginPath()
  for(const contour of contours){
    contour.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.closePath()
  }
  ctx.clip()
  for(const [i,r] of rects.entries()){
    const seed=r.x*7+r.y*13,rw=r.width,rh=r.height
    // A broad broken panel anchors each composition, with subordinate fragments.
    fragment(ctx,r.x+rw*.49,r.y+rh*.43,rw*(1+variation(seed,3)*.2),rh*.94,(variation(seed,0)-.5)*.8,i,solid)
    fragment(ctx,r.x+rw*.8,r.y+rh*.81,rw*.52,rh*.48,-.7+variation(seed,1),i+1,solid)
    fragment(ctx,r.x+rw*.14,r.y+rh*.86,rw*.38,rh*.28,.4-variation(seed,2),i+2,solid)
    for(let j=0;j<2;j++){
      const x=r.x+variation(seed,j+3)*rw,y=r.y+variation(seed,j+12)*rh
      polygon(ctx,[[x-2,y],[x,y-1.5],[x+3,y+1],[x+1,y+2]],j?'#263a2f':'#795f475c')
    }
    // Two bent reinforcing rods attached to a concrete fragment.
    ctx.strokeStyle='#a29b796e';ctx.lineWidth=.8
    for(const d of [0,3]){
      ctx.beginPath();ctx.moveTo(r.x+rw*.56+d,r.y+rh*.22)
      ctx.lineTo(r.x+rw*.69+d,r.y+rh*.06);ctx.lineTo(r.x+rw*.86+d,r.y+rh*.12);ctx.stroke()
    }
  }
  if(steel){
    const r=rects[0],w=r.width,h=r.height
    ctx.save();ctx.translate(r.x+w*.52,r.y+h*.57);ctx.rotate(-.08)
    polygon(ctx,[[-w*.43,-2],[w*.38,-2],[w*.44,2],[w*.16,5],[-w*.43,3]],'#493f32','#938566')
    ctx.strokeStyle='#b9a07d70';line(ctx,-w*.4,-2,w*.36,-2)
    ctx.restore()
  }
  ctx.restore()
  if(solid)strokeContours(ctx,contours)
  else for(const contour of contours)outlineTerrain(ctx,contour)
}

/** Chipped top courses over a shaded upright face, rather than hollow boxes. */
export function drawRuinWalls(ctx:CanvasRenderingContext2D,walls:readonly Wall[],roofs:readonly Wall[],mirrored:boolean){
  const contours=coverContours([...walls,...roofs])
  for(const contour of contours)castShadow(ctx,contour,10)
  ctx.save();fillFootprint(ctx,walls,'#59604e')
  ctx.beginPath();for(const r of walls)ctx.rect(r.x,r.y,r.width,r.height);ctx.clip()
  for(const r of walls){
    const horizontal=r.width>r.height,w=horizontal?r.width:r.height,h=horizontal?r.height:r.width
    ctx.save();ctx.translate(r.x,r.y)
    if(!horizontal){ctx.translate(r.width,0);ctx.rotate(Math.PI/2)}
    polygon(ctx,[[0,0],[w,0],[w-2,h*.45],[w*.72,h*.5],[w*.68,h*.32],
      [w*.43,h*.5],[w*.37,h*.3],[w*.15,h*.5],[0,h*.45]],'#aaa48b')
    ctx.strokeStyle='#17271f';ctx.lineWidth=.8
    // A few broken masonry joints, never a dense brick texture.
    for(let x=16;x<w-5;x+=29){line(ctx,x,1,x+2,h*.37);line(ctx,x+2,h*.37,x+6,h*.53)}
    ctx.fillStyle='#121e19'
    for(let x=20;x<w-12;x+=43)ctx.fillRect(x,h*.6,9,h*.4)
    ctx.strokeStyle='#a6ad8975';ctx.lineWidth=.7
    for(const offset of [3,6])line(ctx,w-7,offset*.65,w-1,offset)
    ctx.restore()
  }
  ctx.restore()
  for(const r of roofs){
    const {width:w,height:h}=r
    ctx.save();ctx.translate(r.x,r.y)
    if(mirrored){ctx.translate(0,h);ctx.scale(1,-1)}
    ctx.fillStyle='#515846';ctx.fillRect(0,0,w,h)
    // One quiet roof plane ends in a fractured concrete edge and exposed rods.
    polygon(ctx,[[0,0],[w,0],[w,h*.55],[w*.83,h*.68],[w*.7,h*.56],
      [w*.47,h*.78],[w*.33,h*.66],[w*.15,h*.81],[0,h*.72]],'#8b8d78')
    ctx.strokeStyle='#c1b69780';ctx.lineWidth=.9
    ctx.beginPath();ctx.moveTo(0,h*.72);ctx.lineTo(w*.15,h*.81);ctx.lineTo(w*.33,h*.66)
    ctx.lineTo(w*.47,h*.78);ctx.lineTo(w*.7,h*.56);ctx.lineTo(w*.83,h*.68);ctx.lineTo(w,h*.55);ctx.stroke()
    ctx.strokeStyle='#aa9b7175';ctx.lineWidth=.7
    for(const f of [.25,.6,.81]){line(ctx,w*f,h*.76,w*f+2,h-1);line(ctx,w*f+2,h-1,w*f+4,h-2)}
    ctx.strokeStyle='#1e3326';line(ctx,w*.65,1,w*.6,h*.25);line(ctx,w*.6,h*.25,w*.75,h*.35)
    ctx.restore()
  }
  strokeContours(ctx,contours)
}

export function groundDamage(ctx:CanvasRenderingContext2D,r:Wall,seed:number){
  // Flat dust and small unoutlined chips are traversable, unlike raised rubble.
  ctx.save();path(ctx,[[r.x,r.y],[r.x+r.width,r.y],[r.x+r.width,r.y+r.height],[r.x,r.y+r.height]]);ctx.clip()
  for(let i=0;i<9;i++){
    const x=r.x+variation(seed,i)*r.width,y=r.y+variation(seed,i+21)*r.height
    const s=1.5+variation(seed,i+41)*2
    polygon(ctx,[[x-s,y],[x+s*.2,y-s],[x+s,y+s*.4],[x,y+s]],i%3?'#53604a50':'#785e434d')
  }
  ctx.restore()
}
