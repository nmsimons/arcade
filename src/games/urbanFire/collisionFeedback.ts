import type { CollisionMaterial, Vector2 } from './types'

export type JeepCollisionContact = {body:object;material:CollisionMaterial;speed:number}
type ContactMemory = {seen:number;speed:number;played:number}
export const createCollisionFeedback=()=>({time:0,lastPlayed:-Infinity,contacts:new Map<object,ContactMemory>()})
export type CollisionFeedback=ReturnType<typeof createCollisionFeedback>

/** The outward contact normal rejects tangential scraping and separating
 * bodies. Relative velocity also catches a vehicle ramming a stationary jeep. */
export function closingImpactSpeed(velocity:Vector2,normal:Vector2,otherVelocity:Vector2={x:0,y:0}){
  const length=Math.hypot(normal.x,normal.y)
  return length>1e-8?Math.max(0,-((velocity.x-otherVelocity.x)*normal.x+(velocity.y-otherVelocity.y)*normal.y)/length):0
}

/** Merge substep/corner contacts, and sound only fresh impacts or a genuinely
 * new jolt. Staying on the throttle against cover must not become a drum roll. */
export function stepCollisionFeedback(state:CollisionFeedback,hits:readonly JeepCollisionContact[],dt:number){
  if(dt<=0)return null
  state.time+=dt
  const strongest=new Map<object,JeepCollisionContact>()
  for(const hit of hits)if(!strongest.has(hit.body)||hit.speed>strongest.get(hit.body)!.speed)strongest.set(hit.body,hit)
  let chosen:JeepCollisionContact|null=null
  for(const hit of strongest.values()){
    const prior=state.contacts.get(hit.body)
    const fresh=!prior||state.time-prior.seen>.16
    const newJolt=prior&&hit.speed>prior.speed+40&&state.time-prior.played>.4
    if(hit.speed>=14&&(fresh||newJolt)&&(!chosen||hit.speed>chosen.speed))chosen=hit
    state.contacts.set(hit.body,{seen:state.time,speed:hit.speed,played:prior?.played??-Infinity})
  }
  for(const [body,memory] of state.contacts)if(state.time-memory.seen>2)state.contacts.delete(body)
  if(!chosen||state.time-state.lastPlayed<.09)return null
  state.lastPlayed=state.time
  state.contacts.get(chosen.body)!.played=state.time
  return {material:chosen.material,strength:Math.min(1,Math.pow((chosen.speed-12)/100,.7))}
}
