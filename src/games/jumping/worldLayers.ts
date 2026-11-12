/**
 * Phase 1 of the WebGL renderer (docs/jumping-webgl-renderer.md): the backdrop
 * and the terrain drawn by WebGL from retained meshes, and placed by the Canvas
 * frame at their usual points in its drawing order, so lighting, shadows and
 * every other layer stay as they are.
 *
 * The meshes come from the ordinary artwork functions, run once against a
 * recording context. They are rebuilt when the level or the camera's zoom
 * changes; a zoom still animating draws with Canvas until it settles. A layer
 * whose artwork uses something the recorder cannot reproduce stays on Canvas.
 */
import { drawLevelBackdrop, drawTerrain } from './render.ts'
import { levelHeight, levelTerrain } from './level.ts'
import type { JumpLevel } from './level.ts'
import type { Platform } from './model.ts'
import { GlRecorder } from './webgl/recorder.ts'
import { buildScene } from './webgl/scene.ts'
import type { Scene } from './webgl/scene.ts'
import { GlFrame } from './webgl/glFrame.ts'
import type { FieldPlan, FrameView as LayerView } from './webgl/glFrame.ts'

/**
 * This frame's pictures. Chrome charges about 1 ms of main-thread time per frame
 * to a canvas that draws a picture from another GPU context, however many and
 * however they are handed over (bitmap, relay canvas or the WebGL canvas
 * itself, all measured); that cost leaves when one WebGL context draws the
 * whole frame (phase 2).
 */
export interface WorldLayerFrame { view: LayerView; readonly backdrop?: ImageBitmap; readonly terrain?: ImageBitmap; release(): void }
export interface WorldLayerStats { backdrop: 'webgl' | string; terrain: 'webgl' | string; vertices: number; passes: number; buildMs: number }

/** Far enough past the level's edges that the surrounding rock fills any view. */
const MARGIN = 10000

/** No shadows: a picture for the Canvas frame is drawn unexposed, and the Canvas frame lights it. */
const UNLIT: FieldPlan = { night: false, triangles: new Float32Array(0), count: 0, shadow: 1, ambient: 1, lampAmbient: 1, lamps: [], beam: 0 }

export class WebGLWorldLayers {
  private gl: GlFrame | null | undefined
  private canvas?: OffscreenCanvas
  private built?: { level: JumpLevel; shapes: readonly Platform[]; zoom: number; backdrop: Scene | null; terrain: Scene | null; map: Map<string, Scene>; stats: WorldLayerStats }
  private lastZoom = NaN
  private readonly allowSoftware: boolean
  constructor(allowSoftware = false) { this.allowSoftware = allowSoftware }

  get stats() { return this.built?.stats }

  /** This frame's layers, or null to draw both with Canvas. The caller closes the bitmaps. */
  frame(level: JumpLevel, terrain: readonly Platform[] | undefined, view: LayerView): WorldLayerFrame | null {
    if (level.environment || view.width < 1 || view.height < 1) return null
    if (this.gl === undefined) {
      this.canvas = typeof OffscreenCanvas === 'undefined' ? undefined : new OffscreenCanvas(1, 1)
      this.gl = this.canvas ? GlFrame.create(this.canvas, this.allowSoftware, true) : null
    }
    if (!this.gl || this.gl.lost) return null
    const shapes = terrain ?? levelTerrain(level)
    const zoom = view.zoom, settled = zoom === this.lastZoom
    this.lastZoom = zoom
    const built = this.built
    if (!built || built.level !== level || built.shapes !== shapes || built.zoom !== zoom) {
      if (!settled) return null
      this.build(level, shapes, zoom)
    }
    const scenes = this.built!, gl = this.gl, canvas = this.canvas!
    if (!scenes.backdrop && !scenes.terrain) return null
    const bitmaps = (['backdrop', 'terrain'] as const).map(name => {
      if (!scenes[name]) return undefined
      gl.render({ passes: [{ kind: 'scene', name, depth: 0, light: null }], textures: [], vertices: new Uint8Array(0) }, scenes.map, view, UNLIT)
      return canvas.transferToImageBitmap()
    })
    return { view: { ...view }, backdrop: bitmaps[0], terrain: bitmaps[1], release() { for (const bitmap of bitmaps) bitmap?.close() } }
  }

  private build(level: JumpLevel, shapes: readonly Platform[], zoom: number) {
    const started = performance.now()
    if (this.built) for (const scene of [this.built.backdrop, this.built.terrain]) if (scene) this.gl?.forget(scene)
    const backdrop = new GlRecorder(zoom)
    drawLevelBackdrop(backdrop.asContext(), level,
      { x: -MARGIN, y: -MARGIN, w: level.width + MARGIN * 2, h: levelHeight(level) + MARGIN * 2 }, zoom, false, true)
    const ground = new GlRecorder(zoom)
    drawTerrain(ground.asContext(), shapes, level.platforms, level)
    const backdropScene = backdrop.unsupported ? null : buildScene(backdrop.ops, zoom)
    const terrainScene = ground.unsupported ? null : buildScene(ground.ops, zoom)
    const stats: WorldLayerStats = {
      backdrop: backdrop.unsupported ?? 'webgl', terrain: ground.unsupported ?? 'webgl',
      vertices: (backdropScene?.vertexCount ?? 0) + (terrainScene?.vertexCount ?? 0),
      passes: (backdropScene?.passes.length ?? 0) + (terrainScene?.passes.length ?? 0),
      buildMs: performance.now() - started,
    }
    const map = new Map<string, Scene>()
    if (backdropScene) map.set('backdrop', backdropScene)
    if (terrainScene) map.set('terrain', terrainScene)
    this.built = { level, shapes, zoom, backdrop: backdropScene, terrain: terrainScene, map, stats }
  }

  dispose() {
    this.gl?.dispose(); this.gl = undefined; this.built = undefined
  }
}

/** The part of a layer picture under `view`, when `view` is the layer's own view or an integer-pixel crop of it. */
export function layerCrop(layer: LayerView, view: { x: number; y: number; zoom: number; width: number; height: number }) {
  if (view.zoom !== layer.zoom) return null
  const dx = (view.x - layer.x) * view.zoom, dy = (view.y - layer.y) * view.zoom
  const sx = Math.round(dx), sy = Math.round(dy)
  if (Math.abs(dx - sx) > 1e-3 || Math.abs(dy - sy) > 1e-3) return null
  if (sx < 0 || sy < 0 || sx + view.width > layer.width || sy + view.height > layer.height) return null
  return { sx, sy }
}
