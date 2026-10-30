import type { JumpLevel } from './level.ts'
import type { Selection, TerrainNodeTarget } from './editor.ts'
import { terrainNodeTarget, terrainVertexTarget, insertTerrainNode, moveVertex, deleteTerrainNode } from './editor.ts'
import { terrainNodes } from './terrainCurves.ts'
import { backWallPoints, insertBackWallPoint, moveBackWallPoint, deleteBackWallPoint } from './backWallEditing.ts'

export const shapePoints = (level: JumpLevel, selection: Selection) => selection.kind === 'platform' ? terrainNodes(level.platforms[selection.index])
  : selection.kind === 'back-wall' && level.environment?.walls[selection.index] ? backWallPoints(level.environment.walls[selection.index]) : null

function wallLevel(level: JumpLevel, preferred?: Selection | null): JumpLevel {
  const walls = preferred?.kind === 'back-wall' ? [level.environment!.walls[preferred.index]] : level.environment?.walls ?? []
  return { ...level, platforms: walls }
}
export function shapeVertexTarget(level: JumpLevel, x: number, y: number, tolerance: number, preferred?: Selection | null) {
  const terrain = preferred?.kind === 'back-wall' ? null : terrainVertexTarget(level, x, y, tolerance)
  if (terrain) return { ...terrain, kind: 'platform' as const }
  const wall = terrainVertexTarget(wallLevel(level, preferred), x, y, tolerance)
  return wall ? { ...wall, index: preferred?.kind === 'back-wall' ? preferred.index : wall.index, kind: 'back-wall' as const } : null
}
export function shapeNodeTarget(level: JumpLevel, x: number, y: number, tolerance: number, grid: number, preferred?: Selection | null) {
  const terrain = preferred?.kind === 'back-wall' ? null : terrainNodeTarget(level, x, y, tolerance, grid)
  if (terrain) return { ...terrain, kind: 'platform' as const }
  const wall = terrainNodeTarget(wallLevel(level, preferred), x, y, tolerance, grid)
  return wall ? { ...wall, index: preferred?.kind === 'back-wall' ? preferred.index : wall.index, kind: 'back-wall' as const } : null
}
export function insertShapeNode(level: JumpLevel, target: TerrainNodeTarget & { kind: 'platform' | 'back-wall' }) {
  return target.kind === 'platform' ? insertTerrainNode(level, target) : insertBackWallPoint(level, target.index, target.edge, target.x, target.y)
}
export function moveShapeVertex(level: JumpLevel, selection: Selection, node: number, dx: number, dy: number) {
  if (selection.kind === 'platform') return moveVertex(level, selection.index, node, dx, dy)
  const p = shapePoints(level, selection)?.[node]
  if (!p) return level
  try { return moveBackWallPoint(level, selection.index, node, p[0] + dx, p[1] + dy) } catch { return level }
}
export function deleteShapeNode(level: JumpLevel, selection: Selection, node: number) {
  return selection.kind === 'platform' ? deleteTerrainNode(level, selection.index, node) : deleteBackWallPoint(level, selection.index, node)
}
