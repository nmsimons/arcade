import type { NamedObject } from './objectNames.ts'
import type { PowerMode, SwitchSettings } from './switchPower.ts'
import { finishPlayerStep, NEUTRAL_INPUT } from './model.ts'
import type { Platform, Player } from './model.ts'
import { moveBody, polygonIntersects } from './geometry.ts'
import { groundAt } from './terrain.ts'
import { advanceFootwork } from './footwork.ts'
import { staticContactWorld, translatePlayer } from './playerContacts.ts'
import type { ContactWorld } from './playerContacts.ts'
import { ambientPaint, paintNormally } from './worldPaint.ts'
import type { WorldPaint } from './worldPaint.ts'
/** Retain the legacy assembly origin so existing doors and indicators never move. */
export interface Goal extends NamedObject, SwitchSettings { x: number; y: number; flipX?: boolean; id?: string; power?: PowerMode; kind?: 'overlook' | 'walk-off' | 'bus'; ending?: 'bus' }
export const isOutdoorGoal = (goal?: Goal) => goal?.kind === 'overlook' || goal?.kind === 'walk-off' || goal?.kind === 'bus'
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
export const AWAKENING_SECONDS = 3.6
export const ROBOT_BAY_WIDTH_SCALE = 1.25
export interface EntranceAnimation { elapsed: number; player: Player; fromX: number; toX: number; kind?: 'charging-bay' }
export const entranceDuration = (entrance: Pick<EntranceAnimation, 'kind'>) => entrance.kind === 'charging-bay' ? AWAKENING_SECONDS : ENTRANCE_SECONDS
export const awakeningPower = (elapsed: number) => goalEase((elapsed - .45) / .7)
export const awakeningProgress = (elapsed: number) => goalEase((elapsed - 1) / 1.35)
export const chargingBayOpening = (elapsed: number) => goalEase((elapsed - 2.25) / 1)
export const entranceVisibility = (elapsed: number) => goalEase(elapsed / ENTRANCE_REVEAL_SECONDS)
export const entrancePosition = (entrance: EntranceAnimation) => entrance.fromX + (entrance.toX - entrance.fromX) * goalEase(entrance.elapsed / ENTRANCE_WALK_SECONDS)
export function createEntranceAnimation(player: Player, platforms: readonly Platform[], entrance?: Entrance): EntranceAnimation {
  if (entrance?.kind === 'charging-bay') return { elapsed: 0, player: structuredClone(player), fromX: player.x, toX: player.x, kind: 'charging-bay' }
  const actor = structuredClone(player), from = moveBody([player.x, player.y], [player.x - player.facing * 10, player.y], platforms)
  actor.terrain = platforms
  if (!actor.footwork) advanceFootwork(actor, 0, actor.x, platforms)
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
export const entranceDoor = (entrance: Pick<Entrance, 'x' | 'y'>) => ({ x: entrance.x - GOAL_DOOR_WIDTH / 2,
  y: entrance.y - GOAL_DOOR_HEIGHT, w: GOAL_DOOR_WIDTH, h: GOAL_DOOR_HEIGHT })
export const entranceOpening = (elapsed: number) => 1 - Math.max(0, (elapsed - ENTRANCE_HOLD_SECONDS) / GOAL_OPEN_SECONDS)

/** A doorway needs its entire flat sill and clear opening at the authored position. */
export function entranceFits(entrance: Pick<Entrance, 'x' | 'y'>, terrain: readonly Platform[], width: number, height: number): boolean {
  const door = entranceDoor(entrance), { y } = entrance
  if (door.x < 0 || door.x + door.w > width || door.y < 0 || y > height) return false
  for (let i = 0; i <= 10; i++) {
    const ground = groundAt(terrain, door.x + .01 + (door.w - .02) * i / 10, y, .15)
    if (!ground || Math.abs(ground.angle) >= .02) return false
  }
  return !terrain.some(b => polygonIntersects([[door.x, door.y], [door.x + door.w, door.y],
    [door.x + door.w, y], [door.x, y]], b, .01))
}

/** Artwork extends around the clear 40-by-80 start; it adds no collision. */
export const chargingBayBounds = ({ x, y }: Pick<Entrance, 'x' | 'y'>, widthScale = 1) => ({ x: x - 51 * widthScale, y: y - 126, w: 102 * widthScale, h: 126 })
export const entranceBounds = (entrance: Entrance) => entrance.kind === 'charging-bay' ? chargingBayBounds(entrance) : entranceDoor(entrance)

/** A substantial capsule shell and dark, recessed charging cradle. */
export function drawChargingBay(ctx: CanvasRenderingContext2D, entrance: Pick<Entrance, 'x' | 'y'>, widthScale = 1) {
  const { x, y } = entrance
  ctx.save(); ctx.translate(x, y); ctx.scale(widthScale, 1)
  ctx.fillStyle = '#25372e30'; ctx.beginPath(); ctx.roundRect(-49, -124, 98, 124, [34, 34, 8, 8]); ctx.fill()
  ctx.fillStyle = '#718178'; ctx.beginPath(); ctx.roundRect(-47, -126, 94, 124, [32, 32, 7, 7]); ctx.fill()
  ctx.strokeStyle = '#a5b1a5'; ctx.lineWidth = 1
  ctx.beginPath(); ctx.roundRect(-45.5, -124.5, 91, 120, [31, 31, 6, 6]); ctx.stroke()
  ctx.fillStyle = '#34463d'; ctx.beginPath(); ctx.roundRect(-36, -114, 72, 109, [25, 25, 4, 4]); ctx.fill()
  ctx.fillStyle = '#24362e'; ctx.beginPath(); ctx.roundRect(-31, -109, 62, 101, [23, 23, 3, 3]); ctx.fill()
  // The back spine and contacts explain what held the sleeping robot here.
  ctx.fillStyle = '#50665a'; ctx.fillRect(-6, -85, 12, 73)
  ctx.fillStyle = '#829587'; ctx.fillRect(-15, -50, 30, 5); ctx.fillRect(-12, -29, 24, 4)
  ctx.fillStyle = '#53675b'; ctx.fillRect(-42, -84, 3, 66); ctx.fillRect(39, -84, 3, 66)
  ctx.fillStyle = '#34463d'; ctx.beginPath(); ctx.roundRect(-10, -121, 20, 5, 2); ctx.fill()
  ctx.fillStyle = '#87958b'; ctx.beginPath(); ctx.roundRect(-51, -7, 102, 7, [2, 2, 0, 0]); ctx.fill()
  ctx.fillStyle = '#b0b9ac'; ctx.fillRect(-40, -7, 80, 1)
  ctx.restore()
}

/** Closed glass sits over the waking actor; the released cover stays on the wall. */
export function drawChargingBayCover(ctx: CanvasRenderingContext2D, entrance: Pick<Entrance, 'x' | 'y'>, elapsed = AWAKENING_SECONDS, paint: WorldPaint = paintNormally, nightMode = false, widthScale = 1) {
  const { x, y } = entrance, opening = chargingBayOpening(elapsed), power = awakeningPower(elapsed)
  ambientPaint(paint)(ctx, 0, () => {
    ctx.save(); ctx.translate(x, y); ctx.scale(widthScale, 1)
    ctx.beginPath(); ctx.roundRect(-36, -114, 72, 107, [25, 25, 3, 3]); ctx.clip()
    for (const side of [-1, 1]) {
      ctx.save(); ctx.translate(side * opening * 35, 0)
      const left = side < 0 ? -36 : 0
      ctx.beginPath(); ctx.rect(left, -114, 36, 107); ctx.clip()
      ctx.fillStyle = '#7d9e8f99'; ctx.fillRect(left, -114, 36, 107)
      ctx.fillStyle = '#c7d8c736'; ctx.beginPath()
      ctx.moveTo(26, -114); ctx.lineTo(39, -114); ctx.lineTo(-27, -7); ctx.lineTo(-40, -7); ctx.closePath(); ctx.fill()
      ctx.fillStyle = '#b6cdb9b0'; ctx.fillRect(side < 0 ? -1.5 : .5, -108, 1, 98)
      ctx.restore()
    }
    ctx.restore()
    // A front bezel and sill overlap the silhouette: the feet sit inside the
    // cradle instead of on the outside edge of a flat background panel.
    ctx.save(); ctx.translate(x, y); ctx.scale(widthScale, 1)
    ctx.fillStyle = '#718178'; ctx.beginPath()
    ctx.roundRect(-47, -126, 94, 124, [32, 32, 7, 7])
    ctx.roundRect(-36, -114, 72, 104, [25, 25, 3, 3]); ctx.fill('evenodd')
    ctx.fillStyle = '#87958b'; ctx.beginPath(); ctx.roundRect(-51, -10, 102, 12, [2, 2, 0, 0]); ctx.fill()
    ctx.fillStyle = '#9eac9c'; ctx.fillRect(-35, -10, 70, 1)
    ctx.restore()
  }, false, chargingBayBounds(entrance, widthScale))
  paint(ctx, .65, () => {
    ctx.save(); ctx.translate(x, y); ctx.scale(widthScale, 1); ctx.globalAlpha *= power
    ctx.fillStyle = '#b9d69b'
    if (nightMode) { ctx.shadowColor = '#a9d56b'; ctx.shadowBlur = 4 }
    ctx.fillRect(-5, -120, 10, 2)
    for (const side of [-1, 1]) ctx.fillRect(side * 40 - .75, -81, 1.5, 42)
    ctx.restore()
  }, false, { x: x - 46 * widthScale, y: y - 125, w: 92 * widthScale, h: 93 })
}

export const goalPoleX = (goal: Goal) => goal.x + (goal.flipX ? -1 : 1) * GOAL_POLE_OFFSET
export function goalDoor(goal: Goal) {
  if (goal.kind === 'bus') return { x: goal.x - 92, y: goal.y - GOAL_DOOR_HEIGHT, w: 24, h: GOAL_DOOR_HEIGHT }
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
  if (goal.kind === 'bus') return { x: goal.x - 184, y: goal.y - 144, w: 260, h: 176 }
  if (goal.kind === 'walk-off') return { x: goal.x - 40, y: goal.y - 100, w: 40, h: 100 }
  if (goal.kind === 'overlook') return { x: goal.x - 30, y: goal.y - 80, w: 60, h: 80 }
  const near = GOAL_POLE_OFFSET - 14, far = GOAL_DOOR_OFFSET + GOAL_DOOR_WIDTH / 2 + 3
  return { x: goal.x + (goal.flipX ? -far : near), y: goal.y - GOAL_LIGHT_HEIGHT - 14,
    w: far - near, h: GOAL_LIGHT_HEIGHT + 14 }
}
