import type { JumpLevel } from './level.ts'
import { copyLevel, newLevelId, levelTerrain, levelHeight, LEVEL_GRID_SIZE } from './level.ts'
import { TUNING } from './model.ts'
import type { Platform } from './model.ts'
import type { TerrainMaterial } from './terrainMaterials.ts'
import { OBJECT_NAME_MAX_LENGTH } from './objectNames.ts'
import { itemDefinition, objectReference } from './objectLabels.ts'
export { itemDefinition } from './objectLabels.ts'
import { asTrial, carvePit, pusherRange } from './puzzleEditor.ts'
import { platformSurface } from './terrain.ts'
import { nearestBoundary, pointInside, polygonPoints, validPolygon } from './geometry.ts'
import type { Vec } from './geometry.ts'
import { ropePath, ropeSegmentCount } from './climbables.ts'
import { goalBounds } from './goal.ts'
import { removeSwitchTarget, switchedItems, switchSources } from './switchPower.ts'
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
import { editorRobotPose } from './editorGeometry.ts'
import { robotHulls } from './robotPhysics.ts'

import { MAX_GRAVITY_PLATES } from './gravity.ts'
import { MAX_FORCE_FIELDS, FORCE_FIELD_THICKNESS, FORCE_FIELD_MIN_LENGTH } from './forceField.ts'
import { plateSolids, plateSurface } from './plateSurface.ts'
import { terrainDrawOrder } from './terrainOrder.ts'

export type Tool = 'select' | 'node' | 'platform' | 'steps-narrow' | 'steps-wide' | 'ramp' | 'rough' | 'rope' | 'ladder' | 'spawn' | 'checkpoint' | 'pillar' | 'pit' | 'goal' | 'box' | 'ball' | 'pusher' | 'plate' | 'lift' | 'moving-platform' | 'gate' | 'horizontal-gate' | 'timer' | 'text' | 'stopwatch' | 'coin' | 'time-bonus' | 'time-penalty' | 'fast-stopwatch' | 'emp' | 'coin-switch' | 'light' | 'wall-light' | 'logic-relay' | 'gravity-plate' | 'water' | 'force-field' | 'horizontal-force-field'
export type TerrainTransform = 'rotate-left' | 'rotate-right' | 'flip-horizontal' | 'flip-vertical'
export type TerrainOrderAction = 'back' | 'backward' | 'forward' | 'front'
export type ResizeCorner = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'
export type ResizeHandle = ResizeCorner | 'left' | 'right' | 'top' | 'bottom'
export type Selection = { kind: 'platform' | 'rope' | 'ladder' | 'spawn' | 'checkpoint' | 'goal' | 'prop' | 'robot' | 'mechanism' | 'trigger' | 'timer' | 'text' | 'pickup' | 'light' | 'wall-light' | 'logic-relay' | 'gravity-plate' | 'force-field'; index: number }
export const clamp = (n: number, low: number, high: number) => Math.max(low, Math.min(high, n))

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
  robot[side] = side === 'left' ? clamp(Math.round(value), 50, Math.floor(Math.min(robot.x, robot.right - 50)))
    : clamp(Math.round(value), Math.ceil(Math.max(robot.x, robot.left + 50)), Math.floor(next.width - 50))
  return next
}

export function setShovebotHeadlight(level: JumpLevel, index: number, enabled: boolean): JumpLevel {
  if (!level.robots?.[index]) return level
  const next = copyLevel(level), robot = next.robots![index]
  if (enabled) robot.headlight = true
  else delete robot.headlight
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

export function renameItem(level: JumpLevel, selection: Selection, value: string): JumpLevel {
  const item = itemDefinition(level, selection), name = value.trim().slice(0, OBJECT_NAME_MAX_LENGTH)
  if (!item || (item.name ?? '') === name) return level
  const next = copyLevel(level), target = itemDefinition(next, selection)!
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
    const clearance = s.kind === 'spawn' || s.kind === 'checkpoint' ? TUNING.height : 0
    return b.y - clearance
  })
  const height = clamp(requested, Math.ceil(Math.max(400, ...tops.map(y => before - y))), 6000)
  const dy = height - before
  if (!dy) return level
  const next = copyLevel(level)
  next.height = height
  if (next.floor !== undefined) next.floor = height
  for (const point of [next.spawn, ...next.checkpoints, ...(next.goal ? [next.goal] : []), ...next.platforms,
    ...(next.props ?? []), ...(next.robots ?? []), ...(next.mechanisms ?? []), ...(next.triggers ?? []), ...(next.timers ?? []), ...(next.texts ?? []), ...(next.pickups ?? []), ...(next.lighting?.lights ?? []), ...(next.wallLights ?? []), ...(next.logicRelays ?? []), ...(next.gravityPlates ?? []), ...(next.forceFields ?? [])]) point.y += dy
  for (const ladder of next.climbables.ladders) { ladder.top += dy; ladder.bottom += dy }
  for (const rope of next.climbables.ropes) {
    rope.y += dy
    // Local terrain anchors stay unchanged. Rebuild cached world-space geometry
    // against the resized room before previewing, playing, or saving the level.
    delete rope.rest
  }
  return next
}
export function itemBounds(level: JumpLevel, selection: Selection) {
  const i = selection.index
  if (selection.kind === 'light') { const l = level.lighting?.lights[i]; return l ? lightBounds(l) : null }
  if (selection.kind === 'wall-light') { const light = level.wallLights?.[i]; return light ? wallLightBounds(light) : null }
  if (selection.kind === 'logic-relay') { const relay = level.logicRelays?.[i]; return relay ? logicRelayBounds(relay) : null }
  if (selection.kind === 'force-field') return level.forceFields?.[i] ?? null
  if (selection.kind === 'gravity-plate') return level.gravityPlates?.[i] ?? null
  if (selection.kind === 'platform') return level.platforms[i] ?? null
  if (selection.kind === 'rope') { const r = level.climbables.ropes[i]; return r ? { x: r.x, y: r.y, w: 0, h: r.length } : null }
  if (selection.kind === 'ladder') { const l = level.climbables.ladders[i]; return l ? { x: l.x, y: l.top, w: 0, h: l.bottom - l.top } : null }
  if (selection.kind === 'prop') { const b = level.props?.[i]; return b ? { x: b.x - b.size / 2, y: b.y - b.size, w: b.size, h: b.size } : null }
  if (selection.kind === 'robot') { const r = level.robots?.[i]; return r ? { x: r.x - 26, y: r.y - 50, w: 52, h: 50 } : null }
  if (selection.kind === 'mechanism') return level.mechanisms?.[i] ?? null
  if (selection.kind === 'trigger') { const t = level.triggers?.[i]; return t ? t.mode === 'coins' ? coinSwitchBounds(t) : { x: t.x, y: t.y - (t.ceiling ? 0 : 8), w: t.w, h: 8 } : null }
  if (selection.kind === 'goal') return level.goal ? { ...level.goal, w: 0, h: 0 } : null
  if (selection.kind === 'timer') { const timer = level.timers?.[i]; return timer ? { ...timer, w: WALL_TIMER_WIDTH, h: WALL_TIMER_HEIGHT } : null }
  if (selection.kind === 'text') return level.texts?.[i] ?? null
  if (selection.kind === 'pickup') { const p = level.pickups?.[i]; return p ? pickupBounds(p) : null }
  const p = selection.kind === 'spawn' ? level.spawn : level.checkpoints[i]
  return p ? { x: p.x, y: p.y, w: 0, h: 0 } : null
}
export function itemOutline(level: JumpLevel, selection: Selection) {
  if (selection.kind === 'goal' && level.goal) return goalBounds(level.goal)
  if (selection.kind === 'text') return level.texts?.[selection.index] ? wallTextBounds(level.texts[selection.index]) : null
  const robot = selection.kind === 'robot' ? level.robots?.[selection.index] : undefined
  if (robot) {
    const pose = editorRobotPose(level, robot)
    if (Math.abs(pose.angle) > .001) {
      const points = robotHulls({ ...pose, facing: -1, phase: 'patrol' }).flat()
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
  return next
}
export function setPlateBehavior(level: JumpLevel, index: number, behavior: PlateBehavior, startsOn = false): JumpLevel {
  const before = level.triggers?.[index]
  if (!before || before.mode === 'coins' || !['pressure', 'switch', 'toggle'].includes(behavior)) return level
  const next = copyLevel(level), plate = next.triggers![index]
  if (plate.mode === 'coins') return level
  plate.behavior = behavior
  delete plate.startsOn
  if (behavior === 'toggle') plate.startsOn = startsOn
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
  const next = copyLevel(level)
  const item = selection.kind === 'goal' ? next.goal : selection.kind === 'mechanism' ? next.mechanisms?.[selection.index]
    : selection.kind === 'force-field' ? next.forceFields?.[selection.index] : selection.kind === 'light' ? next.lighting?.lights[selection.index] : selection.kind === 'gravity-plate' ? next.gravityPlates?.[selection.index] : null
  if (!item || 'kind' in item && item.kind === 'gate') return level
  item.power = power
  if (selection.kind === 'goal' && !item.id) item.id = newLevelId()
  if (power === 'always') {
    removeSwitchTarget(next, item.id!)
    delete item.targets; delete item.relay
  }
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
function editObjectSwitchSettings(level: JumpLevel, selection: Selection, settings: SwitchSettings): JumpLevel {
  if (!switchedItems(level).some(item => item.kind === selection.kind && item.index === selection.index)) return level
  const next = copyLevel(level)
  const item = switchedItems(next).find(item => item.kind === selection.kind && item.index === selection.index)!
  Object.assign(item.definition, settings)
  return next
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
  const x = clamp(bounds.x + (bounds.w - w) / 2, 24, level.width - w - 24)
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
  const x = clamp(bounds.x + (bounds.w - dimensions.w) / 2, 24, level.width - dimensions.w - 24)
  const y = clamp(bounds.y + (bounds.h - h) / 2, 0, levelHeight(level) - h)
  const connection = trigger.targets ? { targets: trigger.targets } : { target: trigger.target }
  next.triggers![index] = { x, y, ...dimensions, ...connection, mode: 'coins', threshold: trigger.threshold, ...(trigger.name ? { name: trigger.name } : {}) }
  return next
}
export function hitItem(level: JumpLevel, x: number, y: number, tolerance: number): Selection | null {
  // Logic nodes are studio overlays, so remain selectable even over terrain.
  for (let i = (level.logicRelays?.length ?? 0) - 1; i >= 0; i--) {
    const b = logicRelayBounds(level.logicRelays![i])
    if (x >= b.x - tolerance && x <= b.x + b.w + tolerance && y >= b.y - tolerance && y <= b.y + b.h + tolerance) return { kind: 'logic-relay', index: i }
  }
  if (Math.abs(x - level.spawn.x) < tolerance * 1.5 && y <= level.spawn.y + tolerance && y >= level.spawn.y - 62 - tolerance) return { kind: 'spawn', index: 0 }
  for (let i = level.checkpoints.length - 1; i >= 0; i--) if (Math.hypot(x - level.checkpoints[i].x, y - level.checkpoints[i].y + 25) < tolerance * 3) return { kind: 'checkpoint', index: i }
  if (level.goal) {
    const b = goalBounds(level.goal)
    if (x >= b.x - tolerance && x <= b.x + b.w + tolerance && y >= b.y - tolerance && y <= b.y + b.h + tolerance) return { kind: 'goal', index: 0 }
  }
  for (let i = (level.pickups?.length ?? 0) - 1; i >= 0; i--) {
    const b = pickupBounds(level.pickups![i])
    if (x >= b.x - tolerance && x <= b.x + b.w + tolerance && y >= b.y - tolerance && y <= b.y + b.h + tolerance) return { kind: 'pickup', index: i }
  }
  for (const kind of ['prop', 'robot', 'trigger', 'mechanism', 'force-field'] as const) {
    const length = (kind === 'prop' ? level.props : kind === 'robot' ? level.robots : kind === 'trigger' ? level.triggers : kind === 'force-field' ? level.forceFields : level.mechanisms)?.length ?? 0
    for (let i = length - 1; i >= 0; i--) {
      const b = kind === 'robot' ? itemOutline(level, { kind, index: i })! : itemBounds(level, { kind, index: i })!
      if (x >= b.x - tolerance && x <= b.x + b.w + tolerance && y >= b.y - tolerance && y <= b.y + b.h + tolerance) return { kind, index: i }
      if (kind === 'mechanism' && level.mechanisms![i].kind === 'lift') {
        const m = level.mechanisms![i], anchor = mechanismAnchor(m), end = mechanismRopeEnd(m)
        const dx = end.x - anchor.x, dy = end.y - anchor.y
        const t = clamp(((x - anchor.x) * dx + (y - anchor.y) * dy) / (dx * dx + dy * dy || 1), 0, 1)
        if (Math.hypot(x - anchor.x - t * dx, y - anchor.y - t * dy) <= tolerance + 5) return { kind, index: i }
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
    })) return { kind: 'rope', index: i }
  }
  for (let i = level.climbables.ladders.length - 1; i >= 0; i--) {
    const l = level.climbables.ladders[i]
    if (Math.abs(x - l.x) <= tolerance + 8 && y >= l.top - tolerance && y <= l.bottom + tolerance) return { kind: 'ladder', index: i }
  }
  const terrainOrder = terrainDrawOrder(level.platforms)
  for (let position = terrainOrder.length - 1; position >= 0; position--) {
    const i = terrainOrder[position]
    const b = level.platforms[i]
    if (pointInside(b, x, y)) return { kind: 'platform', index: i }
  }
  for (let i = (level.gravityPlates?.length ?? 0) - 1; i >= 0; i--) {
    const b = level.gravityPlates![i]
    // The emitter and rectangle outline select the device; its interior lets
    // the pointer reach actors and terrain within the field.
    const inside = x >= b.x - tolerance && x <= b.x + b.w + tolerance && y >= b.y - tolerance && y <= b.y + b.h + tolerance
    if (inside && (b.effect === 'water' || Math.abs(x - b.x) <= tolerance || Math.abs(x - b.x - b.w) <= tolerance
      || Math.abs(y - b.y) <= tolerance || Math.abs(y - b.y - b.h) <= tolerance
      || (b.ceiling ? y <= b.y + 10 + tolerance : y >= b.y + b.h - 10 - tolerance))) return { kind: 'gravity-plate', index: i }
  }
  // Wall objects sit behind the terrain and other playable objects.
  for (let i = (level.wallLights?.length ?? 0) - 1; i >= 0; i--) {
    const b = wallLightBounds(level.wallLights![i])
    if (x >= b.x - tolerance && x <= b.x + b.w + tolerance && y >= b.y - tolerance && y <= b.y + b.h + tolerance) return { kind: 'wall-light', index: i }
  }
  for (let i = (level.lighting?.lights.length ?? 0) - 1; i >= 0; i--) {
    const b = lightBounds(level.lighting!.lights[i])
    if (x >= b.x - tolerance && x <= b.x + b.w + tolerance && y >= b.y - tolerance && y <= b.y + b.h + tolerance) return { kind: 'light', index: i }
  }
  for (let i = (level.timers?.length ?? 0) - 1; i >= 0; i--) {
    const t = level.timers![i]
    if (x >= t.x - tolerance && x <= t.x + WALL_TIMER_WIDTH + tolerance && y >= t.y - tolerance && y <= t.y + WALL_TIMER_HEIGHT + tolerance) return { kind: 'timer', index: i }
  }
  for (let i = (level.texts?.length ?? 0) - 1; i >= 0; i--) {
    const t = level.texts![i]
    const local = wallTextLocalPoint(t, x, y)
    if (local.x >= -tolerance && local.x <= t.w + tolerance && local.y >= -tolerance && local.y <= t.h + tolerance) return { kind: 'text', index: i }
  }
  return null
}
export function replacePlatform(level: JumpLevel, index: number, platform: Platform): JumpLevel {
  const next = copyLevel(level), before = level.platforms[index]
  next.platforms[index] = { ...(before.name ? { name: before.name } : {}), ...(before.zIndex === undefined ? {} : { zIndex: before.zIndex }), ...platform }
  for (const ladder of next.climbables.ladders) if (ladder.platform === index) {
    ladder.x = ladder.side === 1 ? platform.x - 16 : platform.x + platform.w + 16
    ladder.bottom += platform.y - before.y; ladder.top = platform.y
  }
  for (const rope of next.climbables.ropes) if (rope.anchor?.platform === index) {
    rope.anchor.x *= platform.w / before.w; rope.anchor.y *= platform.h / before.h
    const edge = nearestBoundary(platform, platform.x + rope.anchor.x, platform.y + rope.anchor.y)
    rope.x = edge.x; rope.y = edge.y; rope.anchor.x = edge.x - platform.x; rope.anchor.y = edge.y - platform.y
  }
  // Carry start/checkpoint markers with the surface that supports them.
  for (const p of [next.spawn, ...next.checkpoints, ...(next.goal ? [next.goal] : [])]) {
    const supportX = p === next.goal ? (() => { const b = goalBounds(next.goal); return b.x + b.w / 2 })() : p.x
    if (supportX < before.x || supportX > before.x + before.w || Math.abs(p.y - platformSurface(before, supportX).y) >= .1) continue
    const carriedX = platform.x + (supportX - before.x) / before.w * platform.w
    p.x += carriedX - supportX; p.y = platformSurface(platform, carriedX).y
  }
  return next
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
    const polygon = polygonPoints({ ...before, x: 0, y: 0 }).map(([x, y]) => point(x, y))
    if (!validPolygon(polygon)) throw new Error(`${objectReference(level, 'platform', index)} cannot be transformed as an editable polygon. Simplify its outline first.`)
    delete terrain.profile
    terrain.polygon = polygon
  }
  for (const rope of next.climbables.ropes) if (rope.anchor?.platform === index) {
    const [x, y] = point(rope.anchor.x, rope.anchor.y)
    rope.anchor.x = x; rope.anchor.y = y
    rope.x = terrain.x + x; rope.y = terrain.y + y
    delete rope.rest
  }
  // Legacy ladders are always upright. Leave them in place as independent ladders.
  if (rotate) for (const ladder of next.climbables.ladders) if (ladder.platform === index) ladder.platform = -1
  return next
}

export function moveItem(level: JumpLevel, selection: Selection, dx: number, dy: number): JumpLevel {
  const b = itemBounds(level, selection)
  if (!b) return level
  const attached = selection.kind === 'platform' ? level.climbables.ladders.filter(l => l.platform === selection.index) : []
  const x = clamp(b.x + dx, attached.some(l => l.side === 1) ? 16 : 0, level.width - b.w - (attached.some(l => l.side === -1) ? 16 : 0))
  const y = clamp(b.y + dy, 0, levelHeight(level) - b.h)
  if (selection.kind === 'platform') return replacePlatform(level, selection.index, { ...level.platforms[selection.index], x, y })
  const next = copyLevel(level)
  if (selection.kind === 'rope') { Object.assign(next.climbables.ropes[selection.index], { x, y }); delete next.climbables.ropes[selection.index].anchor }
  if (selection.kind === 'ladder') {
    const ladder = next.climbables.ladders[selection.index]
    ladder.x = x; ladder.bottom = y + b.h; ladder.top = y; ladder.platform = -1
  }
  // Moving a marker must honor the requested height, even before its supporting
  // terrain is built. Snapping every move to ground traps nudges at the floor.
  if (selection.kind === 'spawn') next.spawn = { ...next.spawn, x, y }
  if (selection.kind === 'checkpoint') Object.assign(next.checkpoints[selection.index], { x, y })
  if (selection.kind === 'goal') {
    const b = goalBounds({ ...next.goal, x: 0, y: 0 })
    next.goal = { ...next.goal, x: clamp(x, Math.max(0, -b.x), Math.min(level.width, level.width - b.x - b.w)), y }
  }
  if (selection.kind === 'timer') Object.assign(next.timers![selection.index], { x, y })
  if (selection.kind === 'text') next.texts![selection.index] = fitWallText({ ...next.texts![selection.index], x: b.x + dx, y: b.y + dy }, next.width, levelHeight(next))
  if (selection.kind === 'pickup') {
    const bounds = pickupBounds({ kind: next.pickups![selection.index].kind, x: 0, y: 0 })
    Object.assign(next.pickups![selection.index], { x: x - bounds.x, y: y - bounds.y })
  }
  if (selection.kind === 'prop') Object.assign(next.props![selection.index], { x: clamp(x + b.w / 2, 24 + b.w / 2, level.width - 24 - b.w / 2), y: Math.min(next.floor!, y + b.h) })
  if (selection.kind === 'robot') {
    const r = next.robots![selection.index], point = { x: clamp(x + 26, 50, next.width - 50), y: y + 50 }
    Object.assign(r, point, pusherRange(next, point.x, point.y))
  }
  if (selection.kind === 'mechanism') {
    const mechanism = next.mechanisms![selection.index]
    Object.assign(mechanism, { x: clamp(x, 24, next.width - b.w - 24), y: Math.min(next.floor! - b.h, y) })
  }
  if (selection.kind === 'force-field') Object.assign(next.forceFields![selection.index], { x, y })
  if (selection.kind === 'gravity-plate') Object.assign(next.gravityPlates![selection.index], { x, y })
  if (selection.kind === 'light') Object.assign(next.lighting!.lights[selection.index], { x: x + b.w / 2, y: y + b.h / 2 })
  if (selection.kind === 'wall-light') Object.assign(next.wallLights![selection.index], { x: x + b.w / 2, y: y + b.h / 2 })
  if (selection.kind === 'logic-relay') Object.assign(next.logicRelays![selection.index], { x: x + b.w / 2, y: y + b.h / 2 })
  if (selection.kind === 'trigger') {
    const t = next.triggers![selection.index]; t.x = clamp(x, 24, next.width - t.w - 24); t.y = t.mode === 'coins' || t.ceiling ? y : y + 8
    attachPressurePlateOnSurface(next, t)
  }
  if (selection.kind === 'mechanism') syncPressurePlateMounts(next)
  return next
}
export function resizeItem(level: JumpLevel, selection: Selection, w: number, h: number, handle?: ResizeHandle): JumpLevel {
  const next = copyLevel(level)
  const corner = handle ?? 'bottom-right'
  const left = corner.endsWith('left'), top = corner.startsWith('top')
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
      ...(before.profile ? { profile: before.profile.map(([x, y]) => [x / before.w * width, y / before.h * height] as [number, number]) } : {}) })
  }
  if (selection.kind === 'rope') next.climbables.ropes[selection.index].length = clamp(h, 80, Math.min(2000, levelHeight(level) - next.climbables.ropes[selection.index].y))
  if (selection.kind === 'ladder') {
    const ladder = next.climbables.ladders[selection.index]
    if (top) ladder.top = clamp(ladder.bottom - h, 0, ladder.bottom - 80)
    else ladder.bottom = clamp(ladder.top + h, ladder.top + 80, levelHeight(level))
    ladder.platform = -1
  }
  if (selection.kind === 'prop') {
    const b = next.props![selection.index], before = itemBounds(level, selection)!
    const requested = Math.abs(w - b.size) >= Math.abs(h - b.size) ? w : h
    const maxWidth = handle ? left ? before.x + before.w - 24 : next.width - before.x - 24 : Math.min(b.x - 24, next.width - 24 - b.x) * 2
    const maxHeight = !handle || top ? b.y : levelHeight(level) - before.y
    b.size = clamp(requested, 30, Math.min(200, maxWidth, maxHeight))
    if (handle) { b.x = left ? before.x + before.w - b.size / 2 : before.x + b.size / 2; b.y = top ? b.y : before.y + b.size }
    b.x = clamp(b.x, 24 + b.size / 2, next.width - 24 - b.size / 2)
  }
  if (selection.kind === 'mechanism') {
    const m = next.mechanisms![selection.index], before = { ...m }
    const vertical = m.kind === 'gate' && !isHorizontalGate(m), keepBottom = vertical && (!handle || top)
    const minWidth = Math.max(30, ...(next.triggers ?? []).flatMap(t => t.mode !== 'coins' && t.mount?.mechanism === m.id ? [t.w] : []))
    m.w = vertical ? MECHANISM_THICKNESS : clamp(w, minWidth, Math.min(600, left ? m.x + m.w - 24 : next.width - m.x - 24))
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
      t.w = clamp(w, t.mode === 'coins' ? COIN_SWITCH_MIN_LENGTH : 40, Math.min(240, left ? right - 24 : next.width - t.x - 24))
      if (left) t.x = right - t.w
    }
    if (t.mode !== 'coins' && t.mount) {
      const host = next.mechanisms?.find(m => m.id === t.mount!.mechanism)
      if (host) { t.w = Math.min(t.w, host.w); t.x = clamp(t.x, host.x, host.x + host.w - t.w) }
      attachPressurePlateOnSurface(next, t)
    }
  }
  if (selection.kind === 'mechanism') syncPressurePlateMounts(next)
  return next
}
export function deleteItem(level: JumpLevel, selection: Selection): JumpLevel {
  const next = copyLevel(level), i = selection.index
  if (selection.kind === 'spawn' || selection.kind === 'goal') return level
  if (selection.kind === 'platform') {
    next.platforms.splice(i, 1)
    next.climbables.ladders = next.climbables.ladders.map(l => ({ ...l, platform: l.platform === i ? -1 : l.platform > i ? l.platform - 1 : l.platform }))
    for (const r of next.climbables.ropes) if (r.anchor) {
      if (r.anchor.platform === i) delete r.anchor
      else if (r.anchor.platform > i) r.anchor.platform--
    }
  } else if (selection.kind === 'rope') next.climbables.ropes.splice(i, 1)
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
  }
  else if (selection.kind === 'wall-light') {
    const [light] = next.wallLights!.splice(i, 1)
    removeSwitchTarget(next, light.id)
  }
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
  return next
}
export function addItem(level: JumpLevel, tool: Tool, start: { x: number; y: number }, end: { x: number; y: number }): { level: JumpLevel; selection: Selection } | null {
  const next = copyLevel(level), x = clamp(Math.min(start.x, end.x), 0, level.width - 40), y = clamp(Math.min(start.y, end.y), 0, levelHeight(level) - 80)
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
    plates.push({ id: newLevelId(), x: left, y: top, w, h, gravity: -1, ...(water ? { effect: 'water', power: 'always' } as const : {}), ...(ceiling ? { ceiling: true } : {}) })
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
    if (next.lighting.lights.length >= MAX_LIGHTS) throw new Error('This level already has 16 lights.')
    const drag = Math.hypot(end.x - start.x, end.y - start.y) >= 10
    next.lighting.lights.push({ id: newLevelId(), x: clamp(start.x, 10, level.width - 10), y: clamp(start.y, 10, levelHeight(level) - 10),
      intensity: 100, direction: drag ? Math.atan2(end.y - start.y, end.x - start.x) * 180 / Math.PI : 90, spread: 70, power: 'always' })
    return { level: next, selection: { kind: 'light', index: next.lighting.lights.length - 1 } }
  }
  if (tool === 'text') {
    const texts = next.texts ??= []
    if (texts.length >= 80) throw new Error('This level already has 80 wall text areas.')
    const click = Math.hypot(end.x - start.x, end.y - start.y) < 10
    const w = clamp(click ? 320 : Math.abs(end.x - start.x), 40, Math.min(2000, next.width))
    const h = clamp(click ? 100 : Math.abs(end.y - start.y), 24, Math.min(1200, levelHeight(next)))
    texts.push({ x: clamp(x, 0, next.width - w), y: clamp(y, 0, levelHeight(next) - h), w, h, text: 'Your text', fontSize: 28, align: 'left' })
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
  if (tool === 'spawn' || tool === 'checkpoint') {
    const point = { x: clamp(end.x, 10, next.width - 10), y: clamp(end.y, 0, levelHeight(next)) }
    if (tool === 'spawn') next.spawn = point
    else { if (next.checkpoints.length >= 30) throw new Error('This level already has 30 checkpoints.'); next.checkpoints.push(point) }
    return { level: next, selection: { kind: tool, index: tool === 'spawn' ? 0 : next.checkpoints.length - 1 } }
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
    trial.triggers.push({ x: clamp(start.x, 24, trial.width - DIGITAL_DISPLAY_WIDTH - 24), y: clamp(start.y, 0, levelHeight(trial) - DIGITAL_DISPLAY_HEIGHT),
      w: DIGITAL_DISPLAY_WIDTH, display: 'digital', mode: 'coins', threshold: 3, targets: nearest ? [nearest.id] : [] })
    return { level: trial, selection: { kind: 'trigger', index: trial.triggers.length - 1 } }
  }
  if (['goal', 'box', 'ball', 'pusher', 'plate', 'lift', 'moving-platform', 'gate', 'horizontal-gate'].includes(tool)) {
    // New objects follow the authored point. The canvas applies nearby surface
    // snapping separately, so Snap off and Alt also preserve the cursor's height.
    const trial = asTrial(level), point = { x: Math.min(start.x, end.x), y: clamp(Math.min(start.y, end.y), 0, levelHeight(trial)) }
    if (tool === 'goal') { trial.goal = { ...trial.goal, ...point, x: clamp(point.x, 70, trial.width - 110) }; return { level: trial, selection: { kind: 'goal', index: 0 } } }
    if (tool === 'box' || tool === 'ball') {
      if (trial.props.length >= 80) throw new Error('This level already has 80 props.')
      const drawn = Math.max(Math.abs(end.x - start.x), Math.abs(end.y - start.y))
      const size = drawn > 10 ? clamp(drawn, 30, 200) : tool === 'box' ? 80 : 68
      trial.props.push({ kind: tool, x: clamp(point.x + (drawn > 10 ? size / 2 : 0), 24 + size / 2, trial.width - 24 - size / 2),
        y: clamp(drawn > 10 ? Math.max(start.y, end.y) : point.y, size, levelHeight(trial)), size })
      return { level: trial, selection: { kind: 'prop', index: trial.props.length - 1 } }
    }
    if (tool === 'pusher') {
      if (trial.robots.length >= 30) throw new Error('This level already has 30 shovebots.')
      const position = { x: clamp(point.x, 50, trial.width - 50), y: Math.max(50, point.y) }
      trial.robots.push({ ...position, ...pusherRange(trial, position.x, position.y) })
      return { level: trial, selection: { kind: 'robot', index: trial.robots.length - 1 } }
    }
    if (tool === 'plate') {
      if (trial.triggers.length >= 40) throw new Error('This level already has 40 switches.')
      const nearest = trial.mechanisms.filter(m => m.power !== 'always').sort((a, b) => Math.hypot(a.x - x, a.y - y) - Math.hypot(b.x - x, b.y - y))[0]
      const left = clamp(point.x - 50, 24, trial.width - 124)
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
      trial.mechanisms.push({ id: newLevelId(), kind: lift ? 'lift' : 'gate', x: clamp(moving ? start.x : x, 24, trial.width - w - 24),
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
  if (selection.kind === 'spawn' || selection.kind === 'goal') return null
  let index = 0
  if (selection.kind === 'platform') {
    if (next.platforms.length >= 160) return null
    index = next.platforms.push(copyLevel(level).platforms[i]) - 1
  } else if (selection.kind === 'rope') { if (next.climbables.ropes.length >= 40) return null; index = next.climbables.ropes.push({ ...next.climbables.ropes[i] }) - 1 }
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
  else if (selection.kind === 'logic-relay') { if (next.logicRelays!.length >= MAX_LOGIC_RELAYS) return null; index = next.logicRelays!.push({ ...next.logicRelays![i], id: newLevelId() }) - 1 }
  else { if (next.checkpoints.length >= 30) return null; index = next.checkpoints.push({ ...next.checkpoints[i] }) - 1 }
  const result = { kind: selection.kind, index }
  const moved = moveItem(next, result, 40, 0)
  return { level: selection.kind === 'platform' ? reorderTerrain(moved, index, 'front') : moved, selection: result }
}
export function allSelections(level: JumpLevel): Selection[] {
  return [{ kind: 'spawn', index: 0 }, ...(level.goal ? [{ kind: 'goal' as const, index: 0 }] : []),
    ...(level.logicRelays ?? []).map((_, index) => ({ kind: 'logic-relay' as const, index })),
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
export function anchorRope(level: JumpLevel, index: number, maxDistance = 40): JumpLevel {
  const next = copyLevel(level), r = next.climbables.ropes[index]
  const candidates = next.platforms.map((b, platform) => ({ ...nearestBoundary(b, r.x, r.y), platform })).sort((a, b) => a.distance - b.distance)
  const best = candidates[0]
  if (!best || best.distance > maxDistance) return next
  const b = next.platforms[best.platform]
  r.x = best.x; r.y = best.y; r.anchor = { platform: best.platform, x: r.x - b.x, y: r.y - b.y }
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
export type TerrainNodeTarget = { index: number; edge: number; x: number; y: number }
export type TerrainVertexTarget = { index: number; vertex: number; x: number; y: number }

/** Pick the nearest existing node, preferring the topmost terrain on ties. */
export function terrainVertexTarget(level: JumpLevel, x: number, y: number, tolerance: number): TerrainVertexTarget | null {
  let best: TerrainVertexTarget | null = null, distance = tolerance
  const order = terrainDrawOrder(level.platforms)
  for (let position = order.length - 1; position >= 0; position--) {
    const index = order[position]
    for (const [vertex, [vx, vy]] of polygonPoints(level.platforms[index]).entries()) {
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
    const points = polygonPoints(level.platforms[index])
    for (let edge = 0; edge < points.length; edge++) {
      const a = points[edge], b = points[(edge + 1) % points.length], dx = b[0] - a[0], dy = b[1] - a[1]
      const t = clamp(((x - a[0]) * dx + (y - a[1]) * dy) / (dx * dx + dy * dy), 0, 1)
      const px = a[0] + dx * t, py = a[1] + dy * t, distance = Math.hypot(x - px, y - py)
      if (distance <= tolerance && (!best || distance < best.distance)) best = { index, edge, x: px, y: py, distance }
    }
  }
  if (!best) return null
  const points = polygonPoints(level.platforms[best.index]), a = points[best.edge], b = points[(best.edge + 1) % points.length]
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
  const points = polygonPoints(level.platforms[target.index])
  if (points.length >= 64) throw new Error(`${objectReference(level, 'platform', target.index)} already has 64 nodes.`)
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
  const points = polygonPoints(terrain)
  if (!Number.isInteger(vertex) || vertex < 0 || vertex >= points.length) return level
  if (points.length <= 3) throw new Error(`${objectReference(level, 'platform', index)} needs at least three nodes.`)
  points.splice(vertex, 1)
  return replacePlatform(level, index, polygonPlatform(points, terrain.material))
}

export function moveVertex(level: JumpLevel, index: number, vertex: number, dx: number, dy: number): JumpLevel {
  const points = polygonPoints(level.platforms[index])
  const p = points[vertex]; points[vertex] = [clamp(p[0] + dx, 0, level.width), clamp(p[1] + dy, 0, levelHeight(level))]
  try { return replacePlatform(level, index, polygonPlatform(points, level.platforms[index].material)) } catch { return level }
}
