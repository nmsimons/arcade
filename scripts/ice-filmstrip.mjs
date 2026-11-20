// Filmstrips of curling with a crate on ice, drawn by the model review lab from fresh starts with ordinary inputs and
// saved as PNG. Pairs with scripts/ice-lab.mjs (measurements); see docs/jumping-ice.md.
//
//   node scripts/ice-filmstrip.mjs --out <dir> [--url http://localhost:5173] [--only deliver] [--zoom]
//   --zoom draws the card's close view of the body (about three times gameplay size).
//
// Needs the dev server running (npm run dev). Each scene writes <dir>/<scene>.png: frames every `step` ticks from
// `from`, left to right, labelled with the frame, the player's x, its state, the crate's x and speed.
import { chromium } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'

const args = process.argv.slice(2)
const option = name => { const at = args.indexOf(name); return at < 0 ? undefined : args[at + 1] }
const out = resolve(option('--out') ?? '.local/ice-filmstrips'), url = option('--url') ?? 'http://localhost:5173', only = option('--only'), zoom = args.includes('--zoom')

/** The ice lab's rink: a grippy pad to x 500, then ice; the crate at the pad's end, the player just behind it. */
const rink = ({ crateX = 470, playerX = 420 } = {}) => ({ version: 1, id: 'ice-filmstrip', name: 'Ice filmstrip', width: 3600, height: 920, floor: 920,
  entrance: { x: playerX, y: 880 }, goal: { x: 3500, y: 880 }, checkpoints: [], climbables: { ropes: [], ladders: [] },
  platforms: [{ x: 0, y: 880, w: 500, h: 40 }, { x: 500, y: 880, w: 3100, h: 40, frictionless: true }],
  props: [{ kind: 'box', x: crateX, y: 880, size: 40 }], robots: [], triggers: [], mechanisms: [], timers: [], texts: [], pickups: [],
  times: { a: 10, b: 20, c: 40, d: 60 } })
const bay = { ...JSON.parse(execFileSync('git', ['show', 'HEAD:public/levels/jumping/polishingbay.jump-level.json'], { encoding: 'utf8' })), entrance: { x: 200, y: 600 } }
const second = n => n * 60 // the lab samples every other tick: 60 frames a second

const scenes = [
  // Push off the pad for 1.2 s, then let go: the delivery, the glide together and the release.
  { name: 'deliver', level: rink(), phases: [[1.2, { move: 1 }], [3, {}]], from: second(.3), count: 36, step: 4 },
  // Keep pushing across the ice: the pair driven by feet on ice.
  { name: 'drive', level: rink(), phases: [[3, { move: 1 }], [2, {}]], from: second(.5), count: 36, step: 6 },
  // From rest on the ice with hands on the crate.
  { name: 'start-on-ice', level: rink({ crateX: 1050, playerX: 1000 }), phases: [[2, { move: 1 }], [2, {}]], from: 0, count: 36, step: 4 },
  // Deliver, then hold back against the glide.
  { name: 'brake', level: rink(), phases: [[1.2, { move: 1 }], [2, { move: -1 }], [1, {}]], from: second(.9), count: 36, step: 4 },
  // Polishing Bay as committed: push the crate off the loading floor, down the ramp and on toward the plate.
  { name: 'bay', level: bay, phases: [[4, { move: 1 }], [4, {}]], from: second(.5), count: 48, step: 8 },
]

await mkdir(out, { recursive: true })
const browser = await chromium.launch(process.platform === 'win32' ? { channel: 'msedge' } : {})
try {
  const page = await browser.newPage({ viewport: { width: 1500, height: 1200 } })
  await page.goto(`${url}/lab/model-review`)
  for (const scene of scenes) {
    if (only && !scene.name.includes(only)) continue
    const frames = await page.evaluate(async ({ level, phases, from, count, step, zoom }) => {
      const { recordReviewClip } = await import('/src/games/jumping/modelReview.ts')
      const { drawReviewCard } = await import('/src/games/jumping/modelReviewRender.ts')
      const clip = { id: 'ice', title: 'ice', group: 'Ice', focus: '', phases: phases.map(([seconds, input], i) => ({ seconds, label: `phase ${i + 1}`, input })) }
      const recording = await recordReviewClip(clip, level)
      document.getElementById('ice-strip')?.remove()
      const box = document.createElement('div'); box.id = 'ice-strip'
      box.style.cssText = 'position:absolute;left:0;top:0;width:1500px;z-index:99999;background:#fff;display:grid;grid-template-columns:repeat(6,1fr);gap:2px'
      document.body.append(box)
      for (let k = 0; k < count; k++) {
        const i = from + k * step
        if (i >= recording.frames.length) break
        const frame = recording.frames[i], p = frame.player, crate = frame.props?.[0] ?? frame.run?.props?.[0]
        const cell = document.createElement('div'); cell.style.cssText = `position:relative;height:${zoom ? 300 : 180}px;overflow:hidden`
        const canvas = document.createElement('canvas'); canvas.style.cssText = `width:100%;height:430px;margin-top:${zoom ? -5 : -250}px`
        const label = document.createElement('div'); label.style.cssText = 'position:absolute;top:0;left:2px;font:11px monospace;color:#000;background:#fffc'
        label.textContent = `${i} x${p.x.toFixed(0)} ${frame.state}${p.contacts?.push && !p.contacts.push.passive ? ' push' : ''}${crate ? ` crate${crate.x.toFixed(0)} v${crate.vx.toFixed(0)}` : ''}`
        cell.append(canvas, label); box.append(cell)
        drawReviewCard(canvas, recording, i, { backdrop: 'paper', silhouette: false, joints: false, context: true, mirror: false })
      }
      return recording.frames.length
    }, { level: scene.level, phases: scene.phases, from: scene.from, count: scene.count, step: scene.step, zoom })
    await page.locator('#ice-strip').screenshot({ path: resolve(out, `${scene.name}${zoom ? '-zoom' : ''}.png`) })
    console.log(`${scene.name}: ${frames} frames -> ${resolve(out, `${scene.name}${zoom ? '-zoom' : ''}.png`)}`)
  }
} finally { await browser.close() }
