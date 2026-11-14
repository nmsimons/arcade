// Captures a fixed set of L.A.B. scenes and short frame sequences, for reviewing changes to the game's look
// (docs/jumping-look-plan.md). Frames come from the game as it runs, in hardware Edge on the default renderer,
// on a paused fake clock, so the same scene gives the same frame from one capture to the next.
//
//   node scripts/capture-lab-look.mjs --out .local/look/baseline     capture every scene
//     --url http://localhost:5173    a running dev or preview server (default: the dev server's address)
//     --only wake,tower,pool-fall    capture only these scenes (comma-separated names, see --list)
//     --wall-finish plank            serve every level with this back-wall finish, to compare finishes
//     --storage key=value            set a localStorage entry before the game loads, such as a development
//                                    look under review (jumping:look-brackets=1); repeat for several
//     --list                         print the scene names and exit
//   node scripts/capture-lab-look.mjs --compare <before dir> <after dir> --out <dir>
//                                  pair every image the two captures share, side by side
//
// Each capture also writes index.json: the source revision, and for each scene the game's state line, which
// renderer drew its last frame, and any reason WebGL left a frame to Canvas (window.jumpingWorldFrame).
// Courses open by their direct links with every course passed, so all of them are unlocked. Facility areas do
// not open by link, so a saved place puts the robot at one of their doors. A scene can move a course's entrance
// to look at another part of it; the spot must pass entranceFits (src/games/jumping/goal.ts) or the game
// refuses the level. Nothing is written to the repository's levels or saves.
import { chromium } from '@playwright/test'
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { basename, join, resolve } from 'node:path'

const VIEWPORT = { width: 1600, height: 900 }

/**
 * Stills open a course (`file`), a facility area (`hub`, arriving at `door`) or the start screen, and are taken
 * `after` milliseconds after ordinary controls start. Sequences then run `steps`: hold or release keys, and run
 * frames of 16 ms, saving a region every `every` frames into a contact sheet. The region follows the robot:
 * `follow` is its size, with the robot's feet at the fraction `at` of its width and height. `patch` changes the
 * served copy of the course, and `viewport` replaces the usual size.
 */
const SCENES = [
  { name: 'start', start: true },
  { name: 'wake', start: true, play: true },
  { name: 'concourse', hub: 'facility-concourse', door: 'concourse-to-opening' },
  { name: 'freight', hub: 'facility-freight', door: 'door-jk' },
  { name: 'security', hub: 'facility-security', door: 'door-lock-out-i' },
  { name: 'construction', hub: 'facility-construction', door: 'door-spire-i' },
  { name: 'water-wing', hub: 'facility-water', door: 'door-waterline-i' },
  { name: 'targets-wing', hub: 'facility-targets', door: 'door-drain' },
  { name: 'lab', file: 'LAB.jump-level.json' },
  { name: 'tower', file: 'Tower.jump-level.json' },
  { name: 'scaffold1', file: 'scaffold1.jump-level.json' },
  { name: 'waterline2', file: 'Waterline2.jump-level.json' },
  { name: 'quarantine2', file: 'Quarantine II.jump-level.json' },
  { name: 'quarantine3', file: 'Quarantine III.jump-level.json' },
  { name: 'lockout1', file: 'lockout1.jump-level.json' },
  { name: 'world1', file: 'world1.jump-level.json' },
  { name: 'fulltilt', file: 'fulltilt.jump-level.json' },
  { name: 'buoyancy', file: 'buoyancy.jump-level.json' },
  { name: 'spelunk-bots', file: 'spelunk.jump-level.json', entrance: { x: 3000, y: 1780 } },
  { name: 'exit-bus', file: 'exit.jump-level.json', entrance: { x: 20300, y: 2320 } },
  { name: 'exit-ridge', file: 'exit.jump-level.json', entrance: { x: 16760, y: 2445 } },
  // Sequences. A short hop from the crest of Full Tilt's first hill, down to the slope below.
  { name: 'jump-landing', sequence: true, file: 'fulltilt.jump-level.json',
    follow: { width: 520, height: 320 }, at: [.35, .62], steps: [
      { down: 'ArrowRight' }, { frames: 30, every: 6 }, { down: 'Space' }, { frames: 3, every: 3 }, { up: 'Space' },
      { frames: 42, every: 3 }, { up: 'ArrowRight' }, { frames: 18, every: 3 }] },
  // Running off the first ledge in Leaps and Bounds into its pool.
  { name: 'pool-fall', sequence: true, file: 'LAB.jump-level.json',
    follow: { width: 520, height: 320 }, at: [.4, .55], steps: [
      { down: 'ArrowRight' }, { frames: 36, every: 6 }, { frames: 12, every: 3 }, { up: 'ArrowRight' }, { frames: 54, every: 3 }] },
  // Pushing Turnaround's crate off the top of its block, 600 units down to the floor. The crate starts near the
  // edge so the push is short, its pool is left out so it lands on the floor, and the view is taller so the
  // floor stays in frame.
  { name: 'crate-drop', sequence: true, file: '07.json', viewport: { width: 1600, height: 1300 },
    entrance: { x: 1400, y: 800 }, patch: level => ({ ...level, gravityPlates: [],
      props: level.props.map(prop => ({ ...prop, x: 1290 })) }),
    follow: { width: 700, height: 760 }, at: [.6, .1], steps: [
      { down: 'ArrowLeft' }, { frames: 96, every: 12 }, { up: 'ArrowLeft' }, { frames: 66, every: 3 }] },
  // The robot runs off the same block and lands hard on the floor, 600 units below, with the pool and the rope
  // it would catch left out.
  { name: 'drop-landing', sequence: true, file: '07.json', viewport: { width: 1600, height: 1300 },
    entrance: { x: 1300, y: 800 }, patch: level => ({ ...level, gravityPlates: [], climbables: { ...level.climbables, ropes: [] },
      props: level.props.map(prop => ({ ...prop, x: 1580 })) }),
    follow: { width: 520, height: 320 }, at: [.5, .7], steps: [
      { down: 'ArrowLeft' }, { frames: 24, every: 12 }, { up: 'ArrowLeft' }, { frames: 36, every: 6 }, { frames: 36, every: 3 }] },
]

const args = process.argv.slice(2)
const option = name => { const i = args.indexOf(name); return i < 0 ? undefined : args[i + 1] }
if (args.includes('--list')) { for (const scene of SCENES) console.log(scene.name); process.exit(0) }
const out = option('--out')
if (!out) throw new Error('Give --out <dir>.')
const compare = args.indexOf('--compare')
const browser = await chromium.launch({ channel: 'msedge', args: ['--enable-gpu'] })
try {
  if (compare >= 0) await compareCaptures(resolve(args[compare + 1]), resolve(args[compare + 2]), resolve(out))
  else await capture(resolve(out))
} finally { await browser.close() }

async function capture(directory) {
  const url = (option('--url') ?? 'http://localhost:5173').replace(/\/$/, '')
  try { await fetch(url) } catch { throw new Error(`No server at ${url}. Start one with npm run dev, or give --url.`) }
  const only = option('--only')?.split(',')
  const scenes = only ? SCENES.filter(scene => only.includes(scene.name)) : SCENES
  if (only && scenes.length !== only.length) throw new Error(`Unknown scene in --only. Known: ${SCENES.map(s => s.name).join(', ')}`)
  const levels = resolve('public/levels/jumping')
  const ids = await Promise.all(JSON.parse(await readFile(join(levels, 'index.json'), 'utf8')).levels
    .map(async file => JSON.parse(await readFile(join(levels, file), 'utf8')).id))
  await mkdir(directory, { recursive: true })
  const indexFile = join(directory, 'index.json')
  const index = existsSync(indexFile) ? JSON.parse(await readFile(indexFile, 'utf8')) : { scenes: {} }
  Object.assign(index, { url, revision: revision(), captured: new Date().toISOString(), viewport: VIEWPORT })
  for (const scene of scenes) {
    const started = Date.now()
    try {
      index.scenes[scene.name] = await captureScene(scene, url, ids, directory)
      console.log(`${scene.name}: ${index.scenes[scene.name].state} (${index.scenes[scene.name].renderer}${index.scenes[scene.name].declined ? `, declined: ${index.scenes[scene.name].declined}` : ''}) ${((Date.now() - started) / 1000).toFixed(1)} s`)
    } catch (error) {
      index.scenes[scene.name] = { error: String(error).slice(0, 400) }
      console.log(`${scene.name}: FAILED ${String(error).slice(0, 300)}`)
    }
    await writeFile(indexFile, `${JSON.stringify(index, null, 1)}\n`)
  }
}

function revision() {
  try {
    const head = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim()
    return execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim() ? `${head} with uncommitted changes` : head
  } catch { return 'unknown' }
}

function sleep(ms) { return new Promise(done => setTimeout(done, ms)) }
/** Polls from Node: the page's own timers are fake and paused. */
async function until(check, timeout, what) {
  const end = Date.now() + timeout
  for (;;) {
    if (await check()) return
    if (Date.now() > end) throw new Error(`Timed out waiting for ${what}`)
    await sleep(25)
  }
}
function stateLine(page) { return page.evaluate(() => document.querySelector('.jumping-state')?.textContent ?? '') }

async function captureScene(scene, url, ids, directory) {
  const viewport = scene.viewport ?? VIEWPORT
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1 })
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', error => errors.push(String(error)))
  try {
    // Every course passed, so every course link is open; the start screen keeps a fresh save.
    if (!scene.start) await page.addInitScript(ids => {
      const times = {}, completed = {}
      for (const id of ids) { times[id] = 0; completed[id] = true }
      localStorage.setItem('arcade.jumping.times.v1', JSON.stringify(times))
      localStorage.setItem('arcade.jumping.completed.v1', JSON.stringify(completed))
    }, ids)
    const storage = args.flatMap((arg, i) => arg === '--storage' ? [args[i + 1].split(/=(.*)/s).slice(0, 2)] : [])
    if (storage.length) await page.addInitScript(entries => { for (const [key, value] of entries) localStorage.setItem(key, value) }, storage)
    if (scene.hub) await page.addInitScript(place => localStorage.setItem('arcade.jumping.facility.v1', JSON.stringify({ place })),
      { kind: 'hub', level: scene.hub, arrival: { kind: 'door', id: scene.door } })
    const finish = option('--wall-finish')
    if (scene.entrance || scene.patch || finish) await serveChangedLevels(page, (file, level) => {
      if (finish) level = { ...level, wallFinish: finish }
      if (file !== scene.file || !(scene.entrance || scene.patch)) return level
      return (scene.patch ?? (l => l))({ ...level, entrance: { ...level.entrance, ...scene.entrance } })
    })
    // Sequences locate the robot on screen: frame reports give the camera of each drawn frame, and the motion
    // probe the robot's feet.
    if (scene.follow) await page.addInitScript(() => {
      localStorage.setItem('jumping:debug-frames', '1')
      addEventListener('jumping-wall', event => {
        const { a, b, c, d, e, f } = event.detail.transform
        window.lookCamera = { a, b, c, d, e, f }
      })
    })
    // Hold the campaign back until the clock is paused, as the browser specs do, so play starts on a still clock.
    let release
    const campaignReady = new Promise(resolve => { release = resolve })
    await page.route('**/levels/jumping-campaign.json', async route => { await campaignReady; await route.fallback() })
    await page.clock.install({ time: new Date('2026-01-01T00:00:00Z') })
    const path = (scene.start ? '/lab' : scene.hub ? '/lab/facility' : `/lab/levels/built-in/${encodeURIComponent(scene.file)}`)
      + (scene.follow ? '?motionDebug=1' : '')
    await page.goto(url + path)
    await page.getByRole('dialog', { name: 'Opening the facility', exact: true }).waitFor({ state: 'visible', timeout: 60000 })
    await page.clock.pauseAt(new Date('2026-01-01T01:00:00Z'))
    release()
    if (scene.start) {
      const start = page.getByRole('dialog', { name: 'Game start', exact: true })
      await start.waitFor({ state: 'visible', timeout: 60000 })
      if (scene.play) await start.getByRole('button').first().click()
      else await page.clock.runFor(1500)
    }
    if (scene.fromStart) await prepared(page)
    else if (!scene.start || scene.play) await finishEntrance(page)
    if (!scene.sequence) {
      await page.clock.runFor(scene.after ?? 500)
      await page.screenshot({ path: join(directory, `${scene.name}.png`) })
    } else {
      const frames = join(directory, scene.name), shots = []
      await rm(frames, { recursive: true, force: true }); await mkdir(frames, { recursive: true })
      let frame = 0
      for (const step of scene.steps) {
        if (step.down) await page.keyboard.down(step.down)
        if (step.up) await page.keyboard.up(step.up)
        for (let i = 0; i < (step.frames ?? 0); i++) {
          await page.clock.runFor(16); frame++
          if (frame % (step.every ?? 1)) continue
          const file = join(frames, `f${String(frame).padStart(3, '0')}.png`)
          await page.screenshot({ path: file, clip: await followClip(page, scene, viewport) })
          shots.push({ file, label: `${frame * 16} ms · ${await stateLine(page)}` })
        }
      }
      await contactSheet(shots, join(directory, `${scene.name}.png`), scene.follow, `${scene.name} · ${scene.file}`)
    }
    const renderer = await page.evaluate(() => {
      const frame = window.jumpingWorldFrame
      return frame ? { renderer: frame.declined ? 'canvas' : 'webgl', webglFrames: frame.frames, declined: frame.declined, declines: { ...frame.declines } }
        : { renderer: 'canvas', webglFrames: 0, declined: 'no WebGL', declines: {} }
    })
    return { state: await stateLine(page), ...renderer, ...(errors.length ? { errors } : {}) }
  } finally { await context.close() }
}

/** Gameplay starts once the doorway or the pod has opened and ordinary controls are live (as finishJumpingEntrance). */
function prepared(page) {
  return until(() => page.evaluate(() => !!document.querySelector('.jumping-state')
    && !document.querySelector('.jumping-game[aria-busy="true"]')), 60000, 'the level to prepare')
}
async function finishEntrance(page) {
  await prepared(page)
  await page.clock.runFor(await stateLine(page) === 'Waking up' ? 3600 : 1350)
  await until(async () => { await page.clock.runFor(16); return !/^(Entering the level|Waking up)$/.test(await stateLine(page)) }, 30000, 'controls')
  const now = await page.evaluate(() => performance.now())
  await page.clock.runFor((16 - now % 16) % 16)
}

/** The region of the screen around the robot's feet, kept inside the viewport. */
async function followClip(page, scene, viewport) {
  const { camera, feet } = await page.evaluate(() => ({ camera: window.lookCamera, feet: window.jumpingMotion?.read().recent.at(-1) }))
  if (!camera || !feet) throw new Error('No camera or robot position reported; is debug-frames reporting on?')
  const { width, height } = scene.follow, [ax, ay] = scene.at ?? [.5, .6]
  const x = camera.a * feet.x + camera.c * feet.y + camera.e, y = camera.b * feet.x + camera.d * feet.y + camera.f
  return { x: Math.max(0, Math.min(viewport.width - width, Math.round(x - width * ax))),
    y: Math.max(0, Math.min(viewport.height - height, Math.round(y - height * ay))), width, height }
}

/** Serves changed copies of levels, through both the public files and the development catalog. */
async function serveChangedLevels(page, change) {
  await page.route('**/levels/jumping/*.json', async route => {
    const file = decodeURIComponent(new URL(route.request().url()).pathname.split('/').at(-1))
    if (file === 'index.json') return route.fallback()
    const response = await route.fetch()
    await route.fulfill({ response, json: change(file, await response.json()) })
  })
  await page.route('**/__arcade/jumping-levels', async route => {
    if (route.request().method() !== 'POST') return route.fallback()
    const response = await route.fetch()
    let body
    try { body = await response.json() } catch { return route.fulfill({ response }) }
    for (const entry of body.files ?? []) {
      if (entry.sourceText) entry.sourceText = JSON.stringify(change(entry.fileName, JSON.parse(entry.sourceText)))
      if (entry.level) entry.level = change(entry.fileName, entry.level)
    }
    await route.fulfill({ response, json: body })
  })
}

/** Lays images out in a labelled grid and saves it as one PNG. */
async function sheet(cells, file, { columns, cellWidth, title }) {
  const page = await browser.newPage({ viewport: { width: columns * (cellWidth + 12) + 12, height: 400 } })
  try {
    const images = await Promise.all(cells.map(async cell => ({ ...cell, src: `data:image/png;base64,${(await readFile(cell.file)).toString('base64')}` })))
    await page.setContent(`<!doctype html><style>
      body { margin: 0; padding: 12px; background: #e9e8e1; font: 12px ui-monospace, monospace; color: #303c36 }
      h1 { font: bold 15px system-ui, sans-serif; margin: 0 0 10px }
      .grid { display: grid; grid-template-columns: repeat(${columns}, ${cellWidth}px); gap: 12px }
      figure { margin: 0 } img { display: block; width: ${cellWidth}px; outline: 1px solid #c9c8bf } figcaption { padding-top: 3px }
    </style><h1></h1><div class="grid"></div>`)
    await page.evaluate(({ images, title }) => {
      document.querySelector('h1').textContent = title
      for (const image of images) {
        const figure = document.createElement('figure'), img = document.createElement('img'), caption = document.createElement('figcaption')
        img.src = image.src; caption.textContent = image.label; figure.append(img, caption)
        document.querySelector('.grid').append(figure)
      }
      return Promise.all([...document.images].map(img => img.decode()))
    }, { images, title })
    await page.screenshot({ path: file, fullPage: true })
  } finally { await page.close() }
}
function contactSheet(shots, file, size, title) {
  return sheet(shots, file, { columns: size.width > 600 ? 4 : 5, cellWidth: size.width > 600 ? 380 : 340, title })
}

async function compareCaptures(before, after, directory) {
  await mkdir(directory, { recursive: true })
  const pngs = async dir => (await readdir(dir)).filter(name => name.endsWith('.png'))
  const shared = (await pngs(before)).filter(name => existsSync(join(after, name)))
  for (const name of shared) {
    await sheet([{ file: join(before, name), label: `before · ${basename(before)}` }, { file: join(after, name), label: `after · ${basename(after)}` }],
      join(directory, name), { columns: 2, cellWidth: 900, title: name.replace(/\.png$/, '') })
    console.log(name)
  }
}
