import type { NamedObject } from './objectNames.ts'
import type { PowerMode, SwitchSettings } from './switchPower.ts'
import { finishPlayerStep, NEUTRAL_INPUT } from './model.ts'
import type { Platform, Player } from './model.ts'
import { moveBody } from './geometry.ts'
import { staticContactWorld, translatePlayer } from './playerContacts.ts'
import type { ContactWorld } from './playerContacts.ts'
/** Retain the legacy assembly origin so existing doors and indicators never move. */
export interface Goal extends NamedObject, SwitchSettings { x: number; y: number; flipX?: boolean; id?: string; power?: PowerMode }
export const GOAL_POLE_OFFSET = 44
export const GOAL_LIGHT_HEIGHT = 96
export const GOAL_DOOR_WIDTH = 40
export const GOAL_DOOR_HEIGHT = 80
export const GOAL_DOOR_OFFSET = 100
export const GOAL_OPEN_SECONDS = .3
export const GOAL_EXIT_SECONDS = .85
export interface GoalExit { elapsed: number; fromX: number; toX: number }
export interface Entrance extends NamedObject { x: number; y: number; kind?: 'charging-bay' }
export const ENTRANCE_REVEAL_SECONDS = .35
export const ENTRANCE_WALK_SECONDS = .7
export const ENTRANCE_HOLD_SECONDS = 1.05
export const ENTRANCE_SECONDS = ENTRANCE_HOLD_SECONDS + GOAL_OPEN_SECONDS
export const AWAKENING_SECONDS = 2.2
export interface EntranceAnimation { elapsed: number; player: Player; fromX: number; toX: number; kind?: 'charging-bay' }
export const entranceDuration = (entrance: Pick<EntranceAnimation, 'kind'>) => entrance.kind === 'charging-bay' ? AWAKENING_SECONDS : ENTRANCE_SECONDS
export const awakeningProgress = (elapsed: number) => goalEase((elapsed - .55) / 1.3)
export const entranceVisibility = (elapsed: number) => goalEase(elapsed / ENTRANCE_REVEAL_SECONDS)
export const entrancePosition = (entrance: EntranceAnimation) => entrance.fromX + (entrance.toX - entrance.fromX) * goalEase(entrance.elapsed / ENTRANCE_WALK_SECONDS)
export function createEntranceAnimation(player: Player, platforms: readonly Platform[], entrance?: Entrance): EntranceAnimation {
  if (entrance?.kind === 'charging-bay') return { elapsed: 0, player: structuredClone(player), fromX: player.x, toX: player.x, kind: 'charging-bay' }
  const actor = structuredClone(player), from = moveBody([player.x, player.y], [player.x - player.facing * 10, player.y], platforms)
  translatePlayer(actor, from.x - player.x, 0)
  return { elapsed: 0, player: actor, fromX: from.x, toX: player.x }
}
/** The entrance actor moves while the playable world remains at its authored start. */
export function advanceEntranceAnimation(entrance: EntranceAnimation, dt: number, world: ContactWorld = staticContactWorld(entrance.player.terrain ?? [])): number {
  const duration = entranceDuration(entrance), remaining = duration - entrance.elapsed, used = Math.min(dt, remaining)
  const actor = entrance.player, from: [number, number] = [actor.x, actor.y]
  entrance.elapsed = Math.min(duration, entrance.elapsed + dt)
  if (entrance.kind === 'charging-bay') return Math.max(0, dt - remaining)
  actor.x = entrancePosition(entrance); actor.vx = used > 0 ? (actor.x - from[0]) / used : 0
  if (used > 0) finishPlayerStep(actor, NEUTRAL_INPUT, used, world, from)
  return Math.max(0, dt - remaining)
}
export const entranceDoor = (entrance: Entrance) => ({ x: entrance.x - GOAL_DOOR_WIDTH / 2,
  y: entrance.y - GOAL_DOOR_HEIGHT, w: GOAL_DOOR_WIDTH, h: GOAL_DOOR_HEIGHT })
export const entranceOpening = (elapsed: number) => 1 - Math.max(0, (elapsed - ENTRANCE_HOLD_SECONDS) / GOAL_OPEN_SECONDS)

/** Installed back-wall hardware; the robot uses its normal articulated rig. */
export function drawChargingBay(ctx: CanvasRenderingContext2D, entrance: Entrance) {
  const { x, y } = entrance
  ctx.fillStyle = '#87958b'; ctx.fillRect(x - 20, y - 80, 40, 80)
  ctx.fillStyle = '#a9b3a6'; ctx.fillRect(x - 17, y - 77, 34, 74)
  ctx.fillStyle = '#76877b'; ctx.fillRect(x - 4, y - 69, 8, 57)
  ctx.fillStyle = '#87958b'; ctx.fillRect(x - 20, y - 5, 40, 5)
  ctx.fillStyle = '#b9cda7'; ctx.fillRect(x + 12, y - 72, 2, 6)
}

export const goalPoleX = (goal: Goal) => goal.x + (goal.flipX ? -1 : 1) * GOAL_POLE_OFFSET
export function goalDoor(goal: Goal) {
  return { x: goal.x + (goal.flipX ? -1 : 1) * GOAL_DOOR_OFFSET - GOAL_DOOR_WIDTH / 2,
    y: goal.y - GOAL_DOOR_HEIGHT, w: GOAL_DOOR_WIDTH, h: GOAL_DOOR_HEIGHT }
}
export const goalEase = (value: number) => { const t = Math.max(0, Math.min(1, value)); return t * t * (3 - 2 * t) }
/** Both doorways close into the back wall and have no physical collider. */
export function drawDoorway(ctx: CanvasRenderingContext2D, door: ReturnType<typeof goalDoor>, opening: number, editor = false) {
  const width = door.w * goalEase(opening)
  if (width > 0) {
    const x = door.x + (door.w - width) / 2
    ctx.fillStyle = '#46544835'; ctx.fillRect(x - 3, door.y - 3, width + 6, door.h + 3)
    ctx.fillStyle = '#ffffff65'; ctx.fillRect(x + width, door.y, 1, door.h)
    ctx.fillStyle = '#000000'; ctx.fillRect(x, door.y, width, door.h)
  } else if (editor) {
    ctx.save(); ctx.strokeStyle = '#8a938b'; ctx.lineWidth = 1; ctx.setLineDash([4, 4])
    ctx.strokeRect(door.x, door.y, door.w, door.h); ctx.restore()
  }
}
export function goalExitPosition(exit: GoalExit) {
  const t = 1 - (1 - Math.min(1, exit.elapsed / .3)) ** 3
  return exit.fromX + (exit.toX - exit.fromX) * t
}

export function goalBounds(goal: Goal) {
  const near = GOAL_POLE_OFFSET - 14, far = GOAL_DOOR_OFFSET + GOAL_DOOR_WIDTH / 2 + 3
  return { x: goal.x + (goal.flipX ? -far : near), y: goal.y - GOAL_LIGHT_HEIGHT - 14,
    w: far - near, h: GOAL_LIGHT_HEIGHT + 14 }
}
