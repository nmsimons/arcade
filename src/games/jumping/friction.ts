// The current terrain shares one grip model. Keep the tuning together so future
// surface types can supply their own grip without changing movement or collisions.
export interface SurfaceFriction { grip: number; sliding: number }
export const TERRAIN_FRICTION: SurfaceFriction = { grip: 1.05, sliding: .65 }

const approach = (value: number, target: number, delta: number) => value + Math.max(-delta, Math.min(delta, target - value))

/** Gravity and normal load share a factor of g, so this balance is unitless. */
export const canGrip = (angle: number, friction = TERRAIN_FRICTION) => Math.cos(angle) > 0
  && friction.grip * Math.cos(angle) >= Math.abs(Math.sin(angle))

/** Ground locomotion in surface space; flat ground retains the original response. */
export function groundVelocity(vx: number, target: number, angle: number, acceleration: number, dt: number, friction = TERRAIN_FRICTION) {
  const normal = Math.cos(angle), downhill = Math.sin(angle)
  const speed = vx / normal
  // Available grip also limits sustained climbing. Keep gentle slopes familiar,
  // then taper uphill speed continuously to zero as gravity consumes the grip.
  const load = Math.abs(downhill) / (friction.grip * normal)
  if (target * downhill < 0) target *= Math.sqrt(Math.max(0, 1 - load ** 4))
  // Gravity uses some of the available grip uphill and assists downhill. The
  // square root keeps ordinary slopes responsive while reducing steep climbing.
  const reserve = Math.max(0, normal + Math.sign(target - speed) * downhill / friction.grip)
  return approach(speed, target, acceleration * Math.sqrt(reserve) * dt) * normal
}

/** Integrate gravity and friction together, catching a stop without reversing it. */
export function slidingVelocity(speed: number, angle: number, gravity: number, dt: number, surface = TERRAIN_FRICTION) {
  const downhill = gravity * Math.sin(angle), normal = gravity * Math.cos(angle)
  // Grip gives way gradually as slipping gathers speed. This avoids a sudden
  // friction drop (and acceleration jump) as soon as static grip is exhausted.
  const slip = Math.min(1, Math.abs(speed) / 80), blend = slip * slip * (3 - 2 * slip)
  const friction = (surface.grip + (surface.sliding - surface.grip) * blend) * normal
  const acceleration = downhill - Math.sign(speed || downhill) * friction
  const next = speed + acceleration * dt
  if (speed && speed * next > 0) return next
  const remaining = speed ? Math.max(0, dt + speed / acceleration) : dt
  // A newly stationary foot either holds or slips under the unbalanced load.
  if (canGrip(angle, surface)) return 0
  return Math.sign(downhill) * Math.max(0, Math.abs(downhill) - surface.grip * normal) * remaining
}
