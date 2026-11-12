/**
 * Test builds watch what a frame drew through these events, instead of patching
 * Canvas 2D calls that a WebGL renderer would never make. Every renderer reports
 * the same moments with the same transforms. Off unless localStorage
 * `jumping:debug-frames` is '1', which only browser tests set; read once at load.
 */
const enabled = typeof window !== 'undefined' && (() => {
  try { return window.localStorage.getItem('jumping:debug-frames') === '1' } catch { return false }
})()

/** Detail of `jumping-wall`: the course wall was drawn, with the world's transform (the camera, in device pixels). */
export interface WallReport { canvas: HTMLCanvasElement | OffscreenCanvas; transform: DOMMatrix }
/** Detail of `jumping-head`: a head was drawn, `head` in the body's space, `body` its transform. */
export interface HeadReport { canvas: HTMLCanvasElement | OffscreenCanvas; body: DOMMatrix; head: [number, number]; alpha: number; ink: string }

/** Once per drawn world: the course wall fills the level, so its transform is the camera.
 * A recording for the WebGL renderer has no canvas and reports nothing; that
 * renderer reports each frame it draws instead. */
export function reportWall(canvas: WallReport['canvas'] | null, transform: () => DOMMatrix) {
  if (enabled && canvas) window.dispatchEvent(new CustomEvent<WallReport>('jumping-wall', { detail: { canvas, transform: transform() } }))
}

/** A robot or the player's head, where the browser tests locate the drawn figure. */
export function reportHead(canvas: HeadReport['canvas'], body: () => DOMMatrix, head: readonly [number, number], alpha: number, ink: string) {
  if (enabled) window.dispatchEvent(new CustomEvent<HeadReport>('jumping-head', { detail: { canvas, body: body(), head: [head[0], head[1]], alpha, ink } }))
}

/** Detail of `jumping-display`: a digital display was drawn, `transform` at its corner, `color` that of its lit face. */
export interface DisplayReport { canvas: HTMLCanvasElement | OffscreenCanvas; transform: DOMMatrix; value: string; color: string }

/** A display's reading, as drawn: tests read clocks and counters from this rather than decoding segments. */
export function reportDisplay(canvas: DisplayReport['canvas'], transform: () => DOMMatrix, value: string, color: string) {
  if (enabled) window.dispatchEvent(new CustomEvent<DisplayReport>('jumping-display', { detail: { canvas, transform: transform(), value, color } }))
}
