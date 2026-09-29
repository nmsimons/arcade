import { createPlayer } from '../../games/jumping/model'
import { drawAthlete, drawTerrain } from '../../games/jumping/render'
import { NIGHT_PLAYER_COLOR } from '../../games/jumping/athlete'
import { ambientExposure } from '../../games/jumping/ambientLight'
import { beamHazeStrength, drawLightFixtures, drawLightHaze } from '../../games/jumping/lightFixture'

export function drawPreview(ctx: CanvasRenderingContext2D, width: number, height: number) {
  // A still night scene: the lit figure stays legible at card size. Scale
  // uniformly and crop the surroundings instead of stretching the athlete.
  ctx.fillStyle = '#545452'; ctx.fillRect(0, 0, width, height)
  const scale = Math.max(width / 360, height / 230)
  ctx.save(); ctx.translate(width / 2, height / 2); ctx.scale(scale, scale); ctx.translate(-180, -115)
  ctx.strokeStyle = '#303c3620'; ctx.lineWidth = 1
  ctx.beginPath()
  for (let x = 0; x <= 360; x += 20) { ctx.moveTo(x, 0); ctx.lineTo(x, 230) }
  for (let y = 10; y <= 230; y += 20) { ctx.moveTo(0, y); ctx.lineTo(360, y) }
  ctx.stroke()
  const lamp = { id: 'cover', x: 86, y: 32, direction: 40, spread: 64, intensity: 100, power: 'always' as const, fade: 1 }
  ctx.save(); ctx.translate(lamp.x, lamp.y); ctx.rotate(lamp.direction * Math.PI / 180)
  ctx.fillStyle = '#f4f2e9'; ctx.globalAlpha = beamHazeStrength(0)
  ctx.beginPath(); ctx.moveTo(0, 0)
  const half = lamp.spread * Math.PI / 360
  ctx.lineTo(500 * Math.cos(half), -500 * Math.sin(half)); ctx.lineTo(500 * Math.cos(half), 500 * Math.sin(half)); ctx.closePath(); ctx.fill()
  ctx.restore()
  drawLightHaze(ctx, lamp, 0); drawLightFixtures(ctx, [lamp])
  ctx.save(); ctx.filter = `brightness(${ambientExposure(0)})`
  drawTerrain(ctx, [{ x: 0, y: 185, w: 120, h: 45 }, { x: 175, y: 135, w: 185, h: 95 }])
  ctx.restore()
  const player = createPlayer(); Object.assign(player, { x: 153, y: 133, grounded: false, vx: 270, vy: -150, stride: 1.8 })
  drawAthlete(ctx, player, NIGHT_PLAYER_COLOR)
  ctx.restore()
}
