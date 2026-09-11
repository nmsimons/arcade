export interface PhaserPoint {
  x: number
  y: number
}

const directionUnit = (direction: PhaserPoint) => {
  const magnitude = Math.hypot(direction.x, direction.y)
  if (magnitude < 1e-9) return null
  return { x: direction.x / magnitude, y: direction.y / magnitude }
}

/** Returns the nearest forward hit distance against a circle in world space. */
export const rayCircleHitDistance = (
  start: PhaserPoint,
  direction: PhaserPoint,
  length: number,
  center: PhaserPoint,
  radius: number,
) => {
  const unit = directionUnit(direction)
  if (!unit || length <= 0 || radius < 0) return null

  const dx = center.x - start.x
  const dy = center.y - start.y
  const projection = dx * unit.x + dy * unit.y

  const perpendicularSquared = Math.max(0, dx * dx + dy * dy - projection * projection)
  if (perpendicularSquared > radius * radius) return null

  const entryOffset = Math.sqrt(Math.max(0, radius * radius - perpendicularSquared))
  const entry = projection - entryOffset
  const exit = projection + entryOffset
  if (exit < 0 || entry > length) return null
  return Math.max(0, entry)
}
