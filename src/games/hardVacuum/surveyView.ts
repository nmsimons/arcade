import { REGIONS, STATION_HEIGHT, STATION_WIDTH } from './campaignWorld.ts'
import type { Vector2 } from './types'

export function surveyRegion(pos: Vector2) {
  return REGIONS.find(r=>pos.x>=r.bounds[0] && pos.x<=r.bounds[0]+r.bounds[2] && pos.y>=r.bounds[1] && pos.y<=r.bounds[1]+r.bounds[3]) ??
    [...REGIONS].sort((a,b)=>Math.hypot(pos.x-a.bounds[0]-a.bounds[2]/2,pos.y-a.bounds[1]-a.bounds[3]/2)-Math.hypot(pos.x-b.bounds[0]-b.bounds[2]/2,pos.y-b.bounds[1]-b.bounds[3]/2))[0]
}

export function surveyView(pos: Vector2, width: number, height: number, overview: boolean, zoom = 1, focus?: Vector2) {
  const region = surveyRegion(pos), bounds = overview ? [0,0,STATION_WIDTH,STATION_HEIGHT] : region.bounds
  const w = Math.max(160,width-24), h = Math.max(150,height-(width<700 ? 285 : 230)), x = (width-w)/2, y = 135
  const scale = Math.min((w-24)/bounds[2],(h-40)/bounds[3])*zoom
  const requested = zoom > 1 ? focus ?? pos : {x:bounds[0]+bounds[2]/2,y:bounds[1]+bounds[3]/2}
  const halfX = Math.min(bounds[2]/2,(w-20)/scale/2), halfY = Math.min(bounds[3]/2,(h-30)/scale/2)
  const center = {
    x:Math.max(bounds[0]+halfX,Math.min(bounds[0]+bounds[2]-halfX,requested.x)),
    y:Math.max(bounds[1]+halfY,Math.min(bounds[1]+bounds[3]-halfY,requested.y)),
  }
  const point = (p:Vector2) => ({x:width/2+(p.x-center.x)*scale,y:y+26+(h-35)/2+(p.y-center.y)*scale})
  return { region, bounds, w, h, x, y, scale, center, point }
}
