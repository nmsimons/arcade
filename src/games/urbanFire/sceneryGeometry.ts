import type { Wall } from './types'
import { outlineCover } from './cityInk.ts'

export type Point = readonly [number, number]

export function path(ctx: CanvasRenderingContext2D, points: readonly Point[]) {
  ctx.beginPath()
  points.forEach(([x,y],i)=>i ? ctx.lineTo(x,y) : ctx.moveTo(x,y))
  ctx.closePath()
}

export function polygon(ctx: CanvasRenderingContext2D, points: readonly Point[], fill: string, stroke?: string) {
  path(ctx,points);ctx.fillStyle=fill;ctx.fill()
  if(stroke){ctx.save();ctx.globalAlpha*=.28;ctx.strokeStyle=stroke;ctx.stroke();ctx.restore()}
}

export function line(ctx: CanvasRenderingContext2D, x: number, y: number, x2: number, y2: number) {
  ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x2,y2);ctx.stroke()
}

// Address-based variation never advances the combat random sequence.
export function variation(seed: number, index: number) {
  const n=Math.sin(seed*12.9898+index*78.233)*43758.5453
  return n-Math.floor(n)
}

/** Trace the union of the actual collision rectangles. Joined debris and wall
 * sections read as one silhouette, without false bright seams between pieces. */
export function coverContours(rects: readonly Wall[]): Point[][] {
  const xs=[...new Set(rects.flatMap(r=>[r.x,r.x+r.width]))].sort((a,b)=>a-b)
  const ys=[...new Set(rects.flatMap(r=>[r.y,r.y+r.height]))].sort((a,b)=>a-b)
  const cells=ys.slice(1).map((y,j)=>xs.slice(1).map((x,i)=>rects.some(r=>
    (xs[i]+x)/2>r.x&&(xs[i]+x)/2<r.x+r.width&&(ys[j]+y)/2>r.y&&(ys[j]+y)/2<r.y+r.height)))
  const edges=new Map<string,{a:Point;b:Point}[]>()
  const key=([x,y]:Point)=>`${x},${y}`
  const add=(a:Point,b:Point)=>{const k=key(a);edges.set(k,[...(edges.get(k)??[]),{a,b}])}
  for(let j=0;j<cells.length;j++)for(let i=0;i<cells[j].length;i++)if(cells[j][i]){
    const x=xs[i],r=xs[i+1],y=ys[j],b=ys[j+1]
    if(!cells[j-1]?.[i])add([x,y],[r,y])
    if(!cells[j]?.[i+1])add([r,y],[r,b])
    if(!cells[j+1]?.[i])add([r,b],[x,b])
    if(!cells[j]?.[i-1])add([x,b],[x,y])
  }
  const contours:Point[][]=[]
  while(edges.size){
    const first=edges.values().next().value![0],points:Point[]=[]
    let at=first.a
    do{
      points.push(at)
      const options=edges.get(key(at))!,edge=options.pop()!
      if(!options.length)edges.delete(key(at))
      at=edge.b
    }while(key(at)!==key(first.a))
    // Remove collinear grid vertices so corners have clean vector joins.
    contours.push(points.filter((p,i)=>{
      const a=points[(i+points.length-1)%points.length],b=points[(i+1)%points.length]
      return (p[0]-a[0])*(b[1]-p[1])!==(p[1]-a[1])*(b[0]-p[0])
    }))
  }
  return contours
}

export function fillFootprint(ctx: CanvasRenderingContext2D, rects: readonly Wall[], fill: string) {
  ctx.beginPath()
  for(const r of rects)ctx.rect(r.x,r.y,r.width,r.height)
  ctx.fillStyle=fill;ctx.fill()
}

export function strokeContours(ctx: CanvasRenderingContext2D, contours: readonly Point[][]) {
  for(const points of contours)outlineCover(ctx,points)
}
