import { IGNITION_CRADLE, IGNITION_CRADLE_ANGLE } from './campaignWorld.ts'
import type { Expedition, ExpeditionRuntime } from './expedition'
import type { Vector2 } from './types'

export const IGNITION_SEAT_SECONDS = .9
export const IGNITION_START_SECONDS = 3
export interface CoreLatch { time: number; from: Vector2; cargoTime: number }
export const cradlePoint=(x:number,y:number):Vector2=>({
  x:IGNITION_CRADLE.x+x*Math.cos(IGNITION_CRADLE_ANGLE)-y*Math.sin(IGNITION_CRADLE_ANGLE),
  y:IGNITION_CRADLE.y+x*Math.sin(IGNITION_CRADLE_ANGLE)+y*Math.cos(IGNITION_CRADLE_ANGLE),
})
const rect=(x:number,y:number,w:number,h:number)=>[
  cradlePoint(x,y),cradlePoint(x+w,y),cradlePoint(x+w,y+h),cradlePoint(x,y+h),
]
// Open at both ends: fly through first, then tow the core between the contacts.
export const IGNITION_HOUSINGS = [rect(-78,-44,20,88),rect(58,-44,20,88)]
export const INSTALLED_CORE_HOUSING = rect(-27,-27,54,54)

/** The core must enter the cradle before its clamps take custody. */
export function stepIgnitionCradle(s: Expedition,rt: ExpeditionRuntime,dt: number): boolean {
  if (s.core || s.complete || !s.gates.includes('ignition-ready')) return false
  const body=rt.objects.core
  if (!body) return false
  if (!rt.coreLatch) {
    const dx=body.pos.x-IGNITION_CRADLE.x,dy=body.pos.y-IGNITION_CRADLE.y
    const across=dx*Math.cos(IGNITION_CRADLE_ANGLE)+dy*Math.sin(IGNITION_CRADLE_ANGLE)
    const along=-dx*Math.sin(IGNITION_CRADLE_ANGLE)+dy*Math.cos(IGNITION_CRADLE_ANGLE)
    if (!body.tethered || body.retrieving || Math.abs(across)+body.radius>58 || Math.abs(along)>28) return false
    rt.coreLatch={time:0,from:{...body.pos},cargoTime:rt.elapsed}
    body.retrieving=true
    ;(rt.recoveryCues ??= []).push('grip')
  }
  const latch=rt.coreLatch
  latch.time=Math.min(IGNITION_START_SECONDS,latch.time+dt)
  const t=Math.min(1,latch.time/IGNITION_SEAT_SECONDS),ease=t*t*(3-2*t)
  body.pos={x:latch.from.x+(IGNITION_CRADLE.x-latch.from.x)*ease,y:latch.from.y+(IGNITION_CRADLE.y-latch.from.y)*ease}
  body.vel={x:0,y:0}
  if (latch.time<IGNITION_START_SECONDS) return false
  s.core=true;s.complete=true
  delete rt.objects.core
  if (s.cargo) delete s.cargo.core
  ;(rt.recoveryCues ??= []).push('seal')
  return true
}
