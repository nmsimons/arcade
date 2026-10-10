import { readFileSync } from 'node:fs'
import { test, expect } from './helpers/test.mjs'

const level = JSON.parse(readFileSync(new URL('../../public/levels/jumping/buoyancy.jump-level.json', import.meta.url)))

test('Buoyancy earns Gold with keyboard cargo delivery, both time pickups and draining', async ({ page }, info) => {
  test.setTimeout(180000)
  const errors = [], checkpoints = []
  page.on('pageerror', error => errors.push(error.message))
  await page.setViewportSize({ width: 852, height: 393 })
  await page.clock.install({ time: new Date('2026-10-10T12:00:00Z') })
  await page.goto('/untitled-jumping-game/levels/built-in/buoyancy.jump-level.json?motionDebug=1')
  await expect(page.getByRole('img', { name: `${level.name}: reach the exit`, exact: true })).toBeFocused()
  await page.clock.pauseAt(new Date('2026-10-10T13:00:00Z'))
  await page.clock.runFor(64)
  let held = new Set()
  const read = () => page.evaluate(() => window.jumpingMotion.read().recent.at(-1))
  async function keys(wanted) {
    const next = new Set(wanted)
    for (const key of held) if (!next.has(key)) await page.keyboard.up(key)
    for (const key of next) if (!held.has(key)) await page.keyboard.down(key)
    held = next
  }
  // Water bobbing and free prop contacts vary with the idle time before input.
  // Drive to visible waypoints with ordinary keys; never move actors or edit
  // scored time directly, and cap each phase so waits cannot hide failed delivery.
  async function steer(wanted, arrived, label, budget = 8000) {
    await keys(wanted)
    let p, spent = 0
    while (spent < budget) {
      await page.clock.runFor(64); spent += 64
      p = await read()
      if (await arrived(p)) break
    }
    checkpoints.push({ label, spent, ...p })
    expect(await arrived(p), label).toBe(true)
  }
  await steer(['d'], p => p.x >= 645, 'enter the pool')
  await steer(['d', 's'], p => p.x >= 833 && p.y >= 1148, 'reach the bottom')
  await steer(['d'], p => p.x >= 1020, 'move the heavy ball off the pump switch')
  await steer(['w'], p => p.y <= 705, 'rise with the filling pool', 10000)
  await page.screenshot({ path: info.outputPath('filled-pool.png') })
  await steer(['d'], p => p.x >= 1215, 'collect the stopwatch')
  await steer(['d', 'w', 'Space'], p => p.y < 530, 'jump toward the right bank')
  await steer(['d', 'w'], p => p.x >= 1485 && p.signals.grounded && p.y < 570, 'collect the nine-second bonus')
  await steer(['a'], p => p.x <= 1420, 'take off from the right bank')
  await keys(['a', 'Space']); await page.clock.runFor(272)
  await steer(['a'], p => p.x <= 870 && p.y >= 705, 'return to the pool')
  await steer(['w'], p => p.y <= 685, 'rise beside the floating cargo')
  await steer(['a'], p => p.x <= 335, 'deliver floating balls above the exit switch')
  await keys([]); await page.clock.runFor(960)
  await page.screenshot({ path: info.outputPath('delivered-floats.png') })
  await steer(['d'], p => p.x >= 977, 'return through the gap between islands')
  await steer(['s'], p => p.y >= 850, 'dive below the right island')
  await steer(['d'], p => p.x >= 1120, 'approach the heavy ball from the right')
  await steer(['s'], p => p.signals.grounded && p.y >= 1150, 'land on the pool bottom')
  await steer(['a'], p => p.x <= 1007, 'restore the heavy ball to the drain switch')
  await steer(['w'], p => p.y <= 892, 'rise while the cargo settles on the exit switch')
  await steer(['a', 'w'], p => p.x <= 950 && p.y <= 840, 'catch the island and enter its gravity lift')
  await steer(['w'], p => p.y <= 230, 'rise above the roof')
  const complete = page.getByRole('dialog', { name: 'Level complete', exact: true })
  await steer(['a'], () => complete.isVisible(), 'reach the powered doorway')
  await keys([])
  const [minutes, seconds] = (await complete.locator('.jumping-result-time').innerText()).split(':').map(Number)
  const elapsed = minutes * 60 + seconds
  await info.attach('route-checkpoints', { body: JSON.stringify({ elapsed, checkpoints }, null, 2), contentType: 'application/json' })
  await expect(complete.getByText('Gold medal', { exact: true })).toBeVisible()
  expect(elapsed).toBeLessThanOrEqual(level.times.gold)
  expect(errors).toEqual([])
  await page.screenshot({ path: info.outputPath('completed.png') })
})
