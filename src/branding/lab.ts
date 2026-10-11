/** The approved L.A.B. mark, shared by SVG UI and Canvas world artwork. */
export const LAB_NAME = 'L.A.B. Experiments'
export const LAB_LOGO_WIDTH = 876
export const LAB_LOGO_HEIGHT = 318
export const LAB_WORDMARK_PATH = [
  'M0 0H40V64H47V0H84V254H0Z M91 198H171V254H91Z',
  'M200 198H250V254H200Z',
  'M347 0H389V92L333 254H276Z M397 0H437L507 254H441L424 201H361L377 151H408L397 116Z',
  'M527 198H577V254H527Z',
  'M605 0H674V254H605Z M681 0H754C789 0 805 21 805 56V90C805 108 795 118 779 127C798 136 811 151 811 176V205C811 239 789 254 754 254H681V196H713C724 196 730 189 730 180V166C730 156 724 150 713 150H681V105H713C724 105 730 98 730 90V74C730 64 724 59 713 59H681Z',
  'M826 198H876V254H826Z',
].join(' ')

// Small angular mono lettering is outlined, so loading a font never changes
// the subtitle width. First and last ink edges align with the whole wordmark.
const letters: Record<string, number[][][]> = {
  e: [[[7,11],[27,11],[34,18],[34,30],[8,30],[8,35],[34,35],[34,42],[7,42],[0,35],[0,18]], [[8,18],[26,18],[26,24],[8,24]]],
  x: [[[0,11],[9,11],[17,21],[25,11],[34,11],[22,26],[34,42],[25,42],[17,31],[9,42],[0,42],[12,26]]],
  p: [[[0,11],[27,11],[34,18],[34,32],[27,39],[8,39],[8,44],[0,44]], [[8,18],[26,18],[26,32],[8,32]]],
  r: [[[0,11],[8,11],[8,15],[13,11],[27,11],[34,18],[34,24],[26,24],[26,19],[13,19],[8,24],[8,35],[17,35],[17,42],[0,42]]],
  i: [[[13,0],[21,0],[21,8],[13,8]], [[5,11],[21,11],[21,35],[34,35],[34,42],[0,42],[0,35],[13,35],[13,18],[5,18]]],
  m: [[[0,11],[7,11],[7,15],[12,11],[19,11],[24,15],[28,11],[34,11],[34,42],[27,42],[27,21],[24,18],[21,21],[21,42],[14,42],[14,21],[11,18],[7,21],[7,42],[0,42]]],
  n: [[[0,11],[8,11],[8,15],[13,11],[27,11],[34,18],[34,42],[26,42],[26,21],[23,18],[13,18],[8,23],[8,42],[0,42]]],
  t: [[[11,3],[19,3],[19,11],[31,11],[31,18],[19,18],[19,32],[22,35],[34,35],[34,42],[18,42],[11,35],[11,18],[0,18],[0,11],[11,11]]],
  s: [[[7,11],[34,11],[34,18],[9,18],[9,23],[27,23],[34,30],[34,35],[27,42],[0,42],[0,35],[25,35],[25,30],[7,30],[0,23],[0,18]]],
}
export const LAB_SUBTITLE_PATH = [...'experiments'].map((letter, i) => letters[letter].map(points =>
  `M${points.map(([x, y]) => `${+(x + i * (LAB_LOGO_WIDTH - 34) / 10).toFixed(3)} ${y + 274}`).join('L')}Z`,
).join(' ')).join(' ')

let wordmark: Path2D | undefined, subtitle: Path2D | undefined
export function drawLabLogo(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, ink: string, subtitleInk = ink) {
  wordmark ??= new Path2D(LAB_WORDMARK_PATH)
  subtitle ??= new Path2D(LAB_SUBTITLE_PATH)
  ctx.save(); ctx.translate(x, y); ctx.scale(width / LAB_LOGO_WIDTH, width / LAB_LOGO_WIDTH)
  ctx.fillStyle = ink; ctx.fill(wordmark, 'evenodd')
  ctx.fillStyle = subtitleInk; ctx.fill(subtitle, 'evenodd')
  ctx.restore()
}

/** A transparent wall marking, fitted without stretching the logo. */
export function drawLabStamp(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, ink: string) {
  const edge = Math.min(w, h) * .035
  const width = Math.min(w * .82, h * .72 * LAB_LOGO_WIDTH / LAB_LOGO_HEIGHT)
  const height = width * LAB_LOGO_HEIGHT / LAB_LOGO_WIDTH
  ctx.save(); ctx.globalAlpha *= .9; ctx.strokeStyle = ink; ctx.lineWidth = edge
  ctx.setLineDash([w * .17, edge * .45, w * .08, edge * .25])
  ctx.strokeRect(x + edge / 2, y + edge / 2, w - edge, h - edge)
  drawLabLogo(ctx, x + (w - width) / 2, y + (h - height) / 2, width, ink)
  ctx.restore()
}
