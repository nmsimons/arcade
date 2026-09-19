import type { BodyIdentity, TetherBody, Rock } from './types'

/** Effective gameplay values, shared by authoring, spawning, recovery and reload. */
export const CARGO_PHYSICS = {
  module: { radius: 23, mass: .65 },
  salvage: { radius: 22, mass: .65 },
  core: { radius: 27, mass: 1.8 },
} as const
export type CargoKind = keyof typeof CARGO_PHYSICS

/** Attach identity at construction; legacy ID fields remain renderer/save adapters. */
export function identifyBody<T extends TetherBody>(body: T, identity: BodyIdentity): T & { identity: BodyIdentity } {
  if (![body.radius, body.pos.x, body.pos.y, body.vel.x, body.vel.y].every(Number.isFinite) || body.radius <= 0) throw new Error('Invalid physical body')
  if ('id' in identity && !identity.id) throw new Error('A stable body ID is required')
  delete body.cargoId; delete body.sourceId; delete body.terminalId; delete body.botId
  switch (identity.type) {
    case 'cargo': Object.assign(body, CARGO_PHYSICS[identity.kind]); body.cargoId = identity.id; break
    case 'cell': body.sourceId = identity.id; body.kind = 'blue'; body.mass = (body.radius / 18) ** 2; break
    case 'terminal': body.terminalId = identity.id; body.anchored = true; break
    case 'bot': body.botId = identity.id; break
    case 'ship': body.mass = 1; break
    case 'asteroid': body.mass = Math.max(.25, (body.radius / 18) ** 2); break
  }
  if (body.mass !== undefined && (!Number.isFinite(body.mass) || body.mass <= 0)) throw new Error('Invalid body mass')
  return Object.assign(body, { identity })
}

export const isImmovable = (body: TetherBody) => !!(body.socketId || body.anchored || body.retrieving)
export const bodyMass = (body: TetherBody) => body.mass ?? (body.identity?.type === 'ship' || 'angle' in body ? 1 : Math.max(.25, (body.radius / 18) ** 2))
// The player winch historically floors small asteroid inertia at 1. Cargo and
// cells keep their authored mass; collision and maintenance-bot mass is unchanged.
export const playerTetherMass = (body: TetherBody) => isAsteroid(body) ? Math.max(1, bodyMass(body)) : bodyMass(body)
export const isAsteroid = (body: TetherBody) => body.identity ? body.identity.type === 'asteroid' : !!body.kind && !body.sourceId
export const isRock = (body: TetherBody): body is Rock => 'mesh' in body && 'angVel' in body && 'points' in body
