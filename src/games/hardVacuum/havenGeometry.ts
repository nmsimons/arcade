import type { TetherBody, Vector2 } from './types'
import { pointInPolygon } from './worldGeometry.ts'

export const HAVEN_RADIUS = 118
export const HAVEN_FOLDED_CLEARANCE = 70
export const HAVEN_FOLD_SECONDS = 2.4
export interface HavenPose { pos: Vector2; angle: number; deployment: number }
export interface HavenPanel { vertices: Vector2[]; hinge: Vector2; anchor: Vector2 }
const mix = (a: number,b: number,t: number) => a+(b-a)*t
const smooth = (n: number) => { const t=Math.max(0,Math.min(1,n)); return t*t*(3-2*t) }
const angleDelta = (a: number,b: number) => Math.atan2(Math.sin(b-a),Math.cos(b-a))
export const posePoint = (p: Vector2, pose: HavenPose): Vector2 => ({ x:pose.pos.x+p.x*Math.cos(pose.angle)-p.y*Math.sin(pose.angle),y:pose.pos.y+p.x*Math.sin(pose.angle)+p.y*Math.cos(pose.angle) })

/** Six rigid armor leaves: their lengths and widths never change. Each pair
 * swings on a service arm, then nests beside the fixed-width transport cradle. */
export function havenPanels(pose: HavenPose): HavenPanel[] {
  const fold=1-pose.deployment
  return Array.from({length:6},(_,i)=>{
    const a={x:Math.cos(i*Math.PI/3)*HAVEN_RADIUS,y:Math.sin(i*Math.PI/3)*HAVEN_RADIUS}
    const b={x:Math.cos((i+1)*Math.PI/3)*HAVEN_RADIUS,y:Math.sin((i+1)*Math.PI/3)*HAVEN_RADIUS}
    const start=i%2 ? 44/HAVEN_RADIUS : 0, end=i%2 ? 1 : 1-44/HAVEN_RADIUS
    const p={x:mix(a.x,b.x,start),y:mix(a.y,b.y,start)},q={x:mix(a.x,b.x,end),y:mix(a.y,b.y,end)}
    const vertices=[p,q,{x:q.x*.65,y:q.y*.65},{x:p.x*.65,y:p.y*.65}]
    const center=vertices.reduce((sum,v)=>({x:sum.x+v.x/4,y:sum.y+v.y/4}),{x:0,y:0})
    const pair=i%3, side=i<3 ? -1 : 1
    const t=smooth((fold-pair*.075)/.85)
    const tangent=Math.atan2(q.y-p.y,q.x-p.x), stowed=Math.cos(tangent)<0 ? Math.PI : 0
    const rotation=angleDelta(tangent,stowed)*t
    const destination={x:(pair-1)*11,y:side*(23+pair*7)}
    const moved={x:mix(center.x,destination.x,t)+side*Math.sin(t*Math.PI)*12,y:mix(center.y,destination.y,t)}
    const transform=(v:Vector2)=>posePoint({x:moved.x+(v.x-center.x)*Math.cos(rotation)-(v.y-center.y)*Math.sin(rotation),y:moved.y+(v.x-center.x)*Math.sin(rotation)+(v.y-center.y)*Math.cos(rotation)},pose)
    return { vertices:vertices.map(transform),hinge:transform({x:(p.x+q.x)*.325,y:(p.y+q.y)*.325}),anchor:posePoint({x:Math.cos((i+.5)*Math.PI/3)*23,y:Math.sin((i+.5)*Math.PI/3)*23},pose) }
  })
}
export function havenColliders(pose: HavenPose): Vector2[][] {
  const panels=havenPanels(pose).map(p=>p.vertices)
  // The passenger sits inside this cradle; other bodies collide with its shell.
  // The fixed core opens before the docking ring finishes deploying.
  if (pose.deployment < .3) panels.push([[-33,-18],[25,-18],[34,-9],[34,9],[25,18],[-33,18]].map(([x,y])=>posePoint({x,y},pose)))
  return panels
}
export interface HavenContact { hit: boolean; speed: number; point: Vector2 }
/** Contact impulses use the velocity of the struck leaf, including its hinge
 * motion. This also handles a stationary tender opening into loose objects. */
export function collideHaven(body: TetherBody, previous: HavenPose, current: HavenPose, dt: number, restitution=.35): HavenContact {
  const result: HavenContact={hit:false,speed:0,point:{...body.pos}}
  if (body.socketId || Math.hypot(body.pos.x-current.pos.x,body.pos.y-current.pos.y)>HAVEN_RADIUS+body.radius+35) return result
  const shapes=havenColliders(current), oldShapes=havenColliders(previous)
  for (let pass=0;pass<3;pass++) {
    let adjusted=false
    for (let k=0;k<shapes.length;k++) {
      const shape=shapes[k], old=oldShapes[k] ?? shape
      let distance=Infinity,edge=0,along=0,nearest={...shape[0]}
      for (let i=0;i<shape.length;i++) {
        const a=shape[i],b=shape[(i+1)%shape.length],dx=b.x-a.x,dy=b.y-a.y
        const t=Math.max(0,Math.min(1,((body.pos.x-a.x)*dx+(body.pos.y-a.y)*dy)/(dx*dx+dy*dy)))
        const p={x:a.x+dx*t,y:a.y+dy*t},d=Math.hypot(p.x-body.pos.x,p.y-body.pos.y)
        if (d<distance) {distance=d;edge=i;along=t;nearest=p}
      }
      const inside=pointInPolygon(body.pos,shape)
      if (!inside && distance>=body.radius) continue
      const sign=inside ? -1 : 1
      let nx=(body.pos.x-nearest.x)*sign,ny=(body.pos.y-nearest.y)*sign,length=Math.hypot(nx,ny)
      if (length<.00001) {
        const a=shape[edge],b=shape[(edge+1)%shape.length];nx=a.y-b.y;ny=b.x-a.x;length=Math.hypot(nx,ny)
        if (pointInPolygon({x:nearest.x+nx/length*.01,y:nearest.y+ny/length*.01},shape)) {nx=-nx;ny=-ny}
      }
      nx/=length;ny/=length
      const correction=inside ? body.radius+distance+.01 : body.radius-distance+.01
      body.pos.x+=nx*correction;body.pos.y+=ny*correction
      const oa=old[edge],ob=old[(edge+1)%old.length]
      const surface={x:(nearest.x-mix(oa.x,ob.x,along))/Math.max(dt,.0001),y:(nearest.y-mix(oa.y,ob.y,along))/Math.max(dt,.0001)}
      const speed=Math.max(0,-((body.vel.x-surface.x)*nx+(body.vel.y-surface.y)*ny))
      const impulse=Math.min(520,speed*(1+restitution))
      body.vel.x+=nx*impulse;body.vel.y+=ny*impulse
      result.hit=true;result.speed=Math.max(result.speed,speed);result.point=nearest;adjusted=true
    }
    if (!adjusted) break
  }
  return result
}
