import { parseObjectName } from './objectNames.ts'
import { objectReference } from './objectLabels.ts'
import type { NamedObject } from './objectNames.ts'
import { createPlayer } from './model.ts'
import type { Checkpoint, LevelRules, Platform } from './model.ts'
import { createRope, ropeSegmentCount } from './climbables.ts'
import { prepareRope } from './ropeLayout.ts'
import type { ClimbableWorld } from './climbables.ts'
import { groundAt, platformSurfaces } from './terrain.ts'
import { advanceFootwork } from './footwork.ts'
import { canGrip } from './friction.ts'
import { bodyIntersects, nearestBoundary, polygonIntersects, validPolygon } from './geometry.ts'
import { goalBounds, goalDoor, goalPoleX } from './goal.ts'
import { MAX_SWITCH_TARGETS, parseSwitchSettings, removeSwitchTarget, switchWiringProblems, validSwitchTargetId } from './switchPower.ts'
import type { PlateBehavior, PowerMode, SwitchSettings } from './switchPower.ts'
import type { Goal } from './goal.ts'
import { WALL_TIMER_WIDTH, WALL_TIMER_HEIGHT } from './wallTimer.ts'
import type { WallTimer } from './wallTimer.ts'
import type { WallText } from './wallText.ts'
import { wallTextBounds } from './wallText.ts'
import { pickupBounds } from './pickups.ts'
import type { Pickup } from './pickups.ts'
import { DIGITAL_DISPLAY_WIDTH, DIGITAL_DISPLAY_HEIGHT } from './digitalDisplay.ts'
import { COIN_SWITCH_THICKNESS, COIN_SWITCH_MIN_LENGTH, coinSwitchBounds } from './coins.ts'
import type { CoinSwitchOrientation } from './coins.ts'
import { MECHANISM_THICKNESS, prepareMechanism } from './mechanisms.ts'
import { isTerrainMaterial } from './terrainMaterials.ts'
import type { TerrainMaterial } from './terrainMaterials.ts'
import { lightingProblems, parseLighting } from './lightingDefinition.ts'
import type { LightingDefinition } from './lightingDefinition.ts'
import { ROBOT_HALF_WIDTH } from './robotPhysics.ts'
import type { PressurePlateMount } from './pressurePlateMount.ts'
import { MAX_WALL_LIGHTS, WALL_LIGHT_RADIUS, wallLightBounds } from './wallLight.ts'
import type { WallLight } from './wallLight.ts'
import { MAX_LOGIC_RELAYS, LOGIC_RELAY_WIDTH, LOGIC_RELAY_HEIGHT, logicRelayBounds } from './logicRelay.ts'
import type { LogicRelay } from './logicRelay.ts'

import { MAX_GRAVITY_PLATES } from './gravity.ts'
import type { GravityPlate } from './gravity.ts'
import { waterControlId } from './waterLevel.ts'
import { MAX_FORCE_FIELDS, FORCE_FIELD_THICKNESS, FORCE_FIELD_MIN_LENGTH } from './forceField.ts'
import type { ForceField } from './forceField.ts'
import type { PropWeight } from './propWeight.ts'

export const LEVEL_GRID_SIZE = 20

export interface PropDefinition extends NamedObject { kind: 'box' | 'ball'; x: number; y: number; size: number; weight?: PropWeight }
export interface Mechanism extends NamedObject, SwitchSettings { id: string; kind: 'lift' | 'gate'; x: number; y: number; w: number; h: number; travel: number; orientation?: 'horizontal'; flipX?: boolean; power?: PowerMode }
/** Both legacy mode values accept the player and props; retained for file compatibility. */
type TriggerConnection = { targets: string[]; target?: never } | { target: string; targets?: never }
export type Trigger = NamedObject & { x: number; y: number; w: number } & TriggerConnection
  & ({ mode: 'weight' | 'touch'; behavior?: PlateBehavior; startsOn?: boolean; mount?: PressurePlateMount; ceiling?: boolean } | { mode: 'coins'; threshold: number } & CoinSwitchOrientation)
/** Legacy single connections remain readable without rewriting existing files. */
export const triggerTargets = (trigger: Trigger): readonly string[] => trigger.targets ?? (trigger.target ? [trigger.target] : [])
export interface Pusher extends NamedObject { x: number; y: number; left: number; right: number; headlight?: boolean }
export interface JumpLevel {
  version: 1 | 2; id: string; name: string; width: number; height?: number
  lighting?: LightingDefinition
  spawn: Checkpoint; checkpoints: Checkpoint[]; platforms: Platform[]
  climbables: { ladders: ClimbableWorld['ladders'][number][]; ropes: ClimbableWorld['ropes'][number][] }
  floor?: number; goal?: Goal
  floorMaterial?: TerrainMaterial
  times?: { gold: number; silver: number; bronze: number }
  props?: PropDefinition[]; mechanisms?: Mechanism[]; triggers?: Trigger[]; robots?: Pusher[]
  timers?: WallTimer[]
  wallLights?: WallLight[]
  logicRelays?: LogicRelay[]
  gravityPlates?: GravityPlate[]
  forceFields?: ForceField[]
  texts?: WallText[]
  pickups?: Pickup[]
}
export interface PuzzleLevel extends JumpLevel {
  height: number; floor: number; goal: Goal; times: { gold: number; silver: number; bronze: number }
  props: PropDefinition[]; mechanisms: Mechanism[]; triggers: Trigger[]; robots: Pusher[]
}
export const isPuzzleLevel = (level: JumpLevel): level is PuzzleLevel => level.goal !== undefined && level.floor !== undefined && level.times !== undefined
/** Legacy floor values are the bottom of the playable rectangle. */
export const levelHeight = (level: JumpLevel) => level.floor ?? level.height ?? 1020
/** Four solid half-spaces enclose the level. The renderer fills the entire outside viewport. */
export function levelTerrain(level: JumpLevel): Platform[] {
  const extent = 1e7, h = levelHeight(level)
  return [...level.platforms,
    { x: -extent, y: h, w: extent * 2, h: extent, ...(level.floorMaterial ? { material: level.floorMaterial } : {}) },
    { x: -extent, y: -extent, w: extent * 2, h: extent },
    { x: -extent, y: 0, w: extent, h }, { x: level.width, y: 0, w: extent, h }]
}
export const copyLevel = <T extends JumpLevel>(level: T): T => structuredClone(level)
export const newLevelId = () => globalThis.crypto.randomUUID()
export function newLevel(): JumpLevel {
  return { version: 1, id: newLevelId(), name: 'Untitled level', width: 3200, height: 1000, spawn: { x: 200, y: 1000 }, checkpoints: [],
    platforms: [], climbables: { ladders: [], ropes: [] } }
}
export function levelRules(level: JumpLevel): LevelRules {
  return { checkpoints: level.checkpoints, fallY: levelHeight(level) + 100 }
}
export function levelPlayer(level: JumpLevel, preview = false) {
  const p = createPlayer(level.spawn), terrain = levelTerrain(level), ground = groundAt(terrain, level.spawn.x, level.spawn.y, .1)
  p.ropes = level.climbables.ropes.map(r => createRope(preview ? r : prepareRope(r, terrain)))
  Object.assign(p, { x: level.spawn.x, y: level.spawn.y, spawnX: level.spawn.x, spawnY: level.spawn.y,
    grounded: !!ground, groundAngle: ground?.angle ?? 0, jumpStart: level.spawn.y })
  p.terrain = terrain
  advanceFootwork(p, 0, p.x, terrain)
  return p
}
/** Saved geometry is also the editor preview and the first playable frame. */
export function prepareLevelRopes<T extends JumpLevel>(level: T, preview = false): T {
  const terrain = levelTerrain(level), ropes = level.climbables.ropes.map(r => {
    const resolved = prepareRope(r, terrain, preview)
    if (resolved.x !== r.x || resolved.y !== r.y) {
      const platform = level.platforms.findIndex(b => nearestBoundary(b, resolved.x, resolved.y).distance < .01)
      if (platform >= 0) return { ...resolved, anchor: { platform, x: resolved.x - level.platforms[platform].x, y: resolved.y - level.platforms[platform].y } }
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
  const terrain = levelTerrain(level)
  const { x, y } = level.spawn
  const ground = groundAt(terrain, x, y, .15)
  if (!ground || !canGrip(ground.angle)) return `Place ${objectReference(level, 'spawn')} on a surface with enough grip to stand still.`
  if (terrain.some(b => bodyIntersects(x, y, b))) {
    return `${objectReference(level, 'spawn')} needs enough space for the player to stand.`
  }
  return null
}
export function levelProblems(level: JumpLevel): string[] {
  const issues: string[] = [], spawn = spawnProblem(level)
  if (!level.name.trim()) issues.push('Give the level a name.')
  if (spawn) issues.push(spawn)
  for (const [i, b] of level.platforms.entries()) if (b.y < 0 || b.x < 0 || b.x + b.w > level.width || b.y + b.h > levelHeight(level)) issues.push(`Keep ${objectReference(level, 'platform', i)} inside the level rectangle.`)
  for (const [i, t] of (level.texts ?? []).entries()) {
    const b = wallTextBounds(t)
    if (b.x < -.001 || b.y < -.001 || b.x + b.w > level.width + .001 || b.y + b.h > levelHeight(level) + .001) issues.push(`Keep ${objectReference(level, 'text', i)} inside the level rectangle.`)
  }
  for (const [i, light] of (level.wallLights ?? []).entries()) {
    const b = wallLightBounds(light)
    if (b.x < 0 || b.y < 0 || b.x + b.w > level.width || b.y + b.h > levelHeight(level)) issues.push(`Keep ${objectReference(level, 'wall-light', i)} inside the level rectangle.`)
  }
  for (const [i, relay] of (level.logicRelays ?? []).entries()) {
    const b = logicRelayBounds(relay)
    if (b.x < 0 || b.y < 0 || b.x + b.w > level.width || b.y + b.h > levelHeight(level)) issues.push(`Keep ${objectReference(level, 'logic-relay', i)} inside the level rectangle.`)
  }
  for (const [i, p] of (level.gravityPlates ?? []).entries()) {
    if (p.x < 0 || p.y < 0 || p.x + p.w > level.width || p.y + p.h > levelHeight(level)) issues.push(`Keep ${objectReference(level, 'gravity-plate', i)} inside the level rectangle.`)
  }
  for (const [i, field] of (level.forceFields ?? []).entries()) {
    if (field.x < 0 || field.y < 0 || field.x + field.w > level.width || field.y + field.h > levelHeight(level)) issues.push(`Keep ${objectReference(level, 'force-field', i)} inside the level rectangle.`)
  }
  if (isPuzzleLevel(level)) {
    const terrain = levelTerrain(level), bounds = goalBounds(level.goal), door = goalDoor(level.goal)
    const left = Math.min(goalPoleX(level.goal) - 2, door.x), right = Math.max(goalPoleX(level.goal) + 2, door.x + door.w)
    const count = Math.ceil((right - left) / 8)
    const supported = Array.from({ length: count + 1 }, (_, i) => left + (right - left) * i / count).every(x => {
      const support = groundAt(terrain, x, level.goal.y, .15)
      return support && Math.abs(support.angle) < .02
    })
    const blocked = terrain.some(b => polygonIntersects([[door.x, door.y], [door.x + door.w, door.y],
      [door.x + door.w, door.y + door.h], [door.x, door.y + door.h]], b))
    if (!supported || blocked || bounds.x < 0 || bounds.x + bounds.w > level.width || bounds.y < 0 || level.goal.y > levelHeight(level)) {
      issues.push(`Place the exit and indicator for ${objectReference(level, 'goal')} on a continuous flat surface, with a clear doorway inside the level.`)
    }
    if (!(level.times.gold > 0 && level.times.gold < level.times.silver && level.times.silver < level.times.bronze)) issues.push('Medal times must increase from gold to silver to bronze.')
    const coins = level.pickups?.filter(p => p.kind === 'coin').length ?? 0
    for (const [i, t] of level.triggers.entries()) {
      if (t.mode !== 'coins') continue
      if (t.threshold > coins) issues.push(`Add enough coins for ${objectReference(level, 'trigger', i)} to reach its threshold (${coins} available, ${t.threshold} required).`)
      const b = coinSwitchBounds(t)
      if (b.x < 0 || b.y < 0 || b.x + b.w > level.width || b.y + b.h > levelHeight(level)) issues.push(`Keep ${objectReference(level, 'trigger', i)} inside the level rectangle.`)
    }
    for (const [i, r] of level.robots.entries()) if (!groundAt(terrain, r.x, r.y, .2)) issues.push(`Place ${objectReference(level, 'robot', i)} on a terrain surface.`)
    for (const [i, t] of (level.timers ?? []).entries()) if (t.x < 0 || t.y < 0 || t.x + WALL_TIMER_WIDTH > level.width || t.y + WALL_TIMER_HEIGHT > levelHeight(level)) issues.push(`Keep ${objectReference(level, 'timer', i)} inside the level rectangle.`)
    for (const [i, p] of (level.pickups ?? []).entries()) {
      const b = pickupBounds(p)
      if (b.x < 0 || b.y < 0 || b.x + b.w > level.width || b.y + b.h > levelHeight(level)) issues.push(`Keep ${objectReference(level, 'pickup', i)} inside the level rectangle.`)
    }
  }
  return [...issues, ...lightingProblems(level)]
}

/** Imported files and browser storage both pass through the same bounded decoder. */
export function parseLevel(value: unknown): JumpLevel {
  const fail = (): never => { throw new Error('This file is not a valid jumping level.') }
  const object = (v: unknown): Record<string, unknown> => v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : fail()
  const num = (v: unknown, min: number, max: number): number => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max ? v : fail()
  const list = (v: unknown, max: number): unknown[] => Array.isArray(v) && v.length <= max ? v : fail()
  const objectName = (v: Record<string, unknown>): NamedObject => parseObjectName(v.name, fail)
  const point = (v: unknown): Checkpoint => { const p = object(v); return { ...objectName(p), x: num(p.x, 0, 20000), y: num(p.y, -2000, 6000),
    ...(p.radius === undefined ? {} : { radius: num(p.radius, 10, 1000) }) } }
  const v = object(value)
  if (v.version !== 1 && v.version !== 2) throw new Error('Unsupported jumping level version. This game reads versions 1 and 2.')
  if (v.version === 1 && v.lighting !== undefined) throw new Error('Lighting requires a version 2 level file.')
  if (typeof v.name !== 'string' || !v.name.trim() || v.name.length > 80 || typeof v.id !== 'string' || v.id.length > 100) fail()
  const width = num(v.width, 800, 20000)
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
      if (!validPolygon(points)) fail()
      platform.polygon = points
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
    const r = object(item), segments = num(r.segments, 4, ropeSegmentCount(2000))
    if (!Number.isInteger(segments)) fail()
    const rope: ClimbableWorld['ropes'][number] = { ...objectName(r), x: num(r.x, 0, width), y: num(r.y, -2000, 6000), length: num(r.length, 80, 2000), segments }
    if (r.anchor !== undefined) {
      const a = object(r.anchor), platform = num(a.platform, 0, platforms.length - 1)
      if (!Number.isInteger(platform)) fail()
      const b = platforms[platform]
      rope.anchor = { platform, x: num(a.x, 0, b.w), y: num(a.y, 0, b.h) }
      rope.x = b.x + rope.anchor.x; rope.y = b.y + rope.anchor.y
      if (nearestBoundary(b, rope.x, rope.y).distance > .01) fail()
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
      rope.rest = { key: rest.key as string, points, ...(distances ? { distances } : {}), ...(bends ? { bends } : {}) }
    }
    return rope
  })
  const spawn = point(v.spawn), checkpoints = list(v.checkpoints, 30).map(point)
  if (spawn.x > width || checkpoints.some(p => p.x > width)) fail()
  const level: JumpLevel = { version: v.version as 1 | 2, id: v.id as string, name: (v.name as string).trim(), width,
    ...(v.height === undefined ? {} : { height: num(v.height, 400, 6000) }),
    platforms, spawn, checkpoints, climbables: { ladders, ropes } }
  if (v.floorMaterial !== undefined) {
    if (!isTerrainMaterial(v.floorMaterial)) return fail()
    level.floorMaterial = v.floorMaterial
  }
  // Existing local files use "flag". Preserve their assembly origin and export "goal".
  const goal = v.goal === undefined ? v.flag : v.goal
  if (goal !== undefined) {
    level.height = num(v.height, 400, 6000); level.floor = num(v.floor, 200, level.height)
    const location = point(goal), g = object(goal), flipX = g.flipX
    if (flipX !== undefined && typeof flipX !== 'boolean') fail()
    if (g.power !== undefined && g.power !== 'always' && g.power !== 'switched') fail()
    if (g.id !== undefined && (typeof g.id !== 'string' || !g.id.trim() || g.id.length > 100)) fail()
    if (g.power === 'switched' && g.id === undefined) fail()
    level.goal = { ...objectName(g), ...parseSwitchSettings(g, fail), x: location.x, y: location.y, ...(flipX === undefined ? {} : { flipX: flipX as boolean }),
      ...(g.id === undefined ? {} : { id: g.id as string }), ...(g.power === undefined ? {} : { power: g.power as PowerMode }) }; if (level.goal.x > width) fail()
    const times = object(v.times); level.times = { gold: num(times.gold, .1, 3600), silver: num(times.silver, .1, 3600), bronze: num(times.bronze, .1, 3600) }
    if (!(level.times.gold < level.times.silver && level.times.silver < level.times.bronze)) fail()
    level.props = list(v.props, 80).map(item => {
      const b = object(item); if (b.kind !== 'box' && b.kind !== 'ball') fail()
      if (b.weight !== undefined && b.weight !== 'light' && b.weight !== 'normal' && b.weight !== 'heavy') fail()
      const size = num(b.size, 30, 200)
      return { ...objectName(b), kind: b.kind as 'box' | 'ball', x: num(b.x, size / 2, width - size / 2), y: num(b.y, -1800, level.floor!), size,
        // Retired light variants load as ordinary props, keeping saved levels usable.
        ...(b.weight === undefined || b.weight === 'light' ? {} : { weight: b.weight as PropWeight }) }
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
      if (t.mode === 'coins' && t.mount !== undefined) fail()
      if (t.ceiling !== undefined && (t.mode === 'coins' || typeof t.ceiling !== 'boolean')) fail()
      if (t.behavior !== undefined && (t.mode === 'coins' || !['pressure', 'switch', 'toggle'].includes(t.behavior as string))) fail()
      if (t.startsOn !== undefined && (t.behavior !== 'toggle' || typeof t.startsOn !== 'boolean')) fail()
      let connection: TriggerConnection
      if (t.targets !== undefined) {
        if (t.target !== undefined || !Array.isArray(t.targets) || t.targets.length > MAX_SWITCH_TARGETS - (v.version === 1 ? 16 : 0)
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
          return { ...objectName(t), x: num(t.x, 0, width - DIGITAL_DISPLAY_WIDTH),
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
        return { ...objectName(t), x, y: num(t.y, 0, level.floor! - h), ...dimensions, ...connection, mode: 'coins', threshold }
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
      return { ...objectName(t), ...position, w, ...connection, mode: t.mode as 'touch' | 'weight', ...(mount ? { mount } : {}),
        ...(t.ceiling === undefined ? {} : { ceiling: t.ceiling as boolean }),
        ...(t.behavior === undefined ? {} : { behavior: t.behavior as PlateBehavior }), ...(t.startsOn === undefined ? {} : { startsOn: t.startsOn as boolean }) }
    })
    level.robots = list(v.robots, 30).map(item => {
      const r = object(item), left = num(r.left, ROBOT_HALF_WIDTH, width - ROBOT_HALF_WIDTH - 50), right = num(r.right, left + 50, width - ROBOT_HALF_WIDTH)
      if (r.headlight !== undefined && typeof r.headlight !== 'boolean') fail()
      return { ...objectName(r), x: num(r.x, left, right), y: num(r.y, -1800, level.floor!), left, right,
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
  } else if (['floor', 'times', 'props', 'mechanisms', 'triggers', 'robots', 'timers', 'pickups', 'wallLights', 'logicRelays', 'gravityPlates', 'forceFields'].some(key => v[key] !== undefined)) fail()
  if (v.texts !== undefined) level.texts = list(v.texts, 80).map(item => {
    const t = object(item), w = num(t.w, 40, 2000), h = num(t.h, 24, 1200)
    if (typeof t.text !== 'string' || t.text.length > 1000 || !['left', 'center', 'right'].includes(t.align as string)) fail()
    if (t.style !== undefined && t.style !== 'official' && t.style !== 'graffiti') fail()
    const text: WallText = { ...objectName(t), x: num(t.x, -1000, width), y: num(t.y, -600, levelHeight(level)), w, h,
      text: t.text as string, fontSize: num(t.fontSize, 12, 96), align: t.align as WallText['align'],
      ...(t.style === undefined ? {} : { style: t.style as WallText['style'] }),
      ...(t.rotation === undefined ? {} : { rotation: num(t.rotation, -180, 180) }) }
    const b = wallTextBounds(text)
    if (b.x < -.001 || b.y < -.001 || b.x + b.w > width + .001 || b.y + b.h > levelHeight(level) + .001) fail()
    return text
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
    return { ...objectName(p), ...(water ? {} : settings), id: p.id,
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
    const horizontal = field.orientation === 'horizontal'
    const w = num(field.w, horizontal ? FORCE_FIELD_MIN_LENGTH : FORCE_FIELD_THICKNESS, horizontal ? width : FORCE_FIELD_THICKNESS)
    const h = num(field.h, horizontal ? FORCE_FIELD_THICKNESS : FORCE_FIELD_MIN_LENGTH, horizontal ? FORCE_FIELD_THICKNESS : levelHeight(level))
    return { ...objectName(field), ...parseSwitchSettings(field, fail), id: field.id,
      x: num(field.x, 0, width - w), y: num(field.y, 0, levelHeight(level) - h), w, h, orientation: field.orientation,
      ...(field.power === undefined ? {} : { power: field.power as PowerMode }) }
  })
  if (v.wallLights !== undefined) level.wallLights = list(v.wallLights, MAX_WALL_LIGHTS).map(item => {
    const light = object(item)
    if (typeof light.id !== 'string' || !light.id.trim() || light.id.length > 100) return fail()
    return { ...objectName(light), ...parseSwitchSettings(light, fail), id: light.id,
      x: num(light.x, WALL_LIGHT_RADIUS, width - WALL_LIGHT_RADIUS), y: num(light.y, WALL_LIGHT_RADIUS, levelHeight(level) - WALL_LIGHT_RADIUS) }
  })
  if (v.logicRelays !== undefined) level.logicRelays = list(v.logicRelays, MAX_LOGIC_RELAYS).map(item => {
    const relay = object(item)
    if (typeof relay.id !== 'string' || !relay.id.trim() || relay.id.length > 100 || relay.relay !== undefined || relay.power !== undefined) return fail()
    return { ...objectName(relay), ...parseSwitchSettings(relay, fail), id: relay.id,
      x: num(relay.x, LOGIC_RELAY_WIDTH / 2, width - LOGIC_RELAY_WIDTH / 2),
      y: num(relay.y, LOGIC_RELAY_HEIGHT / 2, levelHeight(level) - LOGIC_RELAY_HEIGHT / 2) }
  })
  if (level.version === 2) level.lighting = parseLighting(v.lighting)
  // Older pools were wired like gravity devices. Water is now a passive region;
  // remove those obsolete connections before validating the remaining circuit.
  for (const plate of level.gravityPlates ?? []) if (plate.effect === 'water') removeSwitchTarget(level, plate.id)
  if (level.version === 2) {
    const issues = lightingProblems(level)
    if (issues.length) throw new Error(issues[0])
  }
  const ids = [...level.logicRelays ?? [], ...level.mechanisms ?? [], ...level.lighting?.lights ?? [], ...level.wallLights ?? [], ...level.gravityPlates ?? [], ...level.forceFields ?? [], ...(level.goal?.id ? [level.goal] : [])].map(item => item.id)
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
    spawn: { x: 160, y: 920 }, goal: { x: 1620, y: 920 }, platforms: [], checkpoints: [],
    climbables: { ropes: [], ladders: [] }, props: [], robots: [], triggers: [], mechanisms: [], timers: [], texts: [], pickups: [], times: { gold: 10, silver: 20, bronze: 40 } }
}
