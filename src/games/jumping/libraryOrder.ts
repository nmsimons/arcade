// The level library in the order the facility plays it: each facility area as a heading, the wings in the order the
// concourse opens them, each wing's courses in the order its doors open, a course an exit leads into straight after
// the course before it, then the dispatch door's final course and its route on. Levels the campaign never reaches
// come last, as they are listed.
import type { Campaign } from './campaign.ts'
import { exitDestination } from './campaign.ts'
import { isHubLevel } from './level.ts'
import type { JumpLevel } from './level.ts'

/**
 * One run of the library under a heading. `area` is a facility area with no level doors of its own (such as the
 * start), `wing` a facility area with level doors (`order` counts wings from 1, in the order they open), `dispatch`
 * the final course behind the dispatch door in `hub`'s area, and `outside` everything the campaign does not reach.
 */
export interface LibrarySection<T> {
  kind: 'area' | 'wing' | 'dispatch' | 'outside'
  hub?: T
  order?: number
  entries: T[]
}

/**
 * The library's sections. `levelOf` reads an entry's level (none for a file that could not be read). Without a
 * campaign that fits the collection, every course is one `outside` section in the listed order, and facility areas
 * are left out, as they cannot be played on their own.
 */
export function librarySections<T>(entries: readonly T[], levelOf: (entry: T) => JumpLevel | undefined, campaign: Campaign | null): LibrarySection<T>[] {
  const byId = new Map<string, T>()
  for (const entry of entries) { const level = levelOf(entry); if (level && !byId.has(level.id)) byId.set(level.id, entry) }
  const isHub = (entry: T) => { const level = levelOf(entry); return !!level && isHubLevel(level) }
  if (!campaign || !byId.has(campaign.start)) return [{ kind: 'outside', entries: entries.filter(entry => !isHub(entry)) }]
  const used = new Set<T>()
  const take = (id: string | undefined) => {
    const entry = id === undefined ? undefined : byId.get(id)
    if (!entry || used.has(entry)) return undefined
    used.add(entry)
    return entry
  }
  /** A course, then each course its exits lead on to, until a facility area, a missing level or one already listed. */
  const route = (id: string) => {
    const listed: T[] = []
    for (let next: string | undefined = id; next !== undefined; ) {
      const entry = byId.get(next), level = entry && levelOf(entry)
      if (!entry || !level || isHubLevel(level) || used.has(entry)) break
      listed.push(take(next)!)
      next = exitDestination(level)?.level
    }
    return listed
  }
  const wings = new Set(campaign.wings.map(wing => wing.level))
  const sections: LibrarySection<T>[] = []
  for (const id of campaign.areas) if (!wings.has(id)) {
    const hub = take(id)
    if (hub) sections.push({ kind: 'area', hub, entries: [] })
  }
  campaign.wings.forEach((wing, index) => {
    const hub = take(wing.level)
    sections.push({ kind: 'wing', hub, order: index + 1, entries: wing.courses.flatMap(route) })
  })
  if (campaign.finalCourse) {
    const final = route(campaign.finalCourse)
    if (final.length) sections.push({ kind: 'dispatch', hub: campaign.dispatch && byId.get(campaign.dispatch.area), entries: final })
  }
  // Facility areas the robot can never reach still head their own sections, so they can be found and mended.
  for (const entry of entries) if (isHub(entry) && !used.has(entry)) { used.add(entry); sections.push({ kind: 'area', hub: entry, entries: [] }) }
  const outside = entries.filter(entry => !used.has(entry))
  if (outside.length) sections.push({ kind: 'outside', entries: outside })
  return sections
}
