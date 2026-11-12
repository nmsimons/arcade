/**
 * Phase 2 of the WebGL renderer (docs/jumping-webgl-renderer.md): a whole
 * daylight frame drawn by WebGL on its own canvas, in one context.
 *
 * The artwork is unchanged. The backdrop and the terrain are recorded once per
 * level and zoom and kept on the GPU (retained scenes); everything else is
 * recorded every frame, by running the same drawing functions Canvas runs
 * against a recording context that only keeps what is on screen, and turned
 * into triangles through a cache of shapes already seen. Exposure comes from
 * the `WorldPaint` calls the artwork already makes: the light field where
 * artwork receives light, the ambient level where it does not, at least its
 * readability floor.
 *
 * It draws what it can draw exactly and says so: a frame it cannot draw (night,
 * lamps, environments, the studio, artwork the recorder cannot reproduce) is
 * left to Canvas, which draws it as before.
 */
import { drawLevelBackdrop, drawTerrain } from './render.ts'
import { drawPuzzleWorld, drawWaterBackdrop } from './challengeRender.ts'
import { drawWallWiring } from './wallWiring.ts'
import { drawWallTexts } from './wallText.ts'
import { DAY_AMBIENT_EXPOSURE, daylightShadowPolygons } from './daylight.ts'
import { nightModeEnabled } from './ambientLight.ts'
import { levelHeight } from './level.ts'
import type { JumpLevel } from './level.ts'
import type { Platform } from './model.ts'
import type { Run } from './challenge.ts'
import type { CasterGroup, LightSource, LightingDefinition, LightingWorld } from './lightingModel.ts'
import type { Vec } from './geometry.ts'
import type { Exposure, WorldPaint } from './worldPaint.ts'
import { layerSkipped } from './measureLayers.ts'
import { withAthletePose } from './athletePose.ts'
import { reportWall } from './debugFrames.ts'
import { GlRecorder } from './webgl/recorder.ts'
import type { Light } from './webgl/recorder.ts'
import { SceneBuilder, ShapeCache, buildScene } from './webgl/scene.ts'
import type { Scene } from './webgl/scene.ts'
import { SpriteCache } from './webgl/sprites.ts'
import { GlFrame } from './webgl/glFrame.ts'

export interface WorldFrameView { x: number; y: number; zoom: number; width: number; height: number; /** The zoom the camera settles at, for the retained scenes. */ restZoom?: number }
export interface WorldFrameStats {
  lights: number; edges: number; bufferBytes: number; backend: 'webgl'; sources: LightSource[]
  ops: number; hits: number; misses: number; ellipses: number; sprites: number; vertices: number; passes: number; recordMs: number; buildMs: number; drawMs: number
}

/** Far enough past the level's edges that the surrounding rock fills any view. */
const MARGIN = 10000
/** Shapes tessellated at one zoom serve zooms within an eighth of an octave, so the cache survives a zoom animation. */
const zoomStep = (zoom: number) => 2 ** (Math.round(Math.log2(zoom) * 8) / 8)
/** One shared exposure class per floor and receipt of light: the six a `WorldPaint` call can name. */
const LIGHTS: readonly Light[] = ([0, .65, 1] as const).flatMap(floor => [{ floor, receives: false }, { floor, receives: true }])
const light = (floor: Exposure, receives: boolean) => LIGHTS[(floor === 1 ? 4 : floor === .65 ? 2 : 0) + (receives ? 1 : 0)]

export class WebGLWorldFrame {
  private gl: GlFrame | null
  private readonly canvas: HTMLCanvasElement | OffscreenCanvas
  private readonly allowSoftware: boolean
  private readonly listening = new AbortController()
  private builder = new SceneBuilder(new ShapeCache(), new SpriteCache())
  private retained?: { level: JumpLevel; shapes: readonly Platform[]; zoom: number; scenes: Map<string, Scene>; buildMs: number; failed: string | null }
  private fixedShadows?: { groups: readonly CasterGroup[]; level: JumpLevel; triangles: number[]; edges: number }
  private field = new Float32Array(4096)
  /** Why the last frame was left to Canvas, and how often each reason has come up, for diagnostics. */
  declined: string | null = null
  readonly declines: Record<string, number> = {}
  frames = 0
  /** Sums over the frames drawn, for diagnostics: milliseconds recording, building and drawing, and the builder's operations. */
  readonly totals = { recordMs: 0, buildMs: 0, drawMs: 0, ops: 0, hits: 0, misses: 0, ellipses: 0, sprites: 0, vertices: 0 }
  private decline(reason: string) {
    this.declined = reason; this.declines[reason] = (this.declines[reason] ?? 0) + 1
    return null
  }

  constructor(canvas: HTMLCanvasElement | OffscreenCanvas, allowSoftware = false) {
    this.canvas = canvas; this.allowSoftware = allowSoftware
    this.gl = GlFrame.create(canvas, allowSoftware)
    // After a lost context comes back, start again: retained scenes are kept and upload on first use.
    canvas.addEventListener('webglcontextrestored', () => { this.gl?.dispose(); this.gl = GlFrame.create(this.canvas, this.allowSoftware) }, { signal: this.listening.signal })
  }

  get available() { return !!this.gl && !this.gl.lost }

  /** Whether this kind of frame is one WebGL draws: daylight play without lamps or an environment. */
  static covers(run: LightingWorld, lighting: LightingDefinition, sources: readonly LightSource[], editor: boolean): run is Run {
    return 'elapsed' in run && !editor && !nightModeEnabled(lighting) && !sources.length && !run.level.environment
  }

  /**
   * Draw `run` through `view`, or return null to leave the frame to Canvas.
   * `casters` are daylight's structural shadow casters this frame.
   */
  render(run: Run, view: WorldFrameView, casters: { fixed: readonly CasterGroup[]; moving: readonly CasterGroup[] }, sources: LightSource[]): WorldFrameStats | null {
    const gl = this.gl
    if (!gl || gl.lost) return this.decline('WebGL unavailable')
    if (view.width < 1 || view.height < 1) return this.decline('empty view')
    const level = run.level, shapes = run.terrain
    const restZoom = view.restZoom ?? view.zoom
    const built = this.retained
    if (!built || built.level !== level || built.shapes !== shapes || built.zoom !== restZoom) this.build(level, shapes, restZoom)
    const retained = this.retained!
    if (retained.failed) return this.decline(retained.failed)

    const started = performance.now()
    // Artwork culls by the canvas's size while it is recorded: size it now, not when the frame is drawn.
    if (gl.canvas.width !== view.width || gl.canvas.height !== view.height) { gl.canvas.width = view.width; gl.canvas.height = view.height }
    const recorder = new GlRecorder(view.zoom, { ...view, canvas: gl.canvas })
    const ctx = recorder.asContext()
    const paint: WorldPaint = (_target, exposure, draw, receivesLight = true) => {
      const saved = recorder.light
      recorder.light = light(exposure, receivesLight)
      try { draw() } finally { recorder.light = saved }
    }
    const ink = level.lighting ? '#303c36' : '#686b6e'
    withAthletePose(run.player, () => {
      if (!layerSkipped('backdrop')) {
        // The wall carries the camera for the browser tests (debugFrames.ts), as Canvas's own wall does.
        reportWall(gl.canvas, () => recorder.getTransform())
        recorder.scene('backdrop')
      }
      if (!layerSkipped('water')) drawWaterBackdrop(ctx, run, paint)
      drawWallWiring(ctx, level, run, paint, false)
      drawWallTexts(ctx, level.texts ?? [], false, paint)
      drawPuzzleWorld(ctx, run, false, paint, ink, [], 'all', 0, () => { if (!layerSkipped('terrain')) recorder.scene('terrain') })
    })
    if (recorder.unsupported) return this.decline(recorder.unsupported)
    const recorded = performance.now()

    const builder = this.builder
    builder.reset(zoomStep(view.zoom), view)
    builder.add(recorder.ops)
    builder.finish()
    if (builder.unsupported) return this.decline(builder.unsupported)
    const shadow = Math.round(DAY_AMBIENT_EXPOSURE * 255) / 255
    const { count, edges } = this.shadows(level, view, casters)
    const tessellated = performance.now()

    gl.render({ passes: builder.passes, textures: builder.textures, vertices: builder.vertexView }, retained.scenes, view,
      { triangles: this.field, count, shadow, ambient: shadow })
    const drawn = performance.now()
    this.declined = null; this.frames++
    const t = this.totals, s = builder.stats
    t.recordMs += recorded - started; t.buildMs += tessellated - recorded; t.drawMs += drawn - tessellated
    t.ops += s.ops; t.hits += s.hits; t.misses += s.misses; t.ellipses += s.ellipses; t.sprites += s.sprites; t.vertices += builder.count
    return {
      lights: 1, edges, bufferBytes: this.bufferBytes(gl, retained.scenes), backend: 'webgl', sources,
      ...builder.stats, vertices: builder.count, passes: builder.passes.length,
      recordMs: recorded - started, buildMs: tessellated - recorded, drawMs: drawn - tessellated,
    }
  }

  /**
   * GPU memory the frame holds, as the lighting allowance counts it (64 MiB with
   * Canvas's lighting): targets, retained scenes, this frame's vertices, cached
   * shapes (5 floats a vertex) and sprites.
   */
  private bufferBytes(gl: GlFrame, scenes: ReadonlyMap<string, Scene>) {
    let retained = 0
    for (const scene of scenes.values()) retained += scene.vertices.byteLength
    return gl.targetBytes + retained + this.builder.count * 24 + (this.builder.cache?.size ?? 0) * 20 + (this.builder.sprites?.pixelBytes ?? 0)
  }

  /** Daylight's shadow triangles for this view: the fixed structures' once per arrangement, moving ones every frame. */
  private shadows(level: JumpLevel, view: WorldFrameView, casters: { fixed: readonly CasterGroup[]; moving: readonly CasterGroup[] }) {
    const width = level.width, height = levelHeight(level)
    const triangles = (polygons: Vec[][], out: number[]) => {
      for (const polygon of polygons) for (let i = 1; i < polygon.length - 1; i++)
        out.push(polygon[0][0], polygon[0][1], polygon[i][0], polygon[i][1], polygon[i + 1][0], polygon[i + 1][1])
      return polygons.length
    }
    if (this.fixedShadows?.groups !== casters.fixed || this.fixedShadows.level !== level) {
      // Parallel rays: a shadow cast for the whole level is the same shape within any view.
      const out: number[] = []
      const edges = triangles(daylightShadowPolygons(casters.fixed.flatMap(group => group.boundary ?? []),
        { x: -MARGIN, y: -MARGIN, w: width + MARGIN * 2, h: height + MARGIN * 2 }, width, height), out)
      this.fixedShadows = { groups: casters.fixed, level, triangles: out, edges }
    }
    const moving: number[] = []
    const movingEdges = casters.moving.length ? triangles(daylightShadowPolygons(casters.moving.flatMap(group => group.boundary ?? []),
      { x: view.x, y: view.y, w: view.width / view.zoom, h: view.height / view.zoom }, width, height), moving) : 0
    const fixed = this.fixedShadows.triangles, total = fixed.length + moving.length
    if (this.field.length < total) this.field = new Float32Array(total * 2)
    this.field.set(fixed); this.field.set(moving, fixed.length)
    return { count: total / 2, edges: this.fixedShadows.edges + movingEdges }
  }

  private build(level: JumpLevel, shapes: readonly Platform[], zoom: number) {
    const started = performance.now()
    if (this.retained) for (const scene of this.retained.scenes.values()) this.gl?.forget(scene)
    const backdrop = new GlRecorder(zoom)
    drawLevelBackdrop(backdrop.asContext(), level, { x: -MARGIN, y: -MARGIN, w: level.width + MARGIN * 2, h: levelHeight(level) + MARGIN * 2 }, zoom, false, true)
    const ground = new GlRecorder(zoom)
    drawTerrain(ground.asContext(), shapes, level.platforms, level)
    const failed = backdrop.unsupported ?? ground.unsupported
    const scenes = new Map<string, Scene>()
    if (!failed) { scenes.set('backdrop', buildScene(backdrop.ops, zoom)); scenes.set('terrain', buildScene(ground.ops, zoom)) }
    this.retained = { level, shapes, zoom, scenes, buildMs: performance.now() - started, failed }
  }

  /** The retained scenes' build, for diagnostics. */
  get retainedStats() {
    const r = this.retained
    if (!r) return undefined
    const scenes = [...r.scenes.values()]
    return { zoom: r.zoom, buildMs: r.buildMs, failed: r.failed, vertices: scenes.reduce((n, s) => n + s.vertexCount, 0), passes: scenes.reduce((n, s) => n + s.passes.length, 0),
      cached: this.builder.cache?.size ?? 0, sprites: this.builder.sprites?.size ?? 0 }
  }

  dispose() { this.listening.abort(); this.gl?.dispose(); this.gl = null; this.retained = undefined; this.builder.cache?.clear(); this.builder.sprites?.clear() }
}

