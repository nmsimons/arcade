import { isHubLevel, isPuzzleLevel } from './level.ts'
import type { JumpLevel } from './level.ts'
import { readLevelResponse } from './levelLimits.ts'
import { passedLevel } from './progression.ts'

/** Like the levels, the campaign is a public asset fetched afresh, never bundled. */
export async function loadCampaign(base: string, fetchFile: typeof fetch = fetch): Promise<Campaign> {
  const response = await fetchFile(`${base.replace(/\/?$/, '/')}levels/jumping-campaign.json`, { cache: 'no-store' })
  if (!response.ok) {
    await response.body?.cancel().catch(() => {})
    throw new Error(`Could not load the campaign (HTTP ${response.status}).`)
  }
  return parseCampaign(JSON.parse(await readLevelResponse(response, () => {})))
}

/**
 * Courses that must be passed before a wing opens: the listed courses plus
 * every course of the listed wings. `count` defaults to all of them.
 */
export interface Clearance { courses: string[]; wings: string[]; count?: number }
export interface CampaignWing { id: string; name: string; level?: string; courses: string[]; clearance: Clearance | null }
/**
 * The facility's structure, kept apart from level geometry. A new game plays
 * the opening level, then the introduction's levels in order; finishing them
 * opens the concourse. Every wing opens off the concourse, with it or once its
 * clearance is met. When every wing course is passed, the concourse's dispatch
 * door opens onto the final course; passing it leads through the escape levels.
 */
export interface Campaign {
  version: 1; opening: string; introduction: string[]; concourse?: string; wings: CampaignWing[]
  finalCourse?: string; escape: string[]
}

export type DoorState = 'locked' | 'open' | 'passed'
export interface WingProgress {
  id: string; open: boolean; passed: number
  doors: { course: string; state: DoorState }[]
  clearance?: { passed: number; count: number }
}
export interface FacilityProgress {
  started: boolean; introduction: boolean[]; concourseOpen: boolean
  wings: WingProgress[]; required: number; passed: number; complete: boolean
}

export function parseCampaign(value: unknown): Campaign {
  const fail = (): never => { throw new Error('This file is not a valid campaign.') }
  const object = (v: unknown): Record<string, unknown> => v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : fail()
  const id = (v: unknown): string => typeof v === 'string' && v.length > 0 && v.length <= 100 ? v : fail()
  const ids = (v: unknown, max: number): string[] => Array.isArray(v) && v.length <= max ? v.map(id) : fail()
  const v = object(value)
  if (v.version !== 1) throw new Error('Unsupported campaign version. This game reads version 1.')
  if (!Array.isArray(v.wings) || !v.wings.length || v.wings.length > 20) fail()
  const wings = (v.wings as unknown[]).map(item => {
    const w = object(item)
    if (typeof w.id !== 'string' || !/^[a-z][a-z0-9-]{0,39}$/.test(w.id)) fail()
    if (typeof w.name !== 'string' || !w.name.trim() || w.name.length > 40) fail()
    const courses = ids(w.courses, 100)
    if (!courses.length) fail()
    let clearance: Clearance | null = null
    if (w.clearance !== null && w.clearance !== undefined) {
      const c = object(w.clearance)
      clearance = { courses: c.courses === undefined ? [] : ids(c.courses, 200), wings: c.wings === undefined ? [] : ids(c.wings, 20) }
      if (!clearance.courses.length && !clearance.wings.length) fail()
      if (c.count !== undefined) clearance.count = typeof c.count === 'number' && Number.isInteger(c.count) && c.count >= 1 ? c.count : fail()
    }
    return { id: w.id as string, name: w.name as string, ...(w.level === undefined ? {} : { level: id(w.level) }), courses, clearance }
  })
  return { version: 1, opening: id(v.opening), introduction: v.introduction === undefined ? [] : ids(v.introduction, 20),
    ...(v.concourse === undefined ? {} : { concourse: id(v.concourse) }), wings,
    ...(v.finalCourse === undefined ? {} : { finalCourse: id(v.finalCourse) }), escape: v.escape === undefined ? [] : ids(v.escape, 10) }
}

/** The distinct campaign courses a clearance counts, in campaign order. */
export function clearanceCourses(campaign: Campaign, clearance: Clearance) {
  const named = new Set(clearance.courses)
  for (const wing of campaign.wings) if (clearance.wings.includes(wing.id)) for (const course of wing.courses) named.add(course)
  return campaign.wings.flatMap(wing => wing.courses).filter(course => named.delete(course))
}
const clearanceCount = (campaign: Campaign, clearance: Clearance) => clearance.count ?? clearanceCourses(campaign, clearance).length

/** Structural problems with the campaign against the collection it names. */
export function campaignProblems(campaign: Campaign, levels: readonly JumpLevel[]): string[] {
  const issues: string[] = [], byId = new Map(levels.map(level => [level.id, level]))
  const name = (id: string) => byId.has(id) ? `“${byId.get(id)!.name}”` : `“${id}”`
  if (!byId.has(campaign.opening)) issues.push(`The opening level ${name(campaign.opening)} is not in the collection.`)
  // Each level has one role: the opening, an introduction level, one wing's course, the final course or an escape level.
  const roles = new Map<string, string>([[campaign.opening, 'the opening']])
  for (const id of campaign.introduction) {
    const level = byId.get(id)
    if (!level) issues.push(`The introduction level ${name(id)} is not in the collection.`)
    else if (!isPuzzleLevel(level)) issues.push(`The introduction level ${name(id)} has no exit to lead onward.`)
    if (roles.get(id) === 'an introduction level') issues.push(`The introduction lists ${name(id)} twice.`)
    else if (roles.has(id)) issues.push(`${name(id)} is listed as ${roles.get(id)} and in the introduction.`)
    else roles.set(id, 'an introduction level')
  }
  const wingIds = new Set<string>()
  for (const wing of campaign.wings) {
    if (wingIds.has(wing.id)) issues.push(`Two wings use the ID “${wing.id}”.`)
    wingIds.add(wing.id)
    for (const course of wing.courses) {
      const level = byId.get(course)
      if (!level) issues.push(`The ${wing.name} wing lists ${name(course)}, which is not in the collection.`)
      else if (!isPuzzleLevel(level) || level.timing === 'untimed') issues.push(`The ${wing.name} wing lists ${name(course)}, which is not a timed course.`)
      if (roles.has(course)) issues.push(`${name(course)} is listed as ${roles.get(course)} and in the ${wing.name} wing.`)
      else roles.set(course, `a ${wing.name} course`)
    }
  }
  if (campaign.finalCourse !== undefined) {
    const level = byId.get(campaign.finalCourse)
    if (!level) issues.push(`The final course ${name(campaign.finalCourse)} is not in the collection.`)
    else if (!isPuzzleLevel(level) || level.timing === 'untimed') issues.push(`The final course ${name(campaign.finalCourse)} is not a timed course.`)
    if (roles.has(campaign.finalCourse)) issues.push(`The final course ${name(campaign.finalCourse)} is already listed as ${roles.get(campaign.finalCourse)}.`)
    else roles.set(campaign.finalCourse, 'the final course')
  }
  for (const id of campaign.escape) {
    if (!byId.has(id)) issues.push(`The escape level ${name(id)} is not in the collection.`)
    else if (roles.get(id) === 'an escape level') issues.push(`The escape route lists ${name(id)} twice.`)
    else if (roles.has(id)) issues.push(`The escape level ${name(id)} is already listed as ${roles.get(id)}.`)
    else roles.set(id, 'an escape level')
  }
  const hubs: [string, string | undefined][] = [['concourse', campaign.concourse], ...campaign.wings.map((wing): [string, string | undefined] => [`${wing.name} wing`, wing.level])]
  for (const [label, id] of hubs) {
    if (id === undefined) continue
    if (!byId.has(id)) issues.push(`The ${label} level ${name(id)} is not in the collection.`)
    else if (roles.has(id)) issues.push(`The ${label} level ${name(id)} is already listed as ${roles.get(id)}.`)
    else if (!isHubLevel(byId.get(id)!)) issues.push(`The ${label} level ${name(id)} is not a hub level.`)
  }
  // Doors and bulkheads are checked once their hub levels exist.
  const hub = (id?: string) => { const level = id === undefined ? undefined : byId.get(id); return level && isHubLevel(level) ? level : undefined }
  const concourse = hub(campaign.concourse)
  if (concourse) {
    // The concourse holds a door to the opening and to each introduction level,
    // so they can be replayed, and the dispatch door to the final course.
    const allowed = [campaign.opening, ...campaign.introduction, ...campaign.finalCourse ? [campaign.finalCourse] : []]
    for (const id of allowed) {
      const doors = concourse.courseDoors.filter(door => door.course === id).length
      if (doors !== 1) issues.push(`The concourse needs one ${id === campaign.finalCourse ? 'dispatch door to the final course' : `door to ${name(id)}`}.`)
    }
    if (concourse.courseDoors.some(door => !allowed.includes(door.course))) issues.push('The concourse has course doors. Courses belong in wings; the concourse holds only the opening, introduction and dispatch doors.')
  }
  for (const wing of campaign.wings) {
    const level = hub(wing.level)
    if (!level) continue
    for (const course of wing.courses) {
      const doors = level.courseDoors.filter(door => door.course === course).length
      if (doors !== 1) issues.push(`The ${wing.name} wing level has ${doors || 'no'} door${doors > 1 ? 's' : ''} for ${name(course)}. Give each course one door.`)
    }
    for (const door of level.courseDoors) if (!wing.courses.includes(door.course)) issues.push(`Course door “${door.id}” in the ${wing.name} wing leads to ${name(door.course)}, which is not one of that wing's courses.`)
    if (!level.bulkheads.some(bulkhead => bulkhead.to === 'concourse')) issues.push(`The ${wing.name} wing level needs a bulkhead to the concourse.`)
    // Arriving through a bulkhead places the robot at the matching bulkhead on the far side.
    if (concourse && !concourse.bulkheads.some(bulkhead => bulkhead.to === wing.id)) issues.push(`The concourse needs a bulkhead to the ${wing.name} wing.`)
  }
  for (const [label, id] of hubs) for (const bulkhead of hub(id)?.bulkheads ?? []) {
    if (bulkhead.to !== 'concourse' && !wingIds.has(bulkhead.to)) issues.push(`Bulkhead “${bulkhead.id}” in the ${label} leads to an unknown wing, “${bulkhead.to}”.`)
  }
  for (const wing of campaign.wings) {
    const clearance = wing.clearance
    if (!clearance) continue
    for (const id of clearance.wings) {
      if (id === wing.id) issues.push(`The ${wing.name} wing's clearance cannot depend on its own courses.`)
      else if (!wingIds.has(id)) issues.push(`The ${wing.name} wing's clearance names an unknown wing, “${id}”.`)
    }
    for (const course of clearance.courses) {
      if (wing.courses.includes(course)) issues.push(`The ${wing.name} wing's clearance cannot depend on its own course ${name(course)}.`)
      else if (!campaign.wings.some(w => w.courses.includes(course))) issues.push(`The ${wing.name} wing's clearance names ${name(course)}, which is not a wing course.`)
    }
    const available = clearanceCourses(campaign, clearance).length
    if (clearance.count !== undefined && clearance.count > available) issues.push(`The ${wing.name} wing's clearance needs ${clearance.count} courses but names only ${available}.`)
  }
  // Open wings as if every course in an open wing were passed. Any wing left
  // closed waits on courses that only it, or another closed wing, can provide.
  const open = new Set<string>()
  const reachable = (course: string) => campaign.wings.some(wing => open.has(wing.id) && wing.courses.includes(course))
  const ready = ({ clearance }: CampaignWing) => !clearance || clearanceCourses(campaign, clearance).filter(reachable).length >= clearanceCount(campaign, clearance)
  for (let changed = true; changed;) {
    changed = false
    for (const wing of campaign.wings) if (!open.has(wing.id) && ready(wing)) { open.add(wing.id); changed = true }
  }
  for (const wing of campaign.wings) if (!open.has(wing.id)) issues.push(`The ${wing.name} wing can never open: its clearance needs courses that are only behind it.`)
  return issues
}

/**
 * Introduction levels play untimed in the facility, so a completion passes
 * them; everything else uses the ordinary pass rule.
 */
export function facilityPassed(campaign: Campaign, level: JumpLevel, best: number | null, completed: boolean) {
  return campaign.introduction.includes(level.id) ? completed || passedLevel(level, best, completed) : passedLevel(level, best, completed)
}

/**
 * Doors, bulkheads and the evaluation board all read this one result, derived
 * from saved passes. Within a wing, a door opens once the door before it is
 * passed, so a pass carried over from the level grid still opens the next door.
 */
export function facilityProgress(campaign: Campaign, passed: (course: string) => boolean): FacilityProgress {
  const started = passed(campaign.opening), introduction = campaign.introduction.map(passed)
  const concourseOpen = started && introduction.every(Boolean)
  let total = 0, done = 0
  const wings = campaign.wings.map((wing): WingProgress => {
    let clearance: WingProgress['clearance']
    if (wing.clearance) {
      const count = clearanceCount(campaign, wing.clearance)
      clearance = { passed: Math.min(count, clearanceCourses(campaign, wing.clearance).filter(passed).length), count }
    }
    const open = concourseOpen && (!clearance || clearance.passed >= clearance.count)
    const doors = wing.courses.map((course, i) => ({ course, state: (passed(course) ? 'passed' : open && (i === 0 || passed(wing.courses[i - 1])) ? 'open' : 'locked') as DoorState }))
    const count = doors.filter(door => door.state === 'passed').length
    total += doors.length; done += count
    return { id: wing.id, open, passed: count, doors, ...(clearance ? { clearance } : {}) }
  })
  return { started, introduction, concourseOpen, wings, required: total, passed: done, complete: total > 0 && done === total }
}

/** Whether a direct link may start this course: its wing is open and its door is not locked. */
export const courseAvailable = (progress: FacilityProgress, course: string) =>
  progress.wings.some(wing => wing.open && wing.doors.some(door => door.course === course && door.state !== 'locked'))
