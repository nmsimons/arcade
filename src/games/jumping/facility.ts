import type { Campaign, FacilityProgress } from './campaign.ts'
import { formatTime } from './challenge.ts'
import { gradeFor, gradeTimes } from './grading.ts'
import { isHubLevel, isPuzzleLevel } from './level.ts'
import type { HubLevel, JumpLevel } from './level.ts'
import type { HubDoor } from './hub.ts'

/** How the robot enters a hub: at its default entrance, or out of a door or bulkhead. */
export type Arrival = { kind: 'entrance' } | { kind: 'door'; id: string }
export type FacilityPlace =
  | { kind: 'opening'; level: string }
  | { kind: 'introduction'; level: string; index: number }
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
  } catch { /* An unreadable save resumes at the concourse. */ }
  return {}
}
/**
 * A course resumes at its door. The opening and introduction are never saved:
 * their progress follows from completions, so a new game resumes at its first
 * unfinished introduction level.
 */
export function savedPlace(place: FacilityPlace): SavedPlace | undefined {
  if (place.kind === 'course') return { kind: 'hub', level: place.hub, arrival: { kind: 'door', id: place.door } }
  return place.kind === 'opening' || place.kind === 'introduction' ? undefined : place
}
export function saveFacilityPlace(storage: Pick<Storage, 'setItem'>, place: FacilityPlace) {
  const saved = savedPlace(place)
  if (saved) storage.setItem(FACILITY_KEY, JSON.stringify({ place: saved }))
}

type Levels = ReadonlyMap<string, JumpLevel>
const hubLevel = (levels: Levels, id?: string) => { const level = id === undefined ? undefined : levels.get(id); return level && isHubLevel(level) ? level : undefined }
/** Which part of the facility a hub level is, as bulkheads name it. */
const hubPlace = (campaign: Campaign, id: string) => id === campaign.concourse ? 'concourse' : campaign.wings.find(wing => wing.level === id)?.id
const hubOpen = (campaign: Campaign, progress: FacilityProgress, id: string) => {
  const place = hubPlace(campaign, id)
  return place === 'concourse' ? progress.concourseOpen : !!progress.wings.find(wing => wing.id === place)?.open
}

/** The opening and introduction levels play untimed in the facility, without wall clocks. */
export function facilityLevel(campaign: Campaign, level: JumpLevel): JumpLevel {
  return campaign.introduction.includes(level.id) && level.timing !== 'untimed' ? { ...level, timing: 'untimed', timers: [] } : level
}

/**
 * A new save starts in the opening level, then works through the introduction.
 * Afterward the robot resumes where it was autosaved, or at the concourse's
 * entrance if a build has since closed or removed that place.
 */
export function facilityStart(campaign: Campaign, progress: FacilityProgress, save: FacilitySave, levels: Levels): FacilityPlace {
  const concourse = hubLevel(levels, campaign.concourse)
  if (!progress.started || !concourse) return { kind: 'opening', level: campaign.opening }
  const next = progress.introduction.indexOf(false)
  if (next >= 0) return { kind: 'introduction', level: campaign.introduction[next], index: next }
  const place = save.place, hub = place?.kind === 'hub' ? hubLevel(levels, place.level) : undefined
  if (place?.kind === 'hub' && hub && hubOpen(campaign, progress, hub.id)) {
    const door = place.arrival.kind === 'door' ? place.arrival.id : undefined
    return { kind: 'hub', level: hub.id, arrival: door && [...hub.courseDoors, ...hub.bulkheads].some(d => d.id === door) ? place.arrival : { kind: 'entrance' } }
  }
  if (place?.kind === 'escape' && progress.complete && campaign.escape[place.index] === place.level && levels.has(place.level)) return place
  return { kind: 'hub', level: concourse.id, arrival: { kind: 'entrance' } }
}
/** The concourse, with the robot stepping out of the door to this level, if it has one. */
function concourseAt(campaign: Campaign, levels: Levels, level?: string): FacilityPlace | null {
  const concourse = hubLevel(levels, campaign.concourse), door = concourse?.courseDoors.find(d => d.course === level)
  return concourse ? { kind: 'hub', level: concourse.id, arrival: door ? { kind: 'door', id: door.id } : { kind: 'entrance' } } : null
}

/**
 * Where a finished run leads. A new game's opening leads through the
 * introduction levels in order, and the last one opens onto the concourse,
 * where the robot steps out of that level's door. Every course returns the
 * robot to its door, and a bulkhead leads to the matching bulkhead on the far
 * side. Passing the final course leads into the escape levels, each opening
 * into the next. Null when the facility has nowhere to go, as after the last
 * escape level.
 */
export function nextPlace(campaign: Campaign, place: FacilityPlace, departure: HubDoor | null, levels: Levels, passed = true): FacilityPlace | null {
  if (place.kind === 'opening' || place.kind === 'introduction') {
    const index = place.kind === 'opening' ? 0 : place.index + 1, level = campaign.introduction[index]
    if (level && levels.has(level)) return { kind: 'introduction', level, index }
    return concourseAt(campaign, levels, place.level)
  }
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
  const origin = hubPlace(campaign, place.level), to = departure.door.to
  const target = hubLevel(levels, to === 'concourse' ? campaign.concourse : campaign.wings.find(wing => wing.id === to)?.level)
  if (!origin || !target) return null
  const bulkhead = target.bulkheads.find(b => b.to === origin)
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
 * and D deadline until passed, then the best time and grade. A closed bulkhead
 * shows the clearance still needed. Locked doors stay dark.
 */
export function hubPresentation(campaign: Campaign, progress: FacilityProgress, level: HubLevel, levels: Levels, best: (course: string) => number | null) {
  const open = new Set<string>(), placards = new Map<string, string[]>()
  for (const board of level.evaluationBoards) placards.set(board.id, evaluationLines(campaign, progress))
  for (const door of level.courseDoors) {
    // Doors to the opening and introduction levels are always open, with no deadline or grade.
    const replay = levels.get(door.course)
    if ((door.course === campaign.opening || campaign.introduction.includes(door.course)) && replay) {
      open.add(door.id); placards.set(door.id, [replay.name.toUpperCase()])
      continue
    }
    // The dispatch door stays sealed until the evaluation is complete.
    if (door.course === campaign.finalCourse) {
      if (progress.complete) open.add(door.id)
      placards.set(door.id, ['DISPATCH', progress.complete ? 'UNIT RELEASED' : 'SEALED'])
      continue
    }
    const wing = progress.wings.find(wing => wing.doors.some(d => d.course === door.course))
    const state = wing?.doors.find(d => d.course === door.course)?.state, course = levels.get(door.course)
    if (!wing?.open || !state || state === 'locked' || !course || !isPuzzleLevel(course)) { placards.set(door.id, []); continue }
    open.add(door.id)
    const time = best(door.course)
    placards.set(door.id, state === 'passed' && time !== null
      ? [course.name.toUpperCase(), `${formatTime(time)} ${gradeFor(time, course)}`]
      : [course.name.toUpperCase(), `D ${formatTime(gradeTimes(course).d).replace(/\.00$/, '')}`])
  }
  for (const bulkhead of level.bulkheads) {
    const wing = progress.wings.find(wing => wing.id === bulkhead.to)
    const name = bulkhead.to === 'concourse' ? 'CONCOURSE' : (campaign.wings.find(w => w.id === bulkhead.to)?.name ?? bulkhead.to).toUpperCase()
    const isOpen = bulkhead.to === 'concourse' ? progress.concourseOpen : !!wing?.open
    if (isOpen) open.add(bulkhead.id)
    // A closed wing shows the clearance it still needs.
    const needed = bulkhead.to === 'concourse' ? undefined : wing?.clearance
    placards.set(bulkhead.id, isOpen ? [name] : needed ? [name, `CLEARANCE ${needed.passed}/${needed.count}`] : [name, 'SEALED'])
  }
  return { open, placards }
}

/** The evaluation board: the total, then each wing's passes, or SEALED while it is closed. */
export function evaluationLines(campaign: Campaign, progress: FacilityProgress) {
  const heading = progress.complete ? ['EVALUATION COMPLETE', 'UNIT RELEASED FOR DISPATCH'] : [`EVALUATION ${progress.passed} / ${progress.required}`]
  return [...heading, ...progress.wings.map((wing, i) => `${campaign.wings[i].name.toUpperCase()} ${wing.open ? `${wing.passed}/${wing.doors.length}` : 'SEALED'}`)]
}

/** Leaving the final course or the escape route returns the robot to the dispatch door. */
export const dispatchPlace = (campaign: Campaign, levels: Levels) => concourseAt(campaign, levels, campaign.finalCourse)
