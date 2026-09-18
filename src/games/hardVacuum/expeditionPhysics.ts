import type { Ship, TetherBody, Vector2 } from './types'
import { SHIP_NOSE_THRUST_ACCELERATION, SHIP_ROTATION_SPEED, SHIP_TURN_DAMPING, SHIP_TURN_RESPONSE } from './tuning.ts'

export interface FloatingBody extends TetherBody { cargoId: string; capture: number }

export const initialCargoVelocity = (position: Vector2): Vector2 => ({ x: Math.sin(position.x) * 3, y: Math.cos(position.y) * 3 })

export function driftCargo(body: TetherBody, dt: number) {
  if (body.retrieving) return
  const damping = Math.exp(-0.35 * dt)
  body.vel.x *= damping; body.vel.y *= damping
  body.pos.x += body.vel.x * dt; body.pos.y += body.vel.y * dt
}

export function applyNoseThrust(ship: Ship, dt: number) {
  ship.vel.x -= Math.cos(ship.angle) * SHIP_NOSE_THRUST_ACCELERATION * dt
  ship.vel.y -= Math.sin(ship.angle) * SHIP_NOSE_THRUST_ACCELERATION * dt
}

/** A responsive turn with a small, frame-rate-independent coast on release. */
export function stepShipTurn(ship: Ship, input: number, dt: number) {
  if (dt <= 0) return
  const target = Math.max(-1, Math.min(1, input)) * SHIP_ROTATION_SPEED
  const rate = input === 0 ? SHIP_TURN_DAMPING : SHIP_TURN_RESPONSE
  const previous = ship.angularVelocity ?? 0, decay = Math.exp(-rate * dt)
  const velocity = target + (previous - target) * decay
  // Integrate the easing curve so the same input covers the same angle at any FPS.
  ship.angle += target * dt + (previous - target) * (1 - decay) / rate
  ship.angularVelocity = input === 0 && Math.abs(velocity) < .01 ? 0 : velocity
}

/** Blue bodies absorb damage as momentum; connected cells remain anchored. */
export function repelBlueBody(body: TetherBody, direction?: Vector2, impulse = 170): boolean {
  if (body.kind !== 'blue') return false
  const length = direction ? Math.hypot(direction.x, direction.y) : 0
  if (!body.socketId && direction && length > 1e-6) {
    body.vel.x += direction.x / length * impulse
    body.vel.y += direction.y / length * impulse
  }
  return true
}

export const angleDelta = (from: number, to: number) => Math.atan2(Math.sin(to - from), Math.cos(to - from))

export function dockingReadiness(ship: Ship, dock: Vector2): 'ready' | 'position' | 'speed' {
  const dx = ship.pos.x - dock.x, dy = ship.pos.y - dock.y
  if (Math.hypot(dx, dy) > 52) return 'position'
  if (Math.hypot(ship.vel.x, ship.vel.y) > 42) return 'speed'
  return 'ready'
}
