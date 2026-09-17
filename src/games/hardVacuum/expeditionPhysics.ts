import type { Ship, TetherBody, Vector2 } from './types'
import { SHIP_NOSE_THRUST_ACCELERATION } from './tuning.ts'

export interface FloatingBody extends TetherBody { cargoId: string; capture: number }

export function applyNoseThrust(ship: Ship, dt: number) {
  ship.vel.x -= Math.cos(ship.angle) * SHIP_NOSE_THRUST_ACCELERATION * dt
  ship.vel.y -= Math.sin(ship.angle) * SHIP_NOSE_THRUST_ACCELERATION * dt
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

/** Cargo deflects the hull; pushing it is reserved for the grapple's tension. */
export function bumpCargo(ship: Ship, body: TetherBody): number {
  const dx = body.pos.x - ship.pos.x, dy = body.pos.y - ship.pos.y
  const distance = Math.hypot(dx, dy), overlap = ship.radius + body.radius - distance
  if (overlap <= 0) return 0
  const nx = distance > 0.001 ? dx / distance : Math.cos(ship.angle)
  const ny = distance > 0.001 ? dy / distance : Math.sin(ship.angle)
  ship.pos.x -= nx * overlap
  ship.pos.y -= ny * overlap
  const approach = (body.vel.x - ship.vel.x) * nx + (body.vel.y - ship.vel.y) * ny
  if (approach >= 0) return 0
  const impulse = -approach * 1.35
  ship.vel.x -= impulse * nx; ship.vel.y -= impulse * ny
  return -approach
}

export const angleDelta = (from: number, to: number) => Math.atan2(Math.sin(to - from), Math.cos(to - from))

export function dockingReadiness(ship: Ship, dock: Vector2): 'ready' | 'position' | 'speed' {
  const dx = ship.pos.x - dock.x, dy = ship.pos.y - dock.y
  if (Math.hypot(dx, dy) > 52) return 'position'
  if (Math.hypot(ship.vel.x, ship.vel.y) > 42) return 'speed'
  return 'ready'
}
