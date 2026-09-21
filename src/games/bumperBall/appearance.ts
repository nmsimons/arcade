import type { Vehicle } from './physics'

export type VehicleAppearance = { roll: number; pitch: number; rollSpeed: number; pitchSpeed: number; steer: number }
export const createVehicleAppearance = (): VehicleAppearance => ({ roll: 0, pitch: 0, rollSpeed: 0, pitchSpeed: 0, steer: 0 })
type Motion = Pick<Vehicle, 'angle' | 'vel'>
const clamp = (value: number, limit: number) => Math.max(-limit, Math.min(limit, value))

// A critically damped suspension responds promptly and settles without jitter.
function spring(value: number, speed: number, target: number, dt: number) {
  const frequency = 13
  const offset = value - target
  const impulse = speed + frequency * offset
  const decay = Math.exp(-frequency * dt)
  return { value: target + (offset + impulse * dt) * decay, speed: (speed - frequency * impulse * dt) * decay }
}

function pose(state: VehicleAppearance, roll: number, pitch: number, dt: number) {
  const bank = spring(state.roll, state.rollSpeed, roll, dt)
  const lean = spring(state.pitch, state.pitchSpeed, pitch, dt)
  state.roll = bank.value
  state.rollSpeed = bank.speed
  state.pitch = lean.value
  state.pitchSpeed = lean.speed
}

/** Visual weight transfer only; both cars respond to their actual movement. */
export function stepVehicleAppearance(state: VehicleAppearance, vehicle: Motion, previous: Motion, dt: number) {
  if (dt <= 0) return
  const hx = Math.cos(vehicle.angle), hy = Math.sin(vehicle.angle)
  const speed = vehicle.vel.x * hx + vehicle.vel.y * hy
  const acceleration = ((vehicle.vel.x - previous.vel.x) * hx + (vehicle.vel.y - previous.vel.y) * hy) / dt
  const delta = vehicle.angle - previous.angle
  const turnRate = Math.atan2(Math.sin(delta), Math.cos(delta)) / dt
  // The front axle follows either driver's actual turn and eases back to center.
  state.steer += (clamp(turnRate * .1, .35) - state.steer) * (1 - Math.exp(-12 * dt))
  // Roll toward the outside of a turn, reversing sides when backing up.
  const roll = -clamp(turnRate * speed / 650, 1) * 0.3
  const pitch = clamp(clamp(speed / 180, 1) * 0.09 + clamp(acceleration / 450, 1) * 0.17, 0.24)
  pose(state, roll, pitch, dt)
}

export function settleVehicleAppearance(state: VehicleAppearance, dt: number) {
  if (dt <= 0) return
  state.steer *= Math.exp(-12 * dt)
  pose(state, 0, 0, dt)
}

/** Orthographic projection of a horizontal body layer after roll and pitch.
 * Wheels remain on the ground; taller details move farther with the suspension. */
export function bodyPlane(state: VehicleAppearance, height: number): [number, number, number, number, number, number] {
  const cr = Math.cos(state.roll), sr = Math.sin(state.roll)
  const cp = Math.cos(state.pitch), sp = Math.sin(state.pitch)
  return [cp, 0, sr * sp, cr, -height * cr * sp, height * sr]
}
