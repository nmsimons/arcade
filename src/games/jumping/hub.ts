import { drawDoorway, entranceDoor, entranceFits } from './goal.ts'
import type { NamedObject } from './objectNames.ts'
import type { Platform } from './model.ts'
import { drawWallTexts } from './wallText.ts'
import type { WallText } from './wallText.ts'
import type { WorldPaint } from './worldPaint.ts'
import type { SwitchSettings } from './switchPower.ts'
import type { Grade } from './grading.ts'

/** A grade average's threshold: `a` is an A average, `d` a D or better. */
export type GradeLetter = 'a' | 'b' | 'c' | 'd'
export const GRADE_LETTERS: readonly GradeLetter[] = ['a', 'b', 'c', 'd']
/**
 * Doors open like a switched exit: always, or with `power: 'switched'` only
 * while their wiring is on, by its Logic and Reversed settings.
 */
export interface DoorPower extends Pick<SwitchSettings, 'switchLogic' | 'switchReversed'> { power?: 'switched' }
/**
 * A door in a hub's back wall that leads into one course, and goes by that
 * course's name. It is also a switch: on once the course is passed, at D or
 * better. `targets` lists what it switches.
 */
export interface CourseDoor extends DoorPower, Pick<SwitchSettings, 'targets'> { id: string; x: number; y: number; course: string }
/**
 * A door between facility areas; `to` is the level ID of the area it opens onto,
 * and it goes by that area's name. It is also a switch: on once that area is
 * complete, every level door in it passed.
 */
export interface Bulkhead extends DoorPower, Pick<SwitchSettings, 'targets'> { id: string; x: number; y: number; to: string }
/**
 * A studio-only node that averages the best grades of level doors in its
 * facility area and switches its targets while the average reaches `grade`.
 * Grades score A 4, B 3, C 2 and D 1; an F or a course not yet finished scores 0.
 */
export interface GradeGate extends NamedObject, SwitchSettings { id: string; x: number; y: number; doors: string[]; grade: GradeLetter }
export const MAX_GRADE_GATES = 20, GRADE_GATE_WIDTH = 72, GRADE_GATE_HEIGHT = 40
export const gradeGateBounds = (gate: Pick<GradeGate, 'x' | 'y'>) => ({ x: gate.x - GRADE_GATE_WIDTH / 2, y: gate.y - GRADE_GATE_HEIGHT / 2, w: GRADE_GATE_WIDTH, h: GRADE_GATE_HEIGHT })
const POINTS: Record<Grade, number> = { A: 4, B: 3, C: 2, D: 1, F: 0 }
/** Grade points for averages: A 4, B 3, C 2, D 1, and 0 for an F or no finish. */
export const gradePoints = (grade: Grade | null) => grade ? POINTS[grade] : 0
/** A level door's switch is on once its course is passed: at D or better, or a completed untimed level. */
export const coursePassed = (grade: Grade | null) => gradePoints(grade) > 0
/** A course's best grade, or null before its first finish. A completed untimed level counts as an A. */
export type CourseGrade = (course: string) => Grade | null
/** What a facility area's switches read from the save: courses' best grades, and which areas are complete. */
export interface FacilityRecords { grade: CourseGrade; complete: (area: string) => boolean }
/** An area is complete once every level door in it is passed; one with no level doors has nothing left to pass. */
export const areaComplete = (area: { courseDoors?: readonly CourseDoor[] }, grade: CourseGrade) => (area.courseDoors ?? []).every(door => coursePassed(grade(door.course)))
export function gradeGateActive(gate: GradeGate, doors: readonly CourseDoor[], grade: CourseGrade) {
  const inputs = gate.doors.flatMap(id => doors.filter(door => door.id === id))
  const active = inputs.length > 0 && inputs.reduce((sum, door) => sum + gradePoints(grade(door.course)), 0) / inputs.length >= gradePoints(gate.grade.toUpperCase() as Grade) - 1e-9
  return gate.switchReversed ? !active : active
}
/** Studio artwork only, like a logic relay: invisible during play. */
export function drawGradeGate(ctx: CanvasRenderingContext2D, gate: GradeGate, active: boolean) {
  const b = gradeGateBounds(gate)
  ctx.save()
  ctx.fillStyle = active ? '#d9e7d3' : '#eeeee6'; ctx.strokeStyle = '#60826a'; ctx.lineWidth = 2
  ctx.fillRect(b.x + 6, b.y + 2, b.w - 12, b.h - 4); ctx.strokeRect(b.x + 6, b.y + 2, b.w - 12, b.h - 4)
  ctx.beginPath(); ctx.moveTo(b.x, gate.y); ctx.lineTo(b.x + 6, gate.y); ctx.moveTo(b.x + b.w - 6, gate.y); ctx.lineTo(b.x + b.w, gate.y); ctx.stroke()
  ctx.fillStyle = '#365541'; ctx.font = 'bold 12px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
  ctx.fillText(`${gate.switchReversed ? '¬' : ''}AVG ≥ ${gate.grade.toUpperCase()}`, gate.x, gate.y)
  ctx.restore()
}
/** A wall display of the evaluation's progress. Nothing on it is selectable. */
export interface EvaluationBoard extends NamedObject { id: string; x: number; y: number; w: number; h: number }
export const MAX_COURSE_DOORS = 60, MAX_BULKHEADS = 12, MAX_EVALUATION_BOARDS = 4

export type HubDoor = { kind: 'course'; door: CourseDoor } | { kind: 'bulkhead'; door: Bulkhead }
/**
 * A hub run's link to the facility. The facility sets which doors are open and
 * the placard text; the run reports the door taken.
 */
export interface HubState {
  /** Level door placards and evaluation boards, by ID: lines of data on a screen. */
  open: Set<string>; placards: Map<string, string[]>
  /** The lettering above each level door and bulkhead, by ID: where it leads. */
  signs: Map<string, string>
  /** Switched doors and bulkheads the facility lets open: each is open while its wiring is on. */
  switched: Set<string>
  /** Best grades of the courses behind this area's doors, by course ID, for door switches and grade averages. */
  grades: Map<string, Grade>
  /** The areas beyond this area's bulkheads that are complete, by level ID, for bulkhead switches. */
  complete: Set<string>
  climbHeld: boolean; departure: HubDoor | null
}
export const createHubState = (): HubState => ({ open: new Set(), placards: new Map(), signs: new Map(), switched: new Set(), grades: new Map(), complete: new Set(), climbHeld: true, departure: null })

/** Doors share the entrance's 40-by-80 doorway and its flat-sill rule. */
export const hubDoorBounds = entranceDoor
export const hubDoorFits = (door: Pick<CourseDoor, 'x' | 'y'>, terrain: readonly Platform[], width: number, height: number) => entranceFits(door, terrain, width, height)
/** A placard, the screen of the level's data, hangs on the wall to the right of its level door. */
export const placardBounds = (door: Pick<CourseDoor, 'x' | 'y'>) => ({ x: door.x + 32, y: door.y - 80, w: 120, h: 66 })
/** A bulkhead's destination is lettered on the wall above its striped lintel, centered on the doorway. */
export const bulkheadSignBounds = (door: Pick<Bulkhead, 'x' | 'y'>) => ({ x: door.x - 150, y: door.y - 117, w: 300, h: 24 })
/** A level door's level is lettered above its lighter frame the same way. */
export const courseDoorSignBounds = (door: Pick<CourseDoor, 'x' | 'y'>) => ({ x: door.x - 150, y: door.y - 109, w: 300, h: 22 })

/** Placards are small message screens, dark while their door is locked. */
export function hubPlacard(door: Pick<CourseDoor, 'x' | 'y'>, lines: readonly string[]): WallText {
  return { ...placardBounds(door), text: lines.join('\n'), fontSize: 12, align: 'left', style: 'terminal' }
}
/** Door and bulkhead lettering is painted on the wall, so it follows the room's light and stays when the door is shut. */
export function bulkheadSign(door: Pick<Bulkhead, 'x' | 'y'>, text: string): WallText {
  return { ...bulkheadSignBounds(door), text, fontSize: 18, align: 'center', style: 'official' }
}
export function courseDoorSign(door: Pick<CourseDoor, 'x' | 'y'>, text: string): WallText {
  return { ...courseDoorSignBounds(door), text, fontSize: 16, align: 'center', style: 'official' }
}
/**
 * Doors sit in the back wall with no collision. An open door is a dark doorway;
 * a locked one stays shut. Every door has where it leads lettered above it, and
 * a level door has a placard screen of its level's data beside it. Bulkheads
 * carry a heavier frame and a striped lintel. The editor shows every door open.
 * Its placards and lettering come from the hub state when the studio supplies
 * them, or else name the destination.
 */
export function drawHubDoors(ctx: CanvasRenderingContext2D, level: { courseDoors?: CourseDoor[]; bulkheads?: Bulkhead[]; evaluationBoards?: EvaluationBoard[] }, hub: HubState | undefined, editor: boolean, paint: WorldPaint) {
  drawWallTexts(ctx, (level.evaluationBoards ?? []).map(({ x, y, w, h, id, name }): WallText => ({ x, y, w, h, fontSize: 14, align: 'left', style: 'terminal',
    text: (hub?.placards.get(id) ?? (editor ? [name ?? 'EVALUATION'] : [])).join('\n') })), false, paint)
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
  // A switched level door's placard goes dark while the door is shut, like a locked door's.
  const screen = (door: CourseDoor) => !editor && hub?.switched.has(door.id) && !hub.open.has(door.id) ? [] : hub?.placards.get(door.id) ?? []
  const sign = (door: CourseDoor | Bulkhead) => hub?.signs.get(door.id) ?? (editor ? 'course' in door ? door.course || 'NO LEVEL' : door.to || 'NOWHERE' : '')
  drawWallTexts(ctx, (level.courseDoors ?? []).map(door => hubPlacard(door, screen(door))), false, paint)
  // A door with nowhere to lead has no lettering.
  drawWallTexts(ctx, [...(level.courseDoors ?? []).map(door => courseDoorSign(door, sign(door))), ...(level.bulkheads ?? []).map(door => bulkheadSign(door, sign(door)))].filter(text => text.text), false, paint)
}
