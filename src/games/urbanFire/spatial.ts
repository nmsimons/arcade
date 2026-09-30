import type { Vector2, Wall } from './types'

export type ViewBounds = { left:number; top:number; right:number; bottom:number }
export const inView=(view:ViewBounds,pos:Vector2,radius:number)=>
  pos.x+radius>=view.left&&pos.x-radius<=view.right&&pos.y+radius>=view.top&&pos.y-radius<=view.bottom

export const dropInView=(view:ViewBounds,pos:Vector2,height:number,radius:number)=>
  pos.x+radius>=view.left&&pos.x-radius<=view.right&&pos.y+height*.2+radius>=view.top&&
  pos.y-height*.8-radius<=view.bottom

/** Immutable cover, indexed once. Queries preserve authored solver order and
 * use rotated bounds, including long facades and the tips of angled obstacles. */
export function createWallIndex(walls:readonly Wall[],cellSize=128){
  const cells=new Map<string,number[]>()
  walls.forEach((wall,index)=>{
    const c=Math.abs(Math.cos(wall.angle??0)),s=Math.abs(Math.sin(wall.angle??0))
    const rx=(wall.width*c+wall.height*s)/2,ry=(wall.width*s+wall.height*c)/2
    const x=wall.x+wall.width/2,y=wall.y+wall.height/2
    for(let cx=Math.floor((x-rx)/cellSize);cx<=Math.floor((x+rx)/cellSize);cx++)
      for(let cy=Math.floor((y-ry)/cellSize);cy<=Math.floor((y+ry)/cellSize);cy++){
        const key=`${cx},${cy}`,list=cells.get(key)
        if(list)list.push(index);else cells.set(key,[index])
      }
  })
  return (pos:Vector2,radius:number)=>{
    const found=new Set<number>()
    for(let cx=Math.floor((pos.x-radius)/cellSize);cx<=Math.floor((pos.x+radius)/cellSize);cx++)
      for(let cy=Math.floor((pos.y-radius)/cellSize);cy<=Math.floor((pos.y+radius)/cellSize);cy++)
        for(const index of cells.get(`${cx},${cy}`)??[])found.add(index)
    return [...found].sort((a,b)=>a-b).map(index=>walls[index])
  }
}
