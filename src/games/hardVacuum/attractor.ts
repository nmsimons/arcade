import type { Rock } from './types'

type Ref<T> = { current: T }

type ToroidalDelta = (ax: number, ay: number, bx: number, by: number, w: number, h: number) => { dx: number; dy: number }

type SetState<T> = (value: T | ((prev: T) => T)) => void

export function updateAttractorBeam(args: {
  dt: number
  w: number
  h: number

  attractorActive: boolean
  attractorTimer: number
  setAttractorTimer: SetState<number>
  setAttractorActive: SetState<boolean>

  miningBaseAngle: number

  rocksRef: Ref<Rock[]>
  toroidalDelta: ToroidalDelta

  MINING_BASE_RADIUS: number
  ATTRACTOR_BEAM_RANGE_MULTIPLIER: number
  ATTRACTOR_BEAM_STRENGTH: number
}) {
  const {
    dt,
    w,
    h,
    attractorActive,
    attractorTimer,
    setAttractorTimer,
    setAttractorActive,
    miningBaseAngle,
    rocksRef,
    toroidalDelta,
    MINING_BASE_RADIUS,
    ATTRACTOR_BEAM_RANGE_MULTIPLIER,
    ATTRACTOR_BEAM_STRENGTH,
  } = args

  // Attractor Beam: when active, apply strong gravity to rocks within fan-shaped zones from 3 gates
  if (!attractorActive) return

  // If we ever get desynced (active but empty), force off.
  if (attractorTimer <= 0) {
    if (attractorTimer !== 0) setAttractorTimer(0)
    setAttractorActive(false)
    return
  }

  // Decrement timer and auto-deactivate when it expires.
  const nextTimer = Math.max(0, attractorTimer - dt)
  if (nextTimer !== attractorTimer) setAttractorTimer(nextTimer)
  if (nextTimer === 0) {
    setAttractorActive(false)
    return
  }

  const baseX = w / 2
  const baseY = h / 2
  const baseAng = miningBaseAngle
  const attractorRange = MINING_BASE_RADIUS * ATTRACTOR_BEAM_RANGE_MULTIPLIER
  const attractorStrength = ATTRACTOR_BEAM_STRENGTH

  // 3 gates: doors are centered at vertices 1, 3, 5
  const doorVertices = [1, 3, 5]
  for (const vertIdx of doorVertices) {
    // Angle to door vertex
    const gateAngle = baseAng + (vertIdx / 6) * Math.PI * 2
    const fanAngleSpread = Math.PI / 3.5 // ~51 degree fan (wider coverage)

    // Apply gravity to rocks in this fan
    for (const rock of rocksRef.current) {
      const d = toroidalDelta(baseX, baseY, rock.pos.x, rock.pos.y, w, h)
      const distToBase = Math.hypot(d.dx, d.dy)

      // Check if within range (outside base but within beam range)
      if (distToBase > attractorRange || distToBase < MINING_BASE_RADIUS + rock.radius) continue

      // Check if within fan angle
      const angleToRock = Math.atan2(d.dy, d.dx)
      let angleDiff = angleToRock - gateAngle
      // Normalize angle difference to [-π, π]
      while (angleDiff > Math.PI) angleDiff -= Math.PI * 2
      while (angleDiff < -Math.PI) angleDiff += Math.PI * 2

      if (Math.abs(angleDiff) <= fanAngleSpread / 2) {
        // Apply exponentially increasing gravity towards base center
        // Starts slow at range, becomes extremely strong near center to hold rocks
        const distFromEdge = distToBase - MINING_BASE_RADIUS
        const maxRange = attractorRange - MINING_BASE_RADIUS
        const normalizedDist = Math.max(0, Math.min(1, distFromEdge / maxRange))
        // Stronger exponential curve: weak at 1.0 (far), extremely strong at 0.0 (close)
        const exponentialFactor = Math.pow(normalizedDist, 2.5)
        const gravityMag = (attractorStrength * (1 - exponentialFactor)) / Math.max(1, distFromEdge)
        const ux = -d.dx / distToBase
        const uy = -d.dy / distToBase
        rock.vel.x += ux * gravityMag * dt
        rock.vel.y += uy * gravityMag * dt
      }
    }
  }
}
