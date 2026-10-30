import { readFileSync } from 'node:fs'

/** Freeze the reported Exit rock's outline while isolating its jump approach. */
export function leaningLedgeLevel(side = 1) {
  const level = JSON.parse(readFileSync(new URL('../fixtures/jumping/leaning-lip.json', import.meta.url), 'utf8'))
  if (side < 0) {
    for (const shape of level.platforms) {
      shape.x = level.width - shape.x - shape.w
      if (shape.polygon) shape.polygon = shape.polygon.map(([x, y]) => [shape.w - x, y])
    }
    level.entrance.x = level.width - level.entrance.x
    level.goal.x = level.width - level.goal.x; level.goal.flipX = true
  }
  return level
}
