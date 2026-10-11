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
export interface Entrance extends NamedObject { x: number; y: number }
export const ENTRANCE_REVEAL_SECONDS = .35
export const ENTRANCE_WALK_SECONDS = .7
export const ENTRANCE_HOLD_SECONDS = 1.05
export const ENTRANCE_SECONDS = ENTRANCE_HOLD_SECONDS + GOAL_OPEN_SECONDS
export interface EntranceAnimation { elapsed: number; player: Player; fromX: number; toX: number }
export const entranceVisibility = (elapsed: number) => goalEase(elapsed / ENTRANCE_REVEAL_SECONDS)
export const entrancePosition = (entrance: EntranceAnimation) => entrance.fromX + (entrance.toX - entrance.fromX) * goalEase(entrance.elapsed / ENTRANCE_WALK_SECONDS)
export function createEntranceAnimation(player: Player, platforms: readonly Platform[]): EntranceAnimation {
  const actor = structuredClone(player), from = moveBody([player.x, player.y], [player.x - player.facing * 10, player.y], platforms)
  translatePlayer(actor, from.x - player.x, 0)
  return { elapsed: 0, player: actor, fromX: from.x, toX: player.x }
}
/** The entrance actor moves while the playable world remains at its authored start. */
export function advanceEntranceAnimation(entrance: EntranceAnimation, dt: number, world: ContactWorld = staticContactWorld(entrance.player.terrain ?? [])): number {
  const remaining = ENTRANCE_SECONDS - entrance.elapsed, used = Math.min(dt, remaining)
  const actor = entrance.player, from: [number, number] = [actor.x, actor.y]
  entrance.elapsed = Math.min(ENTRANCE_SECONDS, entrance.elapsed + dt)
  actor.x = entrancePosition(entrance); actor.vx = used > 0 ? (actor.x - from[0]) / used : 0
  if (used > 0) finishPlayerStep(actor, NEUTRAL_INPUT, used, world, from)
  return Math.max(0, dt - remaining)
}
export const entranceDoor = (entrance: Entrance) => ({ x: entrance.x - GOAL_DOOR_WIDTH / 2,
  y: entrance.y - GOAL_DOOR_HEIGHT, w: GOAL_DOOR_WIDTH, h: GOAL_DOOR_HEIGHT })
export const entranceOpening = (elapsed: number) => 1 - Math.max(0, (elapsed - ENTRANCE_HOLD_SECONDS) / GOAL_OPEN_SECONDS)

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
    ctx.fillStyle = '#000000'; ctx.fillRect(door.x + (door.w - width) / 2, door.y, width, door.h)
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
