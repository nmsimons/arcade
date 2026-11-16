import type { JumpLevel } from './level.ts'
import type { Selection, TerrainNodeTarget } from './editor.ts'
import { terrainNodeTarget, terrainVertexTarget, insertTerrainNode, moveVertex, deleteTerrainNode, deletePipePoint, insertPipePoint, movePipePoint } from './editor.ts'
import { terrainNodes } from './terrainCurves.ts'
import { backWallPoints, insertBackWallPoint, moveBackWallPoint, deleteBackWallPoint } from './backWallEditing.ts'
import { wallPipeEdgeAt } from './wallPipes.ts'

type ShapeKind = 'platform' | 'back-wall' | 'pipe'
export const shapePoints = (level: JumpLevel, selection: Selection) => selection.kind === 'platform' ? terrainNodes(level.platforms[selection.index])
  : selection.kind === 'back-wall' && level.environment?.walls[selection.index] ? backWallPoints(level.environment.walls[selection.index])
  : selection.kind === 'pipe' && level.pipes?.[selection.index] ? level.pipes[selection.index].points : null

function wallLevel(level: JumpLevel, preferred?: Selection | null): JumpLevel {
  const walls = preferred?.kind === 'back-wall' ? [level.environment!.walls[preferred.index]] : level.environment?.walls ?? []
  return { ...level, platforms: walls }
}
/** A selected pipe's own points come first: they sit on the wall, under terrain and back walls alike. */
function pipeVertex(level: JumpLevel, x: number, y: number, tolerance: number, preferred?: Selection | null) {
  const pipe = preferred?.kind === 'pipe' ? level.pipes?.[preferred.index] : undefined
  if (!pipe) return null
  let best: { vertex: number; distance: number } | null = null
  pipe.points.forEach(([px, py], vertex) => {
    const distance = Math.hypot(px - x, py - y)
    if (distance <= tolerance && (!best || distance < best.distance)) best = { vertex, distance }
  })
  return best && { index: preferred!.index, vertex: (best as { vertex: number }).vertex, x, y, kind: 'pipe' as const }
}
export function shapeVertexTarget(level: JumpLevel, x: number, y: number, tolerance: number, preferred?: Selection | null) {
  const pipe = pipeVertex(level, x, y, tolerance, preferred)
  if (pipe || preferred?.kind === 'pipe') return pipe
  const terrain = preferred?.kind === 'back-wall' ? null : terrainVertexTarget(level, x, y, tolerance)
  if (terrain) return { ...terrain, kind: 'platform' as const }
  const wall = terrainVertexTarget(wallLevel(level, preferred), x, y, tolerance)
  return wall ? { ...wall, index: preferred?.kind === 'back-wall' ? preferred.index : wall.index, kind: 'back-wall' as const } : null
}
export function shapeNodeTarget(level: JumpLevel, x: number, y: number, tolerance: number, grid: number, preferred?: Selection | null): (TerrainNodeTarget & { kind: ShapeKind }) | null {
  if (preferred?.kind === 'pipe') {
    const pipe = level.pipes?.[preferred.index], edge = pipe && wallPipeEdgeAt(pipe, x, y, tolerance)
    if (!edge) return null
    const snap = (n: number) => grid ? Math.round(n / grid) * grid : n
    return { index: preferred.index, edge: edge.edge, x: snap(edge.x), y: snap(edge.y), kind: 'pipe' }
  }
  const terrain = preferred?.kind === 'back-wall' ? null : terrainNodeTarget(level, x, y, tolerance, grid)
  if (terrain) return { ...terrain, kind: 'platform' as const }
  const wall = terrainNodeTarget(wallLevel(level, preferred), x, y, tolerance, grid)
  return wall ? { ...wall, index: preferred?.kind === 'back-wall' ? preferred.index : wall.index, kind: 'back-wall' as const } : null
}
export function insertShapeNode(level: JumpLevel, target: TerrainNodeTarget & { kind: ShapeKind }) {
  return target.kind === 'platform' ? insertTerrainNode(level, target)
    : target.kind === 'pipe' ? insertPipePoint(level, target.index, target.edge, target.x, target.y)
    : insertBackWallPoint(level, target.index, target.edge, target.x, target.y)
}
export function moveShapeVertex(level: JumpLevel, selection: Selection, node: number, dx: number, dy: number) {
  if (selection.kind === 'platform') return moveVertex(level, selection.index, node, dx, dy)
  const p = shapePoints(level, selection)?.[node]
  if (!p) return level
  if (selection.kind === 'pipe') return movePipePoint(level, selection.index, node, p[0] + dx, p[1] + dy)
  try { return moveBackWallPoint(level, selection.index, node, p[0] + dx, p[1] + dy) } catch { return level }
}
export function deleteShapeNode(level: JumpLevel, selection: Selection, node: number) {
  return selection.kind === 'platform' ? deleteTerrainNode(level, selection.index, node)
    : selection.kind === 'pipe' ? deletePipePoint(level, selection.index, node)
    : deleteBackWallPoint(level, selection.index, node)
}
