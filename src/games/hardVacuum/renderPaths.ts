import type { Vector2 } from './types'

type Contour = readonly Vector2[]
const paths = new WeakMap<Contour,Path2D>()
const compounds = new WeakMap<Contour,WeakMap<readonly Contour[],Path2D>>()

/** Geometry snapshots are immutable. Weak keys release animated door paths
 * with their old maps; fixed terrain is submitted to Canvas only once. */
export function contourPath(contour:Contour):Path2D {
  let path=paths.get(contour)
  if(!path){
    path=new Path2D()
    contour.forEach((p,i)=>i ? path!.lineTo(p.x,p.y) : path!.moveTo(p.x,p.y))
    path.closePath();paths.set(contour,path)
  }
  return path
}

export function terrainPath(boundary:Contour,islands:readonly Contour[]):Path2D {
  let byIslands=compounds.get(boundary)
  if(!byIslands){byIslands=new WeakMap();compounds.set(boundary,byIslands)}
  let path=byIslands.get(islands)
  if(!path){
    path=new Path2D(contourPath(boundary))
    for(const island of islands)path.addPath(contourPath(island))
    byIslands.set(islands,path)
  }
  return path
}
