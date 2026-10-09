import { readFileSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import { test, expect } from './helpers/test.mjs'
import { useLevelFixtures } from './helpers/jumpingLevels.mjs'

const spelunk = JSON.parse(readFileSync(new URL('../../public/levels/jumping/spelunk1.jump-level.json', import.meta.url)))
for (const mode of ['run', 'walk', 'crouch']) test(`Spelunk downhill ${mode} keeps its feet with the body`, async ({ page }, info) => {
  // The slow full descent retains Spelunk's lamps in software Chromium.
  // This is a new encounter budget; existing traversal deadlines stay intact.
  test.setTimeout(mode === 'run' ? 60000 : 120000)
  // Isolate the reported descent with its original polygon, ball and lighting.
  // Only this fetched test fixture starts on the ridge; no authored file changes.
  const fixture = { ...spelunk, name: 'Spelunk downhill encounter', spawn: { x: 1280, y: 1460 } }
  await useLevelFixtures(page, [fixture])
  const errors = []; page.on('pageerror', error => errors.push(error.message))
  await page.setViewportSize({ width: 852, height: 393 })
  await page.clock.install({ time: new Date('2026-10-09T12:00:00Z') })
  await page.goto('/untitled-jumping-game/levels/built-in/00-fixture.json?motionDebug=1')
  await expect(page.getByRole('img', { name: 'Spelunk downhill encounter: reach the exit', exact: true })).toBeFocused()
  await page.clock.pauseAt(new Date('2026-10-09T13:00:00Z'))
  await page.clock.runFor(64)
  if (mode === 'walk') await page.keyboard.down('Shift')
  if (mode === 'crouch') await page.keyboard.down('s')
  await page.keyboard.down('a')
  const samples = new Map()
  for (let phase = 0; phase < (mode === 'run' ? 6 : 14); phase++) {
    await page.clock.runFor(192)
    const recent = await page.evaluate(() => window.jumpingMotion.read().recent)
    for (const sample of recent) samples.set(sample.time, sample)
    if (phase === 4 || phase === 10) await page.screenshot({ path: info.outputPath(`descent-${phase}.png`) })
  }
  const slope = [...samples.values()].filter(p => p.signals.grounded && p.x > 980 && p.x < 1200)
  expect(slope.length).toBeGreaterThan(20)
  const maximumTrail = Math.max(...slope.flatMap(p => p.contacts.feet.map(foot => (p.x - foot.x) * p.signals.facing)))
  expect(maximumTrail).toBeLessThan(25)
  await page.keyboard.up('a'); await page.keyboard.up('Shift'); await page.keyboard.up('s')
  await page.clock.runFor(600)
  await page.screenshot({ path: info.outputPath('released.png') })
  expect(errors).toEqual([])
  await writeFile(info.outputPath('descent-motion.json'), JSON.stringify({ mode, maximumTrail, samples: [...samples.values()] }, null, 2))
})
