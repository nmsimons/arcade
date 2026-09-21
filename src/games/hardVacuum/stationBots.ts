import type { Expedition } from './expedition'
import type { Debris, Ship, TetherBody, Vector2 } from './types'
import type { CavernMap } from './worldGeometry'
import type { BotId, CircuitId } from './stationIds'
import { isInsideCavern, raycastCavern, resolveCircleInCavern } from './worldGeometry.ts'
import { rayCircleHitDistance } from './phaserGeometry.ts'
import { MAINTENANCE_SPEED, stepMaintenanceBot } from './maintenanceBots.ts'
import type { MaintenanceRig } from './maintenanceBots'
export { pullBotCable } from './maintenanceBots.ts'

export const BOT_STATIONS = [
  { id: 'freight-tug', kind: 'tug', power: 'freight-power', home: { x: 6900, y: 1360 }, patrol: { x: 7200, y: 1160 } },
  { id: 'works-watch', kind: 'security', power: 'works-power', home: { x: 5080, y: 1030 }, patrol: { x: 4740, y: 1310 } },
  { id: 'foundry-tug', kind: 'tug', power: 'foundry', home: { x: 360, y: 400 }, patrol: { x: 650, y: 370 } },
  { id: 'reactor-watch', kind: 'security', power: 'relay', home: { x: 2450, y: 875 }, patrol: { x: 2600, y: 900 } },
  { id: 'heart-watch', kind: 'security', power: 'heart-power', home: { x: 4300, y: 3440 }, patrol: { x: 3860, y: 3610 } },
  { id: 'field-watch', kind: 'security', power: 'heart-power', home: { x: 5190, y: 3530 }, patrol: { x: 5340, y: 3340 } },
  { id: 'coil-tug', kind: 'tug', power: 'coil-power', home: { x: 4050, y: 4570 }, patrol: { x: 4360, y: 4430 } },
] as const satisfies readonly { id: BotId; kind: 'tug' | 'security'; power: CircuitId; home: Vector2; patrol: Vector2 }[]
export type StationBotKind = typeof BOT_STATIONS[number]['kind']
// Four blaster hits, or 50 laser contacts: 5 seconds on target at maximum focus.
export const BOT_MAX_HEALTH = 20
export const BOT_BLASTER_DAMAGE = 5
export const BOT_LASER_DAMAGE = BOT_MAX_HEALTH / 50
export type BotDamageKind = 'laser' | 'impact'
const SECURITY_MIN_RANGE = 160
// Visible breaches and emitted sparks share these local hull locations.
export const BOT_DAMAGE_SITES = [
  { point: [-10, 0, -4.5], angle: 0 },
  { point: [-12, 7, -4.5], angle: -.4 },
  { point: [-5, -7, -4.5], angle: 1.4 },
  { point: [0, 5, -4.5], angle: -.9 },
] as const

export function botDamage(health: number) {
  const amount = Math.max(0, Math.min(1, 1 - health / BOT_MAX_HEALTH))
  return { amount, stage: Math.ceil(amount * BOT_DAMAGE_SITES.length) }
}
type BotStation = typeof BOT_STATIONS[number]
type GarageState = Pick<Expedition, 'power' | 'botDoors'>
export const GARAGE_OPEN_SECONDS = 1.8
export const botGarageProgress = (state: GarageState, spec: BotStation) => state.botDoors?.[spec.id] ?? (state.power[spec.power] ? 1 : 0)
const garageRect = (spec: BotStation, x: number, y: number, w: number, h: number): Vector2[] =>
  [[x,y],[x+w,y],[x+w,y+h],[x,y+h]].map(([dx,dy])=>({x:spec.home.x+dx,y:spec.home.y+dy}))
export const botGarageWalls = (spec: BotStation) => [garageRect(spec,-35,-36,10,72),garageRect(spec,-25,-36,65,10),garageRect(spec,-25,26,65,10)]
export function botGarageDoors(spec: BotStation, progress: number) {
  const size = 26 * (1 - Math.max(0, Math.min(1, progress)))
  return size > .001 ? [garageRect(spec,30,-26,10,size),garageRect(spec,30,26-size,10,size)] : []
}
export const botGarageObstacles = (state: GarageState) => BOT_STATIONS.flatMap(spec=>[...botGarageWalls(spec),...botGarageDoors(spec,botGarageProgress(state,spec))])
export function stepBotGarages(state: GarageState, dt: number) {
  for (const id of Object.keys(state.botDoors ?? {})) {
    state.botDoors![id] = Math.min(1, state.botDoors![id] + dt / GARAGE_OPEN_SECONDS)
    if (state.botDoors![id] >= 1) delete state.botDoors![id]
  }
}
export interface StationBot extends TetherBody {
  botId: string; botKind: StationBotKind; angle: number; health: number
  phase: 'offline' | 'boot' | 'deploy' | 'watch' | 'charge' | 'burst' | 'cooldown'
  timer: number; stun: number; flash: number; shotCount: number; aim: number; returning: boolean
  target?: TetherBody
  maintenance?: MaintenanceRig
  sparkDelay?: number
}
export interface SecurityShot { pos: Vector2; vel: Vector2; life: number; owner: string }
export interface BotRuntime { units: StationBot[]; shots: SecurityShot[] }
export const freshBots = (state: Pick<Expedition, 'disabledBots' | 'power' | 'botDoors'>): BotRuntime => ({
  units: BOT_STATIONS.filter(spec => !state.disabledBots.includes(spec.id)).map(spec => identifyBody<StationBot>({
    botId: spec.id, botKind: spec.kind, pos: { ...spec.home }, vel: { x: 0, y: 0 }, radius: spec.kind === 'tug' ? 21 : 19,
    mass: spec.kind === 'tug' ? 1.8 : 1.2, angle: 0, health: BOT_MAX_HEALTH,
    anchored: !state.power[spec.power] || botGarageProgress(state,spec)<1,
    phase: state.power[spec.power] ? botGarageProgress(state,spec)<1 ? 'boot' : 'deploy' : 'offline', timer: 2.2, stun: 0, flash: 0, shotCount: 0, aim: 0, returning: false,
  }, { type: 'bot', id: spec.id })), shots: [],
})
export const isStationBot = (body: TetherBody): body is StationBot => !!body.botId && 'health' in body && 'phase' in body && 'stun' in body
const distance = (a: Vector2, b: Vector2) => Math.hypot(a.x - b.x, a.y - b.y)
const sight = (a: Vector2, b: Vector2, map: CavernMap) => raycastCavern(a, { x: b.x - a.x, y: b.y - a.y }, distance(a, b), map) >= distance(a, b) - .1
const turn = (a: number, b: number) => Math.atan2(Math.sin(b - a), Math.cos(b - a))

/** Make room to fight; try a diagonal escape if the direct retreat is blocked. */
function securityRetreat(bot: StationBot, ship: Ship, map: CavernMap) {
  const away = distance(bot.pos, ship.pos) > .001 ? Math.atan2(bot.pos.y-ship.pos.y,bot.pos.x-ship.pos.x) : bot.angle+Math.PI
  for (const reach of [100,60,30]) for (const offset of [0,.65,-.65]) {
    const angle = away+offset
    const point = {x:bot.pos.x+Math.cos(angle)*reach,y:bot.pos.y+Math.sin(angle)*reach}
    if (isInsideCavern(point,bot.radius+4,map) && sight(bot.pos,point,map)) return point
  }
}

/** Defeats persist through docking and reloads until the pilot respawns. */
export function damageBot(state: Pick<Expedition, 'disabledBots'>, bot: StationBot, damage: number, kind: BotDamageKind = 'impact') {
  if (bot.health <= 0 || damage <= 0 || bot.phase === 'offline' || bot.phase === 'boot') return false
  // Fractional laser chips must reach zero on the intended hit, not leave a
  // floating-point sliver of armor that requires one extra contact.
  bot.health = Math.max(0, Math.round((bot.health - damage) * 1000) / 1000)
  bot.sparkDelay = 0 // A new hit immediately vents sparks; ongoing damage keeps sputtering.
  bot.flash = 1; bot.target = undefined; bot.maintenance = undefined
  // A cutting beam chips security armor, but cannot repeatedly cancel its
  // attack. Heavy impacts still stagger it; tugs retain their laser counter.
  if (kind !== 'laser' || bot.botKind === 'tug') {
    bot.stun = .65; bot.phase = 'cooldown'; bot.timer = 1.5
  }
  if (bot.health) return false
  if (!state.disabledBots.includes(bot.botId)) state.disabledBots.push(bot.botId)
  return true
}

/** Electrical fragments shed from the breached armor and inherit body motion. */
export function stepBotSparks(bot: StationBot, dt: number, random: () => number = Math.random): Debris[] {
  if (dt<=0 || bot.health<=0 || bot.health>=BOT_MAX_HEALTH || bot.phase==='offline' || bot.phase==='boot') return []
  bot.sparkDelay=(bot.sparkDelay ?? 0)-dt
  if (bot.sparkDelay>0) return []
  const { amount: damage, stage } = botDamage(bot.health)
  bot.sparkDelay=1.05-damage*.9+random()*.12
  return Array.from({length:2+Math.floor(damage*7)},(_,i)=>{
    const [x,y]=BOT_DAMAGE_SITES[Math.floor(random()*stage)].point
    const origin={x:bot.pos.x+x*Math.cos(bot.angle)-y*Math.sin(bot.angle),y:bot.pos.y+x*Math.sin(bot.angle)+y*Math.cos(bot.angle)}
    const angle=bot.angle+Math.atan2(y,x)+(random()-.5)*(2.2+damage*1.6)
    const speed=25+damage*60+random()*(20+damage*30)
    return {pos:{...origin},vel:{x:bot.vel.x+Math.cos(angle)*speed,y:bot.vel.y+Math.sin(angle)*speed},
      angle,rotSpeed:(random()-.5)*4,life:200+damage*180+random()*90,length:1.5+damage*3+random()*2,
      color:i===0 || (damage>=.5 && i%3===0) ? '255, 245, 210' : '255, 175, 78',spark:true}
  })
}

export function stepBots(runtime: BotRuntime, state: GarageState, args: {
  dt: number; ship: Ship; map: CavernMap; bodies: readonly TetherBody[]; towed?: TetherBody; shipSafe?: boolean
}) {
  const { dt, ship, map, bodies } = args
  const cues: { kind: 'wake' | 'lock' | 'shot' | 'grab' | 'hook'; pos: Vector2 }[] = []
  for (const bot of runtime.units) {
    if (bot.health <= 0 || distance(bot.pos, ship.pos) > 1450) continue
    const spec = BOT_STATIONS.find(s => s.id === bot.botId)!
    bot.flash = Math.max(0, bot.flash - dt * 4)
    bot.laserGlow = (bot.laserGlow ?? 0) * Math.exp(-5 * dt)
    bot.stun = Math.max(0, bot.stun - dt)
    if (!state.power[spec.power]) { bot.phase = 'offline'; bot.target = undefined; bot.maintenance = undefined; bot.anchored = true }
    else if (bot.phase === 'offline') { bot.phase = 'boot'; bot.timer = 2.2; cues.push({ kind: 'wake', pos: bot.pos }) }
    let destination: Vector2 | undefined
    let grappleAim: number | undefined
    if (bot.phase !== 'offline' && bot.stun <= 0) {
      if (bot.phase === 'boot') {
        bot.timer -= dt
        if (bot.timer <= 0 && botGarageProgress(state,spec)>=1) { bot.phase = 'deploy'; bot.anchored = false }
      } else if (bot.phase === 'deploy') {
        destination = { x: spec.home.x+100, y: spec.home.y }
        if (distance(bot.pos,destination)<28) bot.phase = 'watch'
      } else if (bot.botKind === 'tug') {
        const action=stepMaintenanceBot(bot,{...args,bodies:[...bodies,...runtime.units.filter(other=>other.health>0)],home:spec.home,patrol:spec.patrol})
        destination=action.destination;grappleAim=action.aim
        for (const kind of action.cues) cues.push({kind,pos:bot.pos})
        if (destination && distance(bot.pos,destination)<45) bot.returning=!bot.returning
      } else {
        const acquired = !args.shipSafe && distance(ship.pos, spec.home) < 700 && distance(ship.pos, bot.pos) < 490 && sight(bot.pos, ship.pos, map)
        if (bot.phase === 'watch' || bot.phase === 'cooldown') {
          bot.timer = Math.max(0, bot.timer - dt)
          destination = acquired ? (distance(bot.pos, ship.pos) > 240 ? ship.pos : undefined) : bot.returning ? { x:spec.home.x+100,y:spec.home.y } : spec.patrol
          if (destination && distance(bot.pos, destination) < 40) bot.returning = !bot.returning
          if (acquired && bot.timer <= 0) { bot.phase = 'charge'; bot.timer = 1.25; cues.push({ kind: 'lock', pos: bot.pos }) }
        }
        if (acquired && distance(bot.pos,ship.pos)<SECURITY_MIN_RANGE) destination=securityRetreat(bot,ship,map)
        if (bot.phase === 'charge') {
          if (!acquired) { bot.phase = 'watch'; bot.timer = .4 }
          else {
            if (bot.timer > .4) bot.aim = Math.atan2(ship.pos.y - bot.pos.y, ship.pos.x - bot.pos.x)
            bot.timer -= dt
            if (bot.timer <= 0) { bot.phase = 'burst'; bot.shotCount = 0; bot.timer = 0 }
          }
        }
        if (bot.phase === 'burst') {
          bot.timer -= dt
          if (bot.timer <= 0) {
            const angle = bot.aim + (bot.shotCount - 1) * .07, x = Math.cos(angle), y = Math.sin(angle)
            runtime.shots.push({ pos: { x: bot.pos.x + x * 24, y: bot.pos.y + y * 24 }, vel: { x: x * 285, y: y * 285 }, life: 2, owner: bot.botId })
            bot.shotCount++; bot.timer += .18; bot.vel.x -= x * 10; bot.vel.y -= y * 10
            cues.push({ kind: 'shot', pos: bot.pos })
            if (bot.shotCount === 3) { bot.phase = 'cooldown'; bot.timer = 2.6 }
          }
        }
      }
    }
    if (bot.anchored) { bot.pos={...spec.home}; bot.vel={x:0,y:0}; continue }
    if (destination && sight(bot.pos, destination, map)) {
      const dx = destination.x - bot.pos.x, dy = destination.y - bot.pos.y, d = Math.max(1, Math.hypot(dx, dy))
      const speed = Math.min(bot.botKind === 'tug' ? MAINTENANCE_SPEED : 88, d * (bot.botKind === 'tug' ? 1.8 : .7))
      const blend = 1 - Math.exp(-(bot.botKind === 'tug' ? 3 : 1.8) * dt)
      bot.vel.x += (dx / d * speed - bot.vel.x) * blend
      bot.vel.y += (dy / d * speed - bot.vel.y) * blend
    } else {
      const damping = Math.exp(-2 * dt); bot.vel.x *= damping; bot.vel.y *= damping
    }
    const heading = grappleAim ?? (bot.phase === 'charge' || bot.phase === 'burst' ? bot.aim : Math.hypot(bot.vel.x, bot.vel.y) > 4 ? Math.atan2(bot.vel.y, bot.vel.x) : bot.angle)
    const rotation=(bot.botKind==='tug' ? 4.5 : 2)*dt
    bot.angle += Math.max(-rotation, Math.min(rotation, turn(bot.angle, heading)))
    bot.pos.x += bot.vel.x * dt; bot.pos.y += bot.vel.y * dt
    resolveCircleInCavern(bot.pos, bot.vel, bot.radius, .5, map)
  }
  return cues
}

/** Security fire strikes the first physical body or wall; cover is real. */
export function stepSecurityShots(runtime: BotRuntime, dt: number, map: CavernMap, bodies: readonly TetherBody[]) {
  const impacts: { pos: Vector2; target?: TetherBody; direction: Vector2 }[] = []
  runtime.shots = runtime.shots.filter(shot => {
    const speed = Math.hypot(shot.vel.x, shot.vel.y), travel = speed * Math.min(dt, shot.life)
    const direction = { x: shot.vel.x / speed, y: shot.vel.y / speed }
    let length = raycastCavern(shot.pos, direction, travel, map), target: TetherBody | undefined
    for (const body of bodies) {
      if (body.botId === shot.owner) continue
      const hit = rayCircleHitDistance(shot.pos, direction, length, body.pos, body.radius + 2)
      if (hit !== null && hit < length) { length = hit; target = body }
    }
    shot.pos.x += direction.x * length; shot.pos.y += direction.y * length; shot.life -= dt
    if (target || length < travel) { impacts.push({ pos: { ...shot.pos }, target, direction }); return false }
    return shot.life > 0
  })
  return impacts
}
import { identifyBody } from './bodyDefinitions.ts'
