import { chargingBayBounds, drawDoorway, entranceDoor, entranceFits } from './goal.ts'
import type { NamedObject } from './objectNames.ts'
import type { Platform } from './model.ts'
import { drawWallTexts } from './wallText.ts'
import type { WallText } from './wallText.ts'
import type { WorldPaint } from './worldPaint.ts'

/** A door in a hub's back wall that leads into one course. */
export interface CourseDoor extends NamedObject { id: string; x: number; y: number; course: string }
/** A door between hubs; `to` names a wing, or "concourse". */
export interface Bulkhead extends NamedObject { id: string; x: number; y: number; to: string }
/** An empty charging pod. Walking past it records the facility's resume point. */
export interface HubBay extends NamedObject { id: string; x: number; y: number }
/** A wall display of the evaluation's progress. Nothing on it is selectable. */
export interface EvaluationBoard extends NamedObject { id: string; x: number; y: number; w: number; h: number }
export const MAX_COURSE_DOORS = 60, MAX_BULKHEADS = 12, MAX_HUB_BAYS = 12, MAX_EVALUATION_BOARDS = 4
export const HUB_TARGET = /^[a-z][a-z0-9-]{0,39}$/

export type HubDoor = { kind: 'course'; door: CourseDoor } | { kind: 'bulkhead'; door: Bulkhead }
/**
 * A hub run's link to the facility. The facility sets which doors are open and
 * the placard text; the run reports the door taken and the last bay passed.
 */
export interface HubState {
  open: Set<string>; placards: Map<string, string[]>
  climbHeld: boolean; departure: HubDoor | null; bay: string | null
}
export const createHubState = (): HubState => ({ open: new Set(), placards: new Map(), climbHeld: true, departure: null, bay: null })

/** Doors share the entrance's 40-by-80 doorway and its flat-sill rule. */
export const hubDoorBounds = entranceDoor
export const hubDoorFits = (door: Pick<CourseDoor, 'x' | 'y'>, terrain: readonly Platform[], width: number, height: number) => entranceFits(door, terrain, width, height)
export const hubBayBounds = (bay: Pick<HubBay, 'x' | 'y'>) => chargingBayBounds(bay)
/** A placard hangs on the wall to the right of its door. */
export const placardBounds = (door: Pick<CourseDoor, 'x' | 'y'>) => ({ x: door.x + 32, y: door.y - 80, w: 120, h: 66 })

/** Placards are small message screens, dark while their door is locked. */
export function hubPlacard(door: Pick<CourseDoor, 'x' | 'y'>, lines: readonly string[]): WallText {
  return { ...placardBounds(door), text: lines.join('\n'), fontSize: 12, align: 'left', style: 'terminal' }
}
/**
 * Doors sit in the back wall with no collision. An open door is a dark doorway;
 * a locked one stays shut. Bulkheads carry a heavier frame and a striped lintel.
 * The editor shows every door open, with its destination on the placard.
 */
export function drawHubDoors(ctx: CanvasRenderingContext2D, level: { courseDoors?: CourseDoor[]; bulkheads?: Bulkhead[]; evaluationBoards?: EvaluationBoard[] }, hub: HubState | undefined, editor: boolean, paint: WorldPaint) {
  drawWallTexts(ctx, (level.evaluationBoards ?? []).map(({ x, y, w, h, id, name }): WallText => ({ x, y, w, h, fontSize: 14, align: 'left', style: 'terminal',
    text: (editor ? [name ?? 'EVALUATION'] : hub?.placards.get(id) ?? []).join('\n') })), false, paint)
  const doors = [...level.courseDoors ?? [], ...level.bulkheads ?? []]
  for (const door of doors) {
    const b = hubDoorBounds(door), open = editor || !!hub?.open.has(door.id), bulkhead = 'to' in door, frame = bulkhead ? 7 : 3
    paint(ctx, 0, () => {
      ctx.fillStyle = bulkhead ? '#5c6460' : '#9aa19c'; ctx.fillRect(b.x - frame, b.y - frame, b.w + frame * 2, b.h + frame)
      if (bulkhead) for (let x = b.x - frame, i = 0; x < b.x + b.w + frame; x += 8, i++) {
        ctx.fillStyle = i % 2 ? '#2f3431' : '#d9b545'; ctx.fillRect(x, b.y - frame, Math.min(8, b.x + b.w + frame - x), 4)
      }
      if (!open) {
        ctx.fillStyle = bulkhead ? '#424a46' : '#4a5450'; ctx.fillRect(b.x, b.y, b.w, b.h)
        ctx.fillStyle = '#00000030'; ctx.fillRect(b.x + b.w / 2 - .5, b.y, 1, b.h)
      }
    })
    if (open) paint(ctx, 0, () => drawDoorway(ctx, b, 1))
  }
  drawWallTexts(ctx, doors.map(door => hubPlacard(door, editor ? [door.name ?? ('course' in door ? door.course : door.to)] : hub?.placards.get(door.id) ?? [])), false, paint)
}
