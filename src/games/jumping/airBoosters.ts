import { athletePose } from './athlete.ts'
import { footPoint } from './footwork.ts'
import type { Player } from './model.ts'
import { airBoostStrength } from './model.ts'

/** Small exhaust plumes follow the posed feet, opposite the actual motor force.
 * Gravity, inherited momentum, contact impulses and zero-g drag supply no thrust. */
export function footBoosters(p: Player) {
  const strength = airBoostStrength(p)
  if (strength < .01) return []
  const x = -p.airBoost.x * p.facing, y = p.airBoost.lift, force = Math.hypot(x, y)
  const direction = [x / force, y / force] as const
  const pose = athletePose(p)
  return [pose.backLeg, pose.frontLeg].map((leg, i) => {
    const angle = leg.footAngle * leg.footFacing, toeAngle = leg.toeAngle * leg.footFacing
    // Select the outer edge of the shoe in the exhaust direction. This keeps
    // curled airborne feet attached to the jet without changing their pose.
    const edge = [[-2.5, 1.4], [.2, 2.8], [4.8, 2.5]].map(([px, py]) => {
      const point = footPoint([px, py], angle, toeAngle, px > 2.2)
      return [point[0] * leg.footFacing, point[1]] as const
    }).reduce((a, b) => a[0] * direction[0] + a[1] * direction[1] > b[0] * direction[0] + b[1] * direction[1] ? a : b)
    const pulse = .9 + .1 * Math.sin(p.airBoost.time * 47 + i * 2.4)
    return { x: leg.end[0] + edge[0], y: leg.end[1] + edge[1], direction,
      length: (3 + strength * 4) * pulse, alpha: strength * (i ? .6 : .4) }
  })
}

export function drawFootBoosters(ctx: CanvasRenderingContext2D, p: Player) {
  const jets = footBoosters(p)
  if (!jets.length) return
  ctx.save(); ctx.translate(p.x, p.y); ctx.scale(p.facing, p.inverted ? -1 : 1)
  for (const jet of jets) {
    ctx.save(); ctx.translate(jet.x, jet.y); ctx.rotate(Math.atan2(jet.direction[1], jet.direction[0]))
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
