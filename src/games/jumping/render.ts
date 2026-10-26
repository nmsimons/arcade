import { gameCamera } from './camera.ts'
export { LEVEL_BOTTOM_PADDING } from './camera.ts'
import type { Platform, Player } from './model.ts'
import { airBoostStrength } from './model.ts'
import { LEVEL_GRID_SIZE, levelHeight, levelTerrain } from './level.ts'
import type { JumpLevel } from './level.ts'
import { ropePath } from './climbables.ts'
import type { ClimbableWorld } from './climbables.ts'
import { polygonPoints } from './geometry.ts'
import { drawWallTexts } from './wallText.ts'
import { terrainFill, terrainMaterial } from './terrainMaterials.ts'
import { terrainDrawOrder } from './terrainOrder.ts'
import { terrainUnderlaps } from './terrainJoins.ts'
import { drawFootBoosters } from './airBoosters.ts'
import { paintNormally } from './worldPaint.ts'
import type { WorldPaint } from './worldPaint.ts'
import { drawTerrainEdges, drawWallPanels } from './surfaceDepth.ts'
import { drawWallWiring } from './wallWiring.ts'
import { drawChargingBay, drawChargingBayCover, ROBOT_BAY_WIDTH_SCALE } from './goal.ts'
import { backWallPath, drawGroundCover, drawLandscape } from './environment.ts'

import { drawAthlete } from './athlete.ts'
export { drawAthlete } from './athlete.ts'

const ACCENT = '#df633f'

export function drawClimbables(ctx: CanvasRenderingContext2D, p: Player, world: ClimbableWorld) {
  for (const ladder of world.ladders) {
    ctx.fillStyle = '#87958b'
    ctx.fillRect(ladder.x - 8, ladder.top, 2.5, ladder.bottom - ladder.top)
    ctx.fillRect(ladder.x + 5.5, ladder.top, 2.5, ladder.bottom - ladder.top)
    for (let y = ladder.top; y <= ladder.bottom; y += 14) ctx.fillRect(ladder.x - 8, y, 16, 2)
  }
  for (const [i, rope] of world.ropes.entries()) {
    ctx.strokeStyle = '#998263'; ctx.lineWidth = 2.8; ctx.lineJoin = 'round'; ctx.lineCap = 'round'
    ctx.beginPath(); ctx.moveTo(rope.x, rope.y)
    for (const [x, y] of ropePath(rope, p.ropes?.[i])) ctx.lineTo(x, y)
    ctx.stroke()
    ctx.fillStyle = '#697d72'; ctx.beginPath(); ctx.arc(rope.x, rope.y, 5, 0, Math.PI * 2); ctx.fill()
  }
}

export const TERRAIN_COLOR = terrainMaterial().color
export function drawLevelBackdrop(ctx: CanvasRenderingContext2D, level: JumpLevel, view: { x: number; y: number; w: number; h: number }, zoom = 1, includeWallArt = true, includeSky = true) {
  ctx.save()
  if (level.environment && !includeSky) {
    ctx.beginPath(); ctx.rect(view.x, view.y, view.w, view.h); ctx.clip()
    ctx.beginPath(); ctx.rect(view.x, view.y, view.w, view.h); ctx.rect(0, 0, level.width, levelHeight(level)); ctx.clip('evenodd')
  }
  ctx.fillStyle = TERRAIN_COLOR; ctx.fillRect(view.x, view.y, view.w, view.h); ctx.restore()
  ctx.save(); ctx.beginPath(); ctx.rect(0, 0, level.width, levelHeight(level)); ctx.clip()
  if (level.environment) {
    if (includeSky) drawLandscape(ctx, level.environment, view)
    for (const wall of level.environment.walls) {
      ctx.save(); ctx.beginPath(); backWallPath(ctx, wall); ctx.clip()
      drawCourseWall(ctx, level, view, zoom)
      ctx.restore()
    }
  } else drawCourseWall(ctx, level, view, zoom)
  if (includeWallArt) drawWallWiring(ctx, level)
  if (level.entrance.kind === 'charging-bay') drawChargingBay(ctx, level.entrance)
  for (const robot of level.robots ?? []) if (robot.kind === 'repulsor' && robot.chargingBay) drawChargingBay(ctx, robot, ROBOT_BAY_WIDTH_SCALE)
  ctx.restore()
  if (includeWallArt) drawWallTexts(ctx, level.texts ?? [])
}
function drawCourseWall(ctx: CanvasRenderingContext2D, level: JumpLevel, view: { x: number; y: number; w: number; h: number }, zoom: number) {
  ctx.fillStyle = '#f1f1ed'; ctx.fillRect(0, 0, level.width, levelHeight(level))
  ctx.lineWidth = 1 / zoom; ctx.strokeStyle = '#353f4810'; ctx.beginPath()
  // Zoomed-out views omit minor lines, but every line remains on the same snap lattice.
  const grid = LEVEL_GRID_SIZE * 2 ** Math.max(0, Math.ceil(Math.log2(8 / (LEVEL_GRID_SIZE * zoom))))
  for (let x = Math.max(0, Math.floor(view.x / grid) * grid); x <= Math.min(level.width, view.x + view.w); x += grid) { ctx.moveTo(x, view.y); ctx.lineTo(x, view.y + view.h) }
  const bottom = levelHeight(level), firstY = bottom - Math.floor((bottom - Math.max(0, view.y)) / grid) * grid
  for (let y = firstY; y <= Math.min(bottom, view.y + view.h); y += grid) { ctx.moveTo(view.x, y); ctx.lineTo(view.x + view.w, y) }
  ctx.stroke()
  drawWallPanels(ctx, { x: Math.max(0, view.x), y: Math.max(0, view.y),
    w: Math.min(level.width, view.x + view.w) - Math.max(0, view.x),
    h: Math.min(levelHeight(level), view.y + view.h) - Math.max(0, view.y) })
}
export function drawTerrain(ctx: CanvasRenderingContext2D, platforms: readonly Platform[], authored: readonly Platform[] = platforms, level?: JumpLevel) {
  // Fill consecutive terrain of the same material as one compound silhouette.
  // Separate antialiased fills leave partial coverage along their shared edges.
  let material: Platform['material'], started = false
  const order = terrainDrawOrder(authored)
  const transform = ctx.getTransform?.(), bottom = level ? levelHeight(level) : 0
  const bleedX = transform ? 1 / Math.hypot(transform.a, transform.b) : 0
  const bleedY = transform ? 1 / Math.hypot(transform.c, transform.d) : 0
  const underlaps = terrainUnderlaps(platforms, order, transform ? Math.min(Math.hypot(transform.a, transform.b), Math.hypot(transform.c, transform.d)) : 1)
  for (let i = 0; i < platforms.length; i++) {
    // Enclosing floor and walls stay above authored terrain, as before.
    const index = i < order.length ? order[i] : i, b = platforms[index]
    const next = b.material ?? 'stone'
    if (!started || next !== material) {
      if (started) ctx.fill()
      ctx.fillStyle = terrainFill(ctx, next); ctx.beginPath()
      material = next; started = true
    }
    const points = polygonPoints(b)
    points.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.closePath()
    for (const patch of underlaps[index]) {
      patch.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.closePath()
    }
    // Carry flush terrain edges one canvas pixel into the enclosing solid.
    // Different material batches cannot share antialias coverage, even when
    // their geometry meets exactly. The enclosing walls still paint on top.
    if (level && i < order.length && (b.x <= 0 || b.y <= 0 || b.x + b.w >= level.width || b.y + b.h >= bottom)) for (let edge = 0; edge < points.length; edge++) {
      const a = points[edge], end = points[(edge + 1) % points.length]
      if (a[0] === end[0] && (a[0] === 0 || a[0] === level.width)) {
        ctx.rect(a[0] === 0 ? -bleedX : level.width, Math.min(a[1], end[1]), bleedX, Math.abs(end[1] - a[1]))
      }
      if (a[1] === end[1] && (a[1] === 0 || a[1] === bottom)) {
        ctx.rect(Math.min(a[0], end[0]), a[1] === 0 ? -bleedY : bottom, Math.abs(end[0] - a[0]), bleedY)
      }
    }
  }
  if (started) ctx.fill()
  if (level) drawTerrainEdges(ctx, platforms, level)
  if (level?.environment) drawGroundCover(ctx, level.environment, level.platforms)
}
export function drawMovementEffects(ctx: CanvasRenderingContext2D, p: Player, paint: WorldPaint = paintNormally) {
  if (airBoostStrength(p) >= .01) paint(ctx, 1, () => drawFootBoosters(ctx, p))
  if (!p.sliding) return
  const { angle, amount, time, x, y } = p.sliding
  const speed = p.vx * Math.cos(angle) + p.vy * Math.sin(angle), direction = Math.sign(speed) || p.facing
  const intensity = amount * Math.min(1, Math.abs(speed) / 180)
  paint(ctx, 0, () => {
    ctx.save(); ctx.translate(x, y); ctx.rotate(angle); ctx.fillStyle = '#777b7e'
    for (let i = 0; i < 7; i++) {
      const age = (time * 3 + i / 7) % 1
      ctx.globalAlpha = intensity * (1 - age) * .5
      ctx.fillRect(-direction * (3 + age * 24), -2 - Math.sin(age * Math.PI) * (3 + i % 3), 1.5 + i % 2, 1.5)
    }
    ctx.restore()
  })
}
export function drawCheckpointMarkers(ctx: CanvasRenderingContext2D, p: Player, level: JumpLevel) {
  for (const [index, point] of level.checkpoints.entries()) {
    ctx.fillStyle = p.checkpoint >= index + 1 ? ACCENT : '#a0a3a4'; ctx.fillRect(point.x - 4, point.y - 2, 8, 2)
  }
}
export function drawPlayground(ctx: CanvasRenderingContext2D, width: number, height: number, p: Player, level: JumpLevel, view = gameCamera(width, height, p, level, false)) {
  const { zoom, x, y } = view
  ctx.save(); ctx.scale(zoom, zoom); ctx.translate(-x, -y)
  drawLevelBackdrop(ctx, level, { x, y, w: width / zoom, h: height / zoom }, zoom)
  drawTerrain(ctx, levelTerrain(level), level.platforms, level); drawClimbables(ctx, p, level.climbables)
  drawCheckpointMarkers(ctx, p, level)
  drawMovementEffects(ctx, p); drawAthlete(ctx, p)
  if (level.entrance.kind === 'charging-bay') drawChargingBayCover(ctx, level.entrance)
  ctx.restore()
}
