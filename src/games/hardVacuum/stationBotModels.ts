import { bevel, drawModel } from './objectModels.ts'
import type { Outline, Part } from './objectModels'
import { clamp, rotX, rotY, rotZ } from './math.ts'
import { BOT_DAMAGE_SITES, botDamage } from './stationBots.ts'
import type { StationBot } from './stationBots'
import type { V3, Vector2 } from './types'

const BRASS = '#cbb78b'
const ARMOR = '#c4aca0'
const FRAME = '#8fa99c'
const RECESS = '#4e6865'

const TUG_HULL = bevel(
  [[14,0],[10,11],[-3,16],[-16,12],[-20,5],[-20,-5],[-16,-12],[-3,-16],[10,-11]],
  [[11,0],[8,8],[-3,11],[-14,9],[-17,4],[-17,-4],[-14,-9],[-3,-11],[8,-8]], BRASS, 4, -4)
const TUG_DECK = bevel(
  [[7,0],[3,7],[-9,8],[-14,3],[-14,-3],[-9,-8],[3,-7]],
  [[5,0],[1,4.5],[-8,5.5],[-11,2],[-11,-2],[-8,-5.5],[1,-4.5]], '#e0d1b0', -4, -7)
const TUG_SENSOR_MOUNT = bevel(
  [[13,0],[8,6],[3,5],[2,0],[3,-5],[8,-6]],
  [[11,0],[7,4.5],[4,3.5],[3,0],[4,-3.5],[7,-4.5]], RECESS, -4, -7.5)
const TUG_SENSOR = bevel(
  [[10,0],[7,3.8],[5,3],[4.5,0],[5,-3],[7,-3.8]],
  [[9,0],[6.5,2.6],[5.5,2],[5,0],[5.5,-2],[6.5,-2.6]], BRASS, -7.5, -8.5, true)
const WINCH = bevel(
  [[-2,3],[-10,3],[-12,1],[-12,-1],[-10,-3],[-2,-3]],
  [[-3,2],[-9,2],[-10,1],[-10,-1],[-9,-2],[-3,-2]], RECESS, -7, -8.5)
const WINCH_RIBS = [-8, -5].map(x => ({
  ...bevel([[-.7,-2.5],[.7,-2.5],[.7,2.5],[-.7,2.5]], [[-.4,-2],[.4,-2],[.4,2],[-.4,2]], FRAME, -8.5, -9),
  at: [x, 0, 0] as V3,
}))

const WATCH_HULL = bevel(
  [[20,0],[7,10],[-4,17],[-15,13],[-20,5],[-17,0],[-20,-5],[-15,-13],[-4,-17],[7,-10]],
  [[16,0],[5,7],[-4,12],[-13,10],[-16,4],[-14,0],[-16,-4],[-13,-10],[-4,-12],[5,-7]], ARMOR, 3.5, -3.5)
const WATCH_SPINE = bevel(
  [[12,0],[2,5],[-10,5],[-15,0],[-10,-5],[2,-5]],
  [[9,0],[1,3],[-9,3],[-12,0],[-9,-3],[1,-3]], '#e1c7b8', -3.5, -6.5)
const WATCH_SENSOR_MOUNT = bevel(
  [[7,0],[2,4],[-4,3],[-6,0],[-4,-3],[2,-4]],
  [[5.5,0],[1.5,3],[-3.5,2],[-4.5,0],[-3.5,-2],[1.5,-3]], RECESS, -6.5, -8)
const WATCH_SENSOR = bevel(
  [[5,0],[1,2.6],[-2.5,1.8],[-3.5,0],[-2.5,-1.8],[1,-2.6]],
  [[4,0],[.5,1.7],[-2,1],[-2.5,0],[-2,-1],[.5,-1.7]], ARMOR, -8, -9, true)
const BARREL = bevel(
  [[23,0],[21,3],[11,3.5],[8,0],[11,-3.5],[21,-3]],
  [[22,0],[20,1.6],[12,2],[10,0],[12,-2],[20,-1.6]], FRAME, 0, -4.5)
const BARREL_BORE = bevel(
  [[24,0],[21,1.7],[18,1.4],[18,-1.4],[21,-1.7]],
  [[23,0],[21,1],[19,1],[19,-1],[21,-1]], '#536764', -4.5, -5.2)

function engines(tug: boolean): Part[] {
  return [-1, 1].map(side => ({
    ...bevel(
      [[-23,-1.8],[-20,-3.5],[-7,-3],[-4,0],[-7,3],[-20,3.5],[-23,1.8]],
      [[-22,-1],[-19,-2.2],[-8,-1.8],[-6,0],[-8,1.8],[-19,2.2],[-22,1]], FRAME, 3, -3),
    at: [0, side * (tug ? 12.5 : 11.5), 0] as V3,
  }))
}
const TUG_ENGINES = engines(true)
const WATCH_ENGINES = engines(false)
const WATCH_CHEEKS = [-1, 1].map(side => {
  const outline: Outline = [[-9,7],[-3,6],[9,5],[4,10],[-4,13],[-12,10]]
  const inset: Outline = [[-8,8],[-3,7],[6,6.5],[3,9],[-4,11],[-10,9.5]]
  const mirror = (points: Outline): Outline => side === 1 ? points : points.map(([x, y]) => [x, -y] as const).reverse()
  return bevel(mirror(outline), mirror(inset), '#ab8271', -3, -5)
})
const TUG_ARMS = [-1, 1].map(side => {
  // A single sculpted, hooked finger pivots on each shoulder. Mirroring also
  // reverses winding so both arms receive the same lighting and face culling.
  const mirror = (points: Outline): Outline => side === 1 ? points : points.map(([x, y]) => [x, -y] as const).reverse()
  return {
    ...bevel(
      mirror([[-2,-2.5],[12,-2.5],[12,-6],[16,-6],[18,-1],[15,3],[1,3],[-2,1]]),
      mirror([[-1,-1.5],[13,-1.5],[13,-4.5],[15,-4.5],[16.5,-1],[14,1.5],[1,1.5],[-1,.5]]), BRASS, 2, -3),
    at: [9, side * 11, -1] as V3,
  }
})
const TUG_PIVOTS = [-1, 1].map(side => ({
  ...bevel([[3,0],[1.5,2.6],[-1.5,2.6],[-3,0],[-1.5,-2.6],[1.5,-2.6]],
    [[2,0],[1,1.7],[-1,1.7],[-2,0],[-1,-1.7],[1,-1.7]], FRAME, -3, -5),
  at: [9, side * 11, -1] as V3,
}))
const DAMAGE = bevel(
  [[-4,-4],[1,-2],[-1,1],[4,4],[0,3],[-3,0]],
  [[-3.5,-3.5],[.3,-2],[-1.7,1],[3,3.5],[0,2.5],[-2.5,0]], '#ce8856', 0, -.5)
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
    const spread = bot.target || bot.maintenance?.hook ? -.23 : bot.maintenance?.windup !== undefined ? .26 : .08
    parts.push(...TUG_ENGINES, TUG_DECK, WINCH, ...WINCH_RIBS,
      ...TUG_ARMS.map((part, i) => ({ ...part, rotation: [0, 0, (i === 0 ? -1 : 1) * spread] as V3 })),
      ...TUG_PIVOTS, TUG_SENSOR_MOUNT)
  } else {
    parts.push(...WATCH_ENGINES, ...WATCH_CHEEKS, WATCH_SPINE, WATCH_SENSOR_MOUNT, BARREL,
      { ...BARREL_BORE, color: charging ? '#ff9679' : BARREL_BORE.color, glow: active && charging })
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
  return { parts, angles, thrust, bank, active, damage, engineY: tug ? 12.5 : 11.5 }
}

export function drawStationBotModel(ctx: CanvasRenderingContext2D, bot: StationBot, time: number) {
  if (bot.health <= 0) return
  const appearance = stationBotAppearance(bot, time)
  const { parts, angles, thrust, bank, active, engineY } = appearance
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
    trace([[-22.5, y - 1.5, 0], [-23 - length, y, 0], [-22.5, y + 1.5, 0]], true)
    ctx.fillStyle = '#ffb45c18'; ctx.fill(); ctx.strokeStyle = '#ffb86b'; ctx.lineWidth = 1.2
    ctx.shadowColor = '#ffad6540'; ctx.shadowBlur = 4; ctx.stroke()
    trace([[-23, y, 0], [-23 - length * .55, y, 0]])
    ctx.strokeStyle = '#fff0cd'; ctx.lineWidth = 1; ctx.shadowBlur = 0; ctx.stroke()
  }
  if (Math.abs(bank) > .15) {
    const side = Math.sign(bank), y = side * (engineY + 3)
    trace([[-11, y, 0], [-11, y + side * (2 + Math.abs(bank) * 4), 0]])
    ctx.strokeStyle = '#ffe1ad'; ctx.lineWidth = 1; ctx.stroke()
  }
  drawModel(ctx, { x: 0, y: 0 }, parts, angles, time, 1, Math.max(bot.flash, bot.laserGlow ?? 0))
  for (const side of [-1, 1]) {
    trace([[-22.5, side * engineY - 1.2, -1], [-22.5, side * engineY + 1.2, -1]])
    ctx.strokeStyle = thrust > .045 ? '#ffe1ad' : '#687b70'; ctx.lineWidth = 1.3; ctx.shadowBlur = 0; ctx.stroke()
  }
  ctx.restore()
}
