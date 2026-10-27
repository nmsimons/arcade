import { polygonPoints, validPolygon } from './geometry.ts'
import type { Vec } from './geometry.ts'
import type { BackWall } from './environment.ts'
import { copyLevel, levelHeight } from './level.ts'
import type { JumpLevel } from './level.ts'
import type { TerrainTransform } from './editor.ts'
import { remapEditorGroups } from './editorGroups.ts'

export const backWallPoints = (wall: BackWall): Vec[] => polygonPoints(wall).map(([x, y]) => [x, y])

/** Rebound around the edited world points, so the old rectangle never fences
 * in a drag. Only background coverage changes; all playable geometry is kept. */
function setPoints(level: JumpLevel, index: number, points: Vec[]) {
  if (!points.every(p => p.every(Number.isFinite)) || !validPolygon(points)) throw new Error('Keep the outline from crossing itself, with at least three distinct points.')
  const xs = points.map(p => p[0]), ys = points.map(p => p[1])
  const x = Math.min(...xs), y = Math.min(...ys), w = Math.max(...xs) - x, h = Math.max(...ys) - y
  if (w < 10 || h < 10) throw new Error('Keep the back wall at least 10 units wide and high.')
  const next = copyLevel(level), wall = next.environment!.walls[index]
  Object.assign(wall, { x, y, w, h, polygon: points.map(([px, py]) => [px - x, py - y]) })
  return next
}

export function moveBackWallPoint(level: JumpLevel, wall: number, point: number, x: number, y: number) {
  const shape = level.environment?.walls[wall]
  if (!shape || !Number.isFinite(x) || !Number.isFinite(y)) return level
  const points = backWallPoints(shape)
  if (!points[point]) return level
  points[point] = [Math.max(0, Math.min(level.width, x)), Math.max(0, Math.min(levelHeight(level), y))]
  return setPoints(level, wall, points)
}

export function insertBackWallPoint(level: JumpLevel, wall: number, edge: number, x: number, y: number) {
  const shape = level.environment?.walls[wall]
  if (!shape) return level
  const points = backWallPoints(shape)
  if (points.length >= 64) throw new Error('A back wall can have at most 64 points.')
  if (!points[edge]) return level
  points.splice(edge + 1, 0, [Math.max(0, Math.min(level.width, x)), Math.max(0, Math.min(levelHeight(level), y))])
  return setPoints(level, wall, points)
}

export function deleteBackWallPoint(level: JumpLevel, wall: number, point: number) {
  const shape = level.environment?.walls[wall]
  if (!shape) return level
  const points = backWallPoints(shape)
  if (points.length <= 3) throw new Error('A back wall needs at least three points.')
  if (!points[point]) return level
  points.splice(point, 1)
  return setPoints(level, wall, points)
}

export function transformBackWall(level: JumpLevel, index: number, transform: TerrainTransform) {
  const before = level.environment?.walls[index]
  if (!before) return level
  const rotate = transform.startsWith('rotate'), w = rotate ? before.h : before.w, h = rotate ? before.w : before.h
  if (w > level.width || h > levelHeight(level)) throw new Error('The back wall is too large to rotate inside this level.')
  const x = Math.max(0, Math.min(level.width - w, before.x + (before.w - w) / 2))
  const y = Math.max(0, Math.min(levelHeight(level) - h, before.y + (before.h - h) / 2))
  const points = backWallPoints(before).map(([px, py]): Vec => {
    const a = px - before.x, b = py - before.y
    return transform === 'rotate-left' ? [x + b, y + before.w - a] : transform === 'rotate-right' ? [x + before.h - b, y + a]
      : transform === 'flip-horizontal' ? [x + before.w - a, y + b] : [x + a, y + before.h - b]
  })
  return setPoints(level, index, points)
}

export function reorderBackWall(level: JumpLevel, index: number, front: boolean) {
  const next = copyLevel(level), walls = next.environment!.walls, target = front ? walls.length - 1 : 0
  if (index === target) return { level, index }
  const order = walls.map((_, i) => i), [moved] = order.splice(index, 1); order.splice(target, 0, moved)
  next.environment!.walls = order.map(i => walls[i])
  remapEditorGroups(next, s => [s.kind === 'back-wall' ? { ...s, index: order.indexOf(s.index) } : s])
  return { level: next, index: target }
}

export function backWallPointAt(wall: BackWall, x: number, y: number, radius: number) {
  return backWallPoints(wall).findIndex(p => Math.hypot(x - p[0], y - p[1]) <= radius)
}

export function backWallEdgeAt(wall: BackWall, x: number, y: number, radius: number) {
  const points = backWallPoints(wall)
  let closest: { edge: number; x: number; y: number } | null = null, distance = radius
  for (const [edge, a] of points.entries()) {
    const b = points[(edge + 1) % points.length], dx = b[0] - a[0], dy = b[1] - a[1]
    const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / (dx * dx + dy * dy)))
    const px = a[0] + dx * t, py = a[1] + dy * t, d = Math.hypot(x - px, y - py)
    if (d < distance) { distance = d; closest = { edge, x: px, y: py } }
  }
  return closest
}

export function drawBackWallOutline(ctx: CanvasRenderingContext2D, wall: BackWall, point: number | null, zoom: number) {
  const points = backWallPoints(wall)
  ctx.save(); ctx.beginPath()
  points.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.closePath()
  ctx.strokeStyle = '#fffdf5'; ctx.lineWidth = 4 / zoom; ctx.stroke()
  ctx.strokeStyle = '#287c9b'; ctx.lineWidth = 2 / zoom; ctx.stroke()
  for (const [i, [x, y]] of points.entries()) {
    ctx.beginPath(); ctx.arc(x, y, (i === point ? 7 : 5.5) / zoom, 0, Math.PI * 2)
    ctx.fillStyle = i === point ? '#c65231' : '#fffdf5'; ctx.fill(); ctx.stroke()
  }
  ctx.restore()
}
