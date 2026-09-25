import type { Climbing } from './climbables.ts'
import type { Player } from './model.ts'
import type { ContactWorld } from './playerContacts.ts'
import { bodyIntersects, moveBody } from './geometry.ts'
import { groundAt, followGround } from './terrain.ts'
import { ledgeExposed, platformLedges, sameLedge } from './terrainLedges.ts'
import { ledgeEase } from './ledge.ts'

export interface StepUp {
  caught: Climbing['caught']
  duration: number
  rise: number
  lead: 0 | 1
  jumpQueued?: boolean
}
type Mantle = NonNullable<Player['mantle']>

export function stepFootOffsets(step: StepUp): [number, number] {
  const lead = -4, trail = 2
  return step.lead === 0 ? [lead, trail] : [trail, lead]
}

/** Hand the actual landing contacts back to walking, without resetting the feet. */
export function finishStepFeet(p: Player, step: StepUp) {
  const feet = stepFootOffsets(step).map(offset => ({
    x: p.x + offset * p.facing, y: p.y - 2.8, anchorX: p.x + offset * p.facing, anchorY: p.y,
    groundY: p.y, groundAngle: 0, angle: 0, facing: p.facing, planted: true, blockedCycle: -Infinity, release: null, settle: null,
  })) as NonNullable<Player['footwork']>['feet']
  p.footwork = { feet, moving: false, facing: p.facing, terrain: p.terrain ?? [] }
}

/** Lift the feet over the lip before the body crosses it. Even the supporting
 * terrain remains solid: this path fits the same hull used by ordinary movement. */
export function stepUpRoot(m: Mantle, progress: number): [number, number] {
  const s = m.step!, t = Math.max(0, Math.min(1, progress))
  const gap = (m.edgeX - s.caught.x) * m.side, distance = gap + (m.toX - m.edgeX) * m.side
  const travel = s.rise <= 20.01 ? t : ledgeEase(t)
  const remaining = s.rise * (1 - ledgeEase(travel / (gap / distance * .85)))
  let x = -gap + distance * travel
  if (remaining > 1e-7) x = Math.min(x, -Math.min(12, remaining) - .001)
  // At the exact start, preserve the incoming root without even a tiny nudge.
  return t === 0 ? [s.caught.x, s.caught.y] : [m.edgeX + x * m.side, m.edgeY + remaining]
}

/** Only static terrain offers automatic steps; puzzle objects remain pushable. */
export function findStepUp(p: Player, move: number, dt: number, world: ContactWorld, intent: Player['stepIntent']): Mantle | null {
  const side = Math.sign(move), platforms = world.platforms
  if (Math.abs(move) < .1 || p.vx * side < 0) return null
  const reach = 26 + Math.max(0, p.vx * side) * dt
  const edges = world.colliders.filter(c => c.id.startsWith('terrain:')).flatMap(c => platformLedges(c.platform))
    .filter(edge => edge.side === side && p.y - edge.edgeY > .2 && p.y - edge.edgeY <= 40.01
      && (edge.edgeX - p.x) * side >= 11.99 && (edge.edgeX - p.x) * side <= reach)
    .sort((a, b) => Math.abs(a.edgeX - p.x) - Math.abs(b.edgeX - p.x))
  for (const edge of edges) {
    if (!ledgeExposed(platforms, edge)) continue
    // Approach over continuous support, never use a step to bridge a hole.
    if (!followGround(platforms, p.x, edge.edgeX - side * 12, p.y)) continue
    const toX = edge.edgeX + side * 12, toY = edge.edgeY
    if (!groundAt(platforms, toX, toY, .01, ground => Math.abs(ground.angle) < .01)) continue
    const rise = p.y - toY, distance = Math.abs(toX - p.x)
    if (rise > 20.01) {
      // Taller steps need a firm, sustained push against the actual face.
      // Running past a corner or lightly brushing it must not commit a climb.
      if (Math.abs(move) < .5 || (edge.edgeX - p.x) * side > 12.15) continue
      p.stepIntent = { ...edge, time: (intent && sameLedge(intent, edge) ? intent.time : 0) + dt }
      if (p.stepIntent.time < .2) return null
    }
    const duration = rise <= 20.01 ? Math.max(.12, Math.min(.28, distance / Math.max(100, Math.abs(p.vx)))) : .34
    const caught = { x: p.x, y: p.y, vx: p.vx, vy: p.vy, stride: p.stride, grounded: p.grounded, gait: p.gait, footwork: p.footwork }
    const lead = p.footwork?.feet[0].planted && !p.footwork.feet[1].planted ? 1 : 0
    const mantle: Mantle = { ...edge, toX, toY, time: 0, braced: false, step: { caught, duration, rise, lead } }
    let previous: [number, number] = [p.x, p.y], clear = true
    for (let i = 1; i <= 32; i++) {
      const target = stepUpRoot(mantle, i / 32), safe = moveBody(previous, target, platforms)
      if (Math.hypot(safe.x - target[0], safe.y - target[1]) > .01 || platforms.some(b => bodyIntersects(...target, b))) { clear = false; break }
      previous = target
    }
    if (clear) { p.stepIntent = null; return mantle }
  }
  return null
}
