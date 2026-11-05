import type { Campaign, FacilityProgress } from './campaign.ts'
import { wingName } from './campaign.ts'
import { formatTime } from './challenge.ts'
import { gradeFor, gradeTimes } from './grading.ts'
import { isHubLevel, isPuzzleLevel } from './level.ts'
import type { HubLevel, JumpLevel } from './level.ts'
import type { HubDoor } from './hub.ts'

/** How the robot enters a hub: at its default entrance, or out of a door or bulkhead. */
export type Arrival = { kind: 'entrance' } | { kind: 'door'; id: string }
export type FacilityPlace =
  | { kind: 'hub'; level: string; arrival: Arrival }
  | { kind: 'course'; level: string; hub: string; door: string }
  | { kind: 'escape'; level: string; index: number }

/**
 * The facility autosaves where the robot is: the hub and the door it came
 * through, the door of the course it is playing, or its escape level. Course
 * records save as they always have; together they are the whole save.
 */
export const FACILITY_KEY = 'arcade.jumping.facility.v1'
export type SavedPlace = Extract<FacilityPlace, { kind: 'hub' | 'escape' }>
export interface FacilitySave { place?: SavedPlace }
export function readFacilitySave(storage: Pick<Storage, 'getItem'>): FacilitySave {
  try {
    const place = JSON.parse(storage.getItem(FACILITY_KEY) ?? '{}')?.place
    if (place?.kind === 'hub' && typeof place.level === 'string') {
      const door = place.arrival?.kind === 'door' && typeof place.arrival.id === 'string' ? place.arrival.id as string : undefined
      return { place: { kind: 'hub', level: place.level, arrival: door ? { kind: 'door', id: door } : { kind: 'entrance' } } }
    }
    if (place?.kind === 'escape' && typeof place.level === 'string' && Number.isInteger(place.index) && place.index >= 0) return { place: { kind: 'escape', level: place.level, index: place.index } }
  } catch { /* An unreadable save starts a new game. */ }
  return {}
}
/** A course resumes at its door; every other place resumes where it is. */
export function savedPlace(place: FacilityPlace): SavedPlace {
  return place.kind === 'course' ? { kind: 'hub', level: place.hub, arrival: { kind: 'door', id: place.door } } : place
}
export function saveFacilityPlace(storage: Pick<Storage, 'setItem'>, place: FacilityPlace) {
  storage.setItem(FACILITY_KEY, JSON.stringify({ place: savedPlace(place) }))
}

type Levels = ReadonlyMap<string, JumpLevel>
const hubLevel = (levels: Levels, id?: string) => { const level = id === undefined ? undefined : levels.get(id); return level && isHubLevel(level) ? level : undefined }
/** The progress of the wing whose level this is; none for the opening, the concourse and areas outside the campaign. */
const areaWing = (campaign: Campaign, progress: FacilityProgress, id: string) => {
  const index = campaign.wings.findIndex(wing => wing.level === id)
  return index < 0 ? undefined : progress.wings[index]
}
/** A wing's area opens with its clearance; every other facility area is always open. */
const areaOpen = (campaign: Campaign, progress: FacilityProgress, id: string) => areaWing(campaign, progress, id)?.open ?? true

/**
 * A new save wakes at the opening's entrance. Afterward the robot resumes where
 * it was autosaved, or at the concourse's entrance if a build has since closed
 * or removed that place.
 */
export function facilityStart(campaign: Campaign, progress: FacilityProgress, save: FacilitySave, levels: Levels): FacilityPlace {
  const place = save.place, concourse = hubLevel(levels, campaign.concourse)
  if (!place) return { kind: 'hub', level: campaign.opening, arrival: { kind: 'entrance' } }
  const hub = place.kind === 'hub' ? hubLevel(levels, place.level) : undefined
  if (place.kind === 'hub' && hub && areaOpen(campaign, progress, hub.id)) {
    const door = place.arrival.kind === 'door' ? place.arrival.id : undefined
    return { kind: 'hub', level: hub.id, arrival: door && [...hub.courseDoors, ...hub.bulkheads].some(d => d.id === door) ? place.arrival : { kind: 'entrance' } }
  }
  if (place.kind === 'escape' && progress.complete && campaign.escape[place.index] === place.level && levels.has(place.level)) return place
  return { kind: 'hub', level: concourse?.id ?? campaign.opening, arrival: { kind: 'entrance' } }
}
/** The concourse, with the robot stepping out of the door to this level, if it has one. */
function concourseAt(campaign: Campaign, levels: Levels, level?: string): FacilityPlace | null {
  const concourse = hubLevel(levels, campaign.concourse), door = concourse?.courseDoors.find(d => d.course === level)
  return concourse ? { kind: 'hub', level: concourse.id, arrival: door ? { kind: 'door', id: door.id } : { kind: 'entrance' } } : null
}

/**
 * Where a finished run leads. Every course returns the robot to its door, and
 * a bulkhead leads to the matching bulkhead on the far side. Passing the final
 * course leads into the escape levels, each opening into the next. Null when
 * the facility has nowhere to go, as after the last escape level.
 */
export function nextPlace(campaign: Campaign, place: FacilityPlace, departure: HubDoor | null, levels: Levels, passed = true): FacilityPlace | null {
  if (place.kind === 'escape') {
    const index = place.index + 1, level = campaign.escape[index]
    return level && levels.has(level) ? { kind: 'escape', level, index } : null
  }
  if (place.kind === 'course') {
    const escape = campaign.escape[0]
    if (passed && place.level === campaign.finalCourse && escape && levels.has(escape)) return { kind: 'escape', level: escape, index: 0 }
    return { kind: 'hub', level: place.hub, arrival: { kind: 'door', id: place.door } }
  }
  if (!departure) return null
  if (departure.kind === 'course') return levels.has(departure.door.course) ? { kind: 'course', level: departure.door.course, hub: place.level, door: departure.door.id } : null
  const target = hubLevel(levels, departure.door.to)
  if (!target) return null
  const bulkhead = target.bulkheads.find(b => b.to === place.level)
  return { kind: 'hub', level: target.id, arrival: bulkhead ? { kind: 'door', id: bulkhead.id } : { kind: 'entrance' } }
}

/** The hub as the robot arrives: its entrance moves to the door it steps out of. */
export function arrivalLevel(level: HubLevel, arrival: Arrival): HubLevel {
  if (arrival.kind === 'entrance') return level
  const door = [...level.courseDoors, ...level.bulkheads].find(d => d.id === arrival.id)
  return door ? { ...level, entrance: { x: door.x, y: door.y } } : level
}

/**
 * Which doors open and what their placards read. A course door shows its name
 * and D deadline until passed, then the best time and grade; a door to a course
 * outside the campaign's wings is always open. A bulkhead has the name of the
 * area it leads to lettered above it; the evaluation board shows a sealed
 * wing's clearance. Locked doors stay dark.
 */
export function hubPresentation(campaign: Campaign, progress: FacilityProgress, level: HubLevel, levels: Levels, best: (course: string) => number | null) {
  const open = new Set<string>(), placards = new Map<string, string[]>()
  for (const board of level.evaluationBoards) placards.set(board.id, evaluationLines(campaign, progress, levels))
  for (const door of level.courseDoors) {
    // The dispatch door stays sealed until the evaluation is complete.
    if (door.course === campaign.finalCourse) {
      if (progress.complete) open.add(door.id)
      placards.set(door.id, ['DISPATCH', progress.complete ? 'UNIT RELEASED' : 'SEALED'])
      continue
    }
    const wing = progress.wings.find(wing => wing.doors.some(d => d.course === door.course))
    const state = !wing ? 'open' : wing.open ? wing.doors.find(d => d.course === door.course)!.state : 'locked', course = levels.get(door.course)
    if (state === 'locked' || !course || !isPuzzleLevel(course)) { placards.set(door.id, []); continue }
    open.add(door.id)
    const time = best(door.course), name = course.name.toUpperCase()
    placards.set(door.id, course.timing === 'untimed' ? [name]
      : (state === 'passed' || !wing) && time !== null ? [name, `${formatTime(time)} ${gradeFor(time, course)}`]
      : [name, `D ${formatTime(gradeTimes(course).d).replace(/\.00$/, '')}`])
  }
  for (const bulkhead of level.bulkheads) {
    const target = hubLevel(levels, bulkhead.to)
    if (!target) { placards.set(bulkhead.id, []); continue }
    placards.set(bulkhead.id, [target.name.toUpperCase()])
    const wing = areaWing(campaign, progress, target.id)
    if (!wing || wing.open) open.add(bulkhead.id)
  }
  return { open, placards }
}

/** The evaluation board: the total, then each wing, by its level's name, with its passes, or the clearance it still needs while it is sealed. */
export function evaluationLines(campaign: Campaign, progress: FacilityProgress, levels: Levels) {
  const heading = progress.complete ? ['EVALUATION COMPLETE', 'UNIT RELEASED FOR DISPATCH'] : [`EVALUATION ${progress.passed} / ${progress.required}`]
  return [...heading, ...progress.wings.map((wing, i) => `${wingName(campaign.wings[i], levels).toUpperCase()} ${wing.open ? `${wing.passed}/${wing.doors.length}` : wing.clearance ? `CLEARANCE ${wing.clearance.passed}/${wing.clearance.count}` : 'SEALED'}`)]
}

/** Leaving the final course or the escape route returns the robot to the dispatch door. */
export const dispatchPlace = (campaign: Campaign, levels: Levels) => concourseAt(campaign, levels, campaign.finalCourse)
