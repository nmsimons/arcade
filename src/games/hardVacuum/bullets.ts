import type { Bullet, Harpoon, Rock, RockKind, Ship, Vector2 } from './types'
import { clamp } from './math.ts'
import { isInsideCavern, type CavernMap } from './worldGeometry.ts'
import { repelBlueBody } from './expeditionPhysics.ts'

type Ref<T> = { current: T }

type ToroidalDelta = (ax: number, ay: number, bx: number, by: number, w: number, h: number) => { dx: number; dy: number }

type BuildRopeBetween = (
  ax: number,
  ay: number,
  bx: number,
  by: number,
  ropeLen: number,
) => { rope: { x: number; y: number }[]; ropePrev: { x: number; y: number }[]; segLen: number }

export function updateBulletsAndPlayerRockCollisions(args: {
  dt: number
  w: number
  h: number

  bulletsRef: Ref<Bullet[]>
  rocksRef: Ref<Rock[]>
  harpoonRef: Ref<Harpoon>
  shipRef: Ref<Ship>
  cavernMap: CavernMap

  toroidalDelta: ToroidalDelta
  buildRopeBetween: BuildRopeBetween

  sounds: { explosion: (size: 'small' | 'medium' | 'large') => void }

  onRedRockDetonate?: (rock: Rock) => void
  onAsteroidDestroyed?: (rock: Rock) => void

  createRock: (x: number, y: number, radius: number, velOverride?: Vector2, kind?: RockKind) => Rock
  createDebris: (x: number, y: number, vx: number, vy: number, count: number, life: number, color: string) => void

  levelRef: Ref<number>
  blueRocksSpawnedThisLevelRef: Ref<number>
  blueRockQuotaRef: Ref<number>

  SMALLEST_ROCK_RADIUS: number

  HARPOON_VISUAL_SLACK: number

  BLUE_ROCK_SPAWN_CHANCE_BASE: number
  BLUE_ROCK_SPAWN_CHANCE_PER_LEVEL: number
  BLUE_ROCK_SPAWN_CHANCE_MAX: number

  RED_ROCK_SPAWN_CHANCE: number
}) {
  const {
    dt,
    w,
    h,
    bulletsRef,
    rocksRef,
    harpoonRef,
    shipRef,
    cavernMap,
    toroidalDelta,
    buildRopeBetween,
    sounds,
    onRedRockDetonate,
    onAsteroidDestroyed,
    createRock,
    createDebris,
    levelRef,
    blueRocksSpawnedThisLevelRef,
    blueRockQuotaRef,
    SMALLEST_ROCK_RADIUS,
    HARPOON_VISUAL_SLACK,
    BLUE_ROCK_SPAWN_CHANCE_BASE,
    BLUE_ROCK_SPAWN_CHANCE_PER_LEVEL,
    BLUE_ROCK_SPAWN_CHANCE_MAX,

    RED_ROCK_SPAWN_CHANCE,
  } = args

  // Projectiles expire when they strike the cavern boundary.
  bulletsRef.current = bulletsRef.current.filter((bullet) => {
    bullet.pos.x += bullet.vel.x * dt
    bullet.pos.y += bullet.vel.y * dt
    bullet.life -= dt * 1000

    return bullet.life > 0 && isInsideCavern(bullet.pos, 0, cavernMap)
  })

  // Collision detection: player bullets vs boss/rocks
  bulletsRef.current = bulletsRef.current.filter((bullet) => {
    if (bullet.isEnemy) return true

    for (let i = 0; i < rocksRef.current.length; i++) {
      const rock = rocksRef.current[i]
      const d = toroidalDelta(bullet.pos.x, bullet.pos.y, rock.pos.x, rock.pos.y, w, h)
      const dist = Math.hypot(d.dx, d.dy)
      if (dist <= rock.radius + 2) {
        if (repelBlueBody(rock, bullet.vel)) return false

        if (rock.kind === 'red') {
          // Delegate to main simulation for proper AOE damage.
          onRedRockDetonate?.(rock)
          return false
        }

        // If harpoon was attached to this rock, release it.
        const hp = harpoonRef.current
        if (hp.state === 'attached' && hp.rock === rock) {
          const ship = shipRef.current
          const ropeLength = hp.maxLength * HARPOON_VISUAL_SLACK
          const seed = buildRopeBetween(ship.pos.x, ship.pos.y, rock.pos.x, rock.pos.y, ropeLength)
          harpoonRef.current = {
            state: 'deployed',
            pos: { x: rock.pos.x, y: rock.pos.y },
            vel: { x: 0, y: 0 },
            maxLength: hp.maxLength,
            ropeLength,
            segLen: seed.segLen,
            rope: seed.rope,
            ropePrev: seed.ropePrev,
          }
        }
        rocksRef.current.splice(i, 1)
        onAsteroidDestroyed?.(rock)

        // Play explosion sound based on size
        const explosionSize = rock.radius > 35 ? 'large' : rock.radius > 20 ? 'medium' : 'small'
        sounds.explosion(explosionSize)

        // Split rock or create debris for smallest ones
        if (rock.radius > SMALLEST_ROCK_RADIUS) {
          const newRadius = rock.radius / 2
          for (let j = 0; j < 2; j++) {
            let kind: RockKind = 'normal'
            if (newRadius <= SMALLEST_ROCK_RADIUS) {
              if (levelRef.current >= 3) {
                if (blueRocksSpawnedThisLevelRef.current < blueRockQuotaRef.current) {
                  kind = 'blue'
                  blueRocksSpawnedThisLevelRef.current += 1
                } else {
                  const p = clamp(
                    BLUE_ROCK_SPAWN_CHANCE_BASE + (levelRef.current - 1) * BLUE_ROCK_SPAWN_CHANCE_PER_LEVEL,
                    BLUE_ROCK_SPAWN_CHANCE_BASE,
                    BLUE_ROCK_SPAWN_CHANCE_MAX,
                  )
                  if (Math.random() < p) {
                    kind = 'blue'
                    blueRocksSpawnedThisLevelRef.current += 1
                  }
                }
              }

              if (kind === 'normal' && Math.random() < RED_ROCK_SPAWN_CHANCE) {
                kind = 'red'
              }
            }

            rocksRef.current.push(createRock(rock.pos.x, rock.pos.y, newRadius, undefined, kind))
          }
        } else {
          // Smallest rock destroyed - create particle debris
          createDebris(rock.pos.x, rock.pos.y, rock.vel.x, rock.vel.y, 5, 0.5, '255, 255, 255')
        }
        return false
      }
    }
    return true
  })
}
