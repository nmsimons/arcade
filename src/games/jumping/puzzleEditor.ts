import { ROBOT_HALF_WIDTH } from './robotPhysics.ts'
import type { JumpLevel, PuzzleLevel } from './level.ts'
import { copyLevel, isPuzzleLevel, levelTerrain, newLevelId, snapToGround } from './level.ts'
import { blankTrial } from './level.ts'
import { groundAt } from './terrain.ts'
import { switchSources } from './switchPower.ts'
import { waterControlId } from './waterLevel.ts'

export function asTrial(level: JumpLevel): PuzzleLevel {
  if (isPuzzleLevel(level)) return copyLevel(level)
  const floor = Math.min(2800, Math.max(920, ...level.platforms.map(b => b.y + b.h)))
  const defaults = blankTrial()
  return { ...defaults, ...copyLevel(level), height: Math.max(floor + 120, level.height ?? 1040), floor,
    goal: snapToGround(level, level.width - 160, level.spawn.y), times: defaults.times, props: [], mechanisms: [], triggers: [], robots: [] }
}
export function copyForEditing(level: JumpLevel): JumpLevel {
  const next = { ...copyLevel(level), id: newLevelId(), name: `${level.name.slice(0, 73)} — copy` }
  const items = [...(next.logicRelays ?? []), ...(next.mechanisms ?? []), ...(next.lighting?.lights ?? []), ...(next.wallLights ?? []), ...(next.gravityPlates ?? []), ...(next.forceFields ?? []), ...(next.goal?.id ? [next.goal] : [])]
  const ids = new Map<string, string>(items.map(item => [item.id!, newLevelId()]))
  for (const p of next.gravityPlates ?? []) if (p.effect === 'water') for (const action of ['fill', 'drain'] as const)
    ids.set(waterControlId(p.id, action), waterControlId(ids.get(p.id)!, action))
  for (const item of items) item.id = ids.get(item.id!)!
  for (const source of switchSources(next)) {
    const definition = source.definition
    if (definition.targets) definition.targets = definition.targets.map(id => ids.get(id) ?? id)
    else if (source.kind === 'trigger' && source.definition.target) source.definition.target = ids.get(source.definition.target) ?? source.definition.target
    if (source.kind === 'trigger' && source.definition.mode !== 'coins' && source.definition.mount) {
      source.definition.mount.mechanism = ids.get(source.definition.mount.mechanism) ?? source.definition.mount.mechanism
    }
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
  const left = Math.max(ROBOT_HALF_WIDTH, ground ? ground.x + 30 : x - 180), right = Math.min(level.width - ROBOT_HALF_WIDTH, ground ? ground.x + ground.w - 30 : x + 180)
  const end = Math.min(level.width - ROBOT_HALF_WIDTH, Math.max(right, x, ROBOT_HALF_WIDTH + 50))
  return { left: Math.max(ROBOT_HALF_WIDTH, Math.min(left, x, end - 50)), right: end }
}
