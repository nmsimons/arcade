import { worldDelta } from './worldDelta.ts'
import { fragmentKindFor } from './debrisField.ts'
import type { Bullet, Harpoon, Rock, RockKind, Ship, Vector2 } from './types'
import { isInsideCavern, type CavernMap } from './worldGeometry.ts'
import { repelBlueBody } from './expeditionPhysics.ts'

type Ref<T> = { current: T }

type BuildRopeBetween = (
  ax: number,
  ay: number,
  bx: number,
  by: number,
  ropeLen: number,
) => { rope: { x: number; y: number }[]; ropePrev: { x: number; y: number }[]; segLen: number }

export function updateBulletsAndPlayerRockCollisions(args: {
  dt: number

  bulletsRef: Ref<Bullet[]>
  rocksRef: Ref<Rock[]>
  harpoonRef: Ref<Harpoon>
  shipRef: Ref<Ship>
  cavernMap: CavernMap

  buildRopeBetween: BuildRopeBetween

  sounds: { explosion: (size: 'small' | 'medium' | 'large') => void }

  onRedRockDetonate?: (rock: Rock) => void
  onAsteroidDestroyed?: (rock: Rock) => void
  fragmentKind?: (rock: Rock, roll: number) => RockKind
  random?: () => number

  createRock: (x: number, y: number, radius: number, velOverride?: Vector2, kind?: RockKind) => Rock
  createDebris: (x: number, y: number, vx: number, vy: number, count: number, life: number, color: string) => void

  SMALLEST_ROCK_RADIUS: number

  HARPOON_VISUAL_SLACK: number

}) {
  const {
    dt,

    bulletsRef,
    rocksRef,
    harpoonRef,
    shipRef,
    cavernMap,

    buildRopeBetween,
    sounds,
    onRedRockDetonate,
    onAsteroidDestroyed,
    fragmentKind = fragmentKindFor,
    random = Math.random,
    createRock,
    createDebris,

    SMALLEST_ROCK_RADIUS,
    HARPOON_VISUAL_SLACK,

  } = args

  // Projectiles expire when they strike the cavern boundary.
  bulletsRef.current = bulletsRef.current.filter((bullet) => {
    bullet.pos.x += bullet.vel.x * dt
    bullet.pos.y += bullet.vel.y * dt
    bullet.life -= dt * 1000

    return bullet.life > 0 && isInsideCavern(bullet.pos, 0, cavernMap)
  })

  // Collision detection: demonstration bullets vs asteroids
  bulletsRef.current = bulletsRef.current.filter((bullet) => {
    if (bullet.isEnemy) return true

    for (let i = 0; i < rocksRef.current.length; i++) {
      const rock = rocksRef.current[i]
      const d = worldDelta(bullet.pos.x, bullet.pos.y, rock.pos.x, rock.pos.y)
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
            if (newRadius <= SMALLEST_ROCK_RADIUS && fragmentKind) kind=fragmentKind(rock,random())

            const fragment=createRock(rock.pos.x,rock.pos.y,newRadius,undefined,kind)
            fragment.fragmentRates=rock.fragmentRates
            rocksRef.current.push(fragment)
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
