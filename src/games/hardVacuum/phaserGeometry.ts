export interface PhaserPoint {
  x: number
  y: number
}

export interface PhaserRayCopy {
  start: PhaserPoint
  end: PhaserPoint
}

const directionUnit = (direction: PhaserPoint) => {
  const magnitude = Math.hypot(direction.x, direction.y)
  if (magnitude < 1e-9) return null
  return { x: direction.x / magnitude, y: direction.y / magnitude }
}

export const wrapCoordinate = (value: number, size: number) => {
  if (size <= 0) return value
  const wrapped = value % size
  return wrapped < 0 ? wrapped + size : wrapped
}

/**
 * Returns translated copies of an unwrapped ray that can intersect the canvas.
 * Canvas clipping turns these copies into the exact visible toroidal segments,
 * including rays that cross both axes or wrap more than once.
 */
export const getToroidalRayCopies = (
  start: PhaserPoint,
  direction: PhaserPoint,
  length: number,
  width: number,
  height: number,
): PhaserRayCopy[] => {
  const unit = directionUnit(direction)
  if (!unit || length <= 0 || width <= 0 || height <= 0) return []

  const end = {
    x: start.x + unit.x * length,
    y: start.y + unit.y * length,
  }
  const minX = Math.min(start.x, end.x)
  const maxX = Math.max(start.x, end.x)
  const minY = Math.min(start.y, end.y)
  const maxY = Math.max(start.y, end.y)

  const minTileX = Math.ceil(-maxX / width)
  const maxTileX = Math.floor((width - minX) / width)
  const minTileY = Math.ceil(-maxY / height)
  const maxTileY = Math.floor((height - minY) / height)

  const copies: PhaserRayCopy[] = []
  for (let tileX = minTileX; tileX <= maxTileX; tileX++) {
    for (let tileY = minTileY; tileY <= maxTileY; tileY++) {
      const offsetX = tileX * width
      const offsetY = tileY * height
      copies.push({
        start: { x: start.x + offsetX, y: start.y + offsetY },
        end: { x: end.x + offsetX, y: end.y + offsetY },
      })
    }
  }
  return copies
}

/** Returns the nearest forward hit distance against any periodic copy of a circle. */
export const toroidalRayCircleHitDistance = (
  start: PhaserPoint,
  direction: PhaserPoint,
  length: number,
  center: PhaserPoint,
  radius: number,
  width: number,
  height: number,
) => {
  const unit = directionUnit(direction)
  if (!unit || length <= 0 || radius < 0 || width <= 0 || height <= 0) return null

  const endX = start.x + unit.x * length
  const endY = start.y + unit.y * length
  const minX = Math.min(start.x, endX) - radius
  const maxX = Math.max(start.x, endX) + radius
  const minY = Math.min(start.y, endY) - radius
  const maxY = Math.max(start.y, endY) + radius

  const minTileX = Math.ceil((minX - center.x) / width)
  const maxTileX = Math.floor((maxX - center.x) / width)
  const minTileY = Math.ceil((minY - center.y) / height)
  const maxTileY = Math.floor((maxY - center.y) / height)

  let nearest = Infinity
  for (let tileX = minTileX; tileX <= maxTileX; tileX++) {
    for (let tileY = minTileY; tileY <= maxTileY; tileY++) {
      const dx = center.x + tileX * width - start.x
      const dy = center.y + tileY * height - start.y
      const projection = dx * unit.x + dy * unit.y
      if (projection < 0 || projection > length) continue

      const perpendicularSquared = Math.max(0, dx * dx + dy * dy - projection * projection)
      if (perpendicularSquared <= radius * radius && projection < nearest) nearest = projection
    }
  }

  return Number.isFinite(nearest) ? nearest : null
}
