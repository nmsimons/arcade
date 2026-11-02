import { isPuzzleLevel } from './level.ts'
import type { JumpLevel } from './level.ts'

/**
 * Courses that must be passed before a wing opens: the listed courses plus
 * every course of the listed wings. `count` defaults to all of them.
 */
export interface Clearance { courses: string[]; wings: string[]; count?: number }
export interface CampaignWing { id: string; name: string; level?: string; courses: string[]; clearance: Clearance | null }
/**
 * The facility's structure, kept apart from level geometry. The first wing
 * opens once the opening level is passed, and passing all of its courses opens
 * the concourse. Every other wing opens off the concourse when its clearance is
 * met; a wing without clearance opens with the concourse.
 */
export interface Campaign { version: 1; opening: string; concourse?: string; wings: CampaignWing[] }

export type DoorState = 'locked' | 'open' | 'passed'
export interface WingProgress {
  id: string; open: boolean; passed: number
  doors: { course: string; state: DoorState }[]
  clearance?: { passed: number; count: number }
}
export interface FacilityProgress { concourseOpen: boolean; wings: WingProgress[]; required: number; passed: number; complete: boolean }

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
  return { version: 1, opening: id(v.opening), ...(v.concourse === undefined ? {} : { concourse: id(v.concourse) }), wings }
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
  const wingIds = new Set<string>(), owners = new Map<string, string>()
  for (const wing of campaign.wings) {
    if (wingIds.has(wing.id)) issues.push(`Two wings use the ID “${wing.id}”.`)
    wingIds.add(wing.id)
    for (const course of wing.courses) {
      const level = byId.get(course)
      if (!level) issues.push(`The ${wing.name} wing lists ${name(course)}, which is not in the collection.`)
      else if (!isPuzzleLevel(level) || level.timing === 'untimed') issues.push(`The ${wing.name} wing lists ${name(course)}, which is not a timed course.`)
      if (course === campaign.opening) issues.push(`The opening level cannot also be a course in the ${wing.name} wing.`)
      if (owners.has(course)) issues.push(`${name(course)} appears in both the ${owners.get(course)} and ${wing.name} wings.`)
      else owners.set(course, wing.name)
    }
  }
  const hubs: [string, string | undefined][] = [['concourse', campaign.concourse], ...campaign.wings.map((wing): [string, string | undefined] => [`${wing.name} wing`, wing.level])]
  for (const [label, id] of hubs) {
    if (id === undefined) continue
    if (!byId.has(id)) issues.push(`The ${label} level ${name(id)} is not in the collection.`)
    else if (owners.has(id) || id === campaign.opening) issues.push(`The ${label} level ${name(id)} is already used as a course or the opening.`)
  }
  const [entry, ...rest] = campaign.wings
  if (entry.clearance) issues.push(`The ${entry.name} wing opens after the opening level, so it cannot have a clearance.`)
  for (const wing of rest) {
    const clearance = wing.clearance
    if (!clearance) continue
    for (const id of clearance.wings) {
      if (id === wing.id) issues.push(`The ${wing.name} wing's clearance cannot depend on its own courses.`)
      else if (!wingIds.has(id)) issues.push(`The ${wing.name} wing's clearance names an unknown wing, “${id}”.`)
    }
    for (const course of clearance.courses) {
      if (wing.courses.includes(course)) issues.push(`The ${wing.name} wing's clearance cannot depend on its own course ${name(course)}.`)
      else if (!owners.has(course)) issues.push(`The ${wing.name} wing's clearance names ${name(course)}, which is not a campaign course.`)
    }
    const available = clearanceCourses(campaign, clearance).length
    if (clearance.count !== undefined && clearance.count > available) issues.push(`The ${wing.name} wing's clearance needs ${clearance.count} courses but names only ${available}.`)
  }
  // Open wings as if every course in an open wing were passed. Any wing left
  // closed waits on courses that only it, or another closed wing, can provide.
  const open = new Set([entry.id])
  const reachable = (course: string) => campaign.wings.some(wing => open.has(wing.id) && wing.courses.includes(course))
  const ready = ({ clearance }: CampaignWing) => !clearance || clearanceCourses(campaign, clearance).filter(reachable).length >= clearanceCount(campaign, clearance)
  for (let changed = true; changed;) {
    changed = false
    for (const wing of rest) if (!open.has(wing.id) && ready(wing)) { open.add(wing.id); changed = true }
  }
  for (const wing of rest) if (!open.has(wing.id)) issues.push(`The ${wing.name} wing can never open: its clearance needs courses that are only behind it.`)
  return issues
}

/**
 * Doors, bulkheads and the evaluation board all read this one result, derived
 * from saved passes. Within a wing, a door opens once the door before it is
 * passed, so a pass carried over from the level grid still opens the next door.
 */
export function facilityProgress(campaign: Campaign, passed: (course: string) => boolean): FacilityProgress {
  const [entry] = campaign.wings, started = passed(campaign.opening)
  const concourseOpen = started && entry.courses.every(passed)
  let total = 0, done = 0
  const wings = campaign.wings.map((wing, index): WingProgress => {
    let clearance: WingProgress['clearance']
    if (wing.clearance) {
      const count = clearanceCount(campaign, wing.clearance)
      clearance = { passed: Math.min(count, clearanceCourses(campaign, wing.clearance).filter(passed).length), count }
    }
    const open = index === 0 ? started : concourseOpen && (!clearance || clearance.passed >= clearance.count)
    const doors = wing.courses.map((course, i) => ({ course, state: (passed(course) ? 'passed' : open && (i === 0 || passed(wing.courses[i - 1])) ? 'open' : 'locked') as DoorState }))
    const count = doors.filter(door => door.state === 'passed').length
    total += doors.length; done += count
    return { id: wing.id, open, passed: count, doors, ...(clearance ? { clearance } : {}) }
  })
  return { concourseOpen, wings, required: total, passed: done, complete: total > 0 && done === total }
}

/** Whether a direct link may start this course: its wing is open and its door is not locked. */
export const courseAvailable = (progress: FacilityProgress, course: string) =>
  progress.wings.some(wing => wing.open && wing.doors.some(door => door.course === course && door.state !== 'locked'))
