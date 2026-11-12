import { isHubLevel, isPuzzleLevel } from './level.ts'
import type { HubLevel, JumpLevel } from './level.ts'
import type { Destination } from './goal.ts'
import { readLevelResponse } from './levelLimits.ts'

/** Like the levels, the campaign is a public asset fetched afresh, never bundled. */
export async function loadCampaign(base: string, fetchFile: typeof fetch = fetch): Promise<CampaignFile> {
  const response = await fetchFile(`${base.replace(/\/?$/, '/')}levels/jumping-campaign.json`, { cache: 'no-store' })
  if (!response.ok) {
    await response.body?.cancel().catch(() => {})
    throw new Error(`Could not load the campaign (HTTP ${response.status}).`)
  }
  return parseCampaign(JSON.parse(await readLevelResponse(response, () => {})))
}

/**
 * The campaign file names the one thing the facility's levels cannot say: the
 * facility area where a new game starts. The rest is read from the levels
 * (`resolveCampaign` in facility.ts): the areas the robot can reach through
 * bulkheads, level doors and exits, the wings among them, the dispatch door to
 * the final course, and where each exit leads.
 */
export interface CampaignFile { version: 3; start: string }
/** A wing: a facility area with level doors, and the courses behind them in the order its wiring opens them. */
export interface CampaignWing { level: string; courses: string[] }
/**
 * The facility's structure, as its levels lay it out. A new game starts in
 * `start`. `areas` are the facility areas the robot can reach from there,
 * nearest first. Every one of them with level doors, other than the dispatch
 * door, is a wing, open while a bulkhead into it is. The dispatch door leads to
 * the final course, released once the evaluation is complete. `chained` maps
 * each course reached through another course's exit to the course behind the
 * level door its chain begins at.
 */
export interface Campaign {
  start: string; areas: string[]; wings: CampaignWing[]
  finalCourse?: string; dispatch?: { area: string; door: string }
  chained: Record<string, string>
}

export type DoorState = 'locked' | 'open' | 'passed'
export interface WingProgress {
  id: string; open: boolean; passed: number
  doors: { course: string; state: DoorState }[]
}
/** Which wings, wing courses and dispatch door the facility's wiring opens; see `campaignWiring` in facility.ts. */
export interface CampaignWiring { wing: (wing: CampaignWing) => boolean; door: (course: string) => boolean; dispatch?: () => boolean }
/**
 * `complete` is the evaluation: every wing course passed. `released` is the
 * dispatch door: open by its wiring, or, with no dispatch door, once complete.
 */
export interface FacilityProgress { wings: WingProgress[]; required: number; passed: number; complete: boolean; released: boolean }

export function parseCampaign(value: unknown): CampaignFile {
  const fail = (): never => { throw new Error('This file is not a valid campaign.') }
  const object = (v: unknown): Record<string, unknown> => v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : fail()
  const id = (v: unknown): string => typeof v === 'string' && v.length > 0 && v.length <= 100 ? v : fail()
  const v = object(value)
  // Earlier versions listed the opening, the concourse and the escape route, which the levels now say.
  if (v.version === 1 || v.version === 2 || ['wings', 'finalCourse', 'opening', 'concourse', 'escape'].some(key => v[key] !== undefined))
    throw new Error('The campaign now names only where a new game starts: { "version": 3, "start": "<facility area ID>" }. Mark the dispatch door and set where each exit leads in the level studio.')
  if (v.version !== 3) throw new Error('Unsupported campaign version. This game reads version 3.')
  return { version: 3, start: id(v.start) }
}

/** A wing goes by its facility area's name, so renaming the level renames the wing. */
export function wingName(wing: CampaignWing, levels: ReadonlyMap<string, JumpLevel>) {
  const level = levels.get(wing.level)
  return level && isHubLevel(level) ? level.name : wing.level
}

/**
 * Structural problems with the campaign against the collection it names: the
 * start, where each level door, bulkhead and exit leads and arrives, one way
 * into each course, one dispatch door, no exits that lead round in a loop, and
 * a way into and back out of every facility area.
 */
export function campaignProblems(campaign: Campaign, levels: readonly JumpLevel[]): string[] {
  const issues: string[] = [], byId = new Map(levels.map(level => [level.id, level]))
  const name = (id: string) => byId.has(id) ? `“${byId.get(id)!.name}”` : `“${id}”`
  const hub = (id?: string) => { const level = id === undefined ? undefined : byId.get(id); return level && isHubLevel(level) ? level : undefined }
  const doorIn = (area: HubLevel, id: string) => [...area.courseDoors, ...area.bulkheads].some(door => door.id === id)
  if (!byId.has(campaign.start)) issues.push(`The level for the start, ${name(campaign.start)}, is not in the collection.`)
  else if (!hub(campaign.start)) issues.push(`The level for the start, ${name(campaign.start)}, is not a facility area.`)
  const timed = (id: string, where: string) => {
    const level = byId.get(id)
    if (!level) issues.push(`${where} leads to ${name(id)}, which is not in the collection.`)
    else if (!isPuzzleLevel(level) || level.timing === 'untimed') issues.push(`${where} leads to ${name(id)}, which is not a timed course.`)
  }
  // Each course has one way in: one level door, or one exit that leads to it.
  const roles = new Map<string, string>()
  const claim = (course: string, role: string) => {
    if (roles.has(course)) issues.push(`${name(course)} is reached from ${roles.get(course)} and from ${role}. Give each course one way in.`)
    else roles.set(course, role)
  }
  const dispatch: string[] = []
  for (const id of campaign.areas) {
    const area = hub(id)!
    for (const door of area.courseDoors) if (door.course) {
      timed(door.course, `Level door “${door.id}” in ${name(id)}`)
      claim(door.course, `a level door in ${name(id)}`)
      if (door.dispatch) dispatch.push(name(id))
    }
  }
  if (dispatch.length > 1) issues.push(`The facility has ${dispatch.length} dispatch doors, in ${dispatch.join(' and ')}. Mark one.`)
  for (const level of byId.values()) {
    if (isHubLevel(level)) {
      for (const bulkhead of level.bulkheads) if (bulkhead.to) {
        const target = hub(bulkhead.to)
        if (!target) issues.push(`Bulkhead “${bulkhead.id}” in ${name(level.id)} leads to ${name(bulkhead.to)}, which ${byId.has(bulkhead.to) ? 'is not a facility area' : 'is not in the collection'}.`)
        else if (bulkhead.arrivesAt !== undefined && !doorIn(target, bulkhead.arrivesAt)) issues.push(`Bulkhead “${bulkhead.id}” in ${name(level.id)} arrives at a door that is not in ${name(target.id)}.`)
      }
      continue
    }
    const to = exitDestination(level)
    if (!to) continue
    const target = byId.get(to.level), where = `The exit of ${name(level.id)}`
    if (!target) issues.push(`${where} leads to ${name(to.level)}, which is not in the collection.`)
    else if (to.level === level.id) issues.push(`${where} leads back into itself.`)
    else if (isHubLevel(target)) {
      if (to.arrival !== undefined && !doorIn(target, to.arrival)) issues.push(`${where} arrives at a door that is not in ${name(target.id)}.`)
    } else {
      if (to.arrival !== undefined) issues.push(`${where} arrives at a door in ${name(target.id)}, but a course is entered only at its start.`)
      claim(to.level, `the exit of ${name(level.id)}`)
    }
  }
  // Exits that lead from course to course must end somewhere.
  for (const level of byId.values()) {
    const seen = [level.id]
    for (let next = exitDestination(level)?.level; next && byId.has(next) && !hub(next); next = exitDestination(byId.get(next)!)?.level) {
      if (seen.includes(next)) { if (next === level.id && seen.length > 1 && seen.every(id => id >= level.id)) issues.push(`The exits of ${seen.map(name).join(', ')} lead round in a loop.`); break }
      seen.push(next)
    }
  }
  // Every facility area is reachable from the start, and the robot can get back from it.
  const graph = new Map<string, Set<string>>()
  const edge = (from: string, to: string) => { let set = graph.get(from); if (!set) graph.set(from, set = new Set()); set.add(to) }
  for (const level of byId.values()) {
    if (isHubLevel(level)) {
      for (const bulkhead of level.bulkheads) if (hub(bulkhead.to)) edge(level.id, bulkhead.to)
      // A course leads back where it came from, or on through its exits to another area.
      for (const door of level.courseDoors) for (let course = byId.get(door.course), seen = 0; course && !isHubLevel(course) && seen < 20; seen++) {
        const next = exitDestination(course)?.level
        if (next && hub(next)) edge(level.id, next)
        course = next ? byId.get(next) : undefined
      }
    }
  }
  const reach = (from: string) => { const seen = new Set([from]); for (const id of seen) for (const next of graph.get(id) ?? []) seen.add(next); return seen }
  if (hub(campaign.start)) {
    const reached = reach(campaign.start)
    for (const level of byId.values()) if (isHubLevel(level) && !reached.has(level.id)) issues.push(`The robot can never reach ${name(level.id)} from the start.`)
    for (const id of reached) if (id !== campaign.start && !reach(id).has(campaign.start)) issues.push(`The robot cannot get back from ${name(id)} to the start. Give it a bulkhead toward the rest of the facility.`)
  }
  return issues
}

/** Where a plain exit door leads when its run passes. Overlook, walk-off and bus exits never lead on. */
export const exitDestination = (level: JumpLevel): Destination | undefined =>
  isPuzzleLevel(level) && level.goal && !level.goal.kind ? level.goal.leadsTo : undefined

/**
 * Doors, bulkheads and the evaluation board all read this one result, derived
 * from saved passes and the facility's wiring (`campaignWiring`): a wing is
 * open while the concourse lets the robot in, and a wing door while its area's
 * wiring opens it, such as the door before it being passed. A passed door
 * stays passed, and open.
 */
export function facilityProgress(campaign: Campaign, passed: (course: string) => boolean, wiring: CampaignWiring = { wing: () => true, door: () => true }): FacilityProgress {
  let total = 0, done = 0
  const wings = campaign.wings.map((wing): WingProgress => {
    const open = wiring.wing(wing)
    const doors = wing.courses.map(course => ({ course, state: (passed(course) ? 'passed' : open && wiring.door(course) ? 'open' : 'locked') as DoorState }))
    const count = doors.filter(door => door.state === 'passed').length
    total += doors.length; done += count
    return { id: wing.level, open, passed: count, doors }
  })
  const complete = total > 0 && done === total
  return { wings, required: total, passed: done, complete, released: wiring.dispatch ? wiring.dispatch() : complete }
}

/** Whether a direct link may start this course: its wing is open and its door is not locked. */
export const courseAvailable = (progress: FacilityProgress, course: string) =>
  progress.wings.some(wing => wing.open && wing.doors.some(door => door.course === course && door.state !== 'locked'))
