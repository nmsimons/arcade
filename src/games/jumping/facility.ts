import type { Campaign, FacilityProgress } from './campaign.ts'
import { formatTime } from './challenge.ts'
import { gradeFor, gradeTimes } from './grading.ts'
import { isHubLevel, isPuzzleLevel } from './level.ts'
import type { HubLevel, JumpLevel } from './level.ts'
import type { HubDoor } from './hub.ts'

/** How the robot enters a hub: its default entrance, out of a door, or waking in a bay. */
export type Arrival = { kind: 'entrance' } | { kind: 'door'; id: string } | { kind: 'bay'; id: string }
export type FacilityPlace =
  | { kind: 'opening'; level: string }
  | { kind: 'hub'; level: string; arrival: Arrival }
  | { kind: 'course'; level: string; hub: string; door: string }

/** The last charging bay passed is the facility's only saved position. */
export const FACILITY_KEY = 'arcade.jumping.facility.v1'
export interface FacilitySave { bay?: { level: string; id: string } }
export function readFacilitySave(storage: Pick<Storage, 'getItem'>): FacilitySave {
  try {
    const bay = JSON.parse(storage.getItem(FACILITY_KEY) ?? '{}')?.bay
    return typeof bay?.level === 'string' && typeof bay?.id === 'string' ? { bay: { level: bay.level, id: bay.id } } : {}
  } catch { return {} }
}
export function saveFacilityBay(storage: Pick<Storage, 'setItem'>, level: string, id: string) {
  storage.setItem(FACILITY_KEY, JSON.stringify({ bay: { level, id } }))
}

type Levels = ReadonlyMap<string, JumpLevel>
const hubLevel = (levels: Levels, id?: string) => { const level = id === undefined ? undefined : levels.get(id); return level && isHubLevel(level) ? level : undefined }
/** Which part of the facility a hub level is, as bulkheads name it. */
const hubPlace = (campaign: Campaign, id: string) => id === campaign.concourse ? 'concourse' : campaign.wings.find(wing => wing.level === id)?.id
const hubOpen = (campaign: Campaign, progress: FacilityProgress, id: string) => {
  const place = hubPlace(campaign, id)
  return place === 'concourse' ? progress.concourseOpen : !!progress.wings.find(wing => wing.id === place)?.open
}

/** A new save starts in the opening level; otherwise the robot wakes in the last bay it passed. */
export function facilityStart(campaign: Campaign, progress: FacilityProgress, save: FacilitySave, levels: Levels): FacilityPlace {
  const first = hubLevel(levels, campaign.wings[0].level)
  if (!progress.started || !first) return { kind: 'opening', level: campaign.opening }
  const bay = save.bay, saved = bay && hubLevel(levels, bay.level)
  if (bay && saved?.chargingBays.some(b => b.id === bay.id) && hubOpen(campaign, progress, bay.level)) return { kind: 'hub', level: bay.level, arrival: { kind: 'bay', id: bay.id } }
  return { kind: 'hub', level: first.id, arrival: { kind: 'entrance' } }
}

/**
 * Where a finished run leads. The opening opens into the first wing, a course
 * returns the robot to its own door, and a bulkhead leads to the matching
 * bulkhead on the far side. Null when the facility has nowhere to go.
 */
export function nextPlace(campaign: Campaign, place: FacilityPlace, departure: HubDoor | null, levels: Levels): FacilityPlace | null {
  if (place.kind === 'opening') {
    const first = hubLevel(levels, campaign.wings[0].level)
    return first ? { kind: 'hub', level: first.id, arrival: { kind: 'entrance' } } : null
  }
  if (place.kind === 'course') return { kind: 'hub', level: place.hub, arrival: { kind: 'door', id: place.door } }
  if (!departure) return null
  if (departure.kind === 'course') return levels.has(departure.door.course) ? { kind: 'course', level: departure.door.course, hub: place.level, door: departure.door.id } : null
  const origin = hubPlace(campaign, place.level), to = departure.door.to
  const target = hubLevel(levels, to === 'concourse' ? campaign.concourse : campaign.wings.find(wing => wing.id === to)?.level)
  if (!origin || !target) return null
  const bulkhead = target.bulkheads.find(b => b.to === origin)
  return { kind: 'hub', level: target.id, arrival: bulkhead ? { kind: 'door', id: bulkhead.id } : { kind: 'entrance' } }
}

/** The hub as the robot arrives. A bay arrival replaces that bay with the waking pod. */
export function arrivalLevel(level: HubLevel, arrival: Arrival): HubLevel {
  if (arrival.kind === 'entrance') return level
  if (arrival.kind === 'bay') {
    const bay = level.chargingBays.find(b => b.id === arrival.id)
    return bay ? { ...level, entrance: { x: bay.x, y: bay.y, kind: 'charging-bay' }, chargingBays: level.chargingBays.filter(b => b !== bay) } : level
  }
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
  for (const door of level.courseDoors) {
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
    // The concourse opens once the first wing is passed; other wings show their clearance.
    const entry = progress.wings[0], needed = bulkhead.to === 'concourse' ? { passed: entry.passed, count: entry.doors.length } : wing?.clearance
    placards.set(bulkhead.id, isOpen ? [name] : needed ? [name, `CLEARANCE ${needed.passed}/${needed.count}`] : [name, 'SEALED'])
  }
  return { open, placards }
}
