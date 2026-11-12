/**
 * The WebGL renderer's world frame (docs/jumping-webgl-renderer.md): a whole
 * frame of play drawn by WebGL on its own canvas, in one context, by day or by
 * night, with or without lamps.
 *
 * The artwork is unchanged. The backdrop and the terrain are recorded once per
 * level and zoom and kept on the GPU (retained scenes); everything else is
 * recorded every frame, by running the same drawing functions Canvas runs
 * against a recording context that only keeps what is on screen, and turned
 * into triangles through a cache of shapes already seen. Exposure comes from
 * the `WorldPaint` calls the artwork already makes: the light field where
 * artwork receives light, the ambient level where it does not, at least its
 * readability floor. At night the back wall receives only the ambient, and
 * the lamps reach it through the beam haze, drawn behind the wall's artwork;
 * their glow is drawn behind objects and the fixtures themselves, as Canvas
 * composes both.
 *
 * An environment's regions light its night through the same fields Canvas
 * uses (environmentLighting.ts), copied in; a landscape's sky moves with the
 * camera, so it is drawn every frame, under the back walls, fully exposed.
 *
 * It draws what it can draw exactly and says so: a frame it cannot draw (the
 * studio, artwork the recorder cannot reproduce) is left to Canvas, which draws
 * it as before.
 */
import { drawLevelBackdrop, drawTerrain } from './render.ts'
import { clipOpenAir, drawLandscape, hasRegionLighting } from './environment.ts'
import { EnvironmentLighting } from './environmentLighting.ts'
import { drawPuzzleWorld, drawWaterBackdrop } from './challengeRender.ts'
import { drawWallWiring } from './wallWiring.ts'
import { drawWallTexts } from './wallText.ts'
import { DAY_AMBIENT_EXPOSURE, daylightShadowPolygons } from './daylight.ts'
import { ambientExposure, nightModeEnabled } from './ambientLight.ts'
import { beamHazeStrength, drawLightFixtures } from './lightFixture.ts'
import { lightReachesView, sourceCovered } from './lightingModel.ts'
import { lampShadowGeometry } from './lightingGpuShadows.ts'
import type { Silhouettes } from './lightingGpuShadows.ts'
import { NIGHT_PLAYER_COLOR } from './athleteDraw.ts'
import { ambientPaint } from './worldPaint.ts'
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
import type { LampPlan, RegionPlan } from './webgl/glFrame.ts'

export interface WorldFrameView { x: number; y: number; zoom: number; width: number; height: number; /** The zoom the camera settles at, for the retained scenes. */ restZoom?: number }
/** This frame's shadow casters (LightingRenderer.casters): daylight's structures, fixed and moving, and every group a lamp is blocked by. */
export interface WorldFrameCasters { fixed: readonly CasterGroup[]; moving: readonly CasterGroup[]; all: readonly CasterGroup[] }
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
  /** Caster outlines and triangles, shared by every lamp across frames. */
  private silhouettes: Silhouettes = new WeakMap()
  /** An environment's regional light at night, as Canvas draws its fields. */
  private environment = new EnvironmentLighting()
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

  /** The canvas this frame stands for in the browser tests' frame reports (debugFrames.ts): the game's own, when it has one. */
  private readonly reportCanvas: HTMLCanvasElement | OffscreenCanvas

  constructor(canvas: HTMLCanvasElement | OffscreenCanvas, allowSoftware = false, reportCanvas?: HTMLCanvasElement) {
    this.canvas = canvas; this.allowSoftware = allowSoftware; this.reportCanvas = reportCanvas ?? canvas
    this.gl = GlFrame.create(canvas, allowSoftware)
    // After a lost context comes back, start again: retained scenes are kept and upload on first use.
    canvas.addEventListener('webglcontextrestored', () => { this.gl?.dispose(); this.gl = GlFrame.create(this.canvas, this.allowSoftware) }, { signal: this.listening.signal })
  }

  get available() { return !!this.gl && !this.gl.lost }

  /** Whether this kind of frame is one WebGL draws: play, by day or by night, in any environment. */
  static covers(run: LightingWorld, editor: boolean): run is Run {
    return 'elapsed' in run && !editor
  }

  /**
   * Draw `run` through `view`, or return null to leave the frame to Canvas.
   * `lighting` is the room's lighting this frame (a failed run powers it down),
   * `sources` its lamps with their fades, and `casters` this frame's shadow casters.
   */
  render(run: Run, view: WorldFrameView, lighting: LightingDefinition, casters: WorldFrameCasters, sources: LightSource[]): WorldFrameStats | null {
    const gl = this.gl
    if (!gl || gl.lost) return this.decline('WebGL unavailable')
    if (view.width < 1 || view.height < 1) return this.decline('empty view')
    const level = run.level, shapes = run.terrain
    // A view with no resting zoom (an ending's camera) keeps the level's scenes as built, scaled.
    const restZoom = view.restZoom ?? (this.retained?.level === level ? this.retained.zoom : view.zoom)
    const built = this.retained
    if (!built || built.level !== level || built.shapes !== shapes || built.zoom !== restZoom) this.build(level, shapes, restZoom)
    const retained = this.retained!
    if (retained.failed) return this.decline(retained.failed)

    const started = performance.now()
    // Artwork culls by the canvas's size while it is recorded: size it now, not when the frame is drawn.
    if (gl.canvas.width !== view.width || gl.canvas.height !== view.height) { gl.canvas.width = view.width; gl.canvas.height = view.height }
    // Artwork reads the canvas's size (the same as WebGL's) and reports frames on it.
    const recorder = new GlRecorder(view.zoom, { ...view, canvas: this.reportCanvas })
    const ctx = recorder.asContext()
    const paint: WorldPaint = (_target, exposure, draw, receivesLight = true) => {
      const saved = recorder.light
      recorder.light = light(exposure, receivesLight)
      try { draw() } finally { recorder.light = saved }
    }
    // As LightingRenderer.world draws a run: night inks the player and keeps it readable, and changes the wall's wiring and text.
    const night = nightModeEnabled(lighting), environment = level.environment, regions = night && hasRegionLighting(environment)
    if (!regions) this.environment.release()
    const ink = night ? regions ? this.environment.playerMaterials(run) : NIGHT_PLAYER_COLOR : level.lighting ? '#303c36' : '#686b6e', playerExposure = night ? .65 : 0
    const bounds = { x: view.x, y: view.y, w: view.width / view.zoom, h: view.height / view.zoom }
    const sky = (draw: () => void) => { ctx.save(); ctx.beginPath(); ctx.rect(0, 0, level.width, levelHeight(level)); ctx.clip(); draw(); ctx.restore() }
    withAthletePose(run.player, () => {
      if (!layerSkipped('backdrop')) {
        // A landscape's sky follows the camera: drawn each frame, fully exposed, under the retained back walls.
        if (environment?.kind === 'landscape') paint(ctx, 1, () => sky(() => drawLandscape(ctx, environment, bounds)))
        // The wall carries the camera for the browser tests (debugFrames.ts), as Canvas's own wall does.
        reportWall(this.reportCanvas, () => recorder.getTransform())
        // At night the back wall receives only the ambient; lamps reach it through the beam haze.
        paint(ctx, 0, () => recorder.scene('backdrop'), !night)
      }
      if (!layerSkipped('water')) drawWaterBackdrop(ctx, run, paint)
      // The beam is airborne, behind every piece of wall artwork and every object, and never over the sky.
      if (night) {
        recorder.effect('beam')
        if (environment?.kind === 'landscape') sky(() => { clipOpenAir(ctx, environment, bounds); recorder.effect('unbeam') })
      }
      drawWallWiring(ctx, level, run, paint, night)
      // In regions, each text is lit as the air around it.
      if (regions) for (const text of level.texts ?? []) drawWallTexts(ctx, [text], this.environment.exposureAt(run, text.x + text.w / 2, text.y + text.h / 2) < .7, paint)
      else drawWallTexts(ctx, level.texts ?? [], night, paint)
      drawPuzzleWorld(ctx, run, false, paint, ink, sources, 'wall', playerExposure)
      // The glow sits over the wall's artwork but behind the fixtures it comes from, and behind every object.
      if (night) { recorder.effect('glow'); drawLightFixtures(ctx, sources, ambientPaint(paint)) }
      drawPuzzleWorld(ctx, run, false, paint, ink, sources, 'objects', playerExposure, () => { if (!layerSkipped('terrain')) recorder.scene('terrain') })
    })
    if (recorder.unsupported) return this.decline(recorder.unsupported)
    const recorded = performance.now()

    const builder = this.builder
    builder.reset(zoomStep(view.zoom), view)
    builder.add(recorder.ops)
    builder.finish()
    if (builder.unsupported) return this.decline(builder.unsupported)
    // The field: daylight's shadows, or the night's ambient, and every lamp lighting the view.
    const lampAmbient = night ? ambientExposure(lighting.ambient) : DAY_AMBIENT_EXPOSURE, ambient = Math.round(lampAmbient * 255) / 255
    const sun = night ? { count: 0, edges: 0 } : this.shadows(level, view, casters)
    const lamps = this.lamps(level, view, casters.all, sources)
    const beam = night && lamps.plans.length ? beamHazeStrength(lighting.ambient) / (1 - lampAmbient) : 0
    let regionPlan: RegionPlan | undefined
    if (regions) {
      const fields = this.environment.render(run, view, false)
      regionPlan = { ambient: fields.ambient.canvas, readable: fields.readable.canvas, crop: fields.readableCrop, revision: this.environment.revision, fromField: !lamps.active }
    }
    const tessellated = performance.now()

    gl.render({ passes: builder.passes, textures: builder.textures, vertices: builder.vertexView }, retained.scenes, view,
      { night, triangles: this.field, count: sun.count, shadow: ambient, ambient, lampAmbient, lamps: lamps.plans, beam, regions: regionPlan })
    const drawn = performance.now()
    this.declined = null; this.frames++
    const t = this.totals, s = builder.stats
    t.recordMs += recorded - started; t.buildMs += tessellated - recorded; t.drawMs += drawn - tessellated
    t.ops += s.ops; t.hits += s.hits; t.misses += s.misses; t.ellipses += s.ellipses; t.sprites += s.sprites; t.vertices += builder.count
    return {
      lights: Number(!night) + lamps.plans.length, edges: sun.edges + lamps.edges, bufferBytes: this.bufferBytes(gl, retained.scenes) + lamps.bytes, backend: 'webgl', sources,
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

  /**
   * Every lamp that lights the view: on, reaching it, and not inside a solid
   * caster, as the GPU light field takes them, each with the shadows that block it.
   */
  private lamps(level: JumpLevel, view: WorldFrameView, groups: readonly CasterGroup[], sources: readonly LightSource[]) {
    const plans: LampPlan[] = []
    let edges = 0, bytes = 0, active = 0
    const bounds = { x: view.x, y: view.y, w: view.width / view.zoom, h: view.height / view.zoom }
    const room = [-view.x * view.zoom, -view.y * view.zoom, (level.width - view.x) * view.zoom, (levelHeight(level) - view.y) * view.zoom] as const
    for (const light of sources) {
      if (light.fade <= 0 || !lightReachesView(light, bounds)) continue
      // Lit and in view, even if a solid caster covers it: Canvas then still corrects the night's ambient artwork.
      active++
      if (sourceCovered(light, groups)) continue
      const reach = Math.max(...[bounds.x, bounds.x + bounds.w].flatMap(x => [bounds.y, bounds.y + bounds.h].map(y => Math.hypot(x - light.x, y - light.y)))) + 1 / view.zoom
      const vertices = [0, 0, view.width, 0, view.width, view.height, 0, 0, view.width, view.height, 0, view.height]
      const shadows = lampShadowGeometry(groups, light, view, reach, this.silhouettes, vertices)
      const angle = light.direction * Math.PI / 180
      plans.push({ x: (light.x - view.x) * view.zoom, y: (light.y - view.y) * view.zoom, aimX: Math.cos(angle), aimY: Math.sin(angle),
        halfAngle: light.spread * Math.PI / 360, fade: light.fade, room, vertices: new Float32Array(vertices), batches: shadows.batches })
      edges += shadows.edges; bytes += vertices.length * 4
    }
    return { plans, edges, bytes, active }
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
    // A landscape's sky moves with the camera, so it is drawn every frame instead.
    drawLevelBackdrop(backdrop.asContext(), level, { x: -MARGIN, y: -MARGIN, w: level.width + MARGIN * 2, h: levelHeight(level) + MARGIN * 2 }, zoom, false, level.environment?.kind !== 'landscape')
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

  dispose() {
    this.listening.abort(); this.gl?.dispose(); this.gl = null; this.retained = undefined; this.builder.cache?.clear(); this.builder.sprites?.clear()
    this.environment.release()
  }
}

