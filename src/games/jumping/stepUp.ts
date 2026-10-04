import type { Climbing } from './climbables.ts'
import { ropeGripDistance, ropePoint } from './climbables.ts'
import type { Player } from './model.ts'
import type { ContactWorld } from './playerContacts.ts'
import { bodyIntersects, moveBody, nearestBoundary } from './geometry.ts'
import { canGrip } from './friction.ts'
import { groundAt, followGround } from './terrain.ts'
import { ledgeExposed, platformLedges, sameLedge } from './terrainLedges.ts'
import { ledgeEase } from './ledge.ts'
import { FOOT_CONTACT } from './footwork.ts'

export interface StepUp {
  caught: Climbing['caught'] & { pushing?: Player['pushing'] }
  duration: number
  rise: number
  lead: 0 | 1
  jumpQueued?: boolean
  climbing?: Climbing
  landingAngle?: number
}
type Mantle = NonNullable<Player['mantle']>

export function stepFootOffsets(step: StepUp): [number, number] {
  if (step.rise > 40.01 && !step.climbing) return [2, -2]
  const lead = -4, trail = 2
  return step.lead === 0 ? [lead, trail] : [trail, lead]
}

/** Hand the actual landing contacts back to walking, without resetting the feet. */
export function finishStepFeet(p: Player, step: StepUp) {
  const angle = step.landingAngle ?? 0
  const feet = stepFootOffsets(step).map(offset => {
    const x = p.x + offset * p.facing, y = p.y + offset * p.facing * Math.tan(angle)
    return { x, y: y - 2.8, anchorX: x, anchorY: y, groundY: y, groundAngle: angle, angle,
      facing: p.facing, planted: true, blockedCycle: -Infinity, release: null, settle: null }
  }) as NonNullable<Player['footwork']>['feet']
  p.footwork = { feet, moving: false, facing: p.facing, terrain: p.terrain ?? [] }
}

/** Lift the feet over the lip before the body crosses it. Even the supporting
 * terrain remains solid: this path fits the same hull used by ordinary movement. */
export function stepUpRoot(m: Mantle, progress: number): [number, number] {
  const s = m.step!, t = Math.max(0, Math.min(1, progress))
  if (s.climbing) {
    const u = ledgeEase(t), lift = Math.min(s.caught.y, m.toY) - 12
    return [s.caught.x + (m.toX - s.caught.x) * u,
      (1 - u) ** 2 * s.caught.y + 2 * (1 - u) * u * lift + u ** 2 * m.toY]
  }
  const gap = (m.edgeX - s.caught.x) * m.side, distance = gap + (m.toX - m.edgeX) * m.side
  const travel = s.rise <= 20.01 ? t : ledgeEase(t)
  const remaining = s.rise * (1 - ledgeEase(travel / (gap / distance * .85)))
  let x = -gap + distance * travel
  if (remaining > 1e-7) x = Math.min(x, -Math.min(12, remaining) - .001)
  // At the exact start, preserve the incoming root without even a tiny nudge.
  return t === 0 ? [s.caught.x, s.caught.y] : [m.edgeX + x * m.side, m.edgeY + remaining]
}

/** A rope anchored on a slope ends in a pull-up, not an impossible grip above its anchor. */
export function findRopeStepUp(p: Player, world: ContactWorld): Mantle | null {
  const c = p.climbing
  if (!c?.rope || !c.surfaceSupport || c.distance > 64 || c.time < .16) return null
  const anchor = c.rope.definition, side = Math.sign(anchor.x - p.x) || p.facing
  const grip = ropePoint(c.rope, ropeGripDistance(c))
  if (Math.hypot(grip[0] - anchor.x, grip[1] - anchor.y) > 42) return null
  const terrain = world.colliders.filter(c => !c.prop).map(c => c.platform)
  if (!terrain.some(b => { const face = nearestBoundary(b, anchor.x, anchor.y); return face.distance < 2 && face.ny < -.2 })) return null
  for (const inset of [12, 20, 28]) {
    const toX = anchor.x + side * inset, ground = groundAt(terrain, toX, anchor.y, 20, s => canGrip(s.angle))
    if (!ground) continue
    const rise = p.y - ground.y
    if (rise < 1 || rise > 74 || (toX - p.x) * side < 0 || Math.abs(toX - p.x) > 64) continue
    const caught = { x: p.x, y: p.y, vx: 0, vy: 0, stride: p.stride, grounded: false, gait: p.gait, footwork: null }
    const mantle: Mantle = { edgeX: anchor.x, edgeY: anchor.y, side, toX, toY: ground.y, time: 0, braced: false,
      step: { caught, duration: .65, rise, lead: 0, landingAngle: ground.angle, climbing: c } }
    let previous: [number, number] = [p.x, p.y], clear = true
    for (let i = 1; i <= 32; i++) {
      const target = stepUpRoot(mantle, i / 32), safe = moveBody(previous, target, world.platforms)
      if (Math.hypot(safe.x - target[0], safe.y - target[1]) > .01 || world.platforms.some(b => bodyIntersects(...target, b))) { clear = false; break }
      previous = target
    }
    if (!clear) continue
    // The unloaded rope can settle while the entry pose blends from the last real grip.
    mantle.step!.climbing = { ...c, rope: { ...c.rope, nodes: c.rope.nodes.map(n => ({ ...n })), bends: c.rope.bends.map(b => b ? [...b] : null) } }
    return mantle
  }
  return null
}

/** Only static terrain offers automatic steps; puzzle objects remain pushable. */
export function findStepUp(p: Player, move: number, dt: number, world: ContactWorld, intent: Player['stepIntent']): Mantle | null {
  const side = Math.sign(move), platforms = world.platforms
  if (Math.abs(move) < .1 || p.vx * side < 0) return null
  const reach = 26 + Math.max(0, p.vx * side) * dt
  const edges = world.colliders.filter(c => c.id.startsWith('terrain:')).flatMap(c => platformLedges(c.platform))
    .filter(edge => !edge.slope && edge.side === side && p.y - edge.edgeY > .2 && p.y - edge.edgeY <= 60.01
      && (edge.edgeX - p.x) * side >= 11.99 && (edge.edgeX - p.x) * side <= reach)
    .sort((a, b) => Math.abs(a.edgeX - p.x) - Math.abs(b.edgeX - p.x))
  for (const edge of edges) {
    if (!ledgeExposed(platforms, edge)) continue
    // Approach over continuous support, never use a step to bridge a hole.
    if (!followGround(platforms, p.x, edge.edgeX - side * 12, p.y)) continue
    const tall = p.y - edge.edgeY > 40.01
    const toY = edge.edgeY, rise = p.y - toY
    if (rise > 20.01) {
      // Taller steps need a firm, sustained push against the actual face.
      // Running past a corner or lightly brushing it must not commit a climb.
      const push = p.contacts?.push
      const braced = rise > 40.01 && push?.direction === side && Math.abs(push.wallX - edge.edgeX) < .01
      if (Math.abs(move) < .5 || (edge.edgeX - p.x) * side > (braced ? 26 : 12.15)) continue
      p.stepIntent = { ...edge, time: (intent && sameLedge(intent, edge) ? intent.time : 0) + dt }
      if (p.stepIntent.time < .2) return null
    }
    const caught = { x: p.x, y: p.y, vx: p.vx, vy: p.vy, stride: p.stride, grounded: p.grounded, gait: p.gait, footwork: p.footwork,
      pushing: tall ? p.pushing : undefined, freeFall: p.freeFall }
    const lead = p.footwork?.feet[0].planted && !p.footwork.feet[1].planted ? 1 : 0
    // Keep the usual stride when it fits. Short steps can plant nearer the lip
    // on a narrow tread, leaving room for the body before the next riser.
    // The hand-assisted tall climb retains its authored landing and pose.
    for (let inset = tall ? 20 : 12; inset >= (tall ? 20 : 8); inset--) {
      const toX = edge.edgeX + side * inset, distance = Math.abs(toX - p.x)
      if (!groundAt(platforms, toX, toY, .01, ground => Math.abs(ground.angle) < .01)) continue
      const duration = rise <= 20.01 ? Math.max(.12, Math.min(.28, distance / Math.max(100, Math.abs(p.vx)))) : .34
      const mantle: Mantle = { ...edge, toX, toY, time: 0, braced: false, step: { caught, duration, rise, lead } }
      // Both flat soles need actual footing, not just a supported body center.
      // A shorter landing must not turn a tiny isolated shelf into a step.
      if (stepFootOffsets(mantle.step!).some(offset => FOOT_CONTACT.filter(([, y]) => y === 2.8).some(([x]) =>
        !groundAt(platforms, toX + (offset + x) * side, toY, .01, ground => Math.abs(ground.angle) < .01)))) continue
      let previous: [number, number] = [p.x, p.y], clear = true
      for (let i = 1; i <= 32; i++) {
        const target = stepUpRoot(mantle, i / 32), safe = moveBody(previous, target, platforms)
        if (Math.hypot(safe.x - target[0], safe.y - target[1]) > .01 || platforms.some(b => bodyIntersects(...target, b))) { clear = false; break }
        previous = target
      }
      if (clear) { p.stepIntent = null; return mantle }
    }
  }
  return null
}
