import type { JumpLevel } from './level.ts'
import { placementSolids } from './editorPlacement.ts'
import { bodyIntersects } from './geometry.ts'
import { canGrip } from './friction.ts'
import { groundAt, platformSurfaces } from './terrain.ts'
import { createPlayer, NEUTRAL_INPUT, STEP, stepPlayer, TUNING } from './model.ts'

export type JumpOrigin = { x: number; y: number }
export function jumpOriginAt(level: JumpLevel, point: JumpOrigin, reach = 60): JumpOrigin | null {
  const solids = placementSolids(level)
  const surfaces = solids.filter(b => point.x >= b.x && point.x <= b.x + b.w).flatMap(b => platformSurfaces(b, point.x))
    .filter(s => canGrip(s.angle) && Math.abs(s.y - point.y) <= reach && !solids.some(b => bodyIntersects(point.x, s.y, b)))
    .sort((a, b) => Math.abs(a.y - point.y) - Math.abs(b.y - point.y))
  return surfaces[0] ? { x: point.x, y: surfaces[0].y } : null
}

/** Replay the real jump motor against the authored layout without mutating it. */
export function previewJump(level: JumpLevel, origin: JumpOrigin, direction: number, charged: boolean, running: boolean) {
  const solids = placementSolids(level), support = groundAt(solids, origin.x, origin.y, .2)
  if (!support || solids.some(b => bodyIntersects(origin.x, origin.y, b))) return null
  const player = createPlayer(origin)
  Object.assign(player, { facing: direction, vx: running ? direction * TUNING.runSpeed : 0, groundAngle: support.angle,
    jumpHeld: true, charging: true, chargeSource: 'ground', charge: Number(charged) })
  const points = [{ ...origin }], input = { ...NEUTRAL_INPUT, move: direction }
  let outcome = 'Falls', rise = 0
  for (let i = 0; i < 480; i++) {
    const vy = player.vy
    stepPlayer(player, input, STEP, solids, undefined, { checkpoints: [], fallY: Infinity })
    rise = Math.max(rise, origin.y - player.y)
    if (i % 3 === 0) points.push({ x: player.x, y: player.y })
    if (player.hang || player.mantle) { outcome = 'Grabs ledge'; break }
    if (i > 1 && player.grounded) { outcome = 'Lands'; break }
    if (player.wallBrace?.active || vy < -TUNING.gravity * STEP * 2 && player.vy === 0) { outcome = 'Blocked'; break }
  }
  const end = { x: player.x, y: player.y }; points.push(end)
  return { points, outcome, end, rise, distance: Math.abs(end.x - origin.x) }
}
