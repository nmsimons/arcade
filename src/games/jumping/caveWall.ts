const patterns = new WeakMap<CanvasRenderingContext2D, CanvasPattern>()
let tile: HTMLCanvasElement | undefined

/** A quiet stone surface behind outdoor terrain. One shared tile stays fixed
 * in world space; no per-frame texture generation or architectural grid. */
function stonePattern(ctx: CanvasRenderingContext2D) {
  const cached = patterns.get(ctx)
  if (cached) return cached
  if (!tile) {
    tile = document.createElement('canvas'); tile.width = tile.height = 256
    const paint = tile.getContext('2d')!
    // A pale wall separates the day player's mid-tone shell from foreground
    // stone, while the ordinary night exposure still gives caves their depth.
    paint.scale(2, 2); paint.fillStyle = '#e5e7e2'; paint.fillRect(0, 0, 128, 128)
    // Short, irregular chips keep the same simple drawing language as terrain.
    paint.strokeStyle = '#68756716'; paint.lineWidth = .8
    for (const [x,y,length,rise] of [[12,17,13,-1],[77,31,19,2],[36,71,10,1],[91,103,17,-2],[9,114,8,1]]) {
      paint.beginPath(); paint.moveTo(x,y); paint.lineTo(x+length*.6,y+rise); paint.lineTo(x+length,y+rise*.5); paint.stroke()
    }
    let seed = 719
    const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296 }
    for (let i = 0; i < 110; i++) {
      const x = random()*128, y = random()*128
      paint.fillStyle = i%3 ? '#6979680b' : '#ffffff18'
      paint.fillRect(x,y,.5+random()*1.5,.5)
    }
  }
  const pattern = ctx.createPattern(tile, 'repeat')!
  pattern.setTransform(new DOMMatrix().scale(.5))
  patterns.set(ctx, pattern); return pattern
}

export function drawCaveWall(ctx: CanvasRenderingContext2D, view: { x: number; y: number; w: number; h: number }) {
  ctx.fillStyle = stonePattern(ctx)
  ctx.fillRect(view.x, view.y, view.w, view.h)
}
