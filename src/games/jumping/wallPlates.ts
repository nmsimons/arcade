import type { JumpLevel, Trigger } from './level.ts'
import { levelHeight, levelTerrain } from './level.ts'
import { wallPlateSurface } from './plateSurface.ts'
import type { Platform, Player } from './model.ts'
import type { Prop } from './challenge.ts'
import { bodyPolygon, polygonPoints } from './geometry.ts'
import { playerContactBody } from './playerContacts.ts'
import { boxShape } from './propGeometry.ts'

/**
 * Pressure plates on vertical faces. A wall plate has `facing: 'left' | 'right'`, the way its pressing face points:
 * a plate on a pillar's right side faces right. `x` is the face it is mounted on, `y` the plate's top, and `w` its
 * length down the face. Gravity does not press it, so contact does: a body leaning or braced on it, palms working
 * it, or a box or ball held against it. The usual debounce, behaviours and EMP rules then apply.
 */
export type PlateFacing = 'up' | 'down' | 'left' | 'right'
type PressurePlate = Extract<Trigger, { mode: 'weight' | 'touch' }>
export const WALL_PLATE_THICKNESS = 8
/** Contact tolerance across the face, and the least overlap along it that counts as touching the plate. */
const TOUCH = 1.25, OVERLAP = 3

export const plateFacing = (plate: Trigger): PlateFacing => plate.mode === 'coins' ? 'up' : plate.facing ?? (plate.ceiling ? 'down' : 'up')
export const isWallPlate = (plate: Trigger): plate is PressurePlate & { facing: 'left' | 'right' } => plate.mode !== 'coins' && !!plate.facing
const outward = (plate: { facing: 'left' | 'right' }) => plate.facing === 'right' ? 1 : -1

/** Any pressure plate's editor and wiring footprint: an 8-unit housing on its mounting surface. */
export function pressurePlateBounds(plate: PressurePlate) {
  return plate.facing ? wallPlateBounds({ ...plate, facing: plate.facing }) : { x: plate.x, y: plate.y - (plate.ceiling ? 0 : 8), w: plate.w, h: 8 }
}

/** The plate's editor footprint: its housing standing off the face. */
export function wallPlateBounds(plate: { x: number; y: number; w: number; facing: 'left' | 'right' }) {
  return { x: plate.facing === 'right' ? plate.x : plate.x - WALL_PLATE_THICKNESS, y: plate.y, w: WALL_PLATE_THICKNESS, h: plate.w }
}

/** Whether an outline touches the plate: some part of it lies against the face, on the open side, within the plate's span. */
function outlineTouches(points: readonly (readonly [number, number])[], plate: { x: number; y: number; w: number; facing: 'left' | 'right' }) {
  const side = outward(plate)
  let top = Infinity, bottom = -Infinity
  for (const [x, y] of points) {
    const gap = (x - plate.x) * side
    if (gap < -TOUCH) return false
    if (gap <= TOUCH) { top = Math.min(top, y); bottom = Math.max(bottom, y) }
  }
  if (top > bottom) return false
  // A single touching corner presses within the span; a flat side needs a real overlap.
  return bottom - top < OVERLAP ? top >= plate.y && top <= plate.y + plate.w
    : Math.min(bottom, plate.y + plate.w) - Math.max(top, plate.y) >= OVERLAP
}

/** A body against the face, or its palms working the face from a push stance. */
export function actorPressesWallPlate(actor: Player, plate: { x: number; y: number; w: number; facing: 'left' | 'right' }) {
  const push = actor.contacts?.push
  if (push && !push.collider.prop && Math.abs(push.wallX - plate.x) <= TOUCH && push.direction === -outward(plate)) {
    const hands = actor.y + (actor.inverted ? 1 : -1) * 44
    if (hands >= plate.y && hands <= plate.y + plate.w) return true
  }
  const body = playerContactBody(actor)
  return outlineTouches(bodyPolygon(body.x, body.y, body.height, actor.inverted ? -1 : 1, 0, body.outline), plate)
}

/** A box or ball held against the face, by a push, a slope, a field, or another prop. */
export function propPressesWallPlate(b: Prop, plate: { x: number; y: number; w: number; facing: 'left' | 'right' }) {
  if (b.kind === 'ball') {
    const r = b.size / 2, cy = b.y - r
    return Math.abs((b.x - plate.x) * outward(plate) - r) <= TOUCH + .5 && cy >= plate.y && cy <= plate.y + plate.w
  }
  return outlineTouches(polygonPoints(boxShape(b) as Platform), plate)
}

/** Keep a wall plate in the room and on the nearest matching terrain face, when one is close. */
export function snapWallPlate<T extends { x: number; y: number; w: number; facing: 'left' | 'right' }>(level: JumpLevel, plate: T): T {
  const y = Math.max(0, Math.min(levelHeight(level) - plate.w, plate.y))
  const face = wallPlateSurface(levelTerrain(level), plate.x, y, plate.w, plate.facing)
  return { ...plate, x: Math.max(0, Math.min(level.width, face?.x ?? plate.x)), y }
}
