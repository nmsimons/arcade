import type { JumpLevel, PuzzleLevel } from './level.ts'
import { copyLevel, isPuzzleLevel, levelTerrain, newLevelId, snapToGround } from './level.ts'
import { blankTrial } from './level.ts'
import { groundAt } from './terrain.ts'

export function asTrial(level: JumpLevel): PuzzleLevel {
  if (isPuzzleLevel(level)) return copyLevel(level)
  const floor = Math.min(2800, Math.max(920, ...level.platforms.map(b => b.y + b.h)))
  const defaults = blankTrial()
  return { ...defaults, ...copyLevel(level), height: Math.max(floor + 120, level.height ?? 1040), floor,
    goal: snapToGround(level, level.width - 160, level.spawn.y), times: defaults.times, props: [], mechanisms: [], triggers: [], robots: [] }
}
export function copyForEditing(level: JumpLevel): JumpLevel {
  const next = { ...copyLevel(level), id: newLevelId(), name: `${level.name.slice(0, 73)} — copy` }
  if (next.version === 1) return next
  const ids = new Map([...(next.mechanisms ?? []), ...(next.lighting?.lights ?? [])].map(item => [item.id, newLevelId()]))
  for (const item of [...(next.mechanisms ?? []), ...(next.lighting?.lights ?? [])]) item.id = ids.get(item.id)!
  for (const trigger of next.triggers ?? []) {
    if (trigger.targets) trigger.targets = trigger.targets.map(id => ids.get(id) ?? id)
    else if (trigger.target) trigger.target = ids.get(trigger.target) ?? trigger.target
  }
  return next
}
/** Carve rectangular terrain and provide a bottom floor and a return ladder in one gesture. */
export function carvePit(source: JumpLevel, start: { x: number; y: number }, end: { x: number; y: number }): PuzzleLevel {
  const level = asTrial(source), x = Math.max(100, Math.min(start.x, end.x)), w = Math.min(level.width - x - 160, Math.max(240, Math.abs(end.x - start.x)))
  const deck = snapToGround(level, x - 20, Math.min(start.y, end.y)).y
  const depth = Math.max(320, Math.min(800, Math.abs(end.y - start.y))), bottom = Math.min(2800, deck + depth)
  const oldFloor = level.floor; level.floor = Math.max(oldFloor, bottom); level.height = Math.max(level.height, level.floor + 120)
  if (deck === oldFloor) level.platforms.push({ x: 24, y: deck, w: level.width - 48, h: level.floor - deck })
  const previous = level.platforms, platforms: JumpLevel['platforms'] = [], indices = new Map<number, number>()
  previous.forEach((b, index) => {
    const intersects = !b.profile && b.x < x + w && b.x + b.w > x && b.y >= deck - .1 && b.y < bottom
    if (!intersects) { indices.set(index, platforms.length); platforms.push(b); return }
    if (b.x < x) { indices.set(index, platforms.length); platforms.push({ ...b, w: x - b.x, h: Math.max(b.h, level.floor - b.y) }) }
    if (b.x + b.w > x + w) { if (!indices.has(index)) indices.set(index, platforms.length); platforms.push({ ...b, x: x + w, w: b.x + b.w - x - w, h: Math.max(b.h, level.floor - b.y) }) }
    if (bottom < level.floor) platforms.push({ x: Math.max(x, b.x), y: bottom, w: Math.min(x + w, b.x + b.w) - Math.max(x, b.x), h: level.floor - bottom })
  })
  level.platforms = platforms
  level.climbables.ladders = level.climbables.ladders.flatMap(l => {
    const platform = indices.get(l.platform); if (platform === undefined) return []
    const b = platforms[platform]; return [{ ...l, platform, x: l.side === 1 ? b.x - 16 : b.x + b.w + 16, top: b.y }]
  })
  const left = platforms.findIndex(b => Math.abs(b.x + b.w - x) < .1 && Math.abs(b.y - deck) < .1)
  if (left >= 0 && !level.climbables.ladders.some(l => l.platform === left && l.side === -1)) level.climbables.ladders.push({ x: x + 16, top: deck, bottom, platform: left, side: -1 })
  return level
}
export function pusherRange(level: JumpLevel, x: number, y: number) {
  const ground = groundAt(levelTerrain(level), x, y, 3)?.platform
  const left = Math.max(50, ground ? ground.x + 30 : x - 180), right = Math.min(level.width - 50, ground ? ground.x + ground.w - 30 : x + 180)
  const end = Math.min(level.width - 50, Math.max(right, x, 100))
  return { left: Math.max(50, Math.min(left, x, end - 50)), right: end }
}
