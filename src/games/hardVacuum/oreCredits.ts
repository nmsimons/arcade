import type { Rock, Vector2 } from './types'
import { BASE_POSITION } from './stationDefinitions.ts'
import { CREDITS_ASTEROID_BASE, CREDITS_ASTEROID_SIZE_BONUS, CREDITS_BASE_PROCESSING_MULTIPLIER, CREDITS_BLUE_ROCK_MULTIPLIER, MINING_BASE_RADIUS } from './tuning.ts'

type Ore = Pick<Rock, 'kind' | 'radius' | 'sourceId' | 'socketId'>
type PositionedOre = Ore & { pos: Vector2 }
const haven = { pos: BASE_POSITION, radius: MINING_BASE_RADIUS }

export function asteroidFieldCredits(rock: Ore): number {
  if (rock.sourceId || rock.socketId) return 0
  const ordinary = CREDITS_ASTEROID_BASE + Math.max(0, Math.round((rock.radius - 20) * CREDITS_ASTEROID_SIZE_BONUS))
  return ordinary * (rock.kind === 'blue' ? CREDITS_BLUE_ROCK_MULTIPLIER : 1)
}
export const inOreProcessingZone = (rock: PositionedOre, base = haven) =>
  Math.hypot(rock.pos.x - base.pos.x, rock.pos.y - base.pos.y) < base.radius - rock.radius * 0.7

/** Call only after removing an asteroid. Location decides the reward and account,
 * whether it was destroyed by the laser, a blast, an explosion or a base gun. */
export function creditAsteroidDestruction(state: { credits: number; banked: number }, rock: PositionedOre, base = haven): number {
  const atBase = inOreProcessingZone(rock, base)
  const credits = asteroidFieldCredits(rock) * (atBase ? CREDITS_BASE_PROCESSING_MULTIPLIER : 1)
  if (atBase) state.banked += credits
  else state.credits += credits
  return credits
}
