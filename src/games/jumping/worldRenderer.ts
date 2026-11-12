/**
 * The game's world renderer: each frame goes to WebGL (worldFrame.ts) when it
 * covers that frame, and to Canvas (lightingRender.ts) otherwise. The lighting
 * state advances exactly once per frame, before the choice, so lamp fades and a
 * failed run's power-down run on whichever draws. WebGL draws on its own canvas,
 * shown over the Canvas one only while it is drawing.
 */
import { LightingRenderer } from './lightingRender.ts'
import type { LightingShadows, LightingView } from './lightingRender.ts'
import { WebGLWorldFrame } from './worldFrame.ts'
import type { WorldFrameStats } from './worldFrame.ts'
import type { LightingDefinition, LightingWorld } from './lightingModel.ts'

export type WorldRendererSetting = 'off' | 'hardware' | 'software'
export type WorldStats = ReturnType<LightingRenderer['render']> | WorldFrameStats

export class WorldRenderer {
  readonly lighting: LightingRenderer
  readonly webgl: WebGLWorldFrame | null
  private readonly glCanvas: HTMLCanvasElement | null
  private shown = false

  /** `glCanvas` is where WebGL draws; without it, or with the setting off, every frame is Canvas's. */
  constructor(lighting: LightingRenderer, glCanvas: HTMLCanvasElement | null, setting: WorldRendererSetting) {
    this.lighting = lighting
    this.glCanvas = glCanvas
    this.webgl = glCanvas && setting !== 'off' ? new WebGLWorldFrame(glCanvas, setting === 'software') : null
  }

  /** Draw a frame. `view.restZoom` is the zoom the camera settles at, which WebGL builds its retained scenes for. */
  render(ctx: CanvasRenderingContext2D, world: LightingWorld, definition: LightingDefinition, view: LightingView & { restZoom?: number }, dt: number,
    editor = false, shadows: LightingShadows = 'structural'): WorldStats {
    const advanced = this.lighting.advance(definition, world, dt)
    if (this.webgl && WebGLWorldFrame.covers(world, advanced.lighting, advanced.sources, editor)) {
      const stats = this.webgl.render(world, view, this.lighting.daylightCasters(world), advanced.sources)
      if (stats) { this.show(true); return stats }
    }
    this.show(false)
    return this.lighting.render(ctx, world, definition, view, dt, undefined, editor, shadows, false, advanced)
  }

  /** Canvas draws whatever comes next by other means (an ending scene): stop showing WebGL's last frame. */
  showCanvas() { this.show(false) }

  private show(webgl: boolean) {
    if (!this.glCanvas || webgl === this.shown) return
    this.shown = webgl; this.glCanvas.style.visibility = webgl ? 'visible' : 'hidden'
    // Canvas's lighting buffers and layers wait unused while WebGL draws; they come back if Canvas draws again.
    if (webgl) { this.lighting.release(); this.lighting.releaseWorldLayers() }
  }

  dispose() { this.webgl?.dispose() }
}
