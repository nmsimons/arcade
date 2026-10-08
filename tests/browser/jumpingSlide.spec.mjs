import { test, expect } from './helpers/test.mjs'
import { useLevelFixtures } from './helpers/jumpingLevels.mjs'
import { slideLevel } from '../helpers/jumping-slide.mjs'
import { pointInside } from '../../src/games/jumping/geometry.ts'

const history = page => page.evaluate(() => window.jumpingMotion.read().recent)
async function open(page, level) {
  await page.setViewportSize({ width: 390, height: 844 })
  await useLevelFixtures(page, [level])
  await page.clock.install({ time: new Date('2026-10-08T12:00:00Z') })
  await page.goto('/untitled-jumping-game?motionDebug=1')
  await expect(page.locator('.jumping-level-card[aria-pressed=true]')).toBeVisible()
  await page.clock.pauseAt(new Date('2026-10-08T13:00:00Z'))
  await page.locator('.jumping-level-card[aria-pressed=true]').click()
  await expect(page.getByRole('img', { name: `${level.name}: reach the exit`, exact: true })).toBeFocused()
  await page.clock.runFor(64)
  await page.keyboard.down('w'); await page.clock.runFor(16); await page.keyboard.up('w')
  if (level.gravityPlates) {
    await page.clock.runFor(1024)
    const p = (await history(page)).at(-1)
    expect(p.signals.inverted).toBe(true); expect(p.signals.grounded).toBe(true)
  }
}

for (const direction of [-1, 1]) test(`a walking entry becomes a visibly balanced fast 55° slide (${direction})`, async ({ page }, info) => {
  const level = slideLevel(55, direction), key = direction > 0 ? 'd' : 'a'
  await open(page, level)
  await page.keyboard.down('Shift'); await page.keyboard.down(key)
  let entry
  for (let i = 0; i < 40; i++) {
    await page.clock.runFor(16); entry = (await history(page)).at(-1)
    if (entry.signals.sliding) break
  }
  expect(entry.signals.sliding).toBe(true); expect(Math.hypot(entry.vx, entry.vy)).toBeLessThan(200)
  await page.keyboard.up(key); await page.keyboard.up('Shift')
  await page.screenshot({ path: info.outputPath('walking-slide-entry.png') })
  await page.clock.runFor(1200)
  const samples = await history(page), fast = samples.filter(p => p.signals.sliding && p.blends.slide === 1 && Math.hypot(p.vx, p.vy) > 600)
  expect(fast.length).toBeGreaterThan(30)
  for (const p of fast) {
    expect(p.input.move).toBe(0)
    expect(p.points[4][1]).toBeLessThan(p.points[0][1] - 10)
    expect((p.points[1][0] - p.points[0][0]) * p.signals.facing * direction).toBeLessThan(-4)
    for (const hand of p.contacts.hands) expect(pointInside(level.platforms[0], hand.x, hand.y)).toBe(false)
  }
  await page.screenshot({ path: info.outputPath('fast-slide-balance.png') })
  await page.keyboard.down('Space'); await page.clock.runFor(184); await page.keyboard.up('Space')
  const departed = (await history(page)).at(-1)
  expect(departed.signals.sliding).toBe(false); expect(departed.signals.grounded).toBe(false); expect(departed.vy).toBeLessThan(0)
  await page.screenshot({ path: info.outputPath('fresh-press-slide-jump.png') })
})

for (const direction of [-1, 1]) test(`an inverted 70° slide reaches fast slip with hands outside the actual ceiling face (${direction})`, async ({ page }, info) => {
  const level = slideLevel(70, direction, true), key = direction > 0 ? 'd' : 'a'
  await open(page, level)
  await page.screenshot({ path: info.outputPath('inverted-starting-support.png') })
  await page.keyboard.down(key); await page.clock.runFor(384); await page.keyboard.up(key)
  await page.clock.runFor(1200)
  const fast = (await history(page)).filter(p => p.signals.sliding && p.blends.slide === 1 && Math.hypot(p.vx, p.vy) > 600)
  expect(fast.length).toBeGreaterThan(30)
  for (const p of fast) {
    expect(p.signals.inverted).toBe(true); expect(p.signals.grounded).toBe(false)
    for (const hand of p.contacts.hands) expect(pointInside(level.platforms[0], hand.x, hand.y)).toBe(false)
    expect((p.points[1][0] - p.points[0][0]) * p.signals.facing * direction).toBeLessThan(-4)
  }
  await page.screenshot({ path: info.outputPath('inverted-fast-slide.png') })
})

for (const direction of [-1, 1]) test(`normal walking near the traction limit keeps grip (${direction})`, async ({ page }, info) => {
  const level = slideLevel(46.3, direction), key = direction > 0 ? 'd' : 'a'
  await open(page, level)
  await page.keyboard.down('Shift'); await page.keyboard.down(key); await page.clock.runFor(2400)
  await page.keyboard.up(key); await page.keyboard.up('Shift')
  const onSlope = (await history(page)).filter(p => (direction > 0 ? p.x : level.width - p.x) > 380)
  expect(onSlope.length).toBeGreaterThan(60)
  for (const p of onSlope) { expect(p.signals.grounded).toBe(true); expect(p.signals.sliding).toBe(false) }
  await page.screenshot({ path: info.outputPath('near-limit-gripped-walk.png') })
})

for (const direction of [-1, 1]) for (const inverted of [false, true]) test(`slow 70° entry turns toward its real brace smoothly and accepts a fresh jump (${direction}, ${inverted})`, async ({ page }, info) => {
  const level = slideLevel(70, direction, inverted), key = direction > 0 ? 'd' : 'a'
  await open(page, level)
  await page.keyboard.down('Shift'); await page.keyboard.down(key)
  let entry
  for (let i = 0; i < 40; i++) {
    await page.clock.runFor(16); entry = (await history(page)).at(-1)
    if (entry.signals.sliding) break
  }
  expect(entry.signals.sliding).toBe(true)
  await page.keyboard.up(key); await page.keyboard.up('Shift')
  let brace
  for (let i = 0; i < 40; i++) {
    await page.clock.runFor(16); brace = (await history(page)).at(-1)
    if (brace.signals.bracing && brace.signals.facing === -direction) break
  }
  expect(brace.signals.bracing).toBe(true); expect(brace.signals.facing).toBe(-direction)
  const samples = await history(page), first = samples.findIndex(p => p.signals.sliding)
  expect(first).toBeGreaterThan(0)
  for (let i = first; i < samples.length; i++) for (let k = 0; k < samples[i].points.length; k++) {
    const a = samples[i - 1], b = samples[i]
    const delta = Math.hypot(b.points[k][0] * b.signals.facing - a.points[k][0] * a.signals.facing,
      b.points[k][1] - a.points[k][1])
    expect(delta, `joint ${k} through entry/brace at ${b.time}`).toBeLessThanOrEqual(5)
  }
  await page.screenshot({ path: info.outputPath('slow-entry-brace-transfer.png') })
  await page.keyboard.down('Space'); await page.clock.runFor(16); await page.keyboard.up('Space')
  const launched = (await history(page)).at(-1)
  expect(launched.vy * (inverted ? -1 : 1)).toBeLessThan(-200)
  expect(launched.signals.sliding).toBe(false); expect(launched.signals.grounded).toBe(false)
  await page.clock.runFor(128)
  await page.screenshot({ path: info.outputPath('fresh-press-during-brace-turn.png') })
})

for (const options of [
  { degrees: 70, entry: 'walk', direction: 1, inverted: false, steer: 'neutral' },
  { degrees: 55, entry: 'run', direction: -1, inverted: false, steer: 'uphill' },
  { degrees: 70, entry: 'walk', direction: 1, inverted: true, steer: 'neutral' },
  { degrees: 55, entry: 'run', direction: -1, inverted: true, steer: 'downhill' },
]) test(`connected landing retains the actual outgoing rig (${JSON.stringify(options)})`, async ({ page }, info) => {
  const { degrees, entry, direction, inverted, steer } = options
  const level = slideLevel(degrees, direction, inverted), key = direction > 0 ? 'd' : 'a'
  await open(page, level)
  if (entry === 'walk') await page.keyboard.down('Shift')
  await page.keyboard.down(key)
  let slipped
  for (let i = 0; i < 40; i++) {
    await page.clock.runFor(16); slipped = (await history(page)).at(-1)
    if (slipped.signals.sliding) break
  }
  expect(slipped.signals.sliding).toBe(true)
  await page.keyboard.up(key)
  if (entry === 'walk') await page.keyboard.up('Shift')
  const held = steer === 'uphill' ? direction > 0 ? 'a' : 'd' : steer === 'downhill' ? key : null
  if (held) await page.keyboard.down(held)
  let complete = false, witnessed = false
  const samples = []
  for (let i = 0; i < 24; i++) {
    await page.clock.runFor(128)
    const recent = await history(page)
    for (const sample of recent) if (!samples.length || sample.time > samples.at(-1).time) samples.push(sample)
    const last = samples.at(-1)
    witnessed ||= recent.some(sample => sample.signals.slideLanding)
    if (witnessed && last.signals.grounded && !last.signals.slideLanding && last.blends.slide === 0) { complete = true; break }
  }
  expect(witnessed).toBe(true); expect(complete).toBe(true)
  for (let i = 1; i < samples.length; i++) {
    const a = samples[i - 1], b = samples[i], x = direction > 0 ? b.x : level.width - b.x
    if (x <= 940 || !a.signals.slideLanding && !b.signals.slideLanding && a.blends.slide === 0 && b.blends.slide === 0) continue
    for (let k = 0; k < b.points.length; k++) expect(Math.hypot(
      b.points[k][0] * b.signals.facing - a.points[k][0] * a.signals.facing, b.points[k][1] - a.points[k][1]),
    `joint ${k} at ${b.time}`).toBeLessThanOrEqual(5)
  }
  await page.screenshot({ path: info.outputPath('complete-connected-landing.png') })
  if (held) await page.keyboard.up(held)
  await page.keyboard.down('Space'); await page.clock.runFor(16); await page.keyboard.up('Space')
  const launched = (await history(page)).at(-1)
  expect(launched.signals.grounded).toBe(false); expect(launched.vy * (inverted ? -1 : 1)).toBeLessThan(-200)
  await page.screenshot({ path: info.outputPath('fresh-press-after-landing.png') })
})
