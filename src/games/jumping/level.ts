import { createPlayer } from './model.ts'
import type { Checkpoint, LevelRules, Platform } from './model.ts'
import { createRope, ropeSegmentCount } from './climbables.ts'
import { prepareRope } from './ropeLayout.ts'
import type { ClimbableWorld } from './climbables.ts'
import { groundAt, platformSurfaces } from './terrain.ts'
import { canGrip } from './friction.ts'
import { bodyIntersects, nearestBoundary, polygonIntersects, validPolygon } from './geometry.ts'
import { GOAL_PLATE_WIDTH, goalBounds, goalDoor } from './goal.ts'
import type { Goal } from './goal.ts'
import { WALL_TIMER_WIDTH, WALL_TIMER_HEIGHT } from './wallTimer.ts'
import type { WallTimer } from './wallTimer.ts'
import type { WallText } from './wallText.ts'
import { pickupBounds } from './pickups.ts'
import type { Pickup } from './pickups.ts'
import { MECHANISM_THICKNESS, prepareMechanism } from './mechanisms.ts'

export const LEVEL_GRID_SIZE = 20

export interface PropDefinition { kind: 'box' | 'ball'; x: number; y: number; size: number }
export interface Mechanism { id: string; kind: 'lift' | 'gate'; x: number; y: number; w: number; h: number; travel: number; orientation?: 'horizontal'; flipX?: boolean }
/** Both legacy mode values accept the player and props; retained for file compatibility. */
type TriggerConnection = { targets: string[]; target?: never } | { target: string; targets?: never }
export type Trigger = { x: number; y: number; w: number; mode: 'weight' | 'touch' } & TriggerConnection
/** Legacy single connections remain readable without rewriting existing files. */
export const triggerTargets = (trigger: Trigger): readonly string[] => trigger.targets ?? (trigger.target ? [trigger.target] : [])
export interface Pusher { x: number; y: number; left: number; right: number }
export interface JumpLevel {
  version: 1; id: string; name: string; width: number; height?: number
  spawn: Checkpoint; checkpoints: Checkpoint[]; platforms: Platform[]
  climbables: { ladders: ClimbableWorld['ladders'][number][]; ropes: ClimbableWorld['ropes'][number][] }
  description?: string; floor?: number; goal?: Goal
  times?: { gold: number; silver: number; bronze: number }
  props?: PropDefinition[]; mechanisms?: Mechanism[]; triggers?: Trigger[]; robots?: Pusher[]
  timers?: WallTimer[]
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
    { x: -extent, y: h, w: extent * 2, h: extent },
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
export function levelPlayer(level: JumpLevel) {
  const p = createPlayer(level.spawn), terrain = levelTerrain(level), ground = groundAt(terrain, level.spawn.x, level.spawn.y, .1)
  p.ropes = level.climbables.ropes.map(r => createRope(prepareRope(r, terrain)))
  Object.assign(p, { x: level.spawn.x, y: level.spawn.y, spawnX: level.spawn.x, spawnY: level.spawn.y,
    grounded: !!ground, groundAngle: ground?.angle ?? 0, jumpStart: level.spawn.y })
  return p
}
/** Saved geometry is also the editor preview and the first playable frame. */
export function prepareLevelRopes<T extends JumpLevel>(level: T): T {
  const terrain = levelTerrain(level), ropes = level.climbables.ropes.map(r => {
    const resolved = prepareRope(r, terrain)
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
  if (!ground || !canGrip(ground.angle)) return 'Place the start point on a surface with enough grip to stand still.'
  if (terrain.some(b => bodyIntersects(x, y, b))) {
    return 'The start point needs enough space for the player to stand.'
  }
  return null
}
export function levelProblems(level: JumpLevel): string[] {
  const issues: string[] = [], spawn = spawnProblem(level)
  if (!level.name.trim()) issues.push('Give the level a name.')
  if (spawn) issues.push(spawn)
  if (level.platforms.some(b => b.y < 0 || b.x < 0 || b.x + b.w > level.width || b.y + b.h > levelHeight(level))) issues.push('Keep terrain inside the level rectangle.')
  if (level.texts?.some(t => t.x < 0 || t.y < 0 || t.x + t.w > level.width || t.y + t.h > levelHeight(level))) issues.push('Keep wall text inside the level rectangle.')
  if (isPuzzleLevel(level)) {
    const terrain = levelTerrain(level), bounds = goalBounds(level.goal), door = goalDoor(level.goal)
    const left = Math.min(level.goal.x - GOAL_PLATE_WIDTH / 2, door.x), right = Math.max(level.goal.x + GOAL_PLATE_WIDTH / 2, door.x + door.w)
    const count = Math.ceil((right - left) / 8)
    const plateSupported = Array.from({ length: count + 1 }, (_, i) => left + (right - left) * i / count).every(x => {
      const support = groundAt(terrain, x, level.goal.y, .15)
      return support && Math.abs(support.angle) < .02
    })
    const blocked = terrain.some(b => polygonIntersects([[door.x, door.y], [door.x + door.w, door.y],
      [door.x + door.w, door.y + door.h], [door.x, door.y + door.h]], b))
    if (!plateSupported || blocked || bounds.x < 0 || bounds.x + bounds.w > level.width || bounds.y < 0 || level.goal.y > levelHeight(level)) {
      issues.push('Place the goal plate, light and exit on a continuous flat surface, with a clear doorway inside the level.')
    }
    if (!(level.times.gold > 0 && level.times.gold < level.times.silver && level.times.silver < level.times.bronze)) issues.push('Medal times must increase from gold to silver to bronze.')
    if (level.triggers.some(t => !triggerTargets(t).length || triggerTargets(t).some(id => !level.mechanisms.some(m => m.id === id)))) issues.push('Connect each pressure plate to one or more elevators or gates.')
    if (level.robots.some(r => !groundAt(levelTerrain(level), r.x, r.y, .2))) issues.push('Place each shovebot on a terrain surface.')
    if (level.timers?.some(t => t.x < 0 || t.y < 0 || t.x + WALL_TIMER_WIDTH > level.width || t.y + WALL_TIMER_HEIGHT > levelHeight(level))) issues.push('Keep wall timers inside the level rectangle.')
    if (level.pickups?.some(p => { const b = pickupBounds(p); return b.x < 0 || b.y < 0 || b.x + b.w > level.width || b.y + b.h > levelHeight(level) })) issues.push('Keep power-ups inside the level rectangle.')
  }
  return issues
}

/** Imported files and browser storage both pass through the same bounded decoder. */
export function parseLevel(value: unknown): JumpLevel {
  const fail = (): never => { throw new Error('This file is not a valid jumping level.') }
  const object = (v: unknown): Record<string, unknown> => v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : fail()
  const num = (v: unknown, min: number, max: number): number => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max ? v : fail()
  const list = (v: unknown, max: number): unknown[] => Array.isArray(v) && v.length <= max ? v : fail()
  const point = (v: unknown): Checkpoint => { const p = object(v); return { x: num(p.x, 0, 20000), y: num(p.y, -2000, 6000),
    ...(p.radius === undefined ? {} : { radius: num(p.radius, 10, 1000) }) } }
  const v = object(value)
  if (v.version !== 1 || typeof v.name !== 'string' || !v.name.trim() || v.name.length > 80 || typeof v.id !== 'string' || v.id.length > 100) fail()
  const width = num(v.width, 800, 20000)
  const platforms = list(v.platforms, 160).map(item => {
    const b = object(item), platform: Platform = { x: num(b.x, 0, width), y: num(b.y, -2000, 6000), w: num(b.w, 10, width), h: num(b.h, 8, 6000) }
    if (platform.x + platform.w > width) fail()
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
    const ladder = { x: num(b.x, 0, width), top: num(b.top, -2000, 6000), bottom: num(b.bottom, -2000, 6000), platform, side }
    const support = platforms[platform]
    if (ladder.bottom - ladder.top < 80 || support && (ladder.top !== support.y || Math.abs(ladder.x - (side === 1 ? support.x - 16 : support.x + support.w + 16)) > .1)) fail()
    return ladder
  })
  const ropes = list(climbables.ropes, 40).map(item => {
    const r = object(item), segments = num(r.segments, 4, ropeSegmentCount(2000))
    if (!Number.isInteger(segments)) fail()
    const rope: ClimbableWorld['ropes'][number] = { x: num(r.x, 0, width), y: num(r.y, -2000, 6000), length: num(r.length, 80, 2000), segments }
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
  const level: JumpLevel = { version: 1, id: v.id as string, name: (v.name as string).trim(), width,
    ...(v.height === undefined ? {} : { height: num(v.height, 400, 6000) }),
    platforms, spawn, checkpoints, climbables: { ladders, ropes } }
  if (v.description !== undefined) { if (typeof v.description !== 'string' || v.description.length > 600) fail(); level.description = v.description as string }
  // Existing local files use "flag". Import it as the plate center; new exports use "goal".
  const goal = v.goal === undefined ? v.flag : v.goal
  if (goal !== undefined) {
    level.height = num(v.height, 400, 6000); level.floor = num(v.floor, 200, level.height)
    const location = point(goal), flipX = object(goal).flipX
    if (flipX !== undefined && typeof flipX !== 'boolean') fail()
    level.goal = { x: location.x, y: location.y, ...(flipX === undefined ? {} : { flipX: flipX as boolean }) }; if (level.goal.x > width) fail()
    const times = object(v.times); level.times = { gold: num(times.gold, .1, 3600), silver: num(times.silver, .1, 3600), bronze: num(times.bronze, .1, 3600) }
    if (!(level.times.gold < level.times.silver && level.times.silver < level.times.bronze)) fail()
    level.props = list(v.props, 80).map(item => {
      const b = object(item); if (b.kind !== 'box' && b.kind !== 'ball') fail()
      const size = num(b.size, 30, 200)
      return { kind: b.kind as 'box' | 'ball', x: num(b.x, size / 2 + 24, width - size / 2 - 24), y: num(b.y, -1800, level.floor!), size }
    })
    level.mechanisms = list(v.mechanisms, 40).map(item => {
      const m = object(item); if (m.kind !== 'lift' && m.kind !== 'gate' || typeof m.id !== 'string' || !m.id || m.id.length > 100) fail()
      if (m.orientation !== undefined && (m.kind !== 'gate' || m.orientation !== 'horizontal')) fail()
      if (m.flipX !== undefined && (m.orientation !== 'horizontal' || typeof m.flipX !== 'boolean')) fail()
      const w = num(m.w, m.kind === 'gate' ? MECHANISM_THICKNESS : 30, 600), h = num(m.h, 12, 800)
      return prepareMechanism({ id: m.id as string, kind: m.kind as 'lift' | 'gate', x: num(m.x, 24, width - w - 24), y: num(m.y, -1000, level.floor! - h), w, h,
        travel: num(m.travel, m.kind === 'gate' ? 12 : 60, 1200),
        ...(m.orientation === 'horizontal' ? { orientation: 'horizontal' as const } : {}),
        ...(m.flipX === undefined ? {} : { flipX: m.flipX as boolean }) }, level.floor!)
    })
    if (new Set(level.mechanisms.map(m => m.id)).size !== level.mechanisms.length) fail()
    level.triggers = list(v.triggers, 40).map(item => {
      const t = object(item); if (t.mode !== 'touch' && t.mode !== 'weight') fail()
      let connection: TriggerConnection
      if (t.targets !== undefined) {
        if (t.target !== undefined || !Array.isArray(t.targets) || t.targets.length > 40
          || t.targets.some(id => typeof id !== 'string' || !id || id.length > 100) || new Set(t.targets).size !== t.targets.length) fail()
        connection = { targets: [...t.targets as string[]] }
      } else {
        if (typeof t.target !== 'string' || t.target.length > 100) fail()
        connection = { target: t.target as string }
      }
      const w = num(t.w, 40, 240)
      return { x: num(t.x, 24, width - w - 24), y: num(t.y, -1800, level.floor!), w, ...connection, mode: t.mode as 'touch' | 'weight' }
    })
    level.robots = list(v.robots, 30).map(item => {
      const r = object(item), left = num(r.left, 50, width - 100), right = num(r.right, left + 50, width - 50)
      return { x: num(r.x, left, right), y: num(r.y, -1800, level.floor!), left, right }
    })
    if (v.timers !== undefined) level.timers = list(v.timers, 40).map(item => {
      const timer = object(item)
      return { x: num(timer.x, 0, width - WALL_TIMER_WIDTH), y: num(timer.y, 0, level.floor! - WALL_TIMER_HEIGHT) }
    })
    if (v.pickups !== undefined) level.pickups = list(v.pickups, 80).map(item => {
      const pickup = object(item), bounds = pickupBounds({ x: 0, y: 0 })
      if (pickup.kind !== 'stopwatch') fail()
      return { kind: 'stopwatch', x: num(pickup.x, -bounds.x, width - bounds.x - bounds.w), y: num(pickup.y, -bounds.y, level.floor! - bounds.y - bounds.h) }
    })
  } else if (['floor', 'times', 'props', 'mechanisms', 'triggers', 'robots', 'timers', 'pickups'].some(key => v[key] !== undefined)) fail()
  if (v.texts !== undefined) level.texts = list(v.texts, 80).map(item => {
    const t = object(item), w = num(t.w, 40, Math.min(2000, width)), h = num(t.h, 24, Math.min(1200, levelHeight(level)))
    if (typeof t.text !== 'string' || t.text.length > 1000 || !['left', 'center', 'right'].includes(t.align as string)) fail()
    return { x: num(t.x, 0, width - w), y: num(t.y, 0, levelHeight(level) - h), w, h,
      text: t.text as string, fontSize: num(t.fontSize, 12, 96), align: t.align as WallText['align'] }
  })
  return level
}
/** An empty editor document; all authored maps are external JSON assets. */
export function blankTrial(): PuzzleLevel {
  return { version: 1, id: newLevelId(), name: 'Untitled level', description: '', width: 1800, height: 920, floor: 920,
    spawn: { x: 160, y: 920 }, goal: { x: 1620, y: 920 }, platforms: [], checkpoints: [],
    climbables: { ropes: [], ladders: [] }, props: [], robots: [], triggers: [], mechanisms: [], timers: [], texts: [], pickups: [], times: { gold: 10, silver: 20, bronze: 40 } }
}
