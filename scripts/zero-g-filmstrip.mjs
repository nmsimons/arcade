// Filmstrips of a weightless player with floating props, drawn by the model review lab from fresh starts with
// ordinary inputs, saved as PNG. Pairs with scripts/zero-g-lab.mjs (measurements); see docs/jumping-zero-g-objects.md.
//
//   node scripts/zero-g-filmstrip.mjs --out <dir> [--url http://localhost:5173] [--only push] [--zoom]
//   --zoom draws the card's close view of the body (about three times gameplay size) instead of gameplay size.
//
// Needs the dev server running (npm run dev). Each scene writes <dir>/<scene>.png: frames every `step` ticks from
// `from`, left to right, labelled with the frame, the player's x, its state and its fall. Scenes run in a weightless
// copy of a blank room, or in the user's Untitled level 2 scenario.
import { chromium } from '@playwright/test'
import { mkdir, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const args = process.argv.slice(2)
const option = name => { const at = args.indexOf(name); return at < 0 ? undefined : args[at + 1] }
const out = resolve(option('--out') ?? '.local/zero-g-filmstrips'), url = option('--url') ?? 'http://localhost:5173', only = option('--only'), zoom = args.includes('--zoom')

/** A weightless room (1800 x 920, floor at 920) with props; the player enters on the floor at x 160. */
const room = props => ({ version: 1, id: 'zero-g-filmstrip', name: 'Zero g filmstrip', width: 1800, height: 920, floor: 920,
  entrance: { x: 160, y: 920 }, goal: { x: 1620, y: 920 }, platforms: [], checkpoints: [], climbables: { ropes: [], ladders: [] },
  props, robots: [], triggers: [], mechanisms: [], timers: [], texts: [], pickups: [], times: { a: 10, b: 20, c: 40, d: 60 },
  gravityPlates: [{ id: 'z', x: 0, y: 0, w: 1800, h: 920, gravity: 0, power: 'always' }] })
const scenario = JSON.parse(await readFile(new URL('../public/levels/jumping/Untitled level 2.jump-level.json', import.meta.url), 'utf8'))
const second = n => n * 60 // the lab samples every other tick: 60 frames a second

const scenes = [
  // Boots lift the player off the floor and carry it into a ball floating at its height, then it coasts.
  { name: 'bump-ball', level: room([{ kind: 'ball', x: 560, y: 905, size: 68 }]), phases: [[1.6, { move: 1 }], [1.2, {}]], from: second(.9), count: 30, step: 2 },
  // Thrust held into a ball: one push or a string of bumps, and where the hands are.
  { name: 'push-ball', level: room([{ kind: 'ball', x: 520, y: 905, size: 68 }]), phases: [[3.5, { move: 1 }]], from: second(.9), count: 36, step: 4 },
  { name: 'push-box', level: room([{ kind: 'box', x: 520, y: 912, size: 80 }]), phases: [[3.5, { move: 1 }]], from: second(.9), count: 36, step: 4 },
  // Up toward a box floating overhead: the roll turns the feet to it and the body lands on its underside, stands, then jumps off.
  { name: 'land-on-box', level: room([{ kind: 'box', x: 160, y: 600, size: 80 }]), phases: [[1.6, { climb: true }], [1.4, {}], [.1, { jump: true }], [1, {}]], from: second(.2), count: 36, step: 4 },
  // The user's scenario: up and right through the props, then back left.
  { name: 'scenario', level: scenario, phases: [[2, { move: 1, climb: true }], [3, { move: 1 }], [3, { move: -1, descend: true }]], from: second(1), count: 48, step: 8 },
  // The same, close: every other frame through the first contacts.
  { name: 'scenario-close', level: scenario, phases: [[2, { move: 1, climb: true }], [3, { move: 1 }], [3, { move: -1, descend: true }]], from: second(1.8), count: 48, step: 2 },
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
      const clip = { id: 'zero-g', title: 'zero g', group: 'Zero g', focus: '', phases: phases.map(([seconds, input], i) => ({ seconds, label: `phase ${i + 1}`, input })) }
      const recording = await recordReviewClip(clip, level)
      document.getElementById('zero-g-strip')?.remove()
      const box = document.createElement('div'); box.id = 'zero-g-strip'
      box.style.cssText = 'position:absolute;left:0;top:0;width:1500px;z-index:99999;background:#fff;display:grid;grid-template-columns:repeat(6,1fr);gap:2px'
      document.body.append(box)
      for (let k = 0; k < count; k++) {
        const i = from + k * step
        if (i >= recording.frames.length) break
        const frame = recording.frames[i], p = frame.player, fall = p.freeFall
        const cell = document.createElement('div'); cell.style.cssText = `position:relative;height:${zoom ? 300 : 180}px;overflow:hidden`
        const canvas = document.createElement('canvas'); canvas.style.cssText = `width:100%;height:430px;margin-top:${zoom ? -5 : -250}px`
        const label = document.createElement('div'); label.style.cssText = 'position:absolute;top:0;left:2px;font:11px monospace;color:#000;background:#fffc'
        label.textContent = `${i} x${p.x.toFixed(0)} ${frame.state}${p.contacts?.body?.length ? ' touch' : ''}${p.contacts?.support?.collider?.prop ? ' on prop' : ''}${fall?.amount ? ` fall ${fall.amount.toFixed(1)}` : ''}`
        cell.append(canvas, label); box.append(cell)
        drawReviewCard(canvas, recording, i, { backdrop: 'paper', silhouette: false, joints: false, context: true, mirror: false })
      }
      return recording.frames.length
    }, { level: scene.level, phases: scene.phases, from: scene.from, count: scene.count, step: scene.step, zoom })
    await page.locator('#zero-g-strip').screenshot({ path: resolve(out, `${scene.name}${zoom ? '-zoom' : ''}.png`) })
    console.log(`${scene.name}: ${frames} frames -> ${resolve(out, `${scene.name}.png`)}`)
  }
} finally { await browser.close() }
