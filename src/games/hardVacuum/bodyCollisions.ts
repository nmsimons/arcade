import { profileStart, profileEnd } from './profiling.ts'
import type { TetherBody, Vector2 } from './types'
import type { CavernMap } from './worldGeometry'
import { resolveCircleInCavern } from './worldGeometry.ts'
import { collideHaven } from './havenGeometry.ts'
import type { HavenPose } from './havenGeometry'
import { bodyMass, isImmovable, isAsteroid } from './bodyDefinitions.ts'

const inverseMass = (body: TetherBody) => isImmovable(body) ? 0 : 1 / bodyMass(body)

/** All free bodies exchange momentum. A connected cell is a solid anchored
 * body: it deflects incoming objects without being pulled out of its receiver. */
export function collideBodies(a: TetherBody, b: TetherBody, restitution = .55) {
  if (a === b) return { hit:false, speed:0 }
  const dx=b.pos.x-a.pos.x, dy=b.pos.y-a.pos.y, distance=Math.hypot(dx,dy), overlap=a.radius+b.radius-distance
  if (overlap <= 0) return { hit:false, speed:0 }
  const ia=inverseMass(a), ib=inverseMass(b), total=ia+ib
  if (!total) return { hit:false, speed:0 }
  const vx=(ia || a.retrieving ? a.vel.x : 0)-(ib || b.retrieving ? b.vel.x : 0), vy=(ia || a.retrieving ? a.vel.y : 0)-(ib || b.retrieving ? b.vel.y : 0), relativeSpeed=Math.hypot(vx,vy)
  // Coincident centers still have a stable normal and separate immediately.
  const nx=distance>.00001 ? dx/distance : relativeSpeed>.00001 ? vx/relativeSpeed : 1
  const ny=distance>.00001 ? dy/distance : relativeSpeed>.00001 ? vy/relativeSpeed : 0
  a.pos.x-=nx*overlap*ia/total; a.pos.y-=ny*overlap*ia/total
  b.pos.x+=nx*overlap*ib/total; b.pos.y+=ny*overlap*ib/total
  const speed=Math.max(0,vx*nx+vy*ny), impulse=(1+restitution)*speed/total
  a.vel.x-=nx*impulse*ia; a.vel.y-=ny*impulse*ia
  b.vel.x+=nx*impulse*ib; b.vel.y+=ny*impulse*ib
  return { hit:true, speed }
}

export interface WorldContact {
  body: TetherBody
  other?: TetherBody
  surface: 'body' | 'wall' | 'haven'
  speed: number
  point?: Vector2
}
export interface HavenMotion { previous: HavenPose; current: HavenPose; dt: number }

/** Resolve pairs and solid surfaces together so a pile-up or a moving Haven
 * cannot leave cargo inside its neighbour or push it through a tunnel wall. */
export function resolveWorldContacts(bodies: readonly TetherBody[], map: CavernMap, onContact: (contact: WorldContact) => void, haven?: HavenMotion) {
  const profileTime = profileStart()
  try {
    const active=[...new Set(bodies)]
    for (let pass=0;pass<4;pass++) {
      let touched=false
      for (let i=0;i<active.length;i++) for (let j=i+1;j<active.length;j++) {
        const a=active[i], b=active[j]
        if (Math.abs(a.pos.x-b.pos.x)>=a.radius+b.radius || Math.abs(a.pos.y-b.pos.y)>=a.radius+b.radius) continue
        const orePair=isAsteroid(a) && isAsteroid(b)
        const contact=collideBodies(a,b,orePair ? .9 : .55)
        if (!contact.hit) continue
        touched=true;onContact({body:a,other:b,surface:'body',speed:contact.speed})
      }
      for (const body of active) {
        if (isImmovable(body)) continue
        if (haven) {
          const contact=collideHaven(body,haven.previous,haven.current,haven.dt)
          if (contact.hit) { touched=true;onContact({body,surface:'haven',speed:contact.speed,point:contact.point}) }
        }
        const contact=resolveCircleInCavern(body.pos,body.vel,body.radius,isAsteroid(body) ? .82 : .5,map)
        if (contact.collided) { touched=true;onContact({body,surface:'wall',speed:contact.maxImpactSpeed}) }
      }
      if (!touched) break
    }
  } finally { profileEnd('collisions', profileTime) }
}
