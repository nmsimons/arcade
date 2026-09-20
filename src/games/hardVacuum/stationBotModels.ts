import { bevel, drawModel } from './objectModels.ts'
import type { Outline, Part } from './objectModels'
import { clamp, rotX, rotY, rotZ } from './math.ts'
import { BOT_DAMAGE_SITES, botDamage } from './stationBots.ts'
import type { StationBot } from './stationBots'
import type { V3, Vector2 } from './types'

const BRASS = '#cec3a3'
const ARMOR = '#c7b3a8'

// One continuous shell per chassis. Character comes from the silhouette and
// working tool, not stacked armor, exposed pivots, or decorative machinery.
const TUG_HULL = bevel(
  [[9,8],[3,14],[-15,14],[-21,7],[-21,-7],[-15,-14],[3,-14],[9,-8]],
  [[6,6],[1,11],[-13,11],[-18,6],[-18,-6],[-13,-11],[1,-11],[6,-6]], BRASS, 3.5, -4)
const TUG_SENSOR = bevel(
  [[3,4],[1,6],[-1,4],[-1,-4],[1,-6],[3,-4]],
  [[2.5,3.5],[1,5],[-.5,3.5],[-.5,-3.5],[1,-5],[2.5,-3.5]], BRASS, -4, -7, true)

const WATCH_HULL = bevel(
  [[23,0],[-10,15],[-20,9],[-15,0],[-20,-9],[-10,-15]],
  [[19,0],[-9,11],[-16,7],[-12,0],[-16,-7],[-9,-11]], ARMOR, 3.5, -4)
const WATCH_SENSOR = bevel(
  [[6,3],[1,6],[1,-6],[6,-3]],
  [[5,2.5],[1.5,4.7],[1.5,-4.7],[5,-2.5]], ARMOR, -4, -7, true)
const WATCH_MUZZLE = bevel(
  [[23,0],[19,1.8],[19,-1.8]],
  [[22.5,0],[19.8,1],[19.8,-1]], '#6f827a', -2, -3.5)

const TUG_ARMS = [-1, 1].map(side => {
  // Short, broad jaws supply the tug's forked silhouette. Their roots disappear
  // under the shell; no separate hinge caps or winch assembly are needed.
  const mirror = (points: Outline): Outline => side === 1 ? points : points.map(([x, y]) => [x, -y] as const).reverse()
  return {
    ...bevel(
      mirror([[-1,-2],[13,-2],[13,-5],[17,-5],[17,3],[-1,3]]),
      mirror([[0,-1],[14,-1],[14,-4],[16,-4],[16,2],[0,2]]), BRASS, 2.5, -2.5),
    at: [5, side * 10, 0] as V3,
  }
})
// Fine cracks, not extra armor outlines. Darkening and the existing progressive
// spark showers carry most of the damage read at native game scale.
const DAMAGE = bevel(
  [[-3,-2.2],[-.2,-.8],[-1,1.2],[2.8,2.8],[.2,2],[-2,.7]],
  [[-2.7,-1.9],[-.5,-.8],[-1.3,1.2],[2.3,2.5],[.3,1.7],[-1.7,.5]], '#96694d', 0, -.3)
const BREACHES: Part[] = BOT_DAMAGE_SITES.map(site => ({
  ...DAMAGE, at: [...site.point], rotation: [0, 0, site.angle],
}))
function scorchedColor(color: string, damage: number) {
  const char = [88, 75, 65], amount = damage * .72
  return '#' + [1, 3, 5].map((offset, i) => {
    const channel = parseInt(color.slice(offset, offset + 2), 16)
    return Math.round(channel + (char[i] - channel) * amount).toString(16).padStart(2, '0')
  }).join('')
}

/** Pure presentation: no new animation state, random draws, or physics writes. */
export function stationBotAppearance(bot: StationBot, time: number) {
  const tug = bot.botKind === 'tug', active = bot.phase !== 'offline'
  const damage = botDamage(bot.health)
  const charging = bot.phase === 'charge' || bot.phase === 'burst'
  const flicker = active && damage.amount >= .35 && Math.sin(time * 23 + bot.botId.length) * Math.sin(time * 7) > .9 - damage.amount * .9
  const sensorColor = !active ? '#4a5a54' : bot.phase === 'boot' ? '#cbb679' : charging ? '#ff795f' : tug ? '#e4c17d' : '#eaa183'
  const hull = tug ? TUG_HULL : WATCH_HULL
  let parts: Part[] = [hull]
  if (tug) {
    const spread = bot.target || bot.maintenance?.hook ? -.18 : bot.maintenance?.windup !== undefined ? .2 : 0
    parts.push(...TUG_ARMS.map((part, i) => ({ ...part, rotation: [0, 0, (i === 0 ? -1 : 1) * spread] as V3 })))
  } else {
    parts.push({ ...WATCH_MUZZLE, color: charging ? '#ff9679' : WATCH_MUZZLE.color, glow: active && charging })
  }
  if (damage.amount > 0) parts = parts.map(part => part.glow ? part : { ...part, color: scorchedColor(part.color, damage.amount) })
  parts.push({ ...(tug ? TUG_SENSOR : WATCH_SENSOR), color: flicker ? '#655342' : sensorColor, glow: active && !flicker },
    ...BREACHES.slice(0, damage.stage))
  const mobile = active && bot.phase !== 'boot' && !bot.anchored && bot.stun <= 0
  const forward = mobile ? bot.vel.x * Math.cos(bot.angle) + bot.vel.y * Math.sin(bot.angle) : 0
  const sideways = mobile ? -bot.vel.x * Math.sin(bot.angle) + bot.vel.y * Math.cos(bot.angle) : 0
  const thrust = clamp(forward / (tug ? 185 : 95), 0, 1)
  const bank = clamp(sideways / 100, -1, 1)
  const angles: V3 = [bank * .12, -thrust * .12, bot.angle]
  return { parts, angles, thrust, bank, active, damage, engineX: tug ? -21 : -18, engineY: tug ? 4.5 : 7, turnY: tug ? 14 : 15 }
}

export function drawStationBotModel(ctx: CanvasRenderingContext2D, bot: StationBot, time: number) {
  if (bot.health <= 0) return
  const appearance = stationBotAppearance(bot, time)
  const { parts, angles, thrust, bank, active, engineX, engineY, turnY } = appearance
  const project = (point: V3): Vector2 => {
    const p = rotZ(rotY(rotX(point, angles[0]), angles[1]), angles[2]), scale = 420 / (420 + p[2])
    return { x: p[0] * scale, y: p[1] * scale }
  }
  const trace = (points: V3[], closed = false) => {
    ctx.beginPath()
    points.map(project).forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y))
    if (closed) ctx.closePath()
  }
  ctx.save(); ctx.translate(bot.pos.x, bot.pos.y)
  ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.shadowBlur = 0
  ctx.globalAlpha *= active ? 1 : .55
  for (const side of [-1, 1]) {
    if (thrust < .045) continue
    const y = side * engineY
    const length = (8 + 12 * thrust) * (1 + Math.sin(time * 43 + side * 1.7) * .12)
    trace([[engineX, y - 1.5, 0], [engineX - length, y, 0], [engineX, y + 1.5, 0]], true)
    ctx.fillStyle = '#ffb45c18'; ctx.fill(); ctx.strokeStyle = '#ffb86b'; ctx.lineWidth = 1.2
    ctx.shadowColor = '#ffad6540'; ctx.shadowBlur = 4; ctx.stroke()
    trace([[engineX, y, 0], [engineX - length * .55, y, 0]])
    ctx.strokeStyle = '#fff0cd'; ctx.lineWidth = 1; ctx.shadowBlur = 0; ctx.stroke()
  }
  if (Math.abs(bank) > .15) {
    const side = Math.sign(bank), y = side * turnY
    trace([[-11, y, 0], [-11, y + side * (2 + Math.abs(bank) * 4), 0]])
    ctx.strokeStyle = '#ffe1ad'; ctx.lineWidth = 1; ctx.stroke()
  }
  drawModel(ctx, { x: 0, y: 0 }, parts, angles, time, 1, Math.max(bot.flash, bot.laserGlow ?? 0))
  for (const side of [-1, 1]) {
    trace([[engineX, side * engineY - 1.2, -1], [engineX, side * engineY + 1.2, -1]])
    ctx.strokeStyle = thrust > .045 ? '#ffe1ad' : '#687b70'; ctx.lineWidth = 1.3; ctx.shadowBlur = 0; ctx.stroke()
  }
  ctx.restore()
}
