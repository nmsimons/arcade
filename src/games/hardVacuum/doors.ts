import type { Vector2 } from './types'

export const DOOR_OPEN_SECONDS = 1.2
type Door = { x: number; y: number; w: number; h: number }

export const doorTravel = (progress: number) => {
  const t = Math.max(0, Math.min(1, progress))
  return t * t * (3 - 2 * t)
}

/** Sliding leaves retract into the wall; collision uses the visible aperture. */
export function doorPanels(door: Door, progress: number): Vector2[][] {
  if (progress >= 1) return []
  const vertical = door.h > door.w
  const length = (vertical ? door.h : door.w) / 2 * (1 - doorTravel(progress))
  const rect = (x: number, y: number, w: number, h: number) => [
    { x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h },
  ]
  return vertical
    ? [rect(door.x, door.y, door.w, length), rect(door.x, door.y + door.h - length, door.w, length)]
    : [rect(door.x, door.y, length, door.h), rect(door.x + door.w - length, door.y, length, door.h)]
}
