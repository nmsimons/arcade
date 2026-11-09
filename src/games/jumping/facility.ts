import type { Campaign, CampaignFile, CampaignWing, FacilityProgress } from './campaign.ts'
import { courseAvailable, wingName } from './campaign.ts'
import { BEST_TIME_KEY, formatTime } from './challenge.ts'
import { COMPLETION_KEY } from './completion.ts'
import { gradeFor, gradeTimes } from './grading.ts'
import type { Grade } from './grading.ts'
import { AREA_STATE_KEY, readAreaState } from './areaState.ts'
import type { AreaState } from './areaState.ts'
import { facilityProgress } from './campaign.ts'
import { passedLevel } from './progression.ts'
import { isHubLevel, isPuzzleLevel } from './level.ts'
import type { HubLevel, JumpLevel, PuzzleLevel } from './level.ts'
import { areaComplete, coursePassed } from './hub.ts'
import type { Bulkhead, CourseDoor, CourseGrade, FacilityRecords, HubDoor } from './hub.ts'
import { resolveSwitchStates } from './switchPower.ts'
import { triggerStartsOn } from './toggleGroups.ts'

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

/** Every saved value of a L.A.B. game: course records, the robot's place and the places it left. Restarting erases them all. */
export const GAME_KEYS = [BEST_TIME_KEY, COMPLETION_KEY, FACILITY_KEY, AREA_STATE_KEY] as const
/** A new game has no saved place and no course records; anything else can be continued or restarted. */
export function savedGameExists(storage: Pick<Storage, 'getItem'>) {
  if (readFacilitySave(storage).place) return true
  return [BEST_TIME_KEY, COMPLETION_KEY].some(key => {
    try { const value: unknown = JSON.parse(storage.getItem(key) ?? '{}'); return !!value && typeof value === 'object' && Object.keys(value).length > 0 }
    catch { return false }
  })
}

type Levels = ReadonlyMap<string, JumpLevel>
const hubLevel = (levels: Levels, id?: string) => { const level = id === undefined ? undefined : levels.get(id); return level && isHubLevel(level) ? level : undefined }
/** The progress of the wing whose level this is; none for the opening, the concourse and areas outside the campaign. */
const areaWing = (campaign: Campaign, progress: FacilityProgress, id: string) => {
  const index = campaign.wings.findIndex(wing => wing.level === id)
  return index < 0 ? undefined : progress.wings[index]
}
/** A wing's area is open while the concourse's wiring lets the robot in; every other facility area is always open. */
const areaOpen = (campaign: Campaign, progress: FacilityProgress, id: string) => areaWing(campaign, progress, id)?.open ?? true

/**
 * A new save wakes at the opening's entrance. A player who already passed a
 * course before the facility opened, but has no place saved, starts at the
 * concourse with those doors passed. Afterward the robot resumes where it was
 * autosaved, or at the concourse's entrance if a build has since closed or
 * removed that place.
 */
export function facilityStart(campaign: Campaign, progress: FacilityProgress, save: FacilitySave, levels: Levels): FacilityPlace {
  const place = save.place, concourse = hubLevel(levels, campaign.concourse)
  if (!place) return { kind: 'hub', level: progress.passed > 0 && concourse ? concourse.id : campaign.opening, arrival: { kind: 'entrance' } }
  const hub = place.kind === 'hub' ? hubLevel(levels, place.level) : undefined
  if (place.kind === 'hub' && hub && areaOpen(campaign, progress, hub.id)) {
    const door = place.arrival.kind === 'door' ? place.arrival.id : undefined
    return { kind: 'hub', level: hub.id, arrival: door && [...hub.courseDoors, ...hub.bulkheads].some(d => d.id === door) ? place.arrival : { kind: 'entrance' } }
  }
  if (place.kind === 'escape' && progress.released && campaign.escape[place.index] === place.level && levels.has(place.level)) return place
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
 * Which doors open, what is lettered above them and what their placards read.
 * Every door is lettered with where it leads, the dispatch door DISPATCH. A
 * level door's placard is a screen of its level's data, never its name: the D
 * deadline until passed, then the best time and grade. The evaluation board
 * shows each wing's passes, or SEALED. A locked door's placard is dark.
 */
export function hubPresentation(campaign: Campaign, progress: FacilityProgress, level: HubLevel, levels: Levels, best: (course: string) => number | null, completed: (course: string) => boolean = () => false) {
  // A switched door or bulkhead opens while the area's wiring is on (`run.hub.switched`); every other one is set here.
  const open = new Set<string>(), switched = new Set<string>(), placards = new Map<string, string[]>(), signs = new Map<string, string>()
  const grade = courseGrades(levels, best, completed)
  for (const board of level.evaluationBoards) placards.set(board.id, evaluationLines(campaign, progress, levels))
  for (const door of level.courseDoors) {
    const course = levels.get(door.course), passed = coursePassed(grade(door.course))
    if (!course || !isPuzzleLevel(course)) { placards.set(door.id, []); continue }
    // The door's own wiring opens it, and a passed course's door stays open. Its placard is dark while it is shut.
    if (door.power === 'switched' && !passed) switched.add(door.id); else open.add(door.id)
    if (door.course === campaign.finalCourse) { signs.set(door.id, 'DISPATCH'); placards.set(door.id, [progress.released ? 'UNIT RELEASED' : 'SEALED']); continue }
    signs.set(door.id, course.name.toUpperCase())
    placards.set(door.id, courseScreen(course, best(door.course), passed))
  }
  for (const bulkhead of level.bulkheads) {
    const target = hubLevel(levels, bulkhead.to)
    if (!target) continue
    signs.set(bulkhead.id, target.name.toUpperCase())
    // A switched bulkhead opens by its wiring; any other is always open.
    if (bulkhead.power === 'switched') switched.add(bulkhead.id)
    else open.add(bulkhead.id)
  }
  return { open, placards, signs, switched }
}
/** A level door's placard: its course's data, since the name is lettered above the door. */
function courseScreen(course: PuzzleLevel, time: number | null, passed: boolean) {
  if (course.timing === 'untimed') return [passed ? 'COMPLETE' : 'UNTIMED']
  const deadline = `D ${formatTime(gradeTimes(course).d).replace(/\.00$/, '')}`
  if (time === null) return ['NO RECORD', deadline]
  return passed ? [`BEST ${formatTime(time)}`, `GRADE ${gradeFor(time, course)}`] : [`BEST ${formatTime(time)} F`, deadline]
}

/**
 * The name the facility gives a door: the dispatch door is Dispatch, any other
 * level door the level it leads to, and a bulkhead the area beyond it. A door's
 * own saved `name` is never shown in the facility.
 */
export function facilityDoorName(levels: Levels, campaign: Campaign | null) {
  return (door: CourseDoor | Bulkhead): string | undefined => 'course' in door
    ? campaign?.finalCourse && door.course === campaign.finalCourse ? 'Dispatch' : door.course ? levels.get(door.course)?.name : undefined
    : door.to ? levels.get(door.to)?.name : undefined
}
/**
 * What a facility area's lettering, placards and evaluation boards read, for
 * the studio's canvas and playtests: as the facility shows them with
 * `progress`, or a new save's when it is left out. Without a campaign that fits
 * the collection, each door is lettered with where it leads and its placard
 * shows a new save's data. A door with no destination yet reads NO LEVEL or NOWHERE.
 */
export function studioPresentation(level: HubLevel, levels: Levels, campaign: Campaign | null, progress?: FacilityProgress, best: (course: string) => number | null = () => null, completed: (course: string) => boolean = () => false) {
  const fits = !!campaign && levels.has(campaign.opening)
  // A new save: nothing passed, with the wiring as authored, so a sealed wing reads SEALED.
  const fresh = () => facilityProgress(campaign!, () => false, campaignWiring(campaign!, levels, facilityRecords(levels, () => null, () => false)))
  const shown = fits ? hubPresentation(campaign!, progress ?? fresh(), level, levels, best, completed) : null
  const name = facilityDoorName(levels, fits ? campaign : null), placards = new Map<string, string[]>(), signs = new Map<string, string>()
  for (const door of level.courseDoors) {
    const course = levels.get(door.course)
    signs.set(door.id, !door.course ? 'NO LEVEL' : shown?.signs.get(door.id) ?? (name(door) ?? door.course).toUpperCase())
    placards.set(door.id, shown?.placards.get(door.id) ?? (course && isPuzzleLevel(course) ? courseScreen(course, best(door.course), false) : []))
  }
  for (const bulkhead of level.bulkheads) signs.set(bulkhead.id, !bulkhead.to ? 'NOWHERE' : shown?.signs.get(bulkhead.id) ?? (name(bulkhead) ?? bulkhead.to).toUpperCase())
  for (const board of level.evaluationBoards) placards.set(board.id, shown?.placards.get(board.id) ?? ['EVALUATION'])
  return { placards, signs }
}
/** Best grades from course records: a timed course's best time as a letter, and an A for a completed untimed level. */
export function courseGrades(levels: Levels, best: (course: string) => number | null, completed: (course: string) => boolean): CourseGrade {
  return course => {
    const level = levels.get(course)
    if (!level || !isPuzzleLevel(level)) return null
    if (level.timing === 'untimed') return completed(course) ? 'A' : null
    const time = best(course)
    return time === null ? null : gradeFor(time, level)
  }
}
/** The best grades of the courses behind an area's level doors, for their switches and grade averages. */
export function hubGrades(level: HubLevel, grade: CourseGrade) {
  return new Map(level.courseDoors.flatMap(door => { const value = grade(door.course); return value ? [[door.course, value] as const] : [] }))
}
/** What switches read from the save: best grades from course records, and which areas are complete. */
export function facilityRecords(levels: Levels, best: (course: string) => number | null, completed: (course: string) => boolean): FacilityRecords {
  const grade = courseGrades(levels, best, completed)
  return { grade, complete: area => { const level = hubLevel(levels, area); return !!level && areaComplete(level, grade) } }
}
/** The areas beyond an area's bulkheads that are complete, for their switches. */
export const hubCompleteAreas = (level: HubLevel, records: FacilityRecords) => new Set(level.bulkheads.flatMap(bulkhead => bulkhead.to && records.complete(bulkhead.to) ? [bulkhead.to] : []))
/**
 * The doors and bulkheads of a facility area that are open: every unswitched
 * one, each switched one whose wiring is on, and every level door whose course
 * is passed. The wiring reads the save (`records`) and the area's switches as
 * the robot last left them, or as authored.
 */
export function wiredDoorsOpen(level: HubLevel, records: FacilityRecords, saved?: Pick<AreaState, 'triggers' | 'floats'> | null): Set<string> {
  const triggers = level.triggers.map((trigger, i) => ({ active: saved?.triggers[i]?.active ?? triggerStartsOn(level, trigger) }))
  const floats = (level.floatSwitches ?? []).map((float, i) => {
    const raised = saved?.floats[i] ?? !!float.startsRaised
    return { active: float.activeWhen === 'lowered' ? !raised : raised }
  })
  const states = resolveSwitchStates(level, triggers, floats, records)
  return new Set([...level.courseDoors, ...level.bulkheads].filter(door => door.power !== 'switched' || states.get(door.id)
    || 'course' in door && coursePassed(records.grade(door.course))).map(door => door.id))
}
type SavedSwitches = (level: HubLevel) => Pick<AreaState, 'triggers' | 'floats'> | null
/**
 * What the facility's wiring opens, for doors, placards, direct links and the
 * level library. A wing is open while a bulkhead to it on the concourse is
 * open, and a wing course while its door in the wing's area is. A course with
 * no door there stays closed.
 */
export function campaignWiring(campaign: Campaign, levels: Levels, records: FacilityRecords, saved: SavedSwitches = () => null) {
  const open = new Map<string, Set<string>>()
  const area = (level: HubLevel) => { let doors = open.get(level.id); if (!doors) open.set(level.id, doors = wiredDoorsOpen(level, records, saved(level))); return doors }
  const concourse = hubLevel(levels, campaign.concourse)
  const dispatch = campaign.finalCourse === undefined ? undefined : concourse?.courseDoors.find(door => door.course === campaign.finalCourse)
  return {
    wing: (wing: CampaignWing) => !!concourse && concourse.bulkheads.some(bulkhead => bulkhead.to === wing.level && area(concourse).has(bulkhead.id)),
    door: (course: string) => {
      const hub = hubLevel(levels, campaign.wings.find(wing => wing.courses.includes(course))?.level)
      const door = hub?.courseDoors.find(door => door.course === course)
      return !!hub && !!door && area(hub).has(door.id)
    },
    // The dispatch door is a door like any other: open always, or by its wiring.
    ...(dispatch ? { dispatch: () => area(concourse!).has(dispatch.id) } : {}),
  }
}
type Rounds = Map<string, Map<string, number>>
const allSwitchesOn = (level: HubLevel): Pick<AreaState, 'triggers' | 'floats'> => ({
  triggers: level.triggers.map(() => ({ held: 0, pressed: false, active: true, depression: 0 })),
  floats: (level.floatSwitches ?? []).map(float => float.activeWhen !== 'lowered') })
/**
 * When the wiring first opens each door and bulkhead, playing on from a new
 * save as if every course the robot reaches were passed: by area, then by door,
 * the round it opens in. Each round the robot walks from the opening through
 * every open bulkhead and passes the course behind every open level door.
 * Plates and float switches count both as they start and all on, so a door a
 * plate opens counts. A door that never opens has no round.
 */
function wiringRounds(campaign: Pick<Campaign, 'opening'>, levels: Levels): Rounds {
  const rounds: Rounds = new Map(), passed = new Set<string>()
  for (let round = 0, changed = true; changed; round++) {
    changed = false
    const done = new Set(passed), grade: CourseGrade = course => done.has(course) ? 'A' : null
    const records: FacilityRecords = { grade, complete: area => { const level = hubLevel(levels, area); return !!level && areaComplete(level, grade) } }
    const queue = [campaign.opening], reached = new Set(queue)
    for (const id of queue) {
      const area = hubLevel(levels, id)
      if (!area) continue
      const open = new Set([...wiredDoorsOpen(area, records), ...wiredDoorsOpen(area, records, allSwitchesOn(area))])
      let known = rounds.get(id)
      if (!known) rounds.set(id, known = new Map())
      for (const door of [...area.courseDoors, ...area.bulkheads]) {
        if (!open.has(door.id)) continue
        if (!known.has(door.id)) { known.set(door.id, round); changed = true }
        if ('course' in door) { if (door.course) passed.add(door.course) }
        else if (door.to && !reached.has(door.to)) { reached.add(door.to); queue.push(door.to) }
      }
    }
  }
  return rounds
}
const resolved = new WeakMap<Levels, WeakMap<CampaignFile, Campaign>>()
/**
 * The campaign as the facility's areas lay it out. Every area the concourse's
 * bulkheads open onto that has level doors is a wing, with the courses behind
 * its doors, and the concourse's level door is the dispatch door to the final
 * course. Wings and courses are listed in the order the wiring opens them from
 * a new save, left to right where it opens them together.
 */
export function resolveCampaign(file: CampaignFile, levels: Levels): Campaign {
  let byFile = resolved.get(levels)
  if (!byFile) resolved.set(levels, byFile = new WeakMap())
  const cached = byFile.get(file)
  if (cached) return cached
  const concourse = hubLevel(levels, file.concourse), wings: CampaignWing[] = []
  for (const bulkhead of concourse?.bulkheads ?? []) {
    const area = hubLevel(levels, bulkhead.to)
    if (!area || area.id === file.opening || area.id === file.concourse || wings.some(wing => wing.level === area.id)) continue
    const courses = [...new Set(area.courseDoors.flatMap(door => door.course ? [door.course] : []))]
    if (courses.length) wings.push({ level: area.id, courses })
  }
  const finalCourse = concourse?.courseDoors.find(door => door.course)?.course
  const rounds = wiringRounds(file, levels)
  // The first of these doors to open: by its round, never last, then left to right and top to bottom.
  const compare = (a: number[], b: number[]) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2]
  const first = (area: string, doors: readonly (CourseDoor | Bulkhead)[]) =>
    doors.map(door => [rounds.get(area)?.get(door.id) ?? Infinity, door.x, door.y]).sort(compare)[0]
  const ways = (wing: CampaignWing) => first(file.concourse, concourse!.bulkheads.filter(bulkhead => bulkhead.to === wing.level))
  wings.sort((a, b) => compare(ways(a), ways(b)))
  for (const wing of wings) {
    const area = hubLevel(levels, wing.level)!, doors = (course: string) => first(area.id, area.courseDoors.filter(door => door.course === course))
    wing.courses.sort((a, b) => compare(doors(a), doors(b)))
  }
  const campaign: Campaign = { opening: file.opening, concourse: file.concourse, wings, ...(finalCourse ? { finalCourse } : {}), escape: file.escape }
  byFile.set(file, campaign)
  return campaign
}
/**
 * Wings, doors and bulkheads in the campaign's areas that the wiring can never
 * open, playing on from a new save as if every course the robot reaches were
 * passed (`wiringRounds`).
 */
export function campaignWiringProblems(campaign: Campaign, levels: Levels): string[] {
  const rounds = wiringRounds(campaign, levels), opens = (area: string, id: string) => rounds.get(area)?.has(id) ?? false
  const concourse = hubLevel(levels, campaign.concourse), problems: string[] = [], sealed = new Set<string>()
  for (const wing of campaign.wings) if (!concourse?.bulkheads.some(bulkhead => bulkhead.to === wing.level && opens(concourse.id, bulkhead.id))) {
    sealed.add(wing.level)
    problems.push(`The wing “${wingName(wing, levels)}” can never open: its bulkhead on the concourse waits on wings or courses that are only behind it.`)
  }
  // Every other door and bulkhead in the opening, the concourse and the wings opens sooner or later.
  const waits = 'its wiring waits on courses that are only behind it.'
  for (const id of new Set([campaign.opening, campaign.concourse, ...campaign.wings.map(wing => wing.level).filter(id => !sealed.has(id))])) {
    const area = hubLevel(levels, id)
    if (!area) continue
    for (const door of area.courseDoors) if (door.course && !opens(id, door.id)) problems.push(id === campaign.concourse && door.course === campaign.finalCourse
      ? `The dispatch door can never open: ${waits}` : `The door to “${levels.get(door.course)?.name ?? door.course}” in “${area.name}” can never open: ${waits}`)
    for (const bulkhead of area.bulkheads) if (bulkhead.to && !opens(id, bulkhead.id) && !(id === campaign.concourse && sealed.has(bulkhead.to)))
      problems.push(`The bulkhead to “${levels.get(bulkhead.to)?.name ?? bulkhead.to}” in “${area.name}” can never open: ${waits}`)
  }
  return problems
}
/**
 * The facility's progress from course records, kept or for this visit only, and
 * the areas' wiring with their switches as saved in `areas`.
 */
export function savedProgress(campaign: Campaign, levels: Levels, best: (course: string) => number | null, completed: (course: string) => boolean, areas: Pick<Storage, 'getItem'>) {
  const passed = (id: string) => { const level = levels.get(id); return !!level && passedLevel(level, best(id), completed(id)) }
  return facilityProgress(campaign, passed, campaignWiring(campaign, levels, facilityRecords(levels, best, completed), hub => readAreaState(areas, hub)))
}

/**
 * The evaluation board: the total, then UNIT RELEASED FOR DISPATCH once the
 * dispatch door opens, then each wing, by its level's name, with its passes,
 * or SEALED while the robot cannot get in.
 */
export function evaluationLines(campaign: Campaign, progress: FacilityProgress, levels: Levels) {
  const heading = [progress.complete ? 'EVALUATION COMPLETE' : `EVALUATION ${progress.passed} / ${progress.required}`, ...progress.released ? ['UNIT RELEASED FOR DISPATCH'] : []]
  return [...heading, ...progress.wings.map((wing, i) => `${wingName(campaign.wings[i], levels).toUpperCase()} ${wing.open ? `${wing.passed}/${wing.doors.length}` : 'SEALED'}`)]
}

/** A course on the start screen's progress list. A locked course stays dark, as its door's placard does. */
export type CourseRecord =
  | { state: 'locked' }
  | { state: 'open' | 'passed'; id: string; name: string; best: number | null; grade: Grade | null; deadline: number | null }
export interface WingRecord { id: string; name: string; open: boolean; passed: number; courses: CourseRecord[] }
/** The start screen's progress: each wing in campaign order, with its courses' records once it is open. */
export function progressRecords(campaign: Campaign, progress: FacilityProgress, levels: Levels, best: (course: string) => number | null): WingRecord[] {
  return progress.wings.map((wing, i) => ({
    id: wing.id, name: wingName(campaign.wings[i], levels), open: wing.open, passed: wing.passed,
    courses: wing.doors.map((door): CourseRecord => {
      const course = levels.get(door.course)
      if (!wing.open || door.state === 'locked' || !course || !isPuzzleLevel(course)) return { state: 'locked' }
      const timed = course.timing !== 'untimed', time = timed ? best(door.course) : null
      return { state: door.state, id: door.course, name: course.name, best: time,
        grade: time === null ? null : gradeFor(time, course), deadline: timed ? gradeTimes(course).d : null }
    }),
  }))
}

/** Leaving the final course or the escape route returns the robot to the dispatch door. */
export const dispatchPlace = (campaign: Campaign, levels: Levels) => concourseAt(campaign, levels, campaign.finalCourse)

/**
 * Whether a direct link may start this level. A wing's course opens with its
 * door; the final course and the escape levels once the evaluation is complete;
 * a course outside the campaign always. Facility areas are walked into, never
 * linked.
 */
export function linkOpen(campaign: Campaign, progress: FacilityProgress, levels: Levels, id: string) {
  const level = levels.get(id)
  if (!level || isHubLevel(level)) return false
  if (id === campaign.finalCourse || campaign.escape.includes(id)) return progress.released
  if (campaign.wings.some(wing => wing.courses.includes(id))) return courseAvailable(progress, id)
  return true
}

/**
 * The place a course played from a direct link belongs to: the door that leads
 * to it, so finishing or leaving returns the robot there, or the escape route.
 * None for a course with no door.
 */
export function linkedPlace(campaign: Campaign, levels: Levels, id: string): FacilityPlace | null {
  const escape = campaign.escape.indexOf(id)
  if (escape >= 0) return { kind: 'escape', level: id, index: escape }
  const wing = campaign.wings.find(wing => wing.courses.includes(id))
  const homes = [wing?.level, id === campaign.finalCourse ? campaign.concourse : undefined]
  for (const home of [...homes, ...levels.keys()]) {
    const hub = hubLevel(levels, home), door = hub?.courseDoors.find(door => door.course === id)
    if (hub && door) return { kind: 'course', level: id, hub: hub.id, door: door.id }
  }
  return null
}
