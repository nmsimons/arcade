import type { Vector2 } from './types'
import type { CavernMap } from './worldGeometry'
import { isInsideCavern, raycastCavern } from './worldGeometry.ts'
import { STATION_WIDTH, STATION_HEIGHT } from './campaignWorld.ts'

export const SURVEY_CELL = 60
const COLUMNS = Math.ceil(STATION_WIDTH / SURVEY_CELL)
export const SURVEY_LIMIT = COLUMNS * Math.ceil(STATION_HEIGHT / SURVEY_CELL)
export const migrateSurvey = (cells: number[]) => cells.map(id => Math.floor(id / 50) * COLUMNS + id % 50)
export const surveyPoint = (id: number): Vector2 => ({ x: (id % COLUMNS + 0.5) * SURVEY_CELL, y: (Math.floor(id / COLUMNS) + 0.5) * SURVEY_CELL })
const recorded = new WeakMap<number[], Set<number>>()

/** Remember nearby visible space, never scan through walls or sealed doors. */
export function recordSurvey(cells: number[], pos: Vector2, map: CavernMap) {
  let known = recorded.get(cells)
  if (!known) { known = new Set(cells); recorded.set(cells, known) }
  const range = 310, steps = Math.ceil(range / SURVEY_CELL)
  const cx = Math.floor(pos.x / SURVEY_CELL), cy = Math.floor(pos.y / SURVEY_CELL)
  for (let y = cy - steps; y <= cy + steps; y++) for (let x = cx - steps; x <= cx + steps; x++) {
    if (x < 0 || x >= COLUMNS || y < 0) continue
    const id = y * COLUMNS + x
    if (id >= SURVEY_LIMIT || known.has(id)) continue
    const target = surveyPoint(id), delta = { x: target.x - pos.x, y: target.y - pos.y }
    const distance = Math.hypot(delta.x, delta.y)
    if (distance > range || !isInsideCavern(target, 0, map) || raycastCavern(pos, delta, distance, map) < distance - 0.01) continue
    known.add(id); cells.push(id)
  }
}
