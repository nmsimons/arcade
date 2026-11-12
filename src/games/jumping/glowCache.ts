/**
 * A canvas glow (`shadowBlur`) is a separate blur pass on the GPU for every
 * shape drawn with it, every frame. Glowing artwork that rarely changes, such
 * as a display's digits, draws its glow once into a small image at the device
 * scale; each frame copies that image, then draws the crisp shapes over it with
 * no shadow. Glow and shapes share one colour, and layers of one colour
 * composite the same in any order, so this matches drawing each shape with its
 * own shadow, apart from rounding where the copy lands between device pixels.
 */
const MARGIN = 8, LIMIT = 48
const cache = new Map<string, HTMLCanvasElement>()

/** Only an ordinary on-screen canvas, scaled without rotation, can use a cached glow. */
export function glowCacheable(ctx: CanvasRenderingContext2D) {
  if (typeof document === 'undefined' || typeof ctx.getTransform !== 'function') return false
  const t = ctx.getTransform()
  return t.b === 0 && t.c === 0 && t.a > 0 && t.d > 0
}

/** Draw the glow `draw` would cast at the current transform, from the cache. `key` must name everything `draw` depends on. */
export function drawCachedGlow(ctx: CanvasRenderingContext2D, key: string, w: number, h: number, color: string, blur: number,
  draw: (glow: CanvasRenderingContext2D) => void) {
  const t = ctx.getTransform(), id = `${t.a}:${t.d}:${blur}:${color}:${w}x${h}:${key}`
  let image = cache.get(id)
  if (image) { cache.delete(id); cache.set(id, image) }
  else {
    image = document.createElement('canvas')
    image.width = Math.ceil(w * t.a) + MARGIN * 2; image.height = Math.ceil(h * t.d) + MARGIN * 2
    const glow = image.getContext('2d')!
    // Shadows only: the shapes land far off the image and their shadows are
    // offset back into place. Shadow offset and blur ignore the transform.
    const away = image.width + image.height + 64
    glow.setTransform(t.a, 0, 0, t.d, MARGIN - away, MARGIN)
    glow.shadowColor = color; glow.shadowBlur = blur; glow.shadowOffsetX = away
    glow.fillStyle = color; glow.strokeStyle = color
    draw(glow)
    if (cache.size >= LIMIT) cache.delete(cache.keys().next().value!)
    cache.set(id, image)
  }
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(image, t.e - MARGIN, t.f - MARGIN); ctx.restore()
}
