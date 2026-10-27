import { backWallPath, regionLighting } from './environment.ts'
import { polygonPoints, polygonArea, pointInside, nearbyBoundary } from './geometry.ts'
import { exposedBoundary, isExitEdge, terrainBoundary, terrainShadowsPoint } from './lightingBoundary.ts'
import type { TerrainEdge } from './lightingBoundary.ts'
import { mechanismShape } from './mechanisms.ts'
import { shadowQuad } from './lightingModel.ts'
import type { LightingWorld } from './lightingModel.ts'
import type { LightingView } from './lightingRender.ts'
import type { JumpLevel } from './level.ts'
import { EnvironmentTerrainField } from './environmentTerrainField.ts'

const DARK = .35, DAY = .95, REACH = 600
const FIELD_MARGIN = 64
type Box = { x: number; y: number; w: number; h: number }
const mirror = (value: number, extent: number) => {
  const period = extent * 2, offset = (value % period + period) % period
  return offset <= extent ? offset : period - offset
}
const gray = (n: number) => { const v = Math.round(n * 255); return `rgb(${v},${v},${v})` }
const buffer = (software = true) => { const canvas = document.createElement('canvas'); return { canvas, ctx: canvas.getContext('2d', { willReadFrequently: software })! } }
type Surface = ReturnType<typeof buffer>
type Portal = { x: number; y: number; a: readonly [number, number]; b: readonly [number, number] }
type TerrainBand = { a: readonly [number, number]; b: readonly [number, number]; nx: number; ny: number; host: JumpLevel['platforms'][number]; samples: number[] }
type Scene = { level: JumpLevel; mechanisms: string; portals: Portal[]; edges: TerrainEdge[]; bands: TerrainBand[]; platforms: JumpLevel['platforms']; solids: JumpLevel['platforms'] }

/** Two small light fields, the terrain grid, the bounded ambient field, and the
 * GPU-only resolved field. Include small viewports where all fields are native. */
export function environmentBufferBytes(view: LightingView, gpu = false) {
  const scale = Math.min(1, 512 / Math.max(view.width, view.height))
  const width = Math.max(1, Math.ceil(view.width * scale)), height = Math.max(1, Math.ceil(view.height * scale))
  return 4 * (2 * (width + FIELD_MARGIN * 2) * (height + FIELD_MARGIN * 2) + (Math.ceil(width / 4) + 2) * (Math.ceil(height / 4) + 2) + view.width * view.height * (gpu ? 2 : 1))
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
  private fields?: { ambient: Surface; readable: Surface; terrain: Surface }
  private terrainPixels?: ImageData
  private terrainGrid = new EnvironmentTerrainField()
  private terrainGridPixels?: Uint8ClampedArray
  private terrainPath?: { scene: Scene; path: Path2D }
  private shadowPaths?: { scene: Scene; paths: Path2D[] }
  private air?: { scene: Scene; zoom: number; width: number; height: number; bounds: Box }
  private readableCrop!: Box
  private software = false
  private boundedAmbient?: Surface
  private resolved?: Surface
  private key = ''
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
      const bands = this.geometry?.level === run.level ? this.geometry.bands : terrainBoundary(run.level.platforms).flatMap(([a, b]) => {
        if (a[0] === b[0] && (a[0] === 0 || a[0] === run.level.width) || a[1] === b[1] && (a[1] === 0 || a[1] === (run.level.floor ?? run.level.height))) return []
        const length = Math.hypot(b[0] - a[0], b[1] - a[1]), nx = -(b[1] - a[1]) / length, ny = (b[0] - a[0]) / length
        const x = (a[0] + b[0]) / 2, y = (a[1] + b[1]) / 2
        const host = run.level.platforms.filter(p => pointInside(p, x + nx * 2, y + ny * 2)).sort((p, q) => q.w * q.h - p.w * p.h)[0]
        if (!host) return []
        return [{ a, b, nx, ny, host, samples: [] as number[] }]
      })
      const sampled = bands.map(band => {
        const count = Math.max(1, Math.ceil(Math.hypot(band.b[0] - band.a[0], band.b[1] - band.a[1]) / 40))
        return { ...band, samples: Array.from({ length: count + 1 }, (_, i) => airExposure(run.level, portals, edges,
          band.a[0] + (band.b[0] - band.a[0]) * i / count - band.nx * 2,
          band.a[1] + (band.b[1] - band.a[1]) * i / count - band.ny * 2)) }
      })
      this.geometry = { level: run.level, mechanisms, portals, bands: sampled, edges,
        platforms: [...run.level.platforms].sort((p, q) => q.w * q.h - p.w * p.h), solids: [...run.level.platforms, ...blockers] }
      this.key = ''
    }
    return this.geometry
  }
  exposureAt(run: LightingWorld, x: number, y: number) {
    const { portals, edges } = this.scene(run)
    return airExposure(run.level, portals, edges, x, y)
  }
  private terrainValue(scene: Scene, x: number, y: number, selected?: JumpLevel['platforms'][number]) {
    const host = selected ?? scene.platforms.find(p => x >= p.x && x <= p.x + p.w && y >= p.y && y <= p.y + p.h && pointInside(p, x, y))
    if (!host) return null
    // Interpolate actual exposed surfaces, without an outdoor baseline for the
    // entire solid. A single mass can join a sunlit roof to a deep cave wall.
    // Distance weighting keeps its nearby dark faces dark all the way down.
    let weight = 0, total = 0
    for (const band of scene.bands) {
      if (band.host !== host) continue
      const dx = band.b[0] - band.a[0], dy = band.b[1] - band.a[1], length2 = dx * dx + dy * dy
      const t = Math.max(0, Math.min(1, ((x - band.a[0]) * dx + (y - band.a[1]) * dy) / length2))
      const distance = Math.hypot(x - band.a[0] - dx * t, y - band.a[1] - dy * t)
      const sample = t * (band.samples.length - 1), index = Math.min(band.samples.length - 2, Math.floor(sample))
      const exposure = band.samples[index] + (band.samples[index + 1] - band.samples[index]) * (sample - index)
      const contribution = 1 / (distance + 3) ** 2
      total += exposure * contribution; weight += contribution
    }
    return weight ? total / weight : DARK
  }
  terrainExposureAt(run: LightingWorld, x: number, y: number) { return this.terrainValue(this.scene(run), x, y) }
  frameExposureAt(run: LightingWorld, x: number, y: number) {
    const scene = this.scene(run), mx = mirror(x, run.level.width), my = mirror(y, run.level.floor ?? run.level.height ?? 1020)
    return this.terrainValue(scene, mx, my) ?? airExposure(run.level, scene.portals, scene.edges, mx, my)
  }
  playerInk(run: LightingWorld) {
    const exposure = this.exposureAt(run, run.player.x, run.player.y - 31)
    // These keys select the actual android materials. Arbitrary CSS colors
    // intentionally select a monochrome diagnostic mask in androidArtwork.
    return exposure >= .7 ? '#303c36' : '#e5e7e6'
  }
  render(run: LightingWorld, view: LightingView, software = false) {
    if (this.software !== software) { this.release(); this.software = software }
    const scene = this.scene(run)
    const key = `${view.x}:${view.y}:${view.zoom}:${view.width}:${view.height}`
    const fields = this.fields ??= { ambient: buffer(software), readable: buffer(software), terrain: buffer() }
    // Build each portal in the second retained field, then reuse it for the
    // readability floor. These fields never read pixels; keep their blends on
    // the GPU and upload only the small CPU-authored terrain sample grid.
    const scratch = fields.readable
    if (this.key === key) return { ...fields, ambient: this.boundedAmbient!, readableCrop: this.readableCrop }
    const scale = Math.min(1, 512 / Math.max(view.width, view.height)), width = Math.max(1, Math.ceil(view.width * scale)), height = Math.max(1, Math.ceil(view.height * scale))
    const zoom = view.zoom * scale
    const bounds = { x: view.x, y: view.y, w: view.width / view.zoom, h: view.height / view.zoom }
    const fieldWidth = width + FIELD_MARGIN * 2, fieldHeight = height + FIELD_MARGIN * 2, border = 2 / zoom
    const rebuildAir = this.air?.scene !== scene || this.air.zoom !== zoom || this.air.width !== fieldWidth || this.air.height !== fieldHeight
      || bounds.x < this.air.bounds.x + border || bounds.y < this.air.bounds.y + border
      || bounds.x + bounds.w > this.air.bounds.x + this.air.bounds.w - border || bounds.y + bounds.h > this.air.bounds.y + this.air.bounds.h - border
    if (rebuildAir) this.air = { scene, zoom, width: fieldWidth, height: fieldHeight,
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
      for (const [index, light] of scene.portals.entries()) {
        if (Math.max(light.a[0], light.b[0]) + REACH < fieldBounds.x || Math.min(light.a[0], light.b[0]) - REACH > fieldBounds.x + fieldBounds.w
          || Math.max(light.a[1], light.b[1]) + REACH < fieldBounds.y || Math.min(light.a[1], light.b[1]) - REACH > fieldBounds.y + fieldBounds.h) continue
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
    }
    // One small interpolated scalar field joins the surface contributions.
    // Painting individual edge strips creates visible seams at every segment.
    const grid = fields.terrain, columns = Math.max(1, Math.ceil(width / 4)), rows = Math.max(1, Math.ceil(height / 4))
    const stepX = bounds.w / columns, stepY = bounds.h / rows
    const levelHeight = run.level.floor ?? run.level.height ?? 1020
    const radius = Math.max(stepX, stepY) * 2
    const samples = this.terrainGrid.update(scene, bounds.x, bounds.y, columns, rows, stepX, stepY, (x, y) => {
      const outside = x < 0 || x > run.level.width || y < 0 || y > levelHeight
      const mx = outside ? mirror(x, run.level.width) : x, my = outside ? mirror(y, levelHeight) : y
      let value = outside ? this.terrainValue(scene, mx, my) ?? airExposure(run.level, scene.portals, scene.edges, mx, my) : this.terrainValue(scene, x, y)
      if (!outside && value === null) {
        // Extend the surface color beyond the coarse mask, then clip at the
        // exact silhouette below. Transparent grid cells otherwise leave dark
        // dots along bright top edges after interpolation.
        let distance = radius
        for (const platform of scene.platforms) {
          const hit = nearbyBoundary(platform, x, y, radius)
          if (hit && hit.distance < distance) { value = this.terrainValue(scene, hit.x, hit.y, platform); distance = hit.distance }
        }
      }
      if (value === null) value = Math.min(x, run.level.width - x, y, levelHeight - y) < radius
        ? airExposure(run.level, scene.portals, scene.edges, x, y) : DAY
      return value
    })
    if (this.terrainGridPixels !== samples.pixels) {
      if (grid.canvas.width !== samples.width || grid.canvas.height !== samples.height) {
        grid.canvas.width = samples.width; grid.canvas.height = samples.height; this.terrainPixels = undefined
      }
      const pixels = this.terrainPixels ??= grid.ctx.createImageData(samples.width, samples.height)
      pixels.data.set(samples.pixels); grid.ctx.putImageData(pixels, 0, 0); this.terrainGridPixels = samples.pixels
    }
    if (this.terrainPath?.scene !== scene) {
      const path = new Path2D()
      for (const platform of run.level.platforms) { polygonPoints(platform).forEach(([x, y], i) => i ? path.lineTo(x, y) : path.moveTo(x, y)); path.closePath() }
      this.terrainPath = { scene, path }
    }
    const drawGrid = (target: CanvasRenderingContext2D) => target.drawImage(grid.canvas,
      samples.column * stepX, samples.row * stepY, samples.width * stepX, samples.height * stepY)
    // Filter the small field first, then clip it at the real room boundary.
    // Filtering a clipped low-resolution texture spreads daylight over the
    // enclosing solid and produces a glowing rectangle in zoomed-out views.
    const bounded = this.boundedAmbient ??= buffer(software)
    if (bounded.canvas.width !== view.width || bounded.canvas.height !== view.height) { bounded.canvas.width = view.width; bounded.canvas.height = view.height }
    const target = bounded.ctx
    target.resetTransform(); target.globalCompositeOperation = 'source-over'; target.fillStyle = gray(DARK); target.fillRect(0, 0, view.width, view.height)
    target.save(); target.setTransform(view.zoom, 0, 0, view.zoom, -view.x * view.zoom, -view.y * view.zoom)
    target.beginPath(); target.rect(0, 0, run.level.width, run.level.floor ?? run.level.height ?? 1020); target.clip(); target.resetTransform()
    target.drawImage(fields.ambient.canvas, readableCrop.x, readableCrop.y, readableCrop.w, readableCrop.h, 0, 0, view.width, view.height)
    // Filter terrain exposure first, then clip at the final pixel silhouette.
    // Clipping the small field before enlarging it leaks bright rock pixels
    // into the back wall, producing a halo underneath slopes and overhangs.
    target.setTransform(view.zoom, 0, 0, view.zoom, -view.x * view.zoom, -view.y * view.zoom)
    target.clip(this.terrainPath.path); drawGrid(target); target.restore()
    // Mirror only exposure across the playable boundary. Carry that same field
    // a filter-width into the room so touching terrain and the frame share one
    // continuous mask. Joining two antialiased clips exactly on the boundary
    // otherwise leaves a dark column through an uninterrupted solid.
    const inset = Math.ceil(Math.max(view.width / width, view.height / height)) + 1
    target.save(); target.beginPath(); target.rect(0, 0, view.width, view.height)
    target.rect(Math.ceil(-view.x * view.zoom) + inset, Math.ceil(-view.y * view.zoom) + inset,
      Math.max(0, Math.floor((run.level.width - view.x) * view.zoom) - Math.ceil(-view.x * view.zoom) - inset * 2),
      Math.max(0, Math.floor(((run.level.floor ?? run.level.height ?? 1020) - view.y) * view.zoom) - Math.ceil(-view.y * view.zoom) - inset * 2))
    target.clip('evenodd'); target.setTransform(view.zoom, 0, 0, view.zoom, -view.x * view.zoom, -view.y * view.zoom); drawGrid(target); target.restore()
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
    this.terrainGrid.clear(); this.terrainGridPixels = undefined; this.terrainPath = undefined
    this.shadowPaths = undefined
    this.air = undefined
    this.boundedAmbient = undefined
    this.resolved = undefined
    this.fields = undefined; this.geometry = undefined; this.terrainPixels = undefined; this.key = ''
  }
}
