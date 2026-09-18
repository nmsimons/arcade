import type { StationBot } from './stationBots'
import type { Ship, TetherBody, Vector2 } from './types'
import type { CavernMap } from './worldGeometry'
import { isInsideCavern, raycastCavern } from './worldGeometry.ts'
import { rayCircleHitDistance } from './phaserGeometry.ts'

export const MAINTENANCE_SPEED = 185
export const MAINTENANCE_HOOK_RANGE = 245
const CABLE_BREAK_DISTANCE = 340
const CABLE_REST_LENGTH = 92
const HOOK_SPEED = 470
type Mode = 'ship' | 'obstruct' | 'salvage'
export interface MaintenanceRig {
  mode: Mode
  cycle: number
  age: number
  holding: number
  cableLength: number
  focus?: TetherBody
  windup?: number
  hook?: { pos: Vector2; vel: Vector2; life: number }
  drop?: Vector2
}
interface Context {
  dt: number; ship: Ship; map: CavernMap; bodies: readonly TetherBody[]
  home: Vector2; patrol: Vector2; towed?: TetherBody; shipSafe?: boolean
}
const distance = (a: Vector2,b: Vector2) => Math.hypot(a.x-b.x,a.y-b.y)
const direction = (a: Vector2,b: Vector2) => {
  const d=Math.max(.001,distance(a,b));return {x:(b.x-a.x)/d,y:(b.y-a.y)/d}
}
const visible = (a: Vector2,b: Vector2,map: CavernMap) => raycastCavern(a,{x:b.x-a.x,y:b.y-a.y},distance(a,b),map)>=distance(a,b)-.1
const loose = (body: TetherBody) => !body.botId && !body.terminalId && !body.socketId && !body.anchored && !body.retrieving && body.cargoId!=='core'
const asteroid = (body: TetherBody) => loose(body) && !!body.kind && !body.sourceId && !body.cargoId
const heading = (ship: Ship) => Math.hypot(ship.vel.x,ship.vel.y)>35 ? direction({x:0,y:0},ship.vel) : {x:Math.cos(ship.angle),y:Math.sin(ship.angle)}

/** A damped, tension-only cable. Motors pull; attached bodies never snap to a point. */
export function pullBotCable(bot: StationBot, target: TetherBody, dt: number) {
  const d=distance(bot.pos,target.pos),length=bot.maintenance?.cableLength ?? CABLE_REST_LENGTH
  if (d<=length || target.anchored || target.socketId || target.retrieving) return
  const n=direction(bot.pos,target.pos)
  const relative=(target.vel.x-bot.vel.x)*n.x+(target.vel.y-bot.vel.y)*n.y
  const impulse=Math.max(0,Math.min(480,(d-length)*10+relative*9))*dt
  const mass=target.mass ?? ('angle' in target ? 1 : Math.max(.5,(target.radius/18)**2))
  target.vel.x-=n.x*impulse/mass;target.vel.y-=n.y*impulse/mass
  bot.vel.x+=n.x*impulse/(bot.mass ?? 1.8);bot.vel.y+=n.y*impulse/(bot.mass ?? 1.8)
}

function release(bot: StationBot, cooldown=1.1) {
  bot.target=undefined;bot.timer=cooldown
  const rig=bot.maintenance!
  rig.focus=undefined;rig.hook=undefined;rig.windup=undefined;rig.drop=undefined
  rig.age=0;rig.holding=0;rig.cycle++;rig.mode='salvage'
}

function lanePoint(ship: Ship,map: CavernMap) {
  const forward=heading(ship)
  for (const reach of [170,120,85]) {
    const point={x:ship.pos.x+forward.x*reach,y:ship.pos.y+forward.y*reach}
    if (isInsideCavern(point,45,map)&&visible(ship.pos,point,map)) return point
  }
}

function shipTowPoint(bot: StationBot,ship: Ship,map: CavernMap) {
  const forward=heading(ship),side=bot.maintenance!.cycle%2 ? -1 : 1
  for (const reach of [230,165,110]) for (const sign of [side,-side]) {
    const point={x:ship.pos.x-forward.y*reach*sign-forward.x*50,y:ship.pos.y+forward.x*reach*sign-forward.y*50}
    if (isInsideCavern(point,bot.radius+8,map)&&visible(bot.pos,point,map)&&visible(ship.pos,point,map)) return point
  }
  const away=direction(ship.pos,bot.pos)
  for (const reach of [200,140]) {
    const point={x:ship.pos.x+away.x*reach,y:ship.pos.y+away.y*reach}
    if (isInsideCavern(point,bot.radius+8,map)&&visible(bot.pos,point,map)) return point
  }
  return {...bot.pos}
}

/** Alternate ship recovery and debris placement whenever a pilot enters the work zone. */
export function stepMaintenanceBot(bot: StationBot, args: Context): { destination?: Vector2; aim?: number; cues: ('lock'|'hook'|'grab')[] } {
  const {dt,ship,map,bodies,home,patrol}=args
  const rig=bot.maintenance ??= {mode:'salvage',cycle:0,age:0,holding:0,cableLength:CABLE_REST_LENGTH}
  const cues: ('lock'|'hook'|'grab')[]=[]
  const apron={x:home.x+100,y:home.y}
  const shipVisible=!args.shipSafe && distance(ship.pos,home)<950 && distance(ship.pos,bot.pos)<650 && visible(bot.pos,ship.pos,map)
  const valid=(body: TetherBody) => body===ship ? !args.shipSafe : bodies.includes(body)&&loose(body)
  if ((rig.mode!=='salvage' && args.shipSafe) || (bot.target && (!valid(bot.target)||distance(bot.pos,bot.target.pos)>CABLE_BREAK_DISTANCE||!visible(bot.pos,bot.target.pos,map)))) release(bot)
  if (rig.focus && (!valid(rig.focus)||distance(bot.pos,rig.focus.pos)>700||!visible(bot.pos,rig.focus.pos,map))) release(bot)

  if (bot.target) {
    rig.holding+=dt
    rig.cableLength=Math.max(CABLE_REST_LENGTH,rig.cableLength-120*dt)
    pullBotCable(bot,bot.target,dt)
    let destination=rig.drop ?? apron
    if (rig.mode==='obstruct') {
      const lane=lanePoint(ship,map)
      if (!lane || !shipVisible) {release(bot);return {cues}}
      const previous=rig.drop ?? lane,blend=1-Math.exp(-2*dt)
      rig.drop={x:previous.x+(lane.x-previous.x)*blend,y:previous.y+(lane.y-previous.y)*blend}
      const haul=direction(bot.target.pos,rig.drop)
      destination={x:rig.drop.x+haul.x*110,y:rig.drop.y+haul.y*110}
      if (!isInsideCavern(destination,bot.radius+5,map)||!visible(bot.pos,destination,map)) destination=rig.drop
    }
    const delivered=rig.mode!=='ship' && distance(bot.target.pos,rig.drop ?? apron)<65
    if (delivered || rig.holding>(rig.mode==='ship' ? 3 : 5)) release(bot)
    return {destination,cues}
  }

  if (rig.hook) {
    const hook=rig.hook,speed=Math.hypot(hook.vel.x,hook.vel.y),travel=speed*Math.min(dt,hook.life),n={x:hook.vel.x/speed,y:hook.vel.y/speed}
    let length=raycastCavern(hook.pos,n,travel,map),hit:TetherBody|undefined
    for (const body of [ship,...bodies]) {
      if (body===bot) continue
      const d=rayCircleHitDistance(hook.pos,n,length,body.pos,body.radius+3)
      if (d!==null && d<length) {length=d;hit=body}
    }
    hook.pos.x+=n.x*length;hook.pos.y+=n.y*length;hook.life-=dt
    if (hit && valid(hit)) {
      bot.target=hit;rig.focus=undefined;rig.hook=undefined;rig.holding=0
      rig.cableLength=Math.max(CABLE_REST_LENGTH,distance(bot.pos,hit.pos))
      rig.mode=hit===ship ? 'ship' : asteroid(hit)&&shipVisible ? 'obstruct' : 'salvage'
      rig.drop=rig.mode==='ship' ? shipTowPoint(bot,ship,map) : rig.mode==='obstruct' ? lanePoint(ship,map) : apron
      cues.push('grab')
    } else if (hit || length<travel || hook.life<=0 || distance(bot.pos,hook.pos)>CABLE_BREAK_DISTANCE) release(bot)
    return {aim:Math.atan2(n.y,n.x),cues}
  }

  if (bot.timer>0) {bot.timer=Math.max(0,bot.timer-dt);return {cues}}
  if (!rig.focus) {
    rig.age=0
    const lane=shipVisible ? lanePoint(ship,map) : undefined
    const rocks=lane ? bodies.filter(body=>asteroid(body)&&body.radius<=44&&distance(body.pos,bot.pos)<420&&distance(body.pos,lane)>70&&visible(bot.pos,body.pos,map)&&visible(body.pos,lane,map)) : []
    rocks.sort((a,b)=>distance(a.pos,bot.pos)+distance(a.pos,lane!)*.6-(a.kind==='blue' ? 40 : 0)-distance(b.pos,bot.pos)-distance(b.pos,lane!)*.6+(b.kind==='blue' ? 40 : 0))
    const stolen=args.towed && loose(args.towed) && bodies.includes(args.towed) && distance(args.towed.pos,bot.pos)<400 && visible(bot.pos,args.towed.pos,map) ? args.towed : undefined
    if (shipVisible) {
      rig.focus=rig.cycle%3===1 && rocks.length ? rocks[0] : rig.cycle%3===2 && stolen ? stolen : ship
      rig.mode=rig.focus===ship ? 'ship' : asteroid(rig.focus) ? 'obstruct' : 'salvage'
    } else {
      const cargo=bodies.filter(body=>loose(body)&&distance(body.pos,home)<550&&distance(body.pos,apron)>90&&distance(body.pos,bot.pos)<400&&visible(bot.pos,body.pos,map))
      cargo.sort((a,b)=>distance(a.pos,bot.pos)-distance(b.pos,bot.pos))
      rig.focus=cargo[0];rig.mode='salvage'
    }
  }
  if (!rig.focus) return {destination:bot.returning ? apron : patrol,cues}
  rig.age+=dt
  if (rig.age>7) {release(bot,.4);return {cues}}
  const target=rig.focus
  const aimPoint={x:target.pos.x+target.vel.x*.18,y:target.pos.y+target.vel.y*.18}
  const aim=Math.atan2(aimPoint.y-bot.pos.y,aimPoint.x-bot.pos.x)
  if (distance(bot.pos,target.pos)>MAINTENANCE_HOOK_RANGE) {rig.windup=undefined;return {destination:aimPoint,cues}}
  if (rig.windup===undefined) {rig.windup=.45;cues.push('lock')}
  rig.windup-=dt
  if (rig.windup<=0 && Math.abs(Math.atan2(Math.sin(aim-bot.angle),Math.cos(aim-bot.angle)))<.2) {
    const n={x:Math.cos(aim),y:Math.sin(aim)}
    rig.hook={pos:{x:bot.pos.x+n.x*27,y:bot.pos.y+n.y*27},vel:{x:n.x*HOOK_SPEED,y:n.y*HOOK_SPEED},life:.72}
    rig.windup=undefined;cues.push('hook')
  }
  return {aim,cues}
}
