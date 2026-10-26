import { openAirAt, clipOpenAir } from './environment.ts'
import { polygonPoints, pointInside, nearbyBoundary } from './geometry.ts'
import { exposedBoundary, isExitEdge, terrainBoundary, terrainShadowsPoint } from './lightingBoundary.ts'
import type { TerrainEdge } from './lightingBoundary.ts'
import { mechanismShape } from './mechanisms.ts'
import { shadowQuad } from './lightingModel.ts'
import type { LightingWorld } from './lightingModel.ts'
import type { LightingView } from './lightingRender.ts'
import type { JumpLevel } from './level.ts'

const DARK = .35, DAY = .95, REACH = 600
const mirror = (value: number, extent: number) => {
  const period = extent * 2, offset = (value % period + period) % period
  return offset <= extent ? offset : period - offset
}
const gray = (n: number) => { const v = Math.round(n * 255); return `rgb(${v},${v},${v})` }
const buffer = (software = true) => { const canvas = document.createElement('canvas'); return { canvas, ctx: canvas.getContext('2d', { willReadFrequently: software })! } }
type Surface = ReturnType<typeof buffer>
type Portal = { x: number; y: number }
type TerrainBand = { a: readonly [number, number]; b: readonly [number, number]; nx: number; ny: number; host: JumpLevel['platforms'][number]; samples: number[] }
type Scene = { level: JumpLevel; mechanisms: string; portals: Portal[]; edges: TerrainEdge[]; bands: TerrainBand[]; platforms: JumpLevel['platforms'] }

/** Two small CPU fields, the terrain grid, the bounded ambient field, and the
 * GPU-only resolved field. Include small viewports where all fields are native. */
export function environmentBufferBytes(view: LightingView, gpu = false) {
  const scale = Math.min(1, 512 / Math.max(view.width, view.height))
  const width = Math.max(1, Math.ceil(view.width * scale)), height = Math.max(1, Math.ceil(view.height * scale))
  return 4 * (2 * width * height + Math.ceil(width / 4) * Math.ceil(height / 4) + view.width * view.height * (gpu ? 2 : 1))
}

/** Daylight enters through actual gaps in the rock, rather than stopping at a
 * back-wall polygon. These are reflected sky contributions, not powered lamps. */
export function daylightPortals(level: JumpLevel): Portal[] {
  if (!level.environment) return []
  const portals: Portal[] = []
  for (const wall of level.environment.walls) {
    const points = polygonPoints(wall), edges = points.map((p, i): TerrainEdge => [p, points[(i + 1) % points.length]])
    const covers = [...level.platforms, ...level.environment.walls.filter(w => w !== wall)]
    for (const [a, b] of exposedBoundary(edges, covers)) {
      if (a[0] === b[0] && (a[0] === 0 || a[0] === level.width) || a[1] === b[1] && (a[1] === 0 || a[1] === (level.floor ?? level.height))) continue
      const length = Math.hypot(b[0] - a[0], b[1] - a[1]), count = Math.min(4, Math.ceil(length / 80))
      for (let i = 0; i < count; i++) {
        const t = (i + .5) / count, x = a[0] + (b[0] - a[0]) * t, y = a[1] + (b[1] - a[1]) * t
        const nx = (b[1] - a[1]) / length * 2, ny = -(b[0] - a[0]) / length * 2
        const sign = openAirAt(level.environment, x + nx, y + ny) ? 1 : -1
        const outside = { x: x + nx * sign, y: y + ny * sign }, inside = { x: x - nx * sign, y: y - ny * sign }
        if (!openAirAt(level.environment, outside.x, outside.y) || openAirAt(level.environment, inside.x, inside.y)
          || level.platforms.some(p => pointInside(p, outside.x, outside.y) || pointInside(p, inside.x, inside.y))) continue
        portals.push(outside)
      }
    }
  }
  return portals.length <= 12 ? portals : Array.from({ length: 12 }, (_, i) => portals[Math.floor((i + .5) * portals.length / 12)])
}

export function portalExposure(distance: number) {
  const t = Math.max(0, Math.min(1, distance / REACH))
  return DARK + (DAY - DARK) * (1 - t) ** 2
}
function airExposure(level: JumpLevel, portals: Portal[], edges: TerrainEdge[], x: number, y: number) {
  if (!level.environment || openAirAt(level.environment, x, y)) return DAY
  return portals.reduce((value, light) => {
    const distance = Math.hypot(x - light.x, y - light.y)
    return distance < REACH && !terrainShadowsPoint(light, edges, x, y) ? Math.max(value, portalExposure(distance)) : value
  }, DARK)
}

export class EnvironmentLighting {
  private geometry?: Scene
  private fields?: { ambient: Surface; readable: Surface; terrain: Surface }
  private terrainPixels?: ImageData
  private boundedAmbient?: Surface
  private resolved?: Surface
  private key = ''
  private scene(run: LightingWorld) {
    const mechanisms = run.mechanisms.map(m => `${m.x},${m.y},${m.definition.w},${m.definition.h}`).join(';')
    if (this.geometry?.level !== run.level || this.geometry.mechanisms !== mechanisms) {
      const portals = this.geometry?.level === run.level ? this.geometry.portals : daylightPortals(run.level)
      const edges = terrainBoundary([...run.level.platforms, ...run.mechanisms.map(mechanismShape)])
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
        platforms: [...run.level.platforms].sort((p, q) => q.w * q.h - p.w * p.h) }
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
  render(run: LightingWorld, view: LightingView) {
    const scene = this.scene(run)
    const key = `${view.x}:${view.y}:${view.zoom}:${view.width}:${view.height}`
    const fields = this.fields ??= { ambient: buffer(), readable: buffer(), terrain: buffer() }
    // Build each portal in the second retained field, then reuse it for the
    // readability floor. Keep these CPU masks together to avoid GPU readbacks.
    const scratch = fields.readable
    if (this.key === key) return { ...fields, ambient: this.boundedAmbient! }
    const scale = Math.min(1, 512 / Math.max(view.width, view.height)), width = Math.max(1, Math.ceil(view.width * scale)), height = Math.max(1, Math.ceil(view.height * scale))
    const zoom = view.zoom * scale
    const reset = (surface: Surface) => {
      if (surface.canvas.width !== width || surface.canvas.height !== height) { surface.canvas.width = width; surface.canvas.height = height }
      surface.ctx.resetTransform(); surface.ctx.globalAlpha = 1; surface.ctx.globalCompositeOperation = 'source-over'
    }
    reset(fields.ambient)
    const ctx = fields.ambient.ctx, bounds = { x: view.x, y: view.y, w: view.width / view.zoom, h: view.height / view.zoom }
    ctx.fillStyle = gray(DARK); ctx.fillRect(0, 0, width, height)
    ctx.save()
    // A coarse antialiased room clip can leave a partly lit texel where the
    // back wall ends on the same edge. Keep those texels at night ambient;
    // the sky's own full-resolution artwork supplies its exact silhouette.
    const left = Math.ceil(-view.x * zoom), top = Math.ceil(-view.y * zoom)
    const right = Math.floor((run.level.width - view.x) * zoom), bottom = Math.floor(((run.level.floor ?? run.level.height ?? 1020) - view.y) * zoom)
    ctx.beginPath(); ctx.rect(left, top, right - left, bottom - top); ctx.clip()
    ctx.setTransform(zoom, 0, 0, zoom, -view.x * zoom, -view.y * zoom)
    clipOpenAir(ctx, run.level.environment!, bounds)
    ctx.fillStyle = gray(DAY); ctx.fillRect(bounds.x, bounds.y, bounds.w, bounds.h); ctx.restore()
    for (const light of scene.portals) {
      if (light.x + REACH < bounds.x || light.x - REACH > bounds.x + bounds.w || light.y + REACH < bounds.y || light.y - REACH > bounds.y + bounds.h) continue
      reset(scratch)
      const target = scratch.ctx
      target.fillStyle = gray(DARK); target.fillRect(0, 0, width, height)
      target.setTransform(zoom, 0, 0, zoom, -view.x * zoom, -view.y * zoom)
      const gradient = target.createRadialGradient(light.x, light.y, 0, light.x, light.y, REACH)
      for (let i = 0; i <= 12; i++) gradient.addColorStop(i / 12, gray(portalExposure(REACH * i / 12)))
      target.fillStyle = gradient; target.fillRect(light.x - REACH, light.y - REACH, REACH * 2, REACH * 2)
      target.fillStyle = gray(DARK); target.beginPath()
      for (const [a, b] of scene.edges) if (isExitEdge(light, [a, b])) {
        const points = shadowQuad(light, a, b, REACH * 3)
        target.moveTo(points[0][0], points[0][1]); for (const p of points.slice(1)) target.lineTo(p[0], p[1]); target.closePath()
      }
      target.fill(); target.resetTransform()
      ctx.globalCompositeOperation = 'lighten'; ctx.drawImage(scratch.canvas, 0, 0)
    }
    // One small interpolated scalar field joins the surface contributions.
    // Painting individual edge strips creates visible seams at every segment.
    const grid = fields.terrain, gw = Math.max(1, Math.ceil(width / 4)), gh = Math.max(1, Math.ceil(height / 4))
    if (grid.canvas.width !== gw || grid.canvas.height !== gh) { grid.canvas.width = gw; grid.canvas.height = gh; this.terrainPixels = undefined }
    const pixels = this.terrainPixels ??= grid.ctx.createImageData(gw, gh)
    pixels.data.fill(0)
    const levelHeight = run.level.floor ?? run.level.height ?? 1020
    const radius = Math.max(bounds.w / gw, bounds.h / gh) * 2
    for (let row = 0; row < gh; row++) for (let column = 0; column < gw; column++) {
      const x = bounds.x + (column + .5) / gw * bounds.w, y = bounds.y + (row + .5) / gh * bounds.h
      const outside = x < 0 || x > run.level.width || y < 0 || y > levelHeight
      let value = outside ? this.frameExposureAt(run, x, y) : this.terrainValue(scene, x, y)
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
      const offset = (row * gw + column) * 4, shade = Math.round(value * 255)
      pixels.data[offset] = pixels.data[offset + 1] = pixels.data[offset + 2] = shade; pixels.data[offset + 3] = 255
    }
    grid.ctx.putImageData(pixels, 0, 0)
    ctx.save(); ctx.setTransform(zoom, 0, 0, zoom, -view.x * zoom, -view.y * zoom); ctx.beginPath()
    for (const platform of run.level.platforms) { polygonPoints(platform).forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.closePath() }
    ctx.clip(); ctx.resetTransform(); ctx.globalCompositeOperation = 'source-over'; ctx.drawImage(grid.canvas, 0, 0, width, height); ctx.restore()
    reset(fields.readable); fields.readable.ctx.drawImage(fields.ambient.canvas, 0, 0)
    fields.readable.ctx.globalCompositeOperation = 'lighten'; fields.readable.ctx.fillStyle = gray(.65); fields.readable.ctx.fillRect(0, 0, width, height)
    // Filter the small field first, then clip it at the real room boundary.
    // Filtering a clipped low-resolution texture spreads daylight over the
    // enclosing solid and produces a glowing rectangle in zoomed-out views.
    const bounded = this.boundedAmbient ??= buffer()
    if (bounded.canvas.width !== view.width || bounded.canvas.height !== view.height) { bounded.canvas.width = view.width; bounded.canvas.height = view.height }
    const target = bounded.ctx
    target.resetTransform(); target.globalCompositeOperation = 'source-over'; target.fillStyle = gray(DARK); target.fillRect(0, 0, view.width, view.height)
    target.save(); target.setTransform(view.zoom, 0, 0, view.zoom, -view.x * view.zoom, -view.y * view.zoom)
    target.beginPath(); target.rect(0, 0, run.level.width, run.level.floor ?? run.level.height ?? 1020); target.clip(); target.resetTransform()
    target.drawImage(fields.ambient.canvas, 0, 0, view.width, view.height); target.restore()
    // Mirror only exposure across the playable boundary. Carry that same field
    // a filter-width into the room so touching terrain and the frame share one
    // continuous mask. Joining two antialiased clips exactly on the boundary
    // otherwise leaves a dark column through an uninterrupted solid.
    const inset = Math.ceil(Math.max(view.width / width, view.height / height)) + 1
    target.save(); target.beginPath(); target.rect(0, 0, view.width, view.height)
    target.rect(Math.ceil(-view.x * view.zoom) + inset, Math.ceil(-view.y * view.zoom) + inset,
      Math.max(0, Math.floor((run.level.width - view.x) * view.zoom) - Math.ceil(-view.x * view.zoom) - inset * 2),
      Math.max(0, Math.floor(((run.level.floor ?? run.level.height ?? 1020) - view.y) * view.zoom) - Math.ceil(-view.y * view.zoom) - inset * 2))
    target.clip('evenodd'); target.drawImage(grid.canvas, 0, 0, view.width, view.height); target.restore()
    this.key = key
    return { ...fields, ambient: bounded }
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
    this.boundedAmbient = undefined
    this.resolved = undefined
    this.fields = undefined; this.geometry = undefined; this.terrainPixels = undefined; this.key = ''
  }
}
