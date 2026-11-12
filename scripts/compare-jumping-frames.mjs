// Pixel comparison of one built-in UJG level on two production bundles, frame for frame, in hardware Edge.
// A fake clock makes play deterministic: each bundle opens the same frozen level at each section start,
// plays the same input on the same simulation ticks, and the canvas is captured at the same moments.
// Only rendering differences remain, so a change meant to look the same can be checked against its baseline.
//
//   node scripts/compare-jumping-frames.mjs <level file> --bundle before=<dir> --bundle after=<dir> [options]
//     --snapshot <file>      Frozen level JSON (default: public/levels/jumping/<level file> as it is now).
//     --sections x:y,...     Start points (default: the level's entrance). Use profile-jumping-level.mjs's auto list.
//     --dpr 1,1.5            Device pixel ratios (default 1,1.5) at a 1280x800 CSS viewport.
//     --at 0,900,1800,2700   Capture times in ms after the opening, running right with a jump every 0.9 s.
//     --out <dir>            Captures and diff images (default .local/perf/compare-<level>-<time>).
//     --renderer name=value  Draw that bundle with localStorage `jumping:renderer` = value (such as webgl), so
//                            one build can be compared with itself on two renderers.
//
// Per frame it reports the largest channel difference (of 255), the mean difference, and the share of
// channels that differ by more than 2. The October 2026 Exit work held changes to max 3, mean < 0.03 and
// share < 0.0001: rounding a viewer cannot see. Larger differences are saved as before/after/diff crops.
import { preview } from 'vite'
import { chromium } from '@playwright/test'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { resolve, join, basename } from 'node:path'
// Every built-in level counts as completed, as the browser tests seed it, so the campaign never refuses a level's link.
const levelIds = JSON.parse(await readFile(resolve('public/levels/jumping/index.json'), 'utf8')).levels
const unlocked = await Promise.all(levelIds.map(async name => JSON.parse(await readFile(resolve('public/levels/jumping', name), 'utf8')).id))

const args = process.argv.slice(2), file = args.find(a => !a.startsWith('--') && !args[args.indexOf(a) - 1]?.startsWith('--'))
const option = name => { const i = args.indexOf(`--${name}`); return i < 0 ? undefined : args[i + 1] }
const options = name => args.flatMap((a, i) => a === `--${name}` ? [args[i + 1]] : [])
if (!file || !/\.jump-level\.json$/.test(file)) throw new Error('Give a built-in level file, such as fulltilt.jump-level.json')
const renderers = Object.fromEntries(options('renderer').map(r => r.split('=')))
const bundles = options('bundle').map(b => { const [name, dir] = b.split('='); return { name, dir: resolve(dir), renderer: renderers[name] } })
if (bundles.length !== 2) throw new Error('Give exactly two --bundle name=dir')
const snapshot = JSON.parse(await readFile(option('snapshot') ?? resolve('public/levels/jumping', file), 'utf8'))
const sections = (option('sections') ?? `${snapshot.entrance.x}:${snapshot.entrance.y}`).split(',').map(s => { const [x, y] = s.split(':').map(Number); return { x, y } })
const dprs = (option('dpr') ?? '1,1.5').split(',').map(Number), moments = (option('at') ?? '0,900,1800,2700').split(',').map(Number)
const out = resolve(option('out') ?? `.local/perf/compare-${basename(file, '.jump-level.json')}-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}`)
await mkdir(out, { recursive: true })

const servers = await Promise.all(bundles.map((bundle, i) => preview({ logLevel: 'warn', build: { outDir: bundle.dir }, preview: { host: '127.0.0.1', port: 4197 + i, strictPort: true } })))
const browser = await chromium.launch({ channel: 'msedge', args: ['--enable-gpu'] })
try {
  /** Play one bundle deterministically and return a PNG data URL per moment. */
  async function capture(bundleIndex, section, dpr) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: dpr }), errors = []
    page.on('pageerror', e => errors.push(e.message))
    const moved = { ...snapshot, entrance: { ...snapshot.entrance, x: section.x, y: section.y } }
    await page.route(`**/levels/jumping/${file}`, route => route.fulfill({ body: JSON.stringify(moved), contentType: 'application/json' }))
    await page.addInitScript(ids => {
      try {
        const times = JSON.parse(localStorage.getItem('arcade.jumping.times.v1') ?? '{}'), completed = JSON.parse(localStorage.getItem('arcade.jumping.completed.v1') ?? '{}')
        for (const id of ids) { times[id] ??= 0; completed[id] = true }
        localStorage.setItem('arcade.jumping.times.v1', JSON.stringify(times)); localStorage.setItem('arcade.jumping.completed.v1', JSON.stringify(completed))
      } catch { /* Unlocked levels only. */ }
    }, unlocked)
    await page.addInitScript(renderer => {
      try {
        localStorage.setItem('jumping:lighting-performance-mode', 'false'); localStorage.removeItem('jumping:measure-skip-layers')
        if (renderer) localStorage.setItem('jumping:renderer', renderer); else localStorage.removeItem('jumping:renderer')
      } catch { /* Defaults. */ }
    }, bundles[bundleIndex].renderer ?? null)
    // As openLevelLink in the browser tests: hold the campaign back until the opening dialog shows, then
    // pause the clock and release it, so the run starts at the same fake time in every page.
    let release = () => {}
    const ready = new Promise(done => { release = done })
    await page.route('**/levels/jumping-campaign.json', async route => { await ready; await route.fallback() })
    await page.clock.install({ time: new Date('2026-01-01T00:00:00Z') })
    try {
      await page.goto(`http://127.0.0.1:${4197 + bundleIndex}/lab/levels/built-in/${file}`)
      await page.getByRole('dialog', { name: 'Opening the facility', exact: true }).waitFor({ timeout: 60000 })
      await page.clock.pauseAt(new Date('2026-01-01T01:00:00Z')); release()
      const canvas = page.locator('.jumping-game > canvas[role="img"]')
      await canvas.waitFor({ timeout: 60000 })
      if (!decodeURIComponent(page.url()).includes(file)) throw new Error(`The level link was refused at ${section.x},${section.y}`)
      await page.waitForFunction(() => !document.querySelector('.jumping-game[aria-busy="true"]'), null, { timeout: 60000 })
      for (let i = 0; i < 600; i++) {
        await page.clock.runFor(16)
        const state = await page.locator('.jumping-state').textContent()
        if (state && !/Entering|Waking/.test(state)) break
      }
      await canvas.focus()
      const frames = [], begin = await page.evaluate(() => performance.now())
      let elapsed = 0
      const advanceTo = async ms => { while (elapsed < ms) { const step = Math.min(16, ms - elapsed); await page.clock.runFor(step); elapsed += step } }
      await page.keyboard.down('d')
      for (const at of moments) {
        // Jump every 0.9 s, held 0.22 s, on the same ticks in every page.
        for (let jump = Math.ceil(elapsed / 900) * 900; jump < at; jump += 900) {
          await advanceTo(jump); await page.keyboard.down('Space'); await advanceTo(Math.min(at, jump + 220)); if (elapsed >= jump + 220) await page.keyboard.up('Space')
        }
        await advanceTo(at)
        // What is on screen: a WebGL frame draws on its own canvas over this one, and reads back blank once presented.
        frames.push(`data:image/png;base64,${(await canvas.screenshot({ animations: 'allow', caret: 'initial', scale: 'device' })).toString('base64')}`)
      }
      await page.keyboard.up('d')
      return { frames, begin, errors }
    } finally { await page.close() }
  }

  const differ = await browser.newPage()
  async function compare(a, b) {
    return differ.evaluate(async ([a, b]) => {
      const load = src => new Promise((done, fail) => { const image = new Image(); image.onload = () => done(image); image.onerror = fail; image.src = src })
      const [ia, ib] = await Promise.all([load(a), load(b)])
      if (ia.width !== ib.width || ia.height !== ib.height) return { sizeMismatch: [`${ia.width}x${ia.height}`, `${ib.width}x${ib.height}`] }
      const read = image => { const c = new OffscreenCanvas(image.width, image.height), ctx = c.getContext('2d'); ctx.drawImage(image, 0, 0); return ctx.getImageData(0, 0, image.width, image.height).data }
      const pa = read(ia), pb = read(ib)
      let max = 0, total = 0, overTwo = 0, at = 0
      for (let i = 0; i < pa.length; i++) { const d = Math.abs(pa[i] - pb[i]); total += d; if (d > 2) overTwo++; if (d > max) { max = d; at = i } }
      const pixel = at >> 2, x = pixel % ia.width, y = Math.floor(pixel / ia.width)
      let crops
      if (max > 3) {
        // 240x160 crops around the largest difference, the diff amplified eight times.
        const w = 240, h = 160, cx = Math.max(0, Math.min(ia.width - w, x - w / 2)), cy = Math.max(0, Math.min(ia.height - h, y - h / 2))
        const crop = (image, diff) => {
          const c = new OffscreenCanvas(w, h), ctx = c.getContext('2d')
          if (!diff) ctx.drawImage(image, cx, cy, w, h, 0, 0, w, h)
          else {
            const data = ctx.createImageData(w, h)
            for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) for (let k = 0; k < 3; k++) {
              const i = ((cy + yy) * ia.width + cx + xx) * 4 + k; data.data[(yy * w + xx) * 4 + k] = Math.min(255, 8 * Math.abs(pa[i] - pb[i]))
            }
            for (let i = 3; i < data.data.length; i += 4) data.data[i] = 255
            ctx.putImageData(data, 0, 0)
          }
          return c.convertToBlob().then(blob => new Promise(done => { const r = new FileReader(); r.onload = () => done(r.result); r.readAsDataURL(blob) }))
        }
        crops = await Promise.all([crop(ia), crop(ib), crop(null, true)])
      }
      return { max, mean: +(total / pa.length).toFixed(5), overTwoShare: +(overTwo / pa.length).toFixed(6), pixel: [x, y], crops }
    }, [a, b])
  }

  const rows = []
  for (const dpr of dprs) for (const section of sections) {
    let [a, b] = [await capture(0, section, dpr), await capture(1, section, dpr)]
    let results = []
    for (let i = 0; i < moments.length; i++) results.push(await compare(a.frames[i], b.frames[i]))
    // React switches the screen to play on real time, so now and then a page starts its run a frame
    // late and the whole frame differs. A rendering change repeats; that does not. Capture both again
    // when anything differs and keep the closer pair.
    let retried = false
    if (results.some(r => r.max > 0)) {
      const [a2, b2] = [await capture(0, section, dpr), await capture(1, section, dpr)], again = []
      for (let i = 0; i < moments.length; i++) again.push(await compare(a2.frames[i], b2.frames[i]))
      const score = list => list.reduce((sum, r) => sum + (r.mean ?? 1), 0)
      if (score(again) < score(results)) { [a, b, results] = [a2, b2, again] }
      retried = true
    }
    for (let i = 0; i < moments.length; i++) {
      const result = { ...results[i], retried }, name = `${section.x}-${dpr}-${moments[i]}`
      if (result.crops) {
        for (const [k, label] of [[0, bundles[0].name], [1, bundles[1].name], [2, 'diff8x']].entries())
          await writeFile(join(out, `${name}-${label[1]}.png`), Buffer.from(result.crops[k].split(',')[1], 'base64'))
        delete result.crops
      }
      if (i === moments.length - 1) {
        await writeFile(join(out, `${name}-${bundles[0].name}-full.png`), Buffer.from(a.frames[i].split(',')[1], 'base64'))
        await writeFile(join(out, `${name}-${bundles[1].name}-full.png`), Buffer.from(b.frames[i].split(',')[1], 'base64'))
      }
      rows.push({ section: `${section.x}:${section.y}`, dpr, at: moments[i], ...result, errors: [...a.errors, ...b.errors] })
      console.log(`DPR ${dpr} ${section.x}:${section.y} +${moments[i]} ms: max ${result.max}, mean ${result.mean}, >2 ${result.overTwoShare}${result.sizeMismatch ? ` size ${result.sizeMismatch}` : ''}`)
    }
  }
  await writeFile(join(out, 'compare.json'), JSON.stringify({ level: file, bundles, sections, dprs, moments, rows }, null, 1) + '\n')
  const worst = rows.reduce((w, r) => r.max > w.max ? r : w, rows[0])
  console.log(`Worst: max ${worst.max} at ${worst.section} DPR ${worst.dpr} +${worst.at} ms. Results: ${join(out, 'compare.json')}`)
} finally {
  await browser.close()
  await Promise.all(servers.map(server => new Promise(done => server.httpServer.close(done))))
}
