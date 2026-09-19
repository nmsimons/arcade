import { worldDelta } from './worldDelta.ts'
import type { BaseShot, Rock } from './types'
import type { Expedition } from './expedition'
import { repelBlueBody } from './expeditionPhysics.ts'
import { BASE_GUN_FIRE_COOLDOWN } from './tuning.ts'
import { creditAsteroidDestruction, inOreProcessingZone } from './oreCredits.ts'

type Ref<T> = { current: T }

type CreateDebris = (
  x: number,
  y: number,
  vx: number,
  vy: number,
  count: number,
  speedMult: number,
  color: string,
) => void

export function updateBaseDefenseAndProcessing(args: {
  dt: number

  baseX: number
  baseY: number

  MINING_BASE_RADIUS: number

  miningBaseAngleRef: Ref<number>
  miningGunCooldownsRef: Ref<[number, number, number]>

  baseShotsRef: Ref<BaseShot[]>
  rocksRef: Ref<Rock[]>

  expedition: Pick<Expedition, 'banked' | 'credits'>
  
  createDebris: CreateDebris
  onRedRockDetonate?: (rock: Rock) => void
  sounds?: { collect: () => void }
}) {
  const {
    dt,

    baseX,
    baseY,
    MINING_BASE_RADIUS,
    miningBaseAngleRef,
    miningGunCooldownsRef,
    baseShotsRef,
    rocksRef,

    expedition,
    
    createDebris,
    onRedRockDetonate,
  } = args

  const rocks = rocksRef.current
  const base = { pos: { x: baseX, y: baseY }, radius: MINING_BASE_RADIUS }

  // Track how long each rock has been fully inside the base.
  // Processing is handled by base guns (shots), not automatically.
  let targetIndex = -1
  let targetDist = Infinity
  for (let i = 0; i < rocks.length; i++) {
    const a = rocks[i]
    // Power cells stay intact; blue asteroids are valuable ore.
    if (a.sourceId || a.socketId) continue
    const d = worldDelta(baseX, baseY, a.pos.x, a.pos.y)
    const isInProcessingZone = inOreProcessingZone(a, base)
    if (!isInProcessingZone) {
      a.inBaseTime = 0
      continue
    }
    a.inBaseTime = (a.inBaseTime ?? 0) + dt
    if (a.inBaseTime < 1) continue
    const dd = d.dx * d.dx + d.dy * d.dy
    if (dd < targetDist) {
      targetDist = dd
      targetIndex = i
    }
  }

  // Base guns: three simple dots that shoot rocks eligible for processing.
  // Guns are attached to the rotating base and fire inward.
  {
    // Update gun cooldowns.
    const cds = miningGunCooldownsRef.current
    for (let i = 0; i < 3; i++) cds[i] = Math.max(0, cds[i] - dt)

    if (targetIndex >= 0) {
      const target = rocks[targetIndex]
      const shotSpeed = 520
      const fireCooldown = BASE_GUN_FIRE_COOLDOWN

      // Choose three gun positions in base-local space, rotated with the base.
      // Place them slightly inside the hull on the three solid arms.
      const gunRadius = MINING_BASE_RADIUS * 0.63
      const baseAng = miningBaseAngleRef.current
      const gunAngles = [baseAng + 0, baseAng + (2 * Math.PI) / 3, baseAng + (4 * Math.PI) / 3]

      for (let gi = 0; gi < 3; gi++) {
        if (cds[gi] > 0) continue

        const gx = (baseX + Math.cos(gunAngles[gi]) * gunRadius)
        const gy = (baseY + Math.sin(gunAngles[gi]) * gunRadius)

        const td = worldDelta(gx, gy, target.pos.x, target.pos.y)
        const tl = Math.hypot(td.dx, td.dy)
        if (tl < 1e-6) continue
        const vx = (td.dx / tl) * shotSpeed
        const vy = (td.dy / tl) * shotSpeed

        baseShotsRef.current.push({ pos: { x: gx, y: gy }, vel: { x: vx, y: vy }, life: 0.9 })
        cds[gi] = fireCooldown
      }
    }
  }

  // Update base shots.
  baseShotsRef.current = baseShotsRef.current
    .map((s) => {
      s.pos.x = (s.pos.x + s.vel.x * dt)
      s.pos.y = (s.pos.y + s.vel.y * dt)
      s.life -= dt
      return s
    })
    .filter((s) => s.life > 0)

  // Base shots hit rocks (processing). Only affects rocks, not the ship.
  if (baseShotsRef.current.length > 0 && rocksRef.current.length > 0) {
    const shots = baseShotsRef.current
    const rocks2 = rocksRef.current
    for (let si = shots.length - 1; si >= 0; si--) {
      const sh = shots[si]
      for (let ai = rocks2.length - 1; ai >= 0; ai--) {
        const a = rocks2[ai]
        const d = worldDelta(sh.pos.x, sh.pos.y, a.pos.x, a.pos.y)
        if (Math.hypot(d.dx, d.dy) <= a.radius + 2) {
          if (a.sourceId || a.socketId) {
            repelBlueBody(a, sh.vel)
            shots.splice(si, 1)
            break
          }
          if (a.kind === 'red') {
            shots.splice(si, 1)
            onRedRockDetonate?.(a)
            break
          }

          // Process rock on hit.
          shots.splice(si, 1)
          rocks2.splice(ai, 1)

          creditAsteroidDestruction(expedition, a, base)
          createDebris((a.pos.x), (a.pos.y), 0, 0, 12, 0.8, '0, 255, 136')
          args.sounds?.collect()
          break
        }
      }
    }
  }
}
