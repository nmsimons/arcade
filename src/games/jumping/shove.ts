import type { Prop, RobotState, Run } from './challenge.ts'
import type { JumpInput, Player } from './model.ts'
import type { ContactWorld, PlayerCollider } from './playerContacts.ts'
import { playerContactBody } from './playerContacts.ts'
import { lineBlocked, nearestBoundary } from './geometry.ts'
import type { Vec } from './geometry.ts'
import { forceFieldPlatforms } from './forceField.ts'
import { pulseHit } from './gadgets.ts'
import { propHeight, propPushHands } from './propGeometry.ts'
import type { PushPalm } from './propGeometry.ts'
import { repulseProp } from './propPhysics.ts'
import { faceRobotToward, repulseRobot } from './robotPhysics.ts'
import { rightArmSupporting } from './armSupport.ts'
import { repulsePlayer, REPULSOR_BOT_IMPULSE } from './actorImpulse.ts'

export const SHOVE_REACH = 38
export const PLAYER_SHOVE_SPEED = 340
export const BOT_SHOVE_SPEED = 900
export const SHOVE_PROP_STRENGTH = .2
export const SHOVE_RECOVERY = .22
export const PLAYER_SHOVE_WINDUP = .18
export const BOT_SHOVE_WINDUP = PLAYER_SHOVE_WINDUP
const presses = new WeakMap<Run, { player: Player; held: boolean; consumed: boolean }>()
const EMPTY_WORLD: ContactWorld = { platforms: [], colliders: [] }
interface ShoveContact { palms: [PushPalm, PushPalm]; prop?: Prop; robot?: RobotState; player?: Player }

export const canShove = (actor: Player) => !actor.climbing && !actor.hang && !actor.mantle && !actor.releaseTurn
  && !rightArmSupporting({ ...actor, pushing: null, wallBrace: actor.grounded ? null : actor.wallBrace })
  && !(actor.stagger && actor.stagger > 0)

/** Arm's reach, matching height and a clear physical path; proximity alone cannot hit through cover. */
export function shoveReaches(run: Run, actor: Player, target: Player, direction: number, world: ContactWorld) {
  const a = playerContactBody(actor), b = playerContactBody(target)
  const ay = a.y - (actor.inverted ? -1 : 1) * a.height * .55
  const by = b.y - (target.inverted ? -1 : 1) * b.height * .55
  const gap = (b.x - a.x) * direction
  if (gap <= 0 || gap > SHOVE_REACH || Math.abs(by - ay) > 26) return false
  const solids = [...world.colliders.filter(c => c.id !== 'player' && c.robot?.actor !== actor && c.robot?.actor !== target).map(c => c.platform),
    ...forceFieldPlatforms(run.forceFields, 'objects')]
  return !lineBlocked([a.x, ay], [b.x, by], solids)
}

export function beginShove(actor: Player, windup: number) {
  actor.shove = { time: 0, windup, direction: actor.facing, struck: false }
  actor.dryTurn = null; actor.pushing = null; actor.ledgeReach = null
}

function shoveContact(run: Run, actor: Player, targets: readonly Player[], world: ContactWorld): ShoveContact | undefined {
  const body = playerContactBody(actor), direction = actor.shove!.direction, flip = actor.inverted ? -1 : 1
  const handHeight = Math.min(43, body.height * .7), from: Vec = [body.x, body.y - flip * handHeight]
  const colliders: PlayerCollider[] = [...world.colliders.filter(c => c.id !== 'player' && c.robot?.actor !== actor),
    ...forceFieldPlatforms(run.forceFields, 'objects').map(platform => ({ id: 'red', platform }))]
  const shapes = colliders.map(c => c.platform), candidates: ShoveContact[] = []
  const pair = (x: number, y: number, nx: number, ny = 0): [PushPalm, PushPalm] => [
    { x, y, nx, ny }, { x, y: y - flip * 3, nx, ny },
  ]
  const hit = pulseHit(from, [direction, 0], shapes, SHOVE_REACH)
  if (hit.index >= 0) {
    const collider = colliders[hit.index], edge = nearestBoundary(collider.platform, ...hit.point)
    candidates.push({ palms: pair(...hit.point, edge.nx, edge.ny), prop: 'prop' in collider ? collider.prop : undefined,
      robot: 'robot' in collider ? collider.robot : undefined })
  }
  for (const collider of colliders) {
    if (!('prop' in collider) || !collider.prop) continue
    const prop = collider.prop
    const reflected = actor.inverted ? { ...prop, y: -prop.y + propHeight(prop), angle: -prop.angle } : prop
    const hands = propPushHands(reflected, body.x, body.y * flip, direction, handHeight, SHOVE_REACH)
    if (!hands?.palms) continue
    const palms = hands.palms.map(p => ({ ...p, y: p.y * flip, ny: p.ny * flip })) as [PushPalm, PushPalm]
    if (Math.abs(palms[0].y - from[1]) > 28) continue
    const solids = colliders.filter(c => c !== collider).map(c => c.platform)
    if (!lineBlocked(from, [palms[0].x, palms[0].y], solids)) candidates.push({ palms, prop })
  }
  for (const target of targets) if (target !== actor && shoveReaches(run, actor, target, direction, world)) {
    const b = playerContactBody(target), y = b.y - (target.inverted ? -1 : 1) * b.height * .6
    candidates.push({ palms: pair(b.x - direction * 8, y, -direction), player: target })
  }
  return candidates.sort((a, b) => (a.palms[0].x - b.palms[0].x) * direction)[0]
}

/** Recheck reach at the strike, so backing away during the windup dodges it. */
export function advanceShove(run: Run, actor: Player, targets: readonly Player[], dt: number, world: ContactWorld) {
  actor.stagger = Math.max(0, (actor.stagger ?? 0) - dt)
  const shove = actor.shove
  if (!shove) return
  if (!canShove(actor) || actor.facing !== shove.direction) { actor.shove = undefined; return }
  shove.time += dt
  const contact = shoveContact(run, actor, targets, world)
  shove.contact = contact?.palms
  if (!shove.struck && shove.time + 1e-9 >= shove.windup) {
    shove.struck = true
    const target = contact?.robot?.actor ?? contact?.player
    if (target) {
      const bot = actor !== run.player, speed = bot ? BOT_SHOVE_SPEED : PLAYER_SHOVE_SPEED
      repulsePlayer(target, [shove.direction * speed / REPULSOR_BOT_IMPULSE,
        bot ? -(target.inverted ? -1 : 1) * 150 / REPULSOR_BOT_IMPULSE : 0])
      target.stagger = bot ? .35 : .08; target.shoveDrift = true
      if (contact?.robot) faceRobotToward(contact.robot, actor.x)
    }
    const strength = actor === run.player ? SHOVE_PROP_STRENGTH : 1
    if (contact?.prop) repulseProp(run, contact.prop, [shove.direction * strength, 0])
    if (contact?.robot && !contact.robot.actor) repulseRobot(contact.robot, shove.direction * strength, actor.x)
    if (contact) actor.shoves = (actor.shoves ?? 0) + 1
  }
  if (shove.time >= shove.windup + SHOVE_RECOVERY) actor.shove = undefined
}

/** Empty hands can shove even without a target. Each released press starts one stroke. */
export function preparePlayerShove(run: Run, input: JumpInput, dt: number, makeWorld: () => ContactWorld) {
  const actor = run.player
  if (run.gadgets.held) actor.shove = undefined
  advanceShove(run, actor, [], dt, actor.shove ? makeWorld() : EMPTY_WORLD)
  let press = presses.get(run)
  if (!press || press.player !== actor) { press = { player: actor, held: false, consumed: false }; presses.set(run, press) }
  const use = !!input.use && !press.held
  press.held = !!input.use
  if (!input.use) press.consumed = false
  if (use && !run.gadgets.held && !input.interact && !actor.shove && canShove(actor)) {
    beginShove(actor, PLAYER_SHOVE_WINDUP); press.consumed = true
  }
  return !run.gadgets.held && (press.consumed || !!actor.shove)
}
