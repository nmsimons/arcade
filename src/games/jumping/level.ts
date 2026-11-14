import { parseObjectName } from './objectNames.ts'
import { MAX_LEVEL_WIDTH } from './levelLimits.ts'
import { gradeTimes } from './grading.ts'
import type { TimeTargets } from './grading.ts'
import { objectReference } from './objectLabels.ts'
import type { NamedObject } from './objectNames.ts'
import { createPlayer } from './model.ts'
import type { Checkpoint, LevelRules, Platform } from './model.ts'
import { createRope, fitTiedRope, tiedRopeSpan } from './climbables.ts'
import { prepareRope } from './ropeLayout.ts'
import type { ClimbableWorld, RopeAnchor, RopeEnd } from './climbables.ts'
import { groundAt, platformSurfaces } from './terrain.ts'
import { advanceFootwork } from './footwork.ts'
import { canGrip } from './friction.ts'
import { nearestBoundary, polygonIntersects, validPolygon } from './geometry.ts'
import { MAX_CURVE_POINTS, terrainCurveOutline } from './terrainCurves.ts'
import { chargingBayBounds, entranceFits, goalBounds, goalDoor, goalPoleX, ROBOT_BAY_WIDTH_SCALE } from './goal.ts'
import { MAX_SWITCH_TARGETS, parseSwitchSettings, parseWallWiring, removeSwitchTarget, switchWiringProblems, validSwitchTargetId } from './switchPower.ts'
import type { PlateBehavior, PowerMode, SwitchSettings, WallWiringSettings } from './switchPower.ts'
import type { Destination, Entrance, Goal } from './goal.ts'
import { GRADE_GATE_HEIGHT, GRADE_GATE_WIDTH, GRADE_LETTERS, MAX_BULKHEADS, MAX_COURSE_DOORS, MAX_EVALUATION_BOARDS, MAX_GRADE_GATES, gradeGateBounds, hubDoorFits } from './hub.ts'
import type { Bulkhead, CourseDoor, EvaluationBoard, GradeGate, GradeLetter } from './hub.ts'
import { WALL_TIMER_WIDTH, WALL_TIMER_HEIGHT } from './wallTimer.ts'
import type { WallTimer } from './wallTimer.ts'
import type { WallText } from './wallText.ts'
import { MAX_WALL_DOORS, WALL_DOOR_CONDITIONS, wallDoorBounds } from './wallDoor.ts'
import type { WallDoor, WallDoorCondition } from './wallDoor.ts'
import { wallTextBounds } from './wallText.ts'
import { pickupBounds } from './pickups.ts'
import type { Pickup } from './pickups.ts'
import { DIGITAL_DISPLAY_WIDTH, DIGITAL_DISPLAY_HEIGHT } from './digitalDisplay.ts'
import { COIN_SWITCH_THICKNESS, COIN_SWITCH_MIN_LENGTH, coinSwitchBounds } from './coins.ts'
import type { CoinSwitchOrientation } from './coins.ts'
import { MECHANISM_THICKNESS, prepareMechanism } from './mechanisms.ts'
import { isTerrainMaterial } from './terrainMaterials.ts'
import { isGroundCover } from './terrainGroundCover.ts'
import type { TerrainMaterial } from './terrainMaterials.ts'
import { wallFinish } from './wallFinish.ts'
import type { WallFinish } from './wallFinish.ts'
import { lightingProblems, MAX_LIGHTS, parseLighting } from './lightingDefinition.ts'
import type { LightingDefinition } from './lightingDefinition.ts'
import { ROBOT_HALF_WIDTH } from './robotPhysics.ts'
import type { PressurePlateMount } from './pressurePlateMount.ts'
import { MAX_WALL_LIGHTS, WALL_LIGHT_RADIUS, wallLightBounds } from './wallLight.ts'
import type { WallLight } from './wallLight.ts'
import { MAX_LOGIC_RELAYS, LOGIC_RELAY_WIDTH, LOGIC_RELAY_HEIGHT, logicRelayBounds } from './logicRelay.ts'
import type { LogicRelay } from './logicRelay.ts'
import { MAX_FLOAT_SWITCHES, floatSwitchBounds } from './floatSwitch.ts'
import type { FloatSwitch } from './floatSwitch.ts'

import { MAX_GRAVITY_PLATES } from './gravity.ts'
import type { GravityPlate } from './gravity.ts'
import { waterControlId } from './waterLevel.ts'
import { MAX_FORCE_FIELDS, FORCE_FIELD_THICKNESS, FORCE_FIELD_MIN_LENGTH } from './forceField.ts'
import type { ForceField } from './forceField.ts'
import type { PropWeight } from './propWeight.ts'
import { parseEditorGroups } from './editorGroups.ts'
import type { EditorGroup } from './editorGroups.ts'
import { parseToggleGroups } from './toggleGroups.ts'
import type { ToggleGroup } from './toggleGroups.ts'
import { parseEnvironment } from './environment.ts'
import type { LevelEnvironment } from './environment.ts'

export const LEVEL_GRID_SIZE = 20

export interface PropDefinition extends NamedObject { kind: 'box' | 'ball'; x: number; y: number; size: number; weight?: PropWeight; branded?: boolean; gadget?: 'emp' | 'repulsor' }
export interface Mechanism extends NamedObject, SwitchSettings { id: string; kind: 'lift' | 'gate'; x: number; y: number; w: number; h: number; travel: number; orientation?: 'horizontal'; flipX?: boolean; power?: PowerMode }
/** Both legacy mode values accept the player and props; retained for file compatibility. */
type TriggerConnection = { targets: string[]; target?: never } | { target: string; targets?: never }
export type Trigger = NamedObject & WallWiringSettings & { x: number; y: number; w: number } & TriggerConnection
  & ({ mode: 'weight' | 'touch'; behavior?: PlateBehavior; startsOn?: boolean; toggleGroup?: string; mount?: PressurePlateMount; ceiling?: boolean } | { mode: 'coins'; threshold: number } & CoinSwitchOrientation)
/** Legacy single connections remain readable without rewriting existing files. */
export const triggerTargets = (trigger: Trigger): readonly string[] => trigger.targets ?? (trigger.target ? [trigger.target] : [])
export interface Pusher extends NamedObject { x: number; y: number; left: number; right: number; headlight?: boolean; kind?: 'repulsor'; mode?: 'emp'; chargingBay?: boolean }
export interface JumpLevel {
  version: 1 | 2; id: string; name: string; width: number; height?: number
  editorGroups?: EditorGroup[]
  toggleGroups?: ToggleGroup[]
  lighting?: LightingDefinition
  environment?: LevelEnvironment
  entrance: Entrance; checkpoints: Checkpoint[]; platforms: Platform[]
  /** Where re-entering this level from the facility starts: an ordinary doorway, usually near its exit. */
  timing?: 'untimed'
  climbables: { ladders: ClimbableWorld['ladders'][number][]; ropes: ClimbableWorld['ropes'][number][] }
  floor?: number; goal?: Goal
  floorMaterial?: TerrainMaterial
  /** The course wall's finish (wallFinish.ts); omitted for the ordinary course wall. Artwork only. */
  wallFinish?: Exclude<WallFinish, 'course'>
  times?: TimeTargets
  props?: PropDefinition[]; mechanisms?: Mechanism[]; triggers?: Trigger[]; robots?: Pusher[]
  timers?: WallTimer[]
  wallLights?: WallLight[]
  logicRelays?: LogicRelay[]
  floatSwitches?: FloatSwitch[]
  gravityPlates?: GravityPlate[]
  forceFields?: ForceField[]
  texts?: WallText[]
  /** Blocked and broken doors painted into the back wall. */
  wallDoors?: WallDoor[]
  /**
   * Charging pods that stand empty, drawn where they are: a facility area's own pod once the robot arrives
   * by a door, and the pods of robots that have left them (see `arrivalLevel`). Set as the robot arrives,
   * never read from a level file. Presentation only.
   */
  vacantPods?: { x: number; y: number; robot?: boolean }[]
  pickups?: Pickup[]
  kind?: 'hub'; courseDoors?: CourseDoor[]; bulkheads?: Bulkhead[]; evaluationBoards?: EvaluationBoard[]
  /** Studio-only nodes that switch on an average of this area's level door grades. */
  gradeGates?: GradeGate[]
}
export interface PuzzleLevel extends JumpLevel {
  height: number; floor: number; goal: Goal; times: TimeTargets
  props: PropDefinition[]; mechanisms: Mechanism[]; triggers: Trigger[]; robots: Pusher[]
}
export const isPuzzleLevel = (level: JumpLevel): level is PuzzleLevel => level.goal !== undefined && level.floor !== undefined && level.times !== undefined
/** A facility wing or concourse: untimed, with no exit, left only through its doors. */
export interface HubLevel extends JumpLevel {
  kind: 'hub'; timing: 'untimed'; height: number; floor: number; goal?: never; times?: never
  props: PropDefinition[]; mechanisms: Mechanism[]; triggers: Trigger[]; robots: Pusher[]
  courseDoors: CourseDoor[]; bulkheads: Bulkhead[]; evaluationBoards: EvaluationBoard[]
}
export const isHubLevel = (level: JumpLevel): level is HubLevel => level.kind === 'hub'
/** Levels that run as a complete world, with props, mechanisms and robots. */
export type RunLevel = PuzzleLevel | HubLevel
export const isRunLevel = (level: JumpLevel): level is RunLevel => isPuzzleLevel(level) || isHubLevel(level)
/** Legacy floor values are the bottom of the playable rectangle. */
export const levelHeight = (level: JumpLevel) => level.floor ?? level.height ?? 1020
/** Enclose the level; a walk-off finish continues its ground through the right boundary. */
export function levelTerrain(level: JumpLevel): Platform[] {
  const extent = 1e7, h = levelHeight(level)
  return [...level.platforms,
    { x: -extent, y: h, w: extent * 2, h: extent, ...(level.floorMaterial ? { material: level.floorMaterial } : {}) },
    { x: -extent, y: -extent, w: extent * 2, h: extent },
    { x: -extent, y: 0, w: extent, h },
    level.goal?.kind === 'walk-off' ? { x: level.width, y: level.goal.y, w: extent, h: extent }
      : { x: level.width, y: 0, w: extent, h }]
}
export const copyLevel = <T extends JumpLevel>(level: T): T => structuredClone(level)
export const newLevelId = () => globalThis.crypto.randomUUID()
export function newLevel(): JumpLevel {
  return { version: 1, id: newLevelId(), name: 'Untitled level', width: 3200, height: 1000, entrance: { x: 200, y: 1000 }, checkpoints: [],
    platforms: [], climbables: { ladders: [], ropes: [] } }
}
export function levelRules(level: JumpLevel): LevelRules {
  return { checkpoints: level.checkpoints, fallY: levelHeight(level) + 100 }
}
export function levelPlayer(level: JumpLevel, preview = false) {
  const p = createPlayer(level.entrance), terrain = levelTerrain(level), ground = groundAt(terrain, level.entrance.x, level.entrance.y, .1)
  const ropeSolids = ropeTerrain(level)
  p.ropes = level.climbables.ropes.map(r => createRope(preview ? r : prepareRope(r, ropeSolids)))
  Object.assign(p, { x: level.entrance.x, y: level.entrance.y, spawnX: level.entrance.x, spawnY: level.entrance.y,
    grounded: !!ground, groundAngle: ground?.angle ?? 0, jumpStart: level.entrance.y })
  p.terrain = terrain
  advanceFootwork(p, 0, p.x, terrain)
  return p
}
/** Always-on red beams support the initial rope path, just like fixed terrain. */
function ropeTerrain(level: JumpLevel) {
  return [...levelTerrain(level), ...(level.forceFields ?? []).filter(f => f.mode === 'objects' && f.power !== 'switched')
    .map(({ x, y, w, h }) => ({ x, y, w, h }))]
}
/** Saved geometry is also the editor preview and the first playable frame. */
export function prepareLevelRopes<T extends JumpLevel>(level: T, preview = false): T {
  // An anchor moved out of buried terrain attaches to the edge it now sits on.
  const onEdge = (x: number, y: number) => {
    const platform = level.platforms.findIndex(b => nearestBoundary(b, x, y).distance < .01)
    return platform >= 0 ? { platform, x: x - level.platforms[platform].x, y: y - level.platforms[platform].y } : null
  }
  const terrain = ropeTerrain(level), ropes = level.climbables.ropes.map(r => {
    let resolved = prepareRope(r, terrain, preview)
    if (resolved.end && r.end && (resolved.end.x !== r.end.x || resolved.end.y !== r.end.y)) {
      const anchor = onEdge(resolved.end.x, resolved.end.y)
      if (anchor) resolved = { ...resolved, end: { ...resolved.end, anchor } }
    }
    if (resolved.x !== r.x || resolved.y !== r.y) {
      const anchor = onEdge(resolved.x, resolved.y)
      if (anchor) return { ...resolved, anchor }
    }
    return resolved
  })
  return ropes.every((r, i) => r === level.climbables.ropes[i]) ? level : { ...level, climbables: { ...level.climbables, ropes } }
}
export function snapToGround(level: JumpLevel, x: number, y: number): Checkpoint {
  const surfaces = levelTerrain(level).filter(b => x >= b.x + 3 && x <= b.x + b.w - 3).flatMap(b => platformSurfaces(b, x)).filter(s => canGrip(s.angle) && s.y >= 62 && s.y <= levelHeight(level))
  surfaces.sort((a, b) => Math.abs(a.y - y) - Math.abs(b.y - y))
  return { x, y: surfaces[0]?.y ?? y }
}
export function spawnProblem(level: JumpLevel): string | null {
  if (!entranceFits(level.entrance, levelTerrain(level), level.width, levelHeight(level)))
    return `Place ${objectReference(level, 'entrance')} on a continuous flat surface, with a clear doorway inside the level.`
  return null
}
export function levelProblems(level: JumpLevel): string[] {
  const issues: string[] = [], spawn = spawnProblem(level)
  if (level.environment) try { parseEnvironment(level.environment, level.width, levelHeight(level)) } catch (error) { issues.push((error as Error).message) }
  if (!level.name.trim()) issues.push('Give the level a name.')
  if (spawn) issues.push(spawn)
  for (const [i, b] of level.platforms.entries()) if (b.y < 0 || b.x < 0 || b.x + b.w > level.width || b.y + b.h > levelHeight(level)) issues.push(`Keep ${objectReference(level, 'platform', i)} inside the level rectangle.`)
  for (const [i, t] of (level.texts ?? []).entries()) {
    const b = wallTextBounds(t)
    if (b.x < -.001 || b.y < -.001 || b.x + b.w > level.width + .001 || b.y + b.h > levelHeight(level) + .001) issues.push(`Keep ${objectReference(level, 'text', i)} inside the level rectangle.`)
  }
  for (const [i, door] of (level.wallDoors ?? []).entries()) {
    const b = wallDoorBounds(door)
    if (b.x < 0 || b.y < 0 || b.x + b.w > level.width || door.y > levelHeight(level)) issues.push(`Keep ${objectReference(level, 'wall-door', i)} inside the level rectangle.`)
  }
  for (const [i, light] of (level.wallLights ?? []).entries()) {
    const b = wallLightBounds(light)
    if (b.x < 0 || b.y < 0 || b.x + b.w > level.width || b.y + b.h > levelHeight(level)) issues.push(`Keep ${objectReference(level, 'wall-light', i)} inside the level rectangle.`)
  }
  for (const [i, relay] of (level.logicRelays ?? []).entries()) {
    const b = logicRelayBounds(relay)
    if (b.x < 0 || b.y < 0 || b.x + b.w > level.width || b.y + b.h > levelHeight(level)) issues.push(`Keep ${objectReference(level, 'logic-relay', i)} inside the level rectangle.`)
  }
  for (const [i, f] of (level.floatSwitches ?? []).entries()) {
    const b = floatSwitchBounds(f)
    if (b.x < 0 || b.y < 0 || b.x + b.w > level.width || b.y + b.h > levelHeight(level)) issues.push(`Keep ${objectReference(level, 'float-switch', i)} inside the level rectangle.`)
  }
  for (const [i, p] of (level.gravityPlates ?? []).entries()) {
    if (p.x < 0 || p.y < 0 || p.x + p.w > level.width || p.y + p.h > levelHeight(level)) issues.push(`Keep ${objectReference(level, 'gravity-plate', i)} inside the level rectangle.`)
  }
  for (const [i, field] of (level.forceFields ?? []).entries()) {
    if (field.x < 0 || field.y < 0 || field.x + field.w > level.width || field.y + field.h > levelHeight(level)) issues.push(`Keep ${objectReference(level, 'force-field', i)} inside the level rectangle.`)
  }
  if (isRunLevel(level)) {
    const terrain = levelTerrain(level)
    if (!isPuzzleLevel(level)) issues.push(...hubProblems(level, terrain))
    else if (level.goal.kind === 'walk-off') {
      const goal = level.goal, bounds = goalBounds(goal)
      const supported = Array.from({ length: 9 }, (_, i) => groundAt(terrain, level.width - 64 + i * 8, goal.y, .15))
      if (goal.x !== level.width || goal.y < 100 || goal.y > levelHeight(level)
        || supported.some(surface => !surface || Math.abs(surface.angle) >= .02)
        || terrain.some(b => polygonIntersects([[bounds.x, bounds.y], [goal.x, bounds.y], [goal.x, goal.y], [bounds.x, goal.y]], b))) {
        issues.push('Give the run-off finish clear headroom and continuous flat ground at the right edge.')
      }
    } else {
      const bounds = goalBounds(level.goal), door = level.goal.kind === 'overlook' ? bounds : goalDoor(level.goal)
      const left = level.goal.kind === 'bus' ? bounds.x : level.goal.kind === 'overlook' ? level.goal.x - 30 : Math.min(goalPoleX(level.goal) - 2, door.x)
      const right = level.goal.kind === 'bus' ? bounds.x + bounds.w : level.goal.kind === 'overlook' ? level.goal.x + 30 : Math.max(goalPoleX(level.goal) + 2, door.x + door.w)
      const count = Math.ceil((right - left) / 8)
      const supported = Array.from({ length: count + 1 }, (_, i) => left + (right - left) * i / count).every(x => {
        const support = groundAt(terrain, x, level.goal.y, .15)
        return support && Math.abs(support.angle) < .02
      })
      const clearance = level.goal.kind === 'bus' ? { ...bounds, h: level.goal.y - bounds.y } : door
      const blocked = terrain.some(b => polygonIntersects([[clearance.x, clearance.y], [clearance.x + clearance.w, clearance.y],
        [clearance.x + clearance.w, clearance.y + clearance.h], [clearance.x, clearance.y + clearance.h]], b))
      if (!supported || blocked || bounds.x < 0 || bounds.x + bounds.w > level.width || bounds.y < 0 || level.goal.y > levelHeight(level)) {
        issues.push(level.goal.kind === 'bus' ? 'Place the bus stop on continuous flat ground with a clear boarding approach inside the level.' : `Place the exit and indicator for ${objectReference(level, 'goal')} on a continuous flat surface, with a clear doorway inside the level.`)
      }
    }
    const times = isPuzzleLevel(level) && gradeTimes(level)
    if (times && !(times.a > 0 && times.a < times.b && times.b < times.c && times.c < times.d)) issues.push('Grade times must increase from A to B to C to D.')
    const coins = level.pickups?.filter(p => p.kind === 'coin').length ?? 0
    for (const [i, t] of level.triggers.entries()) {
      if (t.mode !== 'coins') continue
      if (t.threshold > coins) issues.push(`Add enough coins for ${objectReference(level, 'trigger', i)} to reach its threshold (${coins} available, ${t.threshold} required).`)
      const b = coinSwitchBounds(t)
      if (b.x < 0 || b.y < 0 || b.x + b.w > level.width || b.y + b.h > levelHeight(level)) issues.push(`Keep ${objectReference(level, 'trigger', i)} inside the level rectangle.`)
    }
    for (const [i, r] of level.robots.entries()) if (!groundAt(terrain, r.x, r.y, .2)) issues.push(`Place ${objectReference(level, 'robot', i)} on a terrain surface.`)
    for (const [i, r] of level.robots.entries()) if (r.chargingBay) {
      const b = chargingBayBounds(r, ROBOT_BAY_WIDTH_SCALE)
      if (b.x < 0 || b.y < 0 || b.x + b.w > level.width || b.y + b.h > level.floor) issues.push(`Keep the charging bay for ${objectReference(level, 'robot', i)} inside the level rectangle.`)
    }
    for (const [i, t] of (level.timers ?? []).entries()) if (t.x < 0 || t.y < 0 || t.x + WALL_TIMER_WIDTH > level.width || t.y + WALL_TIMER_HEIGHT > levelHeight(level)) issues.push(`Keep ${objectReference(level, 'timer', i)} inside the level rectangle.`)
    for (const [i, p] of (level.pickups ?? []).entries()) {
      const b = pickupBounds(p)
      if (b.x < 0 || b.y < 0 || b.x + b.w > level.width || b.y + b.h > levelHeight(level)) issues.push(`Keep ${objectReference(level, 'pickup', i)} inside the level rectangle.`)
    }
  }
  return [...issues, ...lightingProblems(level)]
}

/**
 * Hubs are the building between courses: untimed areas left only through
 * their doors. Timing equipment (coins, coin switches, clocks and time
 * pickups) stays in the courses; tools and EMP charges may appear in either.
 */
function hubProblems(level: HubLevel, terrain: Platform[]): string[] {
  const issues: string[] = [], height = levelHeight(level)
  for (const [i, door] of level.courseDoors.entries()) if (!hubDoorFits(door, terrain, level.width, height)) issues.push(`Place ${objectReference(level, 'course-door', i)} on a continuous flat surface, with a clear doorway inside the level.`)
  for (const [i, door] of level.bulkheads.entries()) if (!hubDoorFits(door, terrain, level.width, height)) issues.push(`Place ${objectReference(level, 'bulkhead', i)} on a continuous flat surface, with a clear doorway inside the level.`)
  const courses = new Set<string>()
  for (const [i, door] of level.courseDoors.entries()) {
    if (!door.course) issues.push(`Choose the level that ${objectReference(level, 'course-door', i)} leads to.`)
    else if (courses.has(door.course)) issues.push(`Two level doors lead to “${door.course}”. Give each level one door.`)
    courses.add(door.course)
  }
  for (const [i, door] of level.bulkheads.entries()) if (!door.to) issues.push(`Choose where ${objectReference(level, 'bulkhead', i)} leads.`)
  // The robot comes back out of another door or bulkhead in this area.
  const doorIds = new Set([...level.courseDoors, ...level.bulkheads].map(door => door.id))
  for (const [i, door] of level.courseDoors.entries()) if (door.returnsTo !== undefined && !doorIds.has(door.returnsTo))
    issues.push(`Choose where the robot comes back out after ${objectReference(level, 'course-door', i)}: the door it names is no longer in this area.`)
  const dispatch = level.courseDoors.filter(door => door.dispatch).length
  if (dispatch > 1) issues.push(`This area has ${dispatch} dispatch doors. Mark one.`)
  for (const [i, gate] of (level.gradeGates ?? []).entries()) {
    const b = gradeGateBounds(gate)
    if (b.x < 0 || b.y < 0 || b.x + b.w > level.width || b.y + b.h > height) issues.push(`Keep ${objectReference(level, 'grade-gate', i)} inside the level rectangle.`)
    if (!gate.doors.length) issues.push(`Choose the level doors that ${objectReference(level, 'grade-gate', i)} averages.`)
  }
  const equipment = [
    level.pickups?.some(p => p.kind === 'coin') && 'coins',
    level.triggers.some(t => t.mode === 'coins') && 'coin switches',
    level.timers?.length && 'wall clocks',
    level.pickups?.some(p => p.kind !== 'coin' && p.kind !== 'emp') && 'time pickups',
  ].filter(Boolean)
  if (equipment.length) issues.push(`Remove the ${equipment.length > 1 ? `${equipment.slice(0, -1).join(', ')} and ${equipment.at(-1)}` : equipment[0]}. Timing equipment stays in the courses.`)
  return issues
}

/** Imported files and browser storage both pass through the same bounded decoder. */
export function parseLevel(value: unknown): JumpLevel {
  const fail = (): never => { throw new Error('This file is not a valid jumping level.') }
  const object = (v: unknown): Record<string, unknown> => v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : fail()
  const num = (v: unknown, min: number, max: number): number => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max ? v : fail()
  const list = (v: unknown, max: number): unknown[] => Array.isArray(v) && v.length <= max ? v : fail()
  const objectName = (v: Record<string, unknown>): NamedObject => parseObjectName(v.name, fail)
  const point = (v: unknown): Checkpoint => { const p = object(v); return { ...objectName(p), x: num(p.x, 0, MAX_LEVEL_WIDTH), y: num(p.y, -2000, 6000),
    ...(p.radius === undefined ? {} : { radius: num(p.radius, 10, 1000) }) } }
  // A level or door ID that another file resolves; the campaign check confirms it exists.
  const reference = (v: unknown): string => typeof v === 'string' && v.length > 0 && v.length <= 100 ? v : fail()
  const destination = (v: unknown): Destination => {
    const d = object(v)
    return { level: reference(d.level), ...(d.arrival === undefined ? {} : { arrival: reference(d.arrival) }) }
  }
  const v = object(value)
  if (v.version !== 1 && v.version !== 2) throw new Error('Unsupported jumping level version. This game reads versions 1 and 2.')
  if (v.version === 1 && v.lighting !== undefined) throw new Error('Lighting requires a version 2 level file.')
  if (typeof v.name !== 'string' || !v.name.trim() || v.name.length > 80 || typeof v.id !== 'string' || v.id.length > 100) fail()
  const width = num(v.width, 800, MAX_LEVEL_WIDTH)
  const platforms = list(v.platforms, 160).map(item => {
    const b = object(item), platform: Platform = { ...objectName(b), x: num(b.x, 0, width), y: num(b.y, -2000, 6000), w: num(b.w, 10, width), h: num(b.h, 8, 6000) }
    if (platform.x + platform.w > width) fail()
    if (b.zIndex !== undefined) {
      platform.zIndex = num(b.zIndex, -10000, 10000)
      if (!Number.isInteger(platform.zIndex)) fail()
    }
    if (b.material !== undefined) {
      if (!isTerrainMaterial(b.material)) return fail()
      platform.material = b.material
    }
    if (b.groundCover !== undefined) {
      if (!isGroundCover(b.groundCover)) return fail()
      platform.groundCover = b.groundCover
    }
    if (b.profile !== undefined) {
      const profile = list(b.profile, 100).map(item => {
        if (!Array.isArray(item) || item.length !== 2) return fail()
        return [num(item[0], 0, platform.w), num(item[1], 0, platform.h)] as [number, number]
      })
      if (profile.length < 2 || profile[0][0] !== 0 || profile.at(-1)![0] !== platform.w
        || profile.some((p, i) => i > 0 && p[0] <= profile[i - 1][0])) fail()
      platform.profile = profile
    }
    if (b.polygon !== undefined) {
      if (b.profile !== undefined) fail()
      const points = list(b.polygon, 64).map(p => {
        if (!Array.isArray(p) || p.length !== 2) return fail()
        return [num(p[0], 0, platform.w), num(p[1], 0, platform.h)] as [number, number]
      })
      if (points.length < 3 || b.bezier === undefined && !validPolygon(points)) fail()
      platform.polygon = points
    }
    if (b.bezier !== undefined) {
      if (!platform.polygon || !Array.isArray(b.bezier) || b.bezier.length !== platform.polygon.length) fail()
      platform.bezier = list(b.bezier, 64).map((value, i) => {
        if (value === null) return null
        const handle = object(value), result: import('./terrainCurves.ts').TerrainBezier = {}
        for (const side of ['in', 'out'] as const) if (handle[side] !== undefined) {
          const p = handle[side]
          if (!Array.isArray(p) || p.length !== 2) return fail()
          const x = num(p[0], -platform.w, platform.w), y = num(p[1], -platform.h, platform.h), anchor = platform.polygon![i]
          if (anchor[0] + x < -1e-7 || anchor[0] + x > platform.w + 1e-7 || anchor[1] + y < -1e-7 || anchor[1] + y > platform.h + 1e-7) fail()
          result[side] = [x, y]
        }
        if (handle.mode !== undefined) {
          if (!['corner', 'smooth', 'symmetric'].includes(String(handle.mode))) fail()
          result.mode = handle.mode as 'corner' | 'smooth' | 'symmetric'
        }
        return result
      })
      try { if (!validPolygon(terrainCurveOutline(platform), MAX_CURVE_POINTS)) fail() } catch { fail() }
    }
    return platform
  })
  const climbables = object(v.climbables)
  const ladders = list(climbables.ladders, 40).map(item => {
    const b = object(item), platform = num(b.platform ?? -1, -1, Math.max(-1, platforms.length - 1)), side = num(b.side ?? 1, -1, 1)
    if (!Number.isInteger(platform) || Math.abs(side) !== 1 || platform >= 0 && (platforms[platform].profile || platforms[platform].polygon)) fail()
    const ladder = { ...objectName(b), x: num(b.x, 0, width), top: num(b.top, -2000, 6000), bottom: num(b.bottom, -2000, 6000), platform, side }
    const support = platforms[platform]
    if (ladder.bottom - ladder.top < 80 || support && (ladder.top !== support.y || Math.abs(ladder.x - (side === 1 ? support.x - 16 : support.x + support.w + 16)) > .1)) fail()
    return ladder
  })
  const ropes = list(climbables.ropes, 40).map(item => {
    // Keep saved eight-unit layouts readable when the live solver uses fewer
    // particles. Rope preparation rebuilds their cached geometry as needed.
    const r = object(item), segments = num(r.segments, 4, 250)
    if (!Number.isInteger(segments)) fail()
    const rope: ClimbableWorld['ropes'][number] = { ...objectName(r), x: num(r.x, 0, width), y: num(r.y, -2000, 6000), length: num(r.length, 80, 2000), segments }
    // An anchor on terrain is stored locally and must sit on the terrain's edge.
    const anchorOn = (value: unknown, point: { x: number; y: number; anchor?: RopeAnchor }) => {
      const a = object(value), platform = num(a.platform, 0, platforms.length - 1)
      if (!Number.isInteger(platform)) fail()
      const b = platforms[platform]
      point.anchor = { platform, x: num(a.x, 0, b.w), y: num(a.y, 0, b.h) }
      point.x = b.x + point.anchor.x; point.y = b.y + point.anchor.y
      if (nearestBoundary(b, point.x, point.y).distance > .01) fail()
    }
    if (r.anchor !== undefined) anchorOn(r.anchor, rope)
    if (r.end !== undefined) {
      // A tied rope's second anchor; the rope always reaches it, taut at the least.
      const e = object(r.end), end: RopeEnd = { x: num(e.x, 0, width), y: num(e.y, -2000, 6000) }
      if (e.anchor !== undefined) anchorOn(e.anchor, end)
      rope.end = end
      if (tiedRopeSpan(rope) > 2000) fail()
      fitTiedRope(rope)
    }
    if (r.release !== undefined) {
      const release = object(r.release)
      if (!rope.end || !validSwitchTargetId(release.id) || release.anchor !== 'start' && release.anchor !== 'end') fail()
      const settings = parseSwitchSettings({ switchLogic: release.switchLogic, switchReversed: release.switchReversed }, fail)
      rope.release = { id: release.id as string, anchor: release.anchor as 'start' | 'end',
        ...(settings.switchLogic ? { switchLogic: settings.switchLogic } : {}), ...(settings.switchReversed !== undefined ? { switchReversed: settings.switchReversed } : {}) }
    }
    if (r.rest !== undefined) {
      const rest = object(r.rest)
      if (typeof rest.key !== 'string' || !/^[1-7]:[0-9a-f]{16}$/.test(rest.key)) fail()
      const position = (p: unknown) => {
        const pair = list(p, 2)
        if (pair.length !== 2) fail()
        return [num(pair[0], rope.x - rope.length - 32, rope.x + rope.length + 32), num(pair[1], rope.y - rope.length - 32, rope.y + rope.length + 32)] as [number, number]
      }
      const points = list(rest.points, segments + 1).map(position)
      const bends = rest.bends === undefined ? undefined : list(rest.bends, segments).map(p => p === null ? null : position(p))
      if (bends && bends.length !== segments) fail()
      if (points.length !== segments + 1 || points[0][0] !== rope.x || points[0][1] !== rope.y) fail()
      const spacing = rope.length / segments
      const distances = rest.distances === undefined ? undefined : list(rest.distances, segments + 1).map(d => num(d, 0, rope.length))
      if (distances && (distances.length !== segments + 1 || distances[0] !== 0 || Math.abs(distances[segments] - rope.length) > .000001
        || distances.slice(1).some((d, i) => d - distances[i] < .000001 || d - distances[i] > spacing * 2))) fail()
      if (points.slice(1).some((p, i) => {
        const a = points[i], c = bends?.[i]
        const length = c ? Math.hypot(c[0] - a[0], c[1] - a[1]) + Math.hypot(p[0] - c[0], p[1] - c[1]) : Math.hypot(p[0] - a[0], p[1] - a[1])
        return length > (distances ? distances[i + 1] - distances[i] : spacing) * 1.15
      })) fail()
      // A tied rope's saved shape must end at its second anchor; otherwise it is solved again.
      const reaches = !rope.end || Math.hypot(points[segments][0] - rope.end.x, points[segments][1] - rope.end.y) < .01
      if (reaches) rope.rest = { key: rest.key as string, points, ...(distances ? { distances } : {}), ...(bends ? { bends } : {}) }
    }
    return rope
  })
  // Legacy player positions become entrance doors at the same feet position.
  const entrance = point(v.entrance ?? v.spawn), checkpoints = list(v.checkpoints, 30).map(point)
  const entranceKind = object(v.entrance ?? v.spawn).kind
  if (entranceKind !== undefined && entranceKind !== 'charging-bay') fail()
  if (v.timing !== undefined && v.timing !== 'untimed') fail()
  if (entrance.x > width || checkpoints.some(p => p.x > width)) fail()
  const level: JumpLevel = { version: v.version as 1 | 2, id: v.id as string, name: (v.name as string).trim(), width,
    ...(v.height === undefined ? {} : { height: num(v.height, 400, 6000) }),
    platforms, entrance: { ...entrance, ...(entranceKind ? { kind: entranceKind as 'charging-bay' } : {}) }, checkpoints, climbables: { ladders, ropes },
    ...(v.timing ? { timing: v.timing as 'untimed' } : {}) }
  if (v.toggleGroups !== undefined) level.toggleGroups = parseToggleGroups(v.toggleGroups, fail)
  if (v.floorMaterial !== undefined) {
    if (!isTerrainMaterial(v.floorMaterial)) return fail()
    level.floorMaterial = v.floorMaterial
  }
  if (v.wallFinish !== undefined) {
    const finish = wallFinish(v.wallFinish)
    if (!finish) return fail()
    // The ordinary course wall is the default, saved by leaving the field out.
    if (finish !== 'course') level.wallFinish = finish
  }
  // Existing local files use "flag". Preserve their assembly origin and export "goal".
  const goal = v.goal === undefined ? v.flag : v.goal
  if (v.kind !== undefined && v.kind !== 'hub') fail()
  const hub = v.kind === 'hub'
  if (hub && (goal !== undefined || v.timing !== 'untimed' || v.times !== undefined)) fail()
  if (!hub && ['courseDoors', 'bulkheads', 'evaluationBoards', 'gradeGates'].some(key => v[key] !== undefined)) fail()
  if (goal !== undefined || hub) {
    level.height = num(v.height, 400, 6000); level.floor = num(v.floor, 200, level.height)
    if (hub) level.kind = 'hub'
  }
  if (goal !== undefined) {
    const location = point(goal), g = object(goal), flipX = g.flipX
    if (flipX !== undefined && typeof flipX !== 'boolean') fail()
    if (g.power !== undefined && g.power !== 'always' && g.power !== 'switched') fail()
    if (g.id !== undefined && (typeof g.id !== 'string' || !g.id.trim() || g.id.length > 100)) fail()
    if (g.power === 'switched' && g.id === undefined) fail()
    if (g.kind !== undefined && g.kind !== 'overlook' && g.kind !== 'walk-off' && g.kind !== 'bus') fail()
    if (g.kind && (v.timing !== 'untimed' || g.power === 'switched')) fail()
    if (g.kind === 'walk-off' && (location.x !== width || flipX)) fail()
    if (g.kind === 'bus' && flipX) fail()
    if (g.ending !== undefined && (g.ending !== 'bus' || g.kind !== 'walk-off')) fail()
    // Only a plain exit door leads on; overlook, walk-off and bus exits end the game.
    const leadsTo = g.leadsTo === undefined ? undefined : destination(g.leadsTo)
    if (leadsTo && g.kind) fail()
    level.goal = { ...objectName(g), ...parseSwitchSettings(g, fail), x: location.x, y: location.y, ...(flipX === undefined ? {} : { flipX: flipX as boolean }),
      ...(g.kind ? { kind: g.kind as Goal['kind'] } : {}),
      ...(g.ending ? { ending: g.ending as Goal['ending'] } : {}),
      ...(g.id === undefined ? {} : { id: g.id as string }), ...(g.power === undefined ? {} : { power: g.power as PowerMode }),
      ...(leadsTo ? { leadsTo } : {}) }; if (level.goal.x > width) fail()
    const times = object(v.times), legacy = times.a === undefined && times.gold !== undefined
    const a = num(legacy ? times.gold : times.a, .1, 3600), b = num(legacy ? times.silver : times.b, .1, 3600)
    const c = num(legacy ? times.bronze : times.c, .1, 3600)
    const d = num(times.d ?? (legacy ? Math.ceil(c * 1.5) : undefined), .1, 7200)
    level.times = { a, b, c, d }
    if (!(a < b && b < c && c < d)) fail()
  }
  if (goal !== undefined || hub) {
    level.props = list(v.props, 80).map(item => {
      const b = object(item); if (b.kind !== 'box' && b.kind !== 'ball') fail()
      if (b.weight !== undefined && b.weight !== 'light' && b.weight !== 'normal' && b.weight !== 'heavy') fail()
      if (b.branded !== undefined && (b.kind !== 'box' || typeof b.branded !== 'boolean')) fail()
      if (b.gadget !== undefined && (b.kind !== 'box' || !['emp', 'repulsor'].includes(b.gadget as string))) fail()
      const size = num(b.size, 30, 200)
      return { ...objectName(b), kind: b.kind as 'box' | 'ball', x: num(b.x, size / 2, width - size / 2), y: num(b.y, -1800, level.floor!), size,
        // Retired light variants load as ordinary props, keeping saved levels usable.
        ...(b.weight === undefined || b.weight === 'light' ? {} : { weight: b.weight as PropWeight }),
        ...(b.branded === undefined ? {} : { branded: b.branded as boolean }),
        ...(b.gadget === undefined ? {} : { gadget: b.gadget as 'emp' | 'repulsor' }) }
    })
    level.mechanisms = list(v.mechanisms, 40).map(item => {
      const m = object(item); if (m.kind !== 'lift' && m.kind !== 'gate' || typeof m.id !== 'string' || !m.id || m.id.length > 100) fail()
      if (m.orientation !== undefined && m.orientation !== 'horizontal') fail()
      if (m.flipX !== undefined && (m.orientation !== 'horizontal' || typeof m.flipX !== 'boolean')) fail()
      if (m.power !== undefined && (m.kind === 'gate' || m.power !== 'always' && m.power !== 'switched')) fail()
      const w = num(m.w, m.kind === 'gate' ? MECHANISM_THICKNESS : 30, 600), h = num(m.h, 12, 800)
      return prepareMechanism({ ...objectName(m), ...parseSwitchSettings(m, fail), id: m.id as string, kind: m.kind as 'lift' | 'gate', x: num(m.x, 0, width - w), y: num(m.y, -1000, level.floor! - h), w, h,
        travel: num(m.travel, m.kind === 'gate' ? 12 : 60, 1200),
        ...(m.power === undefined ? {} : { power: m.power as PowerMode }),
        ...(m.orientation === 'horizontal' ? { orientation: 'horizontal' as const } : {}),
        ...(m.flipX === undefined ? {} : { flipX: m.flipX as boolean }) }, level.floor!)
    })
    if (new Set(level.mechanisms.map(m => m.id)).size !== level.mechanisms.length) fail()
    level.triggers = list(v.triggers, 40).map(item => {
      const t = object(item); if (t.mode !== 'touch' && t.mode !== 'weight' && t.mode !== 'coins') fail()
      const wiring = parseWallWiring(t, fail)
      if (t.mode === 'coins' && t.mount !== undefined) fail()
      if (t.ceiling !== undefined && (t.mode === 'coins' || typeof t.ceiling !== 'boolean')) fail()
      if (t.behavior !== undefined && (t.mode === 'coins' || !['pressure', 'switch', 'toggle'].includes(t.behavior as string))) fail()
      if (t.startsOn !== undefined && (t.behavior !== 'switch' && t.behavior !== 'toggle' || typeof t.startsOn !== 'boolean')) fail()
      if (t.toggleGroup !== undefined && (t.mode === 'coins' || t.behavior !== 'toggle' || t.startsOn !== undefined
        || !level.toggleGroups?.some(g => g.id === t.toggleGroup))) fail()
      let connection: TriggerConnection
      if (t.targets !== undefined) {
        if (t.target !== undefined || !Array.isArray(t.targets) || t.targets.length > MAX_SWITCH_TARGETS - (v.version === 1 ? MAX_LIGHTS : 0)
          || t.targets.some(id => !validSwitchTargetId(id)) || new Set(t.targets).size !== t.targets.length) fail()
        connection = { targets: [...t.targets as string[]] }
      } else {
        if (t.target !== '' && !validSwitchTargetId(t.target)) fail()
        connection = { target: t.target as string }
      }
      if (t.mode === 'coins') {
        const threshold = num(t.threshold, 1, 80)
        if (!Number.isInteger(threshold)) fail()
        if (t.display !== undefined && t.display !== 'digital') fail()
        if (t.display === 'digital') {
          if (t.orientation !== undefined || t.h !== undefined || t.w !== DIGITAL_DISPLAY_WIDTH) fail()
          return { ...objectName(t), ...wiring, x: num(t.x, 0, width - DIGITAL_DISPLAY_WIDTH),
            y: num(t.y, 0, level.floor! - DIGITAL_DISPLAY_HEIGHT), w: DIGITAL_DISPLAY_WIDTH,
            ...connection, mode: 'coins', threshold, display: 'digital' }
        }
        if (t.orientation !== undefined && t.orientation !== 'vertical') fail()
        if (t.orientation === undefined && t.h !== undefined) fail()
        // Preserve vertical switches saved with the original, thicker housing.
        if (t.orientation === 'vertical' && ![COIN_SWITCH_THICKNESS, 24, 40, 60].includes(t.w as number)) fail()
        const dimensions = t.orientation === 'vertical'
          ? { orientation: 'vertical' as const, w: COIN_SWITCH_THICKNESS, h: num(t.h, COIN_SWITCH_MIN_LENGTH, 240) }
          : { w: num(t.w, COIN_SWITCH_MIN_LENGTH, 240) }
        const h = dimensions.h ?? COIN_SWITCH_THICKNESS
        const x = num(t.x, 0, width - (t.w as number)) + (t.orientation === 'vertical' ? ((t.w as number) - dimensions.w) / 2 : 0)
        return { ...objectName(t), ...wiring, x, y: num(t.y, 0, level.floor! - h), ...dimensions, ...connection, mode: 'coins', threshold }
      }
      const w = num(t.w, 40, 240)
      let mount: PressurePlateMount | undefined
      if (t.mount !== undefined) {
        const m = object(t.mount), host = level.mechanisms!.find(host => host.id === m.mechanism && host.kind === 'lift')
        if (!host || host.w < w) return fail()
        mount = { mechanism: host.id, x: num(m.x, 0, host.w - w) }
      }
      const position = { x: num(t.x, 0, width - w), y: num(t.y, -1800, level.floor!) }
      if (mount) { const host = level.mechanisms!.find(m => m.id === mount.mechanism)!; position.x = host.x + mount.x; position.y = host.y + (t.ceiling ? host.h : 0) }
      return { ...objectName(t), ...wiring, ...position, w, ...connection, mode: t.mode as 'touch' | 'weight', ...(mount ? { mount } : {}),
        ...(t.ceiling === undefined ? {} : { ceiling: t.ceiling as boolean }),
        ...(t.behavior === undefined ? {} : { behavior: t.behavior as PlateBehavior }), ...(t.startsOn === undefined ? {} : { startsOn: t.startsOn as boolean }),
        ...(t.toggleGroup === undefined ? {} : { toggleGroup: t.toggleGroup as string }) }
    })
    level.robots = list(v.robots, 30).map(item => {
      const r = object(item), left = num(r.left, ROBOT_HALF_WIDTH, width - ROBOT_HALF_WIDTH - 50), right = num(r.right, left + 50, width - ROBOT_HALF_WIDTH)
      if (r.headlight !== undefined && typeof r.headlight !== 'boolean') fail()
      if (r.kind !== undefined && r.kind !== 'repulsor') fail()
      if (r.mode !== undefined && (r.mode !== 'emp' || r.kind === 'repulsor')) fail()
      if (r.chargingBay !== undefined && (typeof r.chargingBay !== 'boolean' || r.kind !== 'repulsor')) fail()
      return { ...objectName(r), x: num(r.x, left, right), y: num(r.y, -1800, level.floor!), left, right,
        ...(r.kind === 'repulsor' ? { kind: 'repulsor' as const } : {}),
        ...(r.mode === 'emp' ? { mode: 'emp' as const } : {}),
        ...(r.chargingBay === undefined ? {} : { chargingBay: r.chargingBay as boolean }),
        ...(r.headlight === undefined ? {} : { headlight: r.headlight as boolean }) }
    })
    if (v.timers !== undefined) level.timers = list(v.timers, 40).map(item => {
      const timer = object(item)
      // All earlier clock footprints were larger. Preserve their top-left positions.
      return { ...objectName(timer), x: num(timer.x, 0, width - WALL_TIMER_WIDTH),
        y: num(timer.y, 0, level.floor! - WALL_TIMER_HEIGHT) }
    })
    if (v.pickups !== undefined) level.pickups = list(v.pickups, 80).map(item => {
      const pickup = object(item)
      if (pickup.kind !== 'stopwatch' && pickup.kind !== 'fast-stopwatch' && pickup.kind !== 'coin' && pickup.kind !== 'time-bonus' && pickup.kind !== 'time-penalty' && pickup.kind !== 'emp') fail()
      const kind = pickup.kind as Pickup['kind'], bounds = pickupBounds({ kind, x: 0, y: 0 })
      const position = { ...objectName(pickup), x: num(pickup.x, -bounds.x, width - bounds.x - bounds.w), y: num(pickup.y, -bounds.y, level.floor! - bounds.y - bounds.h) }
      if (kind === 'time-bonus' || kind === 'time-penalty') {
        const seconds = num(pickup.seconds, 1, 9)
        if (!Number.isInteger(seconds)) fail()
        return { ...position, kind, seconds }
      }
      return { ...position, kind }
    })
    if (hub) {
      // Doors and bulkheads go by where they lead, so a name saved on one is dropped.
      const hubObject = (item: unknown, named = true) => {
        const d = object(item)
        if (typeof d.id !== 'string' || !d.id.trim() || d.id.length > 100) fail()
        return { d, base: { ...named ? objectName(d) : {}, id: d.id as string, x: num(d.x, 0, width), y: num(d.y, 0, level.floor!) } }
      }
      // A door opens always, or like a switched exit while its wiring is on.
      const doorPower = (d: Record<string, unknown>) => {
        if (d.power !== undefined && d.power !== 'switched') fail()
        if (d.relay !== undefined) fail()
        const settings = parseSwitchSettings({ switchLogic: d.switchLogic, switchReversed: d.switchReversed }, fail)
        return d.power === 'switched' ? { power: 'switched' as const, ...settings } : {}
      }
      level.courseDoors = list(v.courseDoors ?? [], MAX_COURSE_DOORS).map(item => {
        const { d, base } = hubObject(item, false)
        if (typeof d.course !== 'string' || d.course.length > 100) fail()
        if (d.dispatch !== undefined && d.dispatch !== true) fail()
        // A level door is also a switch: its targets turn on once its course is passed.
        const { targets } = parseSwitchSettings({ targets: d.targets }, fail)
        return { ...base, course: d.course as string, ...doorPower(d), ...(targets?.length ? { targets } : {}),
          ...(d.returnsTo === undefined ? {} : { returnsTo: reference(d.returnsTo) }), ...(d.dispatch ? { dispatch: true as const } : {}) }
      })
      level.bulkheads = list(v.bulkheads ?? [], MAX_BULKHEADS).map(item => {
        const { d, base } = hubObject(item, false)
        if (typeof d.to !== 'string' || d.to.length > 100) fail()
        // A bulkhead is also a switch: its targets turn on once the area beyond is complete.
        const { targets } = parseSwitchSettings({ targets: d.targets }, fail)
        return { ...base, to: d.to as string, ...doorPower(d), ...(targets?.length ? { targets } : {}),
          ...(d.arrivesAt === undefined ? {} : { arrivesAt: reference(d.arrivesAt) }) }
      })
      level.evaluationBoards = list(v.evaluationBoards ?? [], MAX_EVALUATION_BOARDS).map(item => {
        const { d, base } = hubObject(item), w = num(d.w, 120, 1200), h = num(d.h, 60, 600)
        if (base.x + w > width || base.y + h > level.floor!) fail()
        return { ...base, w, h }
      })
      if (v.gradeGates !== undefined) level.gradeGates = list(v.gradeGates, MAX_GRADE_GATES).map(item => {
        const gate = object(item)
        if (typeof gate.id !== 'string' || !gate.id.trim() || gate.id.length > 100 || !(GRADE_LETTERS as readonly unknown[]).includes(gate.grade)) fail()
        if (!Array.isArray(gate.doors) || gate.doors.length > MAX_COURSE_DOORS || gate.doors.some(id => typeof id !== 'string' || !id) || new Set(gate.doors).size !== gate.doors.length) fail()
        const { targets, switchReversed } = parseSwitchSettings({ targets: gate.targets, switchReversed: gate.switchReversed }, fail)
        return { ...objectName(gate), id: gate.id as string, x: num(gate.x, GRADE_GATE_WIDTH / 2, width - GRADE_GATE_WIDTH / 2),
          y: num(gate.y, GRADE_GATE_HEIGHT / 2, level.floor! - GRADE_GATE_HEIGHT / 2), doors: [...gate.doors as string[]], grade: gate.grade as GradeLetter,
          ...(switchReversed ? { switchReversed } : {}), ...(targets ? { targets } : {}) }
      })
      const hubIds = [...level.courseDoors, ...level.bulkheads, ...level.evaluationBoards, ...level.gradeGates ?? []].map(item => item.id)
      if (new Set(hubIds).size !== hubIds.length) fail()
    }
  } else if (['floor', 'times', 'props', 'mechanisms', 'triggers', 'robots', 'timers', 'pickups', 'wallLights', 'logicRelays', 'floatSwitches', 'gravityPlates', 'forceFields'].some(key => v[key] !== undefined)) fail()
  if (v.texts !== undefined) level.texts = list(v.texts, 80).map(item => {
    const t = object(item), w = num(t.w, 40, 2000), h = num(t.h, 24, 1200)
    if (typeof t.text !== 'string' || t.text.length > 1000 || !['left', 'center', 'right'].includes(t.align as string)) fail()
    if (t.style !== undefined && t.style !== 'official' && t.style !== 'graffiti' && t.style !== 'lab-stamp' && t.style !== 'terminal') fail()
    const text: WallText = { ...objectName(t), x: num(t.x, -1000, width), y: num(t.y, -600, levelHeight(level)), w, h,
      text: t.text as string, fontSize: num(t.fontSize, 12, 96), align: t.align as WallText['align'],
      ...(t.style === undefined ? {} : { style: t.style as WallText['style'] }),
      ...(t.rotation === undefined ? {} : { rotation: num(t.rotation, -180, 180) }) }
    const b = wallTextBounds(text)
    if (b.x < -.001 || b.y < -.001 || b.x + b.w > width + .001 || b.y + b.h > levelHeight(level) + .001) fail()
    return text
  })
  if (v.wallDoors !== undefined) level.wallDoors = list(v.wallDoors, MAX_WALL_DOORS).map(item => {
    const d = object(item)
    if (!WALL_DOOR_CONDITIONS.includes(d.condition as WallDoorCondition)) fail()
    if (d.frame !== undefined && d.frame !== 'bulkhead') fail()
    if (d.flipX !== undefined && typeof d.flipX !== 'boolean') fail()
    return { ...objectName(d), x: num(d.x, 0, width), y: num(d.y, 0, 6000), condition: d.condition as WallDoorCondition,
      ...(d.frame === undefined ? {} : { frame: 'bulkhead' as const }), ...(d.flipX === undefined ? {} : { flipX: d.flipX as boolean }) }
  })
  if (v.gravityPlates !== undefined) level.gravityPlates = list(v.gravityPlates, MAX_GRAVITY_PLATES).map(item => {
    const p = object(item)
    if (typeof p.id !== 'string' || !p.id.trim() || p.id.length > 100) return fail()
    if (p.power !== undefined && p.power !== 'always' && p.power !== 'switched') return fail()
    if (p.ceiling !== undefined && typeof p.ceiling !== 'boolean') return fail()
    if (p.effect !== undefined && p.effect !== 'water') return fail()
    const w = num(p.w, 40, width), h = num(p.h, 40, 6000)
    const settings = parseSwitchSettings(p, fail), water = p.effect === 'water'
    if (!water && ['waterLevel', 'waterMinLevel', 'waterRate', 'fill', 'drain'].some(key => p[key] !== undefined)) return fail()
    const minimum = p.waterMinLevel === undefined ? 0 : num(p.waterMinLevel, 0, 100)
    const control = (value: unknown) => {
      const input = object(value)
      if (input.relay !== undefined || input.targets !== undefined) return fail()
      return parseSwitchSettings(input, fail)
    }
    return { ...objectName(p), ...(water ? settings.wireTerminal ? { wireTerminal: settings.wireTerminal } : {} : settings), id: p.id,
      x: num(p.x, 0, width - w), y: num(p.y, 0, levelHeight(level) - h), w, h, gravity: p.effect === 'water' ? -1 : num(p.gravity, -3, 3),
      ...(p.effect === undefined ? {} : { effect: p.effect as 'water' }),
      ...(p.waterLevel === undefined ? {} : { waterLevel: num(p.waterLevel, minimum, 100) }),
      ...(p.waterMinLevel === undefined ? {} : { waterMinLevel: minimum }),
      ...(p.waterRate === undefined ? {} : { waterRate: num(p.waterRate, .1, 100) }),
      ...(p.fill === undefined ? {} : { fill: control(p.fill) }), ...(p.drain === undefined ? {} : { drain: control(p.drain) }),
      ...(water || p.ceiling === undefined ? {} : { ceiling: p.ceiling as boolean }), ...(water || p.power === undefined ? {} : { power: p.power as PowerMode }) }
  })
  if (v.forceFields !== undefined) level.forceFields = list(v.forceFields, MAX_FORCE_FIELDS).map(item => {
    const field = object(item)
    if (typeof field.id !== 'string' || !field.id.trim() || field.id.length > 100) return fail()
    if (field.orientation !== 'horizontal' && field.orientation !== 'vertical') return fail()
    if (field.power !== undefined && field.power !== 'always' && field.power !== 'switched') return fail()
    if (field.mode !== undefined && field.mode !== 'player' && field.mode !== 'objects') return fail()
    const horizontal = field.orientation === 'horizontal'
    const w = num(field.w, horizontal ? FORCE_FIELD_MIN_LENGTH : FORCE_FIELD_THICKNESS, horizontal ? width : FORCE_FIELD_THICKNESS)
    const h = num(field.h, horizontal ? FORCE_FIELD_THICKNESS : FORCE_FIELD_MIN_LENGTH, horizontal ? FORCE_FIELD_THICKNESS : levelHeight(level))
    return { ...objectName(field), ...parseSwitchSettings(field, fail), id: field.id,
      x: num(field.x, 0, width - w), y: num(field.y, 0, levelHeight(level) - h), w, h, orientation: field.orientation,
      ...(field.mode === undefined ? {} : { mode: field.mode }),
      ...(field.power === undefined ? {} : { power: field.power as PowerMode }) }
  })
  if (v.wallLights !== undefined) level.wallLights = list(v.wallLights, MAX_WALL_LIGHTS).map(item => {
    const light = object(item)
    if (typeof light.id !== 'string' || !light.id.trim() || light.id.length > 100) return fail()
    return { ...objectName(light), ...parseSwitchSettings(light, fail), id: light.id,
      x: num(light.x, WALL_LIGHT_RADIUS, width - WALL_LIGHT_RADIUS), y: num(light.y, WALL_LIGHT_RADIUS, levelHeight(level) - WALL_LIGHT_RADIUS) }
  })
  if (v.floatSwitches !== undefined) level.floatSwitches = list(v.floatSwitches, MAX_FLOAT_SWITCHES).map(item => {
    const f = object(item)
    if (typeof f.id !== 'string' || !f.id.trim() || f.id.length > 100 || f.power !== undefined || f.relay !== undefined || f.switchLogic !== undefined || f.switchReversed !== undefined) return fail()
    if (f.activeWhen !== undefined && f.activeWhen !== 'raised' && f.activeWhen !== 'lowered') return fail()
    for (const key of ['flipX', 'startsRaised']) if (f[key] !== undefined && typeof f[key] !== 'boolean') return fail()
    const definition: FloatSwitch = { ...objectName(f), ...parseWallWiring(f, fail), id: f.id, x: num(f.x, 0, width), y: num(f.y, 0, levelHeight(level)),
      armLength: num(f.armLength, 40, 400), size: num(f.size, 20, 100), targets: parseSwitchSettings(f, fail).targets ?? [],
      ...(f.travelAngle === undefined ? {} : { travelAngle: num(f.travelAngle, 10, 80) }),
      ...(f.activeWhen === undefined ? {} : { activeWhen: f.activeWhen as 'raised' | 'lowered' }),
      ...(f.flipX === undefined ? {} : { flipX: f.flipX as boolean }), ...(f.startsRaised === undefined ? {} : { startsRaised: f.startsRaised as boolean }) }
    const b = floatSwitchBounds(definition)
    if (b.x < 0 || b.y < 0 || b.x + b.w > width || b.y + b.h > levelHeight(level)) return fail()
    return definition
  })
  if (v.logicRelays !== undefined) level.logicRelays = list(v.logicRelays, MAX_LOGIC_RELAYS).map(item => {
    const relay = object(item)
    if (typeof relay.id !== 'string' || !relay.id.trim() || relay.id.length > 100 || relay.relay !== undefined || relay.power !== undefined) return fail()
    return { ...objectName(relay), ...parseSwitchSettings(relay, fail), id: relay.id,
      x: num(relay.x, LOGIC_RELAY_WIDTH / 2, width - LOGIC_RELAY_WIDTH / 2),
      y: num(relay.y, LOGIC_RELAY_HEIGHT / 2, levelHeight(level) - LOGIC_RELAY_HEIGHT / 2) }
  })
  if (v.environment !== undefined) {
    if (level.version !== 2) throw new Error('Landscapes require a version 2 level file.')
    level.environment = parseEnvironment(v.environment, width, levelHeight(level))
  }
  if (level.version === 2) level.lighting = parseLighting(v.lighting)
  if (v.editorGroups !== undefined) level.editorGroups = parseEditorGroups(v.editorGroups, level)
  // Older pools were wired like gravity devices. Water is now a passive region;
  // remove those obsolete connections before validating the remaining circuit.
  for (const plate of level.gravityPlates ?? []) if (plate.effect === 'water') removeSwitchTarget(level, plate.id)
  if (level.version === 2) {
    const issues = lightingProblems(level)
    if (issues.length) throw new Error(issues[0])
  }
  const ids = [...level.floatSwitches ?? [], ...level.logicRelays ?? [], ...level.mechanisms ?? [], ...level.lighting?.lights ?? [], ...level.wallLights ?? [], ...level.gravityPlates ?? [], ...level.forceFields ?? [], ...(level.goal?.id ? [level.goal] : []),
    ...level.climbables.ropes.flatMap(rope => rope.release ? [rope.release] : []),
    // Switched doors and bulkheads are wired by their own IDs.
    ...[...level.courseDoors ?? [], ...level.bulkheads ?? []].filter(door => door.power === 'switched')].map(item => item.id)
  for (const p of level.gravityPlates ?? []) if (p.effect === 'water') ids.push(waterControlId(p.id, 'fill'), waterControlId(p.id, 'drain'))
  if (new Set(ids).size !== ids.length) fail()
  // Legacy version-1 trigger references remain editor validation, as before.
  const wiring = switchWiringProblems(level, level.version === 2)
  if (wiring.length) throw new Error(wiring[0])
  return level
}
/** An empty editor document; all authored maps are external JSON assets. */
export function blankTrial(): PuzzleLevel {
  return { version: 1, id: newLevelId(), name: 'Untitled level', width: 1800, height: 920, floor: 920,
    entrance: { x: 160, y: 920 }, goal: { x: 1620, y: 920 }, platforms: [], checkpoints: [],
    climbables: { ropes: [], ladders: [] }, props: [], robots: [], triggers: [], mechanisms: [], timers: [], texts: [], pickups: [], times: { a: 10, b: 20, c: 40, d: 60 } }
}
