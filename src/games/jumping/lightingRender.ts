import { nightModeEnabled } from './ambientLight.ts'
import { drawPuzzleWorld } from './challengeRender.ts'
import { drawAthlete, drawClimbables, drawLevelBackdrop, drawMovementEffects, drawTerrain } from './render.ts'
import { levelHeight, levelTerrain } from './level.ts'
import { beamHazeStrength, drawLightFixtures, drawLightHaze } from './lightFixture.ts'
import { polygonPoints } from './geometry.ts'
import type { Vec } from './geometry.ts'
import { isExitEdge } from './lightingBoundary.ts'
import { MechanismLighting } from './lightingStructures.ts'
import { RestingCasters } from './lightingCache.ts'
import { drawWallTexts } from './wallText.ts'
import { emissionPaint, paintNormally } from './worldPaint.ts'
import type { WorldLayer, WorldPaint } from './worldPaint.ts'
import { ambientExposure, lightingPlayerInk, angularFalloff, betweenLightAndView, combineExposure, dynamicCasters, lightReachesView, LightingState, shadowFadeOpacity, shadowFadeRange, shadowQuad, sourceCovered, SPOT_EDGE_WIDTH, staticCasters } from './lightingModel.ts'
import type { CasterGroup, LightSource, LightingDefinition, LightingWorld } from './lightingModel.ts'

export interface LightingView { width: number; height: number; x: number; y: number; zoom: number }
export const lightingPixelRatio = (width: number, height: number, dpr = 1) => Math.min(dpr, 2, Math.sqrt(2_000_000 / Math.max(1, width * height)))
const gray = (value: number) => { const c = Math.round(value * 255); return `rgb(${c},${c},${c})` }
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

/** Shared Canvas lighting renderer. No pixel readbacks or per-object framebuffer allocations. */
export class LightingRenderer {
  readonly state = new LightingState()
  private structures = new MechanismLighting()
  private resting = new RestingCasters()
  private buffers?: { haze: Surface; field: Surface; lamp: Surface; shadow: Surface; correction: Surface; emission: Surface }
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
    const color = (amount: number) => gray(combineExposure(ambient, [strength * amount]))
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
  private world(ctx: CanvasRenderingContext2D, run: LightingWorld, view: LightingView, ink?: string, paint: WorldPaint = paintNormally, sources: readonly LightSource[] = [], editor = false, layer: WorldLayer = 'all', backdrop = paint === paintNormally) {
    ctx.save(); transform(ctx, view)
    // The backdrop precedes every emission, so it cannot occlude one.
    if (backdrop && layer !== 'objects') drawLevelBackdrop(ctx, run.level,
      { x: view.x, y: view.y, w: view.width / view.zoom, h: view.height / view.zoom }, view.zoom)
    if ('elapsed' in run) drawPuzzleWorld(ctx, run, editor, paint, ink, sources, layer)
    else {
      if (layer !== 'objects') drawLightFixtures(ctx, sources, paint)
      if (layer !== 'wall') {
        paint(ctx, 0, () => {
          drawTerrain(ctx, levelTerrain(run.level)); drawClimbables(ctx, run.player, run.level.climbables)
          for (const [i, point] of [run.level.spawn, ...run.level.checkpoints].entries()) {
            ctx.fillStyle = run.player.checkpoint >= i ? '#df633f' : '#a0a3a4'; ctx.fillRect(point.x - 4, point.y - 2, 8, 2)
          }
          drawMovementEffects(ctx, run.player)
        })
        paint(ctx, 1, () => drawAthlete(ctx, run.player, ink))
      }
    }
    ctx.restore()
  }
  render(ctx: CanvasRenderingContext2D, run: LightingWorld, definition: LightingDefinition, view: LightingView, dt: number, onlyLight?: string, editor = false) {
    const sources = this.state.sources(definition, run, dt)
    // Hidden/resizing canvases have no drawable area; drawImage rejects empty buffers.
    if (view.width < 1 || view.height < 1) {
      this.release()
      return { lights: 0, edges: 0, bufferBytes: 0, sources }
    }
    // Study isolation changes the view, never power state or the saved definition.
    const bounds = { x: view.x, y: view.y, w: view.width / view.zoom, h: view.height / view.zoom }
    const activeSources = sources.filter(source => (!onlyLight || source.id === onlyLight) && source.fade > 0 && lightReachesView(source, bounds))
    const nightMode = nightModeEnabled(definition), ink = lightingPlayerInk(nightMode)
    if (!nightMode) {
      if (this.buffers) this.release()
      this.world(ctx, run, view, ink, paintNormally, sources, editor)
      return { lights: 0, edges: 0, bufferBytes: 0, sources }
    }
    if (view.width * view.height > 2_100_000) throw new Error('Lighting viewport exceeds its buffer budget.')
    const buffers = this.buffers ??= { haze: surface(), field: surface(), lamp: surface(), shadow: surface(), correction: surface(), emission: surface() }
    const { haze, field, lamp, shadow, correction, emission } = buffers
    const { width, height } = view
    if (activeSources.length && this.terrain?.level !== run.level) this.terrain = { level: run.level, groups: staticCasters(run) }
    const dynamic = activeSources.length ? dynamicCasters(run) : []
    const structures = activeSources.length ? this.structures.update(this.terrain!.groups, dynamic.filter(group => group.mechanism)) : { fixed: [], moving: [] }
    const moving = [...structures.moving, ...dynamic.filter(group => !group.mechanism)]
    const groups = [...structures.fixed, ...moving]
    const resting = this.resting.update(moving)
    const cacheable = new Set(activeSources.filter(l => !l.mount && l.fade === 1).slice(0, 2).map(l => l.id))
    for (const [id, cached] of this.staticFields) if (!cacheable.has(id)) { cached.buffer.canvas.width = cached.buffer.canvas.height = 0; this.staticFields.delete(id) }
    clear(haze, width, height)
    const ambientColor = gray(ambientExposure(definition.ambient))
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
          clear(shadow, width, height); transform(shadow.ctx, view); shadow.ctx.fillStyle = '#fff'; shadow.ctx.beginPath()
          if (boundary) {
            // Terrain may join around an entire room. Cast from exposed exit
            // edges instead of erasing shadows from all connected receivers.
            for (const edge of boundary) {
              polygonPath(shadow.ctx, shadowQuad(light, edge[0], edge[1], reach)); edges++
            }
            shadow.ctx.fill()
          } else {
            for (const shape of candidates) {
              const points = polygonPoints(shape)
              for (let i = 0; i < points.length; i++) { polygonPath(shadow.ctx, shadowQuad(light, points[i], points[(i + 1) % points.length], reach)); edges++ }
            }
            shadow.ctx.fill()
            // A moving object's assembled silhouette receives light as one front.
            shadow.ctx.globalCompositeOperation = 'destination-out'; shadow.ctx.beginPath()
            for (const shape of candidates) polygonPath(shadow.ctx, polygonPoints(shape))
            shadow.ctx.fill()
          }
          const range = shadowFadeRange(light, group)
          if (range) {
            const x = (light.x - view.x) * view.zoom, y = (light.y - view.y) * view.zoom
            shadow.ctx.resetTransform(); shadow.ctx.globalCompositeOperation = 'destination-in'
            shadow.ctx.fillStyle = this.gradient(`shadow:${x}:${y}:${range.start}:${range.end}:${view.zoom}`, () => {
              const gradient = shadow.ctx.createRadialGradient(x, y, range.start * view.zoom, x, y, range.end * view.zoom)
              for (let i = 0; i <= 16; i++) {
                const t = i / 16
                gradient.addColorStop(t, `rgba(255,255,255,${shadowFadeOpacity(range.start + t * (range.end - range.start), range)})`)
              }
              return gradient
            })
            shadow.ctx.fillRect(0, 0, width, height)
          }
          lamp.ctx.globalCompositeOperation = 'destination-out'; lamp.ctx.globalAlpha = group.opacity ?? 1
          lamp.ctx.drawImage(shadow.canvas, 0, 0); lamp.ctx.globalAlpha = 1
        }
      }
      clear(lamp, width, height)
      const key = `${view.x}:${view.y}:${view.zoom}:${width}:${height}:${definition.ambient}:${light.x}:${light.y}:${light.direction}:${light.spread}`
      const cached = this.staticFields.get(light.id)
      if (cached?.key === key && cached.groups === structures.fixed && cached.resting === resting.fixed) {
        clear(lamp, width, height); lamp.ctx.drawImage(cached.buffer.canvas, 0, 0)
      } else {
        lamp.ctx.save(); transform(lamp.ctx, view)
        lamp.ctx.beginPath(); lamp.ctx.rect(0, 0, run.level.width, levelHeight(run.level)); lamp.ctx.clip()
        lamp.ctx.resetTransform(); this.cone(lamp.ctx, light, view, definition.ambient); lamp.ctx.restore()
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
      drawLightHaze(correction.ctx, light, definition.ambient)
      correction.ctx.resetTransform(); correction.ctx.globalCompositeOperation = 'destination-in'; correction.ctx.drawImage(lamp.canvas, 0, 0)
      haze.ctx.drawImage(correction.canvas, 0, 0)
      lamp.ctx.globalCompositeOperation = 'destination-over'; lamp.ctx.fillStyle = ambientColor; lamp.ctx.fillRect(0, 0, width, height)
      field.ctx.globalCompositeOperation = 'lighten'; field.ctx.drawImage(lamp.canvas, 0, 0)
    }
    this.world(ctx, run, view, ink, paintNormally, sources, editor)
    ctx.save(); ctx.resetTransform(); ctx.globalCompositeOperation = 'multiply'; ctx.drawImage(field.canvas, 0, 0)
    for (const floor of [1, .65] as const) {
      clear(correction, width, height)
      correction.ctx.drawImage(field.canvas, 0, 0)
      correction.ctx.globalCompositeOperation = 'lighten'; correction.ctx.fillStyle = gray(floor); correction.ctx.fillRect(0, 0, width, height)
      correction.ctx.globalCompositeOperation = 'difference'; correction.ctx.drawImage(field.canvas, 0, 0)
      clear(emission, width, height)
      this.world(emission.ctx, run, view, ink, emissionPaint(floor), sources, editor)
      emission.ctx.globalCompositeOperation = 'destination-over'; emission.ctx.fillStyle = '#000'; emission.ctx.fillRect(0, 0, width, height)
      emission.ctx.globalCompositeOperation = 'multiply'; emission.ctx.drawImage(correction.canvas, 0, 0)
      ctx.globalCompositeOperation = 'lighter'; ctx.drawImage(emission.canvas, 0, 0)
    }
    // The same foreground coverage masks both wall corrections and source haze.
    // Draw it once per frame; only alpha is used, including the player's fade.
    clear(shadow, width, height)
    this.world(shadow.ctx, run, view, ink, paintNormally, sources, editor, 'objects')
    // Remove direct illumination from the back-wall layer: it receives ambient
    // only. Masking this subtraction with solid artwork preserves antialiasing
    // and translucent player fades without weakening object-to-object shadows.
    for (const floor of [0, .65] as const) {
      clear(correction, width, height); correction.ctx.drawImage(field.canvas, 0, 0)
      if (floor) { correction.ctx.globalCompositeOperation = 'lighten'; correction.ctx.fillStyle = gray(floor); correction.ctx.fillRect(0, 0, width, height) }
      correction.ctx.globalCompositeOperation = 'difference'; correction.ctx.fillStyle = gray(Math.max(floor, ambientExposure(definition.ambient)))
      correction.ctx.fillRect(0, 0, width, height)
      clear(emission, width, height)
      this.world(emission.ctx, run, view, ink, emissionPaint(floor), sources, editor, 'wall', floor === 0)
      emission.ctx.globalCompositeOperation = 'destination-out'; emission.ctx.drawImage(shadow.canvas, 0, 0)
      emission.ctx.globalCompositeOperation = 'destination-over'; emission.ctx.fillStyle = '#000'; emission.ctx.fillRect(0, 0, width, height)
      emission.ctx.globalCompositeOperation = 'multiply'; emission.ctx.drawImage(correction.canvas, 0, 0)
      ctx.globalCompositeOperation = 'difference'; ctx.drawImage(emission.canvas, 0, 0)
    }
    const erase: WorldPaint = (target, _exposure, draw) => { target.save(); target.globalCompositeOperation = 'destination-out'; draw(); target.restore() }
    const beamStrength = beamHazeStrength(definition.ambient)
    if (beamStrength > 0 && lights) {
      // Reuse the resolved max light field: real occlusion, narrow cone edges,
      // power fades and room clipping, without another light pass or buffer.
      clear(correction, width, height); correction.ctx.drawImage(field.canvas, 0, 0)
      correction.ctx.globalCompositeOperation = 'difference'; correction.ctx.fillStyle = ambientColor
      correction.ctx.fillRect(0, 0, width, height)
      correction.ctx.globalCompositeOperation = 'multiply'; correction.ctx.fillStyle = '#f4f2e9'
      correction.ctx.fillRect(0, 0, width, height)
      correction.ctx.globalCompositeOperation = 'destination-out'; correction.ctx.drawImage(shadow.canvas, 0, 0)
      // The beam is airborne scenery behind readable wall art and physical
      // objects. It must not wash out clocks, coins, text or the player's ink.
      this.world(correction.ctx, run, view, ink, erase, sources, editor, 'wall')
      correction.ctx.save(); transform(correction.ctx, view)
      drawWallTexts(correction.ctx, run.level.texts ?? []); correction.ctx.restore()
      ctx.save(); ctx.globalCompositeOperation = 'lighter'
      ctx.globalAlpha *= beamStrength / (1 - ambientExposure(definition.ambient))
      ctx.drawImage(correction.canvas, 0, 0); ctx.restore()
    }
    // Keep the stronger short source glow behind physical objects and fixtures.
    haze.ctx.globalCompositeOperation = 'destination-out'; haze.ctx.drawImage(shadow.canvas, 0, 0)
    haze.ctx.globalCompositeOperation = 'source-over'
    haze.ctx.save(); transform(haze.ctx, view); drawLightFixtures(haze.ctx, sources, erase); haze.ctx.restore()
    ctx.globalCompositeOperation = 'source-over'; ctx.drawImage(haze.canvas, 0, 0)
    ctx.restore()
    return { lights, edges, bufferBytes: width * height * 4 * (Object.keys(buffers).length + this.staticFields.size), sources }
  }
  release() {
    for (const { canvas } of Object.values(this.buffers ?? {})) canvas.width = canvas.height = 0
    for (const { buffer } of this.staticFields.values()) buffer.canvas.width = buffer.canvas.height = 0
    this.staticFields.clear(); this.resting.reset()
    this.buffers = undefined; this.gradients.clear()
  }
  dispose() { this.release(); this.terrain = undefined; this.structures.reset(); this.state.reset() }
}
