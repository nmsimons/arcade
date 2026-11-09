import { isHubLevel, isPuzzleLevel } from './level.ts'
import type { JumpLevel } from './level.ts'
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
 * The campaign file names only what the facility's areas cannot say: the
 * opening, where a new game wakes; the concourse; and the escape route after
 * the final course. Wings, their courses and the final course are read from
 * the concourse's bulkheads and level doors (`resolveCampaign` in facility.ts).
 */
export interface CampaignFile { version: 2; opening: string; concourse: string; escape: string[] }
/** A wing: an area off the concourse with level doors, and the courses behind them in the order its wiring opens them. */
export interface CampaignWing { level: string; courses: string[] }
/**
 * The facility's structure, as its areas lay it out. A new game wakes in the
 * opening, whose bulkhead leads onto the concourse. Every area the concourse's
 * bulkheads open onto that has level doors is a wing, open while a bulkhead to
 * it is. The concourse's level door is the dispatch door to the final course;
 * passing it leads through the escape levels.
 */
export interface Campaign { opening: string; concourse: string; wings: CampaignWing[]; finalCourse?: string; escape: string[] }

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
  const ids = (v: unknown, max: number): string[] => Array.isArray(v) && v.length <= max ? v.map(id) : fail()
  const v = object(value)
  // Version 1 listed the wings, their courses and the final course, which the facility's areas already say.
  if (v.version === 1 || v.wings !== undefined || v.finalCourse !== undefined) throw new Error('Wings, their courses and the final course now come from the concourse’s bulkheads and level doors. Keep only opening, concourse and escape, as version 2.')
  if (v.version !== 2) throw new Error('Unsupported campaign version. This game reads version 2.')
  return { version: 2, opening: id(v.opening), concourse: id(v.concourse), escape: v.escape === undefined ? [] : ids(v.escape, 10) }
}

/** A wing goes by its facility area's name, so renaming the level renames the wing. */
export function wingName(wing: CampaignWing, levels: ReadonlyMap<string, JumpLevel>) {
  const level = levels.get(wing.level)
  return level && isHubLevel(level) ? level.name : wing.level
}

/** Structural problems with the campaign against the collection it names. */
export function campaignProblems(campaign: Campaign, levels: readonly JumpLevel[]): string[] {
  const issues: string[] = [], byId = new Map(levels.map(level => [level.id, level]))
  const name = (id: string) => byId.has(id) ? `“${byId.get(id)!.name}”` : `“${id}”`
  const hub = (id?: string) => { const level = id === undefined ? undefined : byId.get(id); return level && isHubLevel(level) ? level : undefined }
  const wingTitle = (wing: CampaignWing) => `“${wingName(wing, byId)}”`
  for (const [label, id] of [['opening', campaign.opening], ['concourse', campaign.concourse]]) {
    if (!byId.has(id)) issues.push(`The level for the ${label}, ${name(id)}, is not in the collection.`)
    else if (!hub(id)) issues.push(`The level for the ${label}, ${name(id)}, is not a facility area.`)
  }
  if (campaign.opening === campaign.concourse) issues.push('The opening and the concourse need to be different facility areas.')
  // Each course has one role: one wing's course, the final course or an escape level.
  const roles = new Map<string, string>()
  const timed = (id: string, where: string) => {
    const level = byId.get(id)
    if (!level) issues.push(`${where} leads to ${name(id)}, which is not in the collection.`)
    else if (!isPuzzleLevel(level) || level.timing === 'untimed') issues.push(`${where} leads to ${name(id)}, which is not a timed course.`)
  }
  for (const wing of campaign.wings) {
    const area = hub(wing.level)
    for (const course of wing.courses) {
      const doors = area?.courseDoors.filter(door => door.course === course) ?? []
      if (doors.length > 1) issues.push(`The wing ${wingTitle(wing)} has ${doors.length} doors to ${name(course)}. Give each course one door.`)
      timed(course, `Level door “${doors[0]?.id ?? course}” in the wing ${wingTitle(wing)}`)
      if (roles.has(course)) issues.push(`${name(course)} has doors in ${roles.get(course)} and in the wing ${wingTitle(wing)}.`)
      else roles.set(course, `the wing ${wingTitle(wing)}`)
    }
    if (area && !area.bulkheads.some(bulkhead => bulkhead.to === campaign.concourse)) issues.push(`The wing ${wingTitle(wing)} needs a bulkhead back to the concourse.`)
  }
  const concourse = hub(campaign.concourse), opening = hub(campaign.opening)
  if (concourse) {
    // The concourse's only level door is the dispatch door to the final course.
    const doors = concourse.courseDoors.filter(door => door.course)
    if (doors.length > 1) issues.push(`The concourse has ${doors.length} level doors. Courses belong in wings; the concourse holds only the dispatch door.`)
    if (campaign.finalCourse !== undefined) {
      timed(campaign.finalCourse, 'The dispatch door')
      if (roles.has(campaign.finalCourse)) issues.push(`The dispatch door leads to ${name(campaign.finalCourse)}, which has a door in ${roles.get(campaign.finalCourse)}.`)
      else roles.set(campaign.finalCourse, 'the concourse, as the final course')
    }
    if (opening && !concourse.bulkheads.some(bulkhead => bulkhead.to === opening.id)) issues.push(`The concourse needs a bulkhead to the opening, ${name(campaign.opening)}.`)
  }
  if (opening) {
    if (opening.courseDoors.length) issues.push('The opening has level doors. Courses belong in wings.')
    if (concourse && !opening.bulkheads.some(bulkhead => bulkhead.to === concourse.id)) issues.push(`The opening, ${name(campaign.opening)}, needs a bulkhead to the concourse.`)
  }
  for (const id of campaign.escape) {
    if (!byId.has(id)) issues.push(`The escape level ${name(id)} is not in the collection.`)
    else if (roles.get(id) === 'the escape route') issues.push(`The escape route lists ${name(id)} twice.`)
    else if (roles.has(id)) issues.push(`The escape level ${name(id)} already has a door in ${roles.get(id)}.`)
    else if (hub(id)) issues.push(`The escape level ${name(id)} is a facility area.`)
    else roles.set(id, 'the escape route')
  }
  // Every facility area in the collection, in the campaign or not, leads only to other facility areas.
  const area = (id: string) => { const wing = campaign.wings.find(wing => wing.level === id)
    return id === campaign.opening ? 'the opening' : id === campaign.concourse ? 'the concourse' : wing ? `the wing ${wingTitle(wing)}` : name(id) }
  for (const level of byId.values()) if (isHubLevel(level)) for (const bulkhead of level.bulkheads) {
    if (bulkhead.to && !hub(bulkhead.to)) issues.push(`Bulkhead “${bulkhead.id}” in ${area(level.id)} leads to ${name(bulkhead.to)}, which ${byId.has(bulkhead.to) ? 'is not a facility area' : 'is not in the collection'}.`)
  }
  return issues
}

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
