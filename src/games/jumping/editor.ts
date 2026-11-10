import type { JumpLevel } from './level.ts'
import { blankTrial, copyLevel, isHubLevel, isPuzzleLevel, newLevelId, levelTerrain, levelHeight, snapToGround, LEVEL_GRID_SIZE } from './level.ts'
import { GRADE_GATE_HEIGHT, GRADE_GATE_WIDTH, GRADE_LETTERS, MAX_BULKHEADS, MAX_COURSE_DOORS, MAX_EVALUATION_BOARDS, MAX_GRADE_GATES, bulkheadSignBounds, courseDoorSignBounds, gradeGateBounds, hubDoorBounds, placardBounds } from './hub.ts'
import type { Bulkhead, CourseDoor, GradeGate } from './hub.ts'
import { MAX_WALL_DOORS, WALL_DOOR_CONDITIONS, wallDoorBounds } from './wallDoor.ts'
import type { WallDoor } from './wallDoor.ts'
import { TUNING } from './model.ts'
import type { Platform } from './model.ts'
import type { TerrainMaterial } from './terrainMaterials.ts'
import { OBJECT_NAME_MAX_LENGTH } from './objectNames.ts'
import type { NamedObject } from './objectNames.ts'
import { itemDefinition, itemName, objectReference } from './objectLabels.ts'
export { itemDefinition } from './objectLabels.ts'
import { asTrial, carvePit, pusherRange } from './puzzleEditor.ts'
import { groundAt, platformSurface } from './terrain.ts'
import { nearestBoundary, pointInside, validPolygon } from './geometry.ts'
import type { Vec } from './geometry.ts'
import { MAX_CURVE_POINTS, cubicPoint, relativePoint, splitCubic, terrainCubic, terrainCurveOutline, terrainCurveSamples, terrainNodes } from './terrainCurves.ts'
import type { TerrainBezier } from './terrainCurves.ts'
import { fitTiedRope, ropeEnds, ropePath, ropeSegmentCount, tiedRopeSpan } from './climbables.ts'
import { chargingBayBounds, entranceBounds, GOAL_DOOR_HEIGHT, GOAL_DOOR_OFFSET, GOAL_DOOR_WIDTH, goalBounds, goalDoor, ROBOT_BAY_WIDTH_SCALE } from './goal.ts'
import type { Destination } from './goal.ts'
import { removeSwitchTarget, switchedItems, switchSources, wallWiringItems } from './switchPower.ts'
import { waterControlId } from './waterLevel.ts'
import type { PlateBehavior, PowerMode, SwitchLogic, SwitchSettings } from './switchPower.ts'
import { attachPressurePlateOnSurface, syncPressurePlateMounts } from './pressurePlateMount.ts'
import { WALL_TIMER_WIDTH, WALL_TIMER_HEIGHT } from './wallTimer.ts'
import { fitWallText, wallTextBounds, wallTextLocalPoint, wallTextPoint } from './wallText.ts'
import { pickupBounds, TIME_BONUS_DEFAULT_SECONDS } from './pickups.ts'
import { DIGITAL_DISPLAY_WIDTH, DIGITAL_DISPLAY_HEIGHT } from './digitalDisplay.ts'
import { COIN_SWITCH_THICKNESS, COIN_SWITCH_MIN_LENGTH, coinSwitchBounds } from './coins.ts'
import { MECHANISM_THICKNESS, isHorizontalGate, mechanismAnchor, mechanismRopeEnd, mechanismSweep, mechanismTravel } from './mechanisms.ts'
import { lightBounds, MAX_LIGHTS } from './lightingDefinition.ts'
import { MAX_WALL_LIGHTS, WALL_LIGHT_RADIUS, wallLightBounds } from './wallLight.ts'
import { MAX_LOGIC_RELAYS, LOGIC_RELAY_WIDTH, LOGIC_RELAY_HEIGHT, logicRelayBounds } from './logicRelay.ts'
import { MAX_FLOAT_SWITCHES, floatSwitchBounds, floatBallCenter } from './floatSwitch.ts'
import type { FloatSwitch } from './floatSwitch.ts'
import { editorRobotPose } from './editorGeometry.ts'
import { ROBOT_HALF_WIDTH, robotHulls } from './robotPhysics.ts'

import { MAX_GRAVITY_PLATES } from './gravity.ts'
import { MAX_FORCE_FIELDS, FORCE_FIELD_THICKNESS, FORCE_FIELD_MIN_LENGTH } from './forceField.ts'
import { plateSolids, plateSurface } from './plateSurface.ts'
import { terrainDrawOrder } from './terrainOrder.ts'
import { GADGET_SIZE } from './gadgets.ts'
import { removeEditorGroupMember } from './editorGroups.ts'
import { propHeight, propWidth } from './propGeometry.ts'
import { prepareBackWall } from './environmentEditor.ts'
import { backWallEdgeAt } from './backWallEditing.ts'

export type Tool = 'back-wall' | 'select' | 'node' | 'platform' | 'steps-narrow' | 'steps-wide' | 'ramp' | 'rough' | 'rope' | 'tied-rope' | 'ladder' | 'entrance' | 'checkpoint' | 'pillar' | 'pit' | 'goal' | 'box' | 'branded-box' | 'ball' | 'pusher' | 'repulsorbot' | 'plate' | 'lift' | 'moving-platform' | 'gate' | 'horizontal-gate' | 'timer' | 'text' | 'lab-stamp' | 'message-screen' | 'stopwatch' | 'coin' | 'time-bonus' | 'time-penalty' | 'fast-stopwatch' | 'emp' | 'coin-switch' | 'light' | 'wall-light' | 'logic-relay' | 'float-switch' | 'gravity-plate' | 'water' | 'force-field' | 'horizontal-force-field' | 'carried-emp' | 'repulsor' | 'course-door' | 'bulkhead' | 'evaluation-board' | 'wall-door' | 'grade-gate'
export type TerrainTransform = 'rotate-left' | 'rotate-right' | 'flip-horizontal' | 'flip-vertical'
export type TerrainOrderAction = 'back' | 'backward' | 'forward' | 'front'
export type ResizeCorner = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'
export type ResizeHandle = ResizeCorner | 'left' | 'right' | 'top' | 'bottom'
export type Selection = { kind: 'back-wall' | 'platform' | 'rope' | 'ladder' | 'entrance' | 'checkpoint' | 'goal' | 'prop' | 'robot' | 'mechanism' | 'trigger' | 'timer' | 'text' | 'pickup' | 'light' | 'wall-light' | 'logic-relay' | 'float-switch' | 'gravity-plate' | 'force-field' | 'course-door' | 'bulkhead' | 'evaluation-board' | 'wall-door' | 'grade-gate'; index: number }
export const clamp = (n: number, low: number, high: number) => Math.max(low, Math.min(high, n))
/** Level doors and bulkheads share the entrance's doorway, sill and placement rules. */
export const isHubDoor = (selection: Selection): selection is Selection & { kind: 'course-door' | 'bulkhead' } => selection.kind === 'course-door' || selection.kind === 'bulkhead'
export function hubDoorAt(level: JumpLevel, selection: Selection): CourseDoor | Bulkhead | undefined {
  return selection.kind === 'course-door' ? level.courseDoors?.[selection.index] : selection.kind === 'bulkhead' ? level.bulkheads?.[selection.index] : undefined
}
/** A door's selectable outline includes the lettering above it, and a level door's the placard hung to its right. */
function hubDoorOutline(door: CourseDoor | Bulkhead) {
  const b = hubDoorBounds(door)
  if ('to' in door) { const sign = bulkheadSignBounds(door); return { x: b.x - 40, y: sign.y, w: b.w + 80, h: b.y + b.h - sign.y } }
  const placard = placardBounds(door), sign = courseDoorSignBounds(door)
  return { x: b.x - 40, y: sign.y, w: placard.x + placard.w - b.x + 40, h: b.y + b.h - sign.y }
}

/**
 * Courses end at an exit; facility areas are left only through their doors.
 * Switching keeps the way out: a doorway exit becomes a bulkhead whose
 * destination is still to choose, and a facility area's first bulkhead becomes
 * the exit.
 */
export function setLevelType(level: JumpLevel, type: 'course' | 'hub'): JumpLevel {
  if (type === 'course') {
    if (!isHubLevel(level)) return isPuzzleLevel(level) ? level : asTrial(level)
    const next: JumpLevel = copyLevel(level), [bulkhead] = level.bulkheads
    delete next.kind; delete next.courseDoors; delete next.bulkheads; delete next.evaluationBoards; delete next.timing
    const flipX = !!bulkhead && bulkhead.x - GOAL_DOOR_OFFSET < 30
    next.goal = bulkhead ? { x: bulkhead.x + (flipX ? GOAL_DOOR_OFFSET : -GOAL_DOOR_OFFSET), y: bulkhead.y, ...(flipX ? { flipX } : {}) }
      : snapToGround(next, next.width - 160, next.entrance.y)
    next.times = blankTrial().times
    return next
  }
  if (isHubLevel(level)) return level
  const course = asTrial(level)
  if (!isPuzzleLevel(course)) return level
  const next: JumpLevel = copyLevel(course), goal = course.goal
  if (goal.id) removeSwitchTarget(next, goal.id)
  delete next.goal; delete next.times
  next.kind = 'hub'; next.timing = 'untimed'
  next.courseDoors = []; next.evaluationBoards = []
  next.bulkheads = goal.kind ? [] : [{ id: newLevelId(), x: goalDoor(goal).x + GOAL_DOOR_WIDTH / 2, y: goal.y, to: '' }]
  return next
}
/** Wall doors are art: their condition, frame and facing only change how they look. */
export function setWallDoor(level: JumpLevel, index: number, patch: Partial<Pick<WallDoor, 'condition' | 'frame' | 'flipX'>>): JumpLevel {
  if (!level.wallDoors?.[index] || patch.condition && !WALL_DOOR_CONDITIONS.includes(patch.condition)) return level
  const next = copyLevel(level), door = next.wallDoors![index]
  if (patch.condition) door.condition = patch.condition
  if ('frame' in patch) { if (patch.frame === 'bulkhead') door.frame = 'bulkhead'; else delete door.frame }
  if ('flipX' in patch) { if (patch.flipX) door.flipX = true; else delete door.flipX }
  return next
}
/** A level door names a level by ID; a bulkhead names a facility area by its level ID. */
export function setHubDoorDestination(level: JumpLevel, selection: Selection, destination: string): JumpLevel {
  const door = hubDoorAt(level, selection)
  if (!door || ('course' in door ? door.course : door.to) === destination) return level
  const next = copyLevel(level), target = hubDoorAt(next, selection)!
  // A bulkhead's arrival door belongs to the area it led to before.
  if ('course' in target) target.course = destination; else { target.to = destination; delete target.arrivesAt }
  return next
}

/** Where a plain exit leads when its run passes; none sends the robot back where it came from. */
export function setExitDestination(level: JumpLevel, leadsTo: Destination | undefined): JumpLevel {
  if (!level.goal || level.goal.kind || JSON.stringify(level.goal.leadsTo) === JSON.stringify(leadsTo)) return level
  const next = copyLevel(level)
  if (leadsTo) next.goal!.leadsTo = { level: leadsTo.level, ...(leadsTo.arrival ? { arrival: leadsTo.arrival } : {}) }
  else delete next.goal!.leadsTo
  return next
}

/** The door or bulkhead a level door's course returns the robot through; none returns it through the same door. */
export function setDoorReturn(level: JumpLevel, selection: Selection, returnsTo: string | undefined): JumpLevel {
  const door = selection.kind === 'course-door' ? level.courseDoors?.[selection.index] : undefined
  if (!door || door.returnsTo === returnsTo || returnsTo === door.id && !door.returnsTo) return level
  const next = copyLevel(level), target = next.courseDoors![selection.index]
  if (returnsTo && returnsTo !== target.id) target.returnsTo = returnsTo; else delete target.returnsTo
  return next
}

/** Mark the dispatch door to the final course. An area has at most one, so marking one clears the rest. */
export function setDoorDispatch(level: JumpLevel, selection: Selection, dispatch: boolean): JumpLevel {
  const door = selection.kind === 'course-door' ? level.courseDoors?.[selection.index] : undefined
  if (!door || !!door.dispatch === dispatch) return level
  const next = copyLevel(level)
  for (const [i, other] of next.courseDoors!.entries()) if (dispatch && i === selection.index) other.dispatch = true; else delete other.dispatch
  return next
}

/** The door or bulkhead a bulkhead brings the robot out of in the area beyond; none uses the bulkhead there that leads back. */
export function setBulkheadArrival(level: JumpLevel, selection: Selection, arrivesAt: string | undefined): JumpLevel {
  const bulkhead = selection.kind === 'bulkhead' ? level.bulkheads?.[selection.index] : undefined
  if (!bulkhead || bulkhead.arrivesAt === arrivesAt) return level
  const next = copyLevel(level), target = next.bulkheads![selection.index]
  if (arrivesAt) target.arrivesAt = arrivesAt; else delete target.arrivesAt
  return next
}

/** Finish styles stay authored data, with selectable bounds in the studio. */
export function setFinish(level: JumpLevel, kind: 'doorway' | 'overlook' | 'walk-off' | 'bus'): JumpLevel {
  const next = copyLevel(level)
  if (!next.goal) return level
  if (kind === 'walk-off') {
    const y = groundAt(levelTerrain(next), next.width - 32, next.goal.y, levelHeight(next))?.y ?? next.goal.y
    if (next.goal.id) removeSwitchTarget(next, next.goal.id)
    next.goal = { x: next.width, y, kind, ...(next.goal.ending ? { ending: next.goal.ending } : {}), ...(next.goal.name ? { name: next.goal.name } : {}) }
    next.timing = 'untimed'
  } else if (kind === 'bus') {
    const y = groundAt(levelTerrain(next), Math.min(next.width - 32, next.goal.x), next.goal.y, levelHeight(next))?.y ?? next.goal.y
    if (next.goal.id) removeSwitchTarget(next, next.goal.id)
    next.goal = { x: clamp(next.goal.x, 184, next.width - 76), y, kind, ...(next.goal.name ? { name: next.goal.name } : {}) }
    next.timing = 'untimed'
  } else {
    delete next.goal.ending
    // An overlook ends the game, so it leads nowhere.
    if (kind === 'overlook') { next.goal.kind = kind; next.timing = 'untimed'; delete next.goal.power; delete next.goal.leadsTo }
    else delete next.goal.kind
    const bounds = goalBounds({ ...next.goal, x: 0, y: 0 })
    next.goal.x = clamp(next.goal.x, Math.max(0, -bounds.x), next.width - bounds.x - bounds.w)
  }
  return next
}

/** Carry custom wall points with authored edits, never with runtime mechanism motion. */
export function carryWallTerminals(before: JumpLevel, next: JumpLevel): JumpLevel {
  const changed = new Map(wallWiringItems(next).map(item => [`${item.kind}:${item.index}`, item.definition]))
  for (const item of wallWiringItems(before)) {
    const p = item.definition.wireTerminal, target = changed.get(`${item.kind}:${item.index}`)
    if (p && target) target.wireTerminal = {
      x: clamp(p.x + target.x - item.definition.x, 4, next.width - 4),
      y: clamp(p.y + target.y - item.definition.y, 4, levelHeight(next) - 4),
    }
  }
  return next
}

export function setWallTerminal(level: JumpLevel, selection: Selection, point: { x: number; y: number } | null): JumpLevel {
  if (point && (!Number.isFinite(point.x) || !Number.isFinite(point.y))) return level
  const next = copyLevel(level), item = wallWiringItems(next).find(item => item.kind === selection.kind && item.index === selection.index)
  if (!item) return level
  if (point) item.definition.wireTerminal = { x: clamp(point.x, 4, next.width - 4), y: clamp(point.y, 4, levelHeight(next) - 4) }
  else delete item.definition.wireTerminal
  return next
}

/** Change only visual depth; terrain indices and all attachments stay stable. */
export function reorderTerrain(level: JumpLevel, index: number, action: TerrainOrderAction): JumpLevel {
  const order = [...terrainDrawOrder(level.platforms)], from = order.indexOf(index)
  if (from < 0) return level
  const to = action === 'back' ? 0 : action === 'front' ? order.length - 1
    : clamp(from + (action === 'forward' ? 1 : -1), 0, order.length - 1)
  if (from === to) return level
  order.splice(from, 1); order.splice(to, 0, index)
  const next = copyLevel(level)
  for (const [depth, i] of order.entries()) {
    if (depth === 0) delete next.platforms[i].zIndex
    else next.platforms[i].zIndex = depth
  }
  return next
}

/** Patrol endpoints stay in the room and include the shovebot's starting position. */
export function setShovebotLimit(level: JumpLevel, index: number, side: 'left' | 'right', value: number): JumpLevel {
  if (!level.robots?.[index] || !Number.isFinite(value)) return level
  const next = copyLevel(level), robot = next.robots![index]
  robot[side] = side === 'left' ? clamp(Math.round(value), ROBOT_HALF_WIDTH, Math.floor(Math.min(robot.x, robot.right - 50)))
    : clamp(Math.round(value), Math.ceil(Math.max(robot.x, robot.left + 50)), Math.floor(next.width - ROBOT_HALF_WIDTH))
  return next
}

export function setShovebotHeadlight(level: JumpLevel, index: number, enabled: boolean): JumpLevel {
  if (!level.robots?.[index]) return level
  const next = copyLevel(level), robot = next.robots![index]
  if (enabled) robot.headlight = true
  else delete robot.headlight
  return next
}

export function setShovebotMode(level: JumpLevel, index: number, mode: 'shove' | 'emp'): JumpLevel {
  if (!level.robots?.[index] || level.robots[index].kind === 'repulsor') return level
  const next = copyLevel(level), robot = next.robots![index]
  if (mode === 'emp') robot.mode = 'emp'
  else delete robot.mode
  return next
}

export function setCrateBranding(level: JumpLevel, index: number, enabled: boolean): JumpLevel {
  if (level.props?.[index]?.kind !== 'box') return level
  const next = copyLevel(level), crate = next.props![index]
  if (enabled) crate.branded = true
  else delete crate.branded
  return next
}

export function setWallTextRotation(level: JumpLevel, index: number, rotation: number): JumpLevel {
  if (!level.texts?.[index] || !Number.isFinite(rotation)) return level
  const next = copyLevel(level), text = next.texts![index]
  text.rotation = clamp(Math.round(rotation), -180, 180)
  next.texts![index] = fitWallText(text, next.width, levelHeight(next))
  return next
}

export function setPickupSeconds(level: JumpLevel, index: number, seconds: number): JumpLevel {
  const next = copyLevel(level), pickup = next.pickups?.[index]
  if ((pickup?.kind === 'time-bonus' || pickup?.kind === 'time-penalty') && Number.isFinite(seconds)) pickup.seconds = clamp(Math.round(seconds), 1, 9)
  return next
}

/** Level doors and bulkheads go by where they lead, so they have no name to change. */
export function renameItem(level: JumpLevel, selection: Selection, value: string): JumpLevel {
  const name = value.trim().slice(0, OBJECT_NAME_MAX_LENGTH)
  if (!itemDefinition(level, selection) || selection.kind === 'course-door' || selection.kind === 'bulkhead' || (itemName(level, selection) ?? '') === name) return level
  const next = copyLevel(level), target = itemDefinition(next, selection) as NamedObject
  if (name) target.name = name
  else delete target.name
  return next
}

/** The editor's origin is the bottom-left; version 1 files and physics use Y-down. */
export function resizeLevelHeight(level: JumpLevel, requested: number): JumpLevel {
  if (!Number.isFinite(requested)) return level
  const before = levelHeight(level)
  // Shrink from the ceiling, stopping before any authored object is cropped.
  const tops = allSelections(level).map(s => {
    const b = itemOutline(level, s)!
    const clearance = s.kind === 'checkpoint' ? TUNING.height : 0
    return b.y - clearance
  })
  const terminalTops = [...wallWiringItems(level).flatMap(item => item.definition.wireTerminal ? [item.definition.wireTerminal.y - 4] : []),
    ...(level.environment ? [...(level.environment.horizon === undefined ? [] : [level.environment.horizon]), ...level.environment.walls.map(w => w.y), ...level.environment.groundCover?.map(c => c.y - 8) ?? []] : [])]
  const height = clamp(requested, Math.ceil(Math.max(400, ...[...tops, ...terminalTops].map(y => before - y))), 6000)
  const dy = height - before
  if (!dy) return level
  const next = copyLevel(level)
  next.height = height
  if (next.floor !== undefined) next.floor = height
  if (next.environment) {
    if (next.environment.horizon !== undefined) next.environment.horizon += dy
    for (const wall of next.environment.walls) wall.y += dy
    for (const cover of next.environment.groundCover ?? []) cover.y += dy
  }
  for (const point of [next.entrance, ...next.checkpoints, ...(next.goal ? [next.goal] : []), ...next.platforms,
    ...(next.props ?? []), ...(next.robots ?? []), ...(next.mechanisms ?? []), ...(next.triggers ?? []), ...(next.timers ?? []), ...(next.texts ?? []), ...(next.pickups ?? []), ...(next.lighting?.lights ?? []), ...(next.wallLights ?? []), ...(next.logicRelays ?? []), ...(next.floatSwitches ?? []), ...(next.gravityPlates ?? []), ...(next.forceFields ?? []),
    ...(next.courseDoors ?? []), ...(next.bulkheads ?? []), ...(next.evaluationBoards ?? []), ...(next.wallDoors ?? []), ...(next.gradeGates ?? [])]) point.y += dy
  for (const ladder of next.climbables.ladders) { ladder.top += dy; ladder.bottom += dy }
  for (const rope of next.climbables.ropes) {
    for (const point of ropeEnds(rope)) point.y += dy
    // Local terrain anchors stay unchanged. Rebuild cached world-space geometry
    // against the resized room before previewing, playing, or saving the level.
    delete rope.rest
  }
  return carryWallTerminals(level, next)
}
export function itemBounds(level: JumpLevel, selection: Selection) {
  const i = selection.index
  if (selection.kind === 'light') { const l = level.lighting?.lights[i]; return l ? lightBounds(l) : null }
  if (selection.kind === 'wall-light') { const light = level.wallLights?.[i]; return light ? wallLightBounds(light) : null }
  if (selection.kind === 'float-switch') { const f = level.floatSwitches?.[i]; return f ? floatSwitchBounds(f) : null }
  if (selection.kind === 'logic-relay') { const relay = level.logicRelays?.[i]; return relay ? logicRelayBounds(relay) : null }
  if (selection.kind === 'grade-gate') { const gate = level.gradeGates?.[i]; return gate ? gradeGateBounds(gate) : null }
  if (selection.kind === 'force-field') return level.forceFields?.[i] ?? null
  if (selection.kind === 'gravity-plate') return level.gravityPlates?.[i] ?? null
  if (selection.kind === 'platform') return level.platforms[i] ?? null
  if (selection.kind === 'back-wall') return level.environment?.walls[i] ?? null
  if (selection.kind === 'rope') { const r = level.climbables.ropes[i]; return r ? { x: r.x, y: r.y, w: 0, h: r.length } : null }
  if (selection.kind === 'ladder') { const l = level.climbables.ladders[i]; return l ? { x: l.x, y: l.top, w: 0, h: l.bottom - l.top } : null }
  if (selection.kind === 'prop') { const b = level.props?.[i]; return b ? { x: b.x - propWidth(b) / 2, y: b.y - propHeight(b), w: propWidth(b), h: propHeight(b) } : null }
  if (selection.kind === 'robot') { const r = level.robots?.[i], h = r?.kind === 'repulsor' ? TUNING.height : 50; return r ? r.chargingBay ? chargingBayBounds(r, ROBOT_BAY_WIDTH_SCALE) : { x: r.x - 26, y: r.y - h, w: 52, h } : null }
  if (selection.kind === 'mechanism') return level.mechanisms?.[i] ?? null
  if (selection.kind === 'trigger') { const t = level.triggers?.[i]; return t ? t.mode === 'coins' ? coinSwitchBounds(t) : { x: t.x, y: t.y - (t.ceiling ? 0 : 8), w: t.w, h: 8 } : null }
  if (selection.kind === 'goal') return level.goal ? { ...level.goal, w: 0, h: 0 } : null
  if (selection.kind === 'timer') { const timer = level.timers?.[i]; return timer ? { ...timer, w: WALL_TIMER_WIDTH, h: WALL_TIMER_HEIGHT } : null }
  if (selection.kind === 'text') return level.texts?.[i] ?? null
  if (selection.kind === 'pickup') { const p = level.pickups?.[i]; return p ? pickupBounds(p) : null }
  if (selection.kind === 'evaluation-board') return level.evaluationBoards?.[i] ?? null
  const p = selection.kind === 'entrance' ? level.entrance : isHubDoor(selection) ? hubDoorAt(level, selection)
    : selection.kind === 'wall-door' ? level.wallDoors?.[i] : level.checkpoints[i]
  return p ? { x: p.x, y: p.y, w: 0, h: 0 } : null
}
export function itemOutline(level: JumpLevel, selection: Selection) {
  if (selection.kind === 'entrance') return entranceBounds(level.entrance)
  if (selection.kind === 'goal' && level.goal) return goalBounds(level.goal)
  if (isHubDoor(selection)) { const door = hubDoorAt(level, selection); return door ? hubDoorOutline(door) : null }
  if (selection.kind === 'wall-door') { const door = level.wallDoors?.[selection.index]; return door ? wallDoorBounds(door) : null }
  if (selection.kind === 'text') return level.texts?.[selection.index] ? wallTextBounds(level.texts[selection.index]) : null
  const robot = selection.kind === 'robot' ? level.robots?.[selection.index] : undefined
  if (robot) {
    if (robot.kind === 'repulsor' && !robot.chargingBay) {
      const bounds = itemBounds(level, selection)!
      return { ...bounds, y: robot.y - GOAL_DOOR_HEIGHT, h: GOAL_DOOR_HEIGHT }
    }
    const pose = editorRobotPose(level, robot)
    if (Math.abs(pose.angle) > .001) {
      const points = robotHulls({ ...pose, definition: robot, facing: -1, phase: 'patrol' }).flat()
      const x = Math.min(...points.map(p => p[0])), y = Math.min(...points.map(p => p[1]))
      return { x, y, w: Math.max(...points.map(p => p[0])) - x, h: Math.max(...points.map(p => p[1])) - y }
    }
  }
  const mechanism = selection.kind === 'mechanism' ? level.mechanisms?.[selection.index] : undefined
  if (mechanism) return mechanism.kind === 'lift' ? mechanismSweep(mechanism)
    : { x: mechanism.x, y: mechanism.y, w: mechanism.w, h: mechanism.h }
  const rope = selection.kind === 'rope' ? level.climbables.ropes[selection.index] : undefined
  const points = rope ? ropePath(rope) : undefined
  if (!points) return itemBounds(level, selection)
  const xs = points.map(p => p[0]), ys = points.map(p => p[1]), x = Math.min(...xs), y = Math.min(...ys)
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y }
}
export function itemHandle(level: JumpLevel, selection: Selection) {
  const tip = selection.kind === 'rope' ? level.climbables.ropes[selection.index]?.rest?.points.at(-1) : undefined
  const b = itemBounds(level, selection)
  return tip ? { x: tip[0], y: tip[1] } : b ? { x: b.x + b.w, y: b.y + b.h } : null
}
/** Adjust the far stop without moving or resizing the platform. */
export function setElevatorTravel(level: JumpLevel, index: number, travel: number): JumpLevel {
  if (level.mechanisms?.[index]?.kind !== 'lift' || !Number.isFinite(travel)) return level
  const next = copyLevel(level)
  next.mechanisms![index].travel = clamp(Math.round(travel), 60, 1200)
  return next
}
export function setTriggerTargets(level: JumpLevel, index: number, targets: readonly string[]): JumpLevel {
  return setSwitchTargets(level, { kind: 'trigger', index }, targets)
}
export function setSwitchTargets(level: JumpLevel, selection: Selection, targets: readonly string[]): JumpLevel {
  const next = copyLevel(level), source = switchSources(next).find(item => item.kind === selection.kind && item.index === selection.index)
  if (!source) return level
  if (source.kind === 'trigger') delete source.definition.target
  const available = new Set(switchedItems(next).map(item => item.id))
  source.definition.targets = [...new Set(targets.filter(id => available.has(id)))]
  // A level door or bulkhead without outputs saves without an empty list.
  if ((source.kind === 'course-door' || source.kind === 'bulkhead') && !source.definition.targets.length) delete source.definition.targets
  return next
}
export function setWallWiring(level: JumpLevel, selection: Selection, enabled: boolean, height?: number): JumpLevel {
  const next = copyLevel(level), source = switchSources(next).find(item => item.kind === selection.kind && item.index === selection.index)
  // Level doors, bulkheads and grade averages have no wall terminal.
  if (!source || source.kind === 'course-door' || source.kind === 'bulkhead' || source.kind === 'grade-gate' || height !== undefined && !Number.isFinite(height)) return level
  if (enabled) source.definition.showWires = true
  else delete source.definition.showWires
  if (height !== undefined) source.definition.wireHeight = clamp(Math.round(height), 0, levelHeight(next))
  return next
}
export function setPlateBehavior(level: JumpLevel, index: number, behavior: PlateBehavior, startsOn = false): JumpLevel {
  const before = level.triggers?.[index]
  if (!before || before.mode === 'coins' || !['pressure', 'switch', 'toggle'].includes(behavior)) return level
  const next = copyLevel(level), plate = next.triggers![index]
  if (plate.mode === 'coins') return level
  plate.behavior = behavior
  delete plate.startsOn
  if (behavior !== 'toggle') delete plate.toggleGroup
  if (behavior === 'toggle' && plate.toggleGroup) next.toggleGroups!.find(g => g.id === plate.toggleGroup)!.startsOn = startsOn
  else if (behavior === 'switch' || behavior === 'toggle') plate.startsOn = startsOn
  return next
}
/** Flip the artwork and exposed face. Gravity strength and wiring stay authored. */
export function setPlateCeiling(level: JumpLevel, selection: Selection, ceiling: boolean): JumpLevel {
  const item = selection.kind === 'gravity-plate' ? level.gravityPlates?.[selection.index]
    : selection.kind === 'trigger' ? level.triggers?.[selection.index] : null
  if (!item || 'mode' in item && item.mode === 'coins' || !!item.ceiling === ceiling) return level
  const next = copyLevel(level)
  const plate = selection.kind === 'gravity-plate' ? next.gravityPlates![selection.index] : next.triggers![selection.index]
  if ('mode' in plate && plate.mode === 'coins') return level
  if (ceiling) plate.ceiling = true; else delete plate.ceiling
  if ('mode' in plate) { plate.y = clamp(plate.y, ceiling ? 0 : 8, levelHeight(next) - (ceiling ? 8 : 0)); syncPressurePlateMounts(next) }
  return next
}
export function setPressurePlateMount(level: JumpLevel, index: number, mechanism: string | null): JumpLevel {
  const before = level.triggers?.[index]
  if (!before || before.mode === 'coins') return level
  const next = copyLevel(level), plate = next.triggers![index]
  if (plate.mode === 'coins') return level
  if (mechanism === null) { delete plate.mount; return next }
  const host = next.mechanisms?.find(m => m.id === mechanism && m.kind === 'lift' && m.w >= plate.w)
  if (!host) return level
  plate.mount = { mechanism: host.id, x: clamp(plate.x - host.x, 0, host.w - plate.w) }
  syncPressurePlateMounts(next)
  return next
}
export function setObjectPower(level: JumpLevel, selection: Selection, power: PowerMode): JumpLevel {
  if (power !== 'always' && power !== 'switched') return level
  if (isHubDoor(selection)) {
    // A door opens always, or only while its wiring is on, like a switched exit.
    if (!hubDoorAt(level, selection)) return level
    const next = copyLevel(level), door = hubDoorAt(next, selection)!
    if (power === 'switched') door.power = 'switched'
    else { removeSwitchTarget(next, door.id); delete door.power; delete door.switchLogic; delete door.switchReversed }
    return next
  }
  const next = copyLevel(level)
  const item = selection.kind === 'goal' ? next.goal : selection.kind === 'mechanism' ? next.mechanisms?.[selection.index]
    : selection.kind === 'force-field' ? next.forceFields?.[selection.index] : selection.kind === 'light' ? next.lighting?.lights[selection.index] : selection.kind === 'gravity-plate' ? next.gravityPlates?.[selection.index] : null
  if (!item || 'kind' in item && item.kind === 'gate' || 'effect' in item && item.effect === 'water') return level
  item.power = power
  if (selection.kind === 'goal' && !item.id) item.id = newLevelId()
  if (power === 'always') {
    removeSwitchTarget(next, item.id!)
    delete item.targets; delete item.relay
  }
  return next
}
export function setGravityPlateEffect(level: JumpLevel, index: number, effect: 'water' | 'gravity'): JumpLevel {
  const previous = level.gravityPlates?.[index]
  if (!previous || (previous.effect ?? 'gravity') === effect) return level
  const next = copyLevel(level), plate = next.gravityPlates![index]
  if (effect === 'water') {
    plate.effect = 'water'; plate.gravity = -1
    removeSwitchTarget(next, plate.id)
    delete plate.power; delete plate.ceiling; delete plate.switchLogic; delete plate.switchReversed; delete plate.relay; delete plate.targets
  } else {
    for (const action of ['fill', 'drain'] as const) removeSwitchTarget(next, waterControlId(plate.id, action))
    delete plate.effect; delete plate.waterLevel; delete plate.waterMinLevel; delete plate.waterRate; delete plate.fill; delete plate.drain; plate.power = 'always'
  }
  return next
}
export function setWaterControl(level: JumpLevel, index: number, action: 'fill' | 'drain', settings: Pick<SwitchSettings, 'switchLogic' | 'switchReversed'>): JumpLevel {
  if (level.gravityPlates?.[index]?.effect !== 'water') return level
  const next = copyLevel(level), plate = next.gravityPlates![index]
  plate[action] = { ...plate[action], ...settings }
  return next
}
export function setObjectSwitchLogic(level: JumpLevel, selection: Selection, logic: SwitchLogic): JumpLevel {
  if (!['or', 'and', 'xor'].includes(logic)) return level
  return editObjectSwitchSettings(level, selection, { switchLogic: logic })
}
export function setObjectSwitchReversed(level: JumpLevel, selection: Selection, reversed: boolean): JumpLevel {
  if (typeof reversed !== 'boolean') return level
  return editObjectSwitchSettings(level, selection, { switchReversed: reversed })
}
export function setObjectRelay(level: JumpLevel, selection: Selection, relay: boolean): JumpLevel {
  if (selection.kind === 'logic-relay' || typeof relay !== 'boolean') return level
  const next = editObjectSwitchSettings(level, selection, { relay })
  if (next !== level && !relay) {
    const item = switchedItems(next).find(item => item.kind === selection.kind && item.index === selection.index)!
    delete item.definition.targets
  }
  return next
}
/** A grade gate's threshold, the level doors it averages, and whether its result is reversed. */
export function editGradeGate(level: JumpLevel, index: number, patch: Partial<Pick<GradeGate, 'grade' | 'doors' | 'switchReversed'>>): JumpLevel {
  if (!level.gradeGates?.[index]) return level
  if (patch.grade !== undefined && !GRADE_LETTERS.includes(patch.grade)) return level
  const doorIds = new Set((level.courseDoors ?? []).map(door => door.id))
  if (patch.doors && patch.doors.some(id => !doorIds.has(id))) return level
  const next = copyLevel(level), gate = next.gradeGates![index]
  if (patch.grade) gate.grade = patch.grade
  // Keep the doors in their order in the area, so the list reads the same every time.
  if (patch.doors) gate.doors = (next.courseDoors ?? []).map(door => door.id).filter(id => patch.doors!.includes(id))
  if (patch.switchReversed !== undefined) { if (patch.switchReversed) gate.switchReversed = true; else delete gate.switchReversed }
  return next
}
function editObjectSwitchSettings(level: JumpLevel, selection: Selection, settings: SwitchSettings): JumpLevel {
  if (selection.kind === 'gravity-plate' && level.gravityPlates?.[selection.index]?.effect === 'water') return level
  if (!switchedItems(level).some(item => item.kind === selection.kind && item.index === selection.index)) return level
  const next = copyLevel(level)
  const item = switchedItems(next).find(item => item.kind === selection.kind && item.index === selection.index)!
  Object.assign(item.definition, settings)
  return next
}
export function editFloatSwitch(level: JumpLevel, index: number, patch: Partial<Pick<FloatSwitch, 'armLength' | 'size' | 'travelAngle' | 'flipX' | 'startsRaised' | 'activeWhen'>>): JumpLevel {
  if (!level.floatSwitches?.[index]) return level
  const next = copyLevel(level), f = next.floatSwitches![index]
  Object.assign(f, patch)
  if (![f.armLength, f.size, f.travelAngle ?? 45].every(Number.isFinite)) return level
  f.armLength = clamp(f.armLength, 40, 400); f.size = clamp(f.size, 20, 100)
  if (f.travelAngle !== undefined) f.travelAngle = clamp(f.travelAngle, 10, 80)
  if (f.activeWhen !== undefined && f.activeWhen !== 'raised' && f.activeWhen !== 'lowered') return level
  const b = floatSwitchBounds(f)
  if (b.w > next.width || b.h > levelHeight(next)) return level
  f.x += clamp(b.x, 0, next.width - b.w) - b.x
  f.y += clamp(b.y, 0, levelHeight(next) - b.h) - b.y
  return carryWallTerminals(level, next)
}
export function setCoinThreshold(level: JumpLevel, index: number, threshold: number): JumpLevel {
  if (level.triggers?.[index]?.mode !== 'coins' || !Number.isFinite(threshold)) return level
  const next = copyLevel(level), trigger = next.triggers![index]
  if (trigger.mode === 'coins') trigger.threshold = clamp(Math.round(threshold), 1, 80)
  return next
}
/** Converting an old bar keeps its center where room bounds allow it. Undo restores the original. */
export function setCoinSwitchDisplay(level: JumpLevel, index: number, display: 'digital' | 'bar'): JumpLevel {
  const before = level.triggers?.[index]
  if (before?.mode !== 'coins' || (before.display ?? 'bar') === display) return level
  const next = copyLevel(level), bounds = coinSwitchBounds(before)
  const w = DIGITAL_DISPLAY_WIDTH, h = display === 'digital' ? DIGITAL_DISPLAY_HEIGHT : COIN_SWITCH_THICKNESS
  const x = clamp(bounds.x + (bounds.w - w) / 2, 0, level.width - w)
  const y = clamp(bounds.y + (bounds.h - h) / 2, 0, levelHeight(level) - h)
  const connection = before.targets ? { targets: [...before.targets] } : { target: before.target }
  next.triggers![index] = { x, y, w, ...connection, mode: 'coins', threshold: before.threshold,
    ...(before.name ? { name: before.name } : {}), ...(display === 'digital' ? { display: 'digital' as const } : {}) }
  return next
}
export function setCoinSwitchOrientation(level: JumpLevel, index: number, orientation: 'horizontal' | 'vertical'): JumpLevel {
  const before = level.triggers?.[index]
  if (before?.mode !== 'coins' || before.display === 'digital' || (before.orientation ?? 'horizontal') === orientation) return level
  const next = copyLevel(level), trigger = next.triggers![index]
  if (trigger.mode !== 'coins') return level
  const bounds = coinSwitchBounds(trigger), length = trigger.orientation === 'vertical' ? trigger.h : trigger.w
  const dimensions = orientation === 'vertical' ? { orientation: 'vertical' as const, w: COIN_SWITCH_THICKNESS, h: length } : { w: length }
  const h = dimensions.h ?? COIN_SWITCH_THICKNESS
  const x = clamp(bounds.x + (bounds.w - dimensions.w) / 2, 0, level.width - dimensions.w)
  const y = clamp(bounds.y + (bounds.h - h) / 2, 0, levelHeight(level) - h)
  const connection = trigger.targets ? { targets: trigger.targets } : { target: trigger.target }
  next.triggers![index] = { x, y, ...dimensions, ...connection, mode: 'coins', threshold: trigger.threshold, ...(trigger.name ? { name: trigger.name } : {}) }
  return next
}
export function hitItem(level: JumpLevel, x: number, y: number, tolerance: number): Selection | null {
  return hitItems(level, x, y, tolerance).next().value ?? null
}

// Yield front to back so repeated clicks can reach obscured objects, using
// the same shapes and priority as the first hit without scanning behind it.
export function* hitItems(level: JumpLevel, x: number, y: number, tolerance: number): Generator<Selection, void> {
  // Logic nodes are studio overlays, so remain selectable even over terrain.
  for (let i = (level.floatSwitches?.length ?? 0) - 1; i >= 0; i--) {
    const f = level.floatSwitches![i], c = floatBallCenter(f), dx = c.x - f.x, dy = c.y - f.y
    const t = clamp(((x - f.x) * dx + (y - f.y) * dy) / f.armLength ** 2, 0, 1)
    if (Math.hypot(x - f.x, y - f.y) <= WALL_LIGHT_RADIUS + tolerance || Math.hypot(x - c.x, y - c.y) <= f.size / 2 + tolerance || Math.hypot(x - f.x - t * dx, y - f.y - t * dy) <= 5 + tolerance) yield { kind: 'float-switch', index: i }
  }
  for (let i = (level.logicRelays?.length ?? 0) - 1; i >= 0; i--) {
    const b = logicRelayBounds(level.logicRelays![i])
    if (x >= b.x - tolerance && x <= b.x + b.w + tolerance && y >= b.y - tolerance && y <= b.y + b.h + tolerance) yield { kind: 'logic-relay', index: i }
  }
  for (let i = (level.gradeGates?.length ?? 0) - 1; i >= 0; i--) {
    const b = gradeGateBounds(level.gradeGates![i])
    if (x >= b.x - tolerance && x <= b.x + b.w + tolerance && y >= b.y - tolerance && y <= b.y + b.h + tolerance) yield { kind: 'grade-gate', index: i }
  }
  const entrance = entranceBounds(level.entrance)
  if (x >= entrance.x - tolerance && x <= entrance.x + entrance.w + tolerance && y >= entrance.y - tolerance && y <= entrance.y + entrance.h + tolerance) yield { kind: 'entrance', index: 0 }
  for (const kind of ['course-door', 'bulkhead'] as const) {
    const doors = kind === 'course-door' ? level.courseDoors : level.bulkheads
    for (let i = (doors?.length ?? 0) - 1; i >= 0; i--) {
      const b = hubDoorOutline(doors![i])
      if (x >= b.x - tolerance && x <= b.x + b.w + tolerance && y >= b.y - tolerance && y <= b.y + b.h + tolerance) yield { kind, index: i }
    }
  }
  for (let i = level.checkpoints.length - 1; i >= 0; i--) if (Math.hypot(x - level.checkpoints[i].x, y - level.checkpoints[i].y + 25) < tolerance * 3) yield { kind: 'checkpoint', index: i }
  if (level.goal) {
    const b = goalBounds(level.goal)
    if (x >= b.x - tolerance && x <= b.x + b.w + tolerance && y >= b.y - tolerance && y <= b.y + b.h + tolerance) yield { kind: 'goal', index: 0 }
  }
  for (let i = (level.pickups?.length ?? 0) - 1; i >= 0; i--) {
    const b = pickupBounds(level.pickups![i])
    if (x >= b.x - tolerance && x <= b.x + b.w + tolerance && y >= b.y - tolerance && y <= b.y + b.h + tolerance) yield { kind: 'pickup', index: i }
  }
  for (const kind of ['prop', 'robot', 'trigger', 'mechanism', 'force-field'] as const) {
    const length = (kind === 'prop' ? level.props : kind === 'robot' ? level.robots : kind === 'trigger' ? level.triggers : kind === 'force-field' ? level.forceFields : level.mechanisms)?.length ?? 0
    for (let i = length - 1; i >= 0; i--) {
      const b = kind === 'robot' ? itemOutline(level, { kind, index: i })! : itemBounds(level, { kind, index: i })!
      if (x >= b.x - tolerance && x <= b.x + b.w + tolerance && y >= b.y - tolerance && y <= b.y + b.h + tolerance) {
        yield { kind, index: i }; continue
      }
      if (kind === 'mechanism' && level.mechanisms![i].kind === 'lift') {
        const m = level.mechanisms![i], anchor = mechanismAnchor(m), end = mechanismRopeEnd(m)
        const dx = end.x - anchor.x, dy = end.y - anchor.y
        const t = clamp(((x - anchor.x) * dx + (y - anchor.y) * dy) / (dx * dx + dy * dy || 1), 0, 1)
        if (Math.hypot(x - anchor.x - t * dx, y - anchor.y - t * dy) <= tolerance + 5) yield { kind, index: i }
      }
    }
  }
  for (let i = level.climbables.ropes.length - 1; i >= 0; i--) {
    const r = level.climbables.ropes[i]
    const points = ropePath(r)
    if (points.slice(1).some((b, j) => {
      const a = points[j], dx = b[0] - a[0], dy = b[1] - a[1]
      const t = clamp(((x - a[0]) * dx + (y - a[1]) * dy) / (dx * dx + dy * dy || 1), 0, 1)
      return Math.hypot(x - a[0] - t * dx, y - a[1] - t * dy) <= tolerance
    })) yield { kind: 'rope', index: i }
  }
  for (let i = level.climbables.ladders.length - 1; i >= 0; i--) {
    const l = level.climbables.ladders[i]
    if (Math.abs(x - l.x) <= tolerance + 8 && y >= l.top - tolerance && y <= l.bottom + tolerance) yield { kind: 'ladder', index: i }
  }
  const terrainOrder = terrainDrawOrder(level.platforms)
  for (let position = terrainOrder.length - 1; position >= 0; position--) {
    const i = terrainOrder[position]
    const b = level.platforms[i]
    if (pointInside(b, x, y)) yield { kind: 'platform', index: i }
  }
  for (let i = (level.gravityPlates?.length ?? 0) - 1; i >= 0; i--) {
    const b = level.gravityPlates![i]
    // The emitter and rectangle outline select the device; its interior lets
    // the pointer reach actors and terrain within the field.
    const inside = x >= b.x - tolerance && x <= b.x + b.w + tolerance && y >= b.y - tolerance && y <= b.y + b.h + tolerance
    if (inside && (b.effect === 'water' || Math.abs(x - b.x) <= tolerance || Math.abs(x - b.x - b.w) <= tolerance
      || Math.abs(y - b.y) <= tolerance || Math.abs(y - b.y - b.h) <= tolerance
      || (b.ceiling ? y <= b.y + 10 + tolerance : y >= b.y + b.h - 10 - tolerance))) yield { kind: 'gravity-plate', index: i }
  }
  // Wall objects sit behind the terrain and other playable objects.
  for (let i = (level.wallLights?.length ?? 0) - 1; i >= 0; i--) {
    const b = wallLightBounds(level.wallLights![i])
    if (x >= b.x - tolerance && x <= b.x + b.w + tolerance && y >= b.y - tolerance && y <= b.y + b.h + tolerance) yield { kind: 'wall-light', index: i }
  }
  for (let i = (level.lighting?.lights.length ?? 0) - 1; i >= 0; i--) {
    const b = lightBounds(level.lighting!.lights[i])
    if (x >= b.x - tolerance && x <= b.x + b.w + tolerance && y >= b.y - tolerance && y <= b.y + b.h + tolerance) yield { kind: 'light', index: i }
  }
  for (let i = (level.timers?.length ?? 0) - 1; i >= 0; i--) {
    const t = level.timers![i]
    if (x >= t.x - tolerance && x <= t.x + WALL_TIMER_WIDTH + tolerance && y >= t.y - tolerance && y <= t.y + WALL_TIMER_HEIGHT + tolerance) yield { kind: 'timer', index: i }
  }
  for (let i = (level.wallDoors?.length ?? 0) - 1; i >= 0; i--) {
    const b = wallDoorBounds(level.wallDoors![i])
    if (x >= b.x - tolerance && x <= b.x + b.w + tolerance && y >= b.y - tolerance && y <= b.y + b.h + tolerance) yield { kind: 'wall-door', index: i }
  }
  for (let i = (level.evaluationBoards?.length ?? 0) - 1; i >= 0; i--) {
    const b = level.evaluationBoards![i]
    if (x >= b.x - tolerance && x <= b.x + b.w + tolerance && y >= b.y - tolerance && y <= b.y + b.h + tolerance) yield { kind: 'evaluation-board', index: i }
  }
  for (let i = (level.texts?.length ?? 0) - 1; i >= 0; i--) {
    const t = level.texts![i]
    const local = wallTextLocalPoint(t, x, y)
    if (local.x >= -tolerance && local.x <= t.w + tolerance && local.y >= -tolerance && local.y <= t.h + tolerance) yield { kind: 'text', index: i }
  }
  // Background interiors remain available for marquee selection and panning.
  // Their outline or the Back walls list selects them without hiding objects.
  for (let i = (level.environment?.walls.length ?? 0) - 1; i >= 0; i--)
    if (backWallEdgeAt(level.environment!.walls[i], x, y, tolerance)) yield { kind: 'back-wall', index: i }
}
export function replacePlatform(level: JumpLevel, index: number, platform: Platform): JumpLevel {
  const next = copyLevel(level), before = level.platforms[index]
  next.platforms[index] = { ...(before.name ? { name: before.name } : {}), ...(before.zIndex === undefined ? {} : { zIndex: before.zIndex }),
    ...(before.groundCover === undefined ? {} : { groundCover: before.groundCover }), ...platform }
  for (const ladder of next.climbables.ladders) if (ladder.platform === index) {
    ladder.x = ladder.side === 1 ? platform.x - 16 : platform.x + platform.w + 16
    ladder.bottom += platform.y - before.y; ladder.top = platform.y
  }
  for (const rope of next.climbables.ropes) for (const point of ropeEnds(rope)) if (point.anchor?.platform === index) {
    point.anchor.x *= platform.w / before.w; point.anchor.y *= platform.h / before.h
    const edge = nearestBoundary(platform, platform.x + point.anchor.x, platform.y + point.anchor.y)
    point.x = edge.x; point.y = edge.y; point.anchor.x = edge.x - platform.x; point.anchor.y = edge.y - platform.y
    fitTiedRope(rope)
  }
  // Carry start/checkpoint markers and doors with the surface that supports them.
  for (const p of [next.entrance, ...next.checkpoints, ...(next.goal ? [next.goal] : []), ...(next.courseDoors ?? []), ...(next.bulkheads ?? []), ...(next.wallDoors ?? [])]) {
    const supportX = p === next.goal ? (() => { const b = goalBounds(next.goal); return b.x + b.w / 2 })() : p.x
    if (supportX < before.x || supportX > before.x + before.w || Math.abs(p.y - platformSurface(before, supportX).y) >= .1) continue
    const carriedX = platform.x + (supportX - before.x) / before.w * platform.w
    p.x += carriedX - supportX; p.y = platformSurface(platform, carriedX).y
  }
  return carryWallTerminals(level, next)
}

/** Transform the selected terrain and its rope anchors without moving other objects. */
export function transformTerrain(level: JumpLevel, index: number, transform: TerrainTransform): JumpLevel {
  const before = level.platforms[index]
  if (!before) return level
  const rotate = transform === 'rotate-left' || transform === 'rotate-right'
  const w = rotate ? before.h : before.w, h = rotate ? before.w : before.h
  if (w > level.width || h > levelHeight(level)) throw new Error(`${objectReference(level, 'platform', index)} is too large to rotate inside the level. Resize it or enlarge the level first.`)
  if (w < 10 || h < 8) throw new Error(`${objectReference(level, 'platform', index)} is too thin to rotate. Resize it first.`)
  const point = (x: number, y: number): [number, number] => {
    if (transform === 'rotate-left') return [y, before.w - x]
    if (transform === 'rotate-right') return [before.h - y, x]
    if (transform === 'flip-horizontal') return [before.w - x, y]
    return [x, before.h - y]
  }
  const next = copyLevel(level), terrain = next.platforms[index]
  // Preserve the center wherever possible; translate only enough to fit the room.
  terrain.x = clamp(before.x + (before.w - w) / 2, 0, level.width - w)
  terrain.y = clamp(before.y + (before.h - h) / 2, 0, levelHeight(level) - h)
  terrain.w = w; terrain.h = h
  if (before.profile || before.polygon) {
    const polygon = terrainNodes({ ...before, x: 0, y: 0 }).map(([x, y]) => point(x, y))
    if (!before.bezier && !validPolygon(polygon)) throw new Error(`${objectReference(level, 'platform', index)} cannot be transformed as an editable polygon. Simplify its outline first.`)
    delete terrain.profile
    terrain.polygon = polygon
    if (before.bezier) {
      const origin = point(0, 0), vector = (p: Vec) => relativePoint(point(p[0], p[1]), origin)
      terrain.bezier = before.bezier.map(handle => handle && ({ ...handle,
        ...(handle.in ? { in: vector(handle.in) } : {}), ...(handle.out ? { out: vector(handle.out) } : {}) }))
    }
  }
  for (const rope of next.climbables.ropes) for (const end of ropeEnds(rope)) if (end.anchor?.platform === index) {
    const [x, y] = point(end.anchor.x, end.anchor.y)
    end.anchor.x = x; end.anchor.y = y
    end.x = terrain.x + x; end.y = terrain.y + y
    fitTiedRope(rope)
    delete rope.rest
  }
  // Legacy ladders are always upright. Leave them in place as independent ladders.
  if (rotate) for (const ladder of next.climbables.ladders) if (ladder.platform === index) ladder.platform = -1
  return next
}

export function moveItem(level: JumpLevel, selection: Selection, dx: number, dy: number): JumpLevel {
  const b = itemBounds(level, selection)
  if (!b) return level
  const tied = selection.kind === 'rope' ? level.climbables.ropes[selection.index]?.end : undefined
  if (tied) {
    // A tied rope moves whole, both anchors inside the level; either anchor moves alone by its handle.
    const rope = level.climbables.ropes[selection.index]
    const mx = clamp(dx, -Math.min(rope.x, tied.x), level.width - Math.max(rope.x, tied.x))
    const my = clamp(dy, -Math.min(rope.y, tied.y), levelHeight(level) - Math.max(rope.y, tied.y))
    const next = copyLevel(level), moved = next.climbables.ropes[selection.index]
    for (const point of ropeEnds(moved)) { point.x += mx; point.y += my; delete point.anchor }
    delete moved.rest
    return next
  }
  const attached = selection.kind === 'platform' ? level.climbables.ladders.filter(l => l.platform === selection.index) : []
  const x = clamp(b.x + dx, attached.some(l => l.side === 1) ? 16 : 0, level.width - b.w - (attached.some(l => l.side === -1) ? 16 : 0))
  const y = clamp(b.y + dy, 0, levelHeight(level) - b.h)
  if (selection.kind === 'platform') return replacePlatform(level, selection.index, { ...level.platforms[selection.index], x, y })
  const next = copyLevel(level)
  if (selection.kind === 'back-wall') Object.assign(next.environment!.walls[selection.index], { x, y })
  if (selection.kind === 'rope') { Object.assign(next.climbables.ropes[selection.index], { x, y }); delete next.climbables.ropes[selection.index].anchor }
  if (selection.kind === 'ladder') {
    const ladder = next.climbables.ladders[selection.index]
    ladder.x = x; ladder.bottom = y + b.h; ladder.top = y; ladder.platform = -1
  }
  // Moving a marker must honor the requested height, even before its supporting
  // terrain is built. Snapping every move to ground traps nudges at the floor.
  if (selection.kind === 'entrance') next.entrance = { ...next.entrance, x: clamp(x, GOAL_DOOR_WIDTH / 2, level.width - GOAL_DOOR_WIDTH / 2), y: clamp(y, GOAL_DOOR_HEIGHT, levelHeight(level)) }
  if (isHubDoor(selection) || selection.kind === 'wall-door') Object.assign(isHubDoor(selection) ? hubDoorAt(next, selection)! : next.wallDoors![selection.index],
    { x: clamp(x, GOAL_DOOR_WIDTH / 2, level.width - GOAL_DOOR_WIDTH / 2), y: clamp(y, GOAL_DOOR_HEIGHT, levelHeight(level)) })
  if (selection.kind === 'evaluation-board') Object.assign(next.evaluationBoards![selection.index], { x, y })
  if (selection.kind === 'checkpoint') Object.assign(next.checkpoints[selection.index], { x, y })
  if (selection.kind === 'goal') {
    const b = goalBounds({ ...next.goal, x: 0, y: 0 })
    next.goal = { ...next.goal, x: next.goal?.kind === 'walk-off' ? level.width : clamp(x, Math.max(0, -b.x), Math.min(level.width, level.width - b.x - b.w)), y }
  }
  if (selection.kind === 'timer') Object.assign(next.timers![selection.index], { x, y })
  if (selection.kind === 'text') next.texts![selection.index] = fitWallText({ ...next.texts![selection.index], x: b.x + dx, y: b.y + dy }, next.width, levelHeight(next))
  if (selection.kind === 'pickup') {
    const bounds = pickupBounds({ kind: next.pickups![selection.index].kind, x: 0, y: 0 })
    Object.assign(next.pickups![selection.index], { x: x - bounds.x, y: y - bounds.y })
  }
  if (selection.kind === 'prop') Object.assign(next.props![selection.index], { x: x + b.w / 2, y: Math.min(next.floor!, y + b.h) })
  if (selection.kind === 'robot') {
    const r = next.robots![selection.index], point = { x: clamp(x + r.x - b.x, ROBOT_HALF_WIDTH, next.width - ROBOT_HALF_WIDTH), y: y + 50 }
    point.y = y + b.h
    Object.assign(r, point, pusherRange(next, point.x, point.y))
  }
  if (selection.kind === 'mechanism') {
    const mechanism = next.mechanisms![selection.index]
    Object.assign(mechanism, { x, y: Math.min(next.floor! - b.h, y) })
  }
  if (selection.kind === 'force-field') Object.assign(next.forceFields![selection.index], { x, y })
  if (selection.kind === 'gravity-plate') Object.assign(next.gravityPlates![selection.index], { x, y })
  if (selection.kind === 'light') Object.assign(next.lighting!.lights[selection.index], { x: x + b.w / 2, y: y + b.h / 2 })
  if (selection.kind === 'wall-light') Object.assign(next.wallLights![selection.index], { x: x + b.w / 2, y: y + b.h / 2 })
  if (selection.kind === 'float-switch') { const f = next.floatSwitches![selection.index]; f.x += x - b.x; f.y += y - b.y }
  if (selection.kind === 'logic-relay') Object.assign(next.logicRelays![selection.index], { x: x + b.w / 2, y: y + b.h / 2 })
  if (selection.kind === 'grade-gate') Object.assign(next.gradeGates![selection.index], { x: x + b.w / 2, y: y + b.h / 2 })
  if (selection.kind === 'trigger') {
    const t = next.triggers![selection.index]; t.x = x; t.y = t.mode === 'coins' || t.ceiling ? y : y + 8
    attachPressurePlateOnSurface(next, t)
  }
  if (selection.kind === 'mechanism') syncPressurePlateMounts(next)
  return carryWallTerminals(level, next)
}
export function resizeItem(level: JumpLevel, selection: Selection, w: number, h: number, handle?: ResizeHandle): JumpLevel {
  const next = copyLevel(level)
  const corner = handle ?? 'bottom-right'
  const left = corner.endsWith('left'), top = corner.startsWith('top')
  if (selection.kind === 'back-wall') {
    const wall = next.environment!.walls[selection.index], before = { ...wall }
    wall.w = clamp(w, 10, left ? before.x + before.w : next.width - before.x)
    wall.h = clamp(h, 10, top ? before.y + before.h : levelHeight(next) - before.y)
    if (left) wall.x = before.x + before.w - wall.w
    if (top) wall.y = before.y + before.h - wall.h
    if (before.polygon) wall.polygon = before.polygon.map(([x, y]) => [x / before.w * wall.w, y / before.h * wall.h])
  }
  if (selection.kind === 'force-field') {
    const field = next.forceFields![selection.index], before = { ...field }
    if (field.orientation === 'horizontal') {
      field.w = clamp(w, FORCE_FIELD_MIN_LENGTH, left ? before.x + before.w : next.width - before.x)
      if (left) field.x = before.x + before.w - field.w
    } else {
      field.h = clamp(h, FORCE_FIELD_MIN_LENGTH, top ? before.y + before.h : levelHeight(next) - before.y)
      if (top) field.y = before.y + before.h - field.h
    }
  }
  if (selection.kind === 'evaluation-board') {
    const board = next.evaluationBoards![selection.index], before = { ...board }
    board.w = clamp(w, 120, Math.min(1200, left ? before.x + before.w : next.width - before.x))
    board.h = clamp(h, 60, Math.min(600, top ? before.y + before.h : levelHeight(next) - before.y))
    if (left) board.x = before.x + before.w - board.w
    if (top) board.y = before.y + before.h - board.h
  }
  if (selection.kind === 'gravity-plate') {
    const p = next.gravityPlates![selection.index], before = { ...p }
    p.w = clamp(w, 40, left ? before.x + before.w : next.width - before.x)
    p.h = clamp(h, 40, top ? before.y + before.h : levelHeight(next) - before.y)
    if (left) p.x = before.x + before.w - p.w
    if (top) p.y = before.y + before.h - p.h
  }
  if (selection.kind === 'text') {
    const t = next.texts![selection.index], before = { ...t }
    const fixed = wallTextPoint(before, left ? before.w : 0, top ? before.h : 0)
    t.w = clamp(w, 40, 2000); t.h = clamp(h, 24, 1200)
    const moved = wallTextPoint(t, left ? t.w : 0, top ? t.h : 0)
    t.x += fixed.x - moved.x; t.y += fixed.y - moved.y
    next.texts![selection.index] = fitWallText(t, next.width, levelHeight(next))
  }
  if (selection.kind === 'platform') {
    const before = level.platforms[selection.index], left = corner.endsWith('left'), top = corner.startsWith('top')
    const ladders = level.climbables.ladders.filter(l => l.platform === selection.index)
    const minX = ladders.some(l => l.side === 1) ? 16 : 0, maxX = level.width - (ladders.some(l => l.side === -1) ? 16 : 0)
    const width = clamp(w, 20, left ? before.x + before.w - minX : maxX - before.x)
    const height = clamp(h, 10, top ? before.y + before.h : levelHeight(level) - before.y)
    const x = left ? before.x + before.w - width : before.x, y = top ? before.y + before.h - height : before.y
    return replacePlatform(level, selection.index, { ...before, x, y, w: width, h: height,
      ...(before.polygon ? { polygon: before.polygon.map(([x, y]) => [x / before.w * width, y / before.h * height] as [number, number]) } : {}),
      ...(before.bezier ? { bezier: before.bezier.map(handle => handle && ({ ...handle,
        ...(handle.in ? { in: [handle.in[0] / before.w * width, handle.in[1] / before.h * height] as Vec } : {}),
        ...(handle.out ? { out: [handle.out[0] / before.w * width, handle.out[1] / before.h * height] as Vec } : {}) })) } : {}),
      ...(before.profile ? { profile: before.profile.map(([x, y]) => [x / before.w * width, y / before.h * height] as [number, number]) } : {}) })
  }
  if (selection.kind === 'rope') {
    // A tied rope sags between its anchors; it can lengthen to 2,000 but never shorten past their span.
    const rope = next.climbables.ropes[selection.index]
    rope.length = rope.end ? clamp(h, Math.max(80, Math.ceil(tiedRopeSpan(rope))), 2000) : clamp(h, 80, Math.min(2000, levelHeight(level) - rope.y))
  }
  if (selection.kind === 'ladder') {
    const ladder = next.climbables.ladders[selection.index]
    if (top) ladder.top = clamp(ladder.bottom - h, 0, ladder.bottom - 80)
    else ladder.bottom = clamp(ladder.top + h, ladder.top + 80, levelHeight(level))
    ladder.platform = -1
  }
  if (selection.kind === 'prop') {
    const b = next.props![selection.index], before = itemBounds(level, selection)!
    const requested = Math.abs(w - before.w) >= Math.abs(h - before.h) ? w * b.size / before.w : h * b.size / before.h
    const maxWidth = handle ? left ? before.x + before.w : next.width - before.x : Math.min(b.x, next.width - b.x) * 2
    const maxHeight = !handle || top ? b.y : levelHeight(level) - before.y
    b.size = clamp(requested, 30, Math.min(200, maxWidth / (b.gadget ? .4 : 1), maxHeight / (b.gadget ? .2 : 1)))
    if (handle) { b.x = left ? before.x + before.w - propWidth(b) / 2 : before.x + propWidth(b) / 2; b.y = top ? b.y : before.y + propHeight(b) }
    b.x = clamp(b.x, b.size / 2, next.width - b.size / 2)
  }
  if (selection.kind === 'mechanism') {
    const m = next.mechanisms![selection.index], before = { ...m }
    const vertical = m.kind === 'gate' && !isHorizontalGate(m), keepBottom = vertical && (!handle || top)
    const minWidth = Math.max(30, ...(next.triggers ?? []).flatMap(t => t.mode !== 'coins' && t.mount?.mechanism === m.id ? [t.w] : []))
    m.w = vertical ? MECHANISM_THICKNESS : clamp(w, minWidth, Math.min(600, left ? m.x + m.w : next.width - m.x))
    m.h = vertical ? clamp(h, 12, Math.min(800, keepBottom ? m.y + m.h : next.floor! - m.y)) : MECHANISM_THICKNESS
    if (left) m.x = before.x + before.w - m.w
    if (keepBottom) m.y = before.y + before.h - m.h
    m.travel = mechanismTravel(m)
  }
  if (selection.kind === 'trigger') {
    const t = next.triggers![selection.index]
    if (t.mode === 'coins' && t.display === 'digital') return level
    if (t.mode === 'coins' && t.orientation === 'vertical') {
      const bottom = t.y + t.h
      t.h = clamp(h, COIN_SWITCH_MIN_LENGTH, Math.min(240, top ? bottom : levelHeight(next) - t.y))
      if (top) t.y = bottom - t.h
    } else {
      const right = t.x + t.w
      t.w = clamp(w, t.mode === 'coins' ? COIN_SWITCH_MIN_LENGTH : 40, Math.min(240, left ? right : next.width - t.x))
      if (left) t.x = right - t.w
    }
    if (t.mode !== 'coins' && t.mount) {
      const host = next.mechanisms?.find(m => m.id === t.mount!.mechanism)
      if (host) { t.w = Math.min(t.w, host.w); t.x = clamp(t.x, host.x, host.x + host.w - t.w) }
      attachPressurePlateOnSurface(next, t)
    }
  }
  if (selection.kind === 'mechanism') syncPressurePlateMounts(next)
  return carryWallTerminals(level, next)
}
export function deleteItem(level: JumpLevel, selection: Selection): JumpLevel {
  const next = copyLevel(level), i = selection.index
  if (selection.kind === 'entrance' || selection.kind === 'goal') return level
  if (selection.kind === 'platform') {
    next.platforms.splice(i, 1)
    next.climbables.ladders = next.climbables.ladders.map(l => ({ ...l, platform: l.platform === i ? -1 : l.platform > i ? l.platform - 1 : l.platform }))
    for (const r of next.climbables.ropes) for (const point of ropeEnds(r)) if (point.anchor) {
      if (point.anchor.platform === i) delete point.anchor
      else if (point.anchor.platform > i) point.anchor.platform--
    }
  } else if (selection.kind === 'back-wall') next.environment!.walls.splice(i, 1)
  else if (selection.kind === 'rope') {
    const [rope] = next.climbables.ropes.splice(i, 1)
    if (rope.release) removeSwitchTarget(next, rope.release.id)
  }
  else if (selection.kind === 'timer') next.timers!.splice(i, 1)
  else if (selection.kind === 'text') next.texts!.splice(i, 1)
  else if (selection.kind === 'pickup') next.pickups!.splice(i, 1)
  else if (selection.kind === 'ladder') next.climbables.ladders.splice(i, 1)
  else if (selection.kind === 'prop') next.props!.splice(i, 1)
  else if (selection.kind === 'robot') next.robots!.splice(i, 1)
  else if (selection.kind === 'trigger') next.triggers!.splice(i, 1)
  else if (selection.kind === 'force-field') {
    const [field] = next.forceFields!.splice(i, 1)
    removeSwitchTarget(next, field.id)
  }
  else if (selection.kind === 'gravity-plate') {
    const [plate] = next.gravityPlates!.splice(i, 1)
    removeSwitchTarget(next, plate.id)
    for (const action of ['fill', 'drain'] as const) removeSwitchTarget(next, waterControlId(plate.id, action))
  }
  else if (selection.kind === 'wall-light') {
    const [light] = next.wallLights!.splice(i, 1)
    removeSwitchTarget(next, light.id)
  }
  else if (selection.kind === 'float-switch') next.floatSwitches!.splice(i, 1)
  else if (selection.kind === 'course-door') {
    // Its switch goes with it, and no wiring or average still names it.
    const [door] = next.courseDoors!.splice(i, 1)
    removeSwitchTarget(next, door.id)
    for (const gate of next.gradeGates ?? []) gate.doors = gate.doors.filter(id => id !== door.id)
    for (const other of next.courseDoors!) if (other.returnsTo === door.id) delete other.returnsTo
  }
  else if (selection.kind === 'bulkhead') {
    const [door] = next.bulkheads!.splice(i, 1); removeSwitchTarget(next, door.id)
    // A level door that returned the robot through it returns through its own doorway again.
    for (const other of next.courseDoors ?? []) if (other.returnsTo === door.id) delete other.returnsTo
  }
  else if (selection.kind === 'grade-gate') next.gradeGates!.splice(i, 1)
  else if (selection.kind === 'evaluation-board') next.evaluationBoards!.splice(i, 1)
  else if (selection.kind === 'wall-door') next.wallDoors!.splice(i, 1)
  else if (selection.kind === 'logic-relay') {
    const [relay] = next.logicRelays!.splice(i, 1)
    removeSwitchTarget(next, relay.id)
  }
  else if (selection.kind === 'light') {
    const [light] = next.lighting!.lights.splice(i, 1)
    removeSwitchTarget(next, light.id)
  }
  else if (selection.kind === 'mechanism') {
    const [m] = next.mechanisms!.splice(i, 1)
    removeSwitchTarget(next, m.id)
    syncPressurePlateMounts(next)
  }
  else next.checkpoints.splice(i, 1)
  removeEditorGroupMember(next, selection)
  return next
}
export function addItem(level: JumpLevel, tool: Tool, start: { x: number; y: number }, end: { x: number; y: number }): { level: JumpLevel; selection: Selection } | null {
  const next = copyLevel(level), x = clamp(Math.min(start.x, end.x), 0, level.width - 40), y = clamp(Math.min(start.y, end.y), 0, levelHeight(level) - 80)
  if (tool === 'wall-door') {
    const doors = next.wallDoors ??= []
    if (doors.length >= MAX_WALL_DOORS) throw new Error(`This level already has ${MAX_WALL_DOORS} wall doors.`)
    doors.push({ x: clamp(end.x, GOAL_DOOR_WIDTH / 2, next.width - GOAL_DOOR_WIDTH / 2), y: clamp(end.y, GOAL_DOOR_HEIGHT, levelHeight(next)), condition: 'jammed' })
    return { level: next, selection: { kind: 'wall-door', index: doors.length - 1 } }
  }
  if (tool === 'grade-gate') {
    if (!isHubLevel(next)) throw new Error('Grade averages belong in facility areas, with the level doors they average. Change Type in the Level settings first.')
    const gates = next.gradeGates ??= []
    if (gates.length >= MAX_GRADE_GATES) throw new Error(`This level already has ${MAX_GRADE_GATES} grade averages.`)
    gates.push({ id: newLevelId(), x: clamp(start.x, GRADE_GATE_WIDTH / 2, next.width - GRADE_GATE_WIDTH / 2),
      y: clamp(start.y, GRADE_GATE_HEIGHT / 2, levelHeight(next) - GRADE_GATE_HEIGHT / 2), doors: [], grade: 'd', targets: [] })
    return { level: next, selection: { kind: 'grade-gate', index: gates.length - 1 } }
  }
  if (tool === 'course-door' || tool === 'bulkhead' || tool === 'evaluation-board') {
    if (!isHubLevel(next)) throw new Error('Level doors, bulkheads and evaluation boards belong in facility areas. Change Type in the Level settings first.')
    if (tool === 'evaluation-board') {
      if (next.evaluationBoards.length >= MAX_EVALUATION_BOARDS) throw new Error(`This level already has ${MAX_EVALUATION_BOARDS} evaluation boards.`)
      const click = Math.hypot(end.x - start.x, end.y - start.y) < 10
      const w = clamp(click ? 460 : Math.abs(end.x - start.x), 120, Math.min(1200, next.width)), h = clamp(click ? 250 : Math.abs(end.y - start.y), 60, Math.min(600, levelHeight(next)))
      next.evaluationBoards.push({ id: newLevelId(), x: clamp(Math.min(start.x, end.x), 0, next.width - w), y: clamp(Math.min(start.y, end.y), 0, levelHeight(next) - h), w, h })
      return { level: next, selection: { kind: tool, index: next.evaluationBoards.length - 1 } }
    }
    const doors: (CourseDoor | Bulkhead)[] = tool === 'course-door' ? next.courseDoors : next.bulkheads, max = tool === 'course-door' ? MAX_COURSE_DOORS : MAX_BULKHEADS
    if (doors.length >= max) throw new Error(`This level already has ${max} ${tool === 'course-door' ? 'level doors' : 'bulkheads'}.`)
    // Like the entrance, a door's point is the middle of its sill.
    const door = { id: newLevelId(), x: clamp(end.x, GOAL_DOOR_WIDTH / 2, next.width - GOAL_DOOR_WIDTH / 2), y: clamp(end.y, GOAL_DOOR_HEIGHT, levelHeight(next)) }
    if (tool === 'course-door') next.courseDoors.push({ ...door, course: '' })
    else next.bulkheads.push({ ...door, to: '' })
    return { level: next, selection: { kind: tool, index: doors.length - 1 } }
  }
  if (tool === 'back-wall') {
    const changed = prepareBackWall(next), environment = changed.environment!
    if (environment.walls.length >= 40) throw new Error('This level already has 40 back walls.')
    const wallX = clamp(Math.min(start.x, end.x), 0, level.width - 10), wallY = clamp(Math.min(start.y, end.y), 0, levelHeight(level) - 10)
    const w = clamp(Math.abs(end.x - start.x) || 320, 10, level.width - wallX), h = clamp(Math.abs(end.y - start.y) || 240, 10, levelHeight(level) - wallY)
    const index = environment.walls.push({ kind: environment.kind === 'landscape' ? 'cave' : 'facility', x: wallX, y: wallY, w, h,
      lighting: environment.baseLighting === 'night' ? 'day' : 'night' }) - 1
    return { level: changed, selection: { kind: 'back-wall', index } }
  }
  if (tool === 'float-switch') {
    const trial = asTrial(next), floats = trial.floatSwitches ??= []
    if (floats.length >= MAX_FLOAT_SWITCHES) throw new Error('This level already has 16 float switches.')
    const definition = { id: newLevelId(), x: start.x, y: start.y, armLength: 100, size: 40, targets: [] }
    const b = floatSwitchBounds(definition)
    definition.x += clamp(b.x, 0, trial.width - b.w) - b.x
    definition.y += clamp(b.y, 0, levelHeight(trial) - b.h) - b.y
    floats.push(definition)
    return { level: trial, selection: { kind: 'float-switch', index: floats.length - 1 } }
  }
  if (tool === 'logic-relay') {
    const trial = asTrial(next), relays = trial.logicRelays ??= []
    if (relays.length >= MAX_LOGIC_RELAYS) throw new Error('This level already has 40 logic relays.')
    relays.push({ id: newLevelId(), x: clamp(start.x, LOGIC_RELAY_WIDTH / 2, trial.width - LOGIC_RELAY_WIDTH / 2),
      y: clamp(start.y, LOGIC_RELAY_HEIGHT / 2, levelHeight(trial) - LOGIC_RELAY_HEIGHT / 2), targets: [] })
    return { level: trial, selection: { kind: 'logic-relay', index: relays.length - 1 } }
  }
  if (tool === 'force-field' || tool === 'horizontal-force-field') {
    const trial = asTrial(next), fields = trial.forceFields ??= []
    if (fields.length >= MAX_FORCE_FIELDS) throw new Error('This level already has 40 force fields.')
    const horizontal = tool === 'horizontal-force-field'
    const length = clamp(Math.abs(horizontal ? end.x - start.x : end.y - start.y) || 180, FORCE_FIELD_MIN_LENGTH, horizontal ? trial.width : trial.floor)
    const w = horizontal ? length : FORCE_FIELD_THICKNESS, h = horizontal ? FORCE_FIELD_THICKNESS : length
    fields.push({ id: newLevelId(), x: clamp(Math.min(start.x, end.x), 0, trial.width - w), y: clamp(Math.min(start.y, end.y), 0, trial.floor - h),
      w, h, orientation: horizontal ? 'horizontal' : 'vertical', power: 'always' })
    return { level: trial, selection: { kind: 'force-field', index: fields.length - 1 } }
  }
  if (tool === 'gravity-plate' || tool === 'water') {
    const trial = asTrial(next), plates = trial.gravityPlates ??= []
    if (plates.length >= MAX_GRAVITY_PLATES) throw new Error('This level already has 16 gravity or water fields.')
    const water = tool === 'water'
    const dragged = Math.hypot(end.x - start.x, end.y - start.y) >= 20
    const w = Math.min(trial.width, dragged ? Math.max(40, Math.abs(end.x - start.x)) : 160)
    const left = clamp(dragged ? Math.min(start.x, end.x) : start.x - w / 2, 0, trial.width - w)
    const ceiling = !water && !!plateSurface(plateSolids(trial), left, w, start.y, 12)?.ceiling
    const h = Math.min(levelHeight(trial), dragged ? Math.max(40, Math.abs(end.y - start.y)) : Math.max(40, water || ceiling ? levelHeight(trial) - start.y : start.y))
    const top = clamp(dragged ? Math.min(start.y, end.y) : water || ceiling ? start.y : start.y - h, 0, levelHeight(trial) - h)
    plates.push({ id: newLevelId(), x: left, y: top, w, h, gravity: -1, ...(water ? { effect: 'water' } as const : {}), ...(ceiling ? { ceiling: true } : {}) })
    return { level: trial, selection: { kind: 'gravity-plate', index: plates.length - 1 } }
  }
  if (tool === 'wall-light') {
    const trial = asTrial(next), lights = trial.wallLights ??= []
    if (lights.length >= MAX_WALL_LIGHTS) throw new Error('This level already has 40 wall lights.')
    lights.push({ id: newLevelId(), x: clamp(start.x, WALL_LIGHT_RADIUS, trial.width - WALL_LIGHT_RADIUS), y: clamp(start.y, WALL_LIGHT_RADIUS, levelHeight(trial) - WALL_LIGHT_RADIUS) })
    return { level: trial, selection: { kind: 'wall-light', index: lights.length - 1 } }
  }
  if (tool === 'steps-narrow' || tool === 'steps-wide') {
    if (next.platforms.length >= 160) throw new Error('This level already has 160 terrain pieces.')
    const tread = LEVEL_GRID_SIZE * (tool === 'steps-wide' ? 2 : 1), stepWidth = tread + LEVEL_GRID_SIZE
    const w = tread * 4 + stepWidth, h = LEVEL_GRID_SIZE * 5
    const polygon: [number, number][] = [[0, h]]
    for (let step = 0; step < 5; step++) polygon.push([step * tread, h - (step + 1) * LEVEL_GRID_SIZE], [step === 4 ? w : (step + 1) * tread, h - (step + 1) * LEVEL_GRID_SIZE])
    // Five one-square-thick steps overlap their neighbors by one square.
    for (let step = 4; step >= 1; step--) polygon.push([step * tread + stepWidth, (5 - step) * LEVEL_GRID_SIZE], [(step - 1) * tread + stepWidth, (5 - step) * LEVEL_GRID_SIZE])
    polygon.push([stepWidth, h])
    next.platforms.push({ x: clamp(end.x, 0, next.width - w), y: clamp(end.y, 0, levelHeight(next) - h), w, h, polygon })
    return { level: reorderTerrain(next, next.platforms.length - 1, 'front'), selection: { kind: 'platform', index: next.platforms.length - 1 } }
  }
  if (tool === 'light') {
    next.version = 2; next.lighting ??= { nightMode: false, ambient: 0, lights: [] }
    if (next.lighting.lights.length >= MAX_LIGHTS) throw new Error(`This level already has ${MAX_LIGHTS} lights.`)
    const drag = Math.hypot(end.x - start.x, end.y - start.y) >= 10
    next.lighting.lights.push({ id: newLevelId(), x: clamp(start.x, 10, level.width - 10), y: clamp(start.y, 10, levelHeight(level) - 10),
      intensity: 100, direction: drag ? Math.atan2(end.y - start.y, end.x - start.x) * 180 / Math.PI : 90, spread: 70, power: 'always' })
    return { level: next, selection: { kind: 'light', index: next.lighting.lights.length - 1 } }
  }
  if (tool === 'text' || tool === 'lab-stamp' || tool === 'message-screen') {
    const texts = next.texts ??= []
    if (texts.length >= 80) throw new Error('This level already has 80 wall text areas.')
    const click = Math.hypot(end.x - start.x, end.y - start.y) < 10
    const stamp = tool === 'lab-stamp', screen = tool === 'message-screen'
    const w = clamp(click ? stamp ? 240 : 320 : Math.abs(end.x - start.x), 40, Math.min(2000, next.width))
    const h = clamp(click ? stamp ? 110 : 100 : Math.abs(end.y - start.y), 24, Math.min(1200, levelHeight(next)))
    texts.push({ x: clamp(x, 0, next.width - w), y: clamp(y, 0, levelHeight(next) - h), w, h,
      text: stamp ? 'L.A.B.\nexperiments' : screen ? 'NO SIGNAL' : 'Your text', fontSize: screen ? 18 : 28, align: stamp ? 'center' : 'left',
      ...(stamp ? { style: 'lab-stamp' as const } : screen ? { style: 'terminal' as const } : {}) })
    return { level: next, selection: { kind: 'text', index: texts.length - 1 } }
  }
  if (['platform', 'pillar', 'ramp', 'rough'].includes(tool)) {
    if (next.platforms.length >= 160) throw new Error('This level already has 160 terrain pieces.')
    const click = Math.hypot(end.x - start.x, end.y - start.y) < 10
    const w = Math.min(level.width - x, Math.max(40, click ? tool === 'platform' ? 180 : tool === 'pillar' ? 80 : 320 : Math.abs(end.x - start.x)))
    const h = Math.max(20, click ? tool === 'pillar' ? 180 : 100 : Math.abs(end.y - start.y)), b: Platform = { x, y, w, h: Math.min(levelHeight(level) - y, h) }
    if (tool === 'pillar') {
      const center = x + w / 2
      const support = levelTerrain(next).filter(s => center >= s.x && center <= s.x + s.w)
        .map(s => platformSurface(s, center).y).filter(top => top >= y + 20).sort((a, b) => a - b)[0]
      if (support !== undefined) b.h = Math.min(2000, support - y)
    }
    if (tool === 'ramp') b.profile = start.y < end.y ? [[0, 0], [w, b.h]] : [[0, b.h], [w, 0]]
    if (tool === 'rough') b.profile = [1, .65, .8, .35, .5, 0, .25, .15, .65, .5, 1].map((height, i) => [w * i / 10, b.h * height])
    next.platforms.push(b)
    return { level: reorderTerrain(next, next.platforms.length - 1, 'front'), selection: { kind: 'platform', index: next.platforms.length - 1 } }
  }
  if (tool === 'entrance' || tool === 'checkpoint') {
    const point = { x: clamp(end.x, 10, next.width - 10), y: clamp(end.y, 0, levelHeight(next)) }
    if (tool === 'entrance') next.entrance = { ...next.entrance, ...point }
    else { if (next.checkpoints.length >= 30) throw new Error('This level already has 30 checkpoints.'); next.checkpoints.push(point) }
    return { level: next, selection: { kind: tool, index: tool === 'entrance' ? 0 : next.checkpoints.length - 1 } }
  }
  if (tool === 'tied-rope') {
    if (next.climbables.ropes.length >= 40) throw new Error('This level already has 40 ropes.')
    // Drag from one anchor to the other; a click ties a short level span to the right.
    const dragged = Math.hypot(end.x - start.x, end.y - start.y) >= 20
    const from = { x: clamp(start.x, 0, level.width), y: clamp(start.y, 0, levelHeight(level)) }
    const to = dragged ? { x: clamp(end.x, 0, level.width), y: clamp(end.y, 0, levelHeight(level)) } : { x: clamp(from.x + 240, 0, level.width), y: from.y }
    const span = Math.hypot(to.x - from.x, to.y - from.y)
    if (span < 40) throw new Error('Drag farther to tie a rope between two anchors.')
    if (span > 2000) throw new Error('Keep a tied rope’s anchors within 2,000 units of each other.')
    // A little slack lets the middle sag into reach.
    const length = clamp(Math.round(span * 1.1 + 20), 80, 2000)
    next.climbables.ropes.push({ ...from, length, segments: ropeSegmentCount(length), end: to })
    const index = next.climbables.ropes.length - 1
    const placed = anchorRope(anchorRope(next, index, 16), index, 16, 'end')
    fitTiedRope(placed.climbables.ropes[index])
    return { level: placed, selection: { kind: 'rope', index } }
  }
  if (tool === 'rope') {
    if (next.climbables.ropes.length >= 40) throw new Error('This level already has 40 ropes.')
    const length = clamp(Math.abs(end.y - start.y) || 260, 80, Math.min(2000, levelHeight(level) - y))
    next.climbables.ropes.push({ x, y, length, segments: ropeSegmentCount(length) })
    return { level: anchorRope(next, next.climbables.ropes.length - 1, 16), selection: { kind: 'rope', index: next.climbables.ropes.length - 1 } }
  }
  if (tool === 'ladder') {
    if (next.climbables.ladders.length >= 40) throw new Error('This level already has 40 ladders.')
    next.climbables.ladders.push({ x, top: y, bottom: y + clamp(Math.abs(end.y - start.y) || 260, 80, levelHeight(level) - y), platform: -1, side: 1 })
    return { level: next, selection: { kind: 'ladder', index: next.climbables.ladders.length - 1 } }
  }
  if (tool === 'pit') {
    const trial = carvePit(level, start, end)
    return { level: trial, selection: { kind: 'ladder', index: trial.climbables.ladders.length - 1 } }
  }
  if (tool === 'timer') {
    const trial = asTrial(level), timers = trial.timers ??= []
    if (timers.length >= 40) throw new Error('This level already has 40 wall timers.')
    timers.push({ x: clamp(start.x, 0, trial.width - WALL_TIMER_WIDTH), y: clamp(start.y, 0, levelHeight(trial) - WALL_TIMER_HEIGHT) })
    return { level: trial, selection: { kind: 'timer', index: timers.length - 1 } }
  }
  if (tool === 'stopwatch' || tool === 'fast-stopwatch' || tool === 'coin' || tool === 'time-bonus' || tool === 'time-penalty' || tool === 'emp') {
    const trial = asTrial(level), pickups = trial.pickups ??= [], bounds = pickupBounds({ kind: tool, x: 0, y: 0 })
    if (pickups.length >= 80) throw new Error('This level already has 80 power-ups and coins.')
    const position = { x: clamp(start.x, 0, trial.width - bounds.w) - bounds.x, y: clamp(start.y, 0, levelHeight(trial) - bounds.h) - bounds.y }
    pickups.push(tool === 'time-bonus' || tool === 'time-penalty' ? { ...position, kind: tool, seconds: TIME_BONUS_DEFAULT_SECONDS } : { ...position, kind: tool })
    return { level: trial, selection: { kind: 'pickup', index: pickups.length - 1 } }
  }
  if (tool === 'coin-switch') {
    const trial = asTrial(level)
    if (trial.triggers.length >= 40) throw new Error('This level already has 40 switches.')
    const nearest = trial.mechanisms.filter(m => m.power !== 'always').sort((a, b) => Math.hypot(a.x - x, a.y - y) - Math.hypot(b.x - x, b.y - y))[0]
    trial.triggers.push({ x: clamp(start.x, 0, trial.width - DIGITAL_DISPLAY_WIDTH), y: clamp(start.y, 0, levelHeight(trial) - DIGITAL_DISPLAY_HEIGHT),
      w: DIGITAL_DISPLAY_WIDTH, display: 'digital', mode: 'coins', threshold: 3, targets: nearest ? [nearest.id] : [] })
    return { level: trial, selection: { kind: 'trigger', index: trial.triggers.length - 1 } }
  }
  if (['goal', 'box', 'branded-box', 'ball', 'carried-emp', 'repulsor', 'pusher', 'repulsorbot', 'plate', 'lift', 'moving-platform', 'gate', 'horizontal-gate'].includes(tool)) {
    // New objects follow the authored point. The canvas applies nearby surface
    // snapping separately, so Snap off and Alt also preserve the cursor's height.
    const trial = asTrial(level), point = { x: Math.min(start.x, end.x), y: clamp(Math.min(start.y, end.y), 0, levelHeight(trial)) }
    if (tool === 'goal') {
      if (!isPuzzleLevel(trial)) throw new Error('Facility areas have no exit. The robot leaves through their bulkheads and level doors.')
      const bounds = goalBounds({ ...trial.goal, x: 0, y: 0 })
      trial.goal = { ...trial.goal, ...point, x: trial.goal?.kind === 'walk-off' ? trial.width : clamp(point.x, Math.max(0, -bounds.x), Math.min(trial.width, trial.width - bounds.x - bounds.w)) }
      return { level: trial, selection: { kind: 'goal', index: 0 } }
    }
    if (tool === 'box' || tool === 'branded-box' || tool === 'ball' || tool === 'carried-emp' || tool === 'repulsor') {
      if (trial.props.length >= 80) throw new Error('This level already has 80 props.')
      const drawn = Math.max(Math.abs(end.x - start.x), Math.abs(end.y - start.y))
      const gadget = tool === 'carried-emp' ? 'emp' : tool === 'repulsor' ? 'repulsor' : undefined
      const size = gadget ? GADGET_SIZE : drawn > 10 ? clamp(drawn, 30, 200) : tool === 'ball' ? 68 : 80
      trial.props.push({ kind: tool === 'ball' ? 'ball' : 'box', ...(gadget ? { gadget } : {}), x: clamp(point.x + (drawn > 10 ? size / 2 : 0), size / 2, trial.width - size / 2),
        y: clamp(drawn > 10 ? Math.max(start.y, end.y) : point.y, size, levelHeight(trial)), size,
        ...(tool === 'branded-box' ? { branded: true } : {}) })
      return { level: trial, selection: { kind: 'prop', index: trial.props.length - 1 } }
    }
    if (tool === 'pusher' || tool === 'repulsorbot') {
      if (trial.robots.length >= 30) throw new Error('This level already has 30 bots.')
      const position = { x: clamp(point.x, ROBOT_HALF_WIDTH, trial.width - ROBOT_HALF_WIDTH), y: Math.max(tool === 'repulsorbot' ? TUNING.height : 50, point.y) }
      trial.robots.push({ ...position, ...(tool === 'repulsorbot' ? { kind: 'repulsor' as const, left: ROBOT_HALF_WIDTH, right: trial.width - ROBOT_HALF_WIDTH }
        : pusherRange(trial, position.x, position.y)) })
      return { level: trial, selection: { kind: 'robot', index: trial.robots.length - 1 } }
    }
    if (tool === 'plate') {
      if (trial.triggers.length >= 40) throw new Error('This level already has 40 switches.')
      const nearest = trial.mechanisms.filter(m => m.power !== 'always').sort((a, b) => Math.hypot(a.x - x, a.y - y) - Math.hypot(b.x - x, b.y - y))[0]
      const left = clamp(point.x - 50, 0, trial.width - 100)
      const ceiling = !!plateSurface(plateSolids(trial), left, 100, point.y, 12)?.ceiling
      trial.triggers.push({ x: left, y: clamp(point.y, ceiling ? 0 : 8, levelHeight(trial) - (ceiling ? 8 : 0)), w: 100,
        targets: nearest ? [nearest.id] : [], mode: 'touch', ...(ceiling ? { ceiling: true } : {}) })
      attachPressurePlateOnSurface(trial, trial.triggers.at(-1)!)
      return { level: trial, selection: { kind: 'trigger', index: trial.triggers.length - 1 } }
    }
    if (tool === 'lift' || tool === 'moving-platform' || tool === 'gate' || tool === 'horizontal-gate') {
      if (trial.mechanisms.length >= 40) throw new Error('This level already has 40 mechanisms.')
      const drawnHeight = Math.abs(end.y - start.y)
      const moving = tool === 'moving-platform', lift = tool === 'lift' || moving
      const horizontal = tool === 'horizontal-gate' || moving, h = tool === 'gate' ? clamp(drawnHeight > 10 ? drawnHeight : 180, 12, 800) : MECHANISM_THICKNESS
      const w = lift ? 140 : horizontal ? clamp(Math.abs(end.x - start.x) || 180, 30, 600) : MECHANISM_THICKNESS
      trial.mechanisms.push({ id: newLevelId(), kind: lift ? 'lift' : 'gate', x: clamp(moving ? start.x : point.x, 0, trial.width - w),
        y: Math.max(0, Math.min(trial.floor - h, moving ? start.y : lift ? Math.max(start.y, end.y) : horizontal || drawnHeight > 10 ? point.y : point.y - h)), w, h,
        travel: lift ? clamp((moving ? Math.abs(end.x - start.x) : drawnHeight) || 300, 60, 1200) : horizontal ? w : h,
        ...(horizontal ? { orientation: 'horizontal' as const } : {}),
        ...(moving && end.x > start.x ? { flipX: true } : {}) })
      return { level: trial, selection: { kind: 'mechanism', index: trial.mechanisms.length - 1 } }
    }
  }
  return null
}

export function duplicateItem(level: JumpLevel, selection: Selection): { level: JumpLevel; selection: Selection } | null {
  const next = copyLevel(level), i = selection.index
  if (selection.kind === 'entrance' || selection.kind === 'goal') return null
  let index = 0
  if (selection.kind === 'platform') {
    if (next.platforms.length >= 160) return null
    index = next.platforms.push(copyLevel(level).platforms[i]) - 1
  } else if (selection.kind === 'back-wall') { if (next.environment!.walls.length >= 40) return null; index = next.environment!.walls.push(structuredClone(next.environment!.walls[i])) - 1 }
  else if (selection.kind === 'rope') {
    if (next.climbables.ropes.length >= 40) return null
    // A copy is not wired; its release, if any, gets its own switch ID.
    const copy = structuredClone(next.climbables.ropes[i])
    if (copy.release) copy.release.id = newLevelId()
    index = next.climbables.ropes.push(copy) - 1
  }
  else if (selection.kind === 'ladder') { if (next.climbables.ladders.length >= 40) return null; index = next.climbables.ladders.push({ ...next.climbables.ladders[i], platform: -1 }) - 1 }
  else if (selection.kind === 'timer') { if (next.timers!.length >= 40) return null; index = next.timers!.push({ ...next.timers![i] }) - 1 }
  else if (selection.kind === 'text') { if (next.texts!.length >= 80) return null; index = next.texts!.push({ ...next.texts![i] }) - 1 }
  else if (selection.kind === 'pickup') { if (next.pickups!.length >= 80) return null; index = next.pickups!.push({ ...next.pickups![i] }) - 1 }
  else if (selection.kind === 'prop') { if (next.props!.length >= 80) return null; index = next.props!.push({ ...next.props![i] }) - 1 }
  else if (selection.kind === 'robot') { if (next.robots!.length >= 30) return null; index = next.robots!.push({ ...next.robots![i] }) - 1 }
  else if (selection.kind === 'trigger') { if (next.triggers!.length >= 40) return null; index = next.triggers!.push({ ...next.triggers![i] }) - 1 }
  else if (selection.kind === 'mechanism') { if (next.mechanisms!.length >= 40) return null; index = next.mechanisms!.push({ ...next.mechanisms![i], id: newLevelId() }) - 1 }
  else if (selection.kind === 'light') { if (next.lighting!.lights.length >= MAX_LIGHTS) return null; index = next.lighting!.lights.push({ ...next.lighting!.lights[i], id: newLevelId() }) - 1 }
  else if (selection.kind === 'force-field') { if (next.forceFields!.length >= MAX_FORCE_FIELDS) return null; index = next.forceFields!.push({ ...next.forceFields![i], id: newLevelId() }) - 1 }
  else if (selection.kind === 'gravity-plate') { if (next.gravityPlates!.length >= MAX_GRAVITY_PLATES) return null; index = next.gravityPlates!.push({ ...next.gravityPlates![i], id: newLevelId() }) - 1 }
  else if (selection.kind === 'wall-light') { if (next.wallLights!.length >= MAX_WALL_LIGHTS) return null; index = next.wallLights!.push({ ...next.wallLights![i], id: newLevelId() }) - 1 }
  else if (selection.kind === 'float-switch') { if (next.floatSwitches!.length >= MAX_FLOAT_SWITCHES) return null; index = next.floatSwitches!.push({ ...next.floatSwitches![i], targets: [...next.floatSwitches![i].targets], id: newLevelId() }) - 1 }
  else if (selection.kind === 'logic-relay') { if (next.logicRelays!.length >= MAX_LOGIC_RELAYS) return null; index = next.logicRelays!.push({ ...next.logicRelays![i], id: newLevelId() }) - 1 }
  else if (selection.kind === 'grade-gate') { if (next.gradeGates!.length >= MAX_GRADE_GATES) return null; index = next.gradeGates!.push({ ...structuredClone(next.gradeGates![i]), id: newLevelId() }) - 1 }
  else if (selection.kind === 'course-door') { if (next.courseDoors!.length >= MAX_COURSE_DOORS) return null; index = next.courseDoors!.push({ ...structuredClone(next.courseDoors![i]), id: newLevelId() }) - 1 }
  else if (selection.kind === 'bulkhead') { if (next.bulkheads!.length >= MAX_BULKHEADS) return null; index = next.bulkheads!.push({ ...next.bulkheads![i], id: newLevelId() }) - 1 }
  else if (selection.kind === 'evaluation-board') { if (next.evaluationBoards!.length >= MAX_EVALUATION_BOARDS) return null; index = next.evaluationBoards!.push({ ...next.evaluationBoards![i], id: newLevelId() }) - 1 }
  else if (selection.kind === 'wall-door') { if (next.wallDoors!.length >= MAX_WALL_DOORS) return null; index = next.wallDoors!.push({ ...next.wallDoors![i] }) - 1 }
  else { if (next.checkpoints.length >= 30) return null; index = next.checkpoints.push({ ...next.checkpoints[i] }) - 1 }
  const result = { kind: selection.kind, index }
  const moved = moveItem(next, result, 40, 0)
  return { level: selection.kind === 'platform' ? reorderTerrain(moved, index, 'front') : moved, selection: result }
}
export function allSelections(level: JumpLevel): Selection[] {
  return [{ kind: 'entrance', index: 0 }, ...(level.goal ? [{ kind: 'goal' as const, index: 0 }] : []),
    ...(level.courseDoors ?? []).map((_, index) => ({ kind: 'course-door' as const, index })),
    ...(level.bulkheads ?? []).map((_, index) => ({ kind: 'bulkhead' as const, index })),
    ...(level.evaluationBoards ?? []).map((_, index) => ({ kind: 'evaluation-board' as const, index })),
    ...(level.wallDoors ?? []).map((_, index) => ({ kind: 'wall-door' as const, index })),
    ...(level.environment?.walls ?? []).map((_, index) => ({ kind: 'back-wall' as const, index })),
    ...(level.floatSwitches ?? []).map((_, index) => ({ kind: 'float-switch' as const, index })),
    ...(level.logicRelays ?? []).map((_, index) => ({ kind: 'logic-relay' as const, index })),
    ...(level.gradeGates ?? []).map((_, index) => ({ kind: 'grade-gate' as const, index })),
    ...(level.forceFields ?? []).map((_, index) => ({ kind: 'force-field' as const, index })),
    ...(level.gravityPlates ?? []).map((_, index) => ({ kind: 'gravity-plate' as const, index })),
    ...(level.wallLights ?? []).map((_, index) => ({ kind: 'wall-light' as const, index })),
    ...level.platforms.map((_, index) => ({ kind: 'platform' as const, index })),
    ...level.climbables.ropes.map((_, index) => ({ kind: 'rope' as const, index })), ...level.climbables.ladders.map((_, index) => ({ kind: 'ladder' as const, index })),
    ...level.checkpoints.map((_, index) => ({ kind: 'checkpoint' as const, index })),
    ...(level.timers ?? []).map((_, index) => ({ kind: 'timer' as const, index })),
    ...(level.texts ?? []).map((_, index) => ({ kind: 'text' as const, index })),
    ...(level.lighting?.lights ?? []).map((_, index) => ({ kind: 'light' as const, index })),
    ...(level.pickups ?? []).map((_, index) => ({ kind: 'pickup' as const, index })),
    ...(level.props ?? []).map((_, index) => ({ kind: 'prop' as const, index })), ...(level.robots ?? []).map((_, index) => ({ kind: 'robot' as const, index })),
    ...(level.triggers ?? []).map((_, index) => ({ kind: 'trigger' as const, index })), ...(level.mechanisms ?? []).map((_, index) => ({ kind: 'mechanism' as const, index }))]
}

/** Terrain anchors are stored in local coordinates so they travel with edited terrain. */
export function anchorRope(level: JumpLevel, index: number, maxDistance = 40, which: 'start' | 'end' = 'start'): JumpLevel {
  const next = copyLevel(level), rope = next.climbables.ropes[index], r = which === 'end' ? rope?.end : rope
  if (!r) return next
  const candidates = next.platforms.map((b, platform) => ({ ...nearestBoundary(b, r.x, r.y), platform })).sort((a, b) => a.distance - b.distance)
  const best = candidates[0]
  if (!best || best.distance > maxDistance) return next
  const b = next.platforms[best.platform]
  r.x = best.x; r.y = best.y; r.anchor = { platform: best.platform, x: r.x - b.x, y: r.y - b.y }
  fitTiedRope(rope)
  return next
}
/**
 * Move one anchor of a tied rope, leaving the other where it is. Near a terrain
 * edge it attaches there; the rope lengthens if the anchors move farther apart.
 */
export function moveRopeAnchor(level: JumpLevel, index: number, which: 'start' | 'end', x: number, y: number, attach = 16): JumpLevel {
  const rope = level.climbables.ropes[index]
  if (!rope?.end || !Number.isFinite(x) || !Number.isFinite(y)) return level
  const next = copyLevel(level), moved = next.climbables.ropes[index], point = which === 'end' ? moved.end! : moved
  point.x = clamp(x, 0, next.width); point.y = clamp(y, 0, levelHeight(next)); delete point.anchor
  delete moved.rest
  const placed = attach ? anchorRope(next, index, attach, which) : next
  fitTiedRope(placed.climbables.ropes[index])
  return placed
}
/** Tie a rope's free end where it now rests, or untie a tied rope's second anchor (and its release). */
export function setRopeTied(level: JumpLevel, index: number, tied: boolean): JumpLevel {
  const rope = level.climbables.ropes[index]
  if (!rope || !!rope.end === tied) return level
  const next = copyLevel(level), r = next.climbables.ropes[index]
  if (!tied) {
    if (r.release) removeSwitchTarget(next, r.release.id)
    delete r.end; delete r.release; delete r.rest
    return next
  }
  const [x, y] = r.rest?.points.at(-1) ?? [r.x, r.y + r.length]
  r.end = { x: clamp(x, 0, next.width), y: clamp(y, 0, levelHeight(next)) }
  delete r.rest
  const placed = anchorRope(next, index, 16, 'end')
  fitTiedRope(placed.climbables.ropes[index])
  return placed
}
/** Wire a tied rope to let go of one anchor, or remove the release and its connections. */
export function setRopeRelease(level: JumpLevel, index: number, anchor: 'start' | 'end' | null): JumpLevel {
  const rope = level.climbables.ropes[index]
  if (!rope?.end || (rope.release?.anchor ?? null) === anchor) return level
  const next = copyLevel(level), r = next.climbables.ropes[index]
  if (anchor) r.release = { ...r.release, id: r.release?.id ?? newLevelId(), anchor }
  else { removeSwitchTarget(next, r.release!.id); delete r.release }
  return next
}
export function polygonPlatform(points: readonly Vec[], material?: TerrainMaterial): Platform {
  if (!validPolygon(points)) throw new Error('Use at least three corners without crossing the edges.')
  const x = Math.min(...points.map(p => p[0])), y = Math.min(...points.map(p => p[1]))
  const w = Math.max(...points.map(p => p[0])) - x, h = Math.max(...points.map(p => p[1])) - y
  if (w < 10 || h < 8) throw new Error('Terrain needs a little more width and height.')
  return { x, y, w, h, polygon: points.map(p => [p[0] - x, p[1] - y]), ...(material ? { material } : {}) }
}
export function addPolygon(level: JumpLevel, points: readonly Vec[]) {
  if (level.platforms.length >= 160) throw new Error('This level already has 160 terrain pieces.')
  const b = polygonPlatform(points.map(([x, y]) => [clamp(x, 0, level.width), clamp(y, 0, levelHeight(level))]))
  const next = copyLevel(level); next.platforms.push(b)
  return { level: reorderTerrain(next, next.platforms.length - 1, 'front'), selection: { kind: 'platform' as const, index: next.platforms.length - 1 } }
}
export type TerrainNodeTarget = { index: number; edge: number; x: number; y: number; t?: number }
export type TerrainVertexTarget = { index: number; vertex: number; x: number; y: number }

/** Pick the nearest existing node, preferring the topmost terrain on ties. */
export function terrainVertexTarget(level: JumpLevel, x: number, y: number, tolerance: number): TerrainVertexTarget | null {
  let best: TerrainVertexTarget | null = null, distance = tolerance
  const order = terrainDrawOrder(level.platforms)
  for (let position = order.length - 1; position >= 0; position--) {
    const index = order[position]
    for (const [vertex, [vx, vy]] of terrainNodes(level.platforms[index]).entries()) {
      const d = Math.hypot(x - vx, y - vy)
      if (d <= tolerance && (!best || d < distance)) { best = { index, vertex, x: vx, y: vy }; distance = d }
    }
  }
  return best
}

/** Project onto the nearest edge; snap along its dominant axis to preserve slopes. */
export function terrainNodeTarget(level: JumpLevel, x: number, y: number, tolerance: number, grid = 0): TerrainNodeTarget | null {
  let best: (TerrainNodeTarget & { distance: number }) | null = null
  const order = terrainDrawOrder(level.platforms)
  for (let position = order.length - 1; position >= 0; position--) {
    const index = order[position]
    const terrain = level.platforms[index]
    if (terrain.bezier) {
      const samples = terrainCurveSamples(terrain)
      for (let i = 0; i < samples.length; i++) {
        const sample = samples[i], following = samples[(i + 1) % samples.length], a = sample.point, b = following.point
        const dx = b[0] - a[0], dy = b[1] - a[1], squared = dx * dx + dy * dy
        if (!squared) continue
        const t = clamp(((x - a[0]) * dx + (y - a[1]) * dy) / squared, 0, 1)
        const distance = Math.hypot(x - a[0] - dx * t, y - a[1] - dy * t)
        if (distance <= tolerance && (!best || distance < best.distance)) {
          const cubic = terrainCubic(terrain, sample.edge)
          let low = sample.t, high = following.edge === sample.edge ? following.t : 1
          const distanceAt = (t: number) => { const p = cubicPoint(cubic, t); return (p[0] - x) ** 2 + (p[1] - y) ** 2 }
          for (let pass = 0; pass < 28; pass++) {
            const left = low + (high - low) / 3, right = high - (high - low) / 3
            if (distanceAt(left) < distanceAt(right)) high = right; else low = left
          }
          const parameter = (low + high) / 2, p = cubicPoint(cubic, parameter)
          best = { index, edge: sample.edge, t: parameter, x: p[0], y: p[1], distance }
        }
      }
      continue
    }
    const points = terrainNodes(terrain)
    for (let edge = 0; edge < points.length; edge++) {
      const a = points[edge], b = points[(edge + 1) % points.length], dx = b[0] - a[0], dy = b[1] - a[1]
      const t = clamp(((x - a[0]) * dx + (y - a[1]) * dy) / (dx * dx + dy * dy), 0, 1)
      const px = a[0] + dx * t, py = a[1] + dy * t, distance = Math.hypot(x - px, y - py)
      if (distance <= tolerance && (!best || distance < best.distance)) best = { index, edge, x: px, y: py, distance }
    }
  }
  if (!best) return null
  const points = terrainNodes(level.platforms[best.index]), a = points[best.edge], b = points[(best.edge + 1) % points.length]
  if (best.t !== undefined) {
    const terrain = level.platforms[best.index], cubic = terrainCubic(terrain, best.edge)
    if (grid) {
      const before = cubicPoint(cubic, Math.max(0, best.t - .001)), after = cubicPoint(cubic, Math.min(1, best.t + .001))
      const axis = Math.abs(after[0] - before[0]) >= Math.abs(after[1] - before[1]) ? 0 : 1
      const coordinate = axis === 0 ? Math.round(best.x / grid) * grid : levelHeight(level) - Math.round((levelHeight(level) - best.y) / grid) * grid
      const samples = [...terrainCurveSamples(terrain).filter(s => s.edge === best!.edge), { point: b, edge: best.edge, t: 1 }]
      let parameter: number | null = null
      for (let i = 1; i < samples.length; i++) {
        const from = samples[i - 1], to = samples[i]
        if (coordinate < Math.min(from.point[axis], to.point[axis]) || coordinate > Math.max(from.point[axis], to.point[axis])) continue
        let low = from.t, high = to.t
        for (let pass = 0; pass < 32; pass++) {
          const mid = (low + high) / 2
          if ((cubicPoint(cubic, mid)[axis] < coordinate) === (to.point[axis] > from.point[axis])) low = mid; else high = mid
        }
        const t = (low + high) / 2
        if (parameter === null || Math.abs(t - best.t) < Math.abs(parameter - best.t)) parameter = t
      }
      if (parameter !== null) { const p = cubicPoint(cubic, parameter); best = { ...best, t: parameter, x: p[0], y: p[1] } }
    }
    if (points.some(([vx, vy]) => Math.hypot(vx - best!.x, vy - best!.y) < .01)) return null
    return { index: best.index, edge: best.edge, x: best.x, y: best.y, t: best.t }
  }
  let px = best.x, py = best.y
  if (grid) {
    const dx = b[0] - a[0], dy = b[1] - a[1]
    const snappedY = levelHeight(level) - Math.round((levelHeight(level) - py) / grid) * grid
    const t = clamp(Math.abs(dx) >= Math.abs(dy) ? (Math.round(px / grid) * grid - a[0]) / dx : (snappedY - a[1]) / dy, 0, 1)
    px = a[0] + dx * t; py = a[1] + dy * t
  }
  if (points.some(([vx, vy]) => Math.hypot(vx - px, vy - py) < .01)) return null
  return { index: best.index, edge: best.edge, x: px, y: py }
}

export function insertTerrainNode(level: JumpLevel, target: TerrainNodeTarget): JumpLevel {
  const before = level.platforms[target.index], points = terrainNodes(before)
  if (points.length >= 64) throw new Error(`${objectReference(level, 'platform', target.index)} already has 64 nodes.`)
  if (before.bezier) {
    const handles = structuredClone(before.bezier) as (TerrainBezier | null)[], following = (target.edge + 1) % points.length
    if (!handles[target.edge]?.out && !handles[following]?.in) {
      points.splice(target.edge + 1, 0, [target.x, target.y]); handles.splice(target.edge + 1, 0, null)
      return replaceEditedTerrain(level, target.index, points, handles)
    }
    const split = splitCubic(terrainCubic(before, target.edge), target.t ?? .5)
    handles[target.edge] = { ...handles[target.edge], out: relativePoint(split.left[1], points[target.edge]), mode: 'corner' }
    handles[following] = { ...handles[following], in: relativePoint(split.right[2], points[following]), mode: 'corner' }
    handles.splice(target.edge + 1, 0, { in: relativePoint(split.left[2], split.point), out: relativePoint(split.right[1], split.point), mode: 'smooth' })
    points.splice(target.edge + 1, 0, split.point)
    return replaceEditedTerrain(level, target.index, points, handles)
  }
  points.splice(target.edge + 1, 0, [target.x, target.y])
  if (!validPolygon(points)) throw new Error('Choose a point on the edge away from an existing node.')
  // Inserting on an edge leaves the surface and all supported objects in place.
  const next = copyLevel(level), terrain = next.platforms[target.index]
  delete terrain.profile
  terrain.polygon = points.map(([x, y]) => [x - terrain.x, y - terrain.y])
  // Polygon terrain uses free ladders; retain their placement when converting a rectangle.
  for (const ladder of next.climbables.ladders) if (ladder.platform === target.index) ladder.platform = -1
  return next
}

export function deleteTerrainNode(level: JumpLevel, index: number, vertex: number): JumpLevel {
  const terrain = level.platforms[index]
  if (!terrain) return level
  const points = terrainNodes(terrain)
  if (!Number.isInteger(vertex) || vertex < 0 || vertex >= points.length) return level
  if (points.length <= 3) throw new Error(`${objectReference(level, 'platform', index)} needs at least three nodes.`)
  points.splice(vertex, 1)
  if (terrain.bezier) {
    const handles = [...terrain.bezier]; handles.splice(vertex, 1)
    return replaceEditedTerrain(level, index, points, handles)
  }
  return replacePlatform(level, index, polygonPlatform(points, terrain.material))
}

export function moveVertex(level: JumpLevel, index: number, vertex: number, dx: number, dy: number): JumpLevel {
  const terrain = level.platforms[index], points = terrainNodes(terrain)
  const p = points[vertex]; points[vertex] = [clamp(p[0] + dx, 0, level.width), clamp(p[1] + dy, 0, levelHeight(level))]
  if (terrain.bezier) {
    try { return replaceEditedTerrain(level, index, points, terrain.bezier) } catch { return level }
  }
  try { return replacePlatform(level, index, polygonPlatform(points, level.platforms[index].material)) } catch { return level }
}

function replaceEditedTerrain(level: JumpLevel, index: number, points: readonly Vec[], handles: Platform['bezier']): JumpLevel {
  const controls = points.flatMap((p, i) => [p, ...(['in', 'out'] as const).flatMap(side => {
    const h = handles?.[i]?.[side]; return h ? [[p[0] + h[0], p[1] + h[1]] as Vec] : []
  })])
  if (controls.some(p => p[0] < 0 || p[0] > level.width || p[1] < 0 || p[1] > levelHeight(level))) throw new Error('Keep terrain nodes and handles inside the level.')
  const x = Math.min(...controls.map(p => p[0])), y = Math.min(...controls.map(p => p[1]))
  const w = Math.max(...controls.map(p => p[0])) - x, h = Math.max(...controls.map(p => p[1])) - y
  if (w < 10 || h < 8) throw new Error('Terrain needs a little more width and height.')
  const platform: Platform = { ...level.platforms[index], x, y, w, h, polygon: points.map(p => [p[0] - x, p[1] - y]) }
  delete platform.profile
  if (handles?.some(Boolean)) platform.bezier = structuredClone(handles); else delete platform.bezier
  if (!validPolygon(terrainCurveOutline(platform), MAX_CURVE_POINTS)) throw new Error('Terrain curves need a clear outline on the 5-unit grid. Shorten or move the handles.')
  const next = replacePlatform(level, index, platform)
  // Handle extents change the bounding box without scaling or moving the solid.
  // Keep attachments at their world positions, then project to the changed edge.
  for (const [i, source] of level.climbables.ropes.entries()) {
    const rope = next.climbables.ropes[i], points = ropeEnds(rope)
    for (const [k, end] of ropeEnds(source).entries()) if (end.anchor?.platform === index) {
      const edge = nearestBoundary(platform, end.x, end.y), point = points[k]
      point.x = edge.x; point.y = edge.y; point.anchor = { platform: index, x: edge.x - platform.x, y: edge.y - platform.y }
      fitTiedRope(rope)
      delete rope.rest
    }
  }
  for (const [source, marker] of [[level.entrance, next.entrance], ...level.checkpoints.map((p, i) => [p, next.checkpoints[i]]),
    ...(level.goal && next.goal ? [[level.goal, next.goal]] : []),
    ...(level.courseDoors ?? []).map((p, i) => [p, next.courseDoors![i]]), ...(level.bulkheads ?? []).map((p, i) => [p, next.bulkheads![i]]),
    ...(level.wallDoors ?? []).map((p, i) => [p, next.wallDoors![i]])]) {
    const before = level.platforms[index], x = source === level.goal ? (() => { const b = goalBounds(level.goal); return b.x + b.w / 2 })() : source.x
    if (x < before.x || x > before.x + before.w || Math.abs(source.y - platformSurface(before, x).y) >= .1) continue
    marker.x = source.x; marker.y = source.y
    const surface = platformSurface(platform, x, source.y)
    if (x >= platform.x && x <= platform.x + platform.w && Number.isFinite(surface.y)) marker.y = surface.y
  }
  for (const ladder of next.climbables.ladders) if (ladder.platform === index) ladder.platform = -1
  return next
}

/** Change a selected node's tangent behavior; Straight removes both handles. */
export function setTerrainNodeMode(level: JumpLevel, index: number, vertex: number, mode: 'straight' | 'corner' | 'smooth' | 'symmetric'): JumpLevel {
  const terrain = level.platforms[index], points = terrainNodes(terrain), p = points[vertex]
  if (!p) return level
  const handles = structuredClone(terrain.bezier ?? points.map(() => null)) as (TerrainBezier | null)[]
  if (mode === 'straight') handles[vertex] = null
  else {
    const before = points[(vertex + points.length - 1) % points.length], after = points[(vertex + 1) % points.length], saved = handles[vertex]
    const incoming: Vec = saved?.in ?? [(before[0] - p[0]) / 3, (before[1] - p[1]) / 3]
    const outgoing: Vec = saved?.out ?? [(after[0] - p[0]) / 3, (after[1] - p[1]) / 3]
    const length = Math.hypot(...outgoing), otherLength = mode === 'symmetric' ? length : Math.hypot(...incoming)
    const aligned: Vec = length ? [-outgoing[0] / length * otherLength, -outgoing[1] / length * otherLength] : incoming
    handles[vertex] = { in: mode === 'corner' ? incoming : aligned, out: outgoing, mode }
  }
  return replaceEditedTerrain(level, index, points, handles)
}

export function moveTerrainHandle(level: JumpLevel, index: number, vertex: number, side: 'in' | 'out', x: number, y: number): JumpLevel {
  const terrain = level.platforms[index], points = terrainNodes(terrain), p = points[vertex]
  if (!p) return level
  const handles = structuredClone(terrain.bezier ?? points.map(() => null)) as (TerrainBezier | null)[]
  const handle = { ...handles[vertex] }, other = side === 'in' ? 'out' : 'in'
  const vector = relativePoint([clamp(x, 0, level.width), clamp(y, 0, levelHeight(level))], p), length = Math.hypot(...vector)
  if (handle.mode && handle.mode !== 'corner' && length) {
    const otherLength = handle.mode === 'symmetric' ? length : Math.hypot(...(handle[other] ?? [0, 0]))
    handle[other] = [-vector[0] / length * otherLength, -vector[1] / length * otherLength]
  }
  handle[side] = vector; handles[vertex] = handle
  return replaceEditedTerrain(level, index, points, handles)
}
