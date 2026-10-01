import { GpuLightingField } from './lightingGpuField.ts'
import { MIN_NIGHT_AMBIENT, nightModeEnabled } from './ambientLight.ts'
import { BALL_COLOR, drawPuzzleWorld } from './challengeRender.ts'
import { NIGHT_PLAYER_COLOR } from './athlete.ts'
import { athleteCasters } from './athleteShadow.ts'
import { goalEase } from './goal.ts'
import { drawAthlete, drawClimbables, drawLevelBackdrop, drawMovementEffects, drawTerrain } from './render.ts'
import { levelHeight, levelTerrain } from './level.ts'
import { beamHazeStrength, drawLightFixtures, drawLightHaze } from './lightFixture.ts'
import { polygonPoints } from './geometry.ts'
import type { Vec } from './geometry.ts'
import { isExitEdge } from './lightingBoundary.ts'
import { MechanismLighting } from './lightingStructures.ts'
import { RestingCasters } from './lightingCache.ts'
import { drawWallTexts } from './wallText.ts'
import { ambientPaint, ambientSurfacePaint, emissionPaint, paintNormally } from './worldPaint.ts'
import type { WorldLayer, WorldPaint } from './worldPaint.ts'
import { ambientExposure, angularFalloff, betweenLightAndView, dynamicCasters, lightReachesView, LightingState, shadowQuad, sourceCovered, SPOT_EDGE_WIDTH, staticCasters } from './lightingModel.ts'
import type { CasterGroup, LightSource, LightingDefinition, LightingWorld } from './lightingModel.ts'

export interface LightingView { width: number; height: number; x: number; y: number; zoom: number }
export type LightingShadows = 'full' | 'structural'
const BUFFER_BUDGET = 64 * 1024 * 1024
export const lightingPixelRatio = (width: number, height: number, dpr = 1, reduced = false) =>
  Math.min(dpr, reduced ? 1 : 2, Math.sqrt((reduced ? 1_000_000 : 2_000_000) / Math.max(1, width * height)))
const gray = (value: number) => { const c = Math.round(value * 255); return `rgb(${c},${c},${c})` }
const playerContrast = [1, 3, 5].map(i => parseInt(NIGHT_PLAYER_COLOR.slice(i, i + 2), 16) - parseInt(BALL_COLOR.slice(i, i + 2), 16))
const surface = () => {
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')!
  return { canvas, ctx }
}
type Surface = ReturnType<typeof surface>
function clear(buffer: Surface, width: number, height: number) {
  if (buffer.canvas.width !== width || buffer.canvas.height !== height) { buffer.canvas.width = width; buffer.canvas.height = height }
  buffer.ctx.resetTransform(); buffer.ctx.globalCompositeOperation = 'source-over'; buffer.ctx.globalAlpha = 1
  buffer.ctx.clearRect(0, 0, width, height)
}
function transform(ctx: CanvasRenderingContext2D, view: LightingView) { ctx.setTransform(view.zoom, 0, 0, view.zoom, -view.x * view.zoom, -view.y * view.zoom) }
function polygonPath(ctx: CanvasRenderingContext2D, points: readonly Vec[]) {
  // All subpaths wind the same way: overlapping shadow wedges form a union.
  const area = points.reduce((sum, p, i) => { const q = points[(i + 1) % points.length]; return sum + p[0] * q[1] - q[0] * p[1] }, 0)
  const path = area < 0 ? [...points].reverse() : points
  ctx.moveTo(path[0][0], path[0][1])
  for (let i = 1; i < path.length; i++) ctx.lineTo(path[i][0], path[i][1])
  ctx.closePath()
}

/** Shared lighting/composition entry point. GPU light fields are opt-in for the
 * live game; Canvas remains available for previews and compatibility fallback.
 * Neither backend reads pixels or allocates a framebuffer per object. */
export class LightingRenderer {
  readonly state = new LightingState()
  private structures = new MechanismLighting()
  private resting = new RestingCasters()
  private buffers?: { haze: Surface; shadow: Surface; correction: Surface; emission: Surface }
  private canvasFields?: { field: Surface; lamp: Surface }
  private gpu?: GpuLightingField
  private gpuUnavailable = false
  private preferGpu: boolean
  private allowSoftware: boolean
  // Explicit 'gpu' is for renderer experiments, including software-only CI.
  // Live play uses 'auto' so a CPU WebGL driver falls back to Canvas.
  constructor(options: { backend?: 'canvas' | 'auto' | 'gpu' } = {}) {
    this.preferGpu = options.backend === 'auto' || options.backend === 'gpu'
    this.allowSoftware = options.backend === 'gpu'
  }
  private staticFields = new Map<string, { key: string; groups: readonly CasterGroup[]; resting: readonly CasterGroup[]; buffer: Surface }>()
  private gradients = new Map<string, CanvasGradient>()
  private terrain?: { level: LightingWorld['level']; groups: CasterGroup[] }
  prepare(level: LightingWorld['level'], groups: CasterGroup[]) { this.terrain = { level, groups } }
  private gradient(key: string, create: () => CanvasGradient) {
    const cached = this.gradients.get(key)
    if (cached) return cached
    if (this.gradients.size >= 24) this.gradients.delete(this.gradients.keys().next().value!)
    const gradient = create(); this.gradients.set(key, gradient)
    return gradient
  }
  private cone(ctx: CanvasRenderingContext2D, light: LightSource, view: LightingView, ambient: number) {
    const x = (light.x - view.x) * view.zoom, y = (light.y - view.y) * view.zoom
    const direction = light.direction * Math.PI / 180, half = light.spread / 720
    const strength = light.fade
    const color = (amount: number) => gray(ambient + (1 - ambient) * strength * amount)
    const key = `${x}:${y}:${direction}:${half}:${view.zoom}:${ambient}:${strength}`
    ctx.save()
    ctx.fillStyle = color(1); ctx.fillRect(0, 0, view.width, view.height)
    // Intersect two softly edged half planes. Opaque RGB blending keeps the
    // overlap at the lesser exposure instead of multiplying translucent masks.
    ctx.globalCompositeOperation = 'darken'
    for (const side of [-1, 1]) {
      ctx.fillStyle = this.gradient(`${key}:${side}`, () => {
        const angle = direction + side * (Math.PI / 2 - half * Math.PI * 2)
        const gradient = ctx.createLinearGradient(x, y,
          x + Math.cos(angle) * SPOT_EDGE_WIDTH * view.zoom, y + Math.sin(angle) * SPOT_EDGE_WIDTH * view.zoom)
        for (let i = 0; i <= 16; i++) {
          const t = i / 16; gradient.addColorStop(t, color(t * t * (3 - 2 * t)))
        }
        return gradient
      })
      ctx.fillRect(0, 0, view.width, view.height)
    }
    // Near the apex preserve the original narrow angular transition and fully
    // lit center. Farther away the two-unit edge dominates; neither fades out.
    ctx.globalCompositeOperation = 'lighten'
    ctx.fillStyle = this.gradient(`${key}:angular`, () => {
      const gradient = ctx.createConicGradient(direction - Math.PI, x, y)
      gradient.addColorStop(0, color(0))
      for (const side of [-1, 1]) for (let i = 0; i <= 16; i++) {
        const fraction = side === -1 ? 1 - .05 * i / 16 : .95 + .05 * i / 16
        const angle = side * half * Math.PI * 2 * fraction
        gradient.addColorStop(.5 + side * half * fraction, color(angularFalloff(light, Math.cos(angle), Math.sin(angle))))
      }
      gradient.addColorStop(1, color(0))
      return gradient
    })
    ctx.fillRect(0, 0, view.width, view.height); ctx.restore()
  }
  private world(ctx: CanvasRenderingContext2D, run: LightingWorld, view: LightingView, nightMode: boolean, paint: WorldPaint = paintNormally, sources: readonly LightSource[] = [], editor = false, layer: WorldLayer = 'all', backdrop = paint === paintNormally) {
    const ink = nightMode ? NIGHT_PLAYER_COLOR : '#303c36'
    ctx.save(); transform(ctx, view)
    // The backdrop precedes every emission, so it cannot occlude one.
    if (backdrop && layer !== 'objects') drawLevelBackdrop(ctx, run.level,
      { x: view.x, y: view.y, w: view.width / view.zoom, h: view.height / view.zoom }, view.zoom, false)
    // Text is the first wall artwork: empty emission masks need no text erase.
    // Replay it only with the backdrop or when masking the airborne beam.
    if (layer !== 'objects' && (backdrop || layer === 'wall')) paint(ctx, 0, () => drawWallTexts(ctx, run.level.texts ?? [], nightMode))
    if ('elapsed' in run) drawPuzzleWorld(ctx, run, editor, paint, ink, sources, layer)
    else {
      if (layer !== 'objects') drawLightFixtures(ctx, sources, ambientPaint(paint))
      if (layer !== 'wall') {
        paint(ctx, 0, () => {
          drawTerrain(ctx, levelTerrain(run.level))
        }, false)
        paint(ctx, 0, () => {
          drawClimbables(ctx, run.player, run.level.climbables)
          for (const [i, point] of [run.level.spawn, ...run.level.checkpoints].entries()) {
            ctx.fillStyle = run.player.checkpoint >= i ? '#df633f' : '#a0a3a4'; ctx.fillRect(point.x - 4, point.y - 2, 8, 2)
          }
          drawMovementEffects(ctx, run.player)
        })
        paint(ctx, 0, () => drawAthlete(ctx, run.player, ink))
      }
    }
    ctx.restore()
  }
  render(ctx: CanvasRenderingContext2D, run: LightingWorld, definition: LightingDefinition, view: LightingView, dt: number, onlyLight?: string, editor = false, shadows: LightingShadows = 'full', nightAmbient = MIN_NIGHT_AMBIENT) {
    const sources = this.state.sources(definition, run, dt)
    // Hidden/resizing canvases have no drawable area; drawImage rejects empty buffers.
    if (view.width < 1 || view.height < 1) {
      this.release()
      return { lights: 0, edges: 0, bufferBytes: 0, backend: 'canvas' as const, sources }
    }
    // Study isolation changes the view, never power state or the saved definition.
    const bounds = { x: view.x, y: view.y, w: view.width / view.zoom, h: view.height / view.zoom }
    const activeSources = sources.filter(source => (!onlyLight || source.id === onlyLight) && source.fade > 0 && lightReachesView(source, bounds))
    const nightMode = nightModeEnabled(definition)
    if (!nightMode) {
      if (this.buffers) this.release()
      this.world(ctx, run, view, nightMode, paintNormally, sources, editor)
      return { lights: 0, edges: 0, bufferBytes: 0, backend: 'canvas' as const, sources }
    }
    if (view.width * view.height > 2_100_000) throw new Error('Lighting viewport exceeds its buffer budget.')
    const buffers = this.buffers ??= { haze: surface(), shadow: surface(), correction: surface(), emission: surface() }
    const { haze, shadow, correction, emission } = buffers
    const { width, height } = view
    if (activeSources.length && this.terrain?.level !== run.level) this.terrain = { level: run.level, groups: staticCasters(run) }
    const dynamic = activeSources.length ? dynamicCasters(run, shadows === 'full') : []
    const structures = activeSources.length ? this.structures.update(this.terrain!.groups, dynamic.filter(group => group.mechanism)) : { fixed: [], moving: [] }
    const moving = [...structures.moving, ...dynamic.filter(group => !group.mechanism)]
    const groups = [...structures.fixed, ...moving]
    const ambient = ambientExposure(definition.ambient, nightAmbient), ambientColor = gray(ambient)
    let lighting: { lights: number; edges: number; bufferBytes: number; backend: 'gpu' | 'canvas'; drawField: (target: CanvasRenderingContext2D) => void } | undefined
    if (this.preferGpu && !this.gpuUnavailable) {
      this.gpu ??= GpuLightingField.create(this.allowSoftware) ?? undefined
      if (!this.gpu) this.gpuUnavailable = true
      else try {
        const gpu = this.gpu
        const stats = gpu.render(groups, activeSources, view, definition.ambient, run.level.width, levelHeight(run.level), nightAmbient)
        const bufferBytes = stats.bufferBytes + width * height * 16
        if (bufferBytes > BUFFER_BUDGET) throw new Error('GPU lighting exceeds its buffer budget.')
        clear(haze, width, height)
        haze.ctx.drawImage(gpu.canvas, width, 0, width, height, 0, 0, width, height)
        lighting = { ...stats, bufferBytes, backend: 'gpu', drawField: target => target.drawImage(gpu.canvas, 0, 0, width, height, 0, 0, width, height) }
      } catch {
        // Preserve the complete frame and all shadows on unsupported hardware,
        // context loss, memory limits, or an outline the GPU cannot triangulate.
        this.gpu.dispose(); this.gpu = undefined; this.gpuUnavailable = true
      }
    }
    if (!lighting) {
      const { field, lamp } = this.canvasFields ??= { field: surface(), lamp: surface() }
      const resting = this.resting.update(moving)
      // Small viewports can retain more stationary lights within the same 64 MiB
      // budget. At the maximum render size this still permits only two fields.
      const cacheLimit = Math.max(0, Math.floor(BUFFER_BUDGET / (width * height * 4)) - 6)
      const cacheable = new Set(activeSources.filter(l => l.fade === 1 && l.robot === undefined).slice(0, cacheLimit).map(l => l.id))
      for (const [id, cached] of this.staticFields) {
        // Covered lamps may skip rendering, so evict old-size fields now rather
        // than waiting for a cache miss to resize them beyond the current budget.
        if (!cacheable.has(id) || cached.buffer.canvas.width !== width || cached.buffer.canvas.height !== height) {
          cached.buffer.canvas.width = cached.buffer.canvas.height = 0; this.staticFields.delete(id)
        }
      }
      clear(haze, width, height)
      clear(field, width, height); field.ctx.fillStyle = ambientColor; field.ctx.fillRect(0, 0, width, height)
      let edges = 0, lights = 0
      for (const light of activeSources) {
        if (light.fade <= 0 || sourceCovered(light, groups)) continue
        lights++
        const reach = Math.max(...[bounds.x, bounds.x + bounds.w].flatMap(x =>
          [bounds.y, bounds.y + bounds.h].map(y => Math.hypot(x - light.x, y - light.y)))) + 1 / view.zoom
        const cast = (casterGroups: readonly CasterGroup[]) => {
          for (const group of casterGroups) {
            const candidates = group.boundary ? [] : group.filter(shape => betweenLightAndView(shape, light, bounds))
            // Structural boundaries can include long terrain edges beside an
            // offscreen mechanism. Cull by the edges, not by that mechanism's body.
            const boundary = group.boundary?.filter(([a, b]) => isExitEdge(light, [a, b])
              && Math.min(a[0], b[0]) <= Math.max(light.x, bounds.x + bounds.w) && Math.max(a[0], b[0]) >= Math.min(light.x, bounds.x)
              && Math.min(a[1], b[1]) <= Math.max(light.y, bounds.y + bounds.h) && Math.max(a[1], b[1]) >= Math.min(light.y, bounds.y))
            if (!(boundary?.length ?? candidates.length)) continue
            const polygons: Vec[][] = []
            if (boundary) {
              // Terrain may join around an entire room. Cast from exposed exit
              // edges instead of erasing shadows from all connected receivers.
              for (const edge of boundary) {
                polygons.push(shadowQuad(light, edge[0], edge[1], reach))
              }
            } else {
              for (const shape of candidates) {
                const points = polygonPoints(shape)
                for (let i = 0; i < points.length; i++) polygons.push(shadowQuad(light, points[i], points[(i + 1) % points.length], reach))
              }
            }
            // Crop the scratch clear and texture composite to actual projected
            // coverage. Preserve offscreen casters and all antialiased edge pixels.
            let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity
            for (const polygon of polygons) for (const [x, y] of polygon) {
              left = Math.min(left, x); top = Math.min(top, y); right = Math.max(right, x); bottom = Math.max(bottom, y)
            }
            const x = Math.max(0, Math.floor((left - view.x) * view.zoom) - 2)
            const y = Math.max(0, Math.floor((top - view.y) * view.zoom) - 2)
            const w = Math.min(width, Math.ceil((right - view.x) * view.zoom) + 2) - x
            const h = Math.min(height, Math.ceil((bottom - view.y) * view.zoom) + 2) - y
            if (w <= 0 || h <= 0) continue
            if (shadow.canvas.width !== width || shadow.canvas.height !== height) { shadow.canvas.width = width; shadow.canvas.height = height }
            shadow.ctx.resetTransform(); shadow.ctx.globalCompositeOperation = 'source-over'; shadow.ctx.globalAlpha = 1
            shadow.ctx.clearRect(x, y, w, h)
            transform(shadow.ctx, view); shadow.ctx.fillStyle = '#fff'; shadow.ctx.beginPath()
            for (const polygon of polygons) polygonPath(shadow.ctx, polygon)
            shadow.ctx.fill(); edges += polygons.length
            if (!boundary) {
              // A moving object's assembled silhouette receives light as one front.
              shadow.ctx.globalCompositeOperation = 'destination-out'; shadow.ctx.beginPath()
              for (const shape of candidates) polygonPath(shadow.ctx, polygonPoints(shape))
              shadow.ctx.fill()
            }
            lamp.ctx.globalCompositeOperation = 'destination-out'; lamp.ctx.globalAlpha = group.opacity ?? 1
            lamp.ctx.drawImage(shadow.canvas, x, y, w, h, x, y, w, h); lamp.ctx.globalAlpha = 1
          }
        }
        clear(lamp, width, height)
        const key = `${view.x}:${view.y}:${view.zoom}:${width}:${height}:${ambient}:${light.x}:${light.y}:${light.direction}:${light.spread}`
        const cached = this.staticFields.get(light.id)
        if (cached?.key === key && cached.groups === structures.fixed && cached.resting === resting.fixed) {
          lamp.ctx.drawImage(cached.buffer.canvas, 0, 0)
        } else {
          lamp.ctx.save(); transform(lamp.ctx, view)
          lamp.ctx.beginPath(); lamp.ctx.rect(0, 0, run.level.width, levelHeight(run.level)); lamp.ctx.clip()
          lamp.ctx.resetTransform(); this.cone(lamp.ctx, light, view, ambient); lamp.ctx.restore()
          cast(structures.fixed); cast(resting.fixed)
          if (cacheable.has(light.id)) {
            const buffer = cached?.buffer ?? surface()
            clear(buffer, width, height); buffer.ctx.drawImage(lamp.canvas, 0, 0)
            this.staticFields.set(light.id, { key, groups: structures.fixed, resting: resting.fixed, buffer })
          }
        }
        cast(resting.moving)
        // Reuse this lamp's actual shadow mask, before its ambient underlay. The
        // short haze must stop at gates and terrain just like the real beam.
        clear(correction, width, height); transform(correction.ctx, view)
        drawLightHaze(correction.ctx, light, definition.ambient, nightAmbient)
        correction.ctx.resetTransform(); correction.ctx.globalCompositeOperation = 'destination-in'; correction.ctx.drawImage(lamp.canvas, 0, 0)
        haze.ctx.drawImage(correction.canvas, 0, 0)
        lamp.ctx.globalCompositeOperation = 'destination-over'; lamp.ctx.fillStyle = ambientColor; lamp.ctx.fillRect(0, 0, width, height)
        field.ctx.globalCompositeOperation = 'lighten'; field.ctx.drawImage(lamp.canvas, 0, 0)
      }

      lighting = { lights, edges, bufferBytes: width * height * 4 * (6 + this.staticFields.size), backend: 'canvas',
        drawField: target => target.drawImage(field.canvas, 0, 0) }
    }
    const { lights, edges, bufferBytes, backend, drawField } = lighting
    const playerOpacity = run.exit ? 1 - goalEase((run.exit.elapsed - .25) / .5) : 1
    const playerShapes = playerOpacity ? dynamic.find(group => group.player) ?? athleteCasters(run.player) : []
    const playerX = Math.max(0, Math.floor((Math.min(...playerShapes.map(shape => shape.x)) - view.x - 1) * view.zoom) - 1)
    const playerY = Math.max(0, Math.floor((Math.min(...playerShapes.map(shape => shape.y)) - view.y - 1) * view.zoom) - 1)
    const playerRight = Math.min(width, Math.ceil((Math.max(...playerShapes.map(shape => shape.x + shape.w)) - view.x + 1) * view.zoom) + 1)
    const playerBottom = Math.min(height, Math.ceil((Math.max(...playerShapes.map(shape => shape.y + shape.h)) - view.y + 1) * view.zoom) + 1)
    const playerWidth = playerRight - playerX, playerHeight = playerBottom - playerY
    this.world(ctx, run, view, nightMode, paintNormally, sources, editor)
    ctx.save(); ctx.resetTransform(); ctx.globalCompositeOperation = 'multiply'; drawField(ctx)
    for (const floor of [1, .65] as const) {
      clear(correction, width, height)
      drawField(correction.ctx)
      correction.ctx.globalCompositeOperation = 'lighten'; correction.ctx.fillStyle = gray(floor); correction.ctx.fillRect(0, 0, width, height)
      correction.ctx.globalCompositeOperation = 'difference'; drawField(correction.ctx)
      clear(emission, width, height)
      this.world(emission.ctx, run, view, nightMode, emissionPaint(floor), sources, editor)
      emission.ctx.globalCompositeOperation = 'destination-over'; emission.ctx.fillStyle = '#000'; emission.ctx.fillRect(0, 0, width, height)
      emission.ctx.globalCompositeOperation = 'multiply'; emission.ctx.drawImage(correction.canvas, 0, 0)
      ctx.globalCompositeOperation = 'lighter'; ctx.drawImage(emission.canvas, 0, 0)
      if (floor === 1 && playerWidth > 0 && playerHeight > 0) {
        // Match the ball's ambient color while retaining near-white in direct
        // light. The existing (1 - light) field also preserves partial shadows
        // and power fades. Reuse scratch pixels only within the posed figure.
        const tint = `rgb(${playerContrast.map(channel => Math.round(channel * ambient / (1 - ambient))).join(',')})`
        emission.ctx.clearRect(playerX, playerY, playerWidth, playerHeight)
        emission.ctx.save(); emission.ctx.globalCompositeOperation = 'source-over'; emission.ctx.globalAlpha = playerOpacity
        transform(emission.ctx, view); drawAthlete(emission.ctx, run.player, tint); emission.ctx.restore()
        emission.ctx.globalCompositeOperation = 'destination-over'; emission.ctx.fillStyle = '#000'
        emission.ctx.fillRect(playerX, playerY, playerWidth, playerHeight)
        emission.ctx.globalCompositeOperation = 'multiply'
        emission.ctx.drawImage(correction.canvas, playerX, playerY, playerWidth, playerHeight, playerX, playerY, playerWidth, playerHeight)
        ctx.globalCompositeOperation = 'difference'
        ctx.drawImage(emission.canvas, playerX, playerY, playerWidth, playerHeight, playerX, playerY, playerWidth, playerHeight)
      }
    }
    // Foreground coverage keeps both airborne light effects behind solid art.
    // Draw it once per frame; only alpha is used, including the player's fade.
    clear(shadow, width, height)
    this.world(shadow.ctx, run, view, nightMode, paintNormally, sources, editor, 'objects')
    // Structural solids and the back wall receive ambient only. Replay the
    // full artwork order to remove direct light from their visible pixels,
    // preserving objects, emissions and translucent silhouettes in front.
    for (const floor of [0, .65] as const) {
      clear(correction, width, height); drawField(correction.ctx)
      if (floor) { correction.ctx.globalCompositeOperation = 'lighten'; correction.ctx.fillStyle = gray(floor); correction.ctx.fillRect(0, 0, width, height) }
      correction.ctx.globalCompositeOperation = 'difference'; correction.ctx.fillStyle = gray(Math.max(floor, ambient))
      correction.ctx.fillRect(0, 0, width, height)
      clear(emission, width, height)
      this.world(emission.ctx, run, view, nightMode, ambientSurfacePaint(floor), sources, editor, 'all', floor === 0)
      emission.ctx.globalCompositeOperation = 'destination-over'; emission.ctx.fillStyle = '#000'; emission.ctx.fillRect(0, 0, width, height)
      emission.ctx.globalCompositeOperation = 'multiply'; emission.ctx.drawImage(correction.canvas, 0, 0)
      ctx.globalCompositeOperation = 'difference'; ctx.drawImage(emission.canvas, 0, 0)
    }
    const erase: WorldPaint = (target, _exposure, draw) => { target.save(); target.globalCompositeOperation = 'destination-out'; draw(); target.restore() }
    const beamStrength = beamHazeStrength(definition.ambient, nightAmbient)
    if (beamStrength > 0 && lights) {
      // Reuse the resolved max light field: real occlusion, narrow cone edges,
      // power fades and room clipping, without another light pass or buffer.
      clear(correction, width, height); drawField(correction.ctx)
      correction.ctx.globalCompositeOperation = 'difference'; correction.ctx.fillStyle = ambientColor
      correction.ctx.fillRect(0, 0, width, height)
      correction.ctx.globalCompositeOperation = 'multiply'; correction.ctx.fillStyle = '#f4f2e9'
      correction.ctx.fillRect(0, 0, width, height)
      correction.ctx.globalCompositeOperation = 'destination-out'; correction.ctx.drawImage(shadow.canvas, 0, 0)
      // The beam is airborne scenery behind readable wall art and physical
      // objects. It must not wash out clocks, coins, text or the player's ink.
      this.world(correction.ctx, run, view, nightMode, erase, sources, editor, 'wall')
      ctx.save(); ctx.globalCompositeOperation = 'lighter'
      ctx.globalAlpha *= beamStrength / (1 - ambient)
      ctx.drawImage(correction.canvas, 0, 0); ctx.restore()
    }
    // Keep the stronger short source glow behind physical objects and fixtures.
    haze.ctx.globalCompositeOperation = 'destination-out'; haze.ctx.drawImage(shadow.canvas, 0, 0)
    haze.ctx.globalCompositeOperation = 'source-over'
    haze.ctx.save(); transform(haze.ctx, view); drawLightFixtures(haze.ctx, sources, erase); haze.ctx.restore()
    ctx.globalCompositeOperation = 'source-over'; ctx.drawImage(haze.canvas, 0, 0)
    ctx.restore()
    return { lights, edges, bufferBytes, backend, sources }
  }
  release() {
    this.gpu?.dispose(); this.gpu = undefined
    for (const { canvas } of Object.values(this.canvasFields ?? {})) canvas.width = canvas.height = 0
    this.canvasFields = undefined
    for (const { canvas } of Object.values(this.buffers ?? {})) canvas.width = canvas.height = 0
    for (const { buffer } of this.staticFields.values()) buffer.canvas.width = buffer.canvas.height = 0
    this.staticFields.clear(); this.resting.reset()
    this.buffers = undefined; this.gradients.clear()
  }
  dispose() { this.release(); this.terrain = undefined; this.structures.reset(); this.state.reset() }
}
