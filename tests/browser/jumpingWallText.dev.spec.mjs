import { test, expect } from './helpers/test.mjs'

test('both wall-text styles keep their ink position, blank lines and clipping across canvas scales', async ({ page }, info) => {
  await page.goto('/tests/fixtures/jumping/lighting-prototype.json')
  const samples = await page.evaluate(async () => {
    const { drawWallTexts, GRAFFITI_FONT, clearWallTextLayouts } = await import('/src/games/jumping/wallText.ts')
    const face = new FontFace(GRAFFITI_FONT, 'url(/src/games/jumping/fonts/PermanentMarker-Regular.ttf)')
    document.fonts.add(face); await face.load(); clearWallTextLayouts()
    const samples = [], preview = document.createElement('canvas')
    preview.width = 800; preview.height = 280
    const previewCtx = preview.getContext('2d')
    for (const style of ['official', 'graffiti']) for (const fontSize of [24, 48, 96]) for (const scale of [.75, 1, 3]) for (const align of ['left', 'center', 'right']) {
      const text = { x: 20, y: 20, w: 480, h: fontSize * 4, fontSize, align, style, text: 'MMM\n\nMMM' }
      const canvas = document.createElement('canvas')
      canvas.width = Math.ceil(520 * scale); canvas.height = Math.ceil((text.h + 40) * scale)
      const ctx = canvas.getContext('2d', { willReadFrequently: true }); ctx.scale(scale, scale)
      const inkRows = () => {
        const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data, rows = []
        for (let y = 0; y < canvas.height; y++) {
          for (let x = 0; x < canvas.width; x++) if (pixels[(y * canvas.width + x) * 4 + 3] > 100) { rows.push(y); break }
        }
        // Group the two visible lines; the explicit blank line must stay empty.
        return rows.reduce((groups, y) => {
          if (!groups.length || y > groups.at(-1).bottom + 1) groups.push({ top: y, bottom: y })
          else groups.at(-1).bottom = y
          return groups
        }, [])
      }
      drawWallTexts(ctx, [text])
      const full = inkRows()
      ctx.clearRect(0, 0, canvas.width / scale, canvas.height / scale)
      const clipped = { ...text, h: fontSize / 2 }
      drawWallTexts(ctx, [clipped])
      const crop = inkRows()
      samples.push({ style, fontSize, scale, align, full, crop, y: text.y, clippedHeight: clipped.h })
      if (fontSize === 48 && scale === 1 && align === 'left') {
        const example = { ...text, y: style === 'official' ? 20 : 150, h: 100, text: 'HILL\njump' }
        drawWallTexts(previewCtx, [example]); previewCtx.strokeStyle = '#c65231'; previewCtx.strokeRect(example.x, example.y, example.w, example.h)
      }
    }
    document.body.replaceChildren(preview)
    return samples
  })
  for (const sample of samples) {
    const { style, fontSize, scale, full, crop, y, clippedHeight } = sample
    const expectedTop = (y + fontSize * (style === 'graffiti' ? 1 / 3 : .25)) * scale
    expect(full, JSON.stringify(sample)).toHaveLength(2)
    expect(Math.abs(full[0].top - expectedTop), JSON.stringify(sample)).toBeLessThanOrEqual(2)
    expect(Math.abs(full[1].top - full[0].top - fontSize * 2.6 * scale), JSON.stringify(sample)).toBeLessThanOrEqual(2)
    expect(crop, JSON.stringify(sample)).toHaveLength(1)
    expect(crop[0].top).toBe(full[0].top)
    expect(crop[0].bottom).toBeLessThan((y + clippedHeight) * scale)
    expect(crop[0].bottom).toBeLessThan(full[0].bottom)
  }
  await page.locator('canvas').screenshot({ path: info.outputPath('wall-text-position.png') })
})
