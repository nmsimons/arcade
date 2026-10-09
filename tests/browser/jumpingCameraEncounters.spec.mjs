import { readFileSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import { test, expect } from './helpers/test.mjs'
import { useLevelFixtures } from './helpers/jumpingLevels.mjs'
import { reverseRopeWorkshop } from './helpers/jumpingRopeGravity.mjs'
import { advanceJumpingPassiveWait } from './helpers/simulation.mjs'
import { waterBindingLevel } from '../helpers/jumpingWaterBindings.mjs'
import { proneDropLevel } from '../helpers/jumpingProneScenarios.mjs'
import { blankTrial, levelProblems } from '../../src/games/jumping/level.ts'

const sizes = [{ width: 852, height: 393 }, { width: 1280, height: 800 }]
const builtIn = file => JSON.parse(readFileSync(new URL(`../../public/levels/jumping/${file}`, import.meta.url)))
const sample = page => page.evaluate(() => window.jumpingMotion.read().recent.at(-1))

function encounter(kind, night) {
  let level
  if (kind === 'ladder') level = builtIn('00.json')
  else if (kind === 'rope') level = builtIn('02.json')
  else if (kind === 'water') level = waterBindingLevel('bank')
  else if (kind === 'gravity') level = reverseRopeWorkshop()
  else if (kind === 'gate') {
    level = proneDropLevel('moving gate', 1)
    Object.assign(level.mechanisms[0], { y: 950, h: 800, travel: 800 })
  } else level = { ...blankTrial(), width: 2400, height: 1200, floor: 1000,
    spawn: { x: 260, y: 650 }, goal: { x: 2100, y: 1000 },
    platforms: [{ x: 0, y: 650, w: 320, h: 350 }],
    props: [{ kind: 'box', x: 530, y: 650, size: 80 }],
    mechanisms: [{ id: 'carrier', kind: 'lift', x: 320, y: 650, w: 400, h: 20,
      travel: 1200, orientation: 'horizontal', flipX: true, power: 'always' }] }
  // Variants are isolated regression maps; never overwrite the authored files.
  return { ...level, version: 2, lighting: { nightMode: night, ambient: 0,
    lights: [{ id: 'camera-encounter-lamp', x: Math.min(level.width - 40, level.spawn.x + 300),
      y: Math.max(40, level.spawn.y - 320), direction: 90, spread: 100, power: 'always' }] } }
}

async function open(page, level, size) {
  await page.setViewportSize(size)
  expect(levelProblems(level)).toEqual([])
  await useLevelFixtures(page, [level])
  await page.addInitScript(() => {
    const fill = CanvasRenderingContext2D.prototype.fillRect
    CanvasRenderingContext2D.prototype.fillRect = function (...args) {
      if (args[0] === 0 && args[1] === 0 && this.fillStyle === '#f1f1ed' && this.canvas.matches('.jumping-game > canvas')) {
        const t = this.getTransform(), rect = this.canvas.getBoundingClientRect(), ratio = this.canvas.width / rect.width
        const frame = { time: performance.now(), x: -t.e / t.a, y: -t.f / t.d, zoom: t.a / ratio }
        window.cameraEncounterFrames ??= []
        if (window.cameraEncounterFrames.at(-1)?.time === frame.time) window.cameraEncounterFrames[window.cameraEncounterFrames.length - 1] = frame
        else window.cameraEncounterFrames.push(frame)
      }
      return fill.apply(this, args)
    }
  })
  await page.clock.install({ time: new Date('2026-01-01T00:00:00Z') })
  await page.goto('/untitled-jumping-game?motionDebug=1')
  await expect(page.locator('.jumping-level-card[aria-pressed=true]')).toBeVisible()
  await page.clock.pauseAt(new Date('2026-01-01T01:00:00Z'))
  await page.locator('.jumping-level-card[aria-pressed=true]').click()
  await expect(page.locator('canvas')).toBeFocused()
  await page.clock.runFor(64)
  await page.evaluate(() => { window.cameraEncounterFrames = [window.cameraEncounterFrames.at(-1)] })
}

for (const size of sizes) for (const night of [false, true]) for (const kind of ['ladder', 'rope', 'gate', 'carrier', 'water', 'gravity']) {
  test(`${kind} keeps actual contacts and recovery in frame at ${size.width}x${size.height} ${night ? 'active night light' : 'day'}`, async ({ page }, info) => {
    // Active full-size night rendering is slower in software Chromium; this
    // new encounter test is not an FPS benchmark. Original camera cases keep 30 s.
    test.setTimeout(size.width === 1280 && night ? 90000 : 60000)
    const errors = []; page.on('pageerror', error => errors.push(error.message))
    const level = encounter(kind, night), checkpoints = []
    await open(page, level, size)
    async function checkpoint(label, point, requireVisible = true) {
      const c = await page.evaluate(() => window.cameraEncounterFrames.at(-1)), p = await sample(page)
      const screen = [(point[0] - c.x) * c.zoom, (point[1] - c.y) * c.zoom]
      checkpoints.push({ label, point, screen, camera: { x: c.x, y: c.y, zoom: c.zoom },
        player: { x: p.x, y: p.y, vx: p.vx, vy: p.vy, mode: p.signals.mode },
        distance: Math.hypot(point[0] - p.x, point[1] - p.y), time: p.time })
      if (requireVisible) {
        expect(screen[0], label).toBeGreaterThanOrEqual(8)
        expect(screen[0], label).toBeLessThanOrEqual(size.width - 8)
        expect(screen[1], label).toBeGreaterThanOrEqual(8)
        expect(screen[1], label).toBeLessThanOrEqual(size.height - 8)
      }
      await page.screenshot({ path: info.outputPath(`${label}.png`) })
    }
    if (kind === 'ladder') {
      await checkpoint('first-gap-destination', [780, 1200])
      await page.keyboard.down('d'); await page.clock.runFor(1264)
      await page.keyboard.up('d'); await page.keyboard.down('a')
      let p
      for (let i = 0; i < 80; i++) { await page.clock.runFor(32); p = await sample(page); if (p.signals.grounded && p.y === 1600) break }
      expect(p.y).toBe(1600); expect(p.signals.grounded).toBe(true)
      await checkpoint('missed-jump-recovery-ladder', [560, 1520])
      for (let i = 0; i < 80 && p.x > 573; i++) { await page.clock.runFor(16); p = await sample(page) }
      await page.keyboard.up('a'); await page.keyboard.down('w'); await page.clock.runFor(160)
      expect((await sample(page)).signals.mode).toBe('ladder')
      await checkpoint('ladder-acquisition', [560, 1200])
      const acquiredY = (await sample(page)).y
      await page.clock.runFor(1500); await page.keyboard.up('w')
      expect((await sample(page)).signals.mode).toBe('ladder'); expect((await sample(page)).y).toBeLessThan(acquiredY - 80)
      await checkpoint('ladder-ascent-next-footing', [560, 1200])
      // Full floor-to-start recovery remains in jumpingIntroduction.spec.mjs.
    } else if (kind === 'rope') {
      await page.keyboard.down('d'); await page.clock.runFor(1040)
      await checkpoint('rope-before-jump', [840, 1090])
      await page.keyboard.down('Space'); await page.clock.runFor(688)
      expect((await sample(page)).signals.mode).toBe('rope')
      await page.keyboard.up('d'); await page.keyboard.up('Space'); await page.clock.runFor(16)
      await checkpoint('automatic-rope-contact', [(await sample(page)).contacts.hands[0].x, (await sample(page)).contacts.hands[0].y])
      await page.keyboard.down('w'); await page.clock.runFor(832); await page.keyboard.up('w')
      await page.keyboard.down('d'); await page.clock.runFor(700); await page.keyboard.up('d')
      expect((await sample(page)).signals.mode).toBe('rope')
      await checkpoint('rope-swing-next-landing', [1140, 1200])
      await page.keyboard.down('Space'); await page.clock.runFor(32); await page.keyboard.up('Space')
      expect((await sample(page)).signals.mode).toBe('free')
    } else if (kind === 'gate') {
      await page.keyboard.down('Shift'); await page.keyboard.down('d'); await page.clock.runFor(1400)
      await page.keyboard.up('d'); await page.keyboard.up('Shift'); await page.clock.runFor(900)
      expect((await sample(page)).signals.mode).toBe('hang')
      const hands = (await sample(page)).contacts.hands
      await checkpoint('moving-gate-caught-lip', [hands[0].x, hands[0].y])
      await page.clock.runFor(300)
      await checkpoint('moving-gate-held-contact', [(await sample(page)).x, (await sample(page)).y - 50])
      await page.keyboard.down('x'); await page.clock.runFor(100); await page.keyboard.up('x')
      expect((await sample(page)).signals.mode).not.toBe('hang')
      await page.clock.runFor(2300)
      expect((await sample(page)).signals.grounded).toBe(true)
      await checkpoint('gate-drop-recovery-floor', [(await sample(page)).x, 2400])
    } else if (kind === 'carrier') {
      await checkpoint('carrier-boarding', [360, 650])
      await page.keyboard.down('d'); await page.clock.runFor(120)
      await page.keyboard.down('Space'); await page.clock.runFor(180); await page.keyboard.up('Space')
      await page.clock.runFor(550); await page.keyboard.up('d'); await page.clock.runFor(1200)
      expect((await sample(page)).signals.mode).toBe('hang')
      await checkpoint('carried-crate-caught-lip', [(await sample(page)).contacts.hands[0].x, (await sample(page)).contacts.hands[0].y])
      await page.keyboard.down('w'); await page.clock.runFor(900); await page.keyboard.up('w')
      expect((await sample(page)).signals.grounded).toBe(true)
      await page.keyboard.down('Shift'); await page.keyboard.down('a'); await page.clock.runFor(480)
      await page.keyboard.up('a'); await page.keyboard.up('Shift'); await page.clock.runFor(600)
      const p = await sample(page)
      expect(p.signals.support).toBe('mechanism:0'); expect(p.signals.grounded).toBe(true)
      await checkpoint('carrier-cargo-contact', [p.x, p.y])
      await page.clock.runFor(1000)
      const carried = await sample(page)
      expect(carried.signals.support).toBe('mechanism:0'); expect(Math.abs(carried.x - p.x)).toBeGreaterThan(50)
      await checkpoint('passive-carrier-travel', [carried.x, carried.y])
    } else if (kind === 'water') {
      await page.keyboard.down('s'); await page.clock.runFor(1000); await page.keyboard.up('s')
      await advanceJumpingPassiveWait(page, 8000)
      await checkpoint('pool-rest-next-bank', [640, 380])
      const rest = await page.evaluate(() => window.cameraEncounterFrames.at(-1))
      await advanceJumpingPassiveWait(page, 1000)
      const settled = await page.evaluate(() => window.cameraEncounterFrames.at(-1))
      expect(Math.abs(settled.y - rest.y) * rest.zoom).toBeLessThan(2)
      await page.keyboard.down('d'); await page.keyboard.down('w'); await page.clock.runFor(1200)
      await page.keyboard.up('d'); await page.clock.runFor(400); await page.keyboard.up('w')
      expect((await sample(page)).signals.grounded).toBe(true); expect((await sample(page)).y).toBeCloseTo(380, 1)
      await checkpoint('water-exit-dry-footing', [(await sample(page)).x, 380])
    } else {
      await page.keyboard.down('d'); await page.clock.runFor(20); await page.keyboard.up('d')
      await page.clock.runFor(3500)
      expect((await sample(page)).signals.inverted).toBe(true); expect((await sample(page)).signals.grounded).toBe(true)
      await checkpoint('real-gravity-ceiling-contact', [(await sample(page)).x, 0])
      await page.keyboard.down('ArrowDown'); await page.clock.runFor(900); await page.keyboard.up('ArrowDown')
      expect((await sample(page)).signals.mode).toBe('rope')
      await checkpoint('inverted-rope-hands', [(await sample(page)).contacts.hands[0].x, (await sample(page)).contacts.hands[0].y])
      await page.keyboard.down('ArrowUp'); await page.clock.runFor(250); await page.keyboard.up('ArrowUp')
      await page.keyboard.down('Space'); await page.clock.runFor(32); await page.keyboard.up('Space')
      expect((await sample(page)).signals.mode).toBe('free')
    }
    const frames = await page.evaluate(() => window.cameraEncounterFrames)
    let maxHorizontal = 0, maxVertical = 0
    for (let i = 1; i < frames.length; i++) {
      const a = frames[i - 1], b = frames[i]
      maxHorizontal = Math.max(maxHorizontal, Math.abs(b.x - a.x) * b.zoom)
      maxVertical = Math.max(maxVertical, Math.abs(b.y - a.y) * b.zoom)
    }
    expect(maxHorizontal).toBeLessThan(13)
    expect(maxVertical).toBeLessThan(18)
    expect(errors).toEqual([])
    await writeFile(info.outputPath('contact-framing.json'), JSON.stringify({ size, night, kind, checkpoints, maxHorizontal, maxVertical, frames }, null, 2))
  })
}
