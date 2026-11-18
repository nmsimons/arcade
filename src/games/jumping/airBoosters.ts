import { footPoint } from './footwork.ts'
import type { Player } from './model.ts'
import { airBoostStrength } from './model.ts'
import { presentedAthletePose } from './athletePose.ts'
import type { Point } from './limbPose.ts'
import type { Leg } from './athleteRig.ts'
import { bodySize } from './sizeFrame.ts'
import { wallFrameAngle } from './wallFrame.ts'

/** Small exhaust plumes follow the posed feet, opposite the actual motor force.
 * Gravity, inherited momentum, contact impulses and zero-g drag supply no thrust. Body units, in the drawn frame.
 * Floating, the boots fire from their soles: the nozzles vector, leaning a plume from straight out of the sole
 * toward the exhaust by at most NOZZLE_SWING, so it never leaves the boot. */
/** One boot's exhaust: a plume of `length`, or a trim puff `puff` of the way through its life. */
export interface BootJet { x: number; y: number; direction: readonly [number, number]; length: number; alpha: number; puff?: number }
export function footBoosters(p: Player): BootJet[] {
  const thrust = airBoostStrength(p)
  if (thrust < .01) return []
  const x = -p.airBoost.x * p.facing, y = p.airBoost.lift, force = Math.hypot(x, y)
  const direction = [x / force, y / force] as const, exhaust = Math.atan2(direction[1], direction[0])
  const pose = presentedAthletePose(p), floating = (p.anim.float?.blend ?? 0) > .5
  /** A floating boot's nozzle: the middle of its sole, and the way it points, vectored toward the exhaust. */
  const nozzle = (leg: Leg) => {
    const sole = footPoint(SOLE, leg.footAngle * leg.footFacing, leg.toeAngle * leg.footFacing, false)
    // Straight out of the sole is along the shin, away from the knee.
    const out = Math.atan2(leg.end[1] - leg.joint[1], leg.end[0] - leg.joint[0])
    const swing = Math.atan2(Math.sin(exhaust - out), Math.cos(exhaust - out))
    const along = out + Math.max(-NOZZLE_SWING, Math.min(NOZZLE_SWING, swing))
    return { x: leg.end[0] + sole[0] * leg.footFacing, y: leg.end[1] + sole[1], direction: [Math.cos(along), Math.sin(along)] as const, swing }
  }
  // Trimming a slow drift, the boots do not burn: now and then each gives a short puff, a small grey-white cloud that
  // leaves the sole, swells and fades (TRIM_PUFF_*). `puff` is its age, 0 to 1.
  if (p.airBoost.trim) {
    const age = (p.airBoost.time % TRIM_PUFF_PERIOD) / TRIM_PUFF_LIFE
    if (!floating || age >= 1) return []
    const strength = Math.min(1, thrust / .35)
    return [pose.backLeg, pose.frontLeg].map(leg => ({ ...nozzle(leg), length: 0, alpha: TRIM_PUFF_ALPHA * (.6 + .4 * strength) * (1 - age), puff: age }))
  }
  const strength = thrust
  return [pose.backLeg, pose.frontLeg].map((leg, i) => {
    const angle = leg.footAngle * leg.footFacing, toeAngle = leg.toeAngle * leg.footFacing
    // Floating, the boots are the only thing moving the body, so they show more.
    const pulse = .9 + .1 * Math.sin(p.airBoost.time * 47 + i * 2.4), alpha = floating ? Math.min(.75, strength * (i ? .7 : .55)) : strength * (i ? .6 : .4)
    if (floating) {
      const { swing, ...jet } = nozzle(leg)
      // Thrust the nozzle cannot turn toward shows less flame.
      const share = Math.max(.5, Math.cos(Math.max(0, Math.abs(swing) - NOZZLE_SWING)))
      return { ...jet, length: (FLOAT_PLUME_BASE + strength * FLOAT_PLUME_REACH) * pulse * share, alpha }
    }
    // Select the outer edge of the shoe in the exhaust direction. This keeps
    // curled airborne feet attached to the jet without changing their pose.
    const edge = [[-2.5, 1.4], [.2, 2.8], [4.8, 2.5]].map(([px, py]) => {
      const point = footPoint([px, py], angle, toeAngle, px > 2.2)
      return [point[0] * leg.footFacing, point[1]] as const
    }).reduce((a, b) => a[0] * direction[0] + a[1] * direction[1] > b[0] * direction[0] + b[1] * direction[1] ? a : b)
    return { x: leg.end[0] + edge[0], y: leg.end[1] + edge[1], direction, length: (3 + strength * 4) * pulse, alpha }
  })
}
/** A floating body's plume: its length at the faintest thrust, and what full thrust adds (body units). */
const FLOAT_PLUME_BASE = 4, FLOAT_PLUME_REACH = 7.5
/** Trim puffs: one every TRIM_PUFF_PERIOD seconds, each visible for TRIM_PUFF_LIFE as it drifts out and fades, at
 * most TRIM_PUFF_ALPHA opaque. */
const TRIM_PUFF_PERIOD = .45, TRIM_PUFF_LIFE = .3, TRIM_PUFF_ALPHA = .65
/** The middle of the sole, in foot coordinates (footwork.ts). */
const SOLE: Point = [.2, 2.8]
const NOZZLE_SWING = Math.PI * .4

export function drawFootBoosters(ctx: CanvasRenderingContext2D, p: Player) {
  const jets = footBoosters(p)
  if (!jets.length) return
  // The athlete's own transform (athleteDraw.ts): a wall's quarter turn, the ceiling mirror and the body's size.
  const size = bodySize(p)
  ctx.save(); ctx.translate(p.x, p.y); if (p.wall) ctx.rotate(wallFrameAngle(p.wall)); ctx.scale(p.facing * size, (p.inverted ? -1 : 1) * size)
  for (const jet of jets) {
    ctx.save(); ctx.translate(jet.x, jet.y); ctx.rotate(Math.atan2(jet.direction[1], jet.direction[0]))
    if (jet.puff !== undefined) {
      // A wisp of gas: a soft cloud, bright at its heart and fading to nothing at its edge, that leaves the sole,
      // swells as it drifts clear of the boot and thins away (the alpha in `jet` already falls with age). A warm grey
      // band inside the edge keeps it readable on pale walls as well as dark ones.
      const age = jet.puff, radius = 2.5 + age * 5, at = 3 + age * 12
      ctx.globalAlpha *= jet.alpha * (1 - age)
      const gas = ctx.createRadialGradient?.(at, 0, 0, at, 0, radius)
      if (gas) {
        gas.addColorStop(0, 'rgba(255, 252, 246, 1)'); gas.addColorStop(.5, 'rgba(206, 199, 188, .75)'); gas.addColorStop(1, 'rgba(206, 199, 188, 0)')
        ctx.fillStyle = gas
      } else ctx.fillStyle = '#e6e1d8'
      ctx.beginPath(); ctx.arc(at, 0, radius, 0, Math.PI * 2); ctx.fill()
      ctx.restore(); continue
    }
    const plume = (length: number, width: number, color: string, alpha: number) => {
      ctx.globalAlpha *= alpha; ctx.fillStyle = color; ctx.beginPath()
      ctx.moveTo(0, -width); ctx.quadraticCurveTo(length * .5, -width * .7, length, 0)
      ctx.quadraticCurveTo(length * .5, width * .7, 0, width); ctx.closePath(); ctx.fill()
    }
    ctx.save(); plume(jet.length, 1.6, '#c58b68', jet.alpha * .45); ctx.restore()
    plume(jet.length * .65, .65, '#ecd4ad', jet.alpha)
    ctx.restore()
  }
  ctx.restore()
}
