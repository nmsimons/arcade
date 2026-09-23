import { createPlayer, PLATFORMS, PLAYGROUND_RULES, WORLD_WIDTH } from './model.ts'
import type { Checkpoint, LevelRules, Platform } from './model.ts'
import { CLIMBABLES } from './climbables.ts'
import type { ClimbableWorld } from './climbables.ts'
import { exposedSide, groundAt, platformSurface } from './terrain.ts'

export interface PropDefinition { kind: 'box' | 'ball'; x: number; y: number; size: number }
export interface Mechanism { id: string; kind: 'lift' | 'gate'; x: number; y: number; w: number; h: number; travel: number }
export interface Trigger { x: number; y: number; w: number; target: string; mode: 'weight' | 'touch' }
export interface Pusher { x: number; y: number; left: number; right: number }
export interface JumpLevel {
  version: 1; id: string; name: string; width: number; height?: number
  spawn: Checkpoint; checkpoints: Checkpoint[]; platforms: Platform[]
  climbables: { ladders: ClimbableWorld['ladders'][number][]; ropes: ClimbableWorld['ropes'][number][] }
  description?: string; floor?: number; flag?: Checkpoint
  times?: { gold: number; silver: number; bronze: number }
  props?: PropDefinition[]; mechanisms?: Mechanism[]; triggers?: Trigger[]; robots?: Pusher[]
}
export interface PuzzleLevel extends JumpLevel {
  height: number; floor: number; flag: Checkpoint; times: { gold: number; silver: number; bronze: number }
  props: PropDefinition[]; mechanisms: Mechanism[]; triggers: Trigger[]; robots: Pusher[]
}
export const isPuzzleLevel = (level: JumpLevel): level is PuzzleLevel => level.flag !== undefined && level.floor !== undefined && level.times !== undefined
/** The bottom floor and side walls are structural and cannot be accidentally erased in the editor. */
export function levelTerrain(level: JumpLevel): Platform[] {
  return level.floor === undefined ? level.platforms : [...level.platforms,
    { x: 0, y: level.floor, w: level.width, h: Math.max(120, (level.height ?? level.floor + 120) - level.floor) },
    { x: 0, y: -2100, w: 24, h: level.floor + 2100 }, { x: level.width - 24, y: -2100, w: 24, h: level.floor + 2100 }]
}
export const DEFAULT_LEVEL: JumpLevel = {
  version: 1, id: 'playground', name: 'Movement playground', width: WORLD_WIDTH,
  spawn: { x: 200, y: 620 }, checkpoints: [...PLAYGROUND_RULES.checkpoints], platforms: [...PLATFORMS],
  climbables: { ladders: [...CLIMBABLES.ladders], ropes: [...CLIMBABLES.ropes] },
}
export const LEVEL_STORAGE_KEY = 'arcade.jumping.levels.v1'
export const DRAFT_STORAGE_KEY = 'arcade.jumping.draft.v1'
export const copyLevel = <T extends JumpLevel>(level: T): T => structuredClone(level)
export const newLevelId = () => globalThis.crypto.randomUUID()
export function newLevel(): JumpLevel {
  return { version: 1, id: newLevelId(), name: 'Untitled level', width: 3200, spawn: { x: 200, y: 620 }, checkpoints: [],
    platforms: [{ x: 0, y: 620, w: 3200, h: 320 }], climbables: { ladders: [], ropes: [] } }
}
export function playgroundCopy(): JumpLevel {
  return { ...copyLevel(DEFAULT_LEVEL), id: newLevelId(), name: 'My playground' }
}
export function levelRules(level: JumpLevel): LevelRules {
  return { checkpoints: level.checkpoints, fallY: Math.max(1020, level.spawn.y + 400, ...level.platforms.map(b => b.y + b.h + 80)) }
}
export function levelPlayer(level: JumpLevel) {
  const p = createPlayer(), ground = groundAt(levelTerrain(level), level.spawn.x, level.spawn.y, .1)
  Object.assign(p, { x: level.spawn.x, y: level.spawn.y, spawnX: level.spawn.x, spawnY: level.spawn.y,
    grounded: !!ground, groundAngle: ground?.angle ?? 0, jumpStart: level.spawn.y })
  return p
}
export function snapToGround(level: JumpLevel, x: number, y: number): Checkpoint {
  const surfaces = levelTerrain(level).filter(b => x >= b.x + 3 && x <= b.x + b.w - 3).map(b => platformSurface(b, x))
  surfaces.sort((a, b) => Math.abs(a.y - y) - Math.abs(b.y - y))
  return { x, y: surfaces[0]?.y ?? y }
}
export function spawnProblem(level: JumpLevel): string | null {
  const terrain = levelTerrain(level)
  const { x, y } = level.spawn
  if (!groundAt(terrain, x, y, .15)) return 'Place the start point on a platform or terrain surface.'
  if (terrain.some(b => x + 12 > b.x && x - 12 < b.x + b.w && y > platformSurface(b, x).y + .15 && y - 62 < b.y + b.h
    && (x >= b.x && x <= b.x + b.w || exposedSide(terrain, b, x < b.x ? 1 : -1, y - 62, y)))) {
    return 'The start point needs enough space for the player to stand.'
  }
  return null
}
export function levelProblems(level: JumpLevel): string[] {
  const issues: string[] = [], spawn = spawnProblem(level)
  if (!level.name.trim()) issues.push('Give the level a name.')
  if (spawn) issues.push(spawn)
  if (isPuzzleLevel(level)) {
    const flag = spawnProblem({ ...level, spawn: level.flag })
    if (flag) issues.push('Place the finish flag on a clear, reachable surface.')
    if (!(level.times.gold > 0 && level.times.gold < level.times.silver && level.times.silver < level.times.bronze)) issues.push('Medal times must increase from gold to silver to bronze.')
    if (level.triggers.some(t => !level.mechanisms.some(m => m.id === t.target))) issues.push('Connect each pressure plate to an elevator or gate.')
    if (level.robots.some(r => !groundAt(levelTerrain(level), r.x, r.y, .2))) issues.push('Place each pusher on a terrain surface.')
  }
  return issues
}

/** Imported files and browser storage both pass through the same bounded decoder. */
export function parseLevel(value: unknown): JumpLevel {
  const fail = (): never => { throw new Error('This file is not a valid jumping level.') }
  const object = (v: unknown): Record<string, unknown> => v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : fail()
  const num = (v: unknown, min: number, max: number): number => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max ? v : fail()
  const list = (v: unknown, max: number): unknown[] => Array.isArray(v) && v.length <= max ? v : fail()
  const point = (v: unknown): Checkpoint => { const p = object(v); return { x: num(p.x, 0, 20000), y: num(p.y, -2000, 3000),
    ...(p.radius === undefined ? {} : { radius: num(p.radius, 10, 1000) }) } }
  const v = object(value)
  if (v.version !== 1 || typeof v.name !== 'string' || !v.name.trim() || v.name.length > 80 || typeof v.id !== 'string' || v.id.length > 100) fail()
  const width = num(v.width, 800, 20000)
  const platforms = list(v.platforms, 160).map(item => {
    const b = object(item), platform: Platform = { x: num(b.x, 0, width), y: num(b.y, -2000, 3000), w: num(b.w, 10, width), h: num(b.h, 8, 3000) }
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
    return platform
  })
  const climbables = object(v.climbables)
  const ladders = list(climbables.ladders, 40).map(item => {
    const b = object(item), platform = num(b.platform, 0, platforms.length - 1), side = num(b.side, -1, 1)
    if (!Number.isInteger(platform) || Math.abs(side) !== 1 || platforms[platform].profile) fail()
    const ladder = { x: num(b.x, 0, width), top: num(b.top, -2000, 3000), bottom: num(b.bottom, -2000, 3000), platform, side }
    const support = platforms[platform]
    if (ladder.bottom - ladder.top < 80 || ladder.top !== support.y || Math.abs(ladder.x - (side === 1 ? support.x - 16 : support.x + support.w + 16)) > .1) fail()
    return ladder
  })
  const ropes = list(climbables.ropes, 40).map(item => {
    const r = object(item), segments = num(r.segments, 4, 40)
    if (!Number.isInteger(segments)) fail()
    return { x: num(r.x, 0, width), y: num(r.y, -2000, 3000), length: num(r.length, 80, 600), segments }
  })
  const spawn = point(v.spawn), checkpoints = list(v.checkpoints, 30).map(point)
  if (spawn.x > width || checkpoints.some(p => p.x > width)) fail()
  const level: JumpLevel = { version: 1, id: v.id as string, name: (v.name as string).trim(), width,
    ...(v.height === undefined ? {} : { height: num(v.height, 400, 6000) }),
    platforms, spawn, checkpoints, climbables: { ladders, ropes } }
  if (v.description !== undefined) { if (typeof v.description !== 'string' || v.description.length > 600) fail(); level.description = v.description as string }
  if (v.flag !== undefined) {
    level.height = num(v.height, 400, 6000); level.floor = num(v.floor, 200, Math.min(2800, level.height - 80))
    level.flag = point(v.flag); if (level.flag.x > width) fail()
    const times = object(v.times); level.times = { gold: num(times.gold, .1, 3600), silver: num(times.silver, .1, 3600), bronze: num(times.bronze, .1, 3600) }
    if (!(level.times.gold < level.times.silver && level.times.silver < level.times.bronze)) fail()
    level.props = list(v.props, 80).map(item => {
      const b = object(item); if (b.kind !== 'box' && b.kind !== 'ball') fail()
      const size = num(b.size, 30, 200)
      return { kind: b.kind as 'box' | 'ball', x: num(b.x, size / 2 + 24, width - size / 2 - 24), y: num(b.y, -1800, level.floor!), size }
    })
    level.mechanisms = list(v.mechanisms, 40).map(item => {
      const m = object(item); if (m.kind !== 'lift' && m.kind !== 'gate' || typeof m.id !== 'string' || !m.id || m.id.length > 100) fail()
      const w = num(m.w, 30, 600), h = num(m.h, 12, 800)
      return { id: m.id as string, kind: m.kind as 'lift' | 'gate', x: num(m.x, 24, width - w - 24), y: num(m.y, -1000, level.floor! - h), w, h, travel: num(m.travel, 60, 1200) }
    })
    if (new Set(level.mechanisms.map(m => m.id)).size !== level.mechanisms.length) fail()
    level.triggers = list(v.triggers, 40).map(item => {
      const t = object(item); if (typeof t.target !== 'string' || t.target.length > 100 || t.mode !== 'touch' && t.mode !== 'weight') fail()
      const w = num(t.w, 40, 240)
      return { x: num(t.x, 24, width - w - 24), y: num(t.y, -1800, level.floor!), w, target: t.target as string, mode: t.mode as 'touch' | 'weight' }
    })
    level.robots = list(v.robots, 30).map(item => {
      const r = object(item), left = num(r.left, 50, width - 100), right = num(r.right, left + 50, width - 50)
      return { x: num(r.x, left, right), y: num(r.y, -1800, level.floor!), left, right }
    })
  } else if (['floor', 'times', 'props', 'mechanisms', 'triggers', 'robots'].some(key => v[key] !== undefined)) fail()
  return level
}
export function readSavedLevels(storage: Pick<Storage, 'getItem'>): JumpLevel[] {
  const raw = storage.getItem(LEVEL_STORAGE_KEY)
  if (!raw) return []
  const values: unknown = JSON.parse(raw)
  if (!Array.isArray(values) || values.length > 50) throw new Error('The saved level library could not be read. Your data has been kept.')
  return values.map(parseLevel)
}
export function saveLevel(storage: Pick<Storage, 'getItem' | 'setItem'>, level: JumpLevel): JumpLevel[] {
  const valid = parseLevel(level), levels = readSavedLevels(storage), index = levels.findIndex(item => item.id === valid.id)
  if (index < 0) {
    if (levels.length >= 50) throw new Error('The library holds 50 levels. Export this draft to keep a copy.')
    levels.push(valid)
  } else levels[index] = valid
  storage.setItem(LEVEL_STORAGE_KEY, JSON.stringify(levels))
  return levels
}
