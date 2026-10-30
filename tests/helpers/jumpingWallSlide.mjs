import { readLevelAsset } from './jumping-fixtures.mjs'

// Freeze Exit's two-column encounter independently of authored level edits.
export function columnSlideLevel(side = 1) {
  const level = readLevelAsset('exit-column-slide.json')
  if (side < 0) {
    level.entrance.x = level.width - level.entrance.x
    level.goal.x = level.width - level.goal.x
    level.goal.flipX = !level.goal.flipX
    level.platforms = level.platforms.map(b => ({ ...b, x: level.width - b.x - b.w,
      ...(b.polygon ? { polygon: b.polygon.map(([x, y]) => [b.w - x, y]) } : {}) }))
  }
  return level
}
