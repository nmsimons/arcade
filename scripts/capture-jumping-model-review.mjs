import { chromium } from '@playwright/test'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'

const directory = resolve('dev/model-review/baseline')
if (existsSync(resolve(directory, 'index.json')) && !process.argv.includes('--update')) {
  throw new Error('A frozen baseline already exists. Use --update only when deliberately replacing the reference.')
}
const baseUrl = process.env.MODEL_REVIEW_URL ?? 'http://127.0.0.1:4180'
const catalog = JSON.parse(await readFile('dev/model-review/clips.json', 'utf8'))
const revision = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim()
const index = { version: 1, revision, captured: new Date().toISOString(), clips: {} }
await mkdir(directory, { recursive: true })
const browser = await chromium.launch(process.platform === 'win32' ? { channel: 'msedge' } : {})
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
  await page.goto(`${baseUrl}/lab/model-review`)
  for (const clip of catalog.clips) {
    const result = await page.evaluate(async clip => {
      const { recordReviewClip, reviewLevelUrl } = await import('/src/games/jumping/modelReview.ts')
      const { captureReviewAtlas } = await import('/src/games/jumping/modelReviewRender.ts')
      const source = await (await fetch(reviewLevelUrl(clip), { cache: 'no-store' })).json()
      return captureReviewAtlas(await recordReviewClip(clip, source))
    }, clip)
    index.clips[clip.id] = result.baseline
    await writeFile(resolve(directory, result.baseline.image), Buffer.from(result.png.split(',')[1], 'base64'))
    console.log(`${clip.title}: ${result.baseline.frames} frames`)
  }
  await writeFile(resolve(directory, 'index.json'), JSON.stringify(index))
  const sheet = await page.evaluate(async ({ catalog, index }) => {
    const { drawBaselineSprite } = await import('/src/games/jumping/modelReviewRender.ts')
    const canvas = document.createElement('canvas'); canvas.width = 1200; canvas.height = Math.ceil(catalog.clips.length / 3) * 260 + 90
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = '#f3f0e6'; ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.fillStyle = '#303c36'; ctx.font = 'bold 27px sans-serif'; ctx.fillText('The player. / Baseline study', 24, 40)
    ctx.font = '13px monospace'; ctx.fillText(`${index.revision} · ${index.captured.slice(0, 10)} · day / night`, 24, 67)
    for (const [i, clip] of catalog.clips.entries()) {
      const baseline = index.clips[clip.id], sample = baseline.samples[baseline.poster]
      const image = new Image(); image.src = `/dev/model-review/baseline/${baseline.image}`; await image.decode()
      const x = i % 3 * 400, y = Math.floor(i / 3) * 260 + 90
      ctx.fillStyle = '#e5e7dd'; ctx.fillRect(x + 8, y + 8, 384, 244)
      ctx.fillStyle = '#303c36'; ctx.font = 'bold 16px sans-serif'; ctx.fillText(clip.title, x + 24, y + 36)
      for (let ink = 0; ink < 2; ink++) {
        ctx.save(); ctx.beginPath(); ctx.rect(x + 16 + ink * 184, y + 53, 184, 190); ctx.clip()
        ctx.fillStyle = ink ? '#545451' : '#f1f1ed'; ctx.fillRect(x + 16 + ink * 184, y + 53, 184, 190)
        const scale = Math.min(2, 164 / baseline.bounds.w, 164 / baseline.bounds.h)
        ctx.translate(x + 108 + ink * 184, y + 148); ctx.scale(scale, scale)
        ctx.translate(0, -baseline.bounds.y - baseline.bounds.h / 2)
        ctx.filter = ink ? 'brightness(.65)' : 'none'
        drawBaselineSprite(ctx, image, baseline, baseline.poster, ink, 0, 0); ctx.restore()
      }
      ctx.fillStyle = '#657369'; ctx.font = '11px monospace'; ctx.fillText(sample.state, x + 24, y + 242)
    }
    return canvas.toDataURL('image/png')
  }, { catalog, index })
  await writeFile(resolve(directory, 'overview.png'), Buffer.from(sheet.split(',')[1], 'base64'))
  console.log(`Saved frozen reference ${revision} to dev/model-review/baseline.`)
} finally {
  await browser.close()
}
