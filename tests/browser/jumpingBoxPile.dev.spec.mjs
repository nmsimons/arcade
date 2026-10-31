import { readFileSync } from 'node:fs'
import { test, expect } from './helpers/test.mjs'
import { finishJumpingEntrance, useLevelFixtures } from './helpers/jumpingLevels.mjs'
import { advanceJumpingPassiveWait } from './helpers/simulation.mjs'

const read = page => page.evaluate(() => window.jumpingMotion.read())
const sample = async page => (await read(page)).recent.at(-1)
async function until(page, predicate, milliseconds = 6000) {
  for (let elapsed = 0; elapsed < milliseconds; elapsed += 32) {
    if (predicate(await sample(page))) return
    await page.clock.runFor(32)
  }
  expect(predicate(await sample(page))).toBe(true)
}
async function start(page, x) {
  const level = JSON.parse(readFileSync(new URL('../fixtures/jumping/box-bin.json', import.meta.url)))
  level.goal = { x: 1800, y: 1200 }
  await useLevelFixtures(page, [level])
  await page.clock.install({ time: new Date('2026-01-01T00:00:00Z') })
  await page.goto('/lab?motionDebug=1&renderControl=1')
  await expect(page.getByRole('button', { name: 'Play Box bin regression', exact: true })).toBeEnabled()
  await page.clock.pauseAt(new Date('2026-01-01T01:00:00Z'))
  await page.getByRole('button', { name: 'Play Box bin regression', exact: true }).click()
  await finishJumpingEntrance(page)
  await advanceJumpingPassiveWait(page, 4000)
  // Enter the bin from its authored floor, climbing the outside crate and
  // jumping its rim with ordinary keys before approaching the reported pile.
  await page.keyboard.down('ArrowRight'); await until(page, p => p.x >= 290)
  await page.keyboard.down('Space'); await page.clock.runFor(180); await page.keyboard.up('Space')
  await until(page, p => p.signals.mode === 'hang')
  await page.keyboard.up('ArrowRight'); await page.keyboard.down('ArrowUp')
  await until(page, p => p.signals.grounded)
  await page.keyboard.up('ArrowUp'); await page.keyboard.down('ArrowRight')
  await until(page, p => p.x >= 500)
  await page.keyboard.down('Space'); await page.clock.runFor(180); await page.keyboard.up('Space')
  await until(page, p => p.signals.grounded || p.signals.mode === 'hang')
  await page.keyboard.up('ArrowRight'); await page.keyboard.down('ArrowUp')
  await until(page, p => p.signals.grounded)
  await page.keyboard.up('ArrowUp'); await page.clock.runFor(400)
  await page.keyboard.down('Shift'); await page.keyboard.down('ArrowRight')
  await until(page, p => p.x >= x - 6)
  await page.keyboard.up('ArrowRight'); await page.keyboard.up('Shift'); await page.clock.runFor(400)
  expect((await sample(page)).signals.support).toBe('prop:7')
}

function connected(samples) {
  for (const sample of samples) {
    const [hip, shoulder, head] = sample.points
    expect(Math.abs(hip[0])).toBeLessThan(20)
    expect(Math.abs(shoulder[0])).toBeLessThan(30)
    expect(Math.hypot(head[0] - shoulder[0], head[1] - shoulder[1])).toBeLessThan(12)
  }
}

test('keyboard approaches and jumps beside the LAB crate keep the visible rig connected', async ({ page }, info) => {
  // The approach and climb retain every rendered contact/rig sample, including
  // on software renderers where the complete route exceeds a minute.
  test.setTimeout(180_000)
  await start(page, 720)
  await page.keyboard.down('ArrowRight'); await page.clock.runFor(160)
  connected((await read(page)).recent)
  await page.screenshot({ path: info.outputPath('near-crate-reach.png') })
  await page.keyboard.down('Space'); await page.clock.runFor(180)
  await page.keyboard.up('Space'); await page.clock.runFor(800)
  connected((await read(page)).recent)
  await page.screenshot({ path: info.outputPath('jump-toward-upper-crate.png') })
  await page.clock.runFor(800)
  connected((await read(page)).recent)
  await page.keyboard.up('ArrowRight')
  await page.keyboard.down('ArrowUp'); await page.clock.runFor(1400)
  await page.keyboard.up('ArrowUp')
  expect((await read(page)).recent.at(-1).signals.grounded).toBe(true)
  await page.screenshot({ path: info.outputPath('upper-crate-pull-up.png') })
})

test('a keyboard jump followed by sustained pushing leaves the loaded mountain on its floor', async ({ page }, info) => {
  // Preserve all 15 seconds of rendered contact/rig samples on slower CI CPUs.
  test.setTimeout(120_000)
  await start(page, 630)
  await page.keyboard.down('ArrowRight'); await page.keyboard.down('Space')
  await page.clock.runFor(180); await page.keyboard.up('Space')
  await page.clock.runFor(15000)
  const samples = (await read(page)).recent
  connected(samples)
  expect(samples.some(s => s.signals.support === 'prop:3' && s.signals.push === 'prop:8')).toBe(true)
  for (const sample of samples) expect(Math.abs(sample.y - 1580)).toBeLessThan(1)
  let stepStarts = 0
  for (let i = 1; i < samples.length; i++) {
    const before = samples[i - 1], sample = samples[i], dt = sample.time - before.time
    for (let joint = 7; joint <= 10; joint++) {
      expect(Math.hypot(sample.points[joint][0] - before.points[joint][0], sample.points[joint][1] - before.points[joint][1])).toBeLessThan(180 * dt)
    }
    stepStarts += sample.contacts.feet.filter((foot, j) => !foot.planted && before.contacts.feet[j].planted).length
  }
  expect(stepStarts).toBeLessThanOrEqual(2)
  await page.screenshot({ path: info.outputPath('stable-loaded-mountain.png') })
  await page.keyboard.up('ArrowRight'); await advanceJumpingPassiveWait(page, 3000)
  expect(Math.abs((await read(page)).recent.at(-1).y - 1580)).toBeLessThan(1)
})
