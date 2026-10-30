import { drawAthlete, NIGHT_PLAYER_COLOR } from './athlete.ts'
import { drawClimbables, drawTerrain } from './render.ts'
import { drawProp } from './challengeRender.ts'
import { drawWaterRegion } from './gravityRender.ts'
import { reviewPoster } from './modelReview.ts'
import type { ReviewBaseline, ReviewBounds, ReviewRecording } from './modelReview.ts'
import type { AthletePose } from './athlete.ts'
import { ANDROID_HAND_SIZE } from './androidHand.ts'

export type ReviewBackdrop = 'paper' | 'night' | 'sky' | 'stone'
export interface ReviewDisplay { backdrop: ReviewBackdrop; silhouette: boolean; joints: boolean; context: boolean; mirror: boolean; reference?: ReviewBounds; handSize?: number }
export const REVIEW_BACKDROPS: Record<ReviewBackdrop, { label: string; background: string; ink: string; exposure: number }> = {
  paper: { label: 'Day / facility', background: '#f1f1ed', ink: '#303c36', exposure: 1 },
  night: { label: 'Night / facility', background: '#545451', ink: NIGHT_PLAYER_COLOR, exposure: .35 },
  sky: { label: 'Day / blue sky', background: '#bfdfea', ink: '#303c36', exposure: 1 },
  stone: { label: 'Day / cave wall', background: '#e5e7e2', ink: '#303c36', exposure: 1 },
}

/** These PNGs freeze the current artwork, rather than re-rendering an old pose
 * with tomorrow's shell code. Only the explicit capture script replaces them. */
export function captureReviewAtlas(recording: ReviewRecording): { baseline: ReviewBaseline; png: string } {
  const ratio = 2, columns = 12, bounds = recording.bounds, count = recording.frames.length
  const rows = Math.ceil(count / columns), canvas = document.createElement('canvas')
  canvas.width = columns * bounds.w * ratio; canvas.height = rows * bounds.h * ratio * 3
  const ctx = canvas.getContext('2d')!
  for (const [inkIndex, ink] of ['#303c36', NIGHT_PLAYER_COLOR, '#303c36'].entries()) {
    for (const [i, frame] of recording.frames.entries()) {
      const x = i % columns * bounds.w, y = (Math.floor(i / columns) + inkIndex * rows) * bounds.h
      ctx.save(); ctx.scale(ratio, ratio); ctx.beginPath(); ctx.rect(x, y, bounds.w, bounds.h); ctx.clip()
      ctx.translate(x - bounds.x - frame.player.x, y - bounds.y - frame.player.y)
      drawAthlete(ctx, frame.player, inkIndex === 2 ? '#303c36ff' : ink, frame.pose); ctx.restore()
    }
  }
  const baseline: ReviewBaseline = { signature: recording.signature, frames: count, columns, ratio, bounds,
    image: `${recording.clip.id}.png`, poster: reviewPoster(recording),
    samples: recording.frames.map(f => ({ x: f.player.x, y: f.player.y, facing: f.player.facing, inverted: !!f.player.inverted,
      pose: f.pose, props: f.props, label: f.label, state: f.state })) }
  return { baseline, png: canvas.toDataURL('image/png') }
}

export function drawBaselineSprite(ctx: CanvasRenderingContext2D, image: CanvasImageSource, baseline: ReviewBaseline, frame: number, ink: number, x: number, y: number) {
  const { bounds: b, ratio, columns, frames } = baseline, rows = Math.ceil(frames / columns)
  const sourceX = frame % columns * b.w * ratio, sourceY = (Math.floor(frame / columns) + ink * rows) * b.h * ratio
  ctx.drawImage(image, sourceX, sourceY, b.w * ratio, b.h * ratio, x + b.x, y + b.y, b.w, b.h)
}

const currentSprites = new WeakMap<ReviewRecording, Map<string, { frame: number; canvas: HTMLCanvasElement }>>()
function currentSprite(recording: ReviewRecording, index: number, ink: string, handSize: number) {
  let variants = currentSprites.get(recording)
  if (!variants) { variants = new Map(); currentSprites.set(recording, variants) }
  const key = `${ink}:${handSize}`, previous = variants.get(key)
  if (previous?.frame === index) return previous.canvas
  const canvas = previous?.canvas ?? document.createElement('canvas'), b = recording.bounds, frame = recording.frames[index]
  canvas.width = b.w * 2; canvas.height = b.h * 2
  const ctx = canvas.getContext('2d')!
  ctx.scale(2, 2); ctx.translate(-b.x - frame.player.x, -b.y - frame.player.y)
  drawAthlete(ctx, frame.player, ink, { ...frame.pose, handScale: (frame.pose.handScale ?? 1) * handSize / ANDROID_HAND_SIZE })
  variants.set(key, { frame: index, canvas })
  return canvas
}

function drawJoints(ctx: CanvasRenderingContext2D, pose: AthletePose, x: number, y: number, facing: number, inverted: boolean, scale: number) {
  ctx.save(); ctx.translate(x, y); ctx.scale(facing, inverted ? -1 : 1)
  ctx.strokeStyle = '#b96126'; ctx.fillStyle = '#fff6df'; ctx.lineWidth = 1 / scale
  const chains = [[pose.hip, pose.waist, pose.shoulder, pose.head],
    ...[pose.frontArm, pose.backArm, pose.frontLeg, pose.backLeg].map(l => [l.root, l.joint, l.end])]
  for (const chain of chains) {
    ctx.beginPath(); chain.forEach((p, i) => i ? ctx.lineTo(...p) : ctx.moveTo(...p)); ctx.stroke()
    for (const p of chain) { ctx.beginPath(); ctx.arc(...p, 2 / scale, 0, Math.PI * 2); ctx.fill(); ctx.stroke() }
  }
  ctx.restore()
}

/** A neutral inspection stage uses the game's own terrain, props and rig.
 * The separate context canvas below uses the complete production light renderer. */
export function drawReviewCard(canvas: HTMLCanvasElement, recording: ReviewRecording, frameIndex: number, display: ReviewDisplay,
  saved?: { baseline: ReviewBaseline; image: HTMLImageElement }) {
  const width = Math.max(1, Math.round(canvas.clientWidth)), height = 430, ratio = Math.min(2, devicePixelRatio || 1)
  if (canvas.width !== width * ratio || canvas.height !== height * ratio) { canvas.width = width * ratio; canvas.height = height * ratio }
  const ctx = canvas.getContext('2d')!, frame = recording.frames[frameIndex], backdrop = REVIEW_BACKDROPS[display.backdrop]
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0); ctx.fillStyle = backdrop.background; ctx.fillRect(0, 0, width, height)
  const sample = saved?.baseline.samples[frameIndex], player = sample ? { ...frame.player, ...sample } : frame.player
  const pose = sample?.pose ?? frame.pose
  // Both columns retain the reference framing even if a proposed model grows;
  // independently fitting each body would conceal proportion changes.
  const bounds = display.reference ?? recording.bounds, center = bounds.y + bounds.h / 2
  const stage = (top: number, h: number, scale: number) => {
    ctx.save(); ctx.beginPath(); ctx.rect(0, top, width, h); ctx.clip()
    ctx.translate(width / 2, top + h / 2); ctx.scale(display.mirror ? -scale : scale, scale); ctx.translate(-player.x, -player.y - center)
    if (display.context) {
      ctx.save(); ctx.filter = `brightness(${backdrop.exposure})`
      drawTerrain(ctx, recording.run.terrain, recording.run.level.platforms, { ...recording.run.level, lighting: { ambient: 0, nightMode: display.backdrop === 'night', lights: [] } })
      drawClimbables(ctx, player, recording.run.level.climbables)
      for (const prop of player === frame.player ? frame.props : sample!.props) drawProp(ctx, prop)
      ctx.restore()
    }
    // The game keeps the player at a 65% readability floor in night shadow;
    // terrain and props retain the ordinary 35% ambient exposure.
    ctx.save(); ctx.filter = `brightness(${display.silhouette ? 1 : Math.max(.65, backdrop.exposure)})`
    const ink = display.silhouette ? 2 : display.backdrop === 'night' ? 1 : 0
    if (saved) drawBaselineSprite(ctx, saved.image, saved.baseline, frameIndex, ink, player.x, player.y)
    else {
      // Match the saved PNG's 2× sampling in both columns; otherwise the live
      // vector would look artificially sharper solely because it was enlarged.
      const sprite = currentSprite(recording, frameIndex, display.silhouette ? '#303c36ff' : backdrop.ink, display.handSize ?? 1), b = recording.bounds
      ctx.drawImage(sprite, frame.player.x + b.x, frame.player.y + b.y, b.w, b.h)
    }
    ctx.restore()
    if (display.context) for (const plate of recording.run.water.plates) drawWaterRegion(ctx, plate, undefined, undefined, recording.run.waterSpaces.get(plate))
    if (display.joints) drawJoints(ctx, pose, player.x, player.y, player.facing, !!player.inverted, scale)
    ctx.restore()
    ctx.fillStyle = display.backdrop === 'night' ? '#ebece6' : '#526659'; ctx.font = '11px ui-monospace, monospace'
    ctx.fillText(scale === .75 ? 'GAMEPLAY SIZE · 0.75×' : `DETAIL · ${scale.toFixed(1)}×`, 16, top + 22)
  }
  stage(0, 310, Math.min(3, (width - 32) / bounds.w, 260 / bounds.h)); stage(310, 120, .75)
  ctx.strokeStyle = display.backdrop === 'night' ? '#ffffff26' : '#303c3626'
  ctx.beginPath(); ctx.moveTo(0, 310); ctx.lineTo(width, 310); ctx.stroke()
}
