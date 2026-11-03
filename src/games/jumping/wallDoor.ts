import { drawDoorway, entranceDoor } from './goal.ts'
import type { NamedObject } from './objectNames.ts'

/**
 * A door painted into the back wall that never opens: art for sealed, jammed,
 * boarded-up and caved-in passages. It has no collision and is never entered.
 */
export type WallDoorCondition = 'sealed' | 'jammed' | 'boarded' | 'caved-in'
export const WALL_DOOR_CONDITIONS: readonly WallDoorCondition[] = ['sealed', 'jammed', 'boarded', 'caved-in']
export const WALL_DOOR_LABELS: Record<WallDoorCondition, string> = { sealed: 'Sealed', jammed: 'Jammed', boarded: 'Boarded up', 'caved-in': 'Caved in' }
export interface WallDoor extends NamedObject { x: number; y: number; condition: WallDoorCondition; frame?: 'bulkhead'; flipX?: boolean }
export const MAX_WALL_DOORS = 40

const frameWidth = (door: Pick<WallDoor, 'frame'>) => door.frame === 'bulkhead' ? 7 : 3
/** Like a real door, the point is the middle of its sill. The outline holds the frame. */
export function wallDoorBounds(door: Pick<WallDoor, 'x' | 'y' | 'frame'>) {
  const b = entranceDoor(door), f = frameWidth(door)
  return { x: b.x - f, y: b.y - f, w: b.w + f * 2, h: b.h + f }
}

export function drawWallDoors(ctx: CanvasRenderingContext2D, doors: readonly WallDoor[]) {
  for (const door of doors) drawWallDoor(ctx, door)
}
export function drawWallDoor(ctx: CanvasRenderingContext2D, door: WallDoor) {
  const b = entranceDoor(door), f = frameWidth(door), bulkhead = door.frame === 'bulkhead'
  ctx.save()
  if (door.flipX) { ctx.translate(door.x * 2, 0); ctx.scale(-1, 1) }
  // The frame matches level doors and bulkheads, so blocked doors read as part of the same building.
  ctx.fillStyle = bulkhead ? '#5c6460' : '#9aa19c'; ctx.fillRect(b.x - f, b.y - f, b.w + f * 2, b.h + f)
  if (bulkhead) for (let x = b.x - f, i = 0; x < b.x + b.w + f; x += 8, i++) {
    ctx.fillStyle = i % 2 ? '#2f3431' : '#d9b545'; ctx.fillRect(x, b.y - f, Math.min(8, b.x + b.w + f - x), 4)
  }
  const panel = bulkhead ? '#424a46' : '#4a5450'
  const shape = (points: [number, number][], color: string) => {
    ctx.beginPath(); ctx.moveTo(b.x + points[0][0], b.y + points[0][1])
    for (const [x, y] of points.slice(1)) ctx.lineTo(b.x + x, b.y + y)
    ctx.closePath(); ctx.fillStyle = color; ctx.fill()
  }
  if (door.condition === 'sealed') {
    ctx.fillStyle = panel; ctx.fillRect(b.x, b.y, b.w, b.h)
    ctx.fillStyle = '#00000030'; ctx.fillRect(b.x + b.w / 2 - .5, b.y, 1, b.h)
    // A dead indicator above the frame.
    ctx.beginPath(); ctx.arc(door.x, b.y - f - 6, 3, 0, Math.PI * 2); ctx.fillStyle = '#5a2b27'; ctx.fill()
  } else if (door.condition === 'jammed') {
    // The panel stuck partway down at an angle, over a dark gap.
    drawDoorway(ctx, b, 1)
    shape([[0, 0], [b.w, 0], [b.w, b.h * .5], [0, b.h * .74]], panel)
    ctx.strokeStyle = '#2c3330'; ctx.lineWidth = 1.5
    ctx.beginPath(); ctx.moveTo(b.x, b.y + b.h * .74); ctx.lineTo(b.x + b.w, b.y + b.h * .5); ctx.stroke()
    ctx.strokeStyle = '#ffffff30'; ctx.lineWidth = 1
    ctx.beginPath(); ctx.moveTo(b.x + 8, b.y + 14); ctx.lineTo(b.x + 15, b.y + 30); ctx.moveTo(b.x + 26, b.y + 10); ctx.lineTo(b.x + 30, b.y + 22); ctx.stroke()
  } else if (door.condition === 'boarded') {
    ctx.fillStyle = panel; ctx.fillRect(b.x, b.y, b.w, b.h)
    // Planks nailed across the frame.
    for (const [y, angle] of [[18, -.08], [44, .14], [66, -.04]] as const) {
      ctx.save(); ctx.translate(door.x, b.y + y); ctx.rotate(angle)
      const w = b.w + f * 2 + 8
      ctx.fillStyle = '#8a6a45'; ctx.fillRect(-w / 2, -5, w, 10)
      ctx.fillStyle = '#5e4630'; ctx.fillRect(-w / 2, 3, w, 2)
      ctx.fillStyle = '#2b2620'; for (const x of [-w / 2 + 5, w / 2 - 5]) ctx.fillRect(x - 1, -1, 2, 2)
      ctx.restore()
    }
  } else {
    // Rubble fills the doorway from the sill and spills past the frame; the lintel cracks.
    drawDoorway(ctx, b, 1)
    shape([[-f - 12, b.h], [-f - 4, b.h - 12], [4, b.h - 34], [14, b.h - 46], [24, b.h - 40], [33, b.h - 56], [b.w + 2, b.h - 30], [b.w + f + 10, b.h - 8], [b.w + f + 14, b.h]], '#6c6e68')
    shape([[2, b.h], [9, b.h - 22], [19, b.h - 28], [25, b.h - 15], [21, b.h]], '#585a55')
    shape([[23, b.h - 30], [32, b.h - 44], [b.w, b.h - 26], [b.w - 6, b.h - 16]], '#8a8b84')
    shape([[-f - 8, b.h], [-2, b.h - 9], [6, b.h]], '#8a8b84')
    ctx.strokeStyle = '#2f3431'; ctx.lineWidth = 1.5
    ctx.beginPath(); ctx.moveTo(b.x + 12, b.y - f); ctx.lineTo(b.x + 17, b.y + 5); ctx.lineTo(b.x + 13, b.y + 12); ctx.stroke()
  }
  ctx.restore()
}
