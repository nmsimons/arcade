import { havenPanels, posePoint } from './havenGeometry.ts'
import type { HavenPose } from './havenGeometry'
import { isInsideCavern } from './worldGeometry.ts'
import type { CavernMap } from './worldGeometry'
import type { TetherBody, Vector2 } from './types'

export const RECOVERY_REACH = .4
export const RECOVERY_GRIP = .6
export const RECOVERY_HAUL = 1.65
export const RECOVERY_SEAL = 2.1
export const RECOVERY_END = 2.65
export interface HavenRecovery {
  id: string
  bay: number
  time: number
  path: Vector2[]
  cargoTime: number
  secured: boolean
}
export type RecoveryCue = 'reach' | 'grip' | 'seal'
export const recoveryEase = (n: number) => { const t=Math.max(0,Math.min(1,n)); return t*t*(3-2*t) }
export const recoveryBay = (pose: HavenPose,bay: number) => posePoint({x:Math.cos(bay)*78,y:Math.sin(bay)*78},pose)
const distance = (a: Vector2,b: Vector2) => Math.hypot(a.x-b.x,a.y-b.y)

/** The receiving cradles sit in Haven's three existing gaps. A load may take
 * an outside arc to reach one, but never travels through a solid armor leaf. */
export function recoveryPath(pose: HavenPose,body: TetherBody,map: CavernMap,bay?: number): {bay:number;path:Vector2[]} | undefined {
  const clearance={...map,obstacles:[...map.obstacles,...havenPanels(pose).map(p=>p.vertices)]}
  const fits=(path:Vector2[])=>path.slice(1).every((b,i)=>{
    const a=path[i],steps=Math.max(1,Math.ceil(distance(a,b)/5))
    for(let n=0;n<=steps;n++) if(!isInsideCavern({x:a.x+(b.x-a.x)*n/steps,y:a.y+(b.y-a.y)*n/steps},body.radius-.1,clearance)) return false
    return true
  })
  const options: {bay:number;path:Vector2[];length:number}[]=[]
  for(const angle of bay===undefined ? [Math.PI/3,Math.PI,Math.PI*5/3] : [bay]) {
    const target=recoveryBay(pose,angle),direct=[{...body.pos},target]
    if(fits(direct)) { options.push({bay:angle,path:direct,length:distance(body.pos,target)}); continue }
    const heading=Math.atan2(body.pos.y-pose.pos.y,body.pos.x-pose.pos.x),end=angle+pose.angle
    const delta=Math.atan2(Math.sin(end-heading),Math.cos(end-heading))
    const path:Vector2[]=[{...body.pos}],steps=Math.max(1,Math.ceil(Math.abs(delta)/(Math.PI/12)))
    for(let i=0;i<=steps;i++) path.push({x:pose.pos.x+Math.cos(heading+delta*i/steps)*168,y:pose.pos.y+Math.sin(heading+delta*i/steps)*168})
    path.push(target)
    if(fits(path)) options.push({bay:angle,path,length:path.slice(1).reduce((sum,p,i)=>sum+distance(p,path[i]),0)})
  }
  return options.sort((a,b)=>a.length-b.length)[0]
}

export function recoveryPosition(recovery: HavenRecovery): Vector2 {
  const progress=recoveryEase((recovery.time-RECOVERY_GRIP)/(RECOVERY_HAUL-RECOVERY_GRIP))
  const lengths=recovery.path.slice(1).map((p,i)=>distance(p,recovery.path[i]))
  let travel=lengths.reduce((sum,n)=>sum+n,0)*progress
  for(let i=0;i<lengths.length;i++) {
    if(travel<=lengths[i]||i===lengths.length-1) {
      const a=recovery.path[i],b=recovery.path[i+1],t=lengths[i] ? Math.min(1,travel/lengths[i]) : 1
      return {x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t}
    }
    travel-=lengths[i]
  }
  return {...recovery.path[0]}
}
