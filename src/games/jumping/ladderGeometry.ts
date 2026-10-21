import type { Ladder } from './climbables.ts'
import type { Platform } from './model.ts'
import { bodyIntersects } from './geometry.ts'
import { groundAt } from './terrain.ts'
import { canGrip } from './friction.ts'
import { TUNING } from './movementTuning.ts'
import { climbFrame } from './ledge.ts'

/** A high airborne catch joins the existing pull-up at its current height. */
export function ladderMantleEntry(height: number) {
  if (height >= climbFrame(0).root[1] - 1e-5) return 0
  if (height <= 0) return 1
  let low = 0, high = 1
  for (let i = 0; i < 24; i++) {
    const mid = (low + high) / 2
    if (climbFrame(mid).root[1] > height) low = mid; else high = mid
  }
  return (low + high) / 2
}

/** The upper deck crossed by the authored ladder, with room to stand. */
export function ladderLanding(ladder: Ladder, terrain: readonly Platform[]) {
  const ground = groundAt(terrain, ladder.x, ladder.top, ladder.bottom - ladder.top,
    s => s.y >= ladder.top - .1 && s.y < ladder.bottom - TUNING.height && canGrip(s.angle))
  return ground && !terrain.some(b => bodyIntersects(ladder.x, ground.y, b)) ? ground : null
}

/** Let toes straddling a deck find its top, without releasing a body into a wall. */
export function ladderExitGround(x: number, y: number, terrain: readonly Platform[], solids: readonly Platform[] = terrain) {
  return groundAt(terrain, x, y, 18, s => s.y <= y + 5 && canGrip(s.angle)
    && !solids.some(b => bodyIntersects(x, s.y, b)))
}
