/**
 * The game's world renderer: each frame goes to WebGL (worldFrame.ts) when it
 * covers that frame, and to Canvas (lightingRender.ts) otherwise. The lighting
 * state advances exactly once per frame, before the choice, so lamp fades and a
 * failed run's power-down run on whichever draws. WebGL draws on its own canvas,
 * placed over the Canvas one when WebGL starts and shown only while it draws.
 */
import { LightingRenderer } from './lightingRender.ts'
import { nightModeEnabled } from './ambientLight.ts'
import type { LightingShadows, LightingView } from './lightingRender.ts'
import { WebGLWorldFrame } from './worldFrame.ts'
import { framesReported } from './debugFrames.ts'
import type { WorldFrameStats } from './worldFrame.ts'
import type { LightingDefinition, LightingWorld } from './lightingModel.ts'

export type WorldRendererSetting = 'off' | 'hardware' | 'software'
export type WorldStats = ReturnType<LightingRenderer['render']> | WorldFrameStats

/**
 * WebGL draws when the GPU runs it, unless `?renderer=canvas` or localStorage
 * `jumping:renderer` = `canvas` asks for Canvas alone. `webgl-software` also
 * accepts a software WebGL driver, for headless browser tests; without it a
 * software driver leaves every frame to Canvas, which is faster there.
 */
export function worldRendererSetting(): WorldRendererSetting {
  if (typeof window === 'undefined') return 'off'
  let value: string | null = null
  try { value = new URLSearchParams(window.location.search).get('renderer') ?? window.localStorage.getItem('jumping:renderer') } catch { /* The default. */ }
  return value === 'canvas' ? 'off' : value === 'webgl-software' ? 'software' : 'hardware'
}

export class WorldRenderer {
  readonly lighting: LightingRenderer
  readonly webgl: WebGLWorldFrame | null
  private readonly glCanvas: HTMLCanvasElement | null
  private shown = false

  /**
   * `canvas` is the one Canvas draws on. WebGL's canvas goes after it, only
   * when WebGL starts; without WebGL, or with the setting off, every frame is Canvas's.
   */
  constructor(lighting: LightingRenderer, canvas: HTMLCanvasElement | null, setting: WorldRendererSetting) {
    this.lighting = lighting
    let webgl: WebGLWorldFrame | null = null, glCanvas: HTMLCanvasElement | null = null
    if (canvas && setting !== 'off') {
      glCanvas = canvas.ownerDocument.createElement('canvas')
      glCanvas.className = 'jumping-webgl-canvas'; glCanvas.setAttribute('aria-hidden', 'true')
      // Its frames stand for the game's canvas, which the browser tests' frame reports name.
      webgl = new WebGLWorldFrame(glCanvas, setting === 'software', canvas)
      if (webgl.available) canvas.after(glCanvas)
      else { webgl.dispose(); webgl = null; glCanvas = null }
    }
    this.webgl = webgl; this.glCanvas = glCanvas
  }

  /** Draw a frame. `view.restZoom` is the zoom the camera settles at, which WebGL builds its retained scenes for. */
  render(ctx: CanvasRenderingContext2D, world: LightingWorld, definition: LightingDefinition, view: LightingView & { restZoom?: number }, dt: number,
    editor = false, shadows: LightingShadows = 'structural'): WorldStats {
    const advanced = this.lighting.advance(definition, world, dt)
    if (this.webgl && WebGLWorldFrame.covers(world, editor)) {
      const casters = this.lighting.casters(world, nightModeEnabled(advanced.lighting), shadows)
      const stats = this.webgl.render(world, view, advanced.lighting, casters, advanced.sources)
      if (stats) {
        this.show(true)
        // For browser tests only: the frame on the 2D canvas too, copied before it is presented.
        if (framesReported && this.glCanvas) {
          ctx.save(); ctx.resetTransform(); ctx.globalCompositeOperation = 'copy'; ctx.globalAlpha = 1
          ctx.drawImage(this.glCanvas, 0, 0); ctx.restore()
        }
        return stats
      }
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

  dispose() {
    this.webgl?.dispose()
    if (!this.glCanvas) return
    // The canvas is this renderer's alone: let its context go now rather than when it is collected.
    this.glCanvas.getContext('webgl2')?.getExtension('WEBGL_lose_context')?.loseContext()
    this.glCanvas.remove()
  }
}
