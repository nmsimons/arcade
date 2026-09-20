import type { Expedition, ExpeditionRuntime } from './expedition'
import type { Rock, Ship, TetherBody, Vector2 } from './types'
import { rayCircleHitDistance } from './phaserGeometry.ts'
import { raycastCavern } from './worldGeometry.ts'
import type { CavernMap } from './worldGeometry'

export const BLASTER_BLAST_RADIUS = 95
export interface BlasterShot { pos: Vector2; vel: Vector2; life: number }
export interface BlasterVisuals {
  shots: BlasterShot[]
  bursts: { pos: Vector2; life: number }[]
}
export interface BlasterImpact { pos: Vector2; direction: Vector2; target?: TetherBody }

/** A blast clears an asteroid completely, without splitting it or producing mineable ore. */
export function pulverizeAsteroid(rocks: Rock[], rock: Rock): boolean {
  if (rock.sourceId || rock.socketId) return false
  const index = rocks.indexOf(rock)
  if (index < 0) return false
  rocks.splice(index, 1)
  return true
}

export function fireBlaster(state: Expedition, runtime: ExpeditionRuntime, ship: Ship): BlasterShot | null {
  const charges = state.blasterCharges
  if (!state.blasterInstalled || charges <= 0 || runtime.blasterCooldown > 0) return null
  state.blasterCharges = charges - 1
  runtime.blasterCooldown = 0.35
  const x = Math.cos(ship.angle), y = Math.sin(ship.angle)
  // Start at the hull and sweep the full path, including nearby obstacles.
  const shot = { pos: { ...ship.pos }, vel: { x: x * 680 + ship.vel.x, y: y * 680 + ship.vel.y }, life: 1.25 }
  ship.vel.x -= x * 38; ship.vel.y -= y * 38
  return shot
}

/** Sweep each projectile so a fast bolt cannot skip a thin door or small rock. */
export function stepBlaster(shots: BlasterShot[], dt: number, map: CavernMap, targets: readonly TetherBody[]) {
  const remaining: BlasterShot[] = [], impacts: BlasterImpact[] = []
  for (const shot of shots) {
    if (shot.life <= 0) continue
    const speed = Math.hypot(shot.vel.x, shot.vel.y)
    if (speed < 0.001) continue
    const travel = speed * Math.min(dt, shot.life)
    const direction = { x: shot.vel.x / speed, y: shot.vel.y / speed }
    let distance = raycastCavern(shot.pos, direction, travel, map)
    let target: TetherBody | undefined
    for (const body of targets) {
      const hit = rayCircleHitDistance(shot.pos, direction, distance, body.pos, body.radius + 5)
      if (hit !== null && hit < distance) { distance = hit; target = body }
    }
    shot.pos = { x: shot.pos.x + direction.x * distance, y: shot.pos.y + direction.y * distance }
    shot.life -= dt
    if (distance < travel || target) impacts.push({ pos: { ...shot.pos }, direction, target })
    else if (shot.life > 0) remaining.push(shot)
  }
  return { shots: remaining, impacts }
}
