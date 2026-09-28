import type { LightSource } from './lightingModel.ts'
import type { LightingView } from './lightingRender.ts'

/** Diagnostic overlay only: never part of world illumination or object rendering. */
export function drawLightSources(ctx: CanvasRenderingContext2D, sources: readonly LightSource[], view: LightingView, onlyLight?: string) {
  ctx.save(); ctx.resetTransform()
  ctx.font = '700 12px ui-monospace, monospace'; ctx.textBaseline = 'middle'
  const overlaps = new Map<string, number>()
  sources.forEach((source, index) => {
    const x = (source.x - view.x) * view.zoom, y = (source.y - view.y) * view.zoom
    if (x < 0 || y < 0 || x > view.width || y > view.height) return
    const key = `${x}:${y}`, row = overlaps.get(key) ?? 0
    overlaps.set(key, row + 1)
    const enabled = source.fade > 0 && (!onlyLight || onlyLight === source.id)
    const label = `${index + 1} · SPOT`
    const status = onlyLight && onlyLight !== source.id ? ' · hidden' : source.fade <= 0 ? ' · off' : ''
    const text = label + status
    const color = enabled ? '#dfb44f' : '#d3dcd8'
    if (row === 0 || enabled) {
      ctx.fillStyle = '#303c36'; ctx.beginPath(); ctx.arc(x, y, 10, 0, Math.PI * 2); ctx.fill()
      ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, 7, 0, Math.PI * 2); ctx.stroke()
      ctx.fillStyle = color; ctx.beginPath(); ctx.arc(x, y, 2.5, 0, Math.PI * 2); ctx.fill()
    }
    {
      const direction = source.direction * Math.PI / 180, half = source.spread * Math.PI / 360
      ctx.save(); ctx.translate(x, y); ctx.rotate(direction); ctx.lineCap = 'round'
      ctx.strokeStyle = '#303c36'; ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(11, 0); ctx.lineTo(40, 0); ctx.stroke()
      ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(11, 0); ctx.lineTo(40, 0)
      ctx.moveTo(33, -5); ctx.lineTo(40, 0); ctx.lineTo(33, 5); ctx.stroke()
      ctx.globalAlpha = .8; ctx.beginPath()
      for (const side of [-1, 1]) { ctx.moveTo(Math.cos(half * side) * 13, Math.sin(half * side) * 13); ctx.lineTo(Math.cos(half * side) * 38, Math.sin(half * side) * 38) }
      ctx.stroke(); ctx.restore()
    }
    const width = ctx.measureText(text).width + 16
    const left = Math.max(6, Math.min(view.width - width - 6, x + 16))
    const top = Math.max(6, Math.min(view.height - 30, y - 35 - row * 28))
    ctx.fillStyle = '#303c36'; ctx.fillRect(left, top, width, 24)
    ctx.fillStyle = color; ctx.fillText(text, left + 8, top + 12)
  })
  ctx.restore()
}
