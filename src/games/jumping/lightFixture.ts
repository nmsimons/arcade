import { ambientLightFraction } from './ambientLight.ts'
import type { LevelLight } from './lightingDefinition.ts'
import { paintNormally } from './worldPaint.ts'
import type { WorldPaint } from './worldPaint.ts'

/** Flat rounded cone: the broad face points along the spotlight's aim. */
export function drawLightFixtures(ctx: CanvasRenderingContext2D, lights: readonly (LevelLight & { fade: number })[], paint: WorldPaint = paintNormally) {
  for (const light of lights) {
    ctx.save(); ctx.translate(light.x, light.y); ctx.rotate(light.direction * Math.PI / 180)
    paint(ctx, 0, () => {
      ctx.fillStyle = '#687b71'; ctx.beginPath(); ctx.moveTo(6, -6); ctx.lineTo(-6, -4)
      ctx.quadraticCurveTo(-10, -3, -10, 0); ctx.quadraticCurveTo(-10, 3, -6, 4)
      ctx.lineTo(6, 6); ctx.closePath(); ctx.fill()
      ctx.fillStyle = '#9aa38e'; ctx.fillRect(6, -6, 2, 12)
    })
    if (light.fade > 0) {
      ctx.globalAlpha *= light.fade
      paint(ctx, 1, () => { ctx.fillStyle = '#f4f2e9'; ctx.fillRect(6, -6, 2, 12) })
    }
    ctx.restore()
  }
}

/** A short source cue, not attenuation of the spotlight's unlimited reach. */
export function drawLightHaze(ctx: CanvasRenderingContext2D, light: LevelLight & { fade: number }, ambient: number) {
  const strength = .18 * light.fade * (1 - ambientLightFraction(ambient))
  if (strength <= 0) return
  const radius = 56, half = light.spread * Math.PI / 360
  ctx.save(); ctx.translate(light.x, light.y); ctx.rotate(light.direction * Math.PI / 180)
  const gradient = ctx.createRadialGradient(0, 0, 6, 0, 0, radius)
  gradient.addColorStop(0, `rgba(244,242,233,${strength})`)
  gradient.addColorStop(.4, `rgba(244,242,233,${strength * .4})`)
  gradient.addColorStop(1, 'rgba(244,242,233,0)')
  ctx.fillStyle = gradient; ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, radius, -half, half); ctx.closePath(); ctx.fill()
  ctx.restore()
}

/** Preserve the reviewed haze at equivalent brightness across the dark-room scale.
 * Disabling night mode bypasses both haze effects in the renderer. */
export function beamHazeStrength(ambient: number) {
  const t = Math.max(0, Math.min(1, 1 - ambientLightFraction(ambient) / .5))
  return .025 * t * t * (3 - 2 * t)
}
