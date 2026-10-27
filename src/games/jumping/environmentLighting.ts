import { backWallPath, regionLighting } from './environment.ts'
import { polygonPoints, polygonArea, pointInside } from './geometry.ts'
import { exposedBoundary, isExitEdge, terrainBoundary, terrainShadowsPoint } from './lightingBoundary.ts'
import type { TerrainEdge } from './lightingBoundary.ts'
import { mechanismShape } from './mechanisms.ts'
import { shadowQuad } from './lightingModel.ts'
import type { LightingWorld } from './lightingModel.ts'
import type { LightingView } from './lightingRender.ts'
import type { JumpLevel } from './level.ts'
import { terrainRegionLighting } from './terrainRegionLighting.ts'
import { terrainDrawOrder } from './terrainOrder.ts'
import { androidDaylightMaterials } from './androidArtwork.ts'
import type { AndroidMaterials } from './androidArtwork.ts'

const DARK = .35, DAY = .95, REACH = 600
const FIELD_MARGIN = 64
const NOISE_SIZE = 64
const ditherEnabled = (view: LightingView) => view.zoom >= .5 && view.width * view.height <= 1_500_000
type Box = { x: number; y: number; w: number; h: number }
const gray = (n: number) => { const v = Math.round(n * 255); return `rgb(${v},${v},${v})` }
const buffer = (software = true) => { const canvas = document.createElement('canvas'); return { canvas, ctx: canvas.getContext('2d', { willReadFrequently: software })! } }
type Surface = ReturnType<typeof buffer>
type Portal = { x: number; y: number; a: readonly [number, number]; b: readonly [number, number] }
type Appearance = { terrain: ReadonlyMap<JumpLevel['platforms'][number], number>; frame: number }
type Scene = { level: JumpLevel; mechanisms: string; portals: Portal[]; edges: TerrainEdge[]; appearance: Appearance; platforms: JumpLevel['platforms']; solids: JumpLevel['platforms'] }
type TerrainBatch = { exposure: number; path: Path2D; joins: TerrainEdge[] }

/** Two small light fields, the noise tile, the bounded ambient
 * field, and GPU-only resolve. Include viewports where all fields are native. */
export function environmentBufferBytes(view: LightingView, gpu = false) {
  const scale = Math.min(1, 512 / Math.max(view.width, view.height))
  const width = Math.max(1, Math.ceil(view.width * scale)), height = Math.max(1, Math.ceil(view.height * scale))
  return 4 * (2 * (width + FIELD_MARGIN * 2) * (height + FIELD_MARGIN * 2) + view.width * view.height * (gpu ? 2 : 1) + (ditherEnabled(view) ? NOISE_SIZE * NOISE_SIZE : 0))
}

/** Bright-region ambient enters through actual gaps in the rock, rather than
 * stopping at a back-wall polygon. It works with either background. */
export function daylightPortals(level: JumpLevel): Portal[] {
  if (!level.environment) return []
  const portals: Portal[] = []
  for (const [index, wall] of level.environment.walls.entries()) {
    const points = polygonPoints(wall), edges = points.map((p, i): TerrainEdge => [p, points[(i + 1) % points.length]])
    const covers = [...level.platforms, ...level.environment.walls.slice(index + 1)]
    for (const [a, b] of exposedBoundary(edges, covers)) {
      if (a[0] === b[0] && (a[0] === 0 || a[0] === level.width) || a[1] === b[1] && (a[1] === 0 || a[1] === (level.floor ?? level.height))) continue
      const length = Math.hypot(b[0] - a[0], b[1] - a[1]), count = Math.min(4, Math.ceil(length / 80))
      for (let i = 0; i < count; i++) {
        const t = (i + .5) / count, x = a[0] + (b[0] - a[0]) * t, y = a[1] + (b[1] - a[1]) * t
        const nx = (b[1] - a[1]) / length * 2, ny = -(b[0] - a[0]) / length * 2
        const sign = regionLighting(level.environment, x + nx, y + ny) === 'day' ? 1 : -1
        const outside = { x: x + nx * sign, y: y + ny * sign }, inside = { x: x - nx * sign, y: y - ny * sign }
        if (regionLighting(level.environment, outside.x, outside.y) !== 'day' || regionLighting(level.environment, inside.x, inside.y) !== 'night'
          || level.platforms.some(p => pointInside(p, outside.x, outside.y) || pointInside(p, inside.x, inside.y))) continue
        portals.push({ ...outside,
          a: [a[0] + (b[0] - a[0]) * i / count + nx * sign, a[1] + (b[1] - a[1]) * i / count + ny * sign],
          b: [a[0] + (b[0] - a[0]) * (i + 1) / count + nx * sign, a[1] + (b[1] - a[1]) * (i + 1) / count + ny * sign] })
      }
    }
  }
  return portals
}

export function portalExposure(distance: number) {
  const t = Math.max(0, Math.min(1, distance / REACH))
  return DARK + (DAY - DARK) * (1 - t * t * (3 - 2 * t)) ** 2
}
const portalDistance = (light: Portal, x: number, y: number) => {
  const dx = light.b[0] - light.a[0], dy = light.b[1] - light.a[1]
  const t = Math.max(0, Math.min(1, ((x - light.a[0]) * dx + (y - light.a[1]) * dy) / (dx * dx + dy * dy)))
  return Math.hypot(x - light.a[0] - dx * t, y - light.a[1] - dy * t)
}
function airExposure(level: JumpLevel, portals: Portal[], edges: TerrainEdge[], x: number, y: number) {
  if (!level.environment || regionLighting(level.environment, x, y) === 'day') return DAY
  return portals.reduce((value, light) => {
    const distance = portalDistance(light, x, y)
    return distance < REACH && !terrainShadowsPoint(light, edges, x, y) ? Math.max(value, portalExposure(distance)) : value
  }, DARK)
}

/** A strip plus round end caps is one distance field for the whole opening.
 * Neighboring pieces agree exactly, instead of overlapping circular spotlights. */
function drawPortalField(ctx: CanvasRenderingContext2D, light: Portal) {
  const dx = light.b[0] - light.a[0], dy = light.b[1] - light.a[1], length = Math.hypot(dx, dy)
  ctx.save(); ctx.translate(light.a[0], light.a[1]); ctx.rotate(Math.atan2(dy, dx)); ctx.globalCompositeOperation = 'lighten'
  const strip = ctx.createLinearGradient(0, -REACH, 0, REACH)
  for (let i = 0; i <= 48; i++) strip.addColorStop(i / 48, gray(portalExposure(Math.abs(i / 24 - 1) * REACH)))
  ctx.fillStyle = strip; ctx.fillRect(0, -REACH, length, REACH * 2)
  for (const x of [0, length]) {
    const cap = ctx.createRadialGradient(x, 0, 0, x, 0, REACH)
    for (let i = 0; i <= 24; i++) cap.addColorStop(i / 24, gray(portalExposure(REACH * i / 24)))
    ctx.fillStyle = cap; ctx.fillRect(x - REACH, -REACH, REACH * 2, REACH * 2)
  }
  ctx.restore()
}

export class EnvironmentLighting {
  private geometry?: Scene
  private fields?: { ambient: Surface; readable: Surface }
  private terrainPaths?: { level: JumpLevel; batches: TerrainBatch[] }
  private shadowPaths?: { scene: Scene; paths: Path2D[] }
  private air?: { scene: Scene; zoom: number; width: number; height: number; bounds: Box; smoothBands: boolean }
  private readableCrop!: Box
  private software = false
  private playerAppearance?: { scene: Scene; x: number; y: number; materials: AndroidMaterials }
  private boundedAmbient?: Surface
  private resolved?: Surface
  private noise?: { canvas: HTMLCanvasElement; pattern: CanvasPattern; transform: DOMMatrix }
  private key = ''
  private dither(target: Surface, bounds: Box, zoom: number) {
    if (!this.noise) {
      const tile = buffer(false), pixels = tile.ctx.createImageData(NOISE_SIZE, NOISE_SIZE)
      tile.canvas.width = tile.canvas.height = NOISE_SIZE
      for (let i = 0; i < NOISE_SIZE * NOISE_SIZE; i++) {
        let n = Math.imul(i ^ 0x9e3779b9, 0x85ebca6b); n = Math.imul(n ^ n >>> 16, 0xc2b2ae35); n ^= n >>> 16
        const value = n & 255, p = i * 4
        pixels.data[p] = pixels.data[p + 1] = pixels.data[p + 2] = value; pixels.data[p + 3] = 255
      }
      tile.ctx.putImageData(pixels, 0, 0)
      this.noise = { canvas: tile.canvas, pattern: target.ctx.createPattern(tile.canvas, 'repeat')!, transform: new DOMMatrix() }
    }
    this.noise.transform.e = -bounds.x * zoom; this.noise.transform.f = -bounds.y * zoom
    this.noise.pattern.setTransform(this.noise.transform)
    // Add 0..2 gray values, then subtract one: unlike a translucent noise
    // overlay, this does not pull the fade toward middle gray. Only rebuilds
    // of the small retained field pay for these fills. Camera frames keep
    // their original opaque upscale, and the night ambient remains a floor.
    const ctx = target.ctx, { width, height } = target.canvas
    ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 2 / 255
    ctx.fillStyle = this.noise.pattern; ctx.fillRect(0, 0, width, height)
    ctx.globalCompositeOperation = 'difference'; ctx.globalAlpha = 1
    ctx.fillStyle = '#010101'; ctx.fillRect(0, 0, width, height)
    ctx.globalCompositeOperation = 'lighten'; ctx.fillStyle = gray(DARK); ctx.fillRect(0, 0, width, height)
    ctx.globalCompositeOperation = 'source-over'
  }
  private scene(run: LightingWorld) {
    const portals = this.geometry?.level === run.level ? this.geometry.portals : daylightPortals(run.level)
    // A blocker outside every opening's bounded reach cannot intersect a ray
    // contributing to this field. Its motion must not invalidate cave daylight.
    const blockers = run.mechanisms.map(mechanismShape).filter(shape => portals.some(light =>
      shape.x <= Math.max(light.a[0], light.b[0]) + REACH && shape.x + shape.w >= Math.min(light.a[0], light.b[0]) - REACH
      && shape.y <= Math.max(light.a[1], light.b[1]) + REACH && shape.y + shape.h >= Math.min(light.a[1], light.b[1]) - REACH))
    const mechanisms = blockers.map(m => `${m.x},${m.y},${m.w},${m.h}`).join(';')
    if (this.geometry?.level !== run.level || this.geometry.mechanisms !== mechanisms) {
      const edges = terrainBoundary([...run.level.platforms, ...blockers])
      const environment = run.level.environment
      const appearance = this.geometry?.level === run.level ? this.geometry.appearance : {
        terrain: new Map(run.level.platforms.map(platform => [platform,
          environment && terrainRegionLighting(environment, platform) === 'night' ? DARK : DAY])),
        frame: environment && terrainRegionLighting(environment, { x: 0, y: 0, w: run.level.width, h: run.level.floor ?? run.level.height ?? 1020 }) === 'night' ? DARK : DAY,
      }
      this.geometry = { level: run.level, mechanisms, portals, appearance, edges,
        platforms: terrainDrawOrder(run.level.platforms).map(index => run.level.platforms[index]).reverse(), solids: [...run.level.platforms, ...blockers] }
      this.key = ''
    }
    return this.geometry
  }
  exposureAt(run: LightingWorld, x: number, y: number) {
    const { portals, edges } = this.scene(run)
    return airExposure(run.level, portals, edges, x, y)
  }
  private terrainValue(scene: Scene, x: number, y: number) {
    const host = scene.platforms.find(p => x >= p.x && x <= p.x + p.w && y >= p.y && y <= p.y + p.h && pointInside(p, x, y))
    if (!host) return null
    return scene.appearance.terrain.get(host) ?? DARK
  }
  terrainExposureAt(run: LightingWorld, x: number, y: number) { return this.terrainValue(this.scene(run), x, y) }
  frameExposureAt(run: LightingWorld) { return this.scene(run).appearance.frame }
  playerMaterials(run: LightingWorld) {
    const scene = this.scene(run), x = run.player.x, y = run.player.y - (run.player.inverted ? -31 : 31)
    const saved = this.playerAppearance
    if (saved?.scene === scene && saved.x === x && saved.y === y) return saved.materials
    const exposure = airExposure(run.level, scene.portals, scene.edges, x, y)
    const materials = androidDaylightMaterials((exposure - DARK) / (DAY - DARK))
    this.playerAppearance = { scene, x, y, materials }
    return materials
  }
  render(run: LightingWorld, view: LightingView, software = false) {
    if (this.software !== software) { this.release(); this.software = software }
    const scene = this.scene(run)
    // Overview and large/fallback views keep the original mask and its budget.
    // Their bandwidth is more sensitive and the added grain has less benefit.
    const smoothBands = ditherEnabled(view)
    if (!smoothBands && this.noise) {
      this.noise.canvas.width = this.noise.canvas.height = 0; this.noise = undefined
    }
    const key = `${view.x}:${view.y}:${view.zoom}:${view.width}:${view.height}`
    const fields = this.fields ??= { ambient: buffer(software), readable: buffer(software) }
    // Build each portal in the second retained field, then reuse it for the
    // readability floor. These fields never read pixels; keep their blends on
    // the GPU and upload only the small CPU-authored terrain sample grid.
    const scratch = fields.readable
    if (this.key === key) return { ...fields, ambient: this.boundedAmbient!, readableCrop: this.readableCrop }
    const scale = Math.min(1, 512 / Math.max(view.width, view.height)), width = Math.max(1, Math.ceil(view.width * scale)), height = Math.max(1, Math.ceil(view.height * scale))
    const zoom = view.zoom * scale
    const bounds = { x: view.x, y: view.y, w: view.width / view.zoom, h: view.height / view.zoom }
    const fieldWidth = width + FIELD_MARGIN * 2, fieldHeight = height + FIELD_MARGIN * 2, border = 2 / zoom
    const rebuildAir = this.air?.scene !== scene || this.air.zoom !== zoom || this.air.width !== fieldWidth || this.air.height !== fieldHeight || this.air.smoothBands !== smoothBands
      || bounds.x < this.air.bounds.x + border || bounds.y < this.air.bounds.y + border
      || bounds.x + bounds.w > this.air.bounds.x + this.air.bounds.w - border || bounds.y + bounds.h > this.air.bounds.y + this.air.bounds.h - border
    if (rebuildAir) this.air = { scene, zoom, width: fieldWidth, height: fieldHeight, smoothBands,
      bounds: { x: (Math.floor(bounds.x * zoom) - FIELD_MARGIN) / zoom, y: (Math.floor(bounds.y * zoom) - FIELD_MARGIN) / zoom, w: fieldWidth / zoom, h: fieldHeight / zoom } }
    const fieldBounds = this.air!.bounds
    const readableCrop = { x: (bounds.x - fieldBounds.x) * zoom, y: (bounds.y - fieldBounds.y) * zoom, w: view.width * scale, h: view.height * scale }
    const reset = (surface: Surface) => {
      if (surface.canvas.width !== fieldWidth || surface.canvas.height !== fieldHeight) { surface.canvas.width = fieldWidth; surface.canvas.height = fieldHeight }
      surface.ctx.resetTransform(); surface.ctx.globalAlpha = 1; surface.ctx.globalCompositeOperation = 'source-over'
    }
    if (rebuildAir) {
      if (this.shadowPaths?.scene !== scene) {
        const solids = new Path2D()
        for (const shape of scene.solids) {
          polygonPoints(shape).forEach(([x, y], i) => i ? solids.lineTo(x, y) : solids.moveTo(x, y)); solids.closePath()
        }
        this.shadowPaths = { scene, paths: scene.portals.map(light => {
          const path = new Path2D(solids)
          for (const [a, b] of scene.edges) if (isExitEdge(light, [a, b])) {
            const points = shadowQuad(light, a, b, REACH * 3)
            if (polygonArea(points) < 0) points.reverse()
            points.forEach(([x, y], i) => i ? path.lineTo(x, y) : path.moveTo(x, y)); path.closePath()
          }
          return path
        }) }
      }
      reset(fields.ambient)
      const ctx = fields.ambient.ctx
      ctx.fillStyle = gray(DARK); ctx.fillRect(0, 0, fieldWidth, fieldHeight)
      ctx.save()
      // A coarse antialiased room clip can leave a partly lit texel where the
      // back wall ends on the same edge. Keep those texels at night ambient;
      // the sky's own full-resolution artwork supplies its exact silhouette.
      const left = Math.ceil(-fieldBounds.x * zoom), top = Math.ceil(-fieldBounds.y * zoom)
      const right = Math.floor((run.level.width - fieldBounds.x) * zoom), bottom = Math.floor(((run.level.floor ?? run.level.height ?? 1020) - fieldBounds.y) * zoom)
      ctx.beginPath(); ctx.rect(left, top, right - left, bottom - top); ctx.clip()
      ctx.setTransform(zoom, 0, 0, zoom, -fieldBounds.x * zoom, -fieldBounds.y * zoom)
      ctx.fillStyle = gray(run.level.environment!.baseLighting === 'night' ? DARK : DAY)
      ctx.fillRect(fieldBounds.x, fieldBounds.y, fieldBounds.w, fieldBounds.h)
      let pending: 'day' | 'night' | null = null
      for (const wall of run.level.environment!.walls) {
        const light = wall.lighting ?? 'night'
        if (light !== pending) {
          if (pending) ctx.fill()
          ctx.beginPath(); ctx.fillStyle = gray(light === 'day' ? DAY : DARK); pending = light
        }
        backWallPath(ctx, wall)
      }
      if (pending) ctx.fill()
      ctx.restore()
      let spill = false
      for (const [index, light] of scene.portals.entries()) {
        if (Math.max(light.a[0], light.b[0]) + REACH < fieldBounds.x || Math.min(light.a[0], light.b[0]) - REACH > fieldBounds.x + fieldBounds.w
          || Math.max(light.a[1], light.b[1]) + REACH < fieldBounds.y || Math.min(light.a[1], light.b[1]) - REACH > fieldBounds.y + fieldBounds.h) continue
        spill = true
        reset(scratch)
        const target = scratch.ctx
        target.fillStyle = gray(DARK); target.fillRect(0, 0, fieldWidth, fieldHeight)
        target.setTransform(zoom, 0, 0, zoom, -fieldBounds.x * zoom, -fieldBounds.y * zoom)
        drawPortalField(target, light)
        // The solid and its shadow must share one opaque union. Separately
        // antialiased edges leave a partly unshadowed line at cave ceilings.
        target.fillStyle = gray(DARK); target.fill(this.shadowPaths.paths[index]); target.resetTransform()
        ctx.globalCompositeOperation = 'lighten'; ctx.drawImage(scratch.canvas, 0, 0)
      }
      if (spill && smoothBands) {
        this.dither(fields.ambient, fieldBounds, zoom)
      }
    }
    // Terrain shade belongs to each authored piece. Native paths keep its
    // silhouette exact, with no interpolated terrain grid or per-frame queries.
    // Consecutive equal shades share a path while preserving terrain layers.
    if (this.terrainPaths?.level !== run.level) {
      const batches: TerrainBatch[] = []
      for (const index of terrainDrawOrder(run.level.platforms)) {
        const platform = run.level.platforms[index], exposure = scene.appearance.terrain.get(platform)!
        if (batches.at(-1)?.exposure !== exposure) batches.push({ exposure, path: new Path2D(), joins: [] })
        const batch = batches.at(-1)!, points = polygonPoints(platform)
        points.forEach(([x, y], i) => i ? batch.path.lineTo(x, y) : batch.path.moveTo(x, y)); batch.path.closePath()
        for (let i = 0; i < points.length; i++) {
          const a = points[i], b = points[(i + 1) % points.length]
          if (a[0] === b[0] && (a[0] === 0 || a[0] === run.level.width)
            || a[1] === b[1] && (a[1] === 0 || a[1] === (run.level.floor ?? run.level.height ?? 1020))) batch.joins.push([a, b])
        }
      }
      this.terrainPaths = { level: run.level, batches }
    }
    // Only the playable room receives the air field. The enclosing frame uses
    // one constant shade: dark with any Night region, light for all-Day layouts.
    const bounded = this.boundedAmbient ??= buffer(software)
    if (bounded.canvas.width !== view.width || bounded.canvas.height !== view.height) { bounded.canvas.width = view.width; bounded.canvas.height = view.height }
    const target = bounded.ctx
    target.resetTransform(); target.globalCompositeOperation = 'source-over'; target.fillStyle = gray(scene.appearance.frame); target.fillRect(0, 0, view.width, view.height)
    target.save(); target.setTransform(view.zoom, 0, 0, view.zoom, -view.x * view.zoom, -view.y * view.zoom)
    target.beginPath(); target.rect(0, 0, run.level.width, run.level.floor ?? run.level.height ?? 1020); target.clip(); target.resetTransform()
    target.drawImage(fields.ambient.canvas, readableCrop.x, readableCrop.y, readableCrop.w, readableCrop.h, 0, 0, view.width, view.height)
    target.restore()
    target.save()
    target.setTransform(view.zoom, 0, 0, view.zoom, -view.x * view.zoom, -view.y * view.zoom)
    for (const batch of this.terrainPaths.batches) {
      target.fillStyle = gray(batch.exposure); target.fill(batch.path)
      // Matching solids carry their shade across the boundary by one native
      // pixel. Two independently antialiased edges otherwise expose the air
      // field along a continuous rock/frame join at fractional camera offsets.
      if (batch.exposure === scene.appearance.frame) for (const [a, b] of batch.joins) {
        const bleed = 1 / view.zoom
        if (a[0] === b[0]) target.fillRect(a[0] - bleed, Math.min(a[1], b[1]), bleed * 2, Math.abs(b[1] - a[1]))
        else target.fillRect(Math.min(a[0], b[0]), a[1] - bleed, Math.abs(b[0] - a[0]), bleed * 2)
      }
    }
    target.restore()
    // Both surfaces are GPU-backed, so this downsample does not read pixels
    // back to the CPU and retains the final, accurately clipped silhouette.
    reset(fields.readable); fields.readable.ctx.fillStyle = gray(DARK); fields.readable.ctx.fillRect(0, 0, fieldWidth, fieldHeight)
    fields.readable.ctx.drawImage(bounded.canvas, 0, 0, view.width, view.height, readableCrop.x, readableCrop.y, readableCrop.w, readableCrop.h)
    fields.readable.ctx.globalCompositeOperation = 'lighten'; fields.readable.ctx.fillStyle = gray(.65); fields.readable.ctx.fillRect(0, 0, fieldWidth, fieldHeight)
    this.readableCrop = readableCrop
    this.key = key
    return { ...fields, ambient: bounded, readableCrop }
  }
  resolve(view: LightingView, drawField: (ctx: CanvasRenderingContext2D) => void) {
    const surface = this.resolved ??= buffer(false)
    if (surface.canvas.width !== view.width || surface.canvas.height !== view.height) { surface.canvas.width = view.width; surface.canvas.height = view.height }
    surface.ctx.resetTransform(); surface.ctx.globalCompositeOperation = 'source-over'; drawField(surface.ctx)
    surface.ctx.globalCompositeOperation = 'lighten'; surface.ctx.drawImage(this.boundedAmbient!.canvas, 0, 0, view.width, view.height)
    return surface.canvas
  }
  release() {
    if (this.fields) for (const surface of Object.values(this.fields)) surface.canvas.width = surface.canvas.height = 0
    if (this.resolved) this.resolved.canvas.width = this.resolved.canvas.height = 0
    if (this.boundedAmbient) this.boundedAmbient.canvas.width = this.boundedAmbient.canvas.height = 0
    if (this.noise) this.noise.canvas.width = this.noise.canvas.height = 0
    this.terrainPaths = undefined
    this.shadowPaths = undefined
    this.playerAppearance = undefined
    this.air = undefined
    this.boundedAmbient = undefined
    this.resolved = undefined
    this.noise = undefined
    this.fields = undefined; this.geometry = undefined; this.key = ''
  }
}
