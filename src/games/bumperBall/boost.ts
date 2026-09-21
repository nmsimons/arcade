import { segmentDistanceToPoint } from './physics.ts'
import type { PhysicsWorld, Vehicle } from './physics'

export const BOOST_DURATION = 0.5
export const BOOST_COOLDOWN = 3
export const BOOST_MAX_SPEED = 400
const BOOST_IMPULSE = 130
const BOOST_ACCELERATION = 650

export type BoostState = { activeRemaining: number; cooldownRemaining: number }
export const createBoost = (): BoostState => ({ activeRemaining: 0, cooldownRemaining: 0 })

function accelerate(vehicle: Vehicle, amount: number) {
  const x = Math.cos(vehicle.angle), y = Math.sin(vehicle.angle)
  const forwardSpeed = vehicle.vel.x * x + vehicle.vel.y * y
  // Add forward thrust without erasing sideways drift or collision momentum.
  const impulse = Math.max(0, Math.min(amount, BOOST_MAX_SPEED - forwardSpeed))
  vehicle.vel.x += x * impulse
  vehicle.vel.y += y * impulse
}

/** A request is a fresh button press, never a held button or a queued recharge. */
export function startBoost(state: BoostState, vehicle: Vehicle): boolean {
  if (state.activeRemaining > 0 || state.cooldownRemaining > 0) return false
  state.activeRemaining = BOOST_DURATION
  state.cooldownRemaining = BOOST_COOLDOWN
  accelerate(vehicle, BOOST_IMPULSE)
  return true
}

/** Advance only with match time: pauses and goal celebrations cannot recharge it. */
export function updateBoost(state: BoostState, vehicle: Vehicle, dt: number) {
  const activeTime = Math.min(state.activeRemaining, dt)
  if (activeTime > 0) accelerate(vehicle, BOOST_ACCELERATION * activeTime)
  state.activeRemaining = Math.max(0, state.activeRemaining - dt)
  // Recharge starts after the burst, accounting for frames that straddle its end.
  state.cooldownRemaining = Math.max(0, state.cooldownRemaining - (dt - activeTime))
}

/** Leave room for the burst and its coast, including the car's collision radius. */
export function boostLaneClear(world: PhysicsWorld, vehicle: Vehicle, distance = 220): boolean {
  const x = vehicle.pos.x + Math.cos(vehicle.angle) * distance
  const y = vehicle.pos.y + Math.sin(vehicle.angle) * distance
  const { field } = world
  if (x < field.left + 35 || x > field.right - 35 || y < field.top + 35 || y > field.bottom - 35) return false
  if (world.bumpers.some(bumper => segmentDistanceToPoint(vehicle.pos.x, vehicle.pos.y, x, y, bumper.pos.x, bumper.pos.y) < bumper.radius + 28)) return false
  const opponent = vehicle === world.vehicle1 ? world.vehicle2 : world.vehicle1
  return segmentDistanceToPoint(vehicle.pos.x, vehicle.pos.y, x, y, opponent.pos.x, opponent.pos.y) > 42
}
